import { validateAuditRequest } from "./validation.js";
import { STAGES, STAGE_SQL, SALES_COLUMNS, validateLeadUpdate, enrichLead } from "./sales.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "origin-agent-cluster": "?1",
  "x-dns-prefetch-control": "off",
  "x-permitted-cross-domain-policies": "none",
};
const MAX_BODY_BYTES = 12_000;
const MAX_TURNSTILE_TOKEN_BYTES = 2_048;
const LEAD_STATUSES = new Set(STAGES);
const RATE_LIMIT_RETRY_AFTER_SECONDS = 60;
const MAX_CLIENT_TOKEN_BYTES = 4096;
const MAX_CLIENT_WORKSPACE_BYTES = 64_000;

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

function requestOriginAllowed(request) {
  const fetchSite = (request.headers.get("sec-fetch-site") || "").toLowerCase();
  if (fetchSite === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function isProtectedApiPath(pathname) {
  return pathname === "/api/audit-request" || pathname === "/api/client/session" || pathname === "/api/client/workspace" || pathname === "/api/admin" || pathname.startsWith("/api/admin/");
}

async function enforceRateLimit(request, env, pathname) {
  const limiter = pathname === "/api/audit-request" ? env.AUDIT_RATE_LIMITER : pathname === "/api/client/session" || pathname === "/api/client/workspace" ? env.CLIENT_RATE_LIMITER : env.ADMIN_RATE_LIMITER;
  if (!limiter) return null;

  // Cloudflare supplies this header at the edge. Never fall back to a
  // client-controlled forwarding header for the abuse-control key.
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const key = `${pathname}:${ip}`;
  try {
    const result = await limiter.limit({ key });
    if (result?.success !== false) return null;
  } catch (error) {
    // Fail closed if Cloudflare cannot answer the abuse-control check. This
    // protects the write and admin surfaces during a binding incident rather
    // than silently bypassing the control.
    console.error(JSON.stringify({ event: "rate_limit_check_failed", path: pathname, message: error instanceof Error ? error.message : "unknown" }));
    return json({ error: "Security controls are temporarily unavailable. Please try again shortly." }, 503, {
      "retry-after": String(RATE_LIMIT_RETRY_AFTER_SECONDS),
      "vary": "Origin, Sec-Fetch-Site",
    });
  }
  return json({ error: "Too many requests. Please try again shortly." }, 429, {
    "retry-after": String(RATE_LIMIT_RETRY_AFTER_SECONDS),
    "vary": "Origin, Sec-Fetch-Site",
  });
}

async function readJson(request, maxBytes = MAX_BODY_BYTES) {
  if (!request.body) throw new SyntaxError("Missing body");
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
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
  if (supplied.length > 256) return json({ error: "Unauthorized." }, 401, { "www-authenticate": "Bearer" });
  if (!(await tokensMatch(supplied, env.ADMIN_TOKEN))) {
    return json({ error: "Unauthorized." }, 401, { "www-authenticate": "Bearer" });
  }
  return null;
}

function supabaseConfig(env) {
  const url = typeof env.SUPABASE_URL === "string" ? env.SUPABASE_URL.trim().replace(/\/$/, "") : "";
  const anonKey = typeof env.SUPABASE_ANON_KEY === "string" ? env.SUPABASE_ANON_KEY.trim() : "";
  if (!url || !anonKey) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { url, anonKey };
}

function authConfig(env) {
  const config = supabaseConfig(env);
  if (!config) return json({ error: "Client sign-in is not configured." }, 503);
  // The publishable/anon key is intentionally public. It is safe to expose
  // only alongside Supabase's RLS and server-side session checks.
  return json({ ok: true, url: config.url, anonKey: config.anonKey });
}

async function requireClient(request, env) {
  const config = supabaseConfig(env);
  if (!config) return { response: json({ error: "Client sign-in is not configured." }, 503) };
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token.length > MAX_CLIENT_TOKEN_BYTES) return { response: json({ error: "Sign-in required." }, 401, { "www-authenticate": "Bearer" }) };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${config.url}/auth/v1/user`, {
      headers: { accept: "application/json", apikey: config.anonKey, authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) return { response: json({ error: "Sign-in required." }, 401, { "www-authenticate": "Bearer" }) };
    if (!response.ok) return { response: json({ error: "Client sign-in is temporarily unavailable." }, 503) };
    const user = await response.json().catch(() => null);
    if (!user?.id) return { response: json({ error: "Sign-in required." }, 401, { "www-authenticate": "Bearer" }) };
    return { user: { id: String(user.id), email: typeof user.email === "string" ? user.email : "" } };
  } catch {
    return { response: json({ error: "Client sign-in is temporarily unavailable." }, 503) };
  } finally {
    clearTimeout(timeout);
  }
}

function parseWorkspaceJson(value, fallback) {
  try {
    const parsed = JSON.parse(value || "");
    return parsed && typeof parsed === "object" && Array.isArray(parsed) === Array.isArray(fallback) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function validateClientWorkspace(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Invalid workspace." };
  const client = body.client;
  if (!client || typeof client !== "object" || Array.isArray(client)) return { error: "Client details are required." };
  const clean = (value, max) => typeof value === "string" ? value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
  const normalisedClient = {
    businessName: clean(client.businessName, 120),
    businessType: clean(client.businessType, 100),
    businessLocation: clean(client.businessLocation, 120),
    primaryGoal: clean(client.primaryGoal, 80),
    usp: clean(client.usp, 1_000),
  };
  if (!normalisedClient.businessName) return { error: "Business name is required." };
  const planDone = body.planDone && typeof body.planDone === "object" && !Array.isArray(body.planDone) ? body.planDone : {};
  const safePlanDone = Object.fromEntries(Object.entries(planDone).slice(0, 100).map(([key, value]) => [clean(key, 40), value === true]));
  const leads = Array.isArray(body.leads) ? body.leads.slice(0, 200).map(lead => ({
    name: clean(lead?.name, 120),
    stage: clean(lead?.stage, 40),
    value: Number.isFinite(Number(lead?.value)) ? Math.max(0, Math.min(100000000, Number(lead.value))) : 0,
  })).filter(lead => lead.name) : [];
  return { data: { client: normalisedClient, planDone: safePlanDone, leads } };
}

async function getClientWorkspace(env, userId) {
  if (!env.DB) return json({ error: "Client storage is not configured." }, 503);
  try {
    const row = await env.DB.prepare("SELECT business_name, business_type, business_location, primary_goal, usp, plan_done, leads FROM client_workspaces WHERE user_id = ?").bind(userId).first();
    if (!row) return json({ ok: true, workspace: null });
    return json({ ok: true, workspace: {
      client: { businessName: row.business_name, businessType: row.business_type, businessLocation: row.business_location, primaryGoal: row.primary_goal, usp: row.usp },
      planDone: parseWorkspaceJson(row.plan_done, {}),
      leads: parseWorkspaceJson(row.leads, []),
    } });
  } catch (error) {
    console.error(JSON.stringify({ event: "client_workspace_read_failed", message: error instanceof Error ? error.message : "unknown" }));
    return json({ error: "Could not load your workspace." }, 500);
  }
}

async function saveClientWorkspace(request, env, userId) {
  if (!env.DB) return json({ error: "Client storage is not configured." }, 503);
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return json({ error: "Send JSON." }, 415);
  let body;
  try { body = await readJson(request, MAX_CLIENT_WORKSPACE_BYTES); }
  catch (error) { return json({ error: error instanceof RangeError ? "Request is too large." : "Invalid JSON." }, error instanceof RangeError ? 413 : 400); }
  const validated = validateClientWorkspace(body);
  if (validated.error) return json({ error: validated.error }, 422);
  const { client, planDone, leads } = validated.data;
  try {
    await env.DB.prepare(`INSERT INTO client_workspaces
      (user_id, business_name, business_type, business_location, primary_goal, usp, plan_done, leads)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET business_name = excluded.business_name, business_type = excluded.business_type,
      business_location = excluded.business_location, primary_goal = excluded.primary_goal, usp = excluded.usp,
      plan_done = excluded.plan_done, leads = excluded.leads, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`)
      .bind(userId, client.businessName, client.businessType, client.businessLocation, client.primaryGoal, client.usp, JSON.stringify(planDone), JSON.stringify(leads))
      .run();
    return json({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({ event: "client_workspace_write_failed", message: error instanceof Error ? error.message : "unknown" }));
    return json({ error: "Could not save your workspace." }, 500);
  }
}

async function verifyTurnstile(request, token, secret) {
  if (typeof token !== "string" || !token || token.length > MAX_TURNSTILE_TOKEN_BYTES) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        remoteip: request.headers.get("cf-connecting-ip") || undefined,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const result = await response.json().catch(() => null);
    const hostname = new URL(request.url).hostname;
    return result?.success === true && result.action === "audit" && result.hostname === hostname;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
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

  if (env.TURNSTILE_SECRET && !(await verifyTurnstile(request, body?.turnstileToken, env.TURNSTILE_SECRET))) {
    return json({ error: "Please complete the security check and try again." }, 403);
  }

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
  if (!env.DB) return json({ error: "Lead storage is not configured." }, 503);

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const view = url.searchParams.get("view") || "all";
  const sort = url.searchParams.get("sort") || "priority";
  const openStage = `${STAGE_SQL} NOT IN ('won','lost','archived')`;
  const views = {
    all: "", open: openStage,
    overdue: `${openStage} AND next_action_date <> '' AND next_action_date < date('now')`,
    today: `${openStage} AND next_action_date = date('now')`,
    unscheduled: `${openStage} AND (next_action_date IS NULL OR next_action_date = '' OR trim(next_action) = '')`,
    proposals: `${openStage} AND proposal_status = 'sent'`,
  };
  const sorts = {
    priority: "CASE COALESCE(priority, 'normal') WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, datetime(created_at) DESC, id",
    due: "CASE WHEN next_action_date IS NULL OR next_action_date = '' THEN 1 ELSE 0 END, next_action_date, id",
    value: `(setup_fee + 12 * monthly_value) * CASE WHEN ${STAGE_SQL} = 'won' THEN 100 WHEN ${STAGE_SQL} IN ('lost','archived') THEN 0 ELSE probability END DESC, id`,
    newest: "datetime(created_at) DESC, id",
  };
  if (!Object.hasOwn(views, view) || !Object.hasOwn(sorts, sort)) return json({ error: "Invalid view or sort." }, 422);
  const query = cleanAdminText(url.searchParams.get("q") || "", 100);
  const limit = Number(url.searchParams.get("limit") || 100);
  const offset = Number(url.searchParams.get("offset") || 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isInteger(offset) || offset < 0 || offset > 10000000) return json({ error: "Invalid pagination." }, 422);
  if (status && !LEAD_STATUSES.has(status)) return json({ error: "Invalid status filter." }, 422);

  const where = [];
  const binds = [];
  if (views[view]) where.push(`(${views[view]})`);
  if (status && LEAD_STATUSES.has(status)) {
    where.push(`${STAGE_SQL} = ?`);
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
    COALESCE(next_action, '') AS next_action, COALESCE(updated_at, created_at) AS updated_at, ${SALES_COLUMNS}
    FROM leads ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY ${sorts[sort]} LIMIT ? OFFSET ?`;
  binds.push(limit, offset);

  try {
    const result = await env.DB.prepare(sql).bind(...binds).all();
    return json({ ok: true, leads: (result.results || []).map(enrichLead), hasMore: (result.results || []).length === limit });
  } catch (error) {
    console.error(JSON.stringify({ event: "admin_leads_list_failed", message: error instanceof Error ? error.message : "unknown" }));
    return json({ error: "Could not load leads." }, 500);
  }
}

async function updateLead(request, env, id) {
  if (!env.DB) return json({ error: "Lead storage is not configured." }, 503);

  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return json({ error: "Send JSON." }, 415);
  let body;
  try { body = await readJson(request, 64_000); }
  catch (error) { return json({ error: error instanceof RangeError ? "Request is too large." : "Invalid JSON." }, error instanceof RangeError ? 413 : 400); }
  const validated = validateLeadUpdate(body);
  if (validated.error) return json({ error: validated.error }, 422);
  const updates = Object.keys(validated.data).map(column => `${column} = ?`);
  const binds = Object.values(validated.data);
  const expectedUpdatedAt = request.headers.get("if-match")?.trim() || "";

  // Keep the timestamp readable while adding entropy so two rapid saves still
  // receive different optimistic-lock versions.
  updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now') || printf('%04dZ', abs(random()) % 10000)");
  binds.push(id);
  if (expectedUpdatedAt) binds.push(expectedUpdatedAt);

  try {
    const where = expectedUpdatedAt ? "WHERE id = ? AND COALESCE(updated_at, created_at) = ?" : "WHERE id = ?";
    const result = await env.DB.prepare(`UPDATE leads SET ${updates.join(", ")} ${where}`).bind(...binds).run();
    if (!result.meta?.changes) {
      if (!expectedUpdatedAt) return json({ error: "Lead not found." }, 404);
      const current = await env.DB.prepare("SELECT id FROM leads WHERE id = ?").bind(id).first();
      return current ? json({ error: "This lead changed in another session. Refresh before saving." }, 409) : json({ error: "Lead not found." }, 404);
    }
    return json({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({ event: "admin_lead_update_failed", message: error instanceof Error ? error.message : "unknown" }));
    return json({ error: "Could not update the lead." }, 500);
  }
}

async function salesSummary(env) {
  if (!env.DB) return json({ error: "Lead storage is not configured." }, 503);
  try {
    const result = await env.DB.prepare(`SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN stage = 'new' THEN 1 ELSE 0 END), 0) AS new_count,
      COALESCE(SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END), 0) AS high_count,
      COALESCE(SUM(CASE WHEN stage NOT IN ('won','lost','archived') THEN setup_fee + 12 * monthly_value ELSE 0 END), 0) AS pipeline_value,
      COALESCE(SUM(CASE WHEN stage NOT IN ('won','lost','archived') THEN (setup_fee + 12 * monthly_value) * probability / 100.0 ELSE 0 END), 0) AS expected_value,
      COALESCE(SUM(CASE WHEN stage = 'won' THEN setup_fee ELSE 0 END), 0) AS won_setup,
      COALESCE(SUM(CASE WHEN stage = 'won' THEN monthly_value ELSE 0 END), 0) AS won_mrr,
      COALESCE(SUM(CASE WHEN stage NOT IN ('won','lost','archived') AND next_action_date <> '' AND next_action_date < date('now') THEN 1 ELSE 0 END), 0) AS overdue,
      COALESCE(SUM(CASE WHEN stage NOT IN ('won','lost','archived') AND next_action_date = date('now') THEN 1 ELSE 0 END), 0) AS due_today,
      COALESCE(SUM(CASE WHEN stage NOT IN ('won','lost','archived') AND (next_action_date IS NULL OR next_action_date = '' OR trim(next_action) = '') THEN 1 ELSE 0 END), 0) AS unscheduled,
      COALESCE(SUM(CASE WHEN stage NOT IN ('won','lost','archived') AND proposal_status = 'sent' THEN 1 ELSE 0 END), 0) AS sent_proposals,
      ${STAGES.map(stage => `COALESCE(SUM(CASE WHEN stage = '${stage}' THEN 1 ELSE 0 END), 0) AS stage_${stage}`).join(', ')}
      FROM (SELECT *, ${STAGE_SQL} AS stage FROM leads)`).first();
    return json({ ok: true, summary: result });
  } catch { return json({ error: "Could not load sales summary. Check the V11 migration has been applied." }, 500); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (isProtectedApiPath(url.pathname) && !requestOriginAllowed(request)) {
      return json({ error: "Cross-site requests are not allowed." }, 403, { vary: "Origin, Sec-Fetch-Site" });
    }
    if (isProtectedApiPath(url.pathname)) {
      const limited = await enforceRateLimit(request, env, url.pathname === "/api/audit-request" ? url.pathname : "/api/admin");
      if (limited) return limited;
    }
    if (url.pathname === "/api/admin" || url.pathname.startsWith("/api/admin/")) {
      const denied = await requireAdmin(request, env);
      if (denied) return denied;
    }
    if (url.pathname === "/api/auth/config") {
      if (request.method === "GET") return authConfig(env);
      return json({ error: "Method not allowed." }, 405, { allow: "GET" });
    }
    if (url.pathname === "/api/client/session" || url.pathname === "/api/client/workspace") {
      if (url.pathname === "/api/client/session" && request.method !== "GET") return json({ error: "Method not allowed." }, 405, { allow: "GET" });
      if (url.pathname === "/api/client/workspace" && !["GET", "PUT"].includes(request.method)) return json({ error: "Method not allowed." }, 405, { allow: "GET, PUT" });
      const client = await requireClient(request, env);
      if (client.response) return client.response;
      if (url.pathname === "/api/client/session") return json({ ok: true, user: client.user });
      if (request.method === "GET") return getClientWorkspace(env, client.user.id);
      return saveClientWorkspace(request, env, client.user.id);
    }
    if (url.pathname === "/api/admin/summary") {
      if (request.method === "GET") return salesSummary(env);
      return json({ error: "Method not allowed." }, 405, { allow: "GET" });
    }
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
