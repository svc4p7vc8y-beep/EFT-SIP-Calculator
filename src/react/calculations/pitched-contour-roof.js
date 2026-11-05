import clipping from 'polygon-clipping';
import { boundsOf } from '../planner/geometry.js';
import { lRoofFrame } from '../planner/l-roof-frame.js';
import { roofOutline } from '../planner/roof-outline.js';
import { hipRoofFromContour } from './hip-roof-geometry.js';

const EPS = 1e-7;
const difference = (a, b) => a.map((n, i) => n - b[i]);
const height = ([x, y, c], p) => x * p.x + y * p.y + c;
const ring = points => [[...points, points[0]].map(({ x, y }) => [x, y])];
const facetsOf = (polygons, plane) => polygons.map(([outer, ...holes]) => {
  if (holes.length) throw new Error('Скат с внутренним вырезом требует отдельных проектных плоскостей.');
  return { vertices: outer.slice(0, -1).map(([x, y]) => ({ x, y, z: height(plane, { x, y }) })) };
});
const diagonal = (a, b) => Math.abs(a.x-b.x)>EPS && Math.abs(a.y-b.y)>EPS;

// Recognize a chamfered bay on a straight wall while keeping its true roof outline.
function withoutBays(contour) {
  const count = contour.length;
  const drop = new Set();
  const at = index => contour[(index + count) % count];
  for (let i = 0; i < count; i++) {
    const a = at(i), b = at(i+1), c = at(i+2), d = at(i+3);
    if (!diagonal(a,b) || !diagonal(c,d)) continue;
    const before = at(i-1), after = at(i+4);
    const axis = ['x','y'].find(key => before[key]===a[key] && d[key]===a[key] && after[key]===a[key]);
    if (!axis) continue;
    const cross = p => (d.x-a.x)*(p.y-a.y)-(d.y-a.y)*(p.x-a.x);
    if (cross(b)>=-EPS || cross(c)>=-EPS) continue;
    for (let j=0;j<4;j++) drop.add((i+j)%count);
    i += 3;
  }
  return count - drop.size >= 3 ? contour.filter((_,i)=>!drop.has(i)) : contour;
}

