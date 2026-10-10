import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject,migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { gableLinks,combinedWall,purchaseRows,drawingCategory } from '../src/react/calculations/drawing-workbench.js';
import { productionEstimateLines } from '../src/react/calculations/production-estimate.js';
import { calculateDeliveryVolume } from '../src/react/calculations/delivery-volume.js';
import { roofCoverLayout } from '../src/react/calculations/roof-cover-layout.js';
import { projectOnSupport } from '../src/react/calculations/assembly-placement.js';
import { snapAssemblyPoint } from '../src/react/calculations/roof-drawings.js';
const base=()=>{const p=createDefaultProject();p.plan={...p.plan,house:{w:5,h:4},wallHeight:2.5,rooms:[],walls:[],openings:[],wallGaps:[],platforms:[]};return p;};
const run=p=>calculateProductionCutting(p,calculateProject(p));
test('SIP gables retain clipped panel polygons and appear in combined wall views',()=>{
 const p=base();p.settings.roof.gableType='sip';const r=run(p);
 const gs=r.surfaces.filter(s=>s.id.startsWith('ФР-'));assert.equal(gs.length,2);
 for(const g of gs){assert.equal(g.frameOnly,false);const panels=r.parts.filter(part=>part.surfaceId===g.id);assert.ok(panels.length>0);assert.ok(panels.every(part=>part.shape?.length&&Number(part.thickness)===Number(p.settings.sip.wallThickness)));const link=gableLinks(r).find(l=>l.gable.id===g.id);assert.ok(combinedWall(r,link.wall,gableLinks(r),'combined').parts.some(part=>part.surfaceId===g.id));}
 assert.equal(migrateProject(JSON.parse(JSON.stringify(p))).settings.roof.gableType,'sip');
});
test('combined roof gable end materials agree with estimate and respect automatic defaults',()=>{
 for(const sides of [{first:'sip',second:'frame'},{first:'frame',second:'sip'},{first:'auto',second:'auto'}]){
 const p=base();p.settings.roof.type='combo';p.settings.roof.gableType='cold';p.settings.roof.gableSideTypes=sides;const r=run(p);
 for(const [index,key] of ['first','second'].entries()){const g=r.surfaces.find(s=>s.id===`ФР-${index+1}`);assert.equal(g.frameOnly,sides[key]!=='sip');assert.equal(r.parts.some(part=>part.surfaceId===g.id),sides[key]==='sip');}
 }
});
test('cold and excluded gables are not silently converted to SIP',()=>{
 const p=base();p.settings.roof.gableType='cold';let r=run(p);assert.ok(r.surfaces.filter(s=>s.id.startsWith('ФР-')).every(s=>s.frameOnly));assert.equal(r.parts.some(part=>part.surfaceId.startsWith('ФР-')),false);
 p.settings.roof.gableType='none';r=run(p);assert.equal(r.surfaces.some(s=>s.id.startsWith('ФР-')),false);
});
test('post placement projects onto beam and interpolates height without changing source',()=>{
 const b={a:[0,0,2500],b:[4000,0,3500]};assert.deepEqual(projectOnSupport(b,2000,120),{x:2000,y:0,z:3000,t:.5});assert.equal(projectOnSupport(b,6000,0).x,4000);assert.equal(b.a[2],2500);
});
test('plan placement snaps to the middle of a panel connector',()=>{
 const a={floors:[],rafters:[],supports:[],piles:[],panelConnectors:[{a:[100,0],b:[100,4000]}]};assert.deepEqual(snapAssemblyPoint(a,110,1500,50),[100,1500]);
});
test('plan nodes and post upper connection persist; missing upper member is diagnosed',()=>{
 const p=base();p.settings.productionCutting.assemblyNodes=[{id:'n',x:100,y:200,floor:1,nodeRef:'КР-1'}];
 p.settings.productionCutting.roofSupports=[{id:'post',type:'post',profile:'100×150',x1:100,y1:100,z1:0,x2:100,y2:100,z2:2500,nodeRef:'КР-1',upperSupport:'missing'}];
 const saved=migrateProject(JSON.parse(JSON.stringify(p))),r=run(saved);assert.equal(r.assembly.nodes[0].nodeRef,'КР-1');assert.ok(r.assembly.floorPanelLayers.length);assert.equal(saved.settings.productionCutting.roofSupports[0].upperSupport,'missing');assert.ok(r.issues.some(i=>i.message.includes('верхний прогон')));
});
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
test('manual cutting part is opt-in, survives migration, and enters estimate and cargo volume once',()=>{
 const p=base(),price=p.priceMat.find(row=>row.id==='MAT-018');
 p.settings.productionCutting.manualParts=[{id:'special',name:'Доска усиления',profile:'145×90',length:1200,quantity:2,estimateCatalogId:price.id}];
 const before=calculateProject(p).totals.total;
 assert.equal(productionEstimateLines(p).length,0);
 p.settings.productionCutting.manualParts[0].estimateEnabled=true;
 const saved=migrateProject(JSON.parse(JSON.stringify(p)));
 const rows=productionEstimateLines(saved);
 assert.equal(rows.length,1);
 assert.equal(rows[0].qty,.03132);
 assert.equal(rows[0].price,price.price);
 const result=calculateProject(saved);
 assert.ok(Math.abs(result.totals.total-before-.03132*price.price)<.01);
 const cargo=calculateDeliveryVolume(saved,result);
 assert.ok(cargo.categories.some(group=>group.key==='timber'&&group.rows.some(row=>row.id==='production-manual-special'&&row.volume===.03132)));
 assert.equal(saved.priceMat.find(row=>row.id===price.id).price,price.price);
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
 const rows=purchaseRows(r).filter(r=>r.id.startsWith('cover:'));assert.equal(rows.length,1);assert.equal(rows[0].qty,r.roofCover.slopes.reduce((n,s)=>n+s.sheets.length,0));assert.equal(rows[0].ids.length,rows[0].qty);assert.equal(new Set(rows[0].ids).size,rows[0].qty);
});
