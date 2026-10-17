import { roomPoints } from '../planner/geometry.js';
import { platformRoofFrame } from '../planner/platform-roof-frame.js';
import { resolveRoofAxes } from '../../calculations/roof-orientation.js';

const merge = (segments) => {
  const sorted = segments.filter(([a, b]) => b - a > 1e-6).sort((a, b) => a[0] - b[0]);
  return sorted.reduce((result, [a, b]) => {
    const last = result.at(-1);
    if (last && a <= last[1] + 1e-6) last[1] = Math.max(last[1], b);
    else result.push([a, b]);
    return result;
  }, []);
};

function crossingIntervals(points, axis, coordinate) {
  const hits = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const crossA = axis === 'x' ? a.y : a.x;
    const crossB = axis === 'x' ? b.y : b.x;
    if ((crossA <= coordinate && crossB > coordinate) || (crossB <= coordinate && crossA > coordinate)) {
      const alongA = axis === 'x' ? a.x : a.y;
      const alongB = axis === 'x' ? b.x : b.y;
      hits.push(alongA + (alongB - alongA) * (coordinate - crossA) / (crossB - crossA));
    }
  }
  hits.sort((a, b) => a - b);
  return Array.from({ length: Math.floor(hits.length / 2) }, (_, i) => [hits[2 * i], hits[2 * i + 1]]);
}

// Geometric lengths only. The selected 3-board package remains a project catalog item.
export function gluedRidgeLayout(project, mainRidgeAvailable, terraceRoofs = []) {
  const roof = project.settings.roof;
  const plan = project.upperFloors?.at(-1) || project.plan;
  const { ridgeAxis: axis, ridgeBaseLength, span } = resolveRoofAxes(plan, roof);
  const rooms = [project.plan, ...(project.upperFloors || [])].flatMap(floor => floor.rooms || []);
  const main = mainRidgeAvailable && roof.shape === 'gable' ? merge(rooms
    .filter(room => room.include !== false && room.ceilingMode === 'open-rafter')
    .flatMap(room => crossingIntervals(roomPoints(room), axis, span / 2))
    .map(([a, b]) => [Math.max(0, a), Math.min(ridgeBaseLength, b)])) : [];
  const terraces = mainRidgeAvailable ? terraceRoofs.flatMap(({ platform, result }) => {
    if (result.mode !== 'cold') return [];
    const frame = platformRoofFrame(platform, project.plan.house, roof.rafterStep, roof);
    if (!frame?.ridge) return [];
    const [start, finish] = frame.ridge;
    const a = [start.x, start.y], b = [finish.x, finish.y];
    if (frame.continuation) {
      const overhang = Math.max(0, Number(roof.gableOverhang) || 0);
      const boundary = result.side === 'left' || result.side === 'top' ? -overhang
        : result.side === 'right' ? Number(project.plan.house.w) + overhang
          : Number(project.plan.house.h) + overhang;
      const index = result.side === 'left' || result.side === 'right' ? 0 : 1;
      if (result.side === 'left' || result.side === 'top') {
        a[index] = Math.min(a[index], boundary); b[index] = Math.min(b[index], boundary);
      } else {
        a[index] = Math.max(a[index], boundary); b[index] = Math.max(b[index], boundary);
      }
    }
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return length > 1e-6 ? [{ id: platform.id, a, b, length }] : [];
  }) : [];
  return { axis, main, mainLength: main.reduce((sum, [a, b]) => sum + b - a, 0), terraces };
}
