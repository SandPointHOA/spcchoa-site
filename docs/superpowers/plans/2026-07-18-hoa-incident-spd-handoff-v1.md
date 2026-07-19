# HOA Incident → SPD Report Assist (v1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the existing Sand Point HOA security-incident form so that, after a resident submits, a confirmation screen hands them an eligibility verdict plus a copy-paste packet mapped to Seattle PD's online report — and every submission is mirrored into a board-facing Google Sheet.

**Architecture:** Keep the existing Netlify Forms submission (fields, reCAPTCHA, honeypot, photo upload) untouched. On submit, a small script stashes the entered values in `sessionStorage` and lets the native Netlify POST proceed, redirecting to a new `/incident-filed/` page instead of the generic `/success/`. That page reads `sessionStorage` and renders the verdict + SPD packet entirely client-side. A Netlify `submission-created` function mirrors each submission to a Google Apps Script web app that appends a row to the tracking Sheet.

**Tech Stack:** Hugo (0.164.0) static site, vanilla ES modules (browser `<script type="module">`), Node 25 built-in test runner (`node --test`, no dependencies), Netlify Forms + Netlify Functions, Google Apps Script.

## Global Constraints

- HUGO_VERSION is pinned to `0.164.0` in `netlify.toml`; build locally with that before pushing.
- **Preserve every existing form field and its `name` attribute** in `layouts/section/security-incident.html`: `name`, `email`, `phone`, `location`, `datetime`, `report_type`, `narrative`, `suspect`, `police_case`, `attachment`, plus the `bot-field` honeypot and `data-netlify-recaptcha`.
- No new runtime dependencies / no `package.json` required — tests run under `node --test`.
- The 7 report types are exactly: `Suspicious Activity or Person`, `Residential Burglary`, `Theft`, `Theft of Property Inside a Vehicle (Car Prowl)`, `Theft of Auto Accessories`, `Property Destruction / Vandalism`, `Graffiti`.
- Phone numbers (verbatim): SPD non-emergency `206-625-5011`; on-duty guard shack `425-454-5011`; emergencies `911`.
- SPD online portal deep link: `https://spdonlinereporting.seattle.gov/`.
- Confirmation headline (verbatim): **"Please help our city reduce this type of crime by filing this report — with our help."**
- The 911 reminder is ALWAYS shown on the confirmation screen. No keyword-based emergency detection (unreliable; would give false confidence).

## File Structure

- `static/js/incident-logic.js` — pure, DOM-free logic: report-type→SPD-category map, eligibility, verdict, packet builder. Imported by both the browser and the Node tests.
- `static/js/incident-form.js` — form page: on submit, stash field values in `sessionStorage`.
- `static/js/incident-success.js` — confirmation page: read `sessionStorage`, render verdict + packet + copy buttons.
- `layouts/section/security-incident.html` — MODIFY: change `action`, add the two script tags, add `police_case`-independent nothing else.
- `content/incident-filed/_index.md` + `layouts/section/incident-filed.html` — new confirmation page.
- `netlify/functions/lib/build-row.mjs` — pure: map a Netlify submission payload → Sheet row array.
- `netlify/functions/submission-created.mjs` — Netlify-triggered: POST the row to the Apps Script URL.
- `apps-script/Code.gs` — Google Apps Script `doPost` that appends the row to the Sheet.
- `docs/superpowers/DEPLOY-incident-spd-handoff.md` — manual deploy steps (Apps Script deploy, Netlify env vars, Sheet setup).
- `tests/incident-logic.test.mjs`, `tests/build-row.test.mjs` — Node tests.

---

### Task 1: Pure logic module (verdict, SPD mapping, packet)

**Files:**
- Create: `static/js/incident-logic.js`
- Test: `tests/incident-logic.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SPD_CATEGORY: Record<string, string|null>` — report type → SPD online category, or `null` if not online-eligible.
  - `isOnlineEligible(reportType: string): boolean`
  - `computeVerdict(submission: {report_type: string, suspect?: string}): { level: "online"|"phone", spdCategory: string|null, hasSuspect: boolean }`
  - `buildPacketFields(submission: object): Array<{label: string, value: string}>`
  - `packetToText(fields: Array<{label,value}>): string`

