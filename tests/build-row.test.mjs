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
