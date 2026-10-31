import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {synchronizeWallThickness} from '../src/react/state/wall-thickness.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {flatWallDrop,setFlatWallDrop} from '../src/react/calculations/flat-wall-height.js';
import {roofHeight,roofAt} from '../src/react/calculations/roof-project.js';
import {productionLevels} from '../src/react/calculations/production-levels.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1.1,`${a} != ${b}`);
function fixture(){const p=createDefaultProject();Object.assign(p.plan,{house:{w:6,h:3,contourDefined:true},layoutMode:'walls',rooms:[],walls:[{id:'p',x1:3,y1:0,x2:3,y2:3}],openings:[],wallGaps:[],platforms:[],pileRows:[],piles:[],bindingLines:[],wallHeight:2.5});return p;}
const run=p=>{const c=calculateProject(p);return {c,r:calculateProductionCutting(p,c)};};

test('thickness changes reattach old inner faces but preserve free points and the exterior outline',()=>{
  const p=fixture();p.plan.rooms=[{id:'room',x:.174,y:.174,w:2.826,h:2.652}];p.plan.walls=[{id:'a',x1:3,y1:.174,x2:3,y2:2.826},{id:'free',x1:1,y1:1,x2:2,y2:1}];
  const outline=structuredClone(p.plan.house),free=structuredClone(p.plan.walls[1]);
  p.settings.sip.wallThickness=124;synchronizeWallThickness(p,'wallThickness');
  assert.equal(p.plan.rooms[0].x,.124);assert.equal(p.plan.rooms[0].y,.124);
  assert.equal(p.plan.walls[0].y1,.124);assert.equal(p.plan.walls[0].y2,2.876);
  assert.deepEqual(p.plan.house,outline);assert.deepEqual(p.plan.walls[1],free);
  p.settings.sip.wallThickness=224;synchronizeWallThickness(p,'wallThickness');assert.equal(p.plan.walls[0].y1,.224);
});

test('metre drop cuts whole 2500mm panels downward and partitions match the sloped ceiling',()=>{
  for(const direction of ['front','back','left','right']){
    const p=fixture();Object.assign(p.settings.roof,{shape:'flat',type:'cold',flatSlopeMode:'structural',flatSlopeDirection:direction});setFlatWallDrop(p,.15);
    near(flatWallDrop(p),.15);
    const {c,r}=run(p),walls=r.surfaces.filter(s=>s.exterior),partition=r.surfaces.find(s=>s.partitionFrame);
    near(Math.max(...walls.flatMap(s=>[s.heightStart,s.heightEnd])),2500);
    assert.ok(walls.every(s=>s.height<=2500.1));
    assert.ok(r.parts.filter(part=>walls.some(wall=>wall.id===part.surfaceId)).every(part=>Math.max(...part.shape.flat(2).filter(Array.isArray).map(point=>point[1]))<=2501));
    assert.ok(partition.topProfile);
    const json=migrateProject(JSON.parse(JSON.stringify(p)));assert.equal(json.settings.roof.flatWallHeightReference,'high');
    assert.ok(c.metrics.firstFloorExteriorWallNetArea<43.3);
  }
});

test('regular partitions meet the actual underside of SIP roof and purchasing follows their added height',()=>{
  const p=fixture();p.services.sipCeiling=false;p.settings.roof.type='sip';
  const before=structuredClone(p),{c,r}=run(p),s=r.surfaces.find(s=>s.partitionFrame),face=r.assembly.roofModel.faces.find(f=>f.group==='main');
  assert.ok(s.topProfile.length>=3);assert.ok(s.height>2500);
  const base=productionLevels(p,1).bases[0];
  for(const [x,height] of s.topProfile){const t=x/s.width,X=s.planStart[0]+(s.planEnd[0]-s.planStart[0])*t,Y=s.planStart[1]+(s.planEnd[1]-s.planStart[1])*t;const hits=roofAt(r.assembly.roofModel,X,Y).filter(hit=>hit.face.group==='main');const underside=Math.max(...hits.map(hit=>hit.z-Number(hit.face.thickness)/(2*hit.face.normal[2])));near(height+base,underside);}
  const manual=structuredClone(p);manual.settings.sip.partitionTopMode='manual';const manualResult=run(manual);
  assert.ok(c.metrics.firstFloorPartitionNetArea>manualResult.c.metrics.firstFloorPartitionNetArea);
  assert.equal(manualResult.r.surfaces.find(s=>s.partitionFrame).height,2500);
  assert.deepEqual(p,before);
});
