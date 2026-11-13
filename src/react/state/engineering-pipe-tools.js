// Drawing choices only; saved route specifications remain unchanged.
export const PIPE_MATERIALS = ['Полипропилен ПП-R', 'Металлопластик'];
export const PIPE_DIAMETERS = [16, 20, 25, 26, 32, 40, 50, 63];
export function drawingPipeProfile(profile = {}) {
  return {...profile, material: profile.material || PIPE_MATERIALS[0], diameterMm: profile.diameterMm || 20};
}

// Unit direction from the body towards the connector. Screen Y points down.
export function pipeStemDirection(item, owner, wall = false) {
  if (wall) {
    const u = Number.isFinite(item.connectorU) ? item.connectorU : 0;
    const v = Number.isFinite(item.connectorV) ? -item.connectorV : 1;
    return {x:u, y:v};
  }
  const dx = item.x - (owner?.x ?? item.x), dy = item.y - (owner?.y ?? item.y);
  const length = Math.hypot(dx, dy);
  return length > .001 ? {x:dx/length, y:dy/length} : {x:0,y:1};
}
