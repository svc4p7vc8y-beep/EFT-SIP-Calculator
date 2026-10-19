import clipping from 'polygon-clipping';
import { roofOutline } from '../planner/roof-outline.js';

const area = points => Math.abs(points.reduce((sum, point, index) => {
  const next = points[(index + 1) % points.length];
  return sum + point[0] * next[1] - point[1] * next[0];
}, 0)) / 2;

// Coordinates and offsets are millimetres. The axis is the long direction of the roof.
export function contourRoofOutline(contour, axis, eaveMm, gableMm) {
  const points = roofOutline(contour.map(([x, y]) => ({ x, y })),
    axis === 'x' ? gableMm : eaveMm,
    axis === 'x' ? eaveMm : gableMm);
  const polygon = points.map(({ x, y }) => [x, y]);
  // An offset of a narrow recess can fold over itself; never fabricate from that geometry.
  const ring = [...polygon, polygon[0]];
  const clean = clipping.union([ring]);
  if (clean.length !== 1 || clean[0].length !== 1 || Math.abs(area(clean[0][0]) - area(polygon)) > 1) {
    throw new Error('Свесы создают самопересечение контура крыши. Уменьшите свес или задайте скаты XYZ.');
  }
  return polygon;
}

export function contourRoofStrip(outline, axis, low, high) {
  const xy = axis === 'x'
    ? [[low, -1000000], [high, -1000000], [high, 1000000], [low, 1000000]]
    : [[-1000000, low], [1000000, low], [1000000, high], [-1000000, high]];
  return clipping.intersection([[...outline, outline[0]]], [[...xy, xy[0]]])
    .map(poly => {
      if (poly.length !== 1) throw new Error('Контур ската содержит внутренний вырез. Задайте проектные скаты XYZ.');
      return poly[0].slice(0, -1);
    })
    .filter(poly => area(poly) > 1);
}

export const contourProjectedArea = polygons => polygons.reduce((sum, polygon) => sum + area(polygon), 0) / 1e6;

export function facetedRoofArea(frame, ridgeHeight) {
  if (!frame?.facets?.length || !frame.maxHeight) return 0;
  const factor = ridgeHeight / frame.maxHeight;
  return frame.facets.reduce((sum, facet) => {
    const vertices = facet.vertices;
    const xy = vertices.map(({ x, y }) => [x, y]);
    const a = vertices[0], b = vertices[1];
    const c = vertices.find((point, index) => index > 1 &&
      Math.abs((b.x-a.x)*(point.y-a.y)-(b.y-a.y)*(point.x-a.x)) > 1e-8);
    if (!c) return sum;
    const ux=b.x-a.x, uy=b.y-a.y, uz=(b.z-a.z)*factor;
    const vx=c.x-a.x, vy=c.y-a.y, vz=(c.z-a.z)*factor;
    const nz=ux*vy-uy*vx;
    return sum + area(xy) * Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,nz) / Math.abs(nz);
  }, 0);
}
