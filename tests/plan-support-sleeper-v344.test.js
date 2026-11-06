import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { productionScene } from '../src/react/calculations/production-scene.js';
import { movePlanRoofGroup } from '../src/react/planner/roof-support-plan.js';

test('saved plan purlins produce the same horizontal sleeper in cutting, 3D and the estimate', () => {
  const project = createDefaultProject();
  project.plan.house = { w: 8, h: 6 };
  project.services.roof = true;
  const shared = { planGroupId:'group', autoLayout:'roof-purlins', autoLocked:true, profile:'100×150', nodeRef:'', startSupport:'', endSupport:'', foundationRef:'' };
  project.settings.productionCutting.roofSupports = [
    { ...shared, id:'beam', type:'purlin', name:'Прогон', x1:1000,y1:3000,z1:3800,x2:5000,y2:3000,z2:3800 },
    ...[1000,5000].map((x,i)=>({ ...shared,id:'post-'+i,type:'post',upperSupport:'beam',x1:x,y1:3000,z1:2800,x2:x,y2:3000,z2:3800 })),
  ];
  const saved=migrateProject(JSON.parse(JSON.stringify(project)));
  saved.settings.productionCutting.roofSupports=movePlanRoofGroup(saved.settings.productionCutting.roofSupports,'group',.2,.5);
  const calculation=calculateProject(saved);
  const report=calculateProductionCutting(saved,calculation);
  const sleeper=report.assembly.supports.find(item=>item.id==='beam-sleeper');
  assert.deepEqual(sleeper.a,[1200,3500,2850]);
  assert.deepEqual(sleeper.b,[5200,3500,2850]);
  assert(report.assembly.supports.filter(item=>item.upperSupport==='beam').every(item=>item.a[2]===2900&&item.startSupport===sleeper.id));
  assert(productionScene(report,saved).beams.some(item=>item.id===sleeper.mark&&item.flat));
  const lines=calculation.lines.filter(line=>line.id.startsWith('production-support-'));
  assert.equal(lines.length,4);
  assert.equal(lines.find(line=>line.id==='production-support-beam-sleeper').qty,.06);
});
