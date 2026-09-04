import test from "node:test";
import assert from "node:assert/strict";
import { validateAuditRequest } from "../src/validation.js";

const valid = { contactName: " Taylor  Peters ", email: "TEST@Example.COM", businessName: "North Star Café", businessType: "Café", location: "Northampton", website: "example.com", growthChallenge: "We need more repeat customers each month.", monthlyCustomers: "50–149", consent: true };

test("normalises and accepts a complete request", () => {
  const result = validateAuditRequest(valid);
  assert.equal(result.ok, true);
  assert.equal(result.data.contactName, "Taylor Peters");
  assert.equal(result.data.email, "test@example.com");
  assert.equal(result.data.website, "https://example.com/");
});

test("rejects missing consent and invalid fields", () => {
  const result = validateAuditRequest({ ...valid, consent: false, email: "bad", growthChallenge: "short" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.consent);
  assert.ok(result.errors.email);
  assert.ok(result.errors.growthChallenge);
});

test("rejects non-http website URLs", () => {
  const result = validateAuditRequest({ ...valid, website: "javascript:alert(1)" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.website);
});
