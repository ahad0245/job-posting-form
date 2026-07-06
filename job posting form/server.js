const express = require("express");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { google } = require("googleapis");

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const optionsFilePath = path.join(__dirname, "data", "ceipal-options.json");
let masterDataMemoryCache = null;
const defaultCeipalJobPostUrl =
  "https://api.ceipal.com/savecustomJobPostingDetails/S3dUMVNKYkRseEdmNHZxNTRPN0VwUT09/c4115f2aa4d7e7b6a15aa8cabf3ed36c/";
const ceipalMasterApiBase =
  "https://api.ceipal.com/7b0a498c77e8a461e4dd06a6ade05eaf785ffad59608daaf23b5c95736d3a8ad";
const keyCountryNames = ["Canada", "United States", "Pakistan"];
const masterDataTtlMs = 24 * 60 * 60 * 1000;
const defaultSheetTabName = "posted jobs";
const remoteJobOptions = [
  { value: "0", label: "No" },
  { value: "1", label: "Yes" },
  { value: "2", label: "Hybrid" }
];

const fieldSchema = [
  {
    section: "Core Details",
    name: "job_title",
    label: "Job Title",
    type: "text",
    required: true,
    defaultValue: "",
    placeholder: "Senior Data Engineer",
    help: "Main CEIPAL job title."
  },
  {
    section: "Core Details",
    name: "public_job_title",
    label: "Public Job Title",
    type: "text",
    required: false,
    defaultValue: "",
    placeholder: "Senior Data Engineer",
    help: "Defaults to Job Title if left blank."
  },
  {
    section: "Core Details",
    name: "remote_job",
    label: "Remote Job",
    type: "lookup",
    referenceKey: "remoteJobOptions",
    required: false,
    defaultValue: "Yes",
    help: "Select CEIPAL remote-job option."
  },
  {
    section: "Location",
    name: "country",
    label: "Country",
    type: "lookup",
    referenceKey: "countries",
    required: true,
    defaultValue: "Canada",
    placeholder: "Search country",
    help: "Search CEIPAL country list; payload sends the country ID."
  },
  {
    section: "Location",
    name: "states",
    label: "State",
    type: "lookup",
    referenceKey: "states",
    dependsOn: "country",
    required: true,
    defaultValue: "Ontario (ON)",
    placeholder: "Search state after selecting country",
    help: "States are filtered by country and payload sends the state ID."
  },
  {
    section: "Location",
    name: "city",
    label: "City",
    type: "text",
    required: true,
    defaultValue: "",
    placeholder: "Toronto",
    help: "Job location city."
  },
  {
    section: "CEIPAL IDs",
    name: "client",
    label: "Client",
    type: "lookup",
    referenceKey: "clients",
    required: true,
    defaultValue: "",
    placeholder: "Search client",
    help: "Search client name; payload sends the CEIPAL client ID."
  },
  {
    section: "CEIPAL IDs",
    name: "recruitment_manager",
    label: "Recruitment Manager",
    type: "lookup",
    referenceKey: "recruitmentManagers",
    required: true,
    defaultValue: "",
    placeholder: "Search recruitment manager",
    help: "Search manager name or email; payload sends the CEIPAL user ID."
  },
  {
    section: "CEIPAL IDs",
    name: "client_note",
    label: "Client Note",
    type: "text",
    required: false,
    defaultValue: "",
    placeholder: "Optional name for your own reference",
    help: "Local note only. Not sent to CEIPAL."
  },
  {
    section: "CEIPAL IDs",
    name: "recruitment_manager_note",
    label: "Recruitment Manager Note",
    type: "text",
    required: false,
    defaultValue: "",
    placeholder: "Optional name for your own reference",
    help: "Local note only. Not sent to CEIPAL."
  },
  {
    section: "Job Content",
    name: "job_description",
    label: "Job Description",
    type: "textarea",
    required: true,
    defaultValue: "",
    placeholder: "Add the full internal job description.",
    help: "Use blank lines for paragraphs and start lines with -, *, or • for bullet points."
  },
  {
    section: "Job Content",
    name: "public_job_desc",
    label: "Public Job Description",
    type: "textarea",
    required: false,
    defaultValue: "",
    placeholder: "Add the public-facing job description.",
    help: "Defaults to Job Description if left blank. Paragraphs and bullet points are preserved."
  },
  {
    section: "Status And Type",
    name: "currency",
    label: "Currency ID",
    type: "number",
    required: true,
    defaultValue: 1,
    placeholder: "1",
    help: "CEIPAL currency master-data ID."
  },
  {
    section: "Status And Type",
    name: "job_status",
    label: "Job Status",
    type: "lookup",
    referenceKey: "jobStatuses",
    required: true,
    defaultValue: "Active",
    placeholder: "Search job status",
    help: "Search CEIPAL job statuses; payload sends the status ID."
  },
  {
    section: "Status And Type",
    name: "job_type",
    label: "Job Type",
    type: "lookup",
    referenceKey: "jobTypes",
    required: true,
    defaultValue: "Full Time",
    placeholder: "Search job type",
    help: "Search CEIPAL job types; payload sends the type ID."
  },
  {
    section: "Rates",
    name: "min_experience",
    label: "Minimum Experience",
    type: "text",
    required: false,
    defaultValue: "0",
    placeholder: "0",
    help: "Experience value as expected by CEIPAL."
  },
  {
    section: "Rates",
    name: "min_pay_rate",
    label: "Minimum Pay Rate",
    type: "number",
    required: false,
    defaultValue: 0,
    placeholder: "0",
    step: "0.01",
    help: "Numeric minimum pay rate."
  },
  {
    section: "Rates",
    name: "pay_rate_currency",
    label: "Pay Rate Currency ID",
    type: "number",
    required: false,
    defaultValue: "",
    placeholder: "Defaults to Currency ID",
    help: "Defaults to Currency ID if left blank."
  },
  {
    section: "Rates",
    name: "pay_rate_pay_frequency_type",
    label: "Pay Rate Frequency",
    type: "lookup",
    referenceKey: "payFrequencyTypes",
    required: false,
    defaultValue: "",
    placeholder: "Search pay frequency",
    help: "Search CEIPAL pay frequency; payload sends the frequency ID."
  },
  {
    section: "Rates",
    name: "bill_rate_currency",
    label: "Bill Rate Currency ID",
    type: "number",
    required: false,
    defaultValue: "",
    placeholder: "Defaults to Currency ID",
    help: "Defaults to Currency ID if left blank."
  },
  {
    section: "Rates",
    name: "bill_rate_pay_frequency_type",
    label: "Bill Rate Frequency",
    type: "lookup",
    referenceKey: "payFrequencyTypes",
    required: false,
    defaultValue: "",
    placeholder: "Search bill frequency",
    help: "Search CEIPAL bill frequency; payload sends the frequency ID."
  },
  {
    section: "Tracking",
    name: "unique_job_id",
    label: "Unique Job ID",
    type: "text",
    required: false,
    defaultValue: "",
    placeholder: "Optional tracking value",
    help: "Local tracking value only. Not sent to CEIPAL."
  },
  {
    section: "Zoho Overrides",
    name: "zoho_client_name",
    label: "Zoho Client Name",
    type: "text",
    required: false,
    defaultValue: "General",
    placeholder: "General",
    help: "Defaults to General. Used for Zoho Job Openings Client_Name."
  },
  {
    section: "Zoho Overrides",
    name: "zoho_target_date",
    label: "Zoho Target Date",
    type: "date",
    required: false,
    defaultValue: defaultZohoTargetDate(),
    placeholder: "",
    help: "Defaults to two weeks from today. Used for Zoho Job Openings Target_Date."
  },
  {
    section: "Zoho Overrides",
    name: "zoho_industry",
    label: "Zoho Industry",
    type: "text",
    required: false,
    defaultValue: "IT Services",
    placeholder: "IT Services",
    help: "Defaults to IT Services. Used for Zoho Job Openings Industry."
  },
  {
    section: "Zoho Overrides",
    name: "zoho_job_type",
    label: "Zoho Job Type",
    type: "text",
    required: false,
    defaultValue: "Full time",
    placeholder: "Full time",
    help: "Optional Zoho Job_Type value."
  },
  {
    section: "Zoho Overrides",
    name: "zoho_job_opening_status",
    label: "Zoho Job Opening Status",
    type: "text",
    required: false,
    defaultValue: "In-progress",
    placeholder: "In-progress",
    help: "Optional Zoho Job_Opening_Status value."
  },
  {
    section: "Zoho Overrides",
    name: "zoho_number_of_positions",
    label: "Zoho Number Of Positions",
    type: "number",
    required: false,
    defaultValue: 1,
    placeholder: "1",
    help: "Optional Zoho Number_of_Positions value."
  },
  {
    section: "Zoho Overrides",
    name: "zoho_custom_payload",
    label: "Zoho Custom Payload JSON",
    type: "textarea",
    required: false,
    defaultValue: "",
    placeholder: "{\n  \"Job_Opening_Name\": \"Backend Engineer\"\n}",
    help: "Optional. If filled, this JSON is sent to Zoho instead of the built-in module mapper."
  }
];

