# Deploy: HOA Incident → SPD handoff (v1)

## 1. Google Sheet
1. Create a Google Sheet in the HOA (spcchoa@gmail.com) Drive, e.g. "SPCC Incident Tracking".
2. Add a tab named exactly `Incidents`.
3. Add a header row: Timestamp | Name | Email | Phone | Location | Date/Time | Report Type | Narrative | Suspect/Vehicle | Photo | SPD Case # | Needs Review.
4. Copy the spreadsheet ID from its URL (the long id between `/d/` and `/edit`).

## 2. Apps Script
1. In the Sheet: Extensions → Apps Script. Paste `apps-script/Code.gs`.
2. Project Settings → Script Properties: add `SHEET_ID` = the id from step 1.4, and
   `WEBHOOK_SECRET` = a long random string (save it for step 3).
3. Deploy → New deployment → type Web app → Execute as: Me → Who has access: Anyone.
   Copy the deployment `/exec` URL.

## 3. Netlify environment variables
In Netlify site settings → Environment variables, add:
- `APPS_SCRIPT_URL` = the `/exec` URL from step 2.3
- `SHEET_WEBHOOK_SECRET` = the same value as `WEBHOOK_SECRET`
Then trigger a redeploy so the function picks up the variables.

## 4. Smoke test
- Submit a real test report on the live site with report type "Theft".
- Confirm: a Netlify Forms entry appears, a new row lands in the `Incidents` tab with the
  photo link, and the `/incident-filed/` page showed the ✅ verdict + packet.
- curl check (replace URL + secret):
  `curl -sS -X POST "$APPS_SCRIPT_URL" -H 'Content-Type: application/json' -d '{"secret":"THESECRET","row":["t","Test","x@y.com","","","","Theft","n","","","",""]}'`
  Expected: `{"ok":true}` and a new row.
