import base64
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional

import yaml
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

app = FastAPI(title="QuickRes")


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class ExperienceEntry(BaseModel):
    company: str = ""
    position: str = ""
    location: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    summary: Optional[str] = None
    highlights: list[str] = []


class EducationEntry(BaseModel):
    institution: str = ""
    area: str = ""
    degree: Optional[str] = None
    location: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    summary: Optional[str] = None
    highlights: list[str] = []


class SkillEntry(BaseModel):
    label: str = ""
    details: str = ""


class ProjectEntry(BaseModel):
    name: str = ""
    date: Optional[str] = None
    summary: Optional[str] = None
    highlights: list[str] = []


class CustomEntry(BaseModel):
    name: str = ""
    date: Optional[str] = None
    summary: Optional[str] = None
    highlights: list[str] = []


class CustomSection(BaseModel):
    title: str = ""
    entries: list[CustomEntry] = []


class CVData(BaseModel):
    name: str = "Your Name"
    headline: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    website: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    experience: list[ExperienceEntry] = []
    education: list[EducationEntry] = []
    skills: list[SkillEntry] = []
    projects: list[ProjectEntry] = []
    theme: str = "classic"
    section_order: list[str] = ["experience", "education", "skills", "projects"]
    custom_sections: list[CustomSection] = []


# ---------------------------------------------------------------------------
# YAML construction
# ---------------------------------------------------------------------------


def _end_date(val: Optional[str]) -> Optional[str]:
    """Return None (YAML null = present) for empty/present values."""
    if not val or val.strip().lower() in ("present", "current", "now", ""):
        return None
    return val.strip()


def build_rendercv_yaml(data: CVData) -> dict:
    cv: dict = {"name": data.name or "Your Name"}

    for field in ("headline", "email", "phone", "location", "website"):
        val = getattr(data, field)
        if val:
            cv[field] = val

    social = []
    if data.linkedin:
        social.append({"network": "LinkedIn", "username": data.linkedin})
    if data.github:
        social.append({"network": "GitHub", "username": data.github})
    if social:
        cv["social_networks"] = social

    sections: dict = {}

    def _build_experience():
        entries = []
        for e in data.experience:
            if not e.company and not e.position:
                continue
            entry: dict = {}
            if e.company:
                entry["company"] = e.company
            if e.position:
                entry["position"] = e.position
            if e.location:
                entry["location"] = e.location
            if e.start_date:
                entry["start_date"] = e.start_date
            entry["end_date"] = _end_date(e.end_date)
            if e.summary:
                entry["summary"] = e.summary
            highlights = [h.strip() for h in e.highlights if h.strip()]
            if highlights:
                entry["highlights"] = highlights
            entries.append(entry)
        return entries

    def _build_education():
        entries = []
        for e in data.education:
            if not e.institution:
                continue
            entry: dict = {"institution": e.institution, "area": e.area or ""}
            if e.degree:
                entry["degree"] = e.degree
            if e.location:
                entry["location"] = e.location
            if e.start_date:
                entry["start_date"] = e.start_date
            if e.end_date:
                entry["end_date"] = e.end_date
            if e.summary:
                entry["summary"] = e.summary
            highlights = [h.strip() for h in e.highlights if h.strip()]
            if highlights:
                entry["highlights"] = highlights
            entries.append(entry)
        return entries

    def _build_skills():
        return [
            {"label": s.label, "details": s.details} for s in data.skills if s.label and s.details
        ]

    def _build_projects():
        entries = []
        for p in data.projects:
            if not p.name:
                continue
            entry: dict = {"name": p.name}
            if p.date:
                entry["date"] = p.date
            if p.summary:
                entry["summary"] = p.summary
            highlights = [h.strip() for h in p.highlights if h.strip()]
            if highlights:
                entry["highlights"] = highlights
            entries.append(entry)
        return entries

    section_builders = {
        "experience": ("Experience", _build_experience),
        "education": ("Education", _build_education),
        "skills": ("Skills", _build_skills),
        "projects": ("Projects", _build_projects),
    }

    for key in data.section_order:
        if key not in section_builders:
            continue
        title, builder = section_builders[key]
        entries = builder()
        if entries:
            sections[title] = entries

    for cs in data.custom_sections:
        if not cs.title or not cs.entries:
            continue
        entries = []
        for e in cs.entries:
            if not e.name:
                continue
            entry: dict = {"name": e.name}
            if e.date:
                entry["date"] = e.date
            if e.summary:
                entry["summary"] = e.summary
            highlights = [h.strip() for h in e.highlights if h.strip()]
            if highlights:
                entry["highlights"] = highlights
            entries.append(entry)
        if entries:
            sections[cs.title] = entries

    if sections:
        cv["sections"] = sections

    design: dict = {"theme": data.theme}
    if data.theme == "classic":
        design["sections"] = {"show_time_spans_in": []}
        design["entries"] = {"highlights": {"space_above": "0.3cm", "space_between_items": "0.12cm"}}
        design["templates"] = {
            "experience_entry": {
                "main_column": "**COMPANY**, POSITION -- LOCATION\nSUMMARY\nHIGHLIGHTS",
                "date_and_location_column": "DATE",
            },
            "education_entry": {
                "main_column": "**INSTITUTION**, AREA -- LOCATION\nSUMMARY\nHIGHLIGHTS",
                "date_and_location_column": "DATE",
                "degree_column": "**DEGREE**",
            },
            "normal_entry": {
                "main_column": "**NAME** -- LOCATION\nSUMMARY\nHIGHLIGHTS",
                "date_and_location_column": "DATE",
            },
        }

    return {"cv": cv, "design": design}


# ---------------------------------------------------------------------------
# API endpoint
# ---------------------------------------------------------------------------


OVERRIDES_DIR = Path(__file__).parent / "theme_overrides"


def _copy_theme_overrides(theme: str, tmpdir: Path) -> None:
    src = OVERRIDES_DIR / theme
    if not src.exists():
        return
    dst = tmpdir / theme
    shutil.copytree(src, dst, dirs_exist_ok=True)


@app.post("/api/render")
async def render_resume(data: CVData):
    rendercv_data = build_rendercv_yaml(data)

    with tempfile.TemporaryDirectory() as tmpdir:
        yaml_path = Path(tmpdir) / "resume.yaml"
        with open(yaml_path, "w", encoding="utf-8") as f:
            yaml.dump(
                rendercv_data,
                f,
                allow_unicode=True,
                default_flow_style=False,
                sort_keys=False,
            )

        _copy_theme_overrides(data.theme, Path(tmpdir))

        try:
            result = subprocess.run(
                [sys.executable, "-m", "rendercv", "render", str(yaml_path)],
                cwd=tmpdir,
                capture_output=True,
                text=True,
                timeout=120,
            )
        except FileNotFoundError:
            raise HTTPException(
                status_code=500,
                detail="rendercv not found. Run: pip install rendercv",
            )
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=500, detail="Render timed out (>120s)")

        if result.returncode != 0:
            error = result.stderr or result.stdout or "Unknown render error"
            raise HTTPException(status_code=422, detail=error)

        output_dir = Path(tmpdir) / "rendercv_output"
        pdf_files = list(output_dir.rglob("*.pdf"))
        if not pdf_files:
            raise HTTPException(
                status_code=500,
                detail="No PDF produced.\n" + (result.stdout or ""),
            )

        pdf_bytes = pdf_files[0].read_bytes()
        return {"pdf_base64": base64.b64encode(pdf_bytes).decode()}


# Mount static files LAST so /api/* routes take priority
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="static")
