import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject,migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { gableLinks,combinedWall,purchaseRows,drawingCategory } from '../src/react/calculations/drawing-workbench.js';
import { productionEstimateLines } from '../src/react/calculations/production-estimate.js';
import { roofCoverLayout } from '../src/react/calculations/roof-cover-layout.js';
const base=()=>{const p=createDefaultProject();p.plan={...p.plan,house:{w:5,h:4},wallHeight:2.5,rooms:[],walls:[],openings:[],wallGaps:[],platforms:[]};return p;};
const run=p=>calculateProductionCutting(p,calculateProject(p));
test('gable links match roof axis, highest floor, and wall width without changing parts or estimate',()=>{
 const p=base(),r=run(p),snapshot=JSON.stringify(r),total=calculateProject(p).totals.total;
 const links=gableLinks(r);assert.equal(links.filter(l=>l.wall).length,2);
 for(const l of links){assert.equal(l.wall.floor,l.gable.floor);const d=combinedWall(r,l.wall,links);assert.equal(d.parts.length,r.parts.filter(s=>[l.wall.id,l.gable.id].includes(s.surfaceId)).length);assert.ok(d.members.some(m=>m.surfaceId===l.gable.id));assert.equal(combinedWall(r,l.wall,links,'wall').members.some(m=>m.surfaceId===l.gable.id),false);}
 assert.equal(JSON.stringify(r),snapshot);assert.equal(calculateProject(p).totals.total,total);
});
test('stale manual gable link never silently falls back to automatic and survives migration',()=>{
 const p=base(),r=run(p),l=gableLinks(r)[0];p.settings.productionCutting.gableLinks={[l.gable.layoutKey]:{wallKey:'missing',offset:123,elevation:2700,reverse:true}};
 const saved=migrateProject(JSON.parse(JSON.stringify(p)));assert.deepEqual(saved.settings.productionCutting.gableLinks,p.settings.productionCutting.gableLinks);
 const linked=gableLinks(r,saved.settings.productionCutting.gableLinks)[0];assert.equal(linked.wall,undefined);assert.equal(linked.stale,true);
});
test('unassigned manual gable and mixed roof do not get an inferred association',()=>{
 const r=run(base()),g=r.surfaces.find(s=>s.id==='ФР-1');
 assert.equal(gableLinks(r,{[g.layoutKey]:{wallKey:''}})[0].wall,undefined);
 r.assembly.roofShape='tiered';assert.ok(gableLinks(r).every(l=>!l.wall));
});
test('procurement groups stock not finished parts, retaining all assigned instances',()=>{
 const r=run(base()),rows=purchaseRows(r);assert.equal(rows.reduce((n,r)=>n+r.qty,0),r.panelStock.sheets.length+r.timberStock.bars.length);assert.ok(rows.every(r=>r.qty>0&&Number.isInteger(r.qty)));
 assert.equal(drawingCategory({id:'Э2-ПГ3'}),'partitions');assert.equal(drawingCategory({id:'Э2-ПТ'}),'ceiling');
});
test('support material is opt-in, follows geometry, and never changes the global catalog',()=>{
 const p=base(),s={id:'support',type:'purlin',name:'Прогон',profile:'100×150',x1:0,y1:0,z1:2500,x2:4000,y2:0,z2:2500,nodeRef:'КР-1',estimateCatalogId:'MAT-018'};
 p.settings.productionCutting.roofSupports=[s];const total=calculateProject(p).totals.total,prices=JSON.stringify(p.priceMat);
 assert.equal(productionEstimateLines(p).length,0);s.estimateEnabled=true;
 const row=productionEstimateLines(p)[0];assert.equal(row.qty,.06);assert.equal(row.price,26400);assert.ok(Math.abs(calculateProject(p).totals.total-total-1584)<.01);
 s.x2=6000;assert.equal(productionEstimateLines(p)[0].qty,.09);assert.equal(JSON.stringify(p.priceMat),prices);
 s.referenceOnly=true;assert.equal(productionEstimateLines(p).length,0);assert.equal(run(p).members.some(m=>m.source==='Проектная опора'),false);
});
test('roof sheet rows use useful width and overlap; stock is distinct from covered area',()=>{
 const r=run(base()),blank=roofCoverLayout(r.assembly,{});assert.equal(blank.configured,false);
 const cover=roofCoverLayout(r.assembly,{usefulWidth:1000,grossWidth:1100,stockLength:2000,overlap:200});
 assert.equal(cover.issues.length,0);assert.equal(cover.slopes.length,2);
 for(const s of cover.slopes){assert.equal(s.columns,Math.ceil(s.width/1000));assert.equal(s.rows,Math.max(1,Math.ceil((s.length-200)/1800)));assert.equal(s.sheets.length,s.columns*s.rows);assert.ok(s.stockArea>=s.netArea);}
 assert.ok(roofCoverLayout(r.assembly,{usefulWidth:1200,grossWidth:1000}).issues.length);
});
test('invalid stale links block approval and dimensions survive project migration',()=>{
 const p=base(),r=run(p),g=r.surfaces.find(s=>s.id==='ФР-1');p.settings.productionCutting.gableLinks={[g.layoutKey]:{wallKey:'missing'}};
 assert.ok(run(p).issues.some(i=>i.code==='GABLE_LINK'));
 p.settings.productionCutting.drawingDimensions={wall:[{id:'a',a:[0,0],b:[1000,2000],offset:[10,30]}]};
 assert.deepEqual(migrateProject(p).settings.productionCutting.drawingDimensions,p.settings.productionCutting.drawingDimensions);
});

test('generated roof member overrides retain geometry and reject invalid profiles',()=>{
 const p=base(),r=run(p),m=r.members.find(m=>m.key?.startsWith('detail:')&&m.material==='Стропила')||r.members.find(m=>m.key?.startsWith('detail:'));
 assert.ok(m);p.settings.productionCutting.memberOverrides={[m.key]:{length:m.length+100,nodeRef:'КР-1'}};
 const changed=run(p).members.find(n=>n.key===m.key);assert.equal(changed.length,m.length+100);assert.equal(changed.geometricLength,m.length);assert.deepEqual(changed.a,m.a);
 p.settings.productionCutting.memberOverrides[m.key].profile='0×150';assert.ok(run(p).issues.some(i=>i.code==='MEMBER_OVERRIDE'));
});

test('identical roof stock is grouped across slopes',()=>{
 const r=run(base());r.roofCover=roofCoverLayout(r.assembly,{usefulWidth:1000,grossWidth:1100,stockLength:2000,overlap:200});
 const rows=purchaseRows(r).filter(r=>r.id.startsWith('cover:'));assert.equal(rows.length,1);assert.equal(rows[0].qty,r.roofCover.slopes.reduce((n,s)=>n+s.sheets.length,0));assert.equal(rows[0].ids.length,rows[0].qty);
});
