// Netlify automatically invokes a function named "submission-created" after a form
// submission is verified. We forward the row to the Google Apps Script web app, which
// appends it to the tracking Sheet. Secrets come from Netlify environment variables.
import { buildRow } from "./lib/build-row.mjs";

export async function handler(event) {
  const url = process.env.APPS_SCRIPT_URL;
  const secret = process.env.SHEET_WEBHOOK_SECRET;
  if (!url || !secret) {
    return { statusCode: 500, body: "APPS_SCRIPT_URL / SHEET_WEBHOOK_SECRET not set" };
  }
  let payload;
  try {
    payload = JSON.parse(event.body).payload;
  } catch (e) {
    return { statusCode: 400, body: "bad payload" };
  }
  // Only mirror the security-incident form, not other site forms (e.g. contact).
  if (payload.form_name && payload.form_name !== "security-incident") {
    return { statusCode: 200, body: "ignored (other form)" };
  }
  const row = buildRow(payload);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, row }),
  });
  return { statusCode: res.ok ? 200 : 502, body: res.ok ? "ok" : "sheet append failed" };
}
