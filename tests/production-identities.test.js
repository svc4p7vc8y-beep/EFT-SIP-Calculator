import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { normalizeProductionCutting } from '../src/react/state/production-cutting.js';
import { normalizeMarkRegistry, recordProductionRegistry } from '../src/react/state/production-identities.js';
import { assignProductionMarks, calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';

const panel = (id, w=500) => ({id,family:'pps',thickness:174,width:w,height:1000,x:0,y:0,shape:[[[0,0],[w,0],[w,1000],[0,1000],[0,0]]]});
const member = (id,length=1000) => ({id,material:'Доска',profile:'50×150',length,cutLength:length,source:'Тест'});
const report = p => calculateProductionCutting(p,calculateProject(p));
const fixture = () => {
  const p=createDefaultProject();
  p.plan={...p.plan,house:{w:3,h:6},rooms:[],walls:[],openings:[],wallGaps:[],platforms:[],wallHeight:2.8};
  p.settings.productionCutting.manualParts=[{id:'timber-a',name:'Доска ручная',profile:'50×150',length:1000,quantity:2}];
  p.settings.productionCutting.manualPanels=[{id:'panel-a',name:'Ручная панель',family:'pps',thickness:174,quantity:2,contour:'[[[0,0],[500,0],[500,1000],[0,1000],[0,0]]]'}];
  return p;
};

test('saved group marks survive insertions, reordering and identical additional instances',()=>{
  const a=panel('a'),b=panel('b',600),m=member('m');
  const ledger=assignProductionMarks([a,b],[m]);
  const newer=[panel('new',700),panel('b',600),panel('a'),panel('copy')],members=[member('new',2000),member('m')];
  assignProductionMarks(newer,members,ledger);
  assert.deepEqual(newer.map(p=>p.displayMark),['П3','П2','П1','П1']);
  assert.deepEqual(members.map(m=>m.displayMark),['Д2','Д1']);
});
test('removed marks stay reserved, restored definitions recover their mark',()=>{
  const ledger=assignProductionMarks([panel('a'),panel('b',600)],[]);
  const next=assignProductionMarks([panel('c',700)],[],ledger);
  const restored=panel('a');assignProductionMarks([restored],[],next);
  assert.equal(restored.displayMark,'П1');assert.equal(next.entries.at(-1).mark,'П3');
});
test('material, thickness, treatment and notch changes produce different definitions',()=>{
  const parts=[panel('a')],ms=[member('m')];const ledger=assignProductionMarks(parts,ms);
  const altered={...panel('b'),thickness:224};const timber={...member('n'),notches:[{type:'brace',offsetMm:10,lengthMm:150,depthMm:20}]};
  assignProductionMarks([altered],[timber],ledger);
  assert.equal(altered.displayMark,'П2');assert.equal(timber.displayMark,'Д2');
});
test('manual source position IDs survive reorder and resize, technical IDs remain legacy',()=>{
  const p=fixture(),before=report(p);const first=before.parts.find(x=>x.sourceRef?.id==='panel-a');
  const mt=before.members.find(x=>x.sourceRef?.id==='timber-a');
  assert.ok(first);assert.ok(mt);assert.equal(first.id,'РП-1-1-P1');assert.equal(mt.id,'Р-1-1');
  p.settings.productionCutting.markRegistry=before.markRegistry;
  p.settings.productionCutting.manualParts.unshift({id:'new',name:'Доска новая',profile:'50×150',length:800,quantity:1});
  p.settings.productionCutting.manualParts[1].length=1200;
  p.settings.productionCutting.manualPanels.unshift({...p.settings.productionCutting.manualPanels[0],id:'new-panel'});
  const after=report(p),updated=after.members.find(x=>x.sourceRef?.id==='timber-a');
  assert.equal(after.parts.find(x=>x.sourceRef?.id==='panel-a').persistentId,first.persistentId);
  assert.equal(updated.persistentId,mt.persistentId);assert.notEqual(updated.displayMark,mt.displayMark);
  assert.notEqual(updated.id,mt.id);
});
test('automatic panels are not misrepresented as stable physical identities',()=>{
  const r=report(fixture());for(const part of r.parts.filter(p=>!p.sourceRef)){assert.equal(part.identityStatus,'derived-position');assert.equal(part.persistentId,undefined);}
});
test('missing legacy source IDs stay unconfirmed through repeated normalization',()=>{
  const s=normalizeProductionCutting({manualParts:[{name:'Доска',profile:'50×150',length:1000,quantity:1}],manualPanels:[{name:'Панель'}],roofSupports:[{}]});
  for(const key of ['manualParts','manualPanels','roofSupports'])assert.equal(normalizeProductionCutting(s)[key][0].hasStableSourceId,false);
});
test('registry persists through JSON migration without changing calculation or approval revision',()=>{
  const p=fixture(),before=report(p),estimate=calculateProject(p);
  const migratedBaseline=report(migrateProject(JSON.parse(JSON.stringify(p))));
  p.settings.productionCutting.markRegistry=before.markRegistry;
  const restored=migrateProject(JSON.parse(JSON.stringify(p))),after=report(restored);
  assert.deepEqual(restored.settings.productionCutting.markRegistry,before.markRegistry);
  assert.equal(report(p).revision,before.revision);
  assert.equal(after.revision,migratedBaseline.revision);
  assert.deepEqual(after.parts.map(p=>p.displayMark),before.parts.map(p=>p.displayMark));
  assert.deepEqual(calculateProject(p).lines,estimate.lines);assert.deepEqual(calculateProject(p).totals,estimate.totals);
});
test('automatic persistence does not add undo steps or clear redo and reserves all marks',()=>{
  const p=fixture(),state={present:p,past:[structuredClone(p)],future:[structuredClone(p)]},r=report(p);
  const next=recordProductionRegistry(state,p,r.markRegistry);
  assert.equal(next.past.length,1);assert.equal(next.future.length,1);
  for(const snapshot of [next.present,...next.past,...next.future])assert.deepEqual(snapshot.settings.productionCutting.markRegistry,r.markRegistry);
  assert.equal(recordProductionRegistry(next,next.present,r.markRegistry),next);
});
test('late Worker results cannot modify another project or an edited snapshot',()=>{
  const p=fixture(),state={present:structuredClone(p),past:[],future:[]};
  assert.equal(recordProductionRegistry(state,p,report(p).markRegistry),state);
});
test('duplicate or unsafe marks are reported rather than quietly accepted',()=>{
  const normalized=normalizeMarkRegistry({entries:[{key:'panel:[1]',mark:'П1'},{key:'panel:[2]',mark:'П1'},{key:'panel:[3]',mark:'П9007199254740992'}]});
  assert.equal(normalized.invalid,true);assert.equal(normalized.entries.length,1);
});
test('source support IDs survive coordinate edits and reordering',()=>{
  const p=fixture();p.settings.productionCutting.roofSupports=[{id:'support-a',type:'purlin',name:'Прогон',profile:'100×150',nodeRef:'У1',x1:0,y1:0,z1:2800,x2:3000,y2:0,z2:2800}];
  const a=report(p).members.find(m=>m.sourceRef?.id==='support-a');assert.ok(a);
  p.settings.productionCutting.roofSupports.unshift({...p.settings.productionCutting.roofSupports[0],id:'support-b'});
  p.settings.productionCutting.roofSupports[1].x2=2500;
  const b=report(p).members.find(m=>m.sourceRef?.id==='support-a');assert.equal(a.persistentId,b.persistentId);assert.notEqual(a.length,b.length);
});
