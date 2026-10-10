import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject, ensureProjectFloorCount } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting, tileSurface, connectionSegments, polygonAreaMm, packPanelBlanks, packMembers, wallPanelColumns, groupPanels, groupMembers, MIN_PANEL_WIDTH_MM } from '../src/react/calculations/production-cutting.js';
import { createPlanTransfer, applyPlanTransfer } from '../src/react/storage/plan-transfer.js';

const rectangle = (w, h) => [[[0,0],[w,0],[w,h],[0,h],[0,0]]];
const simple = () => {
  const p = createDefaultProject();
  p.plan = { ...p.plan, bindingLines:[],pileRows:[],piles:[],house: { w: 5, h: 4 }, rooms: [], walls: [], openings: [], wallGaps: [], platforms: [], wallHeight: 2.8 };
  p.settings.productionCutting.kerfMm = 3;
  p.settings.productionCutting.endAllowanceMm = 0;
  p.settings.productionCutting.counterLathProfile = "50×50";
  return p;
};

test('production wall cuts preserve opening area and add a labelled upper course without changing estimate', () => {
  const p = simple();
  p.plan.openings = [{ id: 'window', type: 'window', outer: true, x: 2, y: 0, width: 1, height: 1.2 }];
  p.settings.productionCutting.openingSills['1:window'] = 800;
  p.settings.productionCutting.wallAdditions['Э1-С1@0,0:5000,0'] = 200;
  const before = structuredClone(p), estimate = calculateProject(p);
  const report = calculateProductionCutting(p, estimate);
  const wall = report.parts.filter(part => part.surfaceId === 'Э1-С1');
  assert.ok(wall.some(part => part.upperCourse));
  assert.equal(wall.reduce((sum, part) => sum + part.area, 0), 5e3 * 3e3 - 1e3 * 1.2e3);
  assert.ok(wall.every(part => (part.blankHeight??part.height) <= 2500 && (part.blankWidth??part.width) <= 1250));
  assert.deepEqual(p, before);
  assert.equal(calculateProject(p).totals.total, estimate.totals.total);
  assert.equal(report.issues.length, 0);
});

test('window sill defaults to editable 850 mm and impossible overrides block the wall', () => {
  const p = simple();
  p.plan.openings = [{ id: 'window', type: 'window', outer: true, x: 2, y: 0, width: 1, height: 1.2 }];
  const report = calculateProductionCutting(p, calculateProject(p));
  assert.equal(report.openings[0].sill, 850);
  assert.equal(report.issues.some(issue => issue.code === 'OPENING_SILL'), false);
  assert.ok(report.parts.filter(part => part.surfaceId === 'Э1-С1').length > 0);
  assert.ok(report.parts.some(part => part.surfaceId === 'Э1-С2'));
  p.settings.productionCutting.openingSills['1:window'] = 2000;
  assert.ok(calculateProductionCutting(p, calculateProject(p)).issues.some(issue => issue.code === 'OPENING_SIZE'));
});

test('wall seams align with at least one jamb and balanced bays stay within frame step', () => {
  const openings = [{ x: 1600, width: 900 }, { x: 4200, width: 1000 }];
  const columns = wallPanelColumns({ x: 0, width: 6000 }, 625, openings);
  const boundaries = columns.flatMap(column => [column.x, column.x + column.width]);
  for (const opening of openings) assert.ok([opening.x, opening.x + opening.width].some(jamb => boundaries.some(boundary => Math.abs(boundary-jamb)<.001)));
  assert.ok(columns.every(column => column.width > 0 && column.width <= 625));
  assert.equal(columns.reduce((sum,column)=>sum+column.width,0), 6000);
});