const requiredEnvVars = [
  "CEIPAL_AUTH_EMAIL",
  "CEIPAL_AUTH_PASSWORD",
  "CEIPAL_API_KEY"
];

const zohoEnvVars = [
  "ZOHO_RECRUIT_API_DOMAIN",
  "ZOHO_RECRUIT_BASE_URL",
  "ZOHO_RECRUIT_ACCOUNTS_DOMAIN",
  "ZOHO_RECRUIT_MODULE"
];
const googleSheetEnvVars = ["GOOGLE_SHEET_ID"];

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/new-form", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "new-form.html"));
});

app.get("/api/schema", async (_req, res) => {
  try {
    const references = await getMasterData();

    res.json({
      fields: fieldSchema,
      references,
      integrations: {
        ceipal: {
          label: "CEIPAL",
          defaultSelected: true
        },
        zoho: {
          label: "Zoho Recruit",
          defaultSelected: false
        }
      }
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      ok: false,
      message: error.message || "Failed to load CEIPAL schema references.",
      details: error.details || null
    });
  }
});

app.post("/api/references/refresh", async (_req, res) => {
  try {
    const references = await getMasterData({ forceRefresh: true });
    res.json({
      ok: true,
      message: "CEIPAL reference data refreshed.",
      references
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      ok: false,
      message: error.message || "Failed to refresh CEIPAL reference data.",
      details: error.details || null
    });
  }
});

app.get("/api/states", async (req, res) => {
  try {
    const countryId = normalizeString(req.query.countryId);
    if (!countryId) {
      return res.status(400).json({
        ok: false,
        message: "countryId query parameter is required."
      });
    }

    const references = await getMasterData();
    const states = await getStatesForCountry(countryId, references, {
      forceRefresh: normalizeString(req.query.refresh) === "1"
    });

    return res.json({
      ok: true,
      countryId,
      states
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      message: error.message || "Failed to load states.",
      details: error.details || null
    });
  }
});

