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
  assert.equal((script.match(/role="tab"/g) || []).length, 3);
  assert.equal((script.match(/aria-selected="false" tabindex="-1"/g) || []).length, 3);
  assert.equal((script.match(/role="tabpanel"[^>]*tabindex="0"/g) || []).length, 3);
});

test('public homepage includes a safe, accessible entry transition', () => {
  const page = read('public/index.html');
  const loader = read('public/loader.js');

  assert.match(page, /id="site-loader"/);
  assert.match(page, /role="status"/);
  assert.match(page, /aria-label="Loading GrowLocal"/);
  assert.match(loader, /prefers-reduced-motion/);
  assert.match(loader, /minimumDisplay = 760/);
  assert.match(loader, /3200/);
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
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /Strict-Transport-Security: max-age=31536000; includeSubDomains/);
  assert.match(headers, /Cross-Origin-Resource-Policy: same-origin/);
  assert.match(headers, /Origin-Agent-Cluster: \?1/);
  assert.match(headers, /X-DNS-Prefetch-Control: off/);
  assert.match(headers, /X-Permitted-Cross-Domain-Policies: none/);
  assert.match(headers, /script-src 'self' https:\/\/challenges\.cloudflare\.com/);
  assert.match(headers, /connect-src 'self' https:\/\/challenges\.cloudflare\.com/);
  assert.match(headers, /frame-src https:\/\/challenges\.cloudflare\.com/);
  assert.match(page, /<script src="\/js-flag\.js"><\/script>/);
  assert.match(page, /src="https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js"/);
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
  for (const path of ['public/app/app.js', 'public/admin/admin.js']) {
    assert.doesNotMatch(read(path), /\sstyle="/);
  }
});
