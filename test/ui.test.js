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
