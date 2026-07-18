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