- [ ] **Step 1: Write the failing test**

Create `tests/incident-logic.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isOnlineEligible,
  computeVerdict,
  buildPacketFields,
  packetToText,
} from "../static/js/incident-logic.js";

test("online-eligible types map to an SPD category", () => {
  assert.equal(isOnlineEligible("Theft"), true);
  assert.equal(isOnlineEligible("Graffiti"), true);
  assert.equal(isOnlineEligible("Theft of Property Inside a Vehicle (Car Prowl)"), true);
});

test("non-eligible types are not online-fileable", () => {
  assert.equal(isOnlineEligible("Residential Burglary"), false);
  assert.equal(isOnlineEligible("Suspicious Activity or Person"), false);
});

test("eligible type with no suspect => online verdict", () => {
  const v = computeVerdict({ report_type: "Theft", suspect: "" });
  assert.equal(v.level, "online");
  assert.equal(v.spdCategory, "Theft");
  assert.equal(v.hasSuspect, false);
});

test("eligible type WITH a suspect description => phone verdict (SPD wants follow-up)", () => {
  const v = computeVerdict({ report_type: "Theft", suspect: "tall man, red hoodie" });
  assert.equal(v.level, "phone");
  assert.equal(v.hasSuspect, true);
});

test("non-eligible type => phone verdict regardless of suspect", () => {
  const v = computeVerdict({ report_type: "Residential Burglary", suspect: "" });
  assert.equal(v.level, "phone");
  assert.equal(v.spdCategory, null);
});

test("car prowl maps to SPD 'Car Break-Ins'", () => {
  const v = computeVerdict({ report_type: "Theft of Property Inside a Vehicle (Car Prowl)", suspect: "" });
  assert.equal(v.spdCategory, "Car Break-Ins");
});

test("packet lists mapped fields in SPD order and renders text", () => {
  const submission = {
    name: "Jane Doe", email: "jane@example.com", phone: "206-555-0000",
    location: "8000 block of Forest Dr NE", datetime: "2026-07-17T21:30",
    report_type: "Theft", suspect: "", narrative: "Package taken from porch.",
  };
  const fields = buildPacketFields(submission);
  const labels = fields.map((f) => f.label);
  assert.deepEqual(labels, [
    "Your name", "Phone", "Email", "Incident date & time",
    "Location (Seattle)", "Incident type (SPD category)", "Suspect / vehicle", "What happened",
  ]);
  const spdField = fields.find((f) => f.label === "Incident type (SPD category)");
  assert.equal(spdField.value, "Theft");
  const text = packetToText(fields);
  assert.match(text, /Your name: Jane Doe/);
  assert.match(text, /What happened: Package taken from porch\./);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/joshuahritz/spcchoa-site && node --test tests/incident-logic.test.mjs`
Expected: FAIL — cannot find module `../static/js/incident-logic.js`.

- [ ] **Step 3: Write minimal implementation**

Create `static/js/incident-logic.js`:

```js
// Report type (HOA form) -> SPD online-reporting category, or null if not online-eligible.
export const SPD_CATEGORY = {
  "Theft": "Theft",
  "Theft of Property Inside a Vehicle (Car Prowl)": "Car Break-Ins",
  "Theft of Auto Accessories": "Theft of Auto Accessories",
  "Property Destruction / Vandalism": "Property Destruction",
  "Graffiti": "Graffiti",
  "Residential Burglary": null,
  "Suspicious Activity or Person": null,
};

export function isOnlineEligible(reportType) {
  return SPD_CATEGORY[reportType] != null;
}

// A filled Suspect/Vehicle field is our proxy for "known suspect" -> SPD wants follow-up,
// so those are routed to the phone line. When uncertain, phone is the safe default.
export function computeVerdict(submission) {
  const reportType = submission.report_type;
  const hasSuspect = Boolean(submission.suspect && submission.suspect.trim().length > 0);
  const spdCategory = SPD_CATEGORY[reportType] ?? null;
  const level = isOnlineEligible(reportType) && !hasSuspect ? "online" : "phone";
  return { level, spdCategory, hasSuspect };
}

export function buildPacketFields(submission) {
  const spdCategory = SPD_CATEGORY[submission.report_type] ?? submission.report_type ?? "";
  const rows = [
    ["Your name", submission.name],
    ["Phone", submission.phone],
    ["Email", submission.email],
    ["Incident date & time", submission.datetime],
    ["Location (Seattle)", submission.location],
    ["Incident type (SPD category)", spdCategory],
    ["Suspect / vehicle", submission.suspect && submission.suspect.trim() ? submission.suspect : "None"],
    ["What happened", submission.narrative],
  ];
  return rows.map(([label, value]) => ({ label, value: value == null ? "" : String(value) }));
}

export function packetToText(fields) {
  return fields.map((f) => `${f.label}: ${f.value}`).join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/joshuahritz/spcchoa-site && node --test tests/incident-logic.test.mjs`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Commit**

