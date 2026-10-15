import test from 'node:test';
import assert from 'node:assert/strict';
import {roofFacet} from '../src/react/calculations/roof-project.js';
import {roofFramingPoint,roofFramingMember} from '../src/react/calculations/roof-framing.js';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';

const face=roofFacet('КР-С1','Скат',[[0,0,3000],[4000,0,3000],[4000,2000,4000],[0,2000,4000]]);
const model={faces:[face]};

test('drawn rafter follows the chosen XYZ plane and survives project reload',()=>{
 const start=roofFramingPoint(model,[1000,0],{offsetMm:-100});
 const end=roofFramingPoint(model,[1000,2000],{faceId:start.faceId,offsetMm:-100});
 assert.deepEqual(start.point,[1000,0,2900]);
 assert.deepEqual(end.point,[1000,2000,3900]);
 const member=roofFramingMember({id:'manual-rafter-1',type:'rafter',profile:'50×150',start,end});
 assert.equal(member.faceId,'КР-С1');
 assert.equal(member.estimateEnabled,false);
 const project=createDefaultProject(),originalTotal=calculateProject(project).totals.total;
 project.settings.productionCutting.roofSupports=[member];
 const reopened=migrateProject(JSON.parse(JSON.stringify(project)));
 assert.deepEqual(reopened.settings.productionCutting.roofSupports[0].x1,1000);
 assert.deepEqual(reopened.settings.productionCutting.roofSupports[0].z2,3900);
 assert.equal(calculateProject(reopened).totals.total,originalTotal);
 const report=calculateProductionCutting(reopened,calculateProject(reopened));
 assert.ok(report.assembly.supports.some(item=>item.id===member.id&&item.length===Math.ceil(Math.hypot(2000,1000))));
});

test('drawing refuses a point off the selected slope, blank Z and zero-length element',()=>{
 assert.throws(()=>roofFramingPoint(model,[1000,2500],{faceId:'КР-С1'}),/том же скате/);
 assert.throws(()=>roofFramingPoint(model,[1000,1000],{mode:'fixed',fixedZ:null}),/отметку Z/);
 const point=roofFramingPoint(model,[1000,1000]);
 assert.throws(()=>roofFramingMember({id:'a',type:'rafter',profile:'50×150',start:point,end:point}),/Длина/);
 assert.throws(()=>roofFramingMember({id:'a',type:'rafter',profile:'',start:point,end:{point:[1000,2000,4000]}}),/сечение/);
});
