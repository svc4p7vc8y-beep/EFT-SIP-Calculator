import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting,tileSurface,polygonAreaMm} from '../src/react/calculations/production-cutting.js';
import {normalizeProductionCutting} from '../src/react/state/production-cutting.js';
import {productionEstimateLines} from '../src/react/calculations/production-estimate.js';
import {productionScene} from '../src/react/calculations/production-scene.js';
import {windowSupportHeaders} from '../src/react/calculations/window-support-headers.js';
import {roofSupportPlanGroups,copyPlanRoofGroup,movePlanRoofGroup} from '../src/react/planner/roof-support-plan.js';
import {roofSupportFrame} from '../src/react/calculations/roof-support-frame.js';

const base=()=>{
  const p=createDefaultProject();p.plan={...p.plan,house:{w:6,h:4},rooms:[],walls:[],openings:[],wallGaps:[],platforms:[],piles:[],pileRows:[],bindingLines:[],wallHeight:2.5};
  Object.assign(p.settings.productionCutting,{kerfMm:3,endAllowanceMm:0,counterLathProfile:'50×50',windowSupportHeaders:{enabled:true,bearingMm:150}});return p;
};
const run=p=>calculateProductionCutting(p,calculateProject(p));

test('minimum SIP dimension remains 250 by default and a project override reaches tiling and diagnostics',()=>{
  assert.equal(normalizeProductionCutting({}).minPanelWidthMm,250);
  const surface={id:'s',name:'Узкая поверхность',horizontal:true,geometry:[[[[0,0],[200,0],[200,2000],[0,2000],[0,0]]]],layout:{}};
  assert.throws(()=>tileSurface(surface,1250,2500,1250,false),error=>error.code==='MIN_PANEL_WIDTH'&&!!error.blocker?.shape);
  const parts=tileSurface({...surface,minPanelWidthMm:100},1250,2500,1250,false);
  assert.equal(parts.reduce((sum,part)=>sum+part.area,0),400000);
  const p=base();p.settings.productionCutting.minPanelWidthMm=100;assert.equal(run(p).surfaces[0].minPanelWidthMm,100);
  assert.equal(migrateProject(p).settings.productionCutting.minPanelWidthMm,100);
});

test('a support frame copies with unique linked IDs and moves its posts and chords as one plan group',()=>{
  const p=base(),report=run(p),proposal=roofSupportFrame(p,report,{variant:'single',profile:'50×150',gapMm:590});
  assert.deepEqual(proposal.errors,[]);
  const first=roofSupportPlanGroups(proposal.items)[0],copy=copyPlanRoofGroup(first.members,'manual-frame');
  assert.ok(copy.every(item=>item.autoLocked&&item.planGroupId==='manual-frame'));
  const ids=new Set(copy.map(item=>item.id));
  for(const post of copy.filter(item=>item.type==='post'))assert.ok(ids.has(post.upperSupport));
  const moved=movePlanRoofGroup([...proposal.items,...copy],'manual-frame',.5,.25,report.assembly.roofModel);
  assert.deepEqual(moved.slice(0,proposal.items.length),proposal.items);
  assert.equal(moved.at(-1).x1,copy.at(-1).x1+500);assert.equal(moved.at(-1).y1,copy.at(-1).y1+250);
  assert.equal(roofSupportPlanGroups(moved).length,2);
});

test('a window under multiple purlins gets exactly 3 boards 50x150 with 150mm bearings, correct catalogue and volume',()=>{
  const p=base();p.plan.openings=[{id:'window',type:'window',outer:true,x:0,y:2,orientation:'v',width:1.5,height:1.2,sillHeight:.8}];
  const beam={id:'p1',type:'purlin',profile:'100×150',x1:0,y1:2000,z1:3000,x2:6000,y2:2000,z2:3000};
  const result=windowSupportHeaders(p,[beam,{...beam,id:'p2'}]);
  assert.equal(result.headers.length,3);assert.deepEqual(result.issues,[]);
  for(const header of result.headers){assert.equal(header.estimateCatalogId,'MAT-023');assert.equal(Math.hypot(header.x2-header.x1,header.y2-header.y1),1800);assert.ok(header.x1>=25&&header.x1<=149);}
  p.settings.productionCutting.roofSupports=result.items;
  const lines=productionEstimateLines(p).filter(line=>line.id.includes('window-support-header'));
  assert.equal(lines.length,3);assert.ok(Math.abs(lines.reduce((sum,line)=>sum+line.qty,0)-.0405)<1e-9);
  assert.equal(windowSupportHeaders(p).headers.length,3);
  assert.equal(windowSupportHeaders(p,[...result.items.filter(item=>item.type==='purlin').map(item=>({...item,y1:0,y2:0})),...result.headers]).headers.length,0);
  assert.equal(migrateProject(p).settings.productionCutting.roofSupports.filter(item=>item.autoWindowHeader).length,3);
});

