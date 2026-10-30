import { flatRoofFootprint } from './flat-roof-assembly.js';
import { insetRoofContour } from './roof-wall-plate.js';

// The estimate and cutting model retain their saved roof footprint. Only the
// display geometry stops at the inside face of the parapet.
export function flatRoofDisplayContour(contour, roof = {}, wallThicknessMm = 174) {
  const points = contour.map(point => Array.isArray(point) ? point.slice(0, 2) : [point.x, point.y]);
  // The saved contour is the exterior wall face. The parapet is directly over
  // that wall, so its inner face is one full wall thickness farther inside.
  const inset = Math.max(0, Number(wallThicknessMm) || 0) + 4;
  const inside = insetRoofContour(points, inset);
  if (!inside) return flatRoofFootprint(points, roof);
  if (roof.flatParapetMode !== 'open') return inside;
  const outside = flatRoofFootprint(points, roof);
  const side = roof.flatOpenSide || 'back';
  const axis = side === 'left' || side === 'right' ? 0 : 1;
  const extreme = Math[side === 'left' || side === 'front' ? 'min' : 'max'](...points.map(point => point[axis]));
  return inside.map((point, index) => {
    const result = [...point];
    if (Math.abs(points[index][axis] - extreme) < 1) result[axis] = outside[index][axis];
    return result;
  });
}

export function flatRoofPlaneZ(face, point) {
  const normal = face.normal || [0, 0, 1];
  const origin = face.origin || face.vertices?.[0] || [0, 0, 0];
  return origin[2] - (normal[0] * (point[0] - origin[0]) + normal[1] * (point[1] - origin[1])) / (normal[2] || 1);
}

export function flatRoofLocalContour(face, contour) {
  return contour.map(point => {
    const delta = [point[0] - face.origin[0], point[1] - face.origin[1], flatRoofPlaneZ(face, point) - face.origin[2]];
    return [delta.reduce((sum, value, index) => sum + value * face.u[index], 0), delta.reduce((sum, value, index) => sum + value * face.v[index], 0)];
  });
}

function containsPoint(polygon, point) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    const cross = (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
    if (Math.abs(cross) < 1e-5 && point[0] >= Math.min(a[0], b[0]) - 1e-5 && point[0] <= Math.max(a[0], b[0]) + 1e-5 && point[1] >= Math.min(a[1], b[1]) - 1e-5 && point[1] <= Math.max(a[1], b[1]) + 1e-5) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function clipFlatRoofBeam(beam, contour) {
  const a = beam.a, b = beam.b;
  if (!a || !b || contour.length < 3) return [beam];
  const dx = b[0] - a[0], dy = b[1] - a[1], cuts = [0, 1];
  for (let i = 0; i < contour.length; i++) {
    const c = contour[i], d = contour[(i + 1) % contour.length], ex = d[0] - c[0], ey = d[1] - c[1];
    const divisor = dx * ey - dy * ex;
    if (Math.abs(divisor) < 1e-8) continue;
    const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / divisor;
    const u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / divisor;
    if (t > 1e-7 && t < 1 - 1e-7 && u >= -1e-7 && u <= 1 + 1e-7) cuts.push(t);
  }
  cuts.sort((x, y) => x - y);
  const unique = cuts.filter((value, index) => index === 0 || value - cuts[index - 1] > 1e-7);
  const at = t => a.map((value, index) => value + (b[index] - value) * t);
  const pieces = [];
  for (let i = 0; i < unique.length - 1; i++) {
    const start = unique[i], end = unique[i + 1];
    if (end - start < 1e-6 || !containsPoint(contour, at((start + end) / 2))) continue;
    const changed=start>1e-7||end<1-1e-7;
    pieces.push({ ...beam, a: at(start), b: at(end), endCutOutline:changed?null:beam.endCutOutline, displayClipped:changed });
  }
  return pieces;
}
