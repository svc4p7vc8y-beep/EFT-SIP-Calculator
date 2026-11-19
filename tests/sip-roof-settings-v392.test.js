import test from 'node:test';import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {sipGableTimber} from '../src/react/calculations/sip-gable-timber.js';
import {roofPanelThickness} from '../src/react/calculations/roof-panel-settings.js';
test('roof panel thickness follows saved ceiling values only until independently selected',()=>{
 const p=createDefaultProject();p.settings.sip.ceilingThickness='174';let q=migrateProject(JSON.parse(JSON.stringify(p)));assert.equal(roofPanelThickness(q),174);
 q.settings.roof.sipPanelThickness='124';q.settings.roof.type='sip';q.settings.sip.connectorType='board-pack';
 const c=calculateProject(q),r=calculateProductionCutting(q,c);
 assert.match(c.lines.find(l=>l.id==='roof:sip-panel').name,/124/);assert.match(c.lines.find(l=>l.id==='roof:sip-frame').name,/Пакет клеёных досок 95×95 мм/);
 assert.ok(r.assembly.roofModel.faces.filter(f=>f.warm).every(f=>f.thickness===124));assert.ok(r.surfaces.filter(s=>s.roofFaceId).every(s=>s.thickness===124));
 assert.equal(q.settings.sip.ceilingThickness,'174');assert.equal(roofPanelThickness(migrateProject(JSON.parse(JSON.stringify(q)))),124);
});
test('SIP gable seams and edge boards use polygon geometry and existing stock rounding',()=>{
 const layout=sipGableTimber([[[[[0,0],[8,0],[4,2],[0,0]]]]],1.25,2.5,0,6);
 assert.ok(Math.abs(layout.jointNet-6)<.00001);assert.equal(layout.jointLength,6);assert.equal(layout.edgeLength,18);
});
test('SIP roof material is named explicitly and warm gable timber is priced once',()=>{
 const p=createDefaultProject();p.settings.roof.type='sip';p.settings.roof.gableType='sip';p.settings.sip.connectorType='board-pack';
 const c=calculateProject(p),frame=c.lines.find(l=>l.id==='roof:sip-frame'),joint=c.lines.find(l=>l.id==='roof:gable-sip-connector'),edge=c.lines.find(l=>l.id==='roof:gable-sip-edge');
 assert.match(frame.name,/Пакет клеёных досок/);assert.ok(joint.qty>0&&joint.price>0);assert.ok(edge.qty>0&&edge.price>0);assert.equal(c.lines.filter(l=>l.id===joint.id).length,1);
 assert.match(c.lines.find(l=>l.id==='roof:rafters').name,/^Коньковая доска/);
 p.settings.roof.gableType='none';assert.ok(!calculateProject(p).lines.some(l=>['roof:gable-sip-connector','roof:gable-sip-edge','roof:gable-sip-panel'].includes(l.id)));
});