app.get("/api/job-draft/:jobId", async (req, res) => {
  try {
    const jobId = normalizeString(req.params.jobId);
    if (!jobId) {
      return res.status(400).json({
        ok: false,
        message: "jobId is required."
      });
    }

    const draft = await getJobDraftById(jobId);
    if (!draft) {
      return res.status(404).json({
        ok: false,
        message: `No sheet row found for jobId "${jobId}".`
      });
    }

    return res.json({
      ok: true,
      draft
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      message: error.message || "Failed to load job draft from sheet.",
      details: error.details || null
    });
  }
});

app.get("/api/health", (_req, res) => {
  const missingEnv = requiredEnvVars.filter((key) => !process.env[key]);
  const missingZohoEnv = zohoEnvVars.filter((key) => !process.env[key]);
  const zohoAuthReady =
    Boolean(process.env.ZOHO_RECRUIT_ACCESS_TOKEN) ||
    canRefreshZohoAccessToken() ||
    canExchangeZohoGrantToken();

  res.json({
    ok: missingEnv.length === 0,
    missingEnv,
    integrations: {
      ceipal: {
        ok: missingEnv.length === 0,
        missingEnv
      },
      zoho: {
        ok: missingZohoEnv.length === 0 && zohoAuthReady,
        missingEnv: missingZohoEnv,
        warning: zohoAuthReady
          ? null
          : "Zoho requires ZOHO_RECRUIT_ACCESS_TOKEN, or refresh/grant token plus ZOHO_RECRUIT_CLIENT_ID and ZOHO_RECRUIT_CLIENT_SECRET."
      }
    }
  });
});

app.post("/api/post-job", async (req, res) => {
  const payloadInput = req.body || {};
  const selectedTargets = normalizeTargets(payloadInput.targets);

  if (!selectedTargets.ceipal && !selectedTargets.zoho) {
    return res.status(400).json({
      ok: false,
      message: "Select at least one posting target."
    });
  }

  const missingEnv = getMissingEnvForTargets(selectedTargets);
  if (missingEnv.length > 0) {
    return res.status(500).json({
      ok: false,
      message: "Missing required environment variables.",
      missingEnv
    });
  }

  const validationErrors = validateInput(payloadInput, selectedTargets);

  if (validationErrors.length > 0) {
    return res.status(400).json({
      ok: false,
      message: "Validation failed.",
      errors: validationErrors
    });
  }

  const normalizedJob = buildJobPayload(payloadInput);
  const results = {};

  try {
    if (selectedTargets.ceipal) {
      const token = await createAuthToken();
      results.ceipal = await postToCeipal(token, normalizedJob);
    }

    if (selectedTargets.zoho) {
      results.zoho = await postToZoho(payloadInput, normalizedJob);
    }

    return res.json({
      ok: true,
      targets: selectedTargets,
      postedPayload: normalizedJob,
      tracking: {
        unique_job_id: normalizeString(payloadInput.unique_job_id),
        client_note: normalizeString(payloadInput.client_note),
        recruitment_manager_note: normalizeString(payloadInput.recruitment_manager_note)
      },
      results
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      ok: false,
      message: error.message || "Failed to post job to CEIPAL.",
      details: error.details || null
    });
  }
});

function normalizeTargets(targets) {
  return {
    ceipal: targets?.ceipal !== false,
    zoho: Boolean(targets?.zoho)
  };
}

function validateInput(input, selectedTargets) {
  const errors = [];

  for (const field of fieldSchema) {
    if (!field.required || !shouldValidateField(field, selectedTargets)) {
      continue;
    }

    const rawValue = input[field.name];
    const isEmpty =
      rawValue === undefined ||
      rawValue === null ||
      (typeof rawValue === "string" && rawValue.trim() === "");

    if (isEmpty) {
      errors.push({
        field: field.name,
        message: `${field.label} is required.`
      });
    }
  }

  return errors;
}

function shouldValidateField(field, selectedTargets) {
  if (field.section === "CEIPAL IDs") {
    return selectedTargets.ceipal;
  }

  if (field.section === "Zoho Overrides") {
    return selectedTargets.zoho;
  }

  return true;
}

function getMissingEnvForTargets(selectedTargets) {
  const missing = [];

  if (selectedTargets.ceipal) {
    missing.push(...requiredEnvVars.filter((key) => !process.env[key]));
  }

  if (selectedTargets.zoho) {
    missing.push(...zohoEnvVars.filter((key) => !process.env[key]));

    const zohoAuthReady =
      Boolean(process.env.ZOHO_RECRUIT_ACCESS_TOKEN) ||
      canRefreshZohoAccessToken() ||
      canExchangeZohoGrantToken();

    if (!zohoAuthReady) {
      missing.push("ZOHO_RECRUIT_ACCESS_TOKEN_OR_REFRESH_SETUP");
    }
  }

  return [...new Set(missing)];
}

