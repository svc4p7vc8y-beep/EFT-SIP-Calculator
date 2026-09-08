import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('sidebar navigation remains scrollable on short desktop and mobile viewports', async () => {
  const css = await readFile(new URL('../src/react/styles/app.css', import.meta.url), 'utf8');
  const sidebarRule = css.match(/\.sidebar\s*\{([^}]*)\}/)?.[1] || '';
  const navigationRule = css.match(/\.sidebar nav\s*\{([^}]*)\}/)?.[1] || '';

  assert.match(sidebarRule, /overflow:\s*hidden/);
  assert.match(navigationRule, /flex:\s*1 1 auto/);
  assert.match(navigationRule, /min-height:\s*0/);
  assert.match(navigationRule, /overflow-y:\s*auto/);
  assert.match(navigationRule, /overscroll-behavior:\s*contain/);
});
