import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject,migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { createProjectRelease,verifyRelease,archiveRelease,openReleaseArchive,catalogAudit,releaseValidation,registerCsv,sealReleaseManifest,groupStockMaps,releaseFiles,releaseZip } from '../src/react/calculations/project-release.js';
import { unzipSync,strFromU8 } from 'fflate';
import { productionView } from '../src/react/calculations/production-views.js';
import { productionScene } from '../src/react/calculations/production-scene.js';
const fixture=()=>{const p=createDefaultProject();p.plan={...p.plan,house:{w:5,h:4},rooms:[],walls:[],openings:[],wallGaps:[],platforms:[],pileRows:[],piles:[],bindingLines:[],wallHeight:2.5};p.settings.productionCutting.kerfMm=3;p.settings.productionCutting.endAllowanceMm=0;p.settings.productionCutting.counterLathProfile='50×50';return p;};
test('release does not mutate live geometry, prices, marks or estimate',async()=>{
 const p=fixture(),before=structuredClone(p),total=calculateProject(p).totals.total,r=await createProjectRelease(p);
 assert.deepEqual(p,before);assert.equal(r.calculation.totals.total,total);assert.ok(Object.isFrozen(r.project.plan));assert.ok(await verifyRelease(r));
 p.plan.house.w=99;p.priceMat[0].price=1;assert.equal(r.project.plan.house.w,5);assert.ok(await verifyRelease(r));
});
test('every production position occurs exactly once in registers and packaging',async()=>{
 const r=await createProjectRelease(fixture()),all=[...r.report.parts,...r.report.members.filter(m=>!m.excluded)],rows=[...r.registers.panels,...r.registers.timber];
 assert.equal(rows.reduce((n,g)=>n+g.qty,0),all.length);assert.deepEqual(rows.flatMap(g=>g.ids).sort(),all.map(p=>p.id).sort());
 assert.deepEqual(r.registers.packaging.flatMap(g=>g.ids).sort(),all.map(p=>p.id).sort());
 for(const row of rows)for(const id of row.ids)assert.equal(all.find(m=>m.id===id).displayMark,row.mark);
 assert.equal(new Set(rows.map(r=>r.mark)).size,rows.length);assert.ok(registerCsv(r,'panels').includes(r.digest));
});
test('compressed archives survive old project migration and JSON reopen without live recalculation',async()=>{
 const r=await createProjectRelease(fixture()),a=archiveRelease(r);const p=fixture();p.documentation.releases.push(a);
 const restored=migrateProject(JSON.parse(JSON.stringify(p)));assert.deepEqual(await openReleaseArchive(restored.documentation.releases[0]),r);
 assert.ok(a.data.length<JSON.stringify(r).length/2);delete p.documentation;assert.deepEqual(migrateProject(p).documentation.releases,[]);
});
test('corrupt archive or altered snapshot cannot be exported as verified',async()=>{
 const r=await createProjectRelease(fixture()),changed=structuredClone(r);changed.report.parts[0].width++;
 assert.equal(await verifyRelease(changed),false);const bad=archiveRelease(changed);await assert.rejects(()=>openReleaseArchive(bad),/Целостность/);
});
test('release mode cannot bypass incomplete AR/catalog model or open checks',async()=>{
 const p=fixture(),r=await createProjectRelease(p);assert.equal(r.validation.canRelease,false);
 assert.ok(r.validation.blocks.some(b=>b.code==='AR_VIEWS'));assert.ok(r.validation.blocks.some(b=>b.code==='CATALOG_MAPPING'));
 await assert.rejects(()=>createProjectRelease(p,{mode:'released'}),/Выпуск заблокирован/);
});
test('missing prices, catalog ids, unit mismatch and fractional package quantities are explicit',()=>{
 const p=fixture();const c={lines:[{id:'a',kind:'material',catalogId:'none',unit:'шт',qty:1.1,price:0},{id:'b',kind:'labor',catalogId:p.priceLab[0].id,unit:'НЕ ТА',qty:1,price:100}]};const rows=catalogAudit(p,c);
 assert.equal(rows[0].issues.length,3);assert.ok(rows[1].issues.length);const m=p.priceMat.find(x=>x.unit==='м3');assert.equal(catalogAudit(p,{lines:[{kind:'material',catalogId:m.id,unit:'м³',qty:1,price:100} ]})[0].issues.length,0);
});
test('revision-specific confirmations go stale and unplaced stock cannot be waived',async()=>{
 const p=fixture(),r=await createProjectRelease(p);p.documentation.confirmations=[{key:'loads',revision:r.report.revision,evidence:'РС-1',reviewer:'Конструктор'}];
 assert.equal(releaseValidation(p,r.calculation,r.report).blocks.some(b=>b.message.startsWith('Снег, ветер')),false);
 const changed=structuredClone(r.report);changed.revision+='new';changed.timberStock.unplaced.push('Д999');
 const validation=releaseValidation(p,r.calculation,changed);assert.ok(validation.blocks.some(b=>b.code==='ENGINEERING'&&b.message.startsWith('Снег, ветер')));assert.ok(validation.blocks.some(b=>b.code==='UNPLACED'));
});
test('later archive compares changed sections without embedding previous snapshots recursively',async()=>{
 const p=fixture(),first=await createProjectRelease(p);p.documentation.releases=[archiveRelease(first)];p.plan.house.w=6;
 const second=await createProjectRelease(p);assert.equal(second.number,2);assert.equal(second.project.documentation.releases.length,0);assert.ok(second.changes.some(r=>r.section==='plan'));
});
test('manifest is sealed into the snapshot and rejects missing metadata or duplicate sheet ids',async()=>{
 const r=await createProjectRelease(fixture()),meta={id:'КД01',group:'КД',title:r.report.surfaces[0].name,scale:'не в масштабе',units:'мм',direction:'по локатору',axes:'не назначены'};
 const sealed=await sealReleaseManifest(r,[meta]);assert.ok(await verifyRelease(sealed));assert.notEqual(sealed.digest,r.digest);assert.ok(sealed.registers.panels.some(row=>row.sheetIds.includes('КД01')));
 await assert.rejects(()=>sealReleaseManifest(r,[meta,meta]),/Неполная/);await assert.rejects(()=>sealReleaseManifest(r,[{id:'АР1'}]),/Неполная/);
});
test('stock map grouping preserves physical blanks while showing identical layouts once',()=>{
 const stock=[{id:'Л1',material:'pps',width:1250,height:2500,parts:[{id:'a',displayMark:'П1',x:0,y:0,width:1250,height:2500}]},{id:'Л2',material:'pps',width:1250,height:2500,parts:[{id:'b',displayMark:'П1',x:0,y:0,width:1250,height:2500}]}];
 const groups=groupStockMaps(stock,'panel');assert.equal(groups.length,1);assert.equal(groups[0].qty,2);assert.deepEqual(groups[0].ids,['Л1','Л2']);
 stock[1].parts[0].displayMark='П2';assert.equal(groupStockMaps(stock,'panel').length,2);
});
test('even rehashed imported released status cannot bypass completeness checks',async()=>{
 const r=await createProjectRelease(fixture()),changed=structuredClone(r);changed.status='released';const {digest,...payload}=changed;
 const {releaseDigest}=await import('../src/react/calculations/project-release.js');changed.digest=await releaseDigest(payload);
 await assert.rejects(()=>openReleaseArchive(archiveRelease(changed)),/статус выпуска/);
});
test('positive purchasing shortage cannot be closed with only a note',async()=>{
 const p=fixture(),r=await createProjectRelease(p),row={key:'shortage',name:'Доска',unit:'м³',required:1,purchased:.5,difference:.5,status:'compared'};
 const report={...r.report,reconciliation:[row]};p.documentation.resolutions=[{key:'shortage',revision:report.revision,evidence:'Письмо',reviewer:'Проверяющий'}];
 assert.ok(releaseValidation(p,r.calculation,report).blocks.some(b=>b.code==='RECONCILIATION'));
});
test('all machine-readable files and ZIP refer to the same snapshot and do not substitute procurement',async()=>{
 const r=await createProjectRelease(fixture()),files=releaseFiles(r),zip=unzipSync(releaseZip(r));
 assert.deepEqual(Object.keys(zip).sort(),Object.keys(files).sort());assert.equal(JSON.parse(strFromU8(zip['release.json'])).digest,r.digest);
 for(const name of ['panels.csv','timber.csv','catalog.csv','reconciliation.csv'])assert.ok(strFromU8(zip[name]).includes(r.digest));
 assert.deepEqual(JSON.parse(strFromU8(zip['source.eft.json'])).settings,r.project.settings);
});
test('catalog audit uses existing calculated screw weights instead of treating kg-to-piece conversion as an error',()=>{
 const p=fixture(),calculation=calculateProject(p),rows=catalogAudit(p,calculation);
 assert.ok(rows.some(r=>r.conversion));for(const row of rows.filter(r=>r.conversion)){assert.equal(row.conversion.unit,'кг/шт');assert.equal(row.issues.length,0);assert.ok(row.conversion.source.includes('structuralBreakdown'));}
});
test('legacy archive metadata is safe to display and CSV text is not a spreadsheet formula',async()=>{
 const r=await createProjectRelease(fixture()),a=archiveRelease(r);delete a.date;a.revision=null;a.number='bad';
 const p=fixture();p.documentation.releases=[a];const restored=migrateProject(p);
 assert.equal(restored.documentation.releases[0].date,'');assert.equal(restored.documentation.releases[0].revision,'');
 assert.equal((await openReleaseArchive(restored.documentation.releases[0])).digest,r.digest);
 const changed=structuredClone(r);changed.projectNumber=' =1+1';
 assert.ok(registerCsv(changed,'panels').includes('"\' =1+1"'));assert.ok(releaseFiles(changed)['catalog.csv'].includes('"\' =1+1"'));
});
test('compact presentation is part of the immutable release; detailed and legacy archives stay compatible',async()=>{
 const p=fixture(),compact=await createProjectRelease(p),full=await createProjectRelease(p,{presentation:'full'});
 assert.equal(compact.presentation.mode,'compact');assert.equal(full.presentation.mode,'full');
 assert.equal(compact.calculation.totals.total,full.calculation.totals.total);
 assert.deepEqual(compact.registers,full.registers);assert.notEqual(compact.digest,full.digest);
 assert.equal((await openReleaseArchive(archiveRelease(full))).presentation.mode,'full');
});
test('printable 3D views use only actual model elements and preserve source geometry and quantities',async()=>{
 const p=fixture(),r=await createProjectRelease(p),before=JSON.stringify(r),scene=productionScene(r.report,r.project),ids=new Set([...scene.panels,...scene.beams].map(p=>p.id));
 const v=productionView(r.report,r.project);assert.ok(v.faces.length>r.report.parts.length);
 for(const f of v.faces){assert.ok(ids.has(f.id));assert.ok(f.rings.flat().every(p=>p.every(Number.isFinite)));}
 assert.ok(v.viewBox.every(Number.isFinite));assert.equal(JSON.stringify(r),before);
 const frame=productionView(r.report,r.project,{frame:true,layers:['walls']});
 const boards=new Set(scene.panels.filter(p=>p.timber).map(p=>p.id));assert.ok(frame.faces.every(f=>boards.has(f.id)&&f.layer==='walls'));
 assert.equal(productionView(r.report,r.project,{layers:[]}).faces.length,0);
 assert.notDeepEqual(productionView(r.report,r.project,{yaw:145}).viewBox,v.viewBox);
 const surfaceId=r.report.parts[0].surfaceId,idsOnSurface=new Set([...r.report.parts,...r.report.members].filter(p=>p.surfaceId===surfaceId).map(p=>p.id));
 assert.ok(productionView(r.report,r.project,{surfaceIds:[surfaceId]}).faces.every(f=>idsOnSurface.has(f.id)));
 const withHole=structuredClone(r.report);withHole.parts[0].shape=[[[0,0],[1000,0],[1000,1000],[0,1000],[0,0]],[[300,300],[300,600],[600,600],[600,300],[300,300]]];
 assert.ok(productionView(withHole,r.project).faces.some(f=>f.id===withHole.parts[0].id&&f.rings.length===2));
});
test('multi-view sheets link grouped production marks by surface IDs, not display titles',async()=>{
 const r=await createProjectRelease(fixture()),s=r.report.surfaces.find(s=>r.report.parts.some(p=>p.surfaceId===s.id));
 const sealed=await sealReleaseManifest(r,[{id:'КД01',group:'КД',title:'Развёртки · 1',surfaceIds:[s.id],scale:'не в масштабе',units:'мм',direction:'по виду',axes:'не назначены'}]);
 const rows=sealed.registers.panels.filter(row=>row.ids.some(id=>r.report.parts.find(p=>p.id===id)?.surfaceId===s.id));assert.ok(rows.length);assert.ok(rows.every(row=>row.sheetIds.includes('КД01')));
});
test('3D binding package shows every saved layer without creating extra procurement',async()=>{
 const r=await createProjectRelease(fixture()),report=structuredClone(r.report);report.assembly.binding=[{id:'ОБ1',a:[0,0],b:[5000,0],profile:'50×150',layers:3}];
 const beams=productionScene(report,r.project).beams.filter(b=>b.layer==='binding');assert.equal(beams.length,3);
 assert.deepEqual(beams.map(b=>b.a[1]),[-50,0,50]);assert.ok(beams.every(b=>b.id==='ОБ1'));assert.equal(report.assembly.binding.length,1);
});
