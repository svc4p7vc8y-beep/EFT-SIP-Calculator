import { houseContourPoints } from '../planner/geometry.js';
import { pointInPolygon } from './placement-geometry.js';
import { placementWallFaces, projectToWallFace } from './placement-walls.js';

const epsilon = .001;
const close = (a, b) => Math.abs(a - b) < epsilon;
const round = value => Math.round(value * 1000) / 1000;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
const axisOf = (a, b) => close(a.x, b.x) ? 'y' : 'x';

export function pipeWallSnap(point, walls, clearanceMm, maxDistance = .3) {
  let best;
  for (const wall of walls) {
    if (!close(wall.a.x, wall.b.x) && !close(wall.a.y, wall.b.y)) continue;
    const { foot, distance } = projectToWallFace(wall, point);
    if (distance > maxDistance || (best && distance >= best.distance)) continue;
    const clearance = clearanceMm / 1000;
    best = { distance, point: { x: round(foot.x + wall.normal.x * clearance), y: round(foot.y + wall.normal.y * clearance) } };
  }
  return best?.point || point;
}

function inside(point, contour) {
  if (pointInPolygon(point, contour)) return true;
  return contour.some((a, i) => {
    const b = contour[(i + 1) % contour.length];
    return projectToWallFace({ a, b }, point)?.distance < epsilon;
  });
}

function insideSegment(a, b, contour) {
  if (!contour?.length) return true;
  if (!inside(a, contour) || !inside(b, contour)) return false;
  const axis = axisOf(a, b), fixed = axis === 'x' ? 'y' : 'x';
  const start = Math.min(a[axis], b[axis]), end = Math.max(a[axis], b[axis]);
  const cuts = [start, end];
  for (const [i, p] of contour.entries()) {
    const q = contour[(i + 1) % contour.length];
    if (close(p[fixed], q[fixed])) continue;
    const t = (a[fixed] - p[fixed]) / (q[fixed] - p[fixed]);
    if (t < 0 || t > 1) continue;
    const value = p[axis] + t * (q[axis] - p[axis]);
    if (value > start && value < end) cuts.push(value);
  }
  cuts.sort((x, y) => x - y);
  return cuts.slice(1).every((value, i) => inside({ [axis]: (cuts[i] + value) / 2, [fixed]: a[fixed] }, contour));
}

function simplify(points) {
  const result = [];
  for (const point of points) {
    if (result.length && distance(result.at(-1), point) < epsilon) continue;
    if (result.length > 1) {
      const [a, b] = result.slice(-2);
      if (Math.abs(distance(a, b) + distance(b, point) - distance(a, point)) < epsilon) result.pop();
    }
    result.push(point);
  }
  return result;
}

function horizontalLink(a, b, first, contour) {
  if ((close(a.x, b.x) || close(a.y, b.y)) && insideSegment(a, b, contour)) return [a, b];
  const other = first === 'x' ? 'y' : 'x';
  const options = [
    [a, { ...a, [first]: b[first] }, b],
    [a, { ...a, [other]: b[other] }, b],
  ];
  if (contour?.length) {
    for (const axis of [first, other]) for (const vertex of contour) {
      const cross = axis === 'x' ? 'y' : 'x';
      for (const margin of [0, .04, -.04]) {
        const value = round(vertex[axis] + margin);
        options.push([a, { ...a, [axis]: value }, { ...a, [axis]: value, [cross]: b[cross] }, b]);
      }
    }
  }
  return options.find(points => points.slice(1).every((point, i) => insideSegment(points[i], point, contour))) || null;
}

function outerWallLink(a, b, walls, clearanceMm, first, contour) {
  const boundary = walls.filter(wall => wall.type === 'outer');
  if (boundary.length < 4 || boundary.some(wall => !close(wall.a.x, wall.b.x) && !close(wall.a.y, wall.b.y))) return null;
  const clear = clearanceMm / 1000;
  const edges = boundary.map(wall => {
    const axis = axisOf(wall.a, wall.b), across = axis === 'x' ? 'y' : 'x';
    return { axis, across, offset: round(wall.a[across] + wall.normal[across] * clear) };
  });
  if (edges.some((edge, i) => edge.axis === edges[(i + 1) % edges.length].axis)) return null;
  const corners = edges.map((edge, i) => ({ [edge.across]: edge.offset, [edge.axis]: edges.at(i - 1).offset, z: a.z }));
  const closest = point => corners.map((start, i) => {
    const end = corners[(i + 1) % corners.length], projected = projectToWallFace({ a: start, b: end }, point)?.foot;
    return projected ? { i, point: { ...projected, z: a.z }, distance: distance(point, { ...projected, z: a.z }) } : null;
  }).filter(Boolean).sort((x, y) => x.distance - y.distance).find(hit => horizontalLink(point, hit.point, first, contour));
  const start = closest(a), end = closest(b);
  if (!start || !end) return null;
  const paths = start.i === end.i ? [[start.point, end.point]] : [1, -1].map(step => {
    const points = [start.point];
    for (let i = start.i; i !== end.i; i = (i + step + corners.length) % corners.length) points.push(corners[(i + (step > 0 ? 1 : 0)) % corners.length]);
    return [...points, end.point];
  });
  const length = points => points.slice(1).reduce((total, p, i) => total + distance(points[i], p), 0);
  const path = paths.filter(points => points.slice(1).every((point, i) => insideSegment(points[i], point, contour))).sort((x,y) => length(x) - length(y))[0];
  return path ? [...horizontalLink(a, start.point, first, contour).slice(0, -1), ...path, ...horizontalLink(end.point, b, first, contour).slice(1)] : null;
}

export function orthogonalPipePath(points, { plan, first = 'x', alongWall = false, clearanceMm = 30, keepWaypoints = false } = {}) {
  const contour = plan ? houseContourPoints(plan) : null;
  const walls = alongWall && plan ? placementWallFaces(plan) : null;
  const result = points.length ? [points[0]] : [];
  for (const [i, target] of points.slice(1).entries()) {
    const source = points[i];
    if (close(source.x, target.x) && close(source.y, target.y)) {
      if (!close(source.z || 0, target.z || 0)) result.push(target);
      continue;
    }
    const levelTarget = { ...target, z: source.z };
    const link = (walls && outerWallLink(source, levelTarget, walls, clearanceMm, first, contour))
      || horizontalLink(source, levelTarget, first, contour);
    if (!link) return null;
    result.push(...link.slice(1));
    if (!close(source.z || 0, target.z || 0)) result.push(target);
  }
  return keepWaypoints ? result.filter((point, i) => !i || distance(point, result[i - 1]) >= epsilon) : simplify(result);
}
