const AUTH_SESSION_KEY = "growlocal_supabase_session";
const $auth = selector => document.querySelector(selector);
const authGate = $auth("#authGate");
const appShell = document.querySelector(".shell");
const authForm = $auth("#authForm");
const authEmail = $auth("#authEmail");
const authSubmit = $auth("#authSubmit");
const authStatus = $auth("#authStatus");
const accountCard = $auth("#accountCard");
const accountEmail = $auth("#accountEmail");
const authSignout = $auth("#authSignout");

let config = null;
let session = null;
let busy = false;

function message(text, tone = "") {
  authStatus.textContent = text;
  authStatus.dataset.tone = tone;
}

function readSession() {
  try {
    const value = JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || "null");
    return value && typeof value === "object" && typeof value.access_token === "string" ? value : null;
  } catch {
    return null;
  }
}

function saveSession(value) {
  session = value;
  if (value) localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(value));
  else localStorage.removeItem(AUTH_SESSION_KEY);
}

function readRedirectSession() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (!accessToken || !refreshToken || accessToken.length > 4096 || refreshToken.length > 4096) return null;
  const expiresIn = Number(hash.get("expires_in")) || 3600;
  history.replaceState(null, "", `${location.pathname}${location.search}`);
  return { access_token: accessToken, refresh_token: refreshToken, expires_at: Math.floor(Date.now() / 1000) + expiresIn };
}

async function loadConfig() {
  const response = await fetch("/api/auth/config", { headers: { accept: "application/json" } });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.url || !body?.anonKey) throw new Error(body?.error || "Client sign-in is not configured.");
  return body;
}

async function refresh() {
  if (!session?.refresh_token) return false;
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { accept: "application/json", apikey: config.anonKey, "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.access_token) return false;
  saveSession({ ...body, expires_at: Math.floor(Date.now() / 1000) + (Number(body.expires_in) || 3600) });
  return true;
}

async function verify() {
  if (!session?.access_token) return null;
  let response = await fetch("/api/client/session", { headers: { accept: "application/json", authorization: `Bearer ${session.access_token}` } });
  if (response.status === 401 && await refresh()) {
    response = await fetch("/api/client/session", { headers: { accept: "application/json", authorization: `Bearer ${session.access_token}` } });
  }
  if (!response.ok) return null;
  const body = await response.json().catch(() => null);
  return body?.user || null;
}

async function clientApi(path, options = {}) {
  if (!session?.access_token) throw new Error("Sign-in required.");
  const send = () => fetch(path, { ...options, headers: { accept: "application/json", ...(options.body ? { "content-type": "application/json" } : {}), authorization: `Bearer ${session.access_token}`, ...(options.headers || {}) } });
  let response = await send();
  if (response.status === 401 && await refresh()) response = await send();
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || "Workspace request failed.");
  return body;
}

function showSignedIn(user) {
  accountEmail.textContent = user.email || "your invited account";
  accountCard.hidden = false;
  authGate.hidden = true;
  appShell.hidden = false;
  document.documentElement.classList.remove("auth-pending");
  window.growlocalClientUser = user;
  window.growlocalClientApi = {
    getWorkspace: () => clientApi("/api/client/workspace"),
    saveWorkspace: workspace => clientApi("/api/client/workspace", { method: "PUT", body: JSON.stringify(workspace) }),
  };
}

function showSignedOut(text = "") {
  window.growlocalClientApi = null;
  window.growlocalClientUser = null;
  accountCard.hidden = true;
  authGate.hidden = false;
  appShell.hidden = true;
  document.documentElement.classList.remove("auth-pending");
  if (text) message(text);
}

async function sendMagicLink(event) {
  event.preventDefault();
  if (busy || !config) return;
  const email = authEmail.value.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    message("Enter a valid work email address.", "error");
    authEmail.focus();
    return;
  }
  busy = true;
  authSubmit.disabled = true;
  message("Sending your secure sign-in link…");
  try {
    const response = await fetch(`${config.url}/auth/v1/otp`, {
      method: "POST",
      headers: { accept: "application/json", apikey: config.anonKey, "content-type": "application/json" },
      body: JSON.stringify({ email, create_user: false, options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/app/` } }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.msg || body?.message || "That account could not be signed in.");
    message("Check your inbox for a one-time sign-in link. You can close this tab while it arrives.", "success");
  } catch (error) {
    message(error instanceof Error ? error.message : "We could not send the sign-in link. Try again shortly.", "error");
  } finally {
    busy = false;
    authSubmit.disabled = false;
  }
}

async function signOut() {
  const token = session?.access_token;
  saveSession(null);
  if (config && token) {
    await fetch(`${config.url}/auth/v1/logout`, { method: "POST", headers: { apikey: config.anonKey, authorization: `Bearer ${token}` } }).catch(() => {});
  }
  showSignedOut("You have been signed out.");
}

async function init() {
  document.documentElement.classList.add("auth-pending");
  try {
    config = await loadConfig();
  } catch (error) {
    showSignedOut(error instanceof Error ? error.message : "Client sign-in is not configured.");
    authForm.hidden = true;
    $auth("#authIntro").textContent = "The client sign-in service is being connected. An administrator will let you know when your workspace is ready.";
    return;
  }

  const redirected = readRedirectSession();
  session = redirected || readSession();
  if (redirected) saveSession(redirected);
  if (session && Number(session.expires_at || 0) <= Math.floor(Date.now() / 1000) + 60) await refresh();
  const user = await verify();
  if (user) showSignedIn(user);
  else {
    saveSession(null);
    showSignedOut();
  }
}

authForm.addEventListener("submit", sendMagicLink);
authSignout.addEventListener("click", signOut);
window.growlocalAuthReady = init();
