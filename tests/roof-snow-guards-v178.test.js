import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSnowGuards } from '../src/react/calculations/snow-guards.js';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';

const snowLines = project => calculateProject(project).sections.find(section => section.key === 'roof').lines
  .filter(line => ['MAT-246', 'LAB-037'].includes(line.catalogId));

test('snow guards are opt-in and round each selected side to separate 3 m kits', () => {
  assert.equal(calculateSnowGuards({}, 8).kits, 0);
  assert.deepEqual(calculateSnowGuards({ snowGuards: { mode: 'first', firstLength: 4.2 } }, 8).kits, 2);
  const second = calculateSnowGuards({ snowGuards: { mode: 'second', secondLength: 2.2 } }, 8);
  assert.equal(second.firstLength, 0);
  assert.equal(second.kits, 1);
  const both = calculateSnowGuards({ snowGuards: { mode: 'both', firstLength: 4.2, secondLength: 2.2 } }, 8);
  assert.equal(both.totalLength, 6.4);
  assert.equal(both.kits, 3);
  assert.equal(calculateSnowGuards({ shape: 'hip', snowGuards: { mode: 'both' } }, 8).kits, 0);
});

test('roof estimate includes material kits and installation metres without retroactive additions', () => {
  const project = createDefaultProject();
  assert.equal(project.priceMat.filter(line => line.id === 'MAT-246').length, 1);
  assert.deepEqual(snowLines(project), []);
  project.settings.roof.snowGuards = { mode: 'both', firstLength: 4.2, secondLength: 2.2 };
  const lines = snowLines(project);
  assert.deepEqual(lines.map(line => [line.catalogId, line.qty, line.price]), [
    ['MAT-246', 3, 4351], ['LAB-037', 6.4, 550],
  ]);
  assert.equal(lines.reduce((sum, line) => sum + line.qty * line.price, 0), 16573);
});

test('migration upgrades only untouched reference labor price and keeps manual project prices', () => {
  const original = createDefaultProject();
  original.appVersion = 177;
  original.priceLab.find(line => line.id === 'LAB-037').price = 2500;
  let migrated = migrateProject(JSON.parse(JSON.stringify(original)));
  assert.equal(migrated.priceLab.find(line => line.id === 'LAB-037').price, 550);
  assert.equal(migrated.settings.roof.snowGuards.mode, 'none');
  original.priceLab.find(line => line.id === 'LAB-037').price = 1600;
  original.settings.roof.snowGuards = { mode: 'first', firstLength: 5, materialPrice: 4000, laborPrice: 700 };
  migrated = migrateProject(JSON.parse(JSON.stringify(original)));
  assert.equal(migrated.priceLab.find(line => line.id === 'LAB-037').price, 1600);
  assert.deepEqual(snowLines(migrated).map(line => line.price), [4000, 700]);
});
