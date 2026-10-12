import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject,migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting,packMembers } from '../src/react/calculations/production-cutting.js';
import { fitSipTJunctions,sipMemberIntersections } from '../src/react/calculations/sip-junctions.js';
import { wallTopView } from '../src/react/calculations/wall-top-view.js';
import { stockJointPieces } from '../src/react/calculations/member-stock-joints.js';
import clipping from 'polygon-clipping';
import { exteriorWallConstruction } from '../src/react/calculations/wall-construction.js';
const fixture=()=>{const p=createDefaultProject();Object.assign(p.plan,{house:{w:6,h:4,contourDefined:true},wallHeight:2.5,rooms:[],walls:[],platforms:[],piles:[],pileRows:[],bindingLines:[],openings:[{id:'w',type:'window',outer:true,x:2,y:0,width:1,height:1.2,sillHeight:.85,orientation:'h'}]});Object.assign(p.settings.productionCutting,{kerfMm:3,endAllowanceMm:0});return p;};
const run=p=>calculateProductionCutting(p,calculateProject(p));
const seam=(id,a,b,width=90)=>({id,key:id,surfaceId:'floor',a,b,length:Math.hypot(b[0]-a[0],b[1]-a[1]),faceWidth:width,normalDepthMm:145,seam:true,profile:`145×${width}`,material:'Термобрус'});
test('shifted window edge boards are replaced by one full jamb, without changing plan/estimate',()=>{const p=fixture(),before=structuredClone(p),total=calculateProject(p).totals.total,r=run(p);const duplicate=r.members.filter(m=>m.surfaceId==='Э1-С1'&&m.replacedByJamb);assert.ok(duplicate.length>=2);assert.ok(duplicate.every(m=>m.excluded));assert.equal(r.members.filter(m=>m.surfaceId==='Э1-С1'&&m.role==='jamb'&&!m.excluded).length,2);assert.equal(r.sipJunctionConflicts.filter(c=>c.surfaceId==='Э1-С1').length,0);assert.deepEqual(p,before);assert.equal(calculateProject(p).totals.total,total);});
test('wall top view uses 45 face/145 depth for window posts, not 145 face/174 depth',()=>{const w=wallTopView(run(fixture())).walls.find(w=>w.surface.id==='Э1-С1');const posts=w.studs.filter(s=>s.member.role==='jamb');assert.equal(posts.length,2);assert.ok(posts.every(s=>s.width===45&&s.depth===145));assert.equal(w.depth,174);});
test('T seam butts to half the host width, length and blank allowance agree',()=>{const a=seam('long',[0,0],[2000,0],100),b=seam('short',[1000,0],[1000,1200]);fitSipTJunctions([a,b],{endAllowanceMm:10});assert.deepEqual(b.a,[1000,50]);assert.equal(b.length,1150);assert.equal(b.cutLength,1170);assert.equal(a.length,2000);assert.deepEqual(sipMemberIntersections([a,b]),[]);});
test('T fit is list-order independent, works on reversed endpoints and segmented hosts',()=>{const f=()=>[seam('left',[0,0],[1000,0]),seam('right',[1000,0],[2000,0]),seam('t',[1000,1200],[1000,0])];const a=f(),b=f().reverse();fitSipTJunctions(a,{});fitSipTJunctions(b,{});assert.deepEqual(a.find(m=>m.id==='t').b,[1000,45]);assert.deepEqual(a.find(m=>m.id==='t'),b.find(m=>m.id==='t'));assert.equal(sipMemberIntersections(a).length,0);});
test('unknown cross-joint is detected, never guessed as a notch or splice',()=>{const a=seam('h',[0,1000],[2000,1000]),b=seam('v',[1000,0],[1000,2000]),before=structuredClone([a,b]);fitSipTJunctions([a,b],{});assert.deepEqual([a,b],before);const conflicts=sipMemberIntersections([a,b]);assert.equal(conflicts.length,1);assert.equal(conflicts[0].areaMm2,8100);});
test('explicit manufacture length stays authoritative and unresolved contact is reported',()=>{const a=seam('long',[0,0],[2000,0]),b=seam('short',[1000,0],[1000,1200]),before=structuredClone(b);fitSipTJunctions([a,b],{memberOverrides:{short:{length:1200,nodeRef:'У1'}}});assert.deepEqual(b,before);assert.equal(sipMemberIntersections([a,b]).length,1);});
for(const thickness of [124,174,224])test(`SIP ${thickness}: six-metre stock and 2D contacts agree on walls/floor/ceiling`,()=>{const p=fixture();p.settings.sip.wallThickness=thickness;const r=run(migrateProject(JSON.parse(JSON.stringify(p))));assert.equal(r.settings.stockLengthMm,6000);assert.equal(r.sipJunctionConflicts.length,0);assert.ok(r.timberStock.bars.every(b=>b.used<=6000&&b.parts.every(part=>part.start+part.length<=6000)));assert.ok(r.members.filter(m=>m.junctionTrimMm).length>0);});
test('six-metre stock never silently splits a long structural member; approved breaks pack with kerf',()=>{const m={...seam('long',[0,0],[11000,0]),cutLength:11000},settings={stockLengthMm:6000,kerfMm:3,endAllowanceMm:0,memberOverrides:{}};assert.deepEqual(packMembers(stockJointPieces([m],settings).pieces,6000,3).unplaced,['long']);settings.memberOverrides.long={stockBreaksMm:'5500',nodeRef:'Проектный стык на опоре'};const f=stockJointPieces([m],settings);assert.equal(f.issues.length,0);const stock=packMembers(f.pieces,6000,3);assert.equal(stock.bars.length,2);assert.equal(stock.unplaced.length,0);assert.equal(m.length,11000);});
test('rectangular and concave wall corners butt without overlaps in both contour directions',()=>{
  for(const points of [[{x:0,y:0},{x:6,y:0},{x:6,y:4},{x:0,y:4}],[{x:0,y:0},{x:6,y:0},{x:6,y:3},{x:3,y:3},{x:3,y:6},{x:0,y:6}]])for(const reverse of [false,true])for(const thickness of [124,174,224]){
    const p=fixture();p.plan.house.points=reverse?[...points].reverse():points;p.settings.sip.wallThickness=thickness;
    const area=p.plan.house.points.reduce((s,a,i)=>{const b=p.plan.house.points[(i+1)%points.length];return s+a.x*b.y-a.y*b.x;},0),sign=Math.sign(area);
    const shapes=exteriorWallConstruction(p.plan,p.settings.sip).map(w=>{const dx=(w.b.x-w.a.x)/w.externalLength,dy=(w.b.y-w.a.y)/w.externalLength,n=[-dy*sign*w.thickness,dx*sign*w.thickness];return [[w.start.x,w.start.y],[w.end.x,w.end.y],[w.end.x+n[0],w.end.y+n[1]],[w.start.x+n[0],w.start.y+n[1]],[w.start.x,w.start.y]];});
    for(let i=0;i<shapes.length;i++)for(let j=i+1;j<shapes.length;j++)assert.equal(clipping.intersection([shapes[i]],[shapes[j]]).length,0);
  }
});
test('known standing-wall crossing keeps posts continuous and butts cross pieces, no fake notch',()=>{
  const list=[seam('bottom',[1000,0],[1000,1000]),seam('top',[1000,1000],[1000,2000]),seam('left',[0,1000],[1000,1000]),seam('right',[1000,1000],[2000,1000])];
  fitSipTJunctions(list,{},[{id:'floor',horizontal:false}]);assert.equal(list[0].length,1000);assert.equal(list[1].length,1000);assert.equal(list[2].length,955);assert.equal(list[3].length,955);assert.equal(sipMemberIntersections(list).length,0);
});
