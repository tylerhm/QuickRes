// ── IndexedDB PDF persistence ─────────────────────────────────────────

const IDB_NAME = "quickres_db";
const IDB_STORE = "pdf";
const IDB_KEY = "current";

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(IDB_STORE);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function savePDF(blob) {
  try {
    const db = await openIDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(blob, IDB_KEY);
      tx.oncomplete = resolve;
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch {}
}

async function loadSavedPDF() {
  try {
    const db = await openIDB();
    const blob = await new Promise((resolve, reject) => {
      const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
    if (!blob) return;
    currentBlobUrl = URL.createObjectURL(blob);
    document.getElementById("pdf-iframe").src = currentBlobUrl;
    showPreview("iframe");
  } catch {}
}

// ── localStorage persistence ──────────────────────────────────────────

const STORAGE_KEY = "quickres_data";

function saveToLocalStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getFormData()));
  } catch {}
}

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) loadFormData(JSON.parse(raw));
  } catch {}
}

// Debounce auto-save so it doesn't fire on every keystroke
let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveToLocalStorage, 500);
}

// Single delegated listener covers static fields + dynamically added entries
document.querySelector(".form-pane").addEventListener("input", scheduleSave);
document.querySelector(".form-pane").addEventListener("change", scheduleSave);

// ── Save / Load ───────────────────────────────────────────────────────

document.getElementById("save-btn").addEventListener("click", () => {
  const data = getFormData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(data.name || "resume").replace(/\s+/g, "_")}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("load-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    // Reset here so the same file can be re-selected after load
    e.target.value = "";
    let data;
    try {
      data = JSON.parse(ev.target.result);
    } catch {
      alert("Could not parse JSON file.");
      return;
    }
    try {
      loadFormData(data);
    } catch (err) {
      console.error("loadFormData failed:", err);
      alert(`Failed to load resume: ${err.message}`);
    }
  };
  reader.readAsText(file);
});

function fillEntryCard(card, data, fields) {
  fields.forEach((field) => {
    if (field === "highlights") {
      const listEl = card.querySelector(".highlights-list");
      if (listEl && Array.isArray(data.highlights)) {
        data.highlights.forEach((val) => addHighlightItem(listEl, val));
      }
      return;
    }
    const input = card.querySelector(`[name="${field}"]`);
    if (!input || data[field] == null) return;
    input.value = data[field] ?? "";
  });
}

function loadFormData(data) {
  // Simple fields
  const simple = [
    "name",
    "headline",
    "email",
    "phone",
    "location",
    "website",
    "linkedin",
    "github",
  ];
  simple.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = data[id] ?? "";
  });

  // Theme
  const themeEl = document.getElementById("theme");
  if (data.theme) themeEl.value = data.theme;

  // Dynamic sections
  const sections = [
    {
      containerId: "experience-entries",
      templateId: "tpl-experience",
      dataKey: "experience",
      fields: [
        "company",
        "position",
        "location",
        "start_date",
        "end_date",
        "summary",
        "highlights",
      ],
    },
    {
      containerId: "education-entries",
      templateId: "tpl-education",
      dataKey: "education",
      fields: [
        "institution",
        "area",
        "degree",
        "location",
        "start_date",
        "end_date",
        "summary",
        "highlights",
      ],
    },
    {
      containerId: "skills-entries",
      templateId: "tpl-skill",
      dataKey: "skills",
      fields: ["label", "details"],
    },
    {
      containerId: "projects-entries",
      templateId: "tpl-project",
      dataKey: "projects",
      fields: ["name", "date", "summary", "highlights"],
    },
  ];

  sections.forEach(({ containerId, templateId, dataKey, fields }) => {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    (data[dataKey] || []).forEach((entryData) => {
      addEntry(containerId, templateId);
      const cards = container.querySelectorAll(".entry-card");
      fillEntryCard(cards[cards.length - 1], entryData, fields);
    });
  });

  // Section order
  if (data.section_order) {
    const container = document.getElementById("sections-container");
    data.section_order.forEach((key) => {
      const el = container.querySelector(`[data-section="${key}"]`);
      if (el) container.appendChild(el);
    });
  }

  // Custom sections
  document.getElementById("custom-sections").innerHTML = "";
  customSectionCount = 0;
  (data.custom_sections || []).forEach(({ title, entries }) => {
    const sectionEl = addCustomSection(title);
    const entriesContainer = sectionEl.querySelector(".custom-entries");
    (entries || []).forEach((entryData) => {
      const card = addCustomEntry(entriesContainer);
      ["name", "date", "summary"].forEach((f) => {
        const input = card.querySelector(`[name="${f}"]`);
        if (input && entryData[f]) input.value = entryData[f];
      });
      const listEl = card.querySelector(".highlights-list");
      if (listEl) (entryData.highlights || []).forEach((val) => addHighlightItem(listEl, val));
    });
  });

  saveToLocalStorage();
}

