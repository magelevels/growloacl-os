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

function authRequest(path, method = "GET", headers = {}) {
  return new Request(`https://example.test${path}`, { method, headers });
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

function rateLimiter({ success = true, calls = [] } = {}) {
  return {
    async limit(options) {
      calls.push(options);
      return { success };
    },
  };
}

function failingRateLimiter() {
  return { async limit() { throw new Error("binding unavailable"); } };
}

function clientWorkspaceDb(row = null, calls = []) {
  return {
    prepare(sql) {
      return {
        bind(...values) {
          calls.push({ sql, values });
          return {
            async first() { return row; },
            async run() { return { success: true, meta: { changes: 1 } }; },
          };
        },
      };
    },
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
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(response.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
  assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains");
  assert.equal(response.headers.get("origin-agent-cluster"), "?1");
  assert.equal(response.headers.get("x-dns-prefetch-control"), "off");
  assert.equal(response.headers.get("x-permitted-cross-domain-policies"), "none");
});

test("does not expose leads through GET", async () => {
  const response = await worker.fetch(request("GET"), envWithDb());
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
});

test("rate-limits public audit submissions before reading the body", async () => {
  const calls = [];
  const response = await worker.fetch(request("POST", payload), { ...envWithDb(), AUDIT_RATE_LIMITER: rateLimiter({ success: false, calls }) });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.deepEqual(calls, [{ key: "/api/audit-request:unknown" }]);
});

test("rate-limits admin routes before authentication", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/api/admin/leads"), { ...envWithDb(), ADMIN_RATE_LIMITER: rateLimiter({ success: false, calls }) });
  assert.equal(response.status, 429);
  assert.deepEqual(calls, [{ key: "/api/admin:unknown" }]);
});

test("exposes only the configured Supabase public client settings", async () => {
  const missing = await worker.fetch(authRequest("/api/auth/config"), {});
  assert.equal(missing.status, 503);
  const response = await worker.fetch(authRequest("/api/auth/config"), { SUPABASE_URL: "https://project.supabase.co", SUPABASE_ANON_KEY: "anon-key" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, url: "https://project.supabase.co", anonKey: "anon-key" });
});

test("validates a client session with Supabase before returning identity", async () => {
  const originalFetch = globalThis.fetch;
  let called;
  globalThis.fetch = async (input, init) => {
    called = { input, init };
    return new Response(JSON.stringify({ id: "user-1", email: "client@example.com" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(authRequest("/api/client/session", "GET", { authorization: "Bearer access-token" }), {
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_ANON_KEY: "anon-key",
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, user: { id: "user-1", email: "client@example.com" } });
    assert.equal(called.input, "https://project.supabase.co/auth/v1/user");
    assert.equal(called.init.headers.authorization, "Bearer access-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects client sessions without a bearer token", async () => {
  const response = await worker.fetch(authRequest("/api/client/session"), { SUPABASE_URL: "https://project.supabase.co", SUPABASE_ANON_KEY: "anon-key" });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("www-authenticate"), "Bearer");
});

test("scopes client workspace reads and writes to the verified Supabase user", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async () => new Response(JSON.stringify({ id: "user-1", email: "client@example.com" }), { status: 200 });
  try {
    const env = { SUPABASE_URL: "https://project.supabase.co", SUPABASE_ANON_KEY: "anon-key", DB: clientWorkspaceDb(null, calls) };
    const read = await worker.fetch(authRequest("/api/client/workspace", "GET", { authorization: "Bearer access-token" }), env);
    assert.equal(read.status, 200);
    assert.deepEqual(await read.json(), { ok: true, workspace: null });
    const write = await worker.fetch(new Request("https://example.test/api/client/workspace", {
      method: "PUT",
      headers: { authorization: "Bearer access-token", "content-type": "application/json" },
      body: JSON.stringify({ client: { businessName: "Example Café", businessType: "Café", businessLocation: "London", primaryGoal: "Repeat visits", usp: "Friendly" }, planDone: { "0-1": true }, leads: [{ name: "Prospect", stage: "New lead", value: 149 }] }),
    }), env);
    assert.equal(write.status, 200);
    assert.equal(calls[1].values[0], "user-1");
    assert.equal(calls[1].values[1], "Example Café");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses the client rate limiter for authenticated workspace traffic", async () => {
  const originalFetch = globalThis.fetch;
  const clientCalls = [];
  const adminCalls = [];
  globalThis.fetch = async () => new Response(JSON.stringify({ id: "user-1", email: "client@example.com" }), { status: 200 });
  try {
    const response = await worker.fetch(authRequest("/api/client/workspace", "GET", { authorization: "Bearer access-token" }), {
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_ANON_KEY: "anon-key",
      DB: clientWorkspaceDb(),
      CLIENT_RATE_LIMITER: rateLimiter({ calls: clientCalls }),
      ADMIN_RATE_LIMITER: rateLimiter({ calls: adminCalls }),
    });
    assert.equal(response.status, 200);
    assert.equal(clientCalls.length, 1);
    assert.equal(adminCalls.length, 0);
    assert.match(clientCalls[0].key, /^\/api\/client\/workspace:/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fails closed when Cloudflare cannot answer the rate-limit check", async () => {
  const response = await worker.fetch(request("POST", payload), { ...envWithDb(), AUDIT_RATE_LIMITER: failingRateLimiter() });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "60");
});

test("rejects cross-origin audit submissions before writing", async () => {
  const calls = [];
  const response = await worker.fetch(request("POST", payload, { origin: "https://evil.example" }), envWithDb(calls));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "Cross-site requests are not allowed.");
  assert.equal(response.headers.get("vary"), "Origin, Sec-Fetch-Site");
  assert.equal(calls.length, 0);
});

test("rejects fetch metadata that identifies a cross-site request", async () => {
  const response = await worker.fetch(request("GET", undefined, { "sec-fetch-site": "cross-site" }), envWithDb());
  assert.equal(response.status, 403);
});

test("requires Turnstile when the production secret is configured", async () => {
  const response = await worker.fetch(request("POST", payload), { ...envWithDb(), TURNSTILE_SECRET: "test-secret" });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "Please complete the security check and try again.");
});

test("validates Turnstile server-side before creating a lead", async () => {
  const originalFetch = globalThis.fetch;
  let verification;
  globalThis.fetch = async (input, init) => {
    verification = { input, init };
    return new Response(JSON.stringify({ success: true, action: "audit", hostname: "example.test" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const calls = [];
    const response = await worker.fetch(request("POST", { ...payload, turnstileToken: "token" }), { ...envWithDb(calls), TURNSTILE_SECRET: "test-secret" });
    assert.equal(response.status, 201);
    assert.equal(verification.input, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.deepEqual(JSON.parse(verification.init.body), { secret: "test-secret", response: "token" });
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