test('reinforcement removes only its SIP pocket and does not duplicate the old schematic header',()=>{
  const p=base();p.plan.openings=[{id:'w',type:'window',outer:true,x:0,y:2,orientation:'v',width:1.5,height:1.2,sillHeight:.8}];
  const before=run(p);const beam={id:'p1',type:'purlin',profile:'100×150',nodeRef:'test',x1:0,y1:2000,z1:3000,x2:6000,y2:2000,z2:3000};
  p.settings.productionCutting.roofSupports=windowSupportHeaders(p,[beam]).items;
  const report=run(p),area=report=>report.surfaces.filter(s=>s.exterior).reduce((sum,s)=>sum+s.geometry.reduce((sum,shape)=>sum+polygonAreaMm(shape),0),0);
  assert.ok(Math.abs(area(before)-area(report)-270000)<1);
  assert.ok(!report.members.some(member=>member.role==='roof-opening-header'));
  const scene=productionScene(report,p);assert.equal(scene.beams.filter(beam=>beam.autoWindowHeader).length,3);
});

test('blocked surfaces expose exact diagnostic shapes in 3D without adding them to manufacturing',()=>{
  const p=base(),report=run(p),surface=report.surfaces.find(s=>s.planStart);
  surface.blocked=true;report.issues.push({code:'MIN_PANEL_WIDTH',target:surface.id,message:'Узкая деталь',blockers:[{kind:'panel',name:'Полоса 100 мм',shape:[[[0,0],[100,0],[100,1000],[0,1000]]]}]});
  const count=report.parts.length,scene=productionScene(report,p);
  assert.equal(scene.blockers.length,1);assert.equal(scene.blockers[0].name,'Полоса 100 мм');assert.ok(scene.blockers[0].placement);
  assert.equal(report.parts.length,count);
});


test('window reinforcement follows opening edits in the same undoable project transaction',async()=>{
  const {createProjectWorkspace,projectWorkspaceReducer}=await import('../src/react/state/project-tabs.js');
  const {roofSupportOpeningCanBridge}=await import('../src/react/calculations/roof-facet-supports.js');
  const p=base();p.plan.openings=[{id:'w',type:'window',outer:true,x:0,y:2,orientation:'v',width:1.5,height:1.2,sillHeight:.8}];
  p.settings.productionCutting.roofSupports=[{id:'p',type:'purlin',profile:'100×150',x1:0,y1:2000,z1:3000,x2:6000,y2:2000,z2:3000}];
  assert.equal(roofSupportOpeningCanBridge(p,0,2000,'100×150'),true);
  p.plan.openings.push({...p.plan.openings[0],id:'door',type:'door'});
  assert.equal(roofSupportOpeningCanBridge(p,0,2000,'100×150'),false);p.plan.openings.pop();
  let state=createProjectWorkspace(p);
  state=projectWorkspaceReducer(state,{type:'commit',update:next=>{next.plan.openings[0].width=2;return next;}});
  const headers=state.tabs[0].history.present.settings.productionCutting.roofSupports.filter(item=>item.autoWindowHeader);
  assert.equal(headers.length,3);assert.equal(headers[0].y2-headers[0].y1,2300);
  state=projectWorkspaceReducer(state,{type:'undo'});assert.equal(state.tabs[0].history.present.plan.openings[0].width,1.5);
  state=projectWorkspaceReducer(state,{type:'redo'});assert.equal(state.tabs[0].history.present.settings.productionCutting.roofSupports.filter(item=>item.autoWindowHeader).length,3);
});