// ── Section drag-to-reorder ───────────────────────────────────────────

let dragSection = null;

function wireSectionDrag(card) {
  card.addEventListener("mousedown", (e) => {
    card.draggable = !!e.target.closest(".section-drag-handle");
  });
  card.addEventListener("dragstart", (e) => {
    dragSection = card;
    e.dataTransfer.effectAllowed = "move";
    requestAnimationFrame(() => card.classList.add("dragging"));
  });
  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
    card.draggable = false;
    dragSection = null;
    scheduleSave();
  });
  card.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (!dragSection || dragSection === card || dragSection.parentElement !== card.parentElement)
      return;
    const rect = card.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    card.parentElement.insertBefore(dragSection, after ? card.nextSibling : card);
  });
}

document.querySelectorAll("#sections-container [data-section]").forEach(wireSectionDrag);

// ── Highlight list ────────────────────────────────────────────────────

let dragItem = null;

function addHighlightItem(listEl, value = "") {
  const item = document.createElement("div");
  item.className = "highlight-item";
  // draggable is toggled dynamically so only the handle initiates drags
  item.addEventListener("mousedown", (e) => {
    item.draggable = !!e.target.closest(".drag-handle");
  });

  const handle = document.createElement("span");
  handle.className = "drag-handle";
  handle.title = "Drag to reorder";
  handle.innerHTML = `<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
    <circle cx="3" cy="2.5" r="1.2"/><circle cx="7" cy="2.5" r="1.2"/>
    <circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/>
    <circle cx="3" cy="11.5" r="1.2"/><circle cx="7" cy="11.5" r="1.2"/>
  </svg>`;

  const input = document.createElement("textarea");
  input.className = "highlight-input";
  input.value = value;
  input.placeholder = "Add a highlight…";
  input.rows = 1;
  const autoResize = () => {
    input.style.height = "auto";
    input.style.height = input.scrollHeight + "px";
  };
  input.addEventListener("input", autoResize);
  requestAnimationFrame(autoResize);

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn-remove-item";
  removeBtn.title = "Remove";
  removeBtn.textContent = "×";
  removeBtn.addEventListener("click", () => {
    item.remove();
    scheduleSave();
  });

  item.addEventListener("dragstart", (e) => {
    dragItem = item;
    e.dataTransfer.effectAllowed = "move";
    requestAnimationFrame(() => item.classList.add("dragging"));
  });
  item.addEventListener("dragend", () => {
    item.classList.remove("dragging");
    item.draggable = false;
    dragItem = null;
    scheduleSave();
  });
  item.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (!dragItem || dragItem === item || dragItem.parentElement !== item.parentElement) return;
    const after =
      e.clientY > item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2;
    item.parentElement.insertBefore(dragItem, after ? item.nextSibling : item);
  });

  item.append(handle, input, removeBtn);
  listEl.appendChild(item);
  return item;
}

function wireHighlightButtons(card) {
  card.querySelectorAll(".btn-add-highlight").forEach((btn) => {
    const list = btn.closest(".field").querySelector(".highlights-list");
    btn.addEventListener("click", () => {
      addHighlightItem(list);
      scheduleSave();
    });
  });
}

// ── Custom sections ───────────────────────────────────────────────────

let customSectionCount = 0;

