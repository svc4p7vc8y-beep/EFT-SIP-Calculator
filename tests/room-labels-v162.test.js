import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('room labels put clear area below dimensions at the room-name type scale', () => {
  const source=readFileSync(new URL('../src/react/screens/PlanScreen.jsx',import.meta.url),'utf8');
  assert.match(source,/const fittedMetaSize = roomLabelNameSize \* \.75/);
  assert.match(source,/const clearArea = clearAreas\.rooms\[room\.id\]\?\.clearArea/);
  assert.match(source,/formatNumber\(clearArea,2\)\} м²/);
  assert.match(source,/className="room-dimensions"[^\n]+\{dimensionsLabel\}/);
  assert.match(source,/className="room-area" style=\{\{ fontSize: roomLabelNameSize \}\}[^\n]+\{areaLabel\}/);
  assert.doesNotMatch(source,/const dimensionsLabel = [^\n]*\(\$\{clearArea/);
  assert.doesNotMatch(source,/className="room-area"[^\n]*м² в свету/);
});

test('draft and selected room labels have no text stroke', () => {
  const css=readFileSync(new URL('../src/react/styles/app.css',import.meta.url),'utf8');
  assert.match(css,/\.draft-room-dimensions \.draft-room-summary\s*\{[^}]*stroke: none;[^}]*stroke-width: 0;/);
  assert.match(css,/\.room-label-object text, \.room-label-object.selected text\s*\{[^}]*stroke: none;[^}]*stroke-width: 0;/);
});
