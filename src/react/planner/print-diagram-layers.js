import { resolveRoofAxes } from '../../calculations/roof-orientation.js';
import { boundsOf, houseContourPoints } from './geometry.js';

export function printRoofBounds(plan, roof = {}) {
  const bounds = boundsOf(houseContourPoints(plan));
  const shape = ['flat', 'hip', 'tiered'].includes(roof.shape) ? roof.shape : 'gable';
  const { vertical } = resolveRoofAxes(plan, roof);
  const eave = Math.max(0, Number(roof.eaveOverhang) || 0);
  const gable = Math.max(0, Number(roof.gableOverhang) || 0);
  const dx = ['gable', 'tiered'].includes(shape) ? (vertical ? eave : gable) : eave;
  const dy = ['gable', 'tiered'].includes(shape) ? (vertical ? gable : eave) : eave;
  return { x1: bounds.x - dx, x2: bounds.x2 + dx, y1: bounds.y - dy, y2: bounds.y2 + dy, shape, vertical };
}

// Roofs belong exclusively to the roof diagram, not to floor/foundation plans.
export function printDiagramLayers(kind, options = {}, floorIndex = 0, separatePiles = false) {
  if (kind === 'roof') return { showRoof: true, showContour: true, showRooms: false, showOpenings: false, showPlatforms: true, showPiles: false, showBinding: false, showDimensions: false, showLegend: false };
  if (kind === 'foundation') return { showRoof: false, showContour: true, showRooms: false, showOpenings: false, showPlatforms: true, showPiles: true, showBinding: options.showBinding !== false, showDimensions: true, showLegend: true };
  return { ...options, showRoof: false, showPiles: !separatePiles && floorIndex === 0 && options.showPiles !== false, showBinding: !separatePiles && floorIndex === 0 && options.showBinding !== false, showPlatforms: floorIndex === 0 && options.showPlatforms !== false };
}
