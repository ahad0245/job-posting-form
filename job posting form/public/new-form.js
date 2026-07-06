const form = document.getElementById("jobForm");
const responseBox = document.getElementById("responseBox");
const submitButton = document.getElementById("submitButton");
const resetButton = document.getElementById("resetButton");
const refreshReferencesButton = document.getElementById("refreshReferencesButton");
const healthBadge = document.getElementById("healthBadge");
const referenceStatus = document.getElementById("referenceStatus");
const targetSummary = document.getElementById("targetSummary");
const targetCeipal = document.getElementById("targetCeipal");
const targetZoho = document.getElementById("targetZoho");
const emptyState = document.getElementById("emptyState");
const sectionTemplate = document.getElementById("sectionTemplate");
const fieldTemplate = document.getElementById("fieldTemplate");
const progressBar = document.getElementById("progressBar");
const progressLabel = document.getElementById("progressLabel");
const progressHint = document.getElementById("progressHint");

let schemaFields = [];
let referenceData = {};
let integrations = {};
let draftJobId = "";

const sharedSections = new Set([
  "Core Details",
  "Location",
  "Job Content",
  "Status And Type",
  "Rates",
  "Tracking"
]);
const hiddenFieldNames = new Set([
  "public_job_title",
  "public_job_desc",
  "client_note",
  "recruitment_manager_note"
]);

initialize();

async function initialize() {
  targetCeipal.addEventListener("change", handleTargetToggle);
  targetZoho.addEventListener("change", handleTargetToggle);
  form.addEventListener("submit", handleSubmit);
  form.addEventListener("input", updateProgress);
  form.addEventListener("change", updateProgress);
  resetButton.addEventListener("click", resetForm);
  refreshReferencesButton.addEventListener("click", refreshReferences);

  await Promise.all([loadSchema(), checkHealth()]);
  applyTargetDefaults();
  renderVisibleSections();
  await loadDraftFromQuery();
}

async function loadSchema() {
  const data = await fetchJson("/api/schema");
  schemaFields = data.fields || [];
  referenceData = data.references || {};
  integrations = data.integrations || {};
  setReferenceStatus();
}

async function checkHealth() {
  try {
    const data = await fetchJson("/api/health");
    if (data.ok) {
      setHealthBadge("Server configured", "status-success");
      return;
    }

    const missing = (data.missingEnv || []).join(", ");
    setHealthBadge(`Missing env: ${missing}`, "status-error");
  } catch (error) {
    setHealthBadge(error.message || "Health check failed", "status-error");
  }
}

function applyTargetDefaults() {
  targetCeipal.checked = Boolean(integrations.ceipal?.defaultSelected);
  targetZoho.checked = Boolean(integrations.zoho?.defaultSelected);
}

function handleTargetToggle() {
  renderVisibleSections();
}

function renderVisibleSections() {
  form.innerHTML = "";

  const visibleFields = getVisibleFields();
  emptyState.classList.toggle("hidden", visibleFields.length > 0);

  if (!visibleFields.length) {
    updateTargetSummary();
    updateProgress();
    return;
  }

  const grouped = groupBySection(visibleFields);
  for (const [sectionName, fields] of grouped.entries()) {
    const sectionFragment = sectionTemplate.content.cloneNode(true);
    const sectionCard = sectionFragment.querySelector(".section-card");
    const kicker = sectionFragment.querySelector(".section-kicker");
    const title = sectionFragment.querySelector(".section-title");
    const count = sectionFragment.querySelector(".section-count");
    const grid = sectionFragment.querySelector(".field-grid");

    kicker.textContent = getSectionKicker(sectionName);
    title.textContent = getSectionTitle(sectionName);
    count.textContent = `${fields.length} field${fields.length === 1 ? "" : "s"}`;

    for (const field of fields) {
      const fieldFragment = fieldTemplate.content.cloneNode(true);
      const card = fieldFragment.querySelector(".field-card");
      const label = fieldFragment.querySelector(".field-label");
      const badge = fieldFragment.querySelector(".field-badge");
      const help = fieldFragment.querySelector(".field-help");
      const controlHost = fieldFragment.querySelector(".field-control");

      label.textContent = field.label;
      badge.textContent = field.required ? "Required" : "Optional";
      badge.className = `field-badge ${field.required ? "required" : "optional"}`;
      help.textContent = field.help || "";

      if (field.type === "textarea") {
        card.classList.add("field-card-wide");
      }

      controlHost.appendChild(createControl(field));
      grid.appendChild(fieldFragment);
    }

    form.appendChild(sectionCard);
  }

  hydrateDependentLookups();
  updateTargetSummary();
  updateProgress();
}

