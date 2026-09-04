import { validateAuditRequest } from "./validation.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};
const MAX_BODY_BYTES = 12_000;

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

async function readJson(request) {
  if (!request.body) throw new SyntaxError("Missing body");
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new RangeError("Request is too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function createAuditRequest(request, env) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) return json({ error: "Send this form as JSON." }, 415);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: "Request is too large." }, 413);

  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    if (error instanceof RangeError) return json({ error: "Request is too large." }, 413);
    return json({ error: "Invalid JSON." }, 400);
  }
  if (body && body.companyWebsite) return json({ ok: true }, 201);

  const result = validateAuditRequest(body);
  if (!result.ok) return json({ error: "Please check the highlighted fields.", fields: result.errors }, 422);
  if (!env.DB) return json({ error: "Lead storage is not configured." }, 503);

  const id = crypto.randomUUID();
  const d = result.data;
  try {
    await env.DB.prepare(`INSERT INTO leads
      (id, contact_name, email, business_name, business_type, location, website, growth_challenge, monthly_customers, consent_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, d.contactName, d.email, d.businessName, d.businessType, d.location, d.website, d.growthChallenge, d.monthlyCustomers, "2026-09-04-v1")
      .run();
    console.log(JSON.stringify({ event: "audit_request_created", leadId: id }));
    return json({ ok: true, reference: id.slice(0, 8) }, 201);
  } catch (error) {
    console.error(JSON.stringify({ event: "audit_request_failed", message: error instanceof Error ? error.message : "unknown" }));
    return json({ error: "We could not save your request. Please try again shortly." }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/audit-request") {
      if (request.method === "POST") return createAuditRequest(request, env);
      return json({ error: "Method not allowed." }, 405, { allow: "POST" });
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found." }, 404);
    return env.ASSETS.fetch(request);
  },
};