test('identical panel shapes get one production mark with a quantity, without changing stock count', () => {
  const p = simple();
  const report = calculateProductionCutting(p, calculateProject(p));
  assert.ok(report.panelGroups.length < report.parts.length);
  assert.equal(report.panelGroups.reduce((sum,group)=>sum+group.qty,0), report.parts.length);
  const pair = [report.parts[0], { ...report.parts[0], id: 'same-elsewhere', x: report.parts[0].x + 10000,
    shape: report.parts[0].shape.map(ring=>ring.map(([x,y])=>[x+10000,y])) }];
  assert.equal(groupPanels(pair)[0].qty, 2);
  assert.equal(report.panelStock.sheets.flatMap(sheet=>sheet.parts).length, report.parts.length);
});

test('door lintel height follows wall and door height automatically', () => {
  const p = simple();
  p.plan.openings = [{ id:'door', type:'door', outer:true, x:2, y:0, width:.9, height:2.05 }];
  let report = calculateProductionCutting(p, calculateProject(p));
  assert.equal(report.openings[0].topClearance, 750);
  p.plan.openings[0].height = 2.2;
  report = calculateProductionCutting(p, calculateProject(p));
  assert.equal(report.openings[0].topClearance, 600);
});

test('horizontal wall layout turns courses around window and door, splitting long spans without narrow panels', () => {
  const p = simple();
  p.plan.house.w = 7;
  p.plan.openings = [
    { id:'window', type:'window', outer:true, x:2, y:0, width:1, height:1.2 },
    { id:'door', type:'door', outer:true, x:5.2, y:0, width:.9, height:2.05 },
  ];
  const initial=calculateProductionCutting(p,calculateProject(p));
  p.settings.productionCutting.layouts[initial.surfaces.find(surface=>surface.id==='Э1-С1').layoutKey] = { direction:'y' };
  const estimate = calculateProject(p);
  const report = calculateProductionCutting(p,estimate);
  const wall = report.parts.filter(part=>part.surfaceId==='Э1-С1');
  assert.ok(wall.length>0);
  assert.equal(report.issues.some(issue=>issue.surfaceId==='Э1-С1' || issue.code==='MIN_PANEL_WIDTH'),false);
  assert.ok(wall.every(part=>part.blankWidth<=1250 && part.blankHeight<=2500 && Math.min(part.width,part.height)>=MIN_PANEL_WIDTH_MM));
  assert.ok(wall.some(part=>part.y===0 && part.y+part.height<=850));
  assert.ok(wall.some(part=>part.y>=2050));
  assert.ok(Math.abs(wall.reduce((sum,part)=>sum+part.area,0) - (7000*2800-1000*1200-900*2050))<.01);
  assert.equal(calculateProject(p).totals.total,estimate.totals.total);
});

test('door and window jambs fit between end boards; groups preserve all instances', () => {
  const p=simple();
  p.plan.openings=[{id:'window',type:'window',outer:true,x:2,y:0,width:1,height:1.2},{id:'door',type:'door',outer:true,x:3.5,y:0,width:.9,height:2.05}];
  const report=calculateProductionCutting(p,calculateProject(p));
  const jambs=report.members.filter(member=>member.surfaceId==='Э1-С1' && member.role==='jamb');
  assert.equal(jambs.length,4);
  assert.deepEqual(jambs.map(member=>member.openingRef).sort(),['1 этаж · Дверь 2 · левая','1 этаж · Дверь 2 · правая','1 этаж · Окно 1 · левая','1 этаж · Окно 1 · правая']);
  assert.ok(jambs.every(member=>member.length===2710 && member.a[1]===45 && member.b[1]===2755));
  assert.equal(groupMembers(report.members).reduce((sum,group)=>sum+group.qty,0),report.members.length);
  assert.ok(report.members.some(member=>member.replacedByJamb && member.excluded));
  assert.equal(report.timberStock.bars.flatMap(bar=>bar.parts).filter(part=>jambs.some(jamb=>jamb.id===part.id)).length,4);
});

