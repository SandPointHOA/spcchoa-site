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