function buildJobPayload(input) {
  const references = readMasterDataCache();
  const currency = toInt(input.currency, 1);
  const rawJobDescription = normalizeString(input.job_description);
  const jobDescription = formatRichTextDescription(rawJobDescription);
  const jobTitle = normalizeString(input.job_title);
  const countryId = resolveLookupValue(
    references.countries,
    input.country,
    124
  );
  const stateOptions = references.statesByCountry?.[String(countryId)] || [];
  const clientId = resolveLookupValue(references.clients, input.client, "");
  const recruitmentManagerId = resolveLookupValue(
    references.recruitmentManagers,
    input.recruitment_manager,
    ""
  );

  const jobPayload = {
    job_title: jobTitle,
    remote_job: String(resolveLookupValue(references.remoteJobOptions, input.remote_job, 0)),
    country: countryId,
    states: String(resolveLookupValue(stateOptions, input.states, 532)),
    currency,
    city: normalizeString(input.city),
    job_status: resolveLookupValue(references.jobStatuses, input.job_status, 1),
    job_type: resolveLookupValue(references.jobTypes, input.job_type, 1),
    client: clientId,
    recruitment_manager: recruitmentManagerId,
    job_description: jobDescription,
    pay_rate_currency: toInt(input.pay_rate_currency, currency),
    min_pay_rate: toFloat(input.min_pay_rate, 0),
    bill_rate_currency: toInt(input.bill_rate_currency, currency),
    min_experience: normalizeString(input.min_experience, "0"),
    public_job_desc: formatRichTextDescription(
      normalizeString(input.public_job_desc, rawJobDescription)
    ),
    public_job_title: normalizeString(input.public_job_title, jobTitle)
  };

  if (hasValue(input.pay_rate_pay_frequency_type)) {
    jobPayload.pay_rate_pay_frequency_type = resolveLookupValue(
      references.payFrequencyTypes,
      input.pay_rate_pay_frequency_type,
      0
    );
  }

  if (hasValue(input.bill_rate_pay_frequency_type)) {
    jobPayload.bill_rate_pay_frequency_type = resolveLookupValue(
      references.payFrequencyTypes,
      input.bill_rate_pay_frequency_type,
      0
    );
  }

  return jobPayload;
}

async function createAuthToken() {
  const response = await fetch("https://api.ceipal.com/v1/createAuthtoken/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      email: process.env.CEIPAL_AUTH_EMAIL,
      password: process.env.CEIPAL_AUTH_PASSWORD,
      api_key: process.env.CEIPAL_API_KEY,
      json: "1"
    })
  });

  const data = await parseJsonSafe(response);

  if (!response.ok || !data.access_token) {
    throw {
      statusCode: response.status,
      message: "CEIPAL authentication failed.",
      details: data
    };
  }

  return data.access_token;
}

async function postToCeipal(token, jobData) {
  const response = await fetch(getCeipalJobPostUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([jobData])
  });

  const data = await parseJsonSafe(response);

  if (!response.ok) {
    throw {
      statusCode: response.status,
      message: "CEIPAL job post request failed.",
      details: data
    };
  }

  return data;
}

async function postToZoho(input, ceipalJobData) {
  const missingZohoEnv = zohoEnvVars.filter((key) => !process.env[key]);
  if (missingZohoEnv.length > 0) {
    throw {
      statusCode: 500,
      message: "Missing required Zoho environment variables.",
      details: { missingEnv: missingZohoEnv }
    };
  }

  const moduleName = process.env.ZOHO_RECRUIT_MODULE;
  const accessToken = await getZohoAccessToken();
  const recordData = buildZohoPayload(input, ceipalJobData, moduleName);
  const baseUrl = process.env.ZOHO_RECRUIT_BASE_URL || process.env.ZOHO_RECRUIT_API_DOMAIN;
  const endpoint = `${stripTrailingSlash(baseUrl)}/recruit/v2/${getZohoModulePath(moduleName)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      data: [recordData]
    })
  });

  const data = await parseJsonSafe(response);

  if (response.status === 401 && canRefreshZohoAccessToken()) {
    const refreshedToken = await refreshZohoAccessToken();
    return await postToZohoWithToken(moduleName, recordData, refreshedToken);
  }

  if (response.status === 401 && canExchangeZohoGrantToken()) {
    const exchangedToken = await exchangeZohoGrantToken();
    process.env.ZOHO_RECRUIT_GRANT_TOKEN = "";
    return await postToZohoWithToken(moduleName, recordData, exchangedToken);
  }

  if (!response.ok) {
    throw {
      statusCode: response.status,
      message: "Zoho Recruit post request failed.",
      details: data
    };
  }

  return {
    requestPayload: recordData,
    response: data
  };
}

async function postToZohoWithToken(moduleName, recordData, accessToken) {
  const baseUrl = process.env.ZOHO_RECRUIT_BASE_URL || process.env.ZOHO_RECRUIT_API_DOMAIN;
  const endpoint = `${stripTrailingSlash(baseUrl)}/recruit/v2/${getZohoModulePath(moduleName)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      data: [recordData]
    })
  });

  const data = await parseJsonSafe(response);

  if (!response.ok) {
    throw {
      statusCode: response.status,
      message: "Zoho Recruit post request failed after token refresh.",
      details: data
    };
  }

  return {
    requestPayload: recordData,
    response: data
  };
}

async function getZohoAccessToken() {
  const existing = normalizeString(process.env.ZOHO_RECRUIT_ACCESS_TOKEN);
  if (existing) {
    return existing;
  }

  if (canRefreshZohoAccessToken()) {
    return await refreshZohoAccessToken();
  }

  if (canExchangeZohoGrantToken()) {
    return await exchangeZohoGrantToken();
  }

  throw {
    statusCode: 500,
    message: "Zoho access token is missing.",
    details: {
      note: "Provide ZOHO_RECRUIT_ACCESS_TOKEN, or configure refresh/grant token plus ZOHO_RECRUIT_CLIENT_ID and ZOHO_RECRUIT_CLIENT_SECRET."
    }
  };
}

