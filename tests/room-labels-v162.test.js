import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('room labels show dimensions and clear area on one line with a 75% type scale', () => {
  const source=readFileSync(new URL('../src/react/screens/PlanScreen.jsx',import.meta.url),'utf8');
  assert.match(source,/const fittedMetaSize = roomLabelNameSize \* \.75/);
  assert.match(source,/const clearArea = clearAreas\.rooms\[room\.id\]\?\.clearArea/);
  assert.match(source,/formatNumber\(clearArea,2\)\} м²/);
  assert.match(source,/className="room-dimensions room-area"[^\n]+\{dimensionsLabel\}/);
  assert.doesNotMatch(source,/className="room-area"[^\n]*м² в свету/);
});

test('draft and selected room labels have no text stroke', () => {
  const css=readFileSync(new URL('../src/react/styles/app.css',import.meta.url),'utf8');
  assert.match(css,/\.draft-room-dimensions \.draft-room-summary\s*\{[^}]*stroke: none;[^}]*stroke-width: 0;/);
  assert.match(css,/\.room-label-object text, \.room-label-object.selected text\s*\{[^}]*stroke: none;[^}]*stroke-width: 0;/);
});
