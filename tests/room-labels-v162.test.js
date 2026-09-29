import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('room labels keep dimensions and contour area together with a 75% type scale', () => {
  const source=readFileSync(new URL('../src/react/screens/PlanScreen.jsx',import.meta.url),'utf8');
  assert.match(source,/const fittedMetaSize = roomLabelNameSize \* \.75/);
  assert.match(source,/м \(\$\{formatNumber\(polygonArea\(points\),2\)\} м² контур\)/);
  assert.match(source,/className="room-dimensions room-area"[^\n]+\{dimensionsLabel\}/);
  assert.match(source,/м² в свету/);
});

test('draft and selected room labels have no text stroke', () => {
  const css=readFileSync(new URL('../src/react/styles/app.css',import.meta.url),'utf8');
  assert.match(css,/\.draft-room-dimensions \.draft-room-summary\s*\{[^}]*stroke: none;[^}]*stroke-width: 0;/);
  assert.match(css,/\.room-label-object text, \.room-label-object.selected text\s*\{[^}]*stroke: none;[^}]*stroke-width: 0;/);
});