function addCustomSection(titleValue = "") {
  const id = `custom-section-${++customSectionCount}`;
  const div = document.createElement("section");
  div.className = "card custom-section";
  div.id = id;
  div.innerHTML = `
    <div class="card-header">
      <input class="section-title-input" type="text" placeholder="Section title (e.g. Certifications)" value="${titleValue}">
      <button type="button" class="btn-remove-section">Remove</button>
    </div>
    <div class="custom-entries"></div>
    <button type="button" class="btn-add btn-add-custom-entry">+ Add Entry</button>
  `;
  div.querySelector(".btn-remove-section").addEventListener("click", () => div.remove());
  div
    .querySelector(".btn-add-custom-entry")
    .addEventListener("click", () => addCustomEntry(div.querySelector(".custom-entries")));
  document.getElementById("custom-sections").appendChild(div);
  return div;
}

function addCustomEntry(container) {
  const tpl = document.getElementById("tpl-custom-entry");
  const fragment = tpl.content.cloneNode(true);
  const card = fragment.querySelector(".entry-card");
  card.querySelector(".btn-remove").addEventListener("click", () => card.remove());
  wireHighlightButtons(card);
  container.appendChild(fragment);
  return container.lastElementChild;
}

document.getElementById("add-custom-section").addEventListener("click", () => addCustomSection());

function collectCustomSections() {
  return Array.from(document.querySelectorAll(".custom-section"))
    .map((section) => {
      const title = section.querySelector(".section-title-input").value.trim();
      if (!title) return null;
      const entries = Array.from(section.querySelectorAll(".entry-card"))
        .map((card) => ({
          name: card.querySelector('[name="name"]')?.value.trim() || "",
          date: card.querySelector('[name="date"]')?.value.trim() || null,
          summary: card.querySelector('[name="summary"]')?.value.trim() || null,
          highlights: Array.from(card.querySelectorAll(".highlights-list .highlight-input"))
            .map((i) => i.value.trim())
            .filter(Boolean),
        }))
        .filter((e) => e.name);
      return { title, entries };
    })
    .filter(Boolean);
}

// ── Entry management ─────────────────────────────────────────────────

function addEntry(containerId, templateId) {
  const container = document.getElementById(containerId);
  const tpl = document.getElementById(templateId);
  const fragment = tpl.content.cloneNode(true);
  const card = fragment.querySelector(".entry-card");

  card.querySelector(".btn-remove").addEventListener("click", () => card.remove());
  wireHighlightButtons(card);

  // Update entry-label with index
  const label = card.querySelector(".entry-label");
  if (label) {
    const count = container.querySelectorAll(".entry-card").length + 1;
    label.textContent = `${label.textContent} ${count}`;
  }

  container.appendChild(fragment);
}

document
  .getElementById("add-experience")
  .addEventListener("click", () => addEntry("experience-entries", "tpl-experience"));
document
  .getElementById("add-education")
  .addEventListener("click", () => addEntry("education-entries", "tpl-education"));
document
  .getElementById("add-skill")
  .addEventListener("click", () => addEntry("skills-entries", "tpl-skill"));
document
  .getElementById("add-project")
  .addEventListener("click", () => addEntry("projects-entries", "tpl-project"));

// ── Form data collection ─────────────────────────────────────────────

function fieldVal(el, name) {
  const input = el.querySelector(`[name="${name}"]`);
  if (!input) return null;
  const val = input.value.trim();
  return val || null;
}

function highlightLines(card) {
  return Array.from(card.querySelectorAll(".highlights-list .highlight-input"))
    .map((input) => input.value.trim())
    .filter(Boolean);
}

function collectEntries(containerId, collector) {
  return Array.from(document.querySelectorAll(`#${containerId} .entry-card`))
    .map(collector)
    .filter(Boolean);
}

