const form = document.getElementById("jobForm");
const responseBox = document.getElementById("responseBox");
const submitButton = document.getElementById("submitButton");
const resetButton = document.getElementById("resetButton");
const healthBadge = document.getElementById("healthBadge");
const targetCeipal = document.getElementById("targetCeipal");
const targetZoho = document.getElementById("targetZoho");
const sectionTemplate = document.getElementById("sectionTemplate");
const fieldTemplate = document.getElementById("fieldTemplate");
const refreshReferencesButton = document.getElementById("refreshReferencesButton");
const referenceStatus = document.getElementById("referenceStatus");

let schemaFields = [];
let referenceData = {};
let integrations = {};

initialize();

async function initialize() {
  await Promise.all([loadSchema(), checkHealth()]);

  form.addEventListener("submit", handleSubmit);
  resetButton.addEventListener("click", resetForm);
  refreshReferencesButton.addEventListener("click", refreshReferences);
}

async function loadSchema() {
  const response = await fetch("/api/schema");
  const data = await response.json();

  schemaFields = data.fields || [];
  referenceData = data.references || {};
  integrations = data.integrations || {};
  hydrateTargetDefaults();
  renderSections(schemaFields);
  hydrateDependentLookups();
  setReferenceStatus();
}

async function checkHealth() {
  const response = await fetch("/api/health");
  const data = await response.json();

  if (data.ok) {
    setHealthBadge("Server configured", "pill-success");
    return;
  }

  const missing = (data.missingEnv || []).join(", ");
  setHealthBadge(`Missing env: ${missing}`, "pill-error");
}

function setHealthBadge(text, className) {
  healthBadge.textContent = text;
  healthBadge.className = `pill ${className}`;
}

function renderSections(fields) {
  form.innerHTML = "";

  const grouped = groupBySection(fields);

  for (const [sectionName, sectionFields] of grouped.entries()) {
    const sectionFragment = sectionTemplate.content.cloneNode(true);
    const sectionTitle = sectionFragment.querySelector(".section-title");
    const grid = sectionFragment.querySelector(".field-grid");

    sectionTitle.textContent = sectionName;

    for (const field of sectionFields) {
      const fieldFragment = fieldTemplate.content.cloneNode(true);
      const wrapper = fieldFragment.querySelector(".question-card");
      const label = fieldFragment.querySelector(".field-label");
      const badge = fieldFragment.querySelector(".field-badge");
      const help = fieldFragment.querySelector(".field-help");
      const controlHost = fieldFragment.querySelector(".field-control");

      label.textContent = field.label;
      badge.textContent = field.required ? "Required" : "Optional";
      badge.className = `pill ${field.required ? "pill-required" : "pill-optional"}`;
      help.textContent = field.help || "";

      const control = createControl(field);
      controlHost.appendChild(control);

      if (field.type === "textarea") {
        wrapper.classList.add("question-card-full");
      }

      grid.appendChild(fieldFragment);
    }

    form.appendChild(sectionFragment);
  }
}

function hydrateTargetDefaults() {
  if (integrations.ceipal) {
    targetCeipal.checked = Boolean(integrations.ceipal.defaultSelected);
  }

  if (integrations.zoho) {
    targetZoho.checked = Boolean(integrations.zoho.defaultSelected);
  }
}

function createControl(field) {
  if (field.type === "lookup") {
    return createLookupControl(field);
  }

  if (field.type === "textarea") {
    if (isRichTextField(field)) {
      return createRichTextEditor(field);
    }

    const textarea = document.createElement("textarea");
    applyCommonFieldAttributes(textarea, field);
    return textarea;
  }

  const input = document.createElement("input");
  input.type = field.type || "text";
  applyCommonFieldAttributes(input, field);

  return input;
}

function isRichTextField(field) {
  return ["job_description", "public_job_desc"].includes(field.name);
}

