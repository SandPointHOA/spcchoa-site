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
    box.innerHTML =
      `<p>⚠️ <strong>Please call the Seattle Police non-emergency line: ` +
      `<a href="tel:${SPD_NONEMERGENCY}">${SPD_NONEMERGENCY}</a>.</strong> ` +
      `This type of report isn't accepted through SPD's online system. ` +
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
