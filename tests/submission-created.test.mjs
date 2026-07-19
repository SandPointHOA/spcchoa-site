import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { handler } from "../netlify/functions/submission-created.mjs";

const ORIGINAL_FETCH = globalThis.fetch;
const ENV_KEYS = ["APPS_SCRIPT_URL", "SHEET_WEBHOOK_SECRET"];
const originalEnv = {};
for (const key of ENV_KEYS) originalEnv[key] = process.env[key];

function setEnv() {
  process.env.APPS_SCRIPT_URL = "http://example.test";
  process.env.SHEET_WEBHOOK_SECRET = "s3cret";
}

function clearEnv() {
  delete process.env.APPS_SCRIPT_URL;
  delete process.env.SHEET_WEBHOOK_SECRET;
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
}

const VALID_PAYLOAD = {
  form_name: "security-incident",
  created_at: "2026-07-18T04:00:00.000Z",
  data: {
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "206-555-0000",
    location: "8000 block of Forest Dr NE",
    datetime: "2026-07-17T21:30",
    report_type: "Theft",
    narrative: "Package taken.",
    suspect: "",
    police_case: "",
    attachment: "https://netlify.app/uploads/photo.jpg",
  },
};

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  restoreEnv();
});

test("returns 500 when env vars are unset", async () => {
  clearEnv();
  const res = await handler({ body: JSON.stringify({ payload: VALID_PAYLOAD }) });
  assert.equal(res.statusCode, 500);
});

test("returns 400 when body is not valid JSON", async () => {
  setEnv();
  const res = await handler({ body: "not json" });
  assert.equal(res.statusCode, 400);
});

test("returns 400 when body is valid JSON but has no payload", async () => {
  setEnv();
  const res = await handler({ body: JSON.stringify({}) });
  assert.equal(res.statusCode, 400);
});

test("returns 200 and does not call fetch for other forms (e.g. contact)", async () => {
  setEnv();
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return { ok: true };
  };
  const res = await handler({
    body: JSON.stringify({ payload: { form_name: "contact", data: {} } }),
  });
  assert.equal(res.statusCode, 200);
  assert.equal(called, false);
});

test("returns 200 and posts row when fetch resolves ok", async () => {
  setEnv();
  let callCount = 0;
  let postedBody;
  globalThis.fetch = async (url, options) => {
    callCount += 1;
    postedBody = options.body;
    return { ok: true };
  };
  const res = await handler({ body: JSON.stringify({ payload: VALID_PAYLOAD }) });
  assert.equal(res.statusCode, 200);
  assert.equal(callCount, 1);
  const parsed = JSON.parse(postedBody);
  assert.equal(typeof parsed, "object");
  assert.equal(parsed.secret, "s3cret");
  assert.equal(Array.isArray(parsed.row), true);
  assert.equal(parsed.row.length, 12);
});

test("returns 502 when fetch resolves not-ok", async () => {
  setEnv();
  globalThis.fetch = async () => ({ ok: false });
  const res = await handler({ body: JSON.stringify({ payload: VALID_PAYLOAD }) });
  assert.equal(res.statusCode, 502);
});

test("returns 502 when fetch rejects", async () => {
  setEnv();
  globalThis.fetch = async () => {
    throw new Error("network down");
  };
  const res = await handler({ body: JSON.stringify({ payload: VALID_PAYLOAD }) });
  assert.equal(res.statusCode, 502);
});
