import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {buildCommercialScope} from '../src/react/calculations/commercial-scope.js';
import {changeEstimateLine} from '../src/react/state/estimate-edits.js';
import {interiorOpeningSlopeLengths} from '../src/react/calculations/internal-model.js';

const section = (c,key) => c.sections.find(s=>s.key===key)?.lines || [];
const ext = p => section(calculateProject(p),'external');
const item = (p,key) => ext(p).find(l=>l.id===`external:${key}`);
function house() {
  const p=createDefaultProject(); p.plan.house={w:10,h:8};p.plan.rooms=[];p.plan.openings=[];
  p.services.externalFinish=true;
  Object.assign(p.settings.external,{plinthEnabled:true});
  return p;
}
test('interior doors only enter enabled internal finishing; drawings and SIP remain unchanged',()=>{
  const p=house();p.services.internalFinish=false;
  p.plan.openings=[{id:'inside',type:'door',doorType:'interior',outer:false,width:.8,height:2,x:2,y:2,orientation:'v'}];
  const before=structuredClone(p.plan),off=calculateProject(p);
  assert.equal(section(off,'openings').length,0);
  assert.equal(section(off,'internal').length,0);
  p.services.internalFinish=true;
  const on=calculateProject(p);
  assert.deepEqual(p.plan,before);
  assert.deepEqual(section(on,'sip'),section(off,'sip'));
  assert.equal(section(on,'openings').length,0);
  for(const key of ['doors','doors-work','doors-fasteners']) {
    const row=section(on,'internal').find(l=>l.id===`internal:${key}`);
    assert.equal(row.qty,1);assert.ok(row.price>0);
  }
  assert.equal(section(on,'internal').find(l=>l.id==='internal:doors-fasteners').catalogId,'MAT-070');
  assert.equal(on.lines.filter(l=>l.catalogId==='MAT-180').length,1);
  assert.ok(section(on,'internal').every(l=>l.catalogId && l.price>0));
  p.services.openings=false;
  assert.deepEqual(section(calculateProject(p),'internal'),section(on,'internal'));
});
test('door slopes count entrance reveals but not interior doors, garage doors or omitted openings',()=>{
  const p=house();p.services.internalFinish=true;
  p.plan.openings=[
    {id:'entry',type:'door',doorType:'entrance',outer:true,width:.9,height:2.1},
    {id:'inside',type:'door',doorType:'interior',width:.8,height:2},
    {id:'garage',type:'door',doorType:'garage',outer:true,width:3,height:2.3},
    {id:'hidden',type:'window',outer:true,width:2,height:1,include:false},
  ];
  assert.deepEqual(interiorOpeningSlopeLengths(p),{windows:0,entranceDoors:5.1,interiorDoors:4.8});
  const rows=section(calculateProject(p),'internal');
  assert.equal(rows.find(l=>l.id==='internal:opening-slopes-work').qty,5.1);
  assert.equal(rows.find(l=>l.id==='internal:opening-slopes-work').catalogId,'LAB-121');
  assert.equal(rows.find(l=>l.id==='internal:doors-fasteners').catalogId,'MAT-070');
  assert.equal(rows.find(l=>l.id==='internal:doors-fasteners').price,450);
  assert.equal(rows.find(l=>l.id==='internal:interior-door-slopes-work'),undefined);
  p.settings.internal.includeInteriorDoorSlopes=true;
  const optional=section(calculateProject(p),'internal');
  assert.equal(optional.find(l=>l.id==='internal:interior-door-slopes-work').qty,4.8);
  assert.equal(optional.filter(l=>l.catalogId==='MAT-208'&&l.id.includes('slopes')).reduce((sum,l)=>sum+l.qty,0),1);
  assert.ok(optional.every(l=>l.catalogId&&l.price>0));
  const reopened=migrateProject(JSON.parse(JSON.stringify(p)));
  assert.equal(reopened.settings.internal.includeInteriorDoorSlopes,true);
  assert.equal(section(calculateProject(reopened),'internal').find(l=>l.id==='internal:interior-door-slopes-work').qty,4.8);
});
test('hidden interior doors do not inflate the linked door quantity',()=>{
  const p=house();p.services.internalFinish=true;
  p.plan.openings=[{type:'door',outer:false,include:false},{type:'door',outer:false,includeInEstimate:false},{type:'door',outer:false}];
  const calc=calculateProject(p);
  assert.equal(calc.inputs.internal.doors,1);
  assert.equal(section(calc,'internal').find(l=>l.id==='internal:doors').qty,1);
});
test('door quantity respects both floors, exclusions and legacy type fallback',()=>{
  const p=house();p.services.internalFinish=true;p.meta.floors=2;
  p.plan.openings=[{type:'door',outer:false},{type:'door',doorType:'garage',outer:false},
    {type:'door',doorType:'interior',includeInEstimate:false},{type:'door',doorType:'entrance',outer:true}];
  p.upperFloors=[{...structuredClone(p.plan),openings:[{type:'door',doorType:'interior',outer:false}]}];
  assert.equal(calculateProject(p).inputs.internal.doors,2);
  p.meta.floors=1;assert.equal(calculateProject(p).inputs.internal.doors,1);
  p.settings.links.internalFinishFromPlan=false;p.settings.internal.doors=7;
  assert.equal(section(calculateProject(p),'internal').find(l=>l.id==='internal:doors-work').qty,7);
});
test('removing interior doors does not shift saved indexes for entrance doors and windows',()=>{
  const p=house();p.plan.openings=[{type:'door',doorType:'interior'},{type:'window',outer:true,width:1,height:1}];
  const lines=section(calculateProject(p),'openings');
  assert.ok(lines.some(l=>l.id==='openings:opening-1'));
  assert.ok(!lines.some(l=>l.id==='openings:opening-0'));
});
test('plinth uses ground perimeter and default .6m, never multiplies by floors',()=>{
  const p=house();let c=calculateProject(p);
  assert.equal(c.exterior.plinthPerimeter,36);assert.equal(c.exterior.plinthArea,21.599999999999998);
  assert.equal(c.exterior.plinthTubeLength,72);assert.equal(c.exterior.plinthTubePurchase,84);
  assert.equal(item(p,'plinth-cover').qty,23.76);assert.equal(item(p,'plinth-cover-work').qty,21.6);
  p.meta.floors=2;p.upperFloors=[structuredClone(p.plan)];c=calculateProject(p);
  assert.equal(c.exterior.plinthTubePurchase,84);assert.equal(item(p,'plinth-cover').qty,23.76);
});
test('plinth materials, manual geometry, rows and verticals update quantities',()=>{
  const p=house();Object.assign(p.settings.external,{plinthAuto:false,plinthPerimeter:20,plinthHeight:1,plinthRows:3,plinthVerticalLength:10,plinthMaterial:'brick'});
  assert.equal(item(p,'plinth-cover').catalogId,'EXT-MAT-BRICK');assert.equal(item(p,'plinth-cover').qty,50);
  assert.equal(item(p,'plinth-tube').qty,78);assert.equal(item(p,'plinth-frame-work').qty,70);
  assert.ok(ext(p).every(l=>l.catalogId && l.price>0 && Number.isFinite(l.qty)));
});
test('existing piles are not charged twice; extra supports require explicit quantity',()=>{
  const p=house(),before=calculateProject(p);
  assert.equal(item(p,'plinth-extra-piles'),undefined);
  p.settings.external.plinthExtraPiles=2;
  const after=calculateProject(p);
  assert.deepEqual(section(after,'foundation'),section(before,'foundation'));
  assert.deepEqual(p.plan.piles,house().plan.piles);
  assert.equal(item(p,'plinth-extra-piles').qty,2);assert.equal(item(p,'plinth-extra-piles-work').qty,2);
});
test('disabled or zero plinth emits no plinth positions; facade remains unchanged',()=>{
  const p=house(),facade=ext(p).filter(l=>!l.id.startsWith('external:plinth-'));
  p.settings.external.plinthEnabled=false;
  assert.deepEqual(ext(p),facade);
  p.settings.external.plinthEnabled=true;p.settings.external.plinthHeight=0;
  assert.deepEqual(ext(p),facade);
  p.services.externalFinish=false;assert.deepEqual(ext(p),[]);
});
test('legacy facade keeps its previous calculations when plinth is added',()=>{
  const p=house();p.settings.external.assemblyVersion=0;p.settings.external.plinthEnabled=false;
  const before=ext(p);p.settings.external.plinthEnabled=true;
  assert.deepEqual(ext(p).filter(l=>!l.id.startsWith('external:plinth-')),before);
  assert.ok(item(p,'plinth-tube'));
});
test('plinth settings and project prices survive save/reopen without changing shared price',()=>{
  let p=house();p.settings.external.plinthHeight=.85;p.settings.external.plinthMaterial='brick';
  const row=item(p,'plinth-tube'),price=p.priceMat.find(i=>i.id===row.catalogId).price;
  changeEstimateLine(p,row,{price:250});
  const reopened=migrateProject(JSON.parse(JSON.stringify(p)));
  assert.equal(reopened.settings.external.plinthHeight,.85);
  assert.equal(reopened.settings.external.plinthMaterial,'brick');
  assert.equal(item(reopened,'plinth-tube').price,250);
  assert.equal(reopened.priceMat.find(i=>i.id===row.catalogId).price,price);
});
test('old projects get a disabled plinth and retain their prices',()=>{
  const p=house();for(const key of Object.keys(p.settings.external))if(key.startsWith('plinth'))delete p.settings.external[key];
  p.priceMat.find(i=>i.id==='MAT-041').price=777;
  const reopened=migrateProject(p);assert.equal(reopened.settings.external.plinthEnabled,false);
  assert.equal(reopened.settings.external.plinthHeight,.6);
  assert.equal(reopened.priceMat.find(i=>i.id==='MAT-041').price,777);
});
test('commercial scope separates interior doors and describes selected plinth',()=>{
  const p=house();p.services.internalFinish=true;p.plan.openings=[{type:'door',doorType:'interior',outer:false,width:.8,height:2}];
  const c=calculateProject(p),scope=buildCommercialScope(p,c);
  assert.ok(JSON.stringify(scope).includes('цоколь 21,6 м²'));
  assert.ok(JSON.stringify(scope).includes('межкомнатные двери с монтажом: 1 шт'));
});
