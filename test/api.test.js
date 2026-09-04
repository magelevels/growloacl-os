import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const payload = {
  contactName: "Test Person",
  email: "test@example.com",
  businessName: "Test Café",
  businessType: "Café",
  location: "Northampton",
  website: "example.com",
  growthChallenge: "We need to improve repeat customer visits.",
  monthlyCustomers: "50–149",
  consent: true,
};

function request(method, body, headers = {}) {
  return new Request("https://example.test/api/audit-request", {
    method,
    headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

function envWithDb(calls = []) {
  return {
    DB: {
      prepare(sql) {
        return {
          bind(...values) {
            calls.push({ sql, values });
            return { async run() { return { success: true }; } };
          },
        };
      },
    },
    ASSETS: { fetch: async () => new Response("asset") },
  };
}

test("creates a lead through the POST-only route", async () => {
  const calls = [];
  const response = await worker.fetch(request("POST", payload), envWithDb(calls));
  const result = await response.json();
  assert.equal(response.status, 201);
  assert.equal(result.ok, true);
  assert.match(result.reference, /^[a-f0-9]{8}$/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].values[2], "test@example.com");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("does not expose leads through GET", async () => {
  const response = await worker.fetch(request("GET"), envWithDb());
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
});

test("rejects malformed and oversized bodies", async () => {
  const malformed = await worker.fetch(request("POST", "{"), envWithDb());
  assert.equal(malformed.status, 400);
  const oversized = await worker.fetch(request("POST", "x".repeat(12_001)), envWithDb());
  assert.equal(oversized.status, 413);
});

test("returns field errors without writing", async () => {
  const calls = [];
  const response = await worker.fetch(request("POST", { ...payload, consent: false, email: "invalid" }), envWithDb(calls));
  const result = await response.json();
  assert.equal(response.status, 422);
  assert.ok(result.fields.email);
  assert.ok(result.fields.consent);
  assert.equal(calls.length, 0);
});

test("quietly absorbs honeypot submissions without D1", async () => {
  const response = await worker.fetch(request("POST", { companyWebsite: "spam.example" }), { ASSETS: { fetch: async () => new Response() } });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true });
});
