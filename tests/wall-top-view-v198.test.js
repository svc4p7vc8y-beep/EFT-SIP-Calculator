import test from 'node:test';
import assert from 'node:assert/strict';
import {panelSection,wallTopView} from '../src/react/calculations/wall-top-view.js';
import {createDefaultProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';

test('top section respects polygon holes rather than projecting every upper panel onto the plan',()=>{
 const p={shape:[[[0,0],[2500,0],[2500,2500],[0,2500]],[[800,850],[1700,850],[1700,1700],[800,1700]]]};
 assert.deepEqual(panelSection(p).map(s=>[s.x,s.width]),[[0,800],[1700,800]]);
 assert.deepEqual(panelSection(p,500).map(s=>[s.x,s.width]),[[0,2500]]);
 assert.equal(panelSection({...p,shape:[[[0,2500],[2500,2500],[2500,3000],[0,3000]]]}).length,0);
});

test('frame section uses the actual board depth and selects only studs crossing the section',()=>{
 const surface={id:'Э1-ПГ1',floor:1,planStart:[0,2000],planEnd:[6000,2000],width:6000,frameOnly:true,frameProfile:'50×150',thickness:124,openings:[{key:'d',x:900,width:900,sill:0,height:2100}]};
 const member=(id,x,a,b)=>({id,surfaceId:surface.id,a:[x,a],b:[x,b],profile:'50×150'});
 const r={assembly:{floors:[{floor:1,contour:[[0,0],[6000,0],[6000,4000],[0,4000]]}]},surfaces:[surface],parts:[],members:[member('full',500,50,2650),member('overdoor',1200,2150,2650),{...member('excluded',2000,50,2650),excluded:true}]};
 const w=wallTopView(r).walls[0];assert.equal(w.depth,150);assert.equal(w.offset,-75);assert.equal(w.studs.length,1);assert.equal(w.openings.length,1);
});

test('external band follows contour orientation and keeps assembly endpoints unchanged',()=>{
 for(const contour of [[[0,0],[6000,0],[6000,3000],[0,3000]],[[0,0],[0,3000],[6000,3000],[6000,0]]]){
  const surface={id:'Э1-С1',floor:1,planStart:contour[0],planEnd:contour[1],width:6000,thickness:174};
  const r={assembly:{floors:[{floor:1,contour}]},surfaces:[surface]};const snapshot=JSON.stringify(r),w=wallTopView(r).walls[0];
  assert.equal(w.side,contour[1][0]===6000?1:-1);assert.equal(w.offset,0);assert.equal(w.depth,174);assert.equal(JSON.stringify(r),snapshot);
 }
});

test('detailed plans read the production report without changing saved project, cutting or estimate',()=>{
 const p=createDefaultProject(),c=calculateProject(p),r=calculateProductionCutting(p,c),before=JSON.stringify({p,c,r});
 const v=wallTopView(r);assert.ok(v.walls.length>=4);assert.ok(v.walls.some(w=>w.panels.length));
 assert.equal(JSON.stringify({p,c,r}),before);assert.deepEqual(calculateProject(p).totals,c.totals);
});
