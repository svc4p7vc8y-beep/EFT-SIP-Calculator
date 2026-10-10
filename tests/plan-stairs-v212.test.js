import test from 'node:test';
import assert from 'node:assert/strict';
import {stairStepGeometry,stairOpeningPolygon,STAIR_TYPES} from '../src/react/planner/stair-steps.js';
import {floorOpeningSummary} from '../src/react/planner/floor-openings.js';
import {createDefaultProject,migrateProject,ensureProjectFloorCount} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {partitionJunctionStuds,partitionReinforcements} from '../src/react/calculations/partition-construction.js';
import {partitionFrameMembers} from '../src/react/calculations/partition-cutting.js';
import {normalizeProductionCutting} from '../src/react/state/production-cutting.js';
import {labelLeader} from '../src/react/planner/label-leader.js';
test('all stair forms rotate without leaving their bounding dimensions; winder fans differ from landings',()=>{
 for(const [type]of STAIR_TYPES)for(const direction of ['left','right','up','down']){const d=stairStepGeometry({x:2,y:3,width:4,height:2},direction,12,type);assert.ok(d.treads.length);assert.ok(d.treads.every(t=>[t.x1,t.x2].every(x=>x>=2&&x<=6)&&[t.y1,t.y2].every(y=>y>=3&&y<=5)));if(type!=='straight')assert.ok(d.path);}
 assert.notDeepEqual(stairStepGeometry({x:0,y:0,width:4,height:2},'right',12,'l').treads,stairStepGeometry({x:0,y:0,width:4,height:2},'right',12,'l-winder').treads);
});
test('explicit shaped contours are used by area, joinery and production; legacy rectangle is unchanged',()=>{
 const p=createDefaultProject();ensureProjectFloorCount(p,2);const plan=p.upperFloors[0];Object.assign(plan,{house:{w:6,h:4},rooms:[],walls:[],openings:[],platforms:[]});plan.floorOpenings=[{id:'s',x:1,y:1,width:2,length:2,stairType:'l',direction:'right'}];
 assert.equal(floorOpeningSummary(plan).area,4);plan.floorOpenings[0].contourMode='stair';const area=floorOpeningSummary(plan).area;assert.ok(area<4&&area>0);
 const e=calculateProject(p),r=calculateProductionCutting(p,e),deck=r.surfaces.find(s=>s.id==='Э2-ПОЛ');let sum=0;for(const poly of deck.geometry)for(const [i,ring]of poly.entries()){let a=0;for(let j=0;j<ring.length-1;j++)a+=ring[j][0]*ring[j+1][1]-ring[j+1][0]*ring[j][1];sum+=(i?-1:1)*Math.abs(a)/2;}assert.ok(Math.abs(sum/1e6-(24-area))<1e-8);
 const reopened=migrateProject(JSON.parse(JSON.stringify(p)));assert.deepEqual(reopened.upperFloors[0].floorOpenings,plan.floorOpenings);
});
test('outside label arrow targets an interior point, not the empty centre of a U shape',()=>{
 const o={x:0,y:0,width:3,length:3,stairType:'u',contourMode:'stair',direction:'right'},ring=stairOpeningPolygon(o),d=labelLeader({x:-2,y:-2},ring);assert.ok(d);assert.equal(labelLeader(d.target,ring),null);assert.equal(labelLeader({x:1,y:1},[[0,0],[2,0],[2,2],[0,2]]),null);
});
test('receiving T-junction has an exact stud; coincident stud is not counted twice and openings remain clear',()=>{
 const plan={partitionThickness:.1,house:{w:6,h:4}},a={x:1,y:2},b={x:5,y:2},segments=[[a,b],[{x:2.31,y:1},{x:2.31,y:2}]];
 assert.deepEqual(partitionJunctionStuds(plan,a,b,segments),[1310]);const surface={id:'P',width:4000,height:2500,frameProfile:'50×100',junctionStuds:[1310],openings:[]},settings=normalizeProductionCutting({});const list=partitionFrameMembers(surface,settings);assert.equal(list.filter(m=>m.junction).length,1);assert.equal(list.find(m=>m.junction).a[0],1310);
 surface.junctionStuds=[1310,1310];assert.equal(partitionFrameMembers(surface,settings).filter(m=>m.junction).length,1);surface.openings=[{x:1000,width:900,height:2100,sill:0}];assert.equal(partitionFrameMembers(surface,settings).filter(m=>m.junction).length,0);
});
test('junction additions are shared with production and estimate and preserve prices',()=>{
 const p=createDefaultProject(),before=JSON.stringify(p),r=calculateProductionCutting(p,calculateProject(p)),extras=partitionReinforcements(p,p.plan);assert.ok(extras.some(m=>m.junction));for(const m of extras.filter(m=>m.junction))assert.ok(r.members.some(n=>n.surfaceId===m.surfaceId&&n.junction&&n.a[0]===m.a[0]));assert.equal(JSON.stringify(p),before);
});