test('starter-board top plan has a floor-level door gap but keeps board under raised windows', () => {
  const p=simple();
  p.plan.openings=[{id:'window',type:'window',outer:true,x:1,y:0,width:1,height:1.2},{id:'door',type:'door',outer:true,x:3,y:0,width:.9,height:2.05}];
  const report=calculateProductionCutting(p,calculateProject(p));
  const wall=report.starterBoards.find(item=>item.id==='Э1-С1');
  assert.ok(wall);
  assert.equal(wall.openings.find(item=>item.id==='window').noBoard,false);
  assert.equal(wall.openings.find(item=>item.id==='door').noBoard,true);
  assert.ok(wall.boards.every(board=>board.end<=2550 || board.start>=3450));
  assert.ok(Math.abs(wall.boards.reduce((sum,board)=>sum+board.length,0)-4100)<.01);
});

test('concave floor and closed holes have exact area after staggered tiling', () => {
  const surface = { id: 'floor', name: 'floor', horizontal: true, thickness: 224, geometry: [[[[0,0],[4000,0],[4000,2000],[2000,2000],[2000,4000],[0,4000],[0,0]], [[500,500],[500,1000],[1000,1000],[1000,500],[500,500]]]] };
  const parts = tileSurface(surface, 1250, 2500, 625, true);
  assert.ok(Math.abs(parts.reduce((sum, part) => sum + polygonAreaMm(part.shape), 0) - (12e6 - 0.25e6)) < .01);
  assert.ok(parts.every(part => part.width <= 1250 && part.height <= 2500 && Math.min(part.width,part.height) >= 200));
  assert.ok(parts.some(part => part.height === 1250));
});

test('interfloor stair opening and open ceiling rooms are removed', () => {
  const p = simple(); ensureProjectFloorCount(p, 2);
  p.upperFloors[0] = { ...structuredClone(p.plan), floorOpening: { x: 1, y: 1, width: 1, length: 2 }, rooms: [{ id: 'void', x: 0, y: 0, w: 1, h: 1, ceilingMode: 'open-rafter', include: true }] };
  p.services.sipSecondFloor = true;
  const report = calculateProductionCutting(p, calculateProject(p));
  assert.equal(report.parts.filter(p => p.surfaceId === 'Э2-ПОЛ').reduce((s, p) => s + p.area, 0), 18e6);
  assert.equal(report.parts.filter(p => p.surfaceId === 'Э2-ПТ').reduce((s, p) => s + p.area, 0), 19e6);
});

test('shared panel edge counted once while perimeter and opening frames stay separate', () => {
  const surface = { id: 'a', geometry: [rectangle(1250,2500)], horizontal: false };
  const parts = tileSurface(surface, 1250, 2500, 625, false);
  const segments = connectionSegments(parts);
  assert.equal(segments.filter(s => s.seam).reduce((sum, s) => sum + s.length, 0), 2500);
  assert.equal(segments.filter(s => !s.seam).reduce((sum, s) => sum + s.length, 0), 7500);
});

test('stock maps separate materials and leave kerf between every pair of blanks', () => {
  const parts = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, width: 600, height: 1000, thickness: i < 6 ? 174 : 224, family: 'pps' }));
  const report = packPanelBlanks(parts, 1250, 2500, 3);
  assert.equal(report.unplaced.length, 0);
  assert.equal(report.sheets.flatMap(s => s.parts).length, 12);
  for (const sheet of report.sheets) for (const a of sheet.parts) {
    assert.ok(a.x + a.width <= 1250 && a.y + a.height <= 2500);
    for (const b of sheet.parts.filter(p => p.id !== a.id)) assert.ok(a.x + a.width + 3 <= b.x || b.x + b.width + 3 <= a.x || a.y + a.height + 3 <= b.y || b.y + b.height + 3 <= a.y);
  }
  const tight = packPanelBlanks([{ ...parts[0], width: 625, height: 2500 }, { ...parts[1], width: 625, height: 2500 }], 1250, 2500, 3);
  assert.equal(tight.sheets.length, 2);
  const bars = packMembers([{ id: 'a', cutLength: 3000, material: 'wood', profile: '145×90' }, { id: 'b', cutLength: 3000, material: 'wood', profile: '145×90' }, { id: 'c', cutLength: 7000, material: 'wood', profile: '145×90' }], 6000, 3);
  assert.equal(bars.bars.length, 2); assert.deepEqual(bars.unplaced, ['c']);
});

