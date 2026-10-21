import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APP_VERSION } from '../src/react/data/app-version.js';

test('the visible release number is numeric and comes from the checked app version', () => {
  const app = readFileSync(new URL('../src/react/app/App.jsx', import.meta.url), 'utf8');
  assert.equal(Number.isSafeInteger(APP_VERSION) && APP_VERSION > 263, true);
  assert.match(app, /className="version-badge"[^>]*>Версия \{APP_VERSION\}/);
});