function getFormData() {
  const experience = collectEntries("experience-entries", (card) => {
    const company = fieldVal(card, "company");
    const position = fieldVal(card, "position");
    if (!company && !position) return null;
    return {
      company: company || "",
      position: position || "",
      location: fieldVal(card, "location"),
      start_date: fieldVal(card, "start_date"),
      end_date: fieldVal(card, "end_date"),
      summary: fieldVal(card, "summary"),
      highlights: highlightLines(card),
    };
  });

  const education = collectEntries("education-entries", (card) => {
    const institution = fieldVal(card, "institution");
    if (!institution) return null;
    return {
      institution,
      area: fieldVal(card, "area") || "",
      degree: fieldVal(card, "degree"),
      location: fieldVal(card, "location"),
      start_date: fieldVal(card, "start_date"),
      end_date: fieldVal(card, "end_date"),
      summary: fieldVal(card, "summary"),
      highlights: highlightLines(card),
    };
  });

  const skills = collectEntries("skills-entries", (card) => {
    const label = fieldVal(card, "label");
    const details = fieldVal(card, "details");
    if (!label || !details) return null;
    return { label, details };
  });

  const projects = collectEntries("projects-entries", (card) => {
    const name = fieldVal(card, "name");
    if (!name) return null;
    return {
      name,
      date: fieldVal(card, "date"),
      summary: fieldVal(card, "summary"),
      highlights: highlightLines(card),
    };
  });

  const section_order = Array.from(
    document.querySelectorAll("#sections-container [data-section]")
  ).map((el) => el.dataset.section);

  return {
    name: document.getElementById("name").value.trim() || "Your Name",
    headline: document.getElementById("headline").value.trim() || null,
    email: document.getElementById("email").value.trim() || null,
    phone: document.getElementById("phone").value.trim() || null,
    location: document.getElementById("location").value.trim() || null,
    website: document.getElementById("website").value.trim() || null,
    linkedin: document.getElementById("linkedin").value.trim() || null,
    github: document.getElementById("github").value.trim() || null,
    theme: document.getElementById("theme").value,
    section_order,
    experience,
    education,
    skills,
    projects,
    custom_sections: collectCustomSections(),
  };
}

// ── Preview state management ─────────────────────────────────────────

function showPreview(state) {
  const states = ["placeholder", "loading", "error", "iframe"];
  const idMap = {
    placeholder: "preview-placeholder",
    loading: "preview-loading",
    error: "preview-error",
    iframe: "pdf-iframe",
  };
  states.forEach((s) => {
    const el = document.getElementById(idMap[s]);
    if (el) el.classList.toggle("hidden", s !== state);
  });
}

// ── Generate ─────────────────────────────────────────────────────────

let currentBlobUrl = null;

document.getElementById("generate-btn").addEventListener("click", async () => {
  const btn = document.getElementById("generate-btn");
  const statusMsg = document.getElementById("status-msg");
  btn.disabled = true;
  statusMsg.textContent = "Generating…";
  statusMsg.className = "";
  showPreview("loading");

  try {
    const data = getFormData();

    if (!data.name || data.name === "Your Name") {
      const nameInput = document.getElementById("name");
      if (!nameInput.value.trim()) {
        nameInput.focus();
        statusMsg.textContent = "Full Name is required.";
        statusMsg.className = "error";
        showPreview("placeholder");
        return;
      }
    }

    const response = await fetch("/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const json = await response.json();

    if (!response.ok) {
      const detail = json.detail || "Render failed";
      document.getElementById("preview-error-text").textContent = detail;
      statusMsg.textContent = "Generation failed.";
      statusMsg.className = "error";
      showPreview("error");
      return;
    }

    // Decode base64 → Blob → object URL
    const binary = atob(json.pdf_base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: "application/pdf" });

    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = URL.createObjectURL(blob);
    savePDF(blob);

    document.getElementById("pdf-iframe").src = currentBlobUrl;
    showPreview("iframe");

    statusMsg.textContent = "PDF ready.";
    statusMsg.className = "success";
  } catch (err) {
    document.getElementById("preview-error-text").textContent = err.message;
    statusMsg.textContent = "Unexpected error.";
    statusMsg.className = "error";
    showPreview("error");
  } finally {
    btn.disabled = false;
  }
});

// ── Init ──────────────────────────────────────────────────────────────
loadFromLocalStorage();
loadSavedPDF();