test('production inputs and manual connectors survive project and plan round trips', () => {
  const p = simple();
  p.settings.productionCutting.openingSills['1:window'] = 900;
  p.settings.productionCutting.manualParts = [{ id: 'block', name: 'Закладная', profile: '145×90', length: 1200, quantity: 2 }];
  const opened = migrateProject(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(opened.settings.productionCutting, p.settings.productionCutting);
  assert.deepEqual(applyPlanTransfer(createDefaultProject(), createPlanTransfer(p)).settings.productionCutting, p.settings.productionCutting);
  const report = calculateProductionCutting(opened, calculateProject(opened));
  assert.equal(report.members.filter(m => m.source === 'Ручная деталь').length, 2);
  delete p.settings.productionCutting;
  assert.equal(migrateProject(p).settings.productionCutting.kerfMm, '');
  p.settings.productionCutting = null;
  assert.equal(migrateProject(p).settings.productionCutting.kerfMm, '');
});

test('full-height wall gaps are cut through added courses and overlapping partitions are merged', () => {
  const p = simple();
  p.plan.wallGaps = [{ id: 'gap', x: 2.5, y: 0, width: 1, outer: true }];
  p.settings.productionCutting.wallAdditions['Э1-С1@0,0:5000,0'] = 200;
  p.settings.sip.partitionType = 'sip';
  p.plan.walls = [{ id: 'a', x1: 1, y1: 2, x2: 3, y2: 2 }, { id: 'b', x1: 2, y1: 2, x2: 4, y2: 2 }];
  const report = calculateProductionCutting(p, calculateProject(p));
  assert.equal(report.parts.filter(part => part.surfaceId === 'Э1-С1').reduce((sum, part) => sum + part.area, 0), 12e6);
  assert.equal(report.surfaces.filter(s => s.id.includes('ПГ')).length, 1);
  assert.equal(report.parts.filter(part => part.surfaceId.includes('ПГ')).reduce((sum, part) => sum + part.area, 0), 3e3 * 2.8e3);
});

test('gable and hip SIP roof maps follow calculated slopes and keep all pieces within stock size', () => {
  for (const shape of ['gable', 'hip', 'flat']) {
    const p = simple(); p.settings.roof.type = 'sip'; p.settings.roof.shape = shape;
    const calculation = calculateProject(p), report = calculateProductionCutting(p, calculation);
    const roofParts = report.parts.filter(part => part.surfaceId.startsWith('КР-'));
    assert.ok(roofParts.length > 0);
    assert.ok(roofParts.every(part => part.width <= report.panelWidth + 0.001 && part.height <= report.panelLength + 0.001));
    const roofArea = roofParts.reduce((s, part) => s + part.area, 0) / 1e6;
    assert.ok(Math.abs(roofArea - calculation.roof.geometry.totalSlopeArea) < 0.05, `${shape}: ${roofArea}`);
    assert.equal(report.panelStock.unplaced.length, 0);
  }
});

test('partially open ceiling and undefined contour produce explicit missing-data states', () => {
  const p = simple();
  p.plan.rooms = [{ id: 'open', x: 0, y: 0, w: 2, h: 2, ceilingMode: 'open-rafter', openCeilingArea: 2 }];
  let report = calculateProductionCutting(p, calculateProject(p));
  assert.ok(report.issues.some(issue => issue.code === 'CEILING_OPENING'));
  assert.equal(report.parts.filter(part => part.surfaceId === 'Э1-ПТ').length, 0);
  p.plan.house.contourDefined = false;
  report = calculateProductionCutting(p, calculateProject(p));
  assert.equal(report.parts.length, 0);
  assert.ok(report.issues.some(issue => issue.code === 'CONTOUR'));
});
