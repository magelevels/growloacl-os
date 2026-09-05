import { validateAuditRequest } from "./validation.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};
const MAX_BODY_BYTES = 12_000;
const LEAD_STATUSES = new Set(["new", "contacted", "qualified", "closed", "archived"]);
const PRIORITIES = new Set(["low", "normal", "high"]);

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

function cleanAdminText(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

async function tokensMatch(a, b) {
  if (!a || !b) return false;
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const aa = new Uint8Array(ha);
  const bb = new Uint8Array(hb);
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i += 1) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

async function requireAdmin(request, env) {
  if (!env.ADMIN_TOKEN) return json({ error: "Admin access is not configured." }, 503);
  const auth = request.headers.get("authorization") || "";
  const supplied = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!(await tokensMatch(supplied, env.ADMIN_TOKEN))) {
    return json({ error: "Unauthorized." }, 401, { "www-authenticate": "Bearer" });
  }
  return null;
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

async function listLeads(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  if (!env.DB) return json({ error: "Lead storage is not configured." }, 503);

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const query = cleanAdminText(url.searchParams.get("q") || "", 100);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 200);

  const where = [];
  const binds = [];
  if (status && LEAD_STATUSES.has(status)) {
    where.push("status = ?");
    binds.push(status);
  }
  if (query) {
    where.push("(business_name LIKE ? OR contact_name LIKE ? OR email LIKE ? OR location LIKE ?)");
    const like = `%${query.replace(/[%_]/g, "")} %`.replace(" %", "%");
    binds.push(like, like, like, like);
  }

  const sql = `SELECT id, created_at, contact_name, email, business_name, business_type, location, website,
    growth_challenge, monthly_customers, consent_version, status,
    COALESCE(priority, 'normal') AS priority, COALESCE(notes, '') AS notes,
    COALESCE(next_action, '') AS next_action, updated_at
    FROM leads ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY CASE COALESCE(priority, 'normal') WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
      datetime(created_at) DESC LIMIT ?`;
  binds.push(limit);

  try {
    const result = await env.DB.prepare(sql).bind(...binds).all();
    return json({ ok: true, leads: result.results || [] });
  } catch (error) {
    console.error(JSON.stringify({ event: "admin_leads_list_failed", message: error instanceof Error ? error.message : "unknown" }));
    return json({ error: "Could not load leads." }, 500);
  }
}

async function updateLead(request, env, id) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  if (!env.DB) return json({ error: "Lead storage is not configured." }, 503);

  let body;
  try {
    body = await readJson(request);
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  const updates = [];
  const binds = [];
  if (Object.hasOwn(body, "status")) {
    if (!LEAD_STATUSES.has(body.status)) return json({ error: "Invalid lead status." }, 422);
    updates.push("status = ?");
    binds.push(body.status);
  }
  if (Object.hasOwn(body, "priority")) {
    if (!PRIORITIES.has(body.priority)) return json({ error: "Invalid priority." }, 422);
    updates.push("priority = ?");
    binds.push(body.priority);
  }
  if (Object.hasOwn(body, "notes")) {
    updates.push("notes = ?");
    binds.push(cleanAdminText(body.notes, 4000));
  }
  if (Object.hasOwn(body, "nextAction")) {
    updates.push("next_action = ?");
    binds.push(cleanAdminText(body.nextAction, 500));
  }
  if (!updates.length) return json({ error: "Nothing to update." }, 422);

  updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
  binds.push(id);

  try {
    const result = await env.DB.prepare(`UPDATE leads SET ${updates.join(", ")} WHERE id = ?`).bind(...binds).run();
    if (!result.meta?.changes) return json({ error: "Lead not found." }, 404);
    return json({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({ event: "admin_lead_update_failed", message: error instanceof Error ? error.message : "unknown" }));
    return json({ error: "Could not update the lead." }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/audit-request") {
      if (request.method === "POST") return createAuditRequest(request, env);
      return json({ error: "Method not allowed." }, 405, { allow: "POST" });
    }
    if (url.pathname === "/api/admin/leads") {
      if (request.method === "GET") return listLeads(request, env);
      return json({ error: "Method not allowed." }, 405, { allow: "GET" });
    }
    const leadMatch = url.pathname.match(/^\/api\/admin\/leads\/([0-9a-f-]{36})$/i);
    if (leadMatch) {
      if (request.method === "PATCH") return updateLead(request, env, leadMatch[1]);
      return json({ error: "Method not allowed." }, 405, { allow: "PATCH" });
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found." }, 404);
    return env.ASSETS.fetch(request);
  },
};
