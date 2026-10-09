import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting,groupMembers,groupPanels} from '../src/react/calculations/production-cutting.js';
import {exteriorWallConstruction} from '../src/react/calculations/wall-construction.js';
import {bearingSideLabels,bearingWallKey} from '../src/react/calculations/bearing-walls.js';
import {partitionReinforcements} from '../src/react/calculations/partition-construction.js';
import {partitionProcurement} from '../src/react/calculations/partition-procurement.js';
import {calculateDeliveryVolume} from '../src/react/calculations/delivery-volume.js';
import {checkDiagonals} from '../src/react/calculations/drawing-dimensions.js';
const close=(a,b,tolerance=.011)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
function house(){const p=createDefaultProject();Object.assign(p.plan,{house:{w:6,h:3,contourDefined:true},rooms:[],walls:[],openings:[],wallGaps:[],platforms:[],pileRows:[],piles:[],bindingLines:[],wallHeight:2.5});Object.assign(p.settings.productionCutting,{kerfMm:3,endAllowanceMm:0});return p;}
const run=p=>calculateProductionCutting(p,calculateProject(p));
test('butt corners retain outside 6×3 and correct fabricated lengths at all SIP thicknesses',()=>{
 for(const thickness of [124,174,224]){const p=house();p.services.roof=false;p.settings.sip.wallThickness=thickness;const before=structuredClone(p),walls=exteriorWallConstruction(p.plan,p.settings.sip),r=run(p),c=calculateProject(p);
  close(walls[0].length,6);close(walls[1].length,3-2*thickness/1000);close(walls[2].length,6);close(walls[3].length,walls[1].length);
  close(c.metrics.firstFloorExteriorWallNetArea,(18-4*thickness/1000)*2.5);
  assert.deepEqual(p,before);assert.deepEqual(r.surfaces.filter(s=>s.planStart&&s.id.includes('-С')).map(s=>s.width),walls.map(w=>Math.round(w.length*1000)));
 }
});
test('all slope directions change actual wall panel profiles and SIP areas, not only roof pictures',()=>{
 for(const direction of ['front','back','left','right']){const p=house();Object.assign(p.settings.roof,{shape:'flat',flatSlopeMode:'structural',flatSlopePercent:5,flatSlopeDirection:direction,gableType:'sip',type:'sip'});const before=structuredClone(p),c=calculateProject(p),r=run(p),walls=r.surfaces.filter(s=>/^Э1-С\d+$/.test(s.id)),span=['left','right'].includes(direction)?6:3;
  assert.equal(walls.length,4);assert.ok(walls.some(s=>s.heightStart!==s.heightEnd));close(Math.max(...walls.flatMap(s=>[s.heightStart,s.heightEnd])),2500+span*50,1);
  const cutArea=r.parts.filter(p=>walls.some(s=>s.id===p.surfaceId)).reduce((s,p)=>s+p.area/1e6,0);
  close(cutArea,c.metrics.firstFloorExteriorWallNetArea);assert.ok(!r.issues.some(i=>i.code==='MIN_PANEL_WIDTH'&&walls.some(s=>s.id===i.target)));
  assert.equal(r.surfaces.some(s=>s.id.startsWith('ФР-')),false);assert.deepEqual(p,before);
 }
});
test('wall jamb lengths interpolate sloping top; opening near trimmed corner is diagnosed',()=>{
 const p=house();Object.assign(p.settings.roof,{shape:'flat',flatSlopeMode:'structural',flatSlopePercent:5,flatSlopeDirection:'back',gableType:'sip',type:'sip'});
 p.plan.openings=[{id:'w',type:'window',outer:true,x:6,y:1.5,width:1,height:1.2,sillHeight:.85,orientation:'v'}];let r=run(p),jambs=r.members.filter(m=>m.role==='jamb');assert.equal(jambs.length,2);assert.notEqual(jambs[0].length,jambs[1].length);
 close(r.openings[0].topClearance,500,1); // Lower jamb top: 2.55m − .85m − 1.20m.
 p.plan.openings[0].y=.2;r=run(p);assert.ok(r.issues.some(i=>i.code==='OPENING_SIZE'));assert.equal(r.parts.filter(p=>p.surfaceId==='Э1-С2').length,0);
});
test('L-contour has concave extension, no guessed cuts on diagonal contours, directions unambiguous',()=>{
 const p=house();p.plan.house.points=[{x:0,y:0},{x:6,y:0},{x:6,y:3},{x:3,y:3},{x:3,y:6},{x:0,y:6}];const walls=exteriorWallConstruction(p.plan,p.settings.sip);assert.ok(walls.some(w=>w.trimStart<0||w.trimEnd<0));
 assert.equal(new Set(bearingSideLabels(p.plan.house.points)).size,6);
 p.plan.house.points[2].x=5.5;assert.ok(exteriorWallConstruction(p.plan,p.settings.sip).some(w=>w.needsCornerDetail));
});
test('concrete blocks cost exactly1500 installed, have editable unknown sizes and actual-support binding',()=>{
 const p=house();p.settings.piles.pileType='concreteBlock';p.plan.piles=[{id:'a',x:0,y:0},{id:'b',x:6,y:0},{id:'c',x:6,y:3},{id:'d',x:0,y:3}];let c=calculateProject(p),r=run(p);
 const blocks=c.lines.find(l=>l.catalogId==='MAT-FOUNDATION-BLOCK');assert.equal(blocks.qty,4);assert.equal(blocks.price,1500);assert.equal(blocks.qty*blocks.price,6000);
 assert.equal(c.foundation.bindingLength,18);assert.ok(!c.sections.find(s=>s.key==='foundation').lines.some(l=>/свая|свай|оголов|глухар|пескобетон/i.test(l.name)));
 assert.equal(r.assembly.foundationType,'concreteBlock');assert.equal(checkDiagonals(r.assembly).length,2);
 p.plan.piles[1].x=5;const moved=calculateProject(p);assert.notEqual(moved.foundation.bindingLength,c.foundation.bindingLength);assert.ok(moved.foundation.bindingLines.every(l=>p.plan.piles.some(p=>p.x===l.x1&&p.y===l.y1)&&p.plan.piles.some(p=>p.x===l.x2&&p.y===l.y2)));
 p.settings.piles.blockDimensions={widthMm:200,lengthMm:400,heightMm:200};assert.deepEqual(migrateProject(JSON.parse(JSON.stringify(p))).settings.piles.blockDimensions,p.settings.piles.blockDimensions);
 const old=createDefaultProject();delete old.settings.piles.pileType;assert.equal(migrateProject(old).settings.piles.pileType,'screw');
});
test('bearing reinforcement, bracing, grouped marks, purchase, estimate and cargo volumes agree',()=>{
 const p=house();p.plan.house={w:8,h:6,contourDefined:true};p.plan.rooms=[{id:'r',x:1,y:1,w:6,h:3,bearingWalls:{[bearingWallKey({x:1,y:1},{x:7,y:1})]:{enabled:true,profile:'50x150'}}}];
 p.plan.openings=[{id:'d',type:'door',outer:false,x:2,y:1,width:.9,height:2.1,orientation:'h'}];const c=calculateProject(p),r=run(p),extras=partitionReinforcements(p,p.plan,1),actual=r.members.filter(m=>m.reinforcement&&!m.excluded);
 assert.deepEqual(extras.map(m=>[m.id,m.profile,m.cutLength]),actual.map(m=>[m.id,m.profile,m.cutLength]));
 assert.ok(actual.some(m=>m.material==='Опорная доска на ребре'));assert.ok(actual.some(m=>m.material==='Укосина перегородки'&&m.profile==='25×150'));assert.ok(actual.some(m=>m.backing));
 for(const g of [...r.panelGroups,...r.memberGroups]){const mark=(g.part||g.member).displayMark;assert.ok(/^[А-Я]+\d+$/.test(mark)&&mark.length<=5);assert.equal(new Set((g.part?g.instances.map(id=>r.parts.find(p=>p.id===id)):g.instances).map(m=>m.displayMark)).size,1);}
 const purchased=partitionProcurement(r).boards.reduce((s,b)=>s+b.volumeM3,0),estimated=c.lines.filter(l=>l.source==='partition-detail').reduce((s,l)=>s+l.qty,0);close(purchased,estimated,.00011);
 assert.ok(calculateDeliveryVolume(p,c).categories.some(g=>g.key==='timber'&&g.autoVolume>=estimated));
 const saved=migrateProject(JSON.parse(JSON.stringify(p)));assert.equal(calculateProject(saved).totals.total,c.totals.total);
 const one=r.parts[0];assert.equal(groupPanels([one,{...one,id:'other',processing:'Паз по другому узлу'}]).length,2);
 const board=r.members[0];assert.equal(groupMembers([board,{...board,id:'other',processing:'Другой торец'}]).length,2);
});

test('oversize partition parts are not silently treated as manufactured joined boards',()=>{
 const p=house();p.plan.house={w:10,h:6,contourDefined:true};p.plan.rooms=[{id:'r',x:1,y:1,w:8,h:3}];
 const c=calculateProject(p),r=run(p);
 assert.ok(r.partitionStock.unplaced.length>0);
 assert.ok(r.issues.some(i=>i.code==='MEMBER_SIZE'));
 assert.ok(c.lines.some(l=>l.source==='partition-detail'&&l.name.includes('стыки по проекту')));
});
