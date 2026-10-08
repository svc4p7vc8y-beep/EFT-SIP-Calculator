import test from 'node:test';
import assert from 'node:assert/strict';
import { partitionBoardShape, partitionDrawingData } from '../src/react/calculations/partition-drawing.js';
import { partitionFrameMembers } from '../src/react/calculations/partition-cutting.js';

const surface={id:'Э1-ПГ1',name:'Перегородка',width:3000,height:2500,frameProfile:'50×150',openings:[{key:'door',x:1000,width:900,height:2100,sill:0}],topPlateLayers:2};
const members=partitionFrameMembers(surface,{frameStepMm:625,endAllowanceMm:0});
test('board outline preserves cut endpoints and actual section, without square caps',()=>{
  assert.deepEqual(partitionBoardShape({a:[0,25],b:[3000,25],profile:'50×150'}),[[0,50],[3000,50],[3000,0],[0,0]]);
  assert.deepEqual(partitionBoardShape({a:[25,50],b:[25,2400],profile:'50×150'}),[[0,50],[0,2400],[50,2400],[50,50]]);
  assert.equal(partitionBoardShape({a:[0,0],b:[0,0],profile:'50×150'}),null);
});
test('partition drawing positions match grouped schedule and preserve opening and project profile',()=>{
  const drawing=partitionDrawingData(surface,members);
  assert.equal(drawing.depth,150);assert.deepEqual(drawing.openingX,[0,1000,1900,3000]);
  assert.equal(drawing.groups.reduce((sum,g)=>sum+g.qty,0),members.length);
  drawing.groups.forEach((g,i)=>g.instances.forEach(m=>assert.equal(drawing.positions.get(m.id),i+1)));
  assert.ok(drawing.axes.includes(975));assert.ok(drawing.axes.includes(1925));
  assert.equal(members.filter(m=>m.material==='Верхняя обвязка перегородки').length,2);
});
test('excluded boards are not numbered or dimensioned',()=>{
  const excluded={...members[0],excluded:true};
  const drawing=partitionDrawingData(surface,[excluded,...members.slice(1)]);
  assert.equal(drawing.positions.has(excluded.id),false);assert.equal(drawing.boards.length,members.length-1);
});
