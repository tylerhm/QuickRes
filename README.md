# QuickRes

A lightweight web app for building and previewing resumes as PDFs. Fill out a form, hit render, and get a polished PDF instantly — powered by [rendercv](https://github.com/sinaatalay/rendercv) on the backend.

## Features

- Live PDF preview from a simple web form
- Sections: experience, education, skills, projects, and custom sections
- Drag-and-drop section reordering
- rendercv `classic` theme with sensible defaults

## Requirements

- Python 3.10+
- pip

## Getting started

```bash
./run.sh
```

Then open [http://localhost:8000](http://localhost:8000).

`run.sh` installs dependencies and starts the FastAPI server. The frontend is served as static files from the same origin, so no separate dev server is needed.

## Project structure

```
backend/
  main.py            # FastAPI app + rendercv YAML builder
  requirements.txt
  theme_overrides/   # Per-theme rendercv customizations
frontend/
  index.html
  script.js
  styles.css
run.sh               # One-command startup
```

## How it works

1. The frontend collects CV data and POSTs it to `/api/render`.
2. The backend serializes it into a rendercv-compatible YAML file.
3. `rendercv render` is invoked in a temp directory and the resulting PDF is returned as base64.