async function getJobDraftById(jobId) {
  const rows = await loadGoogleSheetRows();
  const matched = rows.find(
    (row) => normalizeString(row.unique_job_id).toLowerCase() === normalizeString(jobId).toLowerCase()
  );

  if (!matched) {
    return null;
  }

  const references = await getMasterData();
  const countryId = normalizeString(matched.country);
  const stateId = normalizeString(matched.states);

  return {
    unique_job_id: normalizeString(matched.unique_job_id),
    job_title: normalizeString(matched.job_title),
    public_job_title: normalizeString(matched.public_job_title, normalizeString(matched.job_title)),
    remote_job: normalizeString(matched.remote_job, "Yes"),
    country: normalizeString(
      matched.country_name,
      resolveOptionLabelByValue(references.allCountries, countryId, countryId)
    ),
    states: normalizeString(
      matched.state_name,
      resolveOptionLabelByValue(references.statesByCountry?.[countryId] || [], stateId, stateId)
    ),
    city: normalizeString(matched.city),
    client: normalizeString(matched.client),
    recruitment_manager: normalizeString(matched.recruitment_manager),
    job_description: normalizeString(matched.job_description),
    public_job_desc: normalizeString(
      matched.public_job_desc,
      normalizeString(matched.job_description)
    ),
    currency: normalizeString(matched.currency, "1"),
    job_status: normalizeString(matched.job_status),
    job_type: normalizeString(
      matched.job_type_name,
      normalizeString(matched.job_type)
    ),
    min_experience: normalizeString(matched.min_experience, "0"),
    min_pay_rate: normalizeString(matched.min_pay_rate, "0"),
    pay_rate_currency: normalizeString(matched.pay_rate_currency),
    pay_rate_pay_frequency_type: normalizeString(
      matched.pay_frequency_name,
      normalizeString(matched.pay_rate_pay_frequency_type)
    ),
    bill_rate_currency: normalizeString(matched.bill_rate_currency),
    bill_rate_pay_frequency_type: normalizeString(matched.bill_rate_pay_frequency_type),
    zoho_client_name: normalizeString(matched.zoho_client_name, "General"),
    zoho_target_date: normalizeString(matched.zoho_target_date, defaultZohoTargetDate()),
    zoho_industry: normalizeString(matched.zoho_industry, "IT Services"),
    zoho_job_type: normalizeString(matched.zoho_job_type, "Full time"),
    zoho_job_opening_status: normalizeString(matched.zoho_job_opening_status, "In-progress"),
    zoho_number_of_positions: normalizeString(matched.zoho_number_of_positions, "1")
  };
}

function canRefreshZohoAccessToken() {
  return Boolean(
    process.env.ZOHO_RECRUIT_REFRESH_TOKEN &&
      process.env.ZOHO_RECRUIT_CLIENT_ID &&
      process.env.ZOHO_RECRUIT_CLIENT_SECRET
  );
}

function canExchangeZohoGrantToken() {
  return Boolean(
    process.env.ZOHO_RECRUIT_GRANT_TOKEN &&
      process.env.ZOHO_RECRUIT_CLIENT_ID &&
      process.env.ZOHO_RECRUIT_CLIENT_SECRET
  );
}

async function refreshZohoAccessToken() {
  const response = await fetch(
    `${stripTrailingSlash(process.env.ZOHO_RECRUIT_ACCOUNTS_DOMAIN)}/oauth/v2/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        refresh_token: process.env.ZOHO_RECRUIT_REFRESH_TOKEN,
        client_id: process.env.ZOHO_RECRUIT_CLIENT_ID,
        client_secret: process.env.ZOHO_RECRUIT_CLIENT_SECRET,
        grant_type: "refresh_token"
      })
    }
  );

  const data = await parseJsonSafe(response);

  if (!response.ok || !data.access_token) {
    throw {
      statusCode: response.status,
      message: "Zoho access-token refresh failed.",
      details: data
    };
  }

  process.env.ZOHO_RECRUIT_ACCESS_TOKEN = data.access_token;
  if (data.refresh_token) {
    process.env.ZOHO_RECRUIT_REFRESH_TOKEN = data.refresh_token;
  }
  return data.access_token;
}

async function exchangeZohoGrantToken() {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.ZOHO_RECRUIT_CLIENT_ID,
    client_secret: process.env.ZOHO_RECRUIT_CLIENT_SECRET,
    code: process.env.ZOHO_RECRUIT_GRANT_TOKEN
  });

  if (process.env.ZOHO_RECRUIT_REDIRECT_URI) {
    body.set("redirect_uri", process.env.ZOHO_RECRUIT_REDIRECT_URI);
  }

  const response = await fetch(
    `${stripTrailingSlash(process.env.ZOHO_RECRUIT_ACCOUNTS_DOMAIN)}/oauth/v2/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    }
  );

  const data = await parseJsonSafe(response);

  if (!response.ok || !data.access_token) {
    throw {
      statusCode: response.status,
      message: "Zoho grant-token exchange failed.",
      details: data
    };
  }

  process.env.ZOHO_RECRUIT_ACCESS_TOKEN = data.access_token;
  if (data.refresh_token) {
    process.env.ZOHO_RECRUIT_REFRESH_TOKEN = data.refresh_token;
  }

  return data.access_token;
}

