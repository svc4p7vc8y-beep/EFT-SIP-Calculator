import test from 'node:test';
import assert from 'node:assert/strict';
import {FACADE_SIDES,facadePoint,facadeDimensionValue,projectHouseFacade} from '../src/react/calculations/house-elevations.js';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {productionScene} from '../src/react/calculations/production-scene.js';

test('four orthographic facade directions mirror opposite elevations and preserve real dimensions',()=>{
 const scene={panels:[{id:'wall',layer:'walls',shape:[[[0,0],[4000,0],[4000,2500],[0,2500]]],thickness:174,placement:{origin:[0,0,0],u:[1,0,0],v:[0,0,1],normal:[0,-1,0]}}],beams:[{id:'post',a:[5000,1000,0],b:[5000,1000,3000],profile:'100×150'}]};
 const before=JSON.stringify(scene);
 for(const [side]of FACADE_SIDES){const view=projectHouseFacade(scene,side);assert.ok(view.faces.length);assert.ok(view.snapPoints.length);assert.ok(view.faces.every((face,i)=>!i||face.depth>=view.faces[i-1].depth));assert.ok(view.bounds.maxZ>=3000);}
 assert.deepEqual(facadePoint([100,200,300],'front'),[100,300,-200]);
 assert.deepEqual(facadePoint([100,200,300],'back'),[-100,300,200]);
 assert.deepEqual(facadePoint([100,200,300],'left'),[-200,300,-100]);
 assert.deepEqual(facadePoint([100,200,300],'right'),[200,300,100]);
 assert.equal(JSON.stringify(scene),before);
 const front=projectHouseFacade(scene,'front'),back=projectHouseFacade(scene,'back');
 assert.equal(front.bounds.maxX-front.bounds.minX,back.bounds.maxX-back.bounds.minX);
 assert.equal(front.bounds.minX===0?0:front.bounds.minX,-back.bounds.maxX===0?0:-back.bounds.maxX);
});

test('facade dimensions and custom captions survive JSON reopen without changing geometry or estimate',()=>{
 let p=migrateProject(createDefaultProject());
 p.plan.openings.push({id:'facade-window',type:'window',x:2,y:0,orientation:'h',width:1.2,height:1.4,sill:.8,outer:true});
 p=migrateProject(p);
 const before=calculateProject(p),plan=JSON.stringify(p.plan);
 p.settings.productionCutting.drawingDimensions={'facade:front':[{id:'measure',a:[0,0],b:[3000,4000],axis:'aligned',text:'4995',distanceMm:-350}]};
 const reopened=migrateProject(JSON.parse(JSON.stringify(p))),dimension=reopened.settings.productionCutting.drawingDimensions['facade:front'][0];
 assert.equal(dimension.text,'4995');assert.equal(dimension.distanceMm,-350);assert.equal(facadeDimensionValue(dimension),5000);
 assert.equal(facadeDimensionValue({...dimension,axis:'horizontal'}),3000);assert.equal(facadeDimensionValue({...dimension,axis:'vertical'}),4000);
 assert.equal(JSON.stringify(reopened.plan),plan);assert.deepEqual(calculateProject(reopened).totals,before.totals);
 const report=calculateProductionCutting(reopened,calculateProject(reopened)),scene=productionScene(report,reopened);
 assert.ok(projectHouseFacade(scene,'front').faces.some(face=>face.layer==='windows'));
 for(const [side]of FACADE_SIDES){const facade=projectHouseFacade(scene,side);assert.ok(facade.faces.length);assert.ok(facade.bounds.maxX>facade.bounds.minX);assert.ok(facade.bounds.maxZ>facade.bounds.minZ);}
});