```bash
git add static/js/incident-logic.js tests/incident-logic.test.mjs
git commit -m "feat: SPD verdict + packet logic with tests"
```

---

### Task 2: Wire the form to stash values and redirect to the confirmation page

**Files:**
- Modify: `layouts/section/security-incident.html:9` (the `<form ...>` tag) and add script tags before `{{ end }}`.
- Create: `static/js/incident-form.js`

**Interfaces:**
- Consumes: nothing.
- Produces: on form submit, writes `sessionStorage["incidentSubmission"]` = JSON of the string field values; native Netlify POST proceeds to `/incident-filed`.

- [ ] **Step 1: Create the form script**

Create `static/js/incident-form.js`:

```js
// On submit, capture the entered text values so the confirmation page can build the SPD
// packet. We do NOT preventDefault: Netlify still handles the real POST, reCAPTCHA, spam
// filtering, and the photo upload exactly as before. sessionStorage is written first, so it
// survives even if reCAPTCHA interrupts before navigation.
const form = document.querySelector("form.incident-form");
if (form) {
  form.addEventListener("submit", () => {
    const data = {};
    new FormData(form).forEach((value, key) => {
      if (typeof value === "string") data[key] = value; // skip the File (attachment)
    });
    try {
      sessionStorage.setItem("incidentSubmission", JSON.stringify(data));
    } catch (e) {
      /* private mode / storage disabled — confirmation page will show a generic message */
    }
  });
}
```

- [ ] **Step 2: Point the form at the new confirmation page**

In `layouts/section/security-incident.html`, on the `<form>` tag (line 9), change the action:

Find: `action="/success"`
Replace with: `action="/incident-filed"`

Leave everything else on that tag (`data-netlify`, `data-netlify-recaptcha`, `enctype`, `method`, `name`) unchanged.

- [ ] **Step 3: Load the script**

In `layouts/section/security-incident.html`, immediately before the closing `{{ end }}` (after `</div>` on line 96), add:

```html
<script type="module" src="/js/incident-form.js"></script>
```

- [ ] **Step 4: Verify the build**

Run: `cd /Users/joshuahritz/spcchoa-site && hugo --gc --minify`
Expected: build succeeds with no errors; `public/js/incident-form.js` exists and `public/security-incident/index.html` contains `action="/incident-filed"` and the module script tag.

Confirm: `grep -o 'action="[^"]*"' public/security-incident/index.html` → `action="/incident-filed"`.

- [ ] **Step 5: Commit**

```bash
git add layouts/section/security-incident.html static/js/incident-form.js
git commit -m "feat: stash incident values on submit, redirect to /incident-filed"
```

---

### Task 3: The confirmation page (verdict + SPD packet + copy)

**Files:**
- Create: `content/incident-filed/_index.md`
- Create: `layouts/section/incident-filed.html`
- Create: `static/js/incident-success.js`

**Interfaces:**
- Consumes: `sessionStorage["incidentSubmission"]`; `computeVerdict`, `buildPacketFields`, `packetToText` from `/js/incident-logic.js`.
- Produces: rendered confirmation UI. No outputs consumed by later tasks.