function buildZohoPayload(input, ceipalJobData, moduleName) {
  const customPayload = normalizeString(input.zoho_custom_payload);
  if (customPayload) {
    try {
      return JSON.parse(customPayload);
    } catch (_error) {
      throw {
        statusCode: 400,
        message: "Zoho custom payload is not valid JSON."
      };
    }
  }

  const normalizedModule = normalizeModuleName(moduleName);
  const references = readMasterDataCache();
  const zohoCountry = resolveOptionLabelByValue(
    references.countries,
    ceipalJobData.country,
    resolveLookupLabel(references.countries, input.country, String(ceipalJobData.country))
  );
  const zohoState = resolveOptionLabelByValue(
    references.statesByCountry?.[String(ceipalJobData.country)] || [],
    ceipalJobData.states,
    resolveStateLabel(
      references.statesByCountry?.[String(ceipalJobData.country)] || [],
      input.states,
      String(ceipalJobData.states)
    )
  );

  if (normalizedModule === "jobopenings") {
    return {
      Posting_Title: ceipalJobData.public_job_title || ceipalJobData.job_title,
      Client_Name: normalizeString(input.zoho_client_name, "General"),
      Target_Date: normalizeString(input.zoho_target_date, defaultZohoTargetDate()),
      Industry: normalizeString(input.zoho_industry, "IT Services"),
      Job_Opening_Status: normalizeString(input.zoho_job_opening_status, "In-progress"),
      Job_Type: normalizeString(input.zoho_job_type, "Full time"),
      Number_of_Positions: String(toInt(input.zoho_number_of_positions, 1)),
      City: ceipalJobData.city,
      Country: zohoCountry,
      State: zohoState,
      Job_Description: ceipalJobData.public_job_desc || ceipalJobData.job_description,
      Salary: String(ceipalJobData.min_pay_rate)
    };
  }

  if (normalizedModule === "candidates") {
    throw {
      statusCode: 400,
      message: "ZOHO_RECRUIT_MODULE is set to Candidates, which does not match job posting. Change it to Job Openings or provide zoho_custom_payload."
    };
  }

  throw {
    statusCode: 400,
    message: `Unsupported Zoho module mapping for "${moduleName}". Provide zoho_custom_payload to post to this module.`
  };
}

function normalizeModuleName(moduleName) {
  return normalizeString(moduleName).toLowerCase().replace(/[\s_]/g, "");
}

function getZohoModulePath(moduleName) {
  const normalizedModule = normalizeModuleName(moduleName);

  if (normalizedModule === "jobopenings") {
    return "JobOpenings";
  }

  if (normalizedModule === "candidates" || normalizedModule === "candidate") {
    return "Candidates";
  }

  return encodeURIComponent(normalizeString(moduleName));
}

function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/, "");
}

function defaultZohoTargetDate() {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString().slice(0, 10);
}

async function parseJsonSafe(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return { raw: text };
  }
}

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  const normalized = String(value).trim();
  return normalized === "" ? fallback : normalized;
}

function formatRichTextDescription(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "";
  }

  // If the user already pasted HTML, keep it as-is.
  if (/<[a-z][\s\S]*>/i.test(normalized)) {
    return normalized;
  }

  const blocks = normalized
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const htmlBlocks = blocks.map((block) => {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      return "";
    }

    const bulletLines = lines.filter((line) => /^[*-]|^•/.test(line));
    if (bulletLines.length === lines.length) {
      const items = bulletLines
        .map((line) => line.replace(/^[*\-•]\s*/, ""))
        .map((line) => `<li>${formatInlineDescriptionText(line)}</li>`)
        .join("");
      return `<ul>${items}</ul>`;
    }

    if (lines.length === 1 && isHeadingLikeLine(lines[0])) {
      return `<h3>${escapeHtml(lines[0])}</h3>`;
    }

    return `<p>${lines.map(formatInlineDescriptionText).join("<br>")}</p>`;
  });

  return htmlBlocks.filter(Boolean).join("");
}

function formatInlineDescriptionText(line) {
  const escaped = escapeHtml(line);
  return escaped.replace(
    /\b([^:<>]{2,80}):\s*/g,
    "<strong>$1:</strong> "
  );
}

function isHeadingLikeLine(line) {
  const cleaned = line.replace(/[:.]+$/, "").trim();
  if (!cleaned || cleaned.length > 60) {
    return false;
  }

  return /^[A-Za-z0-9/&(),\-\s]+$/.test(cleaned);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hasValue(value) {
  return !(value === undefined || value === null || String(value).trim() === "");
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toFloat(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function readMasterDataCache() {
  if (masterDataMemoryCache) {
    return masterDataMemoryCache;
  }

  try {
    const raw = fs.readFileSync(optionsFilePath, "utf8");
    const parsed = JSON.parse(raw);
    const normalized = normalizeMasterData(parsed);
    masterDataMemoryCache = normalized;
    return normalized;
  } catch (_error) {
    const normalized = normalizeMasterData({});
    masterDataMemoryCache = normalized;
    return normalized;
  }
}

async function loadGoogleSheetRows() {
  const missingEnv = googleSheetEnvVars.filter((key) => !process.env[key]);
  if (missingEnv.length > 0) {
    throw {
      statusCode: 500,
      message: "Google Sheet integration is not configured.",
      details: { missingEnv }
    };
  }

  const sheets = await getGoogleSheetsClient();
  let response;
  try {
    response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: getGoogleSheetTabName()
    });
  } catch (error) {
    if (error?.code === 403) {
      throw {
        statusCode: 403,
        message: "Google Sheet access denied. Share the sheet with the service-account email as Editor.",
        details: {
          serviceAccountEmail: resolveGoogleServiceAccountEmail(),
          spreadsheetId: process.env.GOOGLE_SHEET_ID,
          sheetTab: normalizeString(process.env.GOOGLE_SHEET_TAB, defaultSheetTabName)
        }
      };
    }

    throw {
      statusCode: error?.code || 500,
      message: "Failed to read Google Sheet rows.",
      details: {
        reason: error?.message || null
      }
    };
  }

  const values = response.data.values || [];
  if (values.length < 2) {
    return [];
  }

  const headers = values[0].map((header) => normalizeSheetHeader(header));
  return values.slice(1).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = normalizeString(row[index]);
    });
    return record;
  });
}

async function getGoogleSheetsClient() {
  const auth = await buildGoogleAuth();
  return google.sheets({ version: "v4", auth });
}

