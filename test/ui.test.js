import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('admin workspace exposes accessible results, errors and tab semantics', () => {
  const page = read('public/admin/index.html');
  const script = read('public/admin/admin.js');

  assert.match(page, /id="errorBox"[^>]*role="alert"[^>]*aria-live="assertive"/);
  assert.match(page, /id="leadList"[^>]*aria-label="Lead inbox results"/);
  assert.match(page, /id="detailPanel"[^>]*aria-label="Lead details"/);
  assert.match(page, /id="momentumCallout"[^>]*aria-live="polite"/);
  assert.equal((script.match(/role="tab"/g) || []).length, 3);
  assert.equal((script.match(/aria-selected="false" tabindex="-1"/g) || []).length, 3);
  assert.equal((script.match(/role="tabpanel"[^>]*tabindex="0"/g) || []).length, 3);
  assert.match(script, /MOMENTUM CHECK/);
  assert.match(script, /Review unscheduled leads/);
  assert.match(script, /recommended_next_move/);
  assert.match(script, /id="useSuggestedMove"/);
});

test('public homepage states the GrowLocal difference clearly', () => {
  const page = read('public/index.html');
  assert.match(page, /id="difference"/);
  assert.match(page, /Every recommendation ends with a next move/);
  assert.match(page, /one measurable next move/);
  assert.match(page, /SPOT THE SIGNAL/);
  assert.match(page, /NAME THE MOVE/);
  assert.match(page, /PROVE THE PROGRESS/);
});

test('shared sign-in page separates client and admin workspaces', () => {
  const page = read('public/login/index.html');
  const styles = read('public/login/login.css');
  assert.match(page, /id="login-title"/);
  assert.match(page, /href="\/app\/"/);
  assert.match(page, /href="\/admin\/"/);
  assert.match(page, /Client workspace/);
  assert.match(page, /Admin workspace/);
  assert.match(styles, /login-option--client/);
  assert.match(styles, /login-option--admin/);
});

test('client workspace gates access behind Supabase magic-link auth', () => {
  const page = read('public/app/index.html');
  const auth = read('public/app/auth.js');
  assert.match(page, /id="authGate"/);
  assert.match(page, /id="authForm"/);
  assert.match(page, /id="authEmail"/);
  assert.match(page, /id="authSignout"/);
  assert.match(page, /src="\/app\/auth\.js"/);
  assert.match(auth, /\/api\/auth\/config/);
  assert.match(auth, /\/api\/client\/session/);
  assert.match(auth, /\/api\/client\/workspace/);
  assert.match(read('public/app/app.js'), /hydrateWorkspace/);
  assert.match(auth, /shouldCreateUser: false/);
});

test('public homepage includes a safe, accessible entry transition', () => {
  const page = read('public/index.html');
  const loader = read('public/loader.js');

  assert.match(page, /id="site-loader"/);
  assert.match(page, /role="status"/);
  assert.match(page, /aria-label="Loading GrowLocal"/);
  assert.match(loader, /prefers-reduced-motion/);
  assert.match(loader, /minimumDisplay = 320/);
  assert.match(loader, /1600/);
  assert.match(loader, /DOMContentLoaded/);
  assert.match(loader, /aria-hidden/);
});

test('public assets enforce a strict script policy without inline handlers', () => {
  const headers = read('public/_headers');
  const page = read('public/index.html');
  const flag = read('public/js-flag.js');
  const demo = read('public/app/index.html');
  const app = read('public/app/app.js');

  assert.match(headers, /Content-Security-Policy: default-src 'self';/);
  assert.doesNotMatch(headers, /style-src[^\n]*unsafe-inline/);
  assert.match(headers, /Referrer-Policy: no-referrer/);
  assert.match(headers, /X-Download-Options: noopen/);
  assert.match(headers, /script-src-attr 'none'/);
  assert.match(headers, /style-src-attr 'none'/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /Strict-Transport-Security: max-age=31536000; includeSubDomains/);
  assert.match(headers, /Cross-Origin-Resource-Policy: same-origin/);
  assert.match(read('public/styles.css'), /content-visibility:\s*auto/);
  assert.match(headers, /Origin-Agent-Cluster: \?1/);
  assert.match(headers, /X-DNS-Prefetch-Control: off/);
  assert.match(headers, /X-Permitted-Cross-Domain-Policies: none/);
  assert.match(headers, /script-src 'self' https:\/\/challenges\.cloudflare\.com/);
  assert.match(headers, /connect-src 'self' https:\/\/challenges\.cloudflare\.com https:\/\/\*\.supabase\.co/);
  assert.match(headers, /frame-src https:\/\/challenges\.cloudflare\.com/);
  assert.match(page, /<script src="\/js-flag\.js"><\/script>/);
  assert.match(page, /<script src="\/turnstile\.js" defer><\/script>/);
  assert.match(read('public/turnstile.js'), /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/);
  assert.match(page, /class="cf-turnstile"[^>]*data-action="audit"/);
  assert.doesNotMatch(page, /<script>[^<]/);
  assert.match(flag, /document\.documentElement\.classList\.add\("js"\)/);
  assert.match(demo, /id="printReportBtn"/);
  assert.doesNotMatch(demo, /onclick="/);
  assert.doesNotMatch(demo, /style="/);
  assert.match(app, /#printReportBtn.*window\.print/);
});

test('all shipped HTML and scripts avoid inline style and event attributes', () => {
  for (const path of ['public/index.html', 'public/404.html', 'public/app/index.html', 'public/admin/index.html', 'public/privacy/index.html', 'public/terms/index.html']) {
    assert.doesNotMatch(read(path), /\sstyle="/);
  }
  for (const path of ['public/app/app.js', 'public/app/auth.js', 'public/admin/admin.js']) {
    assert.doesNotMatch(read(path), /\sstyle="/);
  }
});
