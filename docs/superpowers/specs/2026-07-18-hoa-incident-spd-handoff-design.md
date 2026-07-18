# HOA Security Incident → SPD Report Assist — Design

**Date:** 2026-07-18
**Site:** spcchoa.com (Sand Point Country Club HOA — Hugo + Netlify)
**Existing asset:** `layouts/section/security-incident.html` (Netlify Forms, reCAPTCHA, photo upload) posting to `/success`.

## Problem

Residents report neighborhood crime to the HOA via the existing form so the board can
track crime over time. Separately, victims should also file the incident with the Seattle
Police Department. Today that means re-typing everything into SPD's online portal. We want
to (a) keep the HOA's own crime-tracking record, (b) eliminate the duplicate typing by
handing the resident a ready-to-paste packet mapped to SPD's fields, and (c) close the loop
by capturing the SPD case number back into the HOA record.

## Hard constraints (verified 2026-07-18)

- **SPD online reporting has no public API.** It is a third-party hosted portal
  (`spdonlinereporting.seattle.gov`, Coplogic/LexisNexis "Desk Officer" type), a JavaScript
  app that is CAPTCHA-gated and requires the filer to legally attest to the report.
  Programmatic/auto submission is therefore both blocked and legally inappropriate — **the
  resident must click submit themselves.**
- **SPD online filing is limited by incident type and circumstance.** Eligible types:
  property destruction, graffiti, car break-ins (car prowl), theft of auto accessories,
  theft, shoplifting, drug activity, harassing phone calls, credit-card fraud, wage theft,
  identity theft, lost property. Eligible **only if** it is not an emergency, occurred inside
  Seattle city limits, and has **no known suspect / nothing to follow up on**. Everything else
  → SPD non-emergency line **206-625-5011**; emergencies → **911**.

## Who does what

- **Resident** fills the HOA form once, then files their own report with SPD using the
  packet we generate, then forwards their SPD confirmation email to the HOA inbox.
- **HOA board** views accumulated incidents (and their SPD case numbers) in a Google Sheet.

## Architecture

```
Resident → HOA security-incident form (spcchoa.com, Netlify Forms)
   │
   ├─(background POST)→ Netlify Forms submission (stores fields + photo)
   │        └─ submission-created event → Apps Script web app → append row to Google Sheet
   │
   └─→ Enhanced /success confirmation screen (JS renders using submitted values):
          • "Please help our city reduce this type of crime — file this report, with our help."
          • Eligibility verdict (file online / call 206-625-5011 / call 911)
          • Deep link to spdonlinereporting.seattle.gov
          • Copy-paste packet mapped to SPD fields (per-field + Copy all)

Resident files with SPD → forwards SPD confirmation email to HOA Gmail
   └─ (v2) Apps Script time-trigger scans label → parses case # → updates matching Sheet row
```

All automation runs on Google's free Apps Script infrastructure (no server, no Supabase, no
auto-pause). Netlify continues to handle form capture, spam protection, and photo storage.

## Scope — phased

### v1 (this spec drives implementation)

1. **Preserve the existing form unchanged in substance.** Keep every current field: name,
   email, phone, location, date/time, the 7 report-type radios with their descriptions,
   narrative, suspect/vehicle description, the inline "Reported to Police? Case #" field, and
   the optional photo upload. Keep reCAPTCHA and the bot-field honeypot.
   - One change: the form submits via JavaScript (background `fetch` POST to Netlify, using
     the standard `application/x-www-form-urlencoded` / `multipart` Netlify Forms contract),
     so the confirmation screen can render a packet from the just-entered values. If JS is
     disabled, the form falls back to the normal Netlify POST → static `/success`.