function createRichTextEditor(field) {
  const wrap = document.createElement("div");
  wrap.className = "rich-editor";

  const toolbar = document.createElement("div");
  toolbar.className = "rich-editor-toolbar";

  const editor = document.createElement("div");
  editor.className = "rich-editor-surface";
  editor.contentEditable = "true";
  editor.dataset.placeholder = field.placeholder || "";

  const input = document.createElement("textarea");
  input.className = "rich-editor-input";
  applyCommonFieldAttributes(input, field);
  input.hidden = true;

  const initialValue = String(field.defaultValue || "").trim();
  editor.innerHTML = formatEditorInitialValue(initialValue);
  syncRichEditorValue(editor, input);

  const actions = [
    { label: "B", title: "Bold", command: "bold" },
    { label: "H", title: "Heading", command: "formatBlock", value: "h3" },
    { label: "• List", title: "Bullet List", command: "insertUnorderedList" },
    { label: "1. List", title: "Numbered List", command: "insertOrderedList" },
    { label: "P", title: "Paragraph", command: "formatBlock", value: "p" },
    { label: "Clear", title: "Clear Formatting", command: "removeFormat" }
  ];

  for (const action of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rich-editor-button";
    button.textContent = action.label;
    button.title = action.title;
    button.addEventListener("click", () => {
      editor.focus();
      document.execCommand(action.command, false, action.value || null);
      normalizeEditorMarkup(editor);
      syncRichEditorValue(editor, input, true);
    });
    toolbar.appendChild(button);
  }

  editor.addEventListener("input", () => {
    normalizeEditorMarkup(editor);
    syncRichEditorValue(editor, input, true);
  });

  editor.addEventListener("blur", () => {
    normalizeEditorMarkup(editor);
    syncRichEditorValue(editor, input, true);
  });

  editor.addEventListener("paste", (event) => {
    event.preventDefault();
    const html = event.clipboardData?.getData("text/html") || "";
    const text = event.clipboardData?.getData("text/plain") || "";

    if (html.trim()) {
      document.execCommand("insertHTML", false, sanitizePastedHtml(html));
    } else {
      document.execCommand("insertText", false, text);
    }

    normalizeEditorMarkup(editor);
    syncRichEditorValue(editor, input, true);
  });

  wrap.append(toolbar, editor, input);
  return wrap;
}

function applyCommonFieldAttributes(input, field) {
  input.name = field.name;
  input.id = field.name;
  input.placeholder = field.placeholder || "";

  if (field.required) {
    input.required = true;
  }

  if (field.step && input.tagName === "INPUT") {
    input.step = field.step;
  }

  if (field.defaultValue !== undefined && field.defaultValue !== null && field.type !== "checkbox") {
    input.value = field.defaultValue;
  }

  if (
    [
      "job_title",
      "public_job_title",
      "city",
      "client",
      "recruitment_manager",
      "unique_job_id"
    ].includes(field.name)
  ) {
    input.autocomplete = "off";
  }
}