function getVisibleFields() {
  if (!targetCeipal.checked && !targetZoho.checked) {
    return [];
  }

  return schemaFields.filter((field) => {
    if (hiddenFieldNames.has(field.name)) {
      return false;
    }

    if (field.section === "Zoho Overrides") {
      return targetZoho.checked;
    }

    if (field.section === "CEIPAL IDs") {
      return targetCeipal.checked;
    }

    if (sharedSections.has(field.section)) {
      return true;
    }

    return targetCeipal.checked;
  });
}

function createControl(field) {
  if (field.type === "lookup") {
    return createLookupControl(field);
  }

  if (field.type === "textarea" && isRichTextField(field)) {
    return createRichTextEditor(field);
  }

  const input = field.type === "textarea" ? document.createElement("textarea") : document.createElement("input");
  if (field.type !== "textarea") {
    input.type = field.type || "text";
  }

  applyCommonAttributes(input, field);
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
  applyCommonAttributes(input, field);
  input.hidden = true;

  editor.innerHTML = formatEditorInitialValue(String(field.defaultValue || "").trim());
  syncRichEditorValue(editor, input);

  const actions = [
    { label: "B", title: "Bold", command: "bold" },
    { label: "H", title: "Heading", command: "formatBlock", value: "h3" },
    { label: "Bullets", title: "Bullet List", command: "insertUnorderedList" },
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

function createLookupControl(field) {
  const input = document.createElement("input");
  input.type = "text";
  applyCommonAttributes(input, field);

  const listId = `${field.name}-list`;
  const datalist = document.createElement("datalist");
  datalist.id = listId;
  input.setAttribute("list", listId);

  const wrap = document.createElement("div");
  wrap.className = "lookup-wrap";

  const meta = document.createElement("div");
  meta.className = "lookup-meta";

  const options = getLookupOptions(field);
  fillDatalist(datalist, options);
  meta.textContent = getLookupMeta(options, field);

  if (field.name === "country") {
    input.addEventListener("change", handleCountryChange);
  }

  wrap.append(input, datalist, meta);
  return wrap;
}

function applyCommonAttributes(input, field) {
  input.name = field.name;
  input.id = field.name;
  input.placeholder = field.placeholder || "";
  input.autocomplete = "off";

  if (field.required) {
    input.required = true;
  }

  if (field.step && input.tagName === "INPUT") {
    input.step = field.step;
  }

  if (field.defaultValue !== undefined && field.defaultValue !== null) {
    input.value = field.defaultValue;
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

function getLookupOptions(field) {
  if (field.referenceKey === "states") {
    const countryInput = document.getElementById(field.dependsOn || "country");
    const countryId = resolveLookupValue(referenceData.countries || [], countryInput?.value);
    return referenceData.statesByCountry?.[String(countryId)] || [];
  }

  return referenceData[field.referenceKey] || [];
}

function getLookupMeta(options, field) {
  if (field.referenceKey === "states" && !options.length) {
    return "Select country first, then search state. CEIPAL state ID also works.";
  }

  if (!options.length) {
    return "No cached options found. You can still paste the ID directly.";
  }

  return `${options.length} searchable option${options.length === 1 ? "" : "s"}`;
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

async function handleCountryChange(event) {
  const countryId = resolveLookupValue(referenceData.countries || [], event.target.value);
  const stateInput = document.getElementById("states");
  const stateList = document.getElementById("states-list");
  const stateMeta = stateInput?.closest(".lookup-wrap")?.querySelector(".lookup-meta");

  if (!stateInput || !stateList) {
    return;
  }

  stateInput.value = "";

  if (!countryId) {
    stateMeta.textContent = "Select country first, then search state. CEIPAL state ID also works.";
    fillDatalist(stateList, []);
    updateProgress();
    return;
  }

  stateMeta.textContent = "Loading states...";

  try {
    const data = await fetchJson(`/api/states?countryId=${encodeURIComponent(countryId)}`);
    referenceData.statesByCountry = referenceData.statesByCountry || {};
    referenceData.statesByCountry[String(countryId)] = data.states || [];
    fillDatalist(stateList, data.states || []);
    stateMeta.textContent = getLookupMeta(data.states || [], { referenceKey: "states" });
  } catch (error) {
    stateMeta.textContent = error.message || "Failed to load states.";
  }
}

function hydrateDependentLookups() {
  const countryInput = document.getElementById("country");
  if (countryInput) {
    handleCountryChange({ target: countryInput });
  }
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

function getSectionKicker(sectionName) {
  const map = {
    "Core Details": "Step 1",
    Location: "Step 2",
    "CEIPAL IDs": "Step 3",
    "Job Content": "Step 4",
    "Status And Type": "Step 5",
    Rates: "Step 6",
    Tracking: "Step 7",
    "Zoho Overrides": "Step 8"
  };

  return map[sectionName] || "Details";
}

function getSectionTitle(sectionName) {
  if (sectionName === "CEIPAL IDs") {
    return "Assignment & Ownership";
  }

  return sectionName;
}

function updateTargetSummary() {
  if (targetCeipal.checked && targetZoho.checked) {
    targetSummary.textContent = "The complete form is visible for both CEIPAL and Zoho Recruit.";
    return;
  }

  if (targetCeipal.checked) {
    targetSummary.textContent = "This form will post to CEIPAL and includes assignment details for that portal.";
    return;
  }

  if (targetZoho.checked) {
    targetSummary.textContent = "This form will post to Zoho Recruit with the shared job posting details.";
    return;
  }

  targetSummary.textContent = "Choose a destination to begin.";
}

function updateProgress() {
  const visibleFields = getVisibleFields();
  const total = visibleFields.length;
  const completed = visibleFields.filter((field) => hasFieldValue(field)).length;
  const percent = total ? Math.round((completed / total) * 100) : 0;

  progressBar.style.width = `${percent}%`;
  progressLabel.textContent = `${completed}/${total}`;
  progressHint.textContent = total
    ? `${percent}% complete across the currently visible fields.`
    : "Select CEIPAL or Zoho Recruit to load the form.";
}

function hasFieldValue(field) {
  const element = form.elements[field.name];
  if (!element) {
    return false;
  }

  return String(element.value || "").trim() !== "";
}

function resetForm() {
  applyTargetDefaults();
  renderVisibleSections();
  if (draftJobId) {
    loadDraftFromQuery();
  }
  responseBox.textContent = "Form reset.";
}

async function refreshReferences() {
  refreshReferencesButton.disabled = true;
  referenceStatus.textContent = "Refreshing CEIPAL references...";

  try {
    const data = await fetchJson("/api/references/refresh", { method: "POST" });
    referenceData = data.references || {};
    setReferenceStatus("CEIPAL reference data refreshed and saved locally.");
    renderVisibleSections();
  } catch (error) {
    setReferenceStatus(error.message || "Reference refresh failed.");
  } finally {
    refreshReferencesButton.disabled = false;
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  const visibleFields = getVisibleFields();
  if (!visibleFields.length) {
    responseBox.textContent = JSON.stringify(
      {
        ok: false,
        message: "Select at least one destination first."
      },
      null,
      2
    );
    return;
  }

  const payload = {};
  for (const field of visibleFields) {
    payload[field.name] = form.elements[field.name]?.value ?? "";
  }

  payload.public_job_title = payload.job_title || "";
  payload.public_job_desc = payload.job_description || "";

  payload.targets = {
    ceipal: targetCeipal.checked,
    zoho: targetZoho.checked
  };

  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";
  responseBox.textContent = "Submitting job to local backend...";

  try {
    const data = await fetchJson("/api/post-job", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    responseBox.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    responseBox.textContent = JSON.stringify(
      {
        ok: false,
        message: error.message || "Submission failed."
      },
      null,
      2
    );
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Submit Job";
  }
}

function setReferenceStatus(customText) {
  if (customText) {
    referenceStatus.textContent = customText;
    return;
  }

  const updatedAt = referenceData.meta?.updatedAt;
  const countries = referenceData.keyCountries || [];
  if (!updatedAt || !countries.length) {
    referenceStatus.textContent = "Reference cache not built yet.";
    return;
  }

  const ids = countries.map((country) => `${country.label}: ${country.value}`).join(" | ");
  referenceStatus.textContent = `Saved cache: ${updatedAt}. ${ids}`;
}

function setHealthBadge(text, className) {
  healthBadge.textContent = text;
  healthBadge.className = `status-pill ${className}`;
}

function resolveLookupValue(options, rawValue) {
  const normalized = String(rawValue || "").trim();
  if (!normalized) {
    return "";
  }

  const match = (options || []).find((option) =>
    [option.value, option.label, option.display]
      .filter(Boolean)
      .some((candidate) => String(candidate).toLowerCase() === normalized.toLowerCase())
  );

  return match ? match.value : normalized;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch (_error) {
    throw new Error(text.startsWith("<") ? "Server returned HTML instead of JSON. Restart the local server." : "Invalid JSON response from server.");
  }

  if (!response.ok) {
    throw new Error(data.message || "Request failed.");
  }

  return data;
}

async function loadDraftFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const jobId = params.get("jobId");
  draftJobId = jobId || "";

  if (!jobId) {
    return;
  }

  try {
    const data = await fetchJson(`/api/job-draft/${encodeURIComponent(jobId)}`);

    // If the link is for review, show both portals by default so the recruiter can choose.
    targetCeipal.checked = true;
    targetZoho.checked = true;
    renderVisibleSections();
    await applyDraftValues(data.draft || {});
    responseBox.textContent = JSON.stringify(
      {
        ok: true,
        message: `Loaded draft ${jobId} from Google Sheet.`
      },
      null,
      2
    );
  } catch (error) {
    responseBox.textContent = JSON.stringify(
      {
        ok: false,
        message: error.message || `Failed to load draft ${jobId}.`
      },
      null,
      2
    );
  }
}

async function applyDraftValues(draft) {
  for (const [fieldName, value] of Object.entries(draft)) {
    if (
      ["country", "states", "client", "recruitment_manager"].includes(fieldName)
    ) {
      continue;
    }

    setFieldValue(fieldName, value);
  }

  const stateInput = document.getElementById("states");
  const stateList = document.getElementById("states-list");
  const stateMeta = stateInput?.closest(".lookup-wrap")?.querySelector(".lookup-meta");
  if (stateInput && stateList) {
    stateInput.value = "";
    fillDatalist(stateList, []);
    if (stateMeta) {
      stateMeta.textContent = "Select country first, then search state. CEIPAL state ID also works.";
    }
  }

  updateProgress();
}

function setFieldValue(fieldName, value) {
  const element = form.elements[fieldName];
  if (!element) {
    return;
  }

  const normalizedValue = value ?? "";
  element.value = normalizedValue;

  if (element.classList.contains("rich-editor-input")) {
    const wrap = element.closest(".rich-editor");
    const surface = wrap?.querySelector(".rich-editor-surface");
    if (surface) {
      surface.innerHTML = formatEditorInitialValue(String(normalizedValue).trim());
      normalizeEditorMarkup(surface);
      syncRichEditorValue(surface, element);
    }
  }
}
