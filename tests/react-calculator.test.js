import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateFoundation, generateAutoPileRows } from '../src/react/calculations/foundation-model.js';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';

test('React project produces a priced estimate from one shared model', () => {
  const project = createDefaultProject();
  const result = calculateProject(project);
  assert.ok(result.sections.some((section) => section.key === 'foundation'));
  assert.ok(result.sections.some((section) => section.key === 'sip'));
  assert.ok(result.sections.some((section) => section.key === 'roof'));
  assert.ok(result.totals.materials > 0);
  assert.ok(result.totals.labor > 0);
  assert.equal(result.totals.total, result.totals.materials + result.totals.labor);
});

test('warm main roof and terrace roofs are cut only in the roof section', () => {
  const project = createDefaultProject();
  project.settings.roof.type = 'sip';
  project.plan.platforms[0].roof.mode = 'warm';
  const result = calculateProject(project);
  assert.ok(result.roof.warmArea > 0);
  assert.deepEqual(result.sip.cutting.map((row) => row.key), ['floor', 'walls', 'ceiling']);
  assert.ok(result.roof.sipCutting.area > 0);
  assert.ok(result.roof.sipCutting.panels > 0);
  assert.equal(result.lines.filter((line) => line.id === 'roof:sip-panel').length, 1);
});

test('SIP joinery switches between thermobeam, board pack and solid beam', () => {
  const project = createDefaultProject();
  [['MAT-186', 'MAT-015'], ['MAT-187', 'MAT-013'], ['MAT-188', 'MAT-014']].forEach(([packageId, thermalId]) => {
    const packagePrice = project.priceMat.find((item) => item.id === packageId).price;
    const thermalPrice = project.priceMat.find((item) => item.id === thermalId).price;
    assert.equal(packagePrice, thermalPrice / 2);
  });
  const thermal = calculateProject(project);
  assert.ok(thermal.lines.some((line) => line.source === 'sip-walls-joints' && line.name.includes('Термобрус 145')));
  assert.ok(thermal.lines.some((line) => line.source === 'sip-walls-edges' && line.name.includes('145×45')));
  assert.ok(thermal.lines.some((line) => line.id === 'sip:fasteners' && line.qty > 0));
  assert.ok(thermal.lines.some((line) => line.id === 'sip:seam-screws' && line.qty > 0));
  project.settings.sip.connectorType = 'board-pack';
  const boardPack = calculateProject(project);
  const packageLine = boardPack.lines.find((line) => line.source === 'sip-walls-joints');
  assert.ok(packageLine.name.includes('2×45×145'));
  assert.equal(packageLine.price, project.priceMat.find((item) => item.id === 'MAT-187').price);
  project.settings.sip.connectorType = 'solid';
  const solid = calculateProject(project);
  assert.ok(solid.lines.some((line) => line.source === 'sip-walls-joints' && line.name.includes('150×100')));
  const baseWallJoints = solid.sip.joinery.rows.find((row) => row.key === 'walls').jointLength;
  project.plan.wallHeight = 3;
  const tallWallJoints = calculateProject(project).sip.joinery.rows.find((row) => row.key === 'walls').jointLength;
  assert.ok(tallWallJoints > baseWallJoints, 'horizontal wall seams are added above one panel height');
});

test('SIP floor and ceiling cover an empty house without drawn rooms', () => {
  const project = createDefaultProject();
  project.plan.house = { w: 10, h: 8 };
  project.plan.rooms = [];
  const result = calculateProject(project);
  assert.equal(result.sip.cutting.find((row) => row.key === 'floor').area, 80);
  assert.equal(result.sip.cutting.find((row) => row.key === 'ceiling').area, 80);
});

test('garage gates from the plan reach the openings estimate as their own item', () => {
  const project = createDefaultProject();
  project.plan.openings.push({ id: 'garage-1', type: 'door', doorType: 'garage', width: 2.5, height: 2.2, x: 4, y: 0, orientation: 'h', outer: true });
  const result = calculateProject(project);
  const gate = result.lines.find((line) => line.id === 'openings:opening-1');
  const work = result.lines.find((line) => line.id === 'openings:work-1');
  assert.equal(gate.catalogId, 'MAT-189');
  assert.equal(work.catalogId, 'LAB-110');
  assert.match(gate.name, /Гаражные ворота/);
  assert.equal(result.lines.some((line) => line.id === 'openings:fastener-1'), false);
});

