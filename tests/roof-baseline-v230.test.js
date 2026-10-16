import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';

// v230 prices are retained as the old reference; cost is the new centered wall-plate takeoff.
const cases=[
  {name:'cold gable',shape:'gable',faces:2,area:70.205,rafters:30,oldCost:1773629.50,cost:1773329.50},
  {name:'warm SIP gable',shape:'gable',type:'sip',faces:2,area:70.205,warmArea:70.205,rafters:0,roofSurfaces:2,oldCost:2132073.90,cost:2131773.90},
  {name:'cold hip',shape:'hip',faces:4,area:73.470,rafters:46,oldCost:1986081.00,cost:1985631.00},
  {name:'cold tiered',shape:'tiered',faces:2,area:68.534,rafters:30,oldCost:1781627.55,cost:1770272.75},
  {name:'structural flat',shape:'flat',flatSlopeMode:'structural',faces:1,area:60.275,rafters:15,oldCost:1622214.65,cost:1652391.45},
  {name:'tapered flat',shape:'flat',flatSlopeMode:'tapered',faces:1,area:60.275,rafters:0,oldCost:1605359.15,cost:1635535.95},
  {name:'L-shaped hip',shape:'hip',lShaped:true,faces:8,area:75.340,rafters:63,oldCost:2326238.48,cost:2325788.48},
  {name:'gable with terrace roof',shape:'gable',terrace:true,faces:4,area:70.205,rafters:40,oldCost:1978169.15,cost:1977869.15},
];

for(const scenario of cases)test(`v230 roof baseline: ${scenario.name}`,()=>{
  const project=createDefaultProject();
  project.plan.house={w:8,h:6};project.plan.rooms=[];project.plan.openings=[];project.plan.platforms=[];
  project.settings.productionCutting.roofDesign.enabled=true;
  project.settings.roof.shape=scenario.shape;
  if(scenario.type)project.settings.roof.type=scenario.type;
  if(scenario.flatSlopeMode){project.settings.roof.flatSlopeMode=scenario.flatSlopeMode;project.settings.roof.flatSlopePercent=5;}
  if(scenario.lShaped){project.plan.house={w:10,h:8,points:[[0,0],[10,0],[10,4],[4,4],[4,8],[0,8]].map(([x,y])=>({x,y}))};project.settings.roof.eaveOverhang=0;project.settings.roof.gableOverhang=0;}
  if(scenario.terrace)project.plan.platforms=[{id:'T',kind:'terrace',x:1,y:6,w:4,h:2,roof:{mode:'cold',shape:'gable'}}];
  const calculation=calculateProject(project),report=calculateProductionCutting(project,calculation),model=report.assembly.roofModel;
  assert.equal(model.faces.length,scenario.faces);
  assert.ok(Math.abs(model.mainArea-scenario.area)<.001,`${model.mainArea} m²`);
  assert.ok(Math.abs(model.warmArea-(scenario.warmArea||0))<.001,`${model.warmArea} m² warm`);
  assert.equal(report.assembly.rafters.length,scenario.rafters);
  assert.equal(report.surfaces.filter(surface=>surface.roofFaceId).length,scenario.roofSurfaces||0);
  assert.equal(Math.round(calculation.totals.total*100)/100,scenario.cost);
});
