import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject} from '../src/react/state/project-model.js';
import {collectSnapAxes,houseContourPoints} from '../src/react/planner/geometry.js';
import {gapEndpoints} from '../src/react/planner/gap-endpoints.js';
import {resizeWallGap} from '../src/react/planner/wall-gap-handles.js';
import {limitDiagonalPartition} from '../src/react/planner/diagonal-partition.js';
import {gapFragments} from '../src/react/calculations/gap-fragments.js';
import {tileSurface} from '../src/react/calculations/production-cutting.js';
import {HORIZONTAL_LAYOUT_DIRECTIONS} from '../src/react/calculations/surface-orientation.js';
import {createProjectWorkspace,projectWorkspaceReducer,serializeProjectWorkspace,restoreProjectWorkspace} from '../src/react/state/project-tabs.js';
import {projectFromPlanFile,createPlanTransfer} from '../src/react/storage/plan-transfer.js';

const plan=()=>({...createDefaultProject().plan,house:{w:6,h:4},rooms:[],walls:[],wallGaps:[]});
test('two gap handles snap to exterior corners without rotating the gap or moving the opposite end',()=>{
  const p=plan(),gap={id:'g',x:3,y:0,width:2,orientation:'h',outer:true};
  const changed=resizeWallGap(p,gap,0,{x:.03,y:3});
  assert.deepEqual(gapEndpoints(changed),[{x:0,y:0},{x:4,y:0}]);
  const full=resizeWallGap(p,changed,1,{x:5.97,y:4});
  assert.deepEqual(gapEndpoints(full),[{x:0,y:0},{x:6,y:0}]);
  assert.equal(full.orientation,'h');
  const contour=houseContourPoints(p),edges=contour.map((a,i)=>({a,b:contour[(i+1)%contour.length],outer:true}));
  assert.equal(gapFragments(full,edges).error,null);
  const vertical=resizeWallGap(p,{id:'v',x:6,y:2,width:2,orientation:'v',outer:true},1,{x:0,y:3.96});
  assert.equal(gapEndpoints(vertical)[1].y,4);assert.equal(vertical.x,6);
});
test('gap endpoints snap a new diagonal partition to the actual gap corner, with positive width and unmodified walls',()=>{
  const p=plan();p.walls=[{id:'a',x1:0,y1:2,x2:3,y2:2},{id:'b',x1:3,y1:2,x2:6,y2:2}];
  const before=structuredClone(p.walls),gap={id:'g',x:2,y:2,width:1,orientation:'h',outer:false};
  const resized=resizeWallGap(p,gap,1,{x:5.99,y:2});
  assert.equal(gapEndpoints(resized)[1].x,6);
  const crossed=resizeWallGap(p,resized,0,{x:100,y:2});assert.ok(crossed.width>=.0099);
  p.wallGaps=[resized];assert.ok(collectSnapAxes(p).points.some(point=>point.x===1.5&&point.y===2));
  assert.deepEqual(p.walls,before);
});
test('new diagonal partitions cap at 3000 mm while axial partitions and existing saved data remain unrestricted',()=>{
  for(const start of [{x:0,y:0},{x:-2.123,y:4.567}])for(const dx of [-7,-2,2,7])for(const dy of [-5,1,5]){
    const end={x:start.x+dx,y:start.y+dy},point=limitDiagonalPartition(start,end);
    assert.ok(Math.hypot(point.x-start.x,point.y-start.y)<=3+.000001);
    assert.deepEqual(end,{x:start.x+dx,y:start.y+dy});
  }
  assert.deepEqual(limitDiagonalPartition({x:0,y:0},{x:12,y:0}),{x:12,y:0});
  assert.deepEqual(limitDiagonalPartition({x:0,y:0},{x:1,y:1}),{x:1,y:1});
});
test('opening a library or server project explicitly in a fresh tab preserves unsaved edits and independent revision state',()=>{
  const project=createDefaultProject();
  let state=createProjectWorkspace(project,'initial');
  state=projectWorkspaceReducer(state,{type:'open-tab',id:'one',project,libraryId:'same',serverId:'server',serverRevision:1});
  state=projectWorkspaceReducer(state,{type:'commit',update:p=>{p.meta.projectName='Несохранённые правки';return p;}});
  state=projectWorkspaceReducer(state,{type:'open-tab',id:'two',project,libraryId:'same',serverId:'server',serverRevision:1,forceNew:true});
  assert.equal(state.tabs.length,3);assert.equal(state.activeId,'two');
  assert.equal(state.tabs[1].history.present.meta.projectName,'Несохранённые правки');
  state=projectWorkspaceReducer(state,{type:'server-revision',tabId:'two',serverId:'server',revision:2});
  assert.equal(state.tabs[1].serverRevision,1);assert.equal(state.tabs[2].serverRevision,2);
  assert.equal(restoreProjectWorkspace(serializeProjectWorkspace(state,'local'),project).tabs.length,3);
});
test('floor, ceiling and inter-floor layout labels match the real long panel axis without changing area',()=>{
  for(const id of ['Э1-ПОЛ','Э1-ПТ','Э2-ПОЛ']){
    const surface={id,name:id,horizontal:true,geometry:[[[[0,0],[5000,0],[5000,5000],[0,5000],[0,0]]]]};
    for(const [axis,expected] of [['x','Y'],['y','X']]){
      const parts=tileSurface({...surface,layout:{direction:axis}},1250,2500,1250,false);
      const full=parts.find(p=>p.width*p.height===1250*2500);
      assert.ok(full);assert.equal(full.width>full.height,expected==='X');
      assert.ok(HORIZONTAL_LAYOUT_DIRECTIONS.find(option=>option.value===axis).label.endsWith(expected));
      assert.equal(parts.reduce((sum,p)=>sum+p.area,0),25e6);
    }
  }
});

test('Open plan creates a separate full project and retains imported prices, edits and project identity',()=>{
  const current=createDefaultProject(),source=createDefaultProject();
  current.meta.projectName='Оставить открытым';source.meta.projectName='Импортированный';source.meta.projectNum='12345';
  source.priceMat[0].price=123;source.estimateOverrides=[{lineId:'line',price:321,qty:2}];
  const before=JSON.stringify(current);
  const full=projectFromPlanFile(current,{...source,format:'eft-project'});
  assert.equal(full.meta.projectName,source.meta.projectName);assert.equal(full.priceMat[0].price,123);assert.deepEqual(full.estimateOverrides,source.estimateOverrides);
  const planOnly=projectFromPlanFile(current,createPlanTransfer(source));
  assert.equal(planOnly.meta.projectNum,'12345');assert.equal(planOnly.meta.projectName,'Импортированный');
  assert.equal(JSON.stringify(current),before);
});
