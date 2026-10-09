import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createUpperFloorPlan, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { exteriorHeight, partitionHeight } from '../src/calculations/floor-height.js';

function house() {
  const p = createDefaultProject();
  p.plan = { ...p.plan, house: { w: 8, h: 6 }, wallHeight: 2.5, rooms: [], walls: [], openings: [], wallGaps: [], platforms: [] };
  p.meta.floors = 2;
  p.upperFloors = [createUpperFloorPlan(p.plan)];
  p.upperFloors[0].house.contourDefined = true;
  p.services.sipSecondFloor = true;
  p.services.roof = true;
  p.settings.roof.type = 'sip';
  p.settings.roof.shape = 'gable';
  p.settings.roof.gableType = 'sip';
  p.settings.roof.gableCount = 2;
  p.settings.roof.ridgeHeight = 2;
  return p;
}
function attic(p) {
  Object.assign(p.upperFloors[0], { floorType: 'attic', wallHeight: 0, partitionHeight: 2.5, atticHorizontalCeiling: false });
  return p;
}
test('zero means zero; absent values retain legacy defaults', () => {
  assert.equal(exteriorHeight({ wallHeight: 0 }), 0);
  assert.equal(exteriorHeight({}), 2.5);
  assert.equal(partitionHeight({ floorType: 'attic', wallHeight: 0, partitionHeight: 2.7 }), 2.7);
  assert.equal(partitionHeight({ floorType: 'attic', wallHeight: 0 }), 2.5);
  assert.equal(partitionHeight({ wallHeight: 3, partitionHeight: 2.7 }), 3);
});
test('zero-height mansard removes only knee walls and horizontal ceiling, not gables or roof', () => {
  const p = house(), old = calculateProject(p), next = calculateProject(attic(p));
  assert.equal(old.metrics.secondFloorExteriorWallNetArea, 68.26); // (28 − 4×.174) × 2.5
  assert.equal(next.metrics.secondFloorExteriorWallNetArea, 0);
  assert.equal(next.metrics.firstFloorExteriorWallNetArea, 68.26);
  assert.equal(next.metrics.ceilingArea, 0);
  assert.equal(next.roof.warmSlopeArea, old.roof.warmSlopeArea);
  assert.equal(next.roof.warmGableArea, old.roof.warmGableArea);
  assert.ok(next.roof.warmGableArea > 0);
  assert.equal(next.sip.joinery.rows.some(r => ['wallsSecondFloor', 'ceiling'].includes(r.key)), false);
  assert.equal(next.lines.some(r => r.id === 'sip:panel-ceiling'), false);
  assert.ok(next.totals.total < old.totals.total);
});
test('any positive knee height remains independent from the first floor and partitions', () => {
  const p = attic(house());
  p.upperFloors[0].wallHeight = .8;
  p.upperFloors[0].walls = [{ id: 'p1', x1: 1, y1: 3, x2: 7, y2: 3 }];
  const c = calculateProject(p);
  assert.equal(c.metrics.secondFloorExteriorWallNetArea, 21.84); // (28 − 4×.174) × .8, rounded.
  assert.equal(c.metrics.secondFloorPartitionNetArea, 15);
  assert.equal(c.metrics.firstFloorExteriorWallNetArea, 68.26);
});
test('stairs deduct the interfloor deck only; whole roof and optional top ceiling stay', () => {
  const p = attic(house()), before = calculateProject(p);
  p.upperFloors[0].floorOpening = { x: 2, y: 2, width: 2, length: 3 };
  const c = calculateProject(p);
  assert.equal(c.metrics.secondFloorOpeningArea, 6);
  assert.equal(c.metrics.secondFloorArea, 42);
  assert.equal(c.metrics.floorArea, 48);
  assert.equal(c.roof.warmSlopeArea, before.roof.warmSlopeArea);
  p.upperFloors[0].atticHorizontalCeiling = true;
  assert.equal(calculateProject(p).metrics.ceilingArea, 48);
  assert.ok(calculateProject(p).sip.joinery.rows.some(r => r.key === 'ceiling'));
});
test('cutting omits zero-height knee walls, keeps roof/gables/partitions and stair hole', () => {
  const p = attic(house());
  p.upperFloors[0].walls = [{ id: 'p1', x1: 1, y1: 3, x2: 7, y2: 3 }];
  p.upperFloors[0].floorOpening = { x: 2, y: 2, width: 2, length: 3 };
  const r = calculateProductionCutting(p, calculateProject(p));
  assert.equal(r.surfaces.some(s => /^Э2-С/.test(s.id)), false);
  assert.equal(r.surfaces.some(s => s.id === 'Э2-ПТ'), false);
  assert.ok(r.surfaces.some(s => /^Э2-ПГ/.test(s.id) && s.height === 2500));
  assert.ok(r.surfaces.some(s => s.id.startsWith('ФР')));
  assert.equal(r.issues.some(i => i.code === 'WALL_SIZE'), false);
  const area = r.parts.filter(s => s.surfaceId === 'Э2-ПОЛ').reduce((sum, s) => sum + s.area, 0) / 1e6;
  assert.ok(Math.abs(area - 42) < .001);
});
test('attic fields including explicit zero survive JSON import; legacy projects stay regular', () => {
  const p = attic(house()), saved = migrateProject(JSON.parse(JSON.stringify(p)));
  assert.equal(saved.upperFloors[0].wallHeight, 0);
  assert.equal(saved.upperFloors[0].partitionHeight, 2.5);
  assert.equal(saved.upperFloors[0].floorType, 'attic');
  assert.equal(saved.upperFloors[0].atticHorizontalCeiling, false);
  assert.equal(calculateProject(saved).metrics.ceilingArea, 0);
  const legacy = migrateProject(JSON.parse(JSON.stringify(house())));
  assert.equal(legacy.upperFloors[0].floorType, 'regular');
  assert.equal(calculateProject(legacy).metrics.ceilingArea, 48);
});
test('frame partition timber uses independent attic partition height', () => {
  const p = attic(house());
  p.upperFloors[0].walls = [{ id: 'p1', x1: 1, y1: 3, x2: 7, y2: 3 }];
  p.settings.sip.partitionType = 'frame';
  const before = calculateProject(p);
  p.upperFloors[0].partitionHeight = 3;
  const after = calculateProject(p);
  const boards = c => c.lines.filter(r => /перегород/i.test(r.name) && r.kind === 'material').reduce((sum, r) => sum + r.qty * r.price, 0);
  assert.equal(after.metrics.secondFloorPartitionNetArea, 18);
  assert.ok(boards(after) >= boards(before)); // Two studs still fit in a 6m stock board.
  const lengths=c=>calculateProductionCutting(p,c).members.filter(m=>m.surfaceId?.startsWith('Э2-ПГ')).reduce((s,m)=>s+m.length,0);
  const tall=lengths(after);p.upperFloors[0].partitionHeight=2.5;
  assert.ok(tall>lengths(before));
});

