import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject,migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting,packPanelBlanks,packMembers,stockCells } from '../src/react/calculations/production-cutting.js';
import { calculateCutOperations,productionMark } from '../src/react/calculations/production-assembly.js';
const base=()=>{const p=createDefaultProject();p.plan={...p.plan,house:{w:5,h:4},wallHeight:2.5,rooms:[],walls:[],openings:[],wallGaps:[],platforms:[]};p.settings.productionCutting.kerfMm=3;p.settings.productionCutting.endAllowanceMm=0;return p;};
const run=p=>calculateProductionCutting(p,calculateProject(p));

test('stock mode keeps four full wall panels rather than eight half panels, preserving the estimate',()=>{
  const p=base(),before=structuredClone(p),e=calculateProject(p),r=calculateProductionCutting(p,e);
  const wall=r.parts.filter(s=>s.surfaceId==='Э1-С1');
  assert.equal(wall.length,4);assert.ok(wall.every(s=>s.width===1250&&s.height===2500));
  assert.equal(calculateProject(p).totals.total,e.totals.total);assert.deepEqual(p,before);
  p.settings.productionCutting.wallPanelMode='grid';assert.equal(run(p).parts.filter(s=>s.surfaceId==='Э1-С1').length,8);
});
test('stock edge remainder is rebalanced locally without resizing all full panels',()=>{
  assert.deepEqual(stockCells(0,5100,1250).map(c=>c.width),[1250,1250,1250,1150,200]);
  assert.equal(stockCells(0,100,1250),null);
});
test('both window jambs form boundaries, and wide spandrels rotate with a manual override available',()=>{
  const p=base();p.plan.openings=[{id:'win',type:'window',outer:true,x:2.5,y:0,width:1.5,height:1.2}];
  let r=run(p),wall=r.parts.filter(s=>s.surfaceId==='Э1-С1');
  for(const x of [1750,3250])assert.ok(wall.every(s=>!(s.x<x-.01&&s.x+s.width>x+.01)));
  assert.ok(wall.some(s=>s.width===1500&&s.blankWidth===850&&s.blankHeight===1500));
  assert.ok(Math.abs(wall.reduce((sum,s)=>sum+s.area,0)-(5000*2500-1500*1200))<.01);
  const key=r.surfaces.find(s=>s.id==='Э1-С1').layoutKey;
  p.settings.productionCutting.layouts[key]={openingDirections:{'1:win':'x'}};
  r=run(p);assert.ok(r.parts.filter(s=>s.surfaceId==='Э1-С1').every(s=>s.width<=1250));
});
test('a narrow pier is blocked rather than hidden by a panel crossing the jamb',()=>{
  const p=base();p.plan.openings=[{id:'win',type:'window',outer:true,x:.6,y:0,width:1,height:1.2}];
  const r=run(p);assert.ok(r.issues.some(i=>i.code==='MIN_PANEL_WIDTH'&&i.target==='Э1-С1'));
  assert.equal(r.parts.filter(s=>s.surfaceId==='Э1-С1').length,0);
});
test('framed and SIP gables generate their own assembly details without double-counting panels',()=>{
  const p=base();p.settings.roof.type='cold';p.settings.roof.gableType='cold';let r=run(p);
  assert.ok(r.surfaces.some(s=>s.id==='ФР-1'&&s.frameOnly));assert.ok(r.members.some(m=>m.material==='Стойка фронтона'));
  assert.equal(r.parts.filter(s=>s.surfaceId.startsWith('ФР-')).length,0);
  p.settings.roof.gableType='sip';r=run(p);assert.ok(r.parts.some(s=>s.surfaceId.startsWith('ФР-')));
  assert.equal(r.members.filter(m=>m.material==='Стойка фронтона').length,0);
});
test('gable studs fit between the bottom and inclined top boards',()=>{
  const r=run(base()),studs=r.members.filter(m=>m.material==='Стойка фронтона');
  assert.ok(studs.length);assert.ok(studs.every(m=>m.a[1]>=50&&m.b[1]-m.a[1]>0));
  const height=base().settings.roof.ridgeHeight*1000;
  assert.ok(studs.every(m=>m.b[1]<=height-50));
  const outline=r.assembly.roofOutline;
  const along=Math.hypot(outline[1][0]-outline[0][0],outline[1][1]-outline[0][1]);
  assert.ok(Math.abs(along-calculateProject(base()).roof.geometry.roofLength*1000)<.01);
});
test('the minimum panel size also applies to manually specified panels',()=>{
  const p=base();p.settings.productionCutting.manualPanels=[{id:'thin',name:'Узкая панель',family:'pps',thickness:174,quantity:1,contour:'[[[0,0],[100,0],[100,2500],[0,2500]]]'}];
  const r=run(p);assert.ok(r.issues.some(i=>i.code==='MANUAL_PANEL'&&i.message.includes('200')));
  assert.equal(r.parts.filter(s=>s.surfaceId.startsWith('РП-')).length,0);
});
const support=(id,type,a,b,extra={})=>({id,type,name:id,profile:type==='foundation'?'':'100×150',nodeRef:'КР-1',x1:a[0],y1:a[1],z1:a[2],x2:b[0],y2:b[1],z2:b[2],startSupport:'',endSupport:'',foundationRef:'',...extra});
test('roof load path follows both supports through posts and beam to foundation and survives save/reopen',()=>{
  const p=base();p.settings.productionCutting.roofSupports=[
    support('f1','foundation',[0,0,0],[0,0,0],{foundationRef:'Бетон, Ф-1'}),
    support('f2','foundation',[4000,0,0],[4000,0,0],{foundationRef:'Бетон, Ф-2'}),
    support('b','beam',[0,0,0],[4000,0,0],{startSupport:'f1',endSupport:'f2'}),
    support('s1','post',[0,0,0],[0,0,2500],{startSupport:'b'}),
    support('s2','post',[4000,0,0],[4000,0,2500],{startSupport:'b'}),
    support('r','purlin',[0,0,2500],[4000,0,2500],{startSupport:'s1',endSupport:'s2'}),
  ];
  let r=run(p);assert.ok(r.assembly.supports.every(s=>s.loadPath.complete));
  const saved=migrateProject(JSON.parse(JSON.stringify(p)));assert.deepEqual(saved.settings.productionCutting.roofSupports,p.settings.productionCutting.roofSupports);
  assert.ok(run(saved).assembly.supports.every(s=>s.loadPath.complete));
  p.settings.productionCutting.roofSupports[3].x1=200;p.settings.productionCutting.roofSupports[3].x2=200;
  r=run(p);assert.equal(r.assembly.supports.find(s=>s.id==='r').loadPath.complete,false);
  assert.ok(r.issues.some(i=>i.message.includes('не совпадает')));
});
test('support cycles and height mismatches block the assembly path',()=>{
  const p=base();p.settings.productionCutting.roofSupports=[support('a','beam',[0,0,0],[4000,0,0],{startSupport:'b',endSupport:'b'}),support('b','purlin',[0,0,2500],[4000,0,2500],{startSupport:'a',endSupport:'a'})];
  const r=run(p);assert.ok(r.assembly.supports.every(s=>!s.loadPath.complete));assert.ok(r.issues.some(i=>i.message.includes('высоте')));
});
const piece=(id,w,h,shape)=>({id,width:w,height:h,area:w*h,shape:shape||[[[0,0],[w,0],[w,h],[0,h],[0,0]]],x:0,y:0,family:'pps',thickness:174});
const cuts=(parts,members=[],kerf=0)=>calculateCutOperations({parts,panelWidth:1250,panelLength:2500,settings:{stockLengthMm:6000,kerfMm:kerf},panelStock:packPanelBlanks(parts,1250,2500,kerf),timberStock:packMembers(members,6000,kerf)});
test('full panel needs no cut; shared straight cut including kerf is counted once',()=>{
  assert.equal(cuts([piece('full',1250,2500)]).panelCuts,0);
  const result=cuts([piece('a',625,2500),piece('b',622,2500)],[],3);
  assert.equal(result.panelCuts,1);assert.equal(result.panelCutLengthM,2.5);
});
test('diagonal trimming and timber crosscuts are separate operations',()=>{
  const triangle=piece('triangle',1250,2500,[[[0,0],[1250,0],[0,2500],[0,0]]]);triangle.area/=2;
  const result=cuts([triangle],[{id:'1',material:'Брус',profile:'100×150',cutLength:2000},{id:'2',material:'Брус',profile:'100×150',cutLength:2000}],3);
  assert.equal(result.shapedCuts,1);assert.equal(result.panelCuts,1);assert.equal(result.timberCuts,2);
});
test('production marks translate panel, side and tier labels to Russian',()=>{
  assert.equal(productionMark('Э1-С1-P1'),'Э1-С1-П1');assert.equal(productionMark('ФР-upperFirst-P2'),'ФР-ВЕРХ-1-П2');assert.equal(productionMark('Э1-С1-С1-left-1500'),'Э1-С1-СТП1-Л');
});
