import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { orthogonalPipePath, pipeWallSnap } from '../src/react/state/placement-pipe-routing.js';
import { placementWallFaces } from '../src/react/state/placement-walls.js';
import { networkBill } from '../src/react/state/placement-networks.js';
import { PIPE_EQUIPMENT } from '../src/react/state/placement-pipe-bill.js';

const p = (x,y,z=.5) => ({ x,y,z });
const isOrthogonal = points => points.slice(1).every((b,i) => {
  const a = points[i];
  return ['x','y','z'].filter(axis => Math.abs(a[axis] - b[axis]) > .001).length <= 1;
});

test('pipe routing stays orthogonal along a concave perimeter, including vertical rises', () => {
  const plan = createDefaultProject().plan;
  plan.house = { w: 10, h: 8, contourDefined: true, points: [p(0,0),p(10,0),p(10,4),p(6,4),p(6,8),p(4,8),p(4,4),p(0,4)] };
  plan.rooms = [];
  const from = p(1,3.5,.4), to = p(5.5,7.3,1.5);
  const path = orthogonalPipePath([from, p(from.x,from.y,1.2), p(to.x,to.y,1.2), to], { plan, alongWall: true });
  assert.deepEqual(path.slice(0,2), [from, p(from.x,from.y,1.2)]);
  assert.deepEqual(path.at(-1), to);
  assert(isOrthogonal(path));
  assert(path.some(point => Math.abs(point.y - 3.796) < .02 || Math.abs(point.x - 5.796) < .02));
  const snapped = pipeWallSnap(p(2,.4), placementWallFaces(plan), 50);
  assert.equal(snapped.y, .224);
  const moved = orthogonalPipePath([from, p(2.3,2.7,.4), to], { plan, keepWaypoints: true });
  assert(isOrthogonal(moved));
  assert.deepEqual(moved.at(-1), to);
});

test('heating bill counts shared tee, bends, mounted pipe and opted-in boiler/radiator rows after reopen', () => {
  const project = createDefaultProject();
  project.plan.house = { w: 10, h: 8 };
  project.placement.items.push(
    ...[['source','heat-source',1,1],['branch','heat-manifold',3,1],['radiator','radiator-point',5,1],['sink','radiator-point',3,3]].map(([id,kind,x,y])=>({
      id, floor:1, layer:'heating', label:id, kind,x,y,height:.5,heightKnown:true,
      pipeKit: (kind === 'heat-source' ? PIPE_EQUIPMENT.boiler : kind === 'radiator-point' ? PIPE_EQUIPMENT.radiator : []).map(row=>row[1]),
    })),
  );
  for (const [i,[fromId,toId,points]] of [['source','branch',[p(1,1),p(3,1)]],['branch','radiator',[p(3,1),p(5,1)]],['branch','sink',[p(3,1),p(3,3)]]].entries()) {
    project.placement.networks.heating.push({ id:'pipe-'+i, chainId:'chain', floor:1, medium:'supply', fromId,toId,points,routing:'orthogonal',material:'PEX',diameterMm:16,fastener:'clip',fastenerSpacingM:.5 });
  }
  project.placement.networkCustomRows = {'heating-1':[{id:'extra',name:'Сервисная муфта',quantity:2,unit:'шт'}]};
  const saved=migrateProject(JSON.parse(JSON.stringify(project)));
  const bill=networkBill(saved.placement,'heating',1,saved.plan);
  const qty=label=>bill.components.find(row=>row.name.startsWith(label))?.quantity;
  assert.equal(bill.totalLength,6);
  assert.equal(qty('Тройник'),1);
  assert.equal(qty('Клипса'),15);
  assert.equal(qty('Кронштейн радиатора'),4);
  assert.equal(qty('Грязевик'),1);
  assert.equal(qty('Сервисная муфта'),2);
  assert.equal(saved.placement.networks.heating[0].chainId,'chain');
});