- [ ] **Step 1: Create the content stub**

Create `content/incident-filed/_index.md`:

```markdown
---
title: "Report received — next steps"
---
```

- [ ] **Step 2: Create the page layout**

Create `layouts/section/incident-filed.html`:

```html
{{ define "main" }}
<div id="main">
	<section class="sec-full-text">
		<div class="readable">
			<h1>Thank you — your report was sent to the HOA.</h1>
			<p class="report-emergency"><strong>For an emergency or a crime in progress, always call 911 first.</strong> To reach the on-duty guard directly, call <strong>425-454-5011</strong>.</p>

			<div id="spd-handoff" hidden>
				<h2>Please help our city reduce this type of crime by filing this report — with our help.</h2>
				<div id="verdict"></div>
				<div id="packet-wrap" hidden>
					<h3>Copy-and-paste packet for the Seattle Police report</h3>
					<p>Open the SPD report, then paste each line into the matching field.</p>
					<p><a id="spd-link" href="https://spdonlinereporting.seattle.gov/" target="_blank" rel="noopener">Open the Seattle Police online report &raquo;</a></p>
					<p><button type="button" id="copy-all">Copy all</button> <span id="copy-all-status" role="status"></span></p>
					<dl id="packet"></dl>
					<h3>Or copy the whole packet as text</h3>
					<textarea id="packet-text" readonly rows="10" style="width:100%"></textarea>
				</div>
			</div>

			<p id="no-data" hidden>Your report was sent. If you also want to file it with the Seattle Police, you can start their report here: <a href="https://spdonlinereporting.seattle.gov/" target="_blank" rel="noopener">Seattle Police online reporting</a>.</p>

			<p><a href="/">&laquo; Go home</a></p>
		</div>
	</section>
</div>
<script type="module" src="/js/incident-success.js"></script>
{{ end }}
```

- [ ] **Step 3: Create the confirmation script**

Create `static/js/incident-success.js`:

```js
import { computeVerdict, buildPacketFields, packetToText } from "/js/incident-logic.js";

const SPD_NONEMERGENCY = "206-625-5011";
const GUARD = "425-454-5011";

function el(id) { return document.getElementById(id); }

function renderVerdict(verdict) {
  const box = el("verdict");
  if (verdict.level === "online") {
    box.innerHTML =
      `<p>✅ <strong>This report can be filed online with the Seattle Police.</strong> ` +
      `Use the link and packet below — it takes about two minutes.</p>`;
    el("packet-wrap").hidden = false;
  } else {
    const why = verdict.spdCategory === null
      ? "This type of report isn't accepted through SPD's online system."
      : "Because you described a suspect or vehicle, SPD will want to follow up directly.";
    box.innerHTML =
      `<p>⚠️ <strong>Please call the Seattle Police non-emergency line: ` +
      `<a href="tel:${SPD_NONEMERGENCY}">${SPD_NONEMERGENCY}</a>.</strong> ${why} ` +
      `You can also alert the on-duty guard at <a href="tel:${GUARD}">${GUARD}</a>.</p>`;
    el("packet-wrap").hidden = true;
  }
}

function renderPacket(submission) {
  const fields = buildPacketFields(submission);
  const dl = el("packet");
  dl.innerHTML = "";
  for (const f of fields) {
    const dt = document.createElement("dt");
    dt.textContent = f.label;
    const dd = document.createElement("dd");
    const span = document.createElement("span");
    span.textContent = f.value || "—";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Copy";
    btn.addEventListener("click", () => copyText(f.value, btn));
    dd.append(span, " ", btn);
    dl.append(dt, dd);
  }
  const text = packetToText(fields);
  el("packet-text").value = text;
  el("copy-all").addEventListener("click", () => {
    copyText(text, null, el("copy-all-status"));
  });
}

function copyText(text, btn, statusEl) {
  const done = () => {
    if (btn) { const old = btn.textContent; btn.textContent = "Copied"; setTimeout(() => (btn.textContent = old), 1500); }
    if (statusEl) { statusEl.textContent = "Copied!"; setTimeout(() => (statusEl.textContent = ""), 1500); }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => selectFallback());
  } else {
    selectFallback();
  }
  function selectFallback() {
    // Clipboard API unavailable: focus the full-text box so the user can copy manually.
    const ta = el("packet-text");
    ta.hidden = false; ta.focus(); ta.select();
  }
}

function main() {
  let submission = null;
  try { submission = JSON.parse(sessionStorage.getItem("incidentSubmission") || "null"); } catch (e) {}
  if (!submission || !submission.report_type) {
    el("no-data").hidden = false;
    return;
  }
  el("spd-handoff").hidden = false;
  renderVerdict(computeVerdict(submission));
  renderPacket(submission);
}

main();
```

