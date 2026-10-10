import test from 'node:test';
import assert from 'node:assert/strict';
import {gapFragments} from '../src/react/calculations/gap-fragments.js';
import {reconcileCutting} from '../src/react/calculations/cutting-reconciliation.js';
import {stockJointPieces} from '../src/react/calculations/member-stock-joints.js';
import {tileProductionSurface,calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
const edge=(id,x1,x2,y=2)=>({id,a:{x:x1,y},b:{x:x2,y}});
test('gap fragments cover both fabrication segments without moving the opening',()=>{
  const gap={x:2,y:2,width:1,orientation:'h'},before=structuredClone(gap);
  const r=gapFragments(gap,[edge('a',0,2),edge('b',2,4)]);
  assert.equal(r.error,null);assert.deepEqual(r.fragments.map(f=>[f.edge.id,f.x,f.width]),[['a',1.5,.5],['b',0,.5]]);assert.deepEqual(gap,before);
});
test('gap fragments preserve reversed and vertical coordinates',()=>{
  const r=gapFragments({x:2,y:2,width:1},[edge('a',2,0),edge('b',4,2)]);
  assert.deepEqual(r.fragments.map(f=>[f.edge.id,f.x,f.width]),[['a',0,.5],['b',1.5,.5]]);
  const v=gapFragments({x:2,y:2,width:1,orientation:'v'},[{a:{x:2,y:0},b:{x:2,y:2}},{a:{x:2,y:2},b:{x:2,y:4}}]);
  assert.equal(v.error,null);assert.equal(v.fragments.reduce((s,f)=>s+f.width,0),1);
});
test('production distributes a gap across differently profiled wall segments',()=>{
  const p=createDefaultProject();Object.assign(p.plan,{house:{w:4,h:4,contourDefined:true},rooms:[],walls:[{id:'a',x1:.174,y1:2,x2:2,y2:2,bearing:true,bearingProfile:'50x150'},{id:'b',x1:2,y1:2,x2:3.826,y2:2,bearing:true,bearingProfile:'50x200'}],openings:[],wallGaps:[{id:'g',x:2,y:2,width:1,orientation:'h',outer:false}],platforms:[]});
  const before=structuredClone(p.plan),r=calculateProductionCutting(p,calculateProject(p));
  assert.ok(!r.issues.some(i=>['OPENING_WALL','OPENING_SIZE'].includes(i.code)));
  const gaps=r.surfaces.flatMap(s=>s.openings||[]).filter(o=>o.gap);assert.equal(gaps.length,2);assert.equal(gaps.reduce((n,o)=>n+o.width,0),1000);assert.ok(gaps.every(o=>o.x>=0));assert.deepEqual(p.plan,before);
});
test('genuinely missing, disconnected and ambiguous gap walls remain diagnostic',()=>{
  for(const edges of [[],[edge('a',0,1.9),edge('b',2.1,4)],[edge('a',0,4,1.99),edge('b',0,4,2.01)]])assert.ok(gapFragments({x:2,y:2,width:1},edges).error);
  assert.ok(gapFragments({x:0,y:2,width:1},[edge('a',0,4)]).error);
});
const surface=layout=>({id:'f',name:'Перекрытие',horizontal:true,geometry:[[[[0,0],[2800,0],[2800,2600],[0,2600],[0,0]]]],layout});
test('automatic deck can rotate a failed grid without loss of area or narrow parts',()=>{
  const s=surface({}),parts=tileProductionSurface(s,1250,2500,625,true);
  assert.equal(s.automaticDirection,'y');assert.ok(parts.length>0);assert.equal(parts.reduce((n,p)=>n+p.area,0),2800*2600);assert.ok(parts.every(p=>Math.min(p.width,p.height)>=200));
});
test('explicit grid direction or origin is never replaced by automatic rotation',()=>{
  for(const layout of [{direction:'x'},{originX:0},{step:625}])assert.throws(()=>tileProductionSurface(surface(layout),1250,2500,625,true),e=>e.code==='MIN_PANEL_WIDTH');
  const s=surface({direction:'auto'});assert.ok(tileProductionSurface(s,1250,2500,625,true).length);
});
const report=()=>({settings:{stockLengthMm:6000},surfaces:[],panelStock:{sheets:[]},timberStock:{bars:[{material:'Стойка перегородки',profile:'50×150'},{material:'Стропило',profile:'150×50'}],unplaced:[]},members:[]});
test('board procurement volume includes multiple sections by material profile, no estimate mutation',()=>{
  const c={lines:[{kind:'material',name:'Доска перегородок 50×150',unit:'м³',qty:.06},{kind:'material',name:'Доска стропил 150×50',unit:'м.п.',qty:4}]},before=structuredClone(c),rows=reconcileCutting(report(),c);
  assert.equal(rows.length,1);assert.equal(rows[0].required,.09);assert.equal(rows[0].purchased,.09);assert.equal(rows[0].difference,0);assert.deepEqual(c,before);
});
test('missing purchase match is unknown, not a false zero or deficit',()=>{
  const row=reconcileCutting(report(),{lines:[]})[0];assert.equal(row.status,'manual-match');assert.equal(row.purchased,null);assert.equal(row.difference,null);
});
test('lathing, partition reinforcement and binding names match their physical material',()=>{
  const r=report();r.timberStock.bars=[{material:'Обрешётка',profile:'25×100'},{material:'Укосина перегородки',profile:'25×150'},{material:'Брус обвязки',profile:'100×150'}];
  const c={lines:[['Обрешётка 25×100 мм',.015],['Усиление перегородок 25×150 мм',.0225],['Брус обвязки 100×150 мм',.09]].map(([name,qty])=>({kind:'material',name,qty,unit:'м³'}))};
  assert.ok(reconcileCutting(r,c).every(row=>row.status==='compared'&&row.difference===0));
});
test('unplaced members and blocked panels prevent a falsely positive stock balance',()=>{
  const r=report();r.timberStock.unplaced=['long'];r.members=[{id:'long',material:'Стропило',profile:'50×150'}];
  const c={lines:[{kind:'material',name:'Доска 50×150',unit:'м³',qty:2}]};let row=reconcileCutting(r,c)[0];assert.equal(row.pendingCount,1);assert.equal(row.status,'unplaced-stock');assert.equal(row.difference,null);
  r.surfaces=[{blocked:true,family:'pps',thickness:224}];row=reconcileCutting(r,c)[0];assert.equal(row.status,'incomplete-layout');assert.equal(row.difference,null);
});
const member=()=>({id:'Д1',key:'detail:d1',displayMark:'С1',material:'Стойка перегородки',profile:'50×150',length:11000,a:[0,0],b:[11000,0],notches:[{offsetMm:7000,lengthMm:150,type:'brace',depthMm:''}]});
test('project stock joints preserve assembly and translate notch positions per part',()=>{
  const m=member(),before=structuredClone(m),r=stockJointPieces([m],{endAllowanceMm:10,memberOverrides:{[m.key]:{stockBreaksMm:'5500',nodeRef:'КР-1/У1'}}});
  assert.deepEqual(m,before);assert.equal(r.issues.length,0);assert.deepEqual(r.pieces.map(p=>p.cutLength),[5520,5520]);assert.deepEqual(r.pieces[1].a,[5500,0]);assert.equal(r.pieces[1].notches[0].offsetMm,1500);assert.equal(r.pieces[0].notches.length,0);
});
test('stock joint rejects no node, unordered/outside positions and a splice crossing notch',()=>{
  const m=member();for(const override of [{stockBreaksMm:'5500'},...['0','11000','5500; 5000','7050','oops'].map(stockBreaksMm=>({stockBreaksMm,nodeRef:'У1'}))]){
    const r=stockJointPieces([m],{memberOverrides:{[m.key]:override}});assert.equal(r.issues[0].code,'STOCK_JOINT');assert.equal(r.pieces[0],m);
  }
});
test('stock joints survive JSON migration, enter stock and change approval revision only',()=>{
  const p=createDefaultProject();Object.keys(p.services).forEach(k=>p.services[k]=false);
  Object.assign(p.settings.productionCutting,{endAllowanceMm:0,kerfMm:3,manualParts:[{id:'long',name:'Доска',profile:'50×150',length:11000,quantity:1}]});
  const calc=calculateProject(p),r=calculateProductionCutting(p,calc),m=r.members[0];
  assert.equal(r.timberStock.unplaced.length,1);p.settings.productionCutting.memberOverrides[m.key]={stockBreaksMm:'5500',nodeRef:'КР-1/У1'};
  const saved=migrateProject(JSON.parse(JSON.stringify(p))),next=calculateProductionCutting(saved,calculateProject(saved));
  assert.equal(next.timberStock.unplaced.length,0);assert.equal(next.fabricationMembers.length,2);assert.equal(next.members[0].length,11000);assert.notEqual(next.revision,r.revision);assert.deepEqual(calculateProject(saved).totals,calc.totals);
});