2. **Enhanced `/success` confirmation screen** that, from the submitted values:
   - Shows the headline: *"Please help our city reduce this type of crime by filing this
     report — with our help."*
   - Computes an **eligibility verdict**:
     - ✅ *File online* — report type is SPD-online-eligible AND the "Suspect / Vehicle
       Description" field is empty (our proxy for "no known suspect"). Show SPD portal deep
       link + packet.
     - ⚠️ *Call the police non-emergency line 206-625-5011* — the "Suspect / Vehicle
       Description" field is non-empty (possible known suspect → SPD wants follow-up), or the
       type isn't online-eligible (e.g. Residential Burglary, Suspicious Activity/Person).
       When uncertain, route here — it is the safe default.
     - 🚨 *Call 911* — surfaced whenever narrative/type suggests an in-progress or emergency
       situation; always show the 911 reminder prominently regardless.
   - **Report-type → SPD mapping** (HOA type → SPD online category):
     - Theft → Theft
     - Theft of Property Inside a Vehicle (Car Prowl) → Car Break-Ins
     - Theft of Auto Accessories → Theft of Auto Accessories
     - Property Destruction / Vandalism → Property Destruction
     - Graffiti → Graffiti
     - Residential Burglary → *not online-eligible* → non-emergency line
     - Suspicious Activity or Person → *not a filable crime report* → non-emergency line
   - **Copy-paste packet** grouped in SPD field order: Reporter (name, address, phone,
     email) → Incident (date/time, location) → Type → Suspect/Vehicle → Narrative. Each field
     has a copy button; a "Copy all" button copies the whole block.

3. **Google Sheet mirror.** A Netlify `submission-created` webhook posts to an Apps Script
   web-app endpoint that appends one row per submission (all fields + a link to the
   Netlify-hosted photo + a submission timestamp + an empty "SPD Case #" and "Needs review"
   column). The Sheet is the board's system of record for crime tracking.

### v2 (separate spec later)

4. **Email auto-append.** Apps Script time-trigger scans a Gmail label on the HOA
   Google Workspace inbox for forwarded SPD confirmation emails, extracts the case/report
   number, and writes it into the matching Sheet row.
   - **Matching rule:** match on resident email address + report type + nearest incident date.
     Unambiguous → fill "SPD Case #". Ambiguous (same resident, multiple open reports) → write
     the case # into a "Needs review" note for a board member to resolve manually.
   - The inline "Case #" form field remains the always-reliable manual fallback.

## Components & interfaces

- **`layouts/section/security-incident.html`** — form markup + a small inline script for the
  background submit + client-side capture of values into `sessionStorage` for the success page.
- **`/success` page** (`content/` + a layout) — reads the captured values, renders verdict +
  packet. Pure client-side; no secrets.
- **Apps Script web app** (`appendRow`) — accepts Netlify's submission JSON, appends to Sheet.
  Interface: HTTPS POST, shared-secret query param or header for authenticity. Depends on: the
  Google Sheet ID.
- **(v2) Apps Script trigger** (`scanForCaseNumbers`) — time-driven; depends on Gmail label +
  Sheet.

## Error handling

- **JS disabled / fetch fails:** form falls back to native Netlify POST; resident still gets a
  (generic) success page and their data is still stored. Packet convenience is the only loss.
- **Apps Script endpoint down:** Netlify submission is unaffected (data still in Netlify);
  Sheet mirror can be re-run by replaying Netlify submissions. Endpoint validates the shared
  secret and ignores unauthenticated posts.
- **Clipboard API unavailable:** packet is also shown as selectable text so manual copy works.
- **(v2) Unparseable / unmatched SPD email:** left in the Gmail label, and/or logged to a
  "Needs review" row — never silently dropped, never attached to a guessed wrong incident.

## Testing

- Verdict logic: unit-style checks over each report type × suspect-present/absent → expected
  verdict and SPD category.
- Packet rendering: given a known submission, the packet contains every mapped field in order.
- Fallback: with JS disabled, native Netlify submission still succeeds.
- Sheet mirror: a test submission appends exactly one correctly-columned row; a post with a
  bad/missing secret is rejected.
- Manual end-to-end: submit a real test report, confirm Netlify entry + Sheet row + photo link,
  walk the packet into SPD's portal to confirm the field mapping lines up.

## Explicitly out of scope

- Auto-submitting to SPD (no API; CAPTCHA + legal attestation — resident must submit).
- Browser auto-fill of SPD's form (brittle to their markup; can't cross the attest step).
- Supabase / standalone database / custom dashboard (Google Sheet is sufficient at ~25/yr).
- Non-Gmail mailbox handling for v2 (HOA inbox confirmed Gmail/Workspace).