- [ ] **Step 4: Verify the build and the flow**

Run: `cd /Users/joshuahritz/spcchoa-site && hugo --gc --minify`
Expected: build succeeds; `public/incident-filed/index.html` exists and contains the headline and `id="spd-handoff"`.

Manual check: `hugo server -D`, open `http://localhost:1313/security-incident/`, fill the form with report type **Theft** and an empty suspect field, submit. Because there is no live Netlify backend locally, the POST will 404 — that is expected; the value is already in `sessionStorage`. Navigate manually to `http://localhost:1313/incident-filed/` and confirm: headline shows, ✅ online verdict shows, packet lists all 8 fields, "Copy all" works. Then repeat with report type **Residential Burglary** (or Theft + a suspect description) and confirm the ⚠️ phone verdict with both `206-625-5011` and `425-454-5011`.

- [ ] **Step 5: Commit**

```bash
git add content/incident-filed/_index.md layouts/section/incident-filed.html static/js/incident-success.js
git commit -m "feat: /incident-filed confirmation page with SPD verdict and packet"
```

---

### Task 4: Mirror submissions into the Google Sheet (Netlify function)

**Files:**
- Create: `netlify/functions/lib/build-row.mjs`
- Create: `netlify/functions/submission-created.mjs`
- Test: `tests/build-row.test.mjs`

**Interfaces:**
- Consumes: Netlify submission payload shape `{ payload: { created_at: string, data: {name,email,phone,location,datetime,report_type,narrative,suspect,police_case,attachment?} } }`.
- Produces: `buildRow(payload): string[]` — the Sheet row, column order fixed as below. `submission-created` POSTs `{ secret, row }` to `process.env.APPS_SCRIPT_URL`.

- [ ] **Step 1: Write the failing test**

Create `tests/build-row.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRow } from "../netlify/functions/lib/build-row.mjs";

test("buildRow maps a submission payload to the fixed column order", () => {
  const payload = {
    created_at: "2026-07-18T04:00:00.000Z",
    data: {
      name: "Jane Doe", email: "jane@example.com", phone: "206-555-0000",
      location: "8000 block of Forest Dr NE", datetime: "2026-07-17T21:30",
      report_type: "Theft", narrative: "Package taken.", suspect: "",
      police_case: "", attachment: "https://netlify.app/uploads/photo.jpg",
    },
  };
  const row = buildRow(payload);
  assert.deepEqual(row, [
    "2026-07-18T04:00:00.000Z", "Jane Doe", "jane@example.com", "206-555-0000",
    "8000 block of Forest Dr NE", "2026-07-17T21:30", "Theft", "Package taken.",
    "", "https://netlify.app/uploads/photo.jpg", "", "",
  ]);
});

test("buildRow tolerates missing optional fields", () => {
  const row = buildRow({ created_at: "t", data: { name: "A", report_type: "Graffiti" } });
  assert.equal(row.length, 12);
  assert.equal(row[0], "t");
  assert.equal(row[1], "A");
  assert.equal(row[6], "Graffiti");
  assert.equal(row[9], ""); // attachment absent -> empty
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/joshuahritz/spcchoa-site && node --test tests/build-row.test.mjs`
Expected: FAIL — cannot find module `build-row.mjs`.

- [ ] **Step 3: Write the row builder**

Create `netlify/functions/lib/build-row.mjs`:

