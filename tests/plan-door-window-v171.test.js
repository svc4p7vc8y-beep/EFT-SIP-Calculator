import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDefaultProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';

test('panoramic glazing doubles only product and installation prices, not area or shared catalog', () => {
  const project = createDefaultProject();
  project.plan.openings.push({ id: 'wide-window', type: 'window', windowType: 'standard', width: 3, height: 2.5, outer: true });
  const normal = calculateProject(project).lines;
  const normalProduct = normal.find((line) => line.id === 'openings:opening-1');
  const normalWork = normal.find((line) => line.id === 'openings:work-1');
  const normalFastener = normal.find((line) => line.id === 'openings:fastener-1');
  const catalogProductPrice = project.priceMat.find((item) => item.id === 'MAT-241').price;
  const catalogWorkPrice = project.priceLab.find((item) => item.id === 'LAB-140').price;

  project.plan.openings[1].windowType = 'panoramic';
  const panoramic = calculateProject(project).lines;
  const product = panoramic.find((line) => line.id === 'openings:opening-1');
  const work = panoramic.find((line) => line.id === 'openings:work-1');
  const fastener = panoramic.find((line) => line.id === 'openings:fastener-1');
  assert.equal(product.catalogId, 'MAT-241');
  assert.equal(work.catalogId, 'LAB-140');
  assert.equal(product.qty, 7.5);
  assert.equal(work.qty, 7.5);
  assert.equal(product.price, normalProduct.price * 2);
  assert.equal(work.price, normalWork.price * 2);
  assert.equal(fastener.price, normalFastener.price);
  assert.equal(product.qty * product.price + work.qty * work.price, 187500);
  assert.equal(project.priceMat.find((item) => item.id === 'MAT-241').price, catalogProductPrice);
  assert.equal(project.priceLab.find((item) => item.id === 'LAB-140').price, catalogWorkPrice);
});

test('door plan labels are removed while direct hinge and opening controls remain', () => {
  const plan = readFileSync(new URL('../src/react/screens/PlanScreen.jsx', import.meta.url), 'utf8');
  const print = readFileSync(new URL('../src/react/components/PrintProjectDiagrams.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(plan, /opening\.doorType === "interior"\s*\?\s*"МД"/);
  assert.doesNotMatch(print, /opening\.doorType === 'interior'\s*\?\s*'МД'/);
  assert.match(plan, /<DoorOrientationControls\s+opening=\{opening\}/);
  assert.match(plan, /aria-pressed=\{\(opening\[field\] \|\| fallback\) === value\}/);
  assert.match(plan, /onClick=\{\(\) => onChange\(field, value\)\}/);
});
