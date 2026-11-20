import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {generateAutoPileRows,bindingLinesWithManual} from '../src/react/calculations/foundation-model.js';
import {foundationAxisContour} from '../src/react/calculations/foundation-reference.js';
import {bindingPlanRows} from '../src/react/calculations/binding-rows.js';
import {createBearingTruss,expandBearingTrusses} from '../src/react/calculations/bearing-truss.js';
import {resolvePlan3DSelection} from '../src/react/calculations/plan-3d-selection.js';
import {timberProcurement} from '../src/react/calculations/timber-procurement.js';
import {scopedWorkbenchItems,scopedWorkbenchStock} from '../src/react/screens/workbench-model.js';
const run=p=>{const c=calculateProject(p);return {c,r:calculateProductionCutting(p,c)};};
const fixture=()=>{const p=createDefaultProject();p.plan={...p.plan,house:{w:10,h:3.75},rooms:[],walls:[],openings:[],wallGaps:[],platforms:[],piles:[],excludedPiles:[],pileRows:[],bindingLines:[]};p.settings.sip.wallThickness='174';return p;};
function align(p,reference='outer'){p.settings.piles.layoutReference=reference;p.plan.pileRows=generateAutoPileRows(p.plan,2.5,{mode:'contour',reference,wallThicknessMm:p.settings.sip.wallThickness});p.plan.bindingLines=bindingLinesWithManual(p.plan,p.plan.pileRows);}

test('bearing axes preserve the outer house and give a shared 87mm datum to piles, binding and walls',()=>{
 const p=fixture(),house=JSON.stringify(p.plan.house);align(p);const old=run(p);assert.ok(old.r.assembly.bindingAlignment.every(a=>a.offsetMm===87));
 align(p,'wallAxes');const {c,r}=run(p);assert.equal(JSON.stringify(p.plan.house),house);assert.ok(r.assembly.bindingAlignment.every(a=>a.offsetMm<.01&&a.overlapMm===150));
 assert.ok(c.foundation.points.every(p=>p.x>=.087-1e-8&&p.x<=9.913+1e-8&&p.y>=.087-1e-8&&p.y<=3.663+1e-8));
 assert.ok(c.foundation.bindingLength<old.c.foundation.bindingLength);assert.deepEqual(p.priceMat,fixture().priceMat);
 const restored=migrateProject(JSON.parse(JSON.stringify(p)));assert.equal(restored.settings.piles.layoutReference,'wallAxes');assert.deepEqual(run(restored).c.foundation.points,c.foundation.points);
});

test('rectangular package boards use butt lengths shared by 3D rows and fabrication, not node-to-node lengths',()=>{
 const p=fixture();align(p,'wallAxes');const {r}=run(p),h=r.assembly.binding.find(m=>Math.abs(m.a[1]-m.b[1])<1),v=r.assembly.binding.find(m=>Math.abs(m.a[0]-m.b[0])<1);
 const horizontal=bindingPlanRows(h),vertical=bindingPlanRows(v);assert.equal(horizontal[0].a[0],12);assert.equal(horizontal[0].b[0],9988);
 assert.equal(Math.min(vertical[0].a[1],vertical[0].b[1]),162);assert.equal(Math.max(vertical[0].a[1],vertical[0].b[1]),3588);
 for(const m of r.assembly.binding)for(const [i,row]of bindingPlanRows(m).entries()){const member=r.members.find(p=>p.id===`${m.id}-${i+1}`);assert.deepEqual(member.a,row.a);assert.deepEqual(member.b,row.b);assert.equal(member.length,Math.ceil(Math.hypot(row.b[0]-row.a[0],row.b[1]-row.a[1])));}
 const items=scopedWorkbenchItems(r,{category:'binding'}),stock=scopedWorkbenchStock(r,items,{scope:'surface',category:'binding'}),register=timberProcurement(p,run(p).c,stock,{source:'cutting'});
 assert.ok(register.detailRows.some(r=>r.name==='Доска пакета обвязки'&&r.qty===12&&r.volumeM3>0));
});

test('axis alignment handles reversed and concave contours and retains explicit manual bindings',()=>{
 const p=fixture();p.plan.house.points=[[0,0],[10,0],[10,6],[6,6],[6,4],[0,4]].map(([x,y])=>({x,y}));p.plan.house.h=6;
 const ring=foundationAxisContour(p.plan,174);assert.equal(ring.length,6);assert.ok(Math.abs(ring[0].x-.087)<1e-8);assert.ok(Math.abs(ring[4].x-6.087)<1e-8);
 const reverse=foundationAxisContour({...p.plan,house:{...p.plan.house,points:[...p.plan.house.points].reverse()}},174);assert.ok(ring.every(a=>reverse.some(b=>Math.hypot(a.x-b.x,a.y-b.y)<1e-8)));
 const manual={id:'manual',x1:1,y1:1,x2:3,y2:1,auto:false};p.plan.bindingLines=[manual];align(p,'wallAxes');assert.deepEqual(p.plan.bindingLines.find(l=>l.id==='manual'),manual);
 assert.throws(()=>foundationAxisContour({...p.plan,house:{points:[{x:0,y:0},{x:4,y:1},{x:0,y:4}]}},174),/наклонных стен/);
});

test('bearing truss has only upper and lower chords and vertical posts; takeoff contains no diagonal braces',()=>{
 const p=fixture();p.settings.roof.shape='flat';p.settings.roof.type='cold';p.settings.roof.flatSlopeMode='tapered';p.settings.roof.flatSlopePercent=10;align(p);const before=run(p),axis=createBearingTruss(p,before.r.assembly);p.settings.productionCutting.roofSupports.push(axis);
 const rows=expandBearingTrusses([axis],6000);assert.ok(rows.some(r=>r.trussRole==='upperChord'));assert.ok(rows.some(r=>r.trussRole==='lowerChord'));assert.ok(rows.some(r=>r.type==='post'));assert.ok(!rows.some(r=>r.type==='brace'));assert.ok(rows.filter(r=>r.type==='post').every(r=>r.x1===r.x2&&r.y1===r.y2));
 const {c,r}=run(p);assert.equal(r.assembly.supports.filter(s=>s.bearingTrussId===axis.id).length,rows.length);assert.equal(c.lines.filter(l=>l.id.startsWith(`production-support-${axis.id}:`)).length,rows.length);
});

test('3D selection resolves panels, beams, binding and platform deck with actual dimensions',()=>{
 const p=fixture();p.services.terrace=true;p.plan.platforms=[{id:'t',x:0,y:3.75,w:4,h:2,kind:'terrace',include:true,roof:{mode:'cold',shape:'shed'}}];align(p);const {r}=run(p);
 const part=r.parts[0],picked=resolvePlan3DSelection(r,p,part.id);assert.equal(picked.width,part.width);assert.equal(picked.height,part.height);assert.equal(picked.thickness,part.thickness);
 const binding=resolvePlan3DSelection(r,p,r.assembly.binding[0].id);assert.equal(binding.bundleLayers,3);assert.equal(binding.width,150);
 const deck=resolvePlan3DSelection(r,p,'platform:t:deck');assert.equal(deck.platformId,'t');assert.equal(deck.width,4000);assert.equal(deck.height,2000);
 p.plan.platforms[0].deckEnabled=false;p.plan.platforms[0].joistsEnabled=false;const next=run(migrateProject(JSON.parse(JSON.stringify(p))));assert.ok(!next.c.lines.some(l=>['terrace:deck','terrace:frame'].includes(l.id)));assert.equal(next.r.assembly.platforms[0].frameMembers.length,0);
});