```js
// Fixed Sheet column order. The last two columns ("SPD Case #", "Needs review") are filled
// later by the v2 email-append automation, so they start empty here.
export function buildRow(payload) {
  const d = payload.data || {};
  const g = (k) => (d[k] == null ? "" : String(d[k]));
  return [
    payload.created_at || "",
    g("name"),
    g("email"),
    g("phone"),
    g("location"),
    g("datetime"),
    g("report_type"),
    g("narrative"),
    g("suspect"),
    g("attachment"),
    g("police_case"), // inline case # if the resident already had one
    "",               // Needs review (v2)
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/joshuahritz/spcchoa-site && node --test tests/build-row.test.mjs`
Expected: PASS (both tests).

- [ ] **Step 5: Write the Netlify function**

Create `netlify/functions/submission-created.mjs`:

```js
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
```

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/lib/build-row.mjs netlify/functions/submission-created.mjs tests/build-row.test.mjs
git commit -m "feat: mirror incident submissions to Google Sheet via Netlify function"
```

---

### Task 5: Google Apps Script endpoint + deployment doc

**Files:**
- Create: `apps-script/Code.gs`
- Create: `docs/superpowers/DEPLOY-incident-spd-handoff.md`

**Interfaces:**
- Consumes: `POST { secret, row: string[] }` from Task 4's function.
- Produces: appends `row` to the "Incidents" sheet tab. No consumer in this plan.

- [ ] **Step 1: Write the Apps Script**

Create `apps-script/Code.gs`:

```javascript
// Google Apps Script web app. Deploy as: Execute as = Me, Who has access = Anyone.
// Set Script Properties: SHEET_ID (the tracking spreadsheet id) and WEBHOOK_SECRET
// (must match Netlify's SHEET_WEBHOOK_SECRET). Create a tab named "Incidents".
function doPost(e) {
  var props = PropertiesService.getScriptProperties();
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: "bad json" });
  }
  if (body.secret !== props.getProperty("WEBHOOK_SECRET")) {
    return json_({ ok: false, error: "forbidden" });
  }
  if (!Array.isArray(body.row)) {
    return json_({ ok: false, error: "row missing" });
  }
  var sheet = SpreadsheetApp
    .openById(props.getProperty("SHEET_ID"))
    .getSheetByName("Incidents");
  sheet.appendRow(body.row);
  return json_({ ok: true });
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

- [ ] **Step 2: Write the deploy doc**

Create `docs/superpowers/DEPLOY-incident-spd-handoff.md`:

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add apps-script/Code.gs docs/superpowers/DEPLOY-incident-spd-handoff.md
git commit -m "feat: Apps Script Sheet endpoint + deployment doc"
```

---

## Self-Review

**Spec coverage:**
- Preserve all form fields → Task 2 keeps `name` attributes; only `action` + script tags change. ✓
- JS submit + confirmation from submitted values → Task 2 (sessionStorage) + Task 3. Note: refined the spec's "background fetch" to "stash-then-native-submit," which is lower-risk and keeps reCAPTCHA/photo upload working. ✓
- Confirmation headline verbatim → Task 3 layout. ✓
- Eligibility verdict (online / phone) + guard-shack number → Task 3 `renderVerdict`. ✓
- Report-type → SPD category mapping → Task 1 `SPD_CATEGORY`. ✓
- Copy-paste packet (per-field + Copy all) → Task 3. ✓
- 911 always shown → Task 3 layout static `report-emergency` paragraph. ✓
- Google Sheet mirror via `submission-created` → Tasks 4 + 5. ✓
- "Needs review" + "SPD Case #" columns reserved for v2 → Task 4 buildRow trailing columns + Task 5 header. ✓
- v2 (email auto-append) → intentionally out of scope for this plan. ✓

**Placeholder scan:** No TBD/TODO; all steps contain real code or exact commands. ✓

**Type consistency:** `computeVerdict`/`buildPacketFields`/`packetToText` signatures match between Task 1 (definition), Task 3 (browser import), and the tests. `buildRow` signature matches between Tasks 4 and 5's contract (12-element array; last two reserved). Field `name` attributes used in `buildRow` match the form's existing `name`s. ✓
```
