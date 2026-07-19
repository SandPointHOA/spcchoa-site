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

test("auto-accessories and vandalism map to their distinct SPD categories", () => {
  const accessories = computeVerdict({ report_type: "Theft of Auto Accessories", suspect: "" });
  assert.equal(accessories.level, "online");
  assert.equal(accessories.spdCategory, "Theft of Auto Accessories");

  const vandalism = computeVerdict({ report_type: "Property Destruction / Vandalism", suspect: "" });
  assert.equal(vandalism.level, "online");
  assert.equal(vandalism.spdCategory, "Property Destruction");
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
