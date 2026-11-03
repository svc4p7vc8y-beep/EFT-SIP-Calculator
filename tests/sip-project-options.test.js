import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting,packPanelBlanks} from '../src/react/calculations/production-cutting.js';
import {productionScene} from '../src/react/calculations/production-scene.js';
import {assignSipThickness} from '../src/react/planner/bearing-selection.js';
import {bearingWallKey} from '../src/react/calculations/bearing-walls.js';
import {partitionDepth,boundsOf} from '../src/react/planner/geometry.js';
import {resizeRoomFromExterior} from '../src/react/planner/resize-room.js';
import {guideFromGuide,moveTemporaryGuide} from '../src/react/planner/temporary-guides.js';
import {mixedPanelStock} from '../src/react/calculations/mixed-panel-stock.js';

test('2800 panels have the approved three prices and do not replace 2500 catalog entries',()=>{
 const p=createDefaultProject(),prices=p.priceMat.filter(r=>r.name.includes('PPS 2500')).map(r=>r.price);
 p.settings.formulas.panelLength=2.8;p.settings.formulas.panelArea=3.5;
 const c=calculateProject(p),panels=c.lines.filter(r=>/^СИП-панель PPS/.test(r.name));
 assert.ok(panels.length);assert.ok(panels.every(r=>r.name.includes('2800')));
 assert.equal(p.priceMat.find(r=>r.id==='MAT-SIP-2800-124').price,7787);
 assert.equal(p.priceMat.find(r=>r.id==='MAT-SIP-2800-174').price,8822);
 assert.equal(p.priceMat.find(r=>r.id==='MAT-SIP-2800-224').price,9857);
 assert.deepEqual(p.priceMat.filter(r=>r.name.includes('PPS 2500')).map(r=>r.price),prices);
});
test('mixed stock uses both lengths, each physical part occurs once and fits its sheet',()=>{
 const p=createDefaultProject();
 const parts=[2500,2800].map((height,i)=>({id:`p${i}`,width:1250,height,area:1250*height,family:'pps',thickness:174}));
 const result=mixedPanelStock(parts,1250,3,false,packPanelBlanks,p.priceMat);
 assert.deepEqual(result.sheets.map(s=>s.height).sort(),[2500,2800]);
 assert.equal(new Set(result.sheets.flatMap(s=>s.parts.map(p=>p.id))).size,2);
 for(const sheet of result.sheets)for(const part of sheet.parts)assert.ok(part.y+part.height<=sheet.height);
});
test('mixed estimate, project JSON and production use the same selected base format',()=>{
 const p=createDefaultProject();p.settings.sip.panelStockMode='mixed';const original=JSON.stringify(p);
 const c=calculateProject(p),report=calculateProductionCutting(p,c);
 assert.equal(c.sip.stockSelection.status,'calculated');assert.equal(report.panelLength,c.inputs.formulas.panelLength*1000);
 assert.equal(c.totals.total,c.lines.reduce((sum,r)=>sum+r.qty*r.price,0));
 assert.equal(JSON.stringify(p),original);assert.equal(migrateProject(JSON.parse(original)).settings.sip.panelStockMode,'mixed');
 assert.ok(c.lines.some(r=>r.source==='sip-mixed-stock'));
});
test('local SIP thickness follows the selected wall and survives resizing and JSON',()=>{
 const p=createDefaultProject();p.plan.partitionThickness=.124;p.settings.sip.partitionType='sip';
 const room={id:'r',name:'r',points:[{x:6,y:0},{x:10,y:0},{x:10,y:4},{x:6,y:4}]};
 p.plan.house={w:10,h:8,contourDefined:true};p.plan.rooms=[room];
 assignSipThickness(p.plan,[bearingWallKey(room.points[3],room.points[0])],224);
 assert.equal(partitionDepth(p.plan,room.points[3],room.points[0]),.224);
 resizeRoomFromExterior(p.plan,room,'w',3);
 assert.equal(boundsOf(room.points).x,7);assert.equal(boundsOf(room.points).x2,10);
 assert.equal(partitionDepth(p.plan,room.points[3],room.points[0]),.224);
 const reopened=migrateProject(JSON.parse(JSON.stringify(p)));
 assert.equal(partitionDepth(reopened.plan,room.points[3],room.points[0]),.224);
 const report=calculateProductionCutting(p,calculateProject(p));
 assert.ok(report.surfaces.some(s=>!s.exterior&&s.planStart&&s.thickness===224));
});
test('a guide can start at another guide and be placed on either side',()=>{
 const guide=guideFromGuide({axis:'x',target:4},{x:4,y:2});
 assert.equal(moveTemporaryGuide(guide,{x:3,y:2}).target,3);
 assert.equal(moveTemporaryGuide(guide,{x:6,y:2}).target,6);
 assert.equal(guide.origin,4);
});
test('wall junction alignment affects real connector purchases but never catalog prices',()=>{
 const p=createDefaultProject(),prices=JSON.stringify(p.priceMat);
 p.settings.productionCutting.partitionSipAlignment=false;const before=calculateProject(p);
 p.settings.productionCutting.partitionSipAlignment=true;const after=calculateProject(p);
 assert.ok(after.lines.find(r=>r.id==='sip:walls-connector').qty>before.lines.find(r=>r.id==='sip:walls-connector').qty);
 assert.ok(after.totals.total>before.totals.total);assert.equal(JSON.stringify(p.priceMat),prices);
});
test('mixed procurement does not duplicate custom rows and preserves manual panel overrides',()=>{
 const p=createDefaultProject(),base=calculateProject(p),panel=base.lines.find(r=>/^СИП-панель /.test(r.name));
 p.customEstimateLines=[{id:'custom-test',section:'sip',name:'Ручная позиция',qty:2,price:17,kind:'material',unit:'шт'}];
 p.estimateOverrides=[{lineId:panel.id,section:panel.section,catalogId:panel.catalogId,qty:8,price:123}];
 p.settings.sip.panelStockMode='mixed';const c=calculateProject(p);
 assert.equal(c.lines.filter(r=>r.id==='custom-test').length,1);
 assert.equal(c.lines.find(r=>r.id===panel.id).qty,8);assert.equal(c.lines.find(r=>r.id===panel.id).price,123);
});
test('entry doors appear as separate scene layer and disappear when openings are disabled',()=>{
 const p=createDefaultProject();
 let c=calculateProject(p),report=calculateProductionCutting(p,c);
 assert.ok(productionScene(report,p).panels.some(item=>item.layer==='doors'));
 p.services.openings=false;c=calculateProject(p);report=calculateProductionCutting(p,c);
 assert.ok(!productionScene(report,p).panels.some(item=>item.layer==='doors'));
});