async function buildGoogleAuth() {
  const keyFile = normalizeString(process.env.GOOGLE_SERVICE_ACCOUNT_FILE);
  if (keyFile && !isServerlessRuntime()) {
    return new google.auth.GoogleAuth({
      keyFile,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    }).getClient();
  }

  const clientEmail = normalizeString(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const privateKey = normalizeString(process.env.GOOGLE_PRIVATE_KEY).replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    throw {
      statusCode: 500,
      message: "Google service account credentials are missing.",
      details: {
        missingEnv: ["GOOGLE_SERVICE_ACCOUNT_FILE or GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_PRIVATE_KEY"]
      }
    };
  }

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
}

function normalizeSheetHeader(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getGoogleSheetTabName() {
  const tabName = normalizeString(process.env.GOOGLE_SHEET_TAB, defaultSheetTabName);
  return /[\s']/g.test(tabName) ? `'${tabName.replace(/'/g, "''")}'` : tabName;
}

function isServerlessRuntime() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function resolveGoogleServiceAccountEmail() {
  if (normalizeString(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL)) {
    return normalizeString(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  }

  const keyFile = normalizeString(process.env.GOOGLE_SERVICE_ACCOUNT_FILE);
  if (!keyFile) {
    return "";
  }

  try {
    const raw = fs.readFileSync(keyFile, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeString(parsed.client_email);
  } catch (_error) {
    return "";
  }
}

async function getMasterData({ forceRefresh = false } = {}) {
  const cached = readMasterDataCache();
  const hasBaseData =
    cached.countries.length > 0 &&
    cached.clients.length > 0 &&
    cached.recruitmentManagers.length > 0;
  const isFresh = Date.now() - cached.meta.updatedAtMs < masterDataTtlMs;

  if (!forceRefresh && hasBaseData && isFresh) {
    return cached;
  }

  return await refreshMasterDataCache(cached);
}

async function refreshMasterDataCache(existingCache) {
  const countries = await fetchCeipalList(`${ceipalMasterApiBase}/countriesList/`);
  const jobStatuses = await fetchCeipalList(`${ceipalMasterApiBase}/job-statuses/`);
  const jobTypes = await fetchCeipalList(`${ceipalMasterApiBase}/job-types/`);
  const payFrequencyTypes = await fetchCeipalList(`${ceipalMasterApiBase}/pay-frequency-types/`);
  const recruitmentManagers = await fetchCeipalList(`${ceipalMasterApiBase}/getRecruitmentManager/`);
  const clients = await fetchCeipalList(`${ceipalMasterApiBase}/getClientNamesList/`);

  const baseCache = normalizeMasterData({
    meta: {
      updatedAt: new Date().toISOString()
    },
    countries,
    jobStatuses,
    jobTypes,
    payFrequencyTypes,
    recruitmentManagers,
    clients,
    statesByCountry: existingCache.statesByCountry || {}
  });

  for (const countryName of keyCountryNames) {
    const country = baseCache.countries.find((item) => item.label === countryName);
    if (!country) {
      continue;
    }

    const states = await fetchStatesByCountry(country.value);
    baseCache.statesByCountry[String(country.value)] = states;
  }

  writeMasterDataCache(baseCache);
  return baseCache;
}

async function getStatesForCountry(countryId, references, { forceRefresh = false } = {}) {
  const normalizedCountryId = String(toInt(countryId, 0));
  const cachedStates = references.statesByCountry?.[normalizedCountryId];

  if (!forceRefresh && Array.isArray(cachedStates) && cachedStates.length > 0) {
    return cachedStates;
  }

  const states = await fetchStatesByCountry(normalizedCountryId);
  const cache = readMasterDataCache();
  cache.statesByCountry[normalizedCountryId] = states;
  cache.meta.updatedAt = new Date().toISOString();
  cache.meta.updatedAtMs = Date.parse(cache.meta.updatedAt) || Date.now();
  writeMasterDataCache(cache);
  return states;
}

function writeMasterDataCache(cache) {
  masterDataMemoryCache = normalizeMasterData(cache);

  if (isServerlessRuntime()) {
    return;
  }

  fs.mkdirSync(path.dirname(optionsFilePath), { recursive: true });
  fs.writeFileSync(optionsFilePath, JSON.stringify(cache, null, 2));
}

async function fetchCeipalList(url) {
  const response = await fetch(url);
  const data = await parseJsonSafe(response);

  if (!response.ok || !Array.isArray(data)) {
    throw {
      statusCode: response.status,
      message: `Failed to load CEIPAL master data from ${url}.`,
      details: data
    };
  }

  return data;
}

async function fetchStatesByCountry(countryId) {
  const response = await fetch(`${ceipalMasterApiBase}/statesList/?country=${countryId}`);
  const data = await parseJsonSafe(response);

  if (!response.ok || !Array.isArray(data)) {
    throw {
      statusCode: response.status,
      message: `Failed to load CEIPAL states for country ${countryId}.`,
      details: data
    };
  }

  return normalizeStateOptions(data);
}

function normalizeMasterData(raw) {
  const metaUpdatedAt = normalizeString(raw.meta?.updatedAt);
  const allCountries = normalizeCountryOptions(raw.countries);
  const keyCountries = buildKeyCountries(allCountries);

  return {
    meta: {
      updatedAt: metaUpdatedAt,
      updatedAtMs: Date.parse(metaUpdatedAt) || 0
    },
    remoteJobOptions: normalizeLookupOptions(raw.remoteJobOptions || remoteJobOptions),
    countries: keyCountries,
    allCountries,
    statesByCountry: normalizeStatesByCountry(raw.statesByCountry),
    jobStatuses: normalizeLookupOptions(raw.jobStatuses),
    jobTypes: normalizeLookupOptions(raw.jobTypes),
    payFrequencyTypes: normalizeLookupOptions(raw.payFrequencyTypes),
    clients: normalizeClientOptions(raw.clients),
    recruitmentManagers: normalizeRecruitmentManagerOptions(raw.recruitmentManagers),
    keyCountries
  };
}

function normalizeLookupOptions(options) {
  if (!Array.isArray(options)) {
    return [];
  }

  return options
    .map((option) => {
      const value = normalizeString(option.value ?? option.id);
      const label = normalizeString(option.label ?? option.name);
      const display = normalizeString(option.display, label);

      if (!value || !label) {
        return null;
      }

      return {
        value,
        label,
        display
      };
    })
    .filter(Boolean);
}

function normalizeCountryOptions(options) {
  if (!Array.isArray(options)) {
    return [];
  }

  return options
    .map((country) => {
      const value = normalizeString(country.value ?? country.id);
      const label = normalizeString(country.label ?? country.name);
      if (!value || !label) {
        return null;
      }

      return {
        value,
        label,
        display: label,
        iso: normalizeString(country.iso),
        isoCurrencyCode: normalizeString(country.iso_currency_code)
      };
    })
    .filter(Boolean);
}

function normalizeStateOptions(options) {
  if (!Array.isArray(options)) {
    return [];
  }

  return options
    .map((state) => {
      const value = normalizeString(state.value ?? state.id);
      const label = normalizeString(state.label ?? state.name);
      if (!value || !label) {
        return null;
      }

      const abbreviation = normalizeString(state.abbreviation);

      return {
        value,
        label,
        display: abbreviation ? `${label} (${abbreviation})` : label,
        abbreviation
      };
    })
    .filter(Boolean);
}

function normalizeStatesByCountry(statesByCountry) {
  const normalized = {};

  if (!statesByCountry || typeof statesByCountry !== "object") {
    return normalized;
  }

  for (const [countryId, states] of Object.entries(statesByCountry)) {
    normalized[String(countryId)] = normalizeStateOptions(states);
  }

  return normalized;
}

function normalizeClientOptions(options) {
  if (!Array.isArray(options)) {
    return [];
  }

  return options
    .map((client) => {
      const value = normalizeString(client.value ?? client.id);
      const label = normalizeString(client.label ?? client.name);
      if (!value || !label) {
        return null;
      }

      return {
        value,
        label,
        display: `${label} [${value}]`
      };
    })
    .filter(Boolean);
}

function normalizeRecruitmentManagerOptions(options) {
  if (!Array.isArray(options)) {
    return [];
  }

  return options
    .map((manager) => {
      const value = normalizeString(manager.value ?? manager.id);
      const label = normalizeString(manager.label ?? manager.display_name);
      if (!value || !label) {
        return null;
      }

      const email = normalizeString(manager.email ?? manager.email_id);
      const display = email ? `${label} - ${email} [${value}]` : `${label} [${value}]`;

      return {
        value,
        label,
        display,
        email
      };
    })
    .filter(Boolean);
}

function buildKeyCountries(countries) {
  const options = Array.isArray(countries) ? countries : normalizeCountryOptions(countries);
  return keyCountryNames
    .map((name) => options.find((country) => country.label === name))
    .filter(Boolean);
}

function resolveLookupValue(options, rawValue, fallback) {
  const normalizedRaw = normalizeString(rawValue);
  if (!normalizedRaw) {
    return fallback;
  }

  const normalizedOptions = Array.isArray(options) ? options : [];
  const matched = normalizedOptions.find((option) => {
    return [option.value, option.label, option.display]
      .filter(Boolean)
      .some((candidate) => candidate.toLowerCase() === normalizedRaw.toLowerCase());
  });

  if (matched) {
    return isNumericString(matched.value) ? toInt(matched.value, fallback) : matched.value;
  }

  return isNumericString(normalizedRaw) ? toInt(normalizedRaw, fallback) : normalizedRaw;
}

function resolveLookupLabel(options, rawValue, fallback) {
  const normalizedRaw = normalizeString(rawValue);
  const normalizedOptions = Array.isArray(options) ? options : [];

  const matched = normalizedOptions.find((option) => {
    return [option.value, option.label, option.display]
      .filter(Boolean)
      .some((candidate) => candidate.toLowerCase() === normalizedRaw.toLowerCase());
  });

  if (matched) {
    return matched.label || matched.display || fallback;
  }

  return normalizedRaw || fallback;
}

function resolveStateLabel(options, rawValue, fallback) {
  const label = resolveLookupLabel(options, rawValue, fallback);
  const matched = (Array.isArray(options) ? options : []).find((option) => {
    return [option.value, option.label, option.display]
      .filter(Boolean)
      .some((candidate) => candidate.toLowerCase() === label.toLowerCase());
  });

  return matched?.label || label;
}

function resolveOptionLabelByValue(options, value, fallback) {
  const normalizedValue = normalizeString(value);
  const matched = (Array.isArray(options) ? options : []).find(
    (option) => normalizeString(option.value) === normalizedValue
  );

  return matched?.label || fallback;
}

function isNumericString(value) {
  return /^-?\d+$/.test(String(value).trim());
}

function getCeipalJobPostUrl() {
  return normalizeString(process.env.CEIPAL_JOB_POST_URL, defaultCeipalJobPostUrl);
}

if (require.main === module) {
  app.listen(port, () => {
    console.log(`CEIPAL job form running at http://localhost:${port}`);
  });
}

module.exports = app;