test('second light moves room area from SIP ceiling to insulated rafters', () => {
  const project = createDefaultProject();
  const room = project.plan.rooms[0];
  room.ceilingMode = 'open-rafter';
  const roomArea = (room.w || 0) * (room.h || 0);
  const result = calculateProject(project);
  assert.ok(result.metrics.openCeilingArea > 0);
  assert.equal(result.metrics.ceilingArea, result.metrics.floorArea - result.metrics.openCeilingArea);
  assert.ok(result.roof.insulatedRafterArea > result.metrics.openCeilingArea);
  assert.ok(result.lines.some((line) => line.id === 'roof:open-rafter-insulation' && line.catalogId));
  assert.ok(result.lines.some((line) => line.id === 'roof:open-rafter-vapor-work' && line.catalogId));
  const insulationWork = result.lines.find((line) => line.id === 'roof:open-rafter-insulation-work');
  assert.equal(insulationWork.qty, result.roof.insulatedRafterArea);
  assert.equal(insulationWork.price, project.priceLab.find((item) => item.id === insulationWork.catalogId).price * 4);
  assert.deepEqual(result.lines.filter((line) => line.source === 'open-rafter' && (!line.catalogId || line.price <= 0)), []);
  assert.ok(result.metrics.openCeilingArea >= roomArea - 0.1);
});

test('shared terrace foundation removes coincident piles and can be disabled', () => {
  const project = createDefaultProject();
  const shared = calculateFoundation(project.plan, project.settings.piles);
  assert.ok(shared.sharedPiles > 0);
  project.plan.platforms.forEach((platform) => { platform.foundation.mode = 'none'; platform.binding.mode = 'none'; });
  const houseOnly = calculateFoundation(project.plan, project.settings.piles);
  assert.ok(houseOnly.totalPiles < shared.totalPiles);
  assert.equal(houseOnly.platformPiles, 0);
  assert.equal(houseOnly.platformBindingLength, 0);
});

test('migration preserves plan, services and price list independently', () => {
  const project = createDefaultProject();
  project.plan.house.w = 12.4;
  project.services.roof = false;
  project.priceMat[0].price = 12345;
  const restored = migrateProject(JSON.parse(JSON.stringify(project)));
  assert.equal(restored.plan.house.w, 12.4);
  assert.equal(restored.services.roof, false);
  assert.equal(restored.priceMat[0].price, 12345);
});

test('known empty starter rates are repaired from the current catalog', () => {
  const project = createDefaultProject();
  const roofWork = project.priceLab.find((item) => item.id === 'LAB-038');
  const expected = roofWork.price;
  roofWork.price = 0;
  const restored = migrateProject(project);
  assert.equal(restored.priceLab.find((item) => item.id === 'LAB-038').price, expected);
});

test('new catalog rows are added to an older saved project', () => {
  const project = createDefaultProject();
  project.priceLab = project.priceLab.filter((item) => !['LAB-108', 'LAB-110'].includes(item.id));
  project.priceMat = project.priceMat.filter((item) => !['MAT-187', 'MAT-189'].includes(item.id));
  const restored = migrateProject(project);
  assert.equal(restored.priceLab.find((item) => item.id === 'LAB-108').price, 1500);
  assert.equal(restored.priceLab.find((item) => item.id === 'LAB-110').price, 0);
  assert.equal(restored.priceMat.find((item) => item.id === 'MAT-187').price, 587);
  assert.equal(restored.priceMat.find((item) => item.id === 'MAT-189').price, 0);
});

test('plan geometry drives roof, engineering, finishing and delivery inputs', () => {
  const project = createDefaultProject();
  const before = calculateProject(project);
  project.plan.house.w += 2;
  project.plan.rooms[0].points[1].x += 1;
  project.plan.rooms[0].points[2].x += 1;
  const after = calculateProject(project);
  assert.equal(after.inputs.roof.ridgeLength, before.inputs.roof.ridgeLength + 2);
  assert.ok(after.inputs.engineering.cableRoute > before.inputs.engineering.cableRoute);
  assert.ok(after.inputs.internal.ceilingArea > before.inputs.internal.ceilingArea);
  assert.ok(after.inputs.delivery.cargoVolume > before.inputs.delivery.cargoVolume);
});

test('automatic links can be disabled and formulas are editable project data', () => {
  const project = createDefaultProject();
  project.settings.links.roofRidgeFromPlan = false;
  project.settings.roof.ridgeLength = 7.25;
  project.settings.formulas.pileCorners = 4;
  const calculation = calculateProject(project);
  assert.equal(calculation.inputs.roof.ridgeLength, 7.25);
  const corners = calculation.lines.find((line) => line.id === 'foundation:binding-corners');
  assert.equal(corners.qty, calculation.foundation.totalPiles * 4);
});

test('every default estimate line resolves to a priced catalog item', () => {
  const calculation = calculateProject(createDefaultProject());
  assert.deepEqual(calculation.lines.filter((line) => !line.catalogId || line.price <= 0), []);
});

test('automatic pile rows cover the house perimeter and internal walls at the configured spacing', () => {
  const project = createDefaultProject();
  project.settings.piles.spacing = 2;
  const rows = generateAutoPileRows(project.plan, project.settings.piles.spacing);
  assert.ok(rows.length > 4);
  assert.ok(rows.every((row) => row.auto && row.count >= 2));
  assert.ok(rows.every((row) => Math.hypot(row.x2 - row.x1, row.y2 - row.y1) / (row.count - 1) <= 2.001));
  assert.deepEqual(rows.slice(0, 4).map((row) => row.id), ['auto-top', 'auto-right', 'auto-bottom', 'auto-left']);
});
