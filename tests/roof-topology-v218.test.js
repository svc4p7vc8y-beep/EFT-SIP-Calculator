import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {roofHeight} from '../src/react/calculations/roof-project.js';
const run=p=>calculateProductionCutting(p,calculateProject(p));
for(const shape of ['gable','hip'])for(const sx of [-1,1])for(const sy of [-1,1])test(`L topology ${shape} ${sx}/${sy}: exact footprint and shared valley segments`,()=>{
 const p=createDefaultProject();p.plan.rooms=[];p.plan.openings=[];p.plan.house={w:10,h:8,points:[[0,0],[10,0],[10,4],[4,4],[4,8],[0,8]].map(([x,y])=>({x:x*sx,y:y*sy}))};Object.assign(p.settings.roof,{shape,eaveOverhang:0,gableOverhang:0});p.settings.productionCutting.roofDesign.enabled=true;const r=run(p),m=r.assembly.roofModel;assert.ok(m.faces.length>2);assert.ok(Math.abs(m.groupAreas.main-56)<.001);assert.ok(!m.issues.some(i=>['ROOF_OVERLAP','ROOF_GAP','ROOF_FACE'].includes(i.code)),JSON.stringify(m.issues));assert.ok(m.edges.some(e=>e.kind==='valley'&&e.faces.length===2),JSON.stringify(m.edges));
});
for(const [side,x,y,w,h]of [['top',1,-3,4,3],['bottom',1,8,4,3],['left',-3,1,3,6],['right',6,1,3,6]])test(`terrace continuation ${side}: coplanar extension and no duplicated main eave`,()=>{
 const p=createDefaultProject();p.plan.house={w:6,h:8};p.plan.rooms=[];p.plan.openings=[];p.plan.platforms=[{id:'t',name:'Терраса',x,y,w,h,roof:{mode:'cold',shape:'continuation'}}];p.settings.productionCutting.roofDesign.enabled=true;const m=run(p).assembly.roofModel,terrace=m.faces.filter(f=>f.group==='terrace:t'),main=m.faces.filter(f=>f.group==='main');assert.ok(terrace.length);for(const f of terrace)assert.ok(main.some(a=>f.vertices.every(p=>Math.abs(roofHeight(a,p[0],p[1])-p[2])<1)));assert.ok(!m.issues.some(i=>i.code==='ROOF_FACE'));
});