function clipHalfPlane(points, plane) {
  return points.flatMap((a, i) => {
    const b = points[(i + 1) % points.length];
    const d1 = height(plane, a), d2 = height(plane, b);
    const accepted = d1 <= EPS ? [a] : [];
    if ((d1 < -EPS && d2 > EPS) || (d1 > EPS && d2 < -EPS)) {
      const t = d1 / (d1 - d2);
      accepted.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
    return accepted;
  });
}

function envelope(outline, regions) {
  const { x, x2, y, y2 } = boundsOf(outline);
  const box = [{ x, y }, { x: x2, y }, { x: x2, y: y2 }, { x, y: y2 }];
  const pieces = new Map();
  for (const [plane, limits] of regions) {
    const mask = limits.reduce(clipHalfPlane, box);
    if (mask.length < 3) continue;
    const polygons = clipping.intersection(ring(outline), ring(mask));
    if (!polygons.length) continue;
    const key = plane.join(',');
    if (!pieces.has(key)) pieces.set(key, { plane, polygons: [] });
    pieces.get(key).polygons.push(polygons);
  }
  return [...pieces.values()].flatMap(({ plane, polygons }) => facetsOf(clipping.union(...polygons), plane));
}

const lowerRegions = planes => planes.map(plane => [plane, planes.filter(other => other !== plane).map(other => difference(plane, other))]);

function teeFrame(points, shape, eave, gable, footprint = points) {
  if (points.length !== 8 || points.some((p, i) => {
    const q = points[(i + 1) % points.length];
    return Math.abs(p.x - q.x) > EPS && Math.abs(p.y - q.y) > EPS;
  })) return null;
  for (const transpose of [false, true]) for (const sign of [1, -1]) {
    const transform = p => ({ x: transpose ? p.y : p.x, y: sign * (transpose ? p.x : p.y) });
    const local = points.map(transform);
    const levels = [...new Set(local.map(p => p.y))].sort((a, b) => a - b);
    if (levels.length !== 3) continue;
    const [front, shoulder, tip] = levels;
    const span = y => local.filter((p, i) => {
      const q = local[(i + 1) % local.length];
      return (p.y < y && q.y > y) || (q.y < y && p.y > y);
    }).map(p => p.x).sort((a, b) => a - b);
    const trunk = span((front + shoulder) / 2), wing = span((shoulder + tip) / 2);
    if (trunk.length !== 2 || wing.length !== 2 || wing[0] <= trunk[0] + EPS || wing[1] >= trunk[1] - EPS) continue;
    const hip = shape === 'hip';
    const end = hip ? eave : gable;
    const actual = footprint.map(transform);
    const outline = roofOutline(actual, eave, eave, actual.map((p, i) => {
      const q = actual[(i + 1) % actual.length];
      return p.y === tip && q.y === tip || p.x === q.x && trunk.includes(p.x) ? end : eave;
    }));
    const center = (front + shoulder) / 2;
    const wingFactor = Math.min(1, (shoulder - front) / (wing[1] - wing[0]));
    const trunkPlanes = [[0, 1, -front], [0, -1, shoulder]];
    const wingPlanes = [[1, 0, -wing[0]], [-1, 0, wing[1]]];
    if (hip) {
      trunkPlanes.push([1, 0, -trunk[0]], [-1, 0, trunk[1]]);
      wingPlanes.push([0, -1, tip]);
    }
    const trunkRegions = lowerRegions(trunkPlanes);
    const wingRegions = lowerRegions(wingPlanes.map(plane => plane.map(n => n * wingFactor)));
    const regions = trunkRegions.map(([plane, limits]) => [plane, [...limits, [0, 1, -center]]]);
    for (const [main, mainLimits] of trunkRegions) for (const [branch, branchLimits] of wingRegions) {
      const limits = [[0, -1, center], ...mainLimits, ...branchLimits];
      if (main.join(',') === branch.join(',')) regions.push([main, limits]);
      else regions.push([main, [...limits, difference(branch, main)]], [branch, [...limits, difference(main, branch)]]);
    }
    const restore = p => transpose ? { x: sign * p.y, y: p.x, z: p.z } : { x: p.x, y: sign * p.y, z: p.z };
    return { facets: envelope(outline, regions).map(f => ({ vertices: f.vertices.map(restore) })), rise: (shoulder - front) / 2 };
  }
  return null;
}

export function pitchedContourRoof(points, { shape, axis, eave, gable, ridgeHeight }) {
  const clean = clipping.union(ring(points));
  if (clean.length !== 1 || clean[0].length !== 1) throw new Error('Для крыши нужен единый внешний контур.');
  const contour = clean[0][0].slice(0, -1).map(([x, y]) => ({ x, y }));
  const simple = withoutBays(contour);
  const bounds = boundsOf(simple);
  const l = lRoofFrame(simple.length===contour.length ? points : simple, shape);
  let frame;
  if (l) {
    const missing = [[bounds.x, bounds.y], [bounds.x2, bounds.y], [bounds.x, bounds.y2], [bounds.x2, bounds.y2]]
      .find(([x, y]) => !simple.some(p => p.x === x && p.y === y));
    const extend = points => roofOutline(points, eave, eave, points.map((p, i) => {
      const q = points[(i + 1) % points.length];
      return shape === 'gable' && (p.x === missing[0] && q.x === missing[0] || p.y === missing[1] && q.y === missing[1]) ? gable : eave;
    }));
    const extended = eave || gable ? lRoofFrame(extend(simple), shape) : l;
    if (extended) frame = {
      facets: contour.length === simple.length ? extended.facets : envelope(extend(contour), extended.regions),
      rise: extended.maxHeight - eave, offset: eave,
    };
  }
  frame ||= teeFrame(simple, shape, eave, gable, contour);
  if (!frame && shape === 'hip') {
    try {
      const mm = contour.map(p => [p.x * 1000, p.y * 1000]);
      const hip = hipRoofFromContour(mm, { angleDeg: 45, roofBase: 0, overhangMm: eave * 1000 });
      frame = { facets: hip.facets.map(f => ({ vertices: f.vertices.map(([x, y, z]) => ({ x: x / 1000, y: y / 1000, z: z / 1000 })) })), rise: hip.topZ / 1000 };
    } catch { /* A concave bay can still use the clipped main planes below. */ }
  }
  if (!frame) {
    const { x, x2, y, y2, w, h } = boundsOf(contour);
    const planesX = [[1, 0, -x], [-1, 0, x2]], planesY = [[0, 1, -y], [0, -1, y2]];
    const hip = shape === 'hip';
    const outline = roofOutline(contour, hip || axis === 'y' ? eave : gable, hip || axis === 'x' ? eave : gable);
    frame = {
      facets: envelope(outline, lowerRegions(hip ? [...planesX, ...planesY] : axis === 'y' ? planesX : planesY)),
      rise: (hip ? Math.min(w, h) : axis === 'y' ? w : h) / 2,
    };
  }
  if (!frame.facets.length || !(frame.rise > EPS)) throw new Error('Не удалось построить скаты по контуру.');
  return { facets: frame.facets.map(f => ({ vertices: f.vertices.map(p => ({
    ...p, z: (p.z - (frame.offset || 0)) * ridgeHeight / frame.rise,
  })) })) };
}
