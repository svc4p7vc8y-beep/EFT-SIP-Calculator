import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {createFacade,facadeEnvelope,facadeLayout,facadeMemberShapes,moveFacadeRow,appendFacadeTransom} from '../src/react/calculations/facade-design.js';
function fixture(){const p=createDefaultProject();Object.assign(p.plan,{house:{w:8,h:6,contourDefined:true},rooms:[],walls:[],openings:[],platforms:[]});Object.assign(p.settings.roof,{shape:'gable',type:'cold',ridgeAxis:'x',ridgeHeight:2});const r=calculateProductionCutting(p,calculateProject(p)),e=facadeEnvelope(r,r.surfaces.find(s=>s.exterior&&s.planStart).id),f=createFacade(e,1);f.autoClip=true;return {p,e,f};}
test('coincident and overlapping posts produce editable diagnostics rather than degenerate clipping or NaN geometry',()=>{
 const {e,f}=fixture();
 for(const gap of [0,1,100,150,209]){const draft=structuredClone(f);draft.posts[1]=draft.posts[0]+gap;const before=JSON.stringify(draft);const layout=facadeLayout(draft,e);assert.ok(layout.errors.length);for(const shape of facadeMemberShapes(draft,layout))assert.ok(shape.shape.flat(2).every(Number.isFinite));assert.equal(JSON.stringify(draft),before);}
 const zero={members:[{key:'zero',a:[1,1],b:[1,1],cutWidth:50}]};assert.deepEqual(facadeMemberShapes(f,zero),[]);
});
test('upper horizontal beams move as a complete cap row; all roof slopes and catalog choices remain intact',()=>{
 const {e,f}=fixture(),before=facadeLayout(f,e),cap=before.members.find(m=>m.key.startsWith('cap-'));
 const moved=moveFacadeRow(f,cap.key,cap.a[1]-150,e),after=facadeLayout(moved,e);
 assert.equal(moved.headInsetMm,f.headInsetMm+150);assert.equal(moved.transomMm,f.transomMm);assert.deepEqual(moved.posts,f.posts);assert.deepEqual(moved.windowOverrides,f.windowOverrides);
 for(const m of after.members.filter(m=>m.key.startsWith('cap-'))){const old=before.members.find(v=>v.key===m.key);assert.ok(Math.abs(m.a[1]-(old.a[1]-150))<.001);assert.ok(Math.abs(m.b[1]-(old.b[1]-150))<.001);}
 const extra=appendFacadeTransom(f,1500),key=facadeLayout(extra,e).members.find(m=>m.transomId).key;assert.equal(moveFacadeRow(extra,key,1700,e).transoms[0].zMm,1700);
});