function formatEditorInitialValue(value) {
  if (!value) {
    return "<p><br></p>";
  }

  if (/<[a-z][\s\S]*>/i.test(value)) {
    return value;
  }

  const paragraphs = value
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`);

  return paragraphs.join("") || "<p><br></p>";
}

function normalizeEditorMarkup(editor) {
  if (!editor.innerHTML.trim()) {
    editor.innerHTML = "<p><br></p>";
  }
}

function syncRichEditorValue(editor, input, dispatchEvents = false) {
  const html = editor.innerHTML
    .replace(/<p><br><\/p>/g, "")
    .trim();

  input.value = html;

  if (dispatchEvents) {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizePastedHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const allowedTags = new Set([
    "P",
    "BR",
    "DIV",
    "UL",
    "OL",
    "LI",
    "STRONG",
    "B",
    "EM",
    "I",
    "U",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6"
  ]);

  const cleanNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(node.textContent || "");
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return document.createDocumentFragment();
    }

    const tag = node.tagName.toUpperCase();

    if (!allowedTags.has(tag)) {
      const fragment = document.createDocumentFragment();
      for (const child of Array.from(node.childNodes)) {
        fragment.appendChild(cleanNode(child));
      }
      return fragment;
    }

    const safeTag = tag === "DIV" ? "P" : tag;
    const element = document.createElement(safeTag.toLowerCase());

    for (const child of Array.from(node.childNodes)) {
      element.appendChild(cleanNode(child));
    }

    return element;
  };

  const fragment = document.createDocumentFragment();
  for (const child of Array.from(doc.body.childNodes)) {
    fragment.appendChild(cleanNode(child));
  }

  const container = document.createElement("div");
  container.appendChild(fragment);
  return container.innerHTML;
}

function createLookupControl(field) {
  const input = document.createElement("input");
  input.type = "text";
  input.dataset.lookup = field.referenceKey || "";
  input.dataset.fieldName = field.name;
  if (field.dependsOn) {
    input.dataset.dependsOn = field.dependsOn;
  }

  applyCommonFieldAttributes(input, field);

  const listId = `${field.name}-list`;
  const datalist = document.createElement("datalist");
  datalist.id = listId;
  input.setAttribute("list", listId);

  const wrap = document.createElement("div");
  wrap.className = "reference-wrap";

  const meta = document.createElement("div");
  meta.className = "reference-meta";

  wrap.append(input, datalist, meta);

  const options = getLookupOptions(field);
  fillDatalist(datalist, options);
  meta.textContent = buildLookupMeta(options, field);

  if (field.name === "country") {
    input.addEventListener("change", handleCountryChange);
  }

  return wrap;
}

function getLookupOptions(field) {
  if (field.referenceKey === "states") {
    const countryInput = document.getElementById(field.dependsOn || "country");
    const countryId = resolveLookupValue(referenceData.countries || [], countryInput?.value);
    return referenceData.statesByCountry?.[String(countryId)] || [];
  }

  return referenceData[field.referenceKey] || [];
}

function fillDatalist(datalist, options) {
  datalist.innerHTML = "";

  for (const option of options) {
    const item = document.createElement("option");
    item.value = option.display || option.label || option.value;
    item.label = option.label || option.value;
    datalist.appendChild(item);
  }
}

function buildLookupMeta(options, field) {
  if (!options.length) {
    if (field.referenceKey === "states") {
      return "Select country first, then search state. You can also paste the CEIPAL state ID.";
    }

    return "No saved options found. You can still paste the CEIPAL ID manually.";
  }

  return `${options.length} option${options.length === 1 ? "" : "s"} available`;
}

function groupBySection(fields) {
  const grouped = new Map();

  for (const field of fields) {
    const sectionName = field.section || "Details";

    if (!grouped.has(sectionName)) {
      grouped.set(sectionName, []);
    }

    grouped.get(sectionName).push(field);
  }

  return grouped;
}

function resetForm() {
  hydrateTargetDefaults();
  renderSections(schemaFields);
  hydrateDependentLookups();
  setReferenceStatus();
  responseBox.textContent = "Form reset.";
}

async function handleSubmit(event) {
  event.preventDefault();

  const formData = new FormData(form);
  const payload = {};

  for (const field of schemaFields) {
    payload[field.name] = formData.get(field.name);
  }

  payload.targets = {
    ceipal: targetCeipal.checked,
    zoho: targetZoho.checked
  };

  submitButton.disabled = true;
  submitButton.textContent = "Posting...";
  responseBox.textContent = "Submitting job to local backend...";

  try {
    const response = await fetch("/api/post-job", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    responseBox.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    responseBox.textContent = JSON.stringify(
      {
        ok: false,
        message: error.message || "Unexpected browser error."
      },
      null,
      2
    );
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Post Job";
  }
}

async function refreshReferences() {
  refreshReferencesButton.disabled = true;
  referenceStatus.textContent = "Refreshing CEIPAL reference data...";

  try {
    const response = await fetch("/api/references/refresh", {
      method: "POST"
    });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || "Refresh failed.");
    }

    referenceData = data.references || {};
    renderSections(schemaFields);
    hydrateDependentLookups();
    setReferenceStatus("Reference data refreshed and saved locally.");
  } catch (error) {
    setReferenceStatus(error.message || "Reference refresh failed.");
  } finally {
    refreshReferencesButton.disabled = false;
  }
}

async function handleCountryChange(event) {
  const countryValue = event.target.value;
  const countryId = resolveLookupValue(referenceData.countries || [], countryValue);
  const stateInput = document.getElementById("states");
  const stateList = document.getElementById("states-list");
  const stateMeta = stateInput?.closest(".reference-wrap")?.querySelector(".reference-meta");

  if (!stateInput || !stateList || !countryId) {
    return;
  }

  stateInput.value = "";
  stateMeta.textContent = "Loading states...";

  try {
    const response = await fetch(`/api/states?countryId=${encodeURIComponent(countryId)}`);
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || "Failed to load states.");
    }

    referenceData.statesByCountry = referenceData.statesByCountry || {};
    referenceData.statesByCountry[String(countryId)] = data.states || [];
    fillDatalist(stateList, data.states || []);
    stateMeta.textContent = buildLookupMeta(data.states || [], { referenceKey: "states" });
  } catch (error) {
    stateMeta.textContent = error.message || "Failed to load states.";
  }
}

function resolveLookupValue(options, rawValue) {
  const normalizedRaw = String(rawValue || "").trim();
  if (!normalizedRaw) {
    return "";
  }

  const match = (options || []).find((option) =>
    [option.value, option.label, option.display]
      .filter(Boolean)
      .some((candidate) => String(candidate).toLowerCase() === normalizedRaw.toLowerCase())
  );

  return match ? match.value : normalizedRaw;
}

function setReferenceStatus(customText) {
  if (customText) {
    referenceStatus.textContent = customText;
    return;
  }

  const updatedAt = referenceData.meta?.updatedAt;
  if (!updatedAt) {
    referenceStatus.textContent = "Reference cache not built yet.";
    return;
  }

  const keyCountries = referenceData.keyCountries || [];
  const summary = keyCountries.map((item) => `${item.label}: ${item.value}`).join(" | ");
  referenceStatus.textContent = `Saved cache: ${updatedAt}. Country IDs: ${summary}`;
}

function hydrateDependentLookups() {
  const countryInput = document.getElementById("country");
  if (!countryInput) {
    return;
  }

  handleCountryChange({ target: countryInput });
}
