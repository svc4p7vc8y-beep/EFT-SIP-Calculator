import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { electricalRouteLength3d } from '../src/react/state/placement-electrical.js';
import { appendSurfaceWaypoint, nearestRouteWall, replaceRouteSurface, routeSurfaceHeight, surfaceRouteLeg } from '../src/react/state/placement-route-surfaces.js';

const near = (a, b) => Math.abs(a - b) < .001;

test('route stays on requested planes and rises only at wall faces', () => {
  const plan = createDefaultProject().plan;
  const ceiling = routeSurfaceHeight(plan, 'ceiling');
  const source = { x: 2, y: 2, z: .9, surface: 'device' };
  const first = appendSurfaceWaypoint([source], { x: 3, y: 2 }, 'ceiling', plan);
  const next = appendSurfaceWaypoint(first, { x: 3, y: 3 }, 'floor', plan);
  assert.ok(first.length > 2);
  assert.ok(near(first.at(-1).z, ceiling));
  assert.equal(first.at(-1).waypoint, true);
  assert.ok(near(next.at(-1).z, 0));
  for (const [index, point] of next.entries()) {
    if (!index) continue;
    const previous = next[index - 1];
    if (!near(point.z, previous.z)) {
      assert.ok(near(point.x, previous.x) && near(point.y, previous.y));
      const wall = nearestRouteWall(plan, point, point.wallRef);
      assert.ok(wall.projection.distance < .01);
    }
  }
  assert.ok(electricalRouteLength3d(next) > Math.hypot(1, 1, source.z));
});

test('a wall waypoint is projected onto a face and keeps ordered route points', () => {
  const plan = createDefaultProject().plan;
  const start = { x: 2, y: 2, z: .9, surface: 'device' };
  const picked = { x: 2.6, y: 2.1 };
  const points = appendSurfaceWaypoint([start], picked, 'wall', plan, 2.2);
  assert.ok(points.length >= 2);
  assert.equal(points.at(-1).surface, 'wall');
  assert.ok(near(points.at(-1).z, 2.2));
  assert.ok(nearestRouteWall(plan, points.at(-1), points.at(-1).wallRef).projection.distance < .01);
  const roof = appendSurfaceWaypoint(points, { x: 3, y: 2 }, 'ceiling', plan);
  assert.ok(near(roof.at(-1).x, 3) && near(roof.at(-1).y, 2));
  assert.ok(roof.length > points.length);
});

test('surface change preserves endpoints and old project routes migrate unchanged', () => {
  const project = createDefaultProject();
  const plan = project.plan;
  const start = { x: 2, y: 2, z: 0 };
  const end = { x: 3, y: 2, z: 0 };
  const ceiling = replaceRouteSurface([start, end], 0, 'ceiling', plan);
  assert.deepEqual([ceiling[0].x, ceiling[0].y, ceiling[0].z], [2, 2, 0]);
  assert.deepEqual([ceiling.at(-1).x, ceiling.at(-1).y, ceiling.at(-1).z], [3, 2, 0]);
  assert.ok(electricalRouteLength3d(ceiling) > 1 + routeSurfaceHeight(plan, 'ceiling') * 2);
  project.placement.routes.push({ id: 'legacy', floor: 1, circuitId: 'c', auto: false, points: [start, end] });
  project.placement.routes.push({ id: 'surface', floor: 1, circuitId: 'c', auto: false, points: ceiling });
  const restored = migrateProject(JSON.parse(JSON.stringify(project))).placement.routes;
  assert.deepEqual(restored.find(route => route.id === 'legacy').points, [start, end]);
  assert.equal(restored.find(route => route.id === 'surface').points.some(point => point.surface === 'ceiling'), true);
  assert.ok(surfaceRouteLeg(start, end, 'wall', plan, 2.2));
});
