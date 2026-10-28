import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { SCREW_PILE_KITS } from '../src/react/data/foundation-kits.js';

const lines = (calculation, section) => calculation.sections.find(item => item.key === section).lines;

test('each screw pile kit is priced once and foundation axes remain a separate per-pile service', () => {
  const prices = [5500, 4500, 4200, 3500];
  for (const [index, kit] of SCREW_PILE_KITS.entries()) {
    const project = createDefaultProject();
    project.settings.piles.screwPileVariant = kit.value;
    const calculation = calculateProject(project);
    const foundation = lines(calculation, 'foundation');
    const pile = foundation.find(item => item.id === 'foundation:piles');
    const axes = foundation.find(item => item.id === 'foundation:axes');
    assert.equal(pile.catalogId, kit.catalogId);
    assert.equal(pile.price, prices[index]);
    assert.equal(pile.qty, calculation.foundation.totalPiles);
    assert.equal(axes.qty, pile.qty);
    assert.equal(axes.catalogId, 'LAB-007');
    assert.ok(!foundation.some(item => ['pile-work', 'concrete', 'heads', 'heads-work'].some(key => item.id === `foundation:${key}`)));
  }
});

test('old projects preserve separate pile components and unchanged terrace board', () => {
  const saved = createDefaultProject();
  delete saved.settings.piles.screwPileVariant;
  delete saved.settings.terrace;
  saved.appVersion = 234;
  const project = migrateProject(saved);
  assert.equal(project.settings.piles.screwPileVariant, 'legacy');
  assert.equal(project.settings.terrace.deckBoard, '45x145');
  const foundation = lines(calculateProject(project), 'foundation');
  assert.ok(foundation.some(item => item.id === 'foundation:pile-work'));
  assert.ok(foundation.some(item => item.id === 'foundation:axes'));
  delete saved.appVersion;
  assert.equal(migrateProject(saved).settings.piles.screwPileVariant, 'legacy');
});

test('terrace 28×145 mm is charged per linear metre from area and selected reserve', () => {
  const project = createDefaultProject();
  project.plan.platforms = [{ id: 'terrace-check', kind: 'terrace', x: 12, y: 0, w: 3, h: 2, include: true }];
  project.settings.terrace.deckBoard = '28x145';
  const calculation = calculateProject(project);
  const deck = lines(calculation, 'terrace').find(item => item.id === 'terrace:deck');
  assert.equal(deck.catalogId, 'MAT-TERRACE-BOARD-28-145');
  assert.equal(deck.unit, 'м.п.');
  assert.equal(deck.price, 175);
  assert.equal(deck.qty, Math.ceil(6 / .145 * project.settings.formulas.terraceDeckReserve * 100) / 100);
});

test('board package kit follows SIP thickness and uses distinct catalog prices', () => {
  const project = createDefaultProject();
  project.settings.sip.connectorType = 'board-kit';
  project.settings.sip.floorThickness = 124;
  project.settings.sip.wallThickness = 174;
  project.settings.sip.ceilingThickness = 224;
  const sip = lines(calculateProject(project), 'sip');
  for (const [key, id, price] of [
    ['floor', 'MAT-SIP-BOARD-KIT-124', 450],
    ['walls', 'MAT-SIP-BOARD-KIT-174', 687],
    ['ceiling', 'MAT-SIP-BOARD-KIT-224', 924],
  ]) {
    const line = sip.find(item => item.id === `sip:${key}-connector`);
    assert.equal(line.catalogId, id);
    assert.equal(line.price, price);
    assert.equal(line.unit, 'м.п.');
  }
});