test('sloped interior ceiling uses actual slope coefficient, no eaves or stair deduction', () => {
  const p = attic(house());
  p.services.internalFinish = true;
  p.upperFloors[0].floorOpening = { x: 2, y: 2, width: 2, length: 3 };
  const c = calculateProject(p);
  assert.equal(c.metrics.atticRoofFinishArea, Math.round(48 * c.roof.geometry.slopeCoefficient * 1000) / 1000);
  assert.ok(c.metrics.atticRoofFinishArea > 48);
  const top = c.internal.rooms.filter(r => r.floor === 2);
  assert.equal(top.reduce((sum, r) => sum + r.ceilingArea, 0), c.metrics.atticRoofFinishArea);
  assert.equal(top.reduce((sum, r) => sum + r.wallArea, 0), c.roof.mainGableArea);
  const key = '2:unassigned';
  p.settings.internal.roomFinishes[key] = { ceilingArea: 10, wallArea: 5 };
  assert.equal(calculateProject(migrateProject(JSON.parse(JSON.stringify(p)))).internal.rooms.find(r => r.floor === 2).settings.ceilingArea, 10);
});
test('no roof or complex roof requires manual finish rather than inventing a slope', () => {
  const p = attic(house());
  p.services.roof = false;
  assert.equal(calculateProject(p).metrics.atticRoofFinishArea, null);
  p.services.roof = true;
  p.settings.roof.shape = 'tiered';
  assert.equal(calculateProject(p).metrics.atticRoofFinishArea, null);
});
