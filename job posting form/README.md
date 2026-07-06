# CEIPAL Job Posting Form

Manual browser form for posting jobs to CEIPAL and Zoho Recruit using a shared local UI.

## Run

1. Install dependencies:

```powershell
npm install
```

2. Create `.env` from `.env.example` and fill:

- `CEIPAL_AUTH_EMAIL`
- `CEIPAL_AUTH_PASSWORD`
- `CEIPAL_API_KEY`
- `CEIPAL_JOB_POST_URL`
- `ZOHO_RECRUIT_API_DOMAIN`
- `ZOHO_RECRUIT_BASE_URL`
- `ZOHO_RECRUIT_ACCOUNTS_DOMAIN`
- `ZOHO_RECRUIT_ACCESS_TOKEN`
- `ZOHO_RECRUIT_REFRESH_TOKEN`
- `ZOHO_RECRUIT_SCOPE`
- `ZOHO_RECRUIT_MODULE`
- Optional for auto-refresh: `ZOHO_RECRUIT_CLIENT_ID`, `ZOHO_RECRUIT_CLIENT_SECRET`
- Optional for one-time exchange: `ZOHO_RECRUIT_GRANT_TOKEN`, `ZOHO_RECRUIT_REDIRECT_URI`

3. Start the app:

```powershell
npm start
```

4. Open:

```text
http://localhost:3000
```

## Field notes

- Fields marked `Required` are required by this local form.
- Fields marked `Optional` fall back to the same defaults used in your n8n code where possible.
- `country`, `states`, `currency`, `job_status`, and `job_type` are CEIPAL IDs, not labels.
- `client_id` should contain the CEIPAL client ID that maps to the payload field `client`.
- `recruitment_manager_id` should contain the CEIPAL user ID that maps to the payload field `recruitment_manager`.
- `unique_job_id`, `client_note`, and `recruitment_manager_note` are kept for local tracking and are not sent to CEIPAL.
- The top target selector lets you send the same form to CEIPAL, Zoho Recruit, or both.
- Zoho uses `ZOHO_RECRUIT_MODULE`. For actual job posting, set this to `Job Openings`. If you keep it as `Candidates`, the app will block the request unless you provide a custom Zoho JSON payload.
- For your current Zoho Job Openings setup, the default mapper sends the required fields `Posting_Title`, `Client_Name`, `Target_Date`, and `Industry`.

## Zoho mapping

- If `ZOHO_RECRUIT_MODULE=Job Openings`, the app sends a basic mapped Zoho payload automatically.
- If you need exact custom fields, add a `zoho_custom_payload` field in requests or extend the mapper in `server.js`.
- If the access token expires, the app first tries `ZOHO_RECRUIT_REFRESH_TOKEN`. If that is not usable, it can also exchange `ZOHO_RECRUIT_GRANT_TOKEN` once, provided the Zoho client ID and secret are configured.

## Reference data

If you want type-ahead suggestions for client IDs or recruitment manager IDs, add local options in `data/ceipal-options.json`:

```json
{
  "clients": [
    { "value": "client-id-here", "label": "Client Name" }
  ],
  "recruitmentManagers": [
    { "value": "user-id-here", "label": "Recruiter Name" }
  ]
}
```
