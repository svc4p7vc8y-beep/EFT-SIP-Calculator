import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {partitionProfileForSegment,partitionProfileShares} from '../src/react/calculations/bearing-walls.js';
import {assignPartitionProfiles,collinearBearingKeys,selectableBearingEdges} from '../src/react/planner/bearing-selection.js';
import {PARTITION_BOARD_PROFILES,partitionProfileColor} from '../src/react/data/partition-profiles.js';

const fixture=()=>{
 const project=createDefaultProject();
 Object.assign(project.plan,{house:{w:10,h:8},rooms:[{id:'a',name:'А',x:0,y:0,w:5,h:4},{id:'b',name:'Б',x:0,y:4,w:5,h:4}],walls:[],openings:[],wallGaps:[],platforms:[],wallHeight:2.5});
 return project;
};

test('each partition board has a stable distinct plan colour',()=>{
 assert.equal(PARTITION_BOARD_PROFILES.length,6);
 assert.equal(new Set(PARTITION_BOARD_PROFILES.map(item=>item.color)).size,6);
 for(const item of PARTITION_BOARD_PROFILES)assert.equal(partitionProfileColor(item.id),item.color);
});

test('a non-bearing room-wall segment keeps its own board through save, estimate and production',()=>{
 const project=fixture(),edges=selectableBearingEdges(project.plan),target=edges.find(edge=>edge.a.x===5&&edge.b.x===5),keys=collinearBearingKeys(edges,target.key);
 assert.equal(keys.length,2);
 assignPartitionProfiles(project.plan,keys,'45x195');
 const restored=migrateProject(JSON.parse(JSON.stringify(project))),assigned=selectableBearingEdges(restored.plan).filter(edge=>keys.includes(edge.key));
 assert.ok(assigned.every(edge=>edge.profile==='45x195'&&!edge.bearing));
 assert.equal(partitionProfileForSegment(restored.plan,{x:5,y:0},{x:5,y:4}),'45x195');
 assert.ok(partitionProfileShares(restored.plan,'50x100').some(row=>row.profile==='45x195'&&row.share>0));
 const calculation=calculateProject(restored),report=calculateProductionCutting(restored,calculation);
 assert.ok(calculation.lines.some(line=>line.catalogId==='MAT-007'&&line.id.includes('partition-board')&&line.qty>0));
 assert.ok(report.members.some(member=>member.surfaceId?.includes('ПГ')&&member.profile==='45×195'));
});

test('assigning and clearing a manual wall board does not change its bearing status',()=>{
 const project=fixture();project.plan.rooms=[];project.plan.walls=[{id:'w',x1:2,y1:0,x2:2,y2:8,include:true,bearing:false}];
 const key=selectableBearingEdges(project.plan)[0].key;
 assignPartitionProfiles(project.plan,[key],'45x95');assert.equal(project.plan.walls[0].frameProfile,'45x95');assert.equal(project.plan.walls[0].bearing,false);
 assignPartitionProfiles(project.plan,[key],'');assert.equal(project.plan.walls[0].frameProfile,'');assert.equal(project.plan.walls[0].bearing,false);
});
