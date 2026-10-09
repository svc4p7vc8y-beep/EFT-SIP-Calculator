import clipping from 'polygon-clipping';
import { refreshPartitionNotches } from './partition-geometry.js';
import { exteriorHeight, partitionHeight, hasHorizontalCeiling } from '../../calculations/floor-height.js';
import { bearingEdges, bearingForSegment, splitAtBearingEdges, splitConnectorsAtBearing } from './bearing-walls.js';
import { partitionFrameMembers } from './partition-cutting.js';
import { houseContourPoints, roomPoints, unifiedWallSegments, lineEndpoints } from '../planner/geometry.js';
import { sipTimberProfile } from './sip-joinery.js';
import { normalizeProductionCutting } from '../state/production-cutting.js';
import { cuttingRevision, validateProductionSettings, parseManualPanel, reconcileCutting } from './production-controls.js';
import { calculateAssemblyPlan, calculateCutOperations, gableFrameMembers } from './production-assembly.js';
import { roofCoverLayout } from './roof-cover-layout.js';
import { exteriorWallConstruction } from './wall-construction.js';
import { partitionSegments, partitionBacking } from './partition-construction.js';
import { buildFirstFloorWallGeometry, compareWallGeometry, openingWallCandidates } from './wall-geometry-adapter.js';
import { evaluateBindingStraightSupport } from './construction-rules.js';
import { createMarkAllocator, sourceIdentity } from '../state/production-identities.js';
import { constructionSource } from './construction-sources.js';

const mm = value => Math.round((Number(value) || 0) * 1000);
const round = value => Math.round(value * 1000) / 1000;
const rect = (x, y, w, h) => [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]];
const polygon = points => [points.map(p => [mm(p.x), mm(p.y)])];
const presentNumber = value => value !== '' && value != null && Number.isFinite(Number(value));
export const MIN_PANEL_WIDTH_MM = 200;
const narrowPanelError = label => Object.assign(new Error(`${label}: деталь уже ${MIN_PANEL_WIDTH_MM} мм; измените шаг, сетку или положение проёма.`), { code:'MIN_PANEL_WIDTH' });
function balancedCells(start, end, maximum, minimum = MIN_PANEL_WIDTH_MM) {
  const length = end - start;
  const count = Math.max(1, Math.ceil(length / maximum));
  if (length < minimum - .001 || length / count < minimum - .001) return null;
  return Array.from({ length: count }, (_, index) => ({ x: start + length * index / count, width: length / count }));
}
// Keep full stock pieces; rebalance only the last pair if its remainder is too narrow.
export function stockCells(start,end,maximum,minimum=MIN_PANEL_WIDTH_MM) {
  const length=end-start;
  if(length<minimum-.001) return null;
  const widths=[];let remaining=length;
  while(remaining>maximum+.001){widths.push(maximum);remaining-=maximum;}
  if(remaining<minimum-.001 && widths.length){const previous=widths.pop();widths.push(previous-minimum+remaining,minimum);}
  else widths.push(remaining);
  let x=start;return widths.map(width=>{const cell={x,width};x+=width;return cell;});
}
function tileStockWall(surface,panelWidth,panelLength) {
  const bounds=polygonBounds(surface.geometry.flat());
  const anchors=[...new Set([bounds.x,bounds.x+bounds.width,...(surface.openings||[]).flatMap(o=>[o.x,o.x+o.width])])].sort((a,b)=>a-b);
  const parts=[];
  for(let i=0;i<anchors.length-1;i++){
    const left=anchors[i],right=anchors[i+1];
    const holes=(surface.openings||[]).filter(o=>o.x<(left+right)/2 && o.x+o.width>(left+right)/2).sort((a,b)=>Number(a.sill)-Number(b.sill));
    const spans=[];let cursor=bounds.y;
    for(const hole of holes){if(Number(hole.sill)>cursor+.001)spans.push([cursor,Number(hole.sill)]);cursor=Math.max(cursor,Number(hole.sill)+hole.height);}
    if(cursor<bounds.y+bounds.height-.001)spans.push([cursor,bounds.y+bounds.height]);
    for(const [bottom,top] of spans){
      const direction=holes.length ? surface.layout.openingDirections?.[holes[0].key]||surface.layout.direction : surface.layout.direction;
      const options=direction==='y'?[true]:direction==='x'||!holes.length?[false]:[false,true];
      const candidates=options.map(rotated=>({rotated,columns:stockCells(left,right,rotated?panelLength:panelWidth),rows:stockCells(bottom,top,rotated?panelWidth:panelLength)})).filter(c=>c.columns&&c.rows);
      candidates.sort((a,b)=>a.columns.length*a.rows.length-b.columns.length*b.rows.length);
      const best=candidates[0];if(!best)throw narrowPanelError(surface.name);
      for(const column of best.columns){
      const localHigh=surface.heightStart!=null&&surface.heightEnd!==surface.heightStart?
        Math.max(surface.heightStart+(surface.heightEnd-surface.heightStart)*column.x/surface.width,surface.heightStart+(surface.heightEnd-surface.heightStart)*(column.x+column.width)/surface.width):top;
      const rows=Math.abs(top-bounds.y-bounds.height)<.01?stockCells(bottom,Math.min(top,localHigh),best.rotated?panelWidth:panelLength):best.rows;
      if(!rows)throw narrowPanelError(surface.name);
      for(const row of rows){
        for(const shape of clipping.intersection(surface.geometry,rect(column.x,row.x,column.width,row.width))){
        const box=polygonBounds(shape);if(polygonAreaMm(shape)<1)continue;
        parts.push({id:`${surface.id}-P${parts.length+1}`,surfaceId:surface.id,surface:surface.name,floor:surface.floor,
          thickness:surface.thickness,family:surface.family,shape,...box,area:polygonAreaMm(shape),
          blankWidth:best.rotated?box.height:box.width,blankHeight:best.rotated?box.width:box.height,
          orientation:best.rotated?'Горизонтально':'Вертикально',upperCourse:row.x>=bounds.y+panelLength});
        }
      }
      }
    }
  }
  return mergeNarrowParts(parts,panelWidth,panelLength,surface.name);
}
export const polygonAreaMm = poly => poly.reduce((sum, ring, index) => {
  const area = Math.abs(ring.reduce((a, p, i) => { const q = ring[(i + 1) % ring.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  return sum + (index ? -area : area);
}, 0);
export const polygonBounds = poly => {
  const points = poly.flat();
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
};
const subtract = (shape, holes) => holes.length ? clipping.difference(shape, ...holes) : clipping.union(shape);

// Joints land on both jambs where the minimum panel size permits. Remaining bays are balanced
// between fixed points and never exceed the selected frame step.
export function wallPanelColumns(bounds, step, openings = []) {
  const start = bounds.x, end = bounds.x + bounds.width;
  const anchors = [start, end];
  const distanceToGrid = value => {
    const remainder = ((value - start) % step + step) % step;
    return Math.min(remainder, step - remainder);
  };
  for (const opening of [...openings].sort((a,b) => a.x - b.x)) {
    const candidates = [opening.x, opening.x + opening.width]
      .filter(value => value > start + 1 && value < end - 1);
    if (!candidates.length) continue;
    candidates.sort((a,b) => {
      const score = value => distanceToGrid(value) + (Math.min(...anchors.map(anchor => Math.abs(value-anchor))) < step * .25 ? step : 0);
      return score(a) - score(b);
    });
    for(const chosen of candidates) if (anchors.every(value => Math.abs(value - chosen) >= MIN_PANEL_WIDTH_MM)) anchors.push(chosen);
  }
  anchors.sort((a,b) => a-b);
  const columns = [];
  for (let index=0; index<anchors.length-1; index++) {
    const left=anchors[index], right=anchors[index+1];
    const pieces = balancedCells(left, right, step);
    if (!pieces) return [];
    columns.push(...pieces);
  }
  return columns;
}

// Horizontal wall panels are cut as bands at the sill and lintel levels.
// This avoids long, narrow L-shaped remnants around doors and windows.
function tileHorizontalWall(surface, panelWidth, panelLength) {
  const bounds = polygonBounds(surface.geometry.flat());
  const bottom = bounds.y, top = bounds.y + bounds.height;
  const levels = [...new Set([bottom, top, ...surface.openings.flatMap(opening => [Number(opening.sill), Number(opening.sill) + opening.height])])]
    .filter(value => value >= bottom && value <= top).sort((a,b) => a-b);
  const parts = [];
  for (let band = 0; band < levels.length - 1; band++) {
    const y1 = levels[band], y2 = levels[band + 1];
    const rows = balancedCells(y1, y2, panelWidth);
    if (!rows) throw narrowPanelError(surface.name);
    const active = surface.openings.filter(opening => Number(opening.sill) < (y1+y2)/2 && Number(opening.sill)+opening.height > (y1+y2)/2)
      .map(opening => [opening.x, opening.x+opening.width]).sort((a,b)=>a[0]-b[0]);
    const spans = [];
    let cursor = bounds.x;
    for (const [left,right] of active) { if (left > cursor + .001) spans.push([cursor,left]); cursor = Math.max(cursor,right); }
    if (cursor < bounds.x+bounds.width-.001) spans.push([cursor,bounds.x+bounds.width]);
    for (const [left,right] of spans) {
      const columns = balancedCells(left,right,panelLength);
      if (!columns) throw narrowPanelError(surface.name);
      for (const row of rows) for (const column of columns) {
        const shape = rect(column.x,row.x,column.width,row.width);
        const box = polygonBounds(shape);
        parts.push({ id: `${surface.id}-P${parts.length+1}`, surfaceId:surface.id, surface:surface.name,
          floor:surface.floor, thickness:surface.thickness, family:surface.family, shape, ...box,
          blankWidth:box.height, blankHeight:box.width, area:polygonAreaMm(shape), upperCourse:row.x>=bottom+panelLength });
      }
    }
  }
  return parts;
}

function mergeNarrowParts(parts, panelWidth, panelLength, label) {
  const result = [...parts];
  for (let attempts = 0; attempts < parts.length; attempts++) {
    const index = result.findIndex(part => Math.min(part.width,part.height) < MIN_PANEL_WIDTH_MM-.001);
    if (index < 0) return result;
    const thin = result[index];
    let best = null;
    for (let otherIndex=0; otherIndex<result.length; otherIndex++) {
      if (otherIndex===index) continue;
      const other=result[otherIndex];
      if (thin.x>other.x+other.width+.001 || other.x>thin.x+thin.width+.001 ||
          thin.y>other.y+other.height+.001 || other.y>thin.y+thin.height+.001) continue;
      const shape=clipping.union(thin.shape,other.shape);
      if (shape.length!==1) continue;
      const box=polygonBounds(shape[0]);
      if (box.width>panelWidth+.001 || box.height>panelLength+.001) continue;
      const score=box.width*box.height - thin.width*thin.height - other.width*other.height;
      if (!best || score<best.score) best={otherIndex,shape:shape[0],box,score};
    }
    if (!best) throw narrowPanelError(label);
    const survivor=result[best.otherIndex];
    result[best.otherIndex]={...survivor,shape:best.shape,...best.box,area:polygonAreaMm(best.shape),upperCourse:survivor.upperCourse||thin.upperCourse};
    result.splice(index,1);
  }
  if (result.some(part=>Math.min(part.width,part.height)<MIN_PANEL_WIDTH_MM-.001)) throw narrowPanelError(label);
  return result;
}

const mergeWalls = segments => {
  const groups = new Map();
  for (const [a, b] of segments) {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (!length) continue;
    let ux = (b.x - a.x) / length, uy = (b.y - a.y) / length;
    if (ux < -1e-8 || (Math.abs(ux) < 1e-8 && uy < 0)) { ux = -ux; uy = -uy; }
    const offset = -uy * a.x + ux * a.y, key = `${ux.toFixed(6)}:${uy.toFixed(6)}:${offset.toFixed(3)}`;
    if (!groups.has(key)) groups.set(key, { ux, uy, offset, spans: [] });
    const x = ux * a.x + uy * a.y, y = ux * b.x + uy * b.y;
    groups.get(key).spans.push([Math.min(x, y), Math.max(x, y)]);
  }
  const result = [];
  for (const { ux, uy, offset, spans } of groups.values()) {
    const merged = [];
    for (const span of spans.sort((a, b) => a[0] - b[0])) {
      const last = merged.at(-1);
      if (last && span[0] <= last[1] + 0.001) last[1] = Math.max(last[1], span[1]);
      else merged.push([...span]);
    }
    merged.forEach(([start, end]) => result.push([{ x: ux * start - uy * offset, y: uy * start + ux * offset }, { x: ux * end - uy * offset, y: uy * end + ux * offset }]));
  }
  return result;
};

// Each connected polygon is a separate labelled part, including concave cuts
// and holes. A stock blank is its bounding rectangle, never its net area.
export function tileSurface(surface, panelWidth, panelLength, step, staggered) {
  if (surface.blocked || surface.frameOnly || !surface.geometry.length) return [];
  if(surface.bearingCuts?.length && !surface.bearingTiled){
    const bounds=polygonBounds(surface.geometry.flat());
    const xs=[bounds.x,bounds.x+bounds.width],ys=[bounds.y,bounds.y+bounds.height];
    for(const e of surface.bearingCuts){if(Math.abs(e.a.x-e.b.x)<.001)xs.push(mm(e.a.x));else if(Math.abs(e.a.y-e.b.y)<.001)ys.push(mm(e.a.y));}
    const clean=(values,min,max)=>[...new Set(values.filter(v=>v>=min&&v<=max))].sort((a,b)=>a-b);
    const xx=clean(xs,bounds.x,bounds.x+bounds.width),yy=clean(ys,bounds.y,bounds.y+bounds.height),parts=[];
    for(let i=0;i<xx.length-1;i++)for(let j=0;j<yy.length-1;j++){
      const geometry=clipping.intersection(surface.geometry,rect(xx[i],yy[j],xx[i+1]-xx[i],yy[j+1]-yy[j]));
      if(!geometry.length)continue;
      const zone={...surface,bearingTiled:true,geometry,layout:{...surface.layout,originX:undefined,originY:undefined}};
      parts.push(...tileSurface(zone,panelWidth,panelLength,step,staggered).map(p=>({...p,id:`${surface.id}-P${parts.length+1}-${i+1}.${j+1}-${p.id.split('-P')[1]}`})));
    }
    if(parts.some(p=>Math.min(p.width,p.height)<MIN_PANEL_WIDTH_MM-.01))throw narrowPanelError(surface.name);
    return parts;
  }
  if(surface.stockWall && !presentNumber(surface.layout?.originX) && !presentNumber(surface.layout?.originY) && !presentNumber(surface.layout?.step))
    return tileStockWall(surface,panelWidth,panelLength);
  if (surface.layout?.direction === 'y' && !surface.horizontal && surface.openings?.length &&
      !presentNumber(surface.layout?.originX) && !presentNumber(surface.layout?.originY))
    return tileHorizontalWall(surface, panelWidth, panelLength);
  if (surface.layout?.direction === 'y' && !surface.transposed) {
    const swap = shape => shape.map(r => r.map(([x,y]) => [y,x]));
    const parts = tileSurface({ ...surface, transposed: true, geometry: surface.geometry.map(swap), layout: { ...surface.layout, originX: surface.layout.originY, originY: surface.layout.originX } }, panelWidth, panelLength, step, staggered);
    return parts.map(part => { const shape = swap(part.shape); return { ...part, blankWidth: part.width, blankHeight: part.height, shape, ...polygonBounds(shape) }; });
  }
  const bounds = polygonBounds(surface.geometry.flat());
  const width = Math.min(panelWidth, surface.layoutWidth || panelWidth, step);
  const cells = Math.ceil(bounds.width / width) * (Math.ceil(bounds.height / panelLength) + 1);
  if (cells > 10000) throw new Error(`${surface.name}: более 10 000 ячеек. Проверьте размеры и шаг.`);
  const parts = [];
  const originX = presentNumber(surface.layout?.originX) ? Number(surface.layout.originX) : bounds.x;
  const originY = presentNumber(surface.layout?.originY) ? Number(surface.layout.originY) : bounds.y;
  const firstColumn = Math.floor((bounds.x - originX) / width);
  const adaptive = !surface.horizontal && surface.openings?.length && !presentNumber(surface.layout?.originX)
    ? wallPanelColumns(bounds, width, surface.openings) : null;
  const firstX = originX + firstColumn * width;
  const columns = adaptive || (!presentNumber(surface.layout?.originX) ? balancedCells(bounds.x,bounds.x+bounds.width,width) : null) || Array.from({ length: Math.ceil((bounds.x + bounds.width - firstX) / width) }, (_, index) => ({
    x: originX + (firstColumn + index) * width, width, column: firstColumn + index,
  })).filter(item => item.x < bounds.x + bounds.width - 0.01);
  if (!columns.length) throw narrowPanelError(surface.name);
  for (let index = 0; index < columns.length; index++) {
    const { x, width: cellWidth } = columns[index];
    const column = columns[index].column ?? index;
    const shift = staggered && surface.horizontal && surface.staggered !== false && column % 2 ? panelLength / 2 : 0;
    const firstRow = Math.floor((bounds.y - originY + shift) / panelLength);
    const rows = !presentNumber(surface.layout?.originY) && !shift && !surface.horizontal
      ? balancedCells(bounds.y,bounds.y+bounds.height,panelLength)?.map((cell,i)=>({y:cell.x,height:cell.width,row:i}))
      : null;
    if (!rows && !surface.horizontal && !presentNumber(surface.layout?.originY) && !shift) throw narrowPanelError(surface.name);
    const rowCells = rows || Array.from({ length: Math.ceil((bounds.y+bounds.height-(originY+firstRow*panelLength-shift))/panelLength) }, (_,i)=>({y:originY+(firstRow+i)*panelLength-shift,height:panelLength,row:firstRow+i}));
    for (const {y,height,row} of rowCells) {
      const pieces = clipping.intersection(surface.geometry, rect(x, y, cellWidth, height));
      pieces.forEach((shape, fragment) => {
        const area = polygonAreaMm(shape);
        if (area < 1) return;
        const box = polygonBounds(shape);
        parts.push({ id: `${surface.id}-P${column + 1}.${row + 1}${fragment ? `.${fragment + 1}` : ''}`, surfaceId: surface.id, surface: surface.name, floor: surface.floor, thickness: surface.thickness, family: surface.family, shape, ...box, area, upperCourse: !surface.horizontal && row > 0 });
      });
    }
  }
  return mergeNarrowParts(parts,panelWidth,panelLength,surface.name);
}

// Group only truly identical local contours; position and wall name do not
// affect the fabrication shape, while thickness, family and handed cuts do.
export function groupPanels(parts = []) {
  const groups = new Map();
  const ringKey = (ring, x, y) => {
    const points = ring.at(-1)?.[0] === ring[0]?.[0] && ring.at(-1)?.[1] === ring[0]?.[1]
      ? ring.slice(0, -1) : ring;
    const local = points.map(([px, py]) => [round(px - x), round(py - y)]);
    const rotations = sequence => sequence.map((_, index) => JSON.stringify([...sequence.slice(index), ...sequence.slice(0,index)]));
    return [...rotations(local), ...rotations([...local].reverse())].sort()[0];
  };
  for (const part of parts) {
    const key = JSON.stringify([part.family, part.thickness, round(part.width), round(part.height),
      round(part.blankWidth??part.width),round(part.blankHeight??part.height),
      part.processing||'',part.nodeRef||'',
      part.shape.map(ring => ringKey(ring, part.x, part.y)).sort()]);
    const group = groups.get(key);
    if (group) { group.qty++; group.instances.push(part.id); }
    else groups.set(key, { id: part.id, definitionKey: `panel:${key}`, part, qty: 1, instances: [part.id] });
  }
  return [...groups.values()];
}

export const MARK_LEGEND={П:'СИП-панель',У:'Укосина',С:'Стойка',Д:'Доска / обвязка / перемычка',Ш:'Шпонка / соединитель',Б:'Брус / балка',СТ:'Стропило',О:'Обрешётка',К:'Контробрешётка',ПР:'Прогон',Р:'Прочая проектная деталь'};
export function assignProductionMarks(parts,members,savedRegistry) {
  const {registry,allocate}=createMarkAllocator(savedRegistry);
  const byId=new Map(parts.map(p=>[p.id,p]));
  groupPanels(parts).forEach(g=>{const mark=allocate(g.definitionKey,'П');g.instances.forEach(id=>{byId.get(id).displayMark=mark;});});
  for(const g of groupMembers(members)){
    const name=g.member.material||'',prefix=/укосин/i.test(name)?'У':/стойк/i.test(name)?'С':/контробреш/i.test(name)?'К':/обреш/i.test(name)?'О':/стропил/i.test(name)?'СТ':/прогон/i.test(name)?'ПР':/шпонк|соединител|термобрус/i.test(name)?'Ш':/брус|балк/i.test(name)?'Б':/доск|обвяз|перемыч/i.test(name)?'Д':'Р';
    const mark=allocate(g.definitionKey,prefix);
    g.instances.forEach(m=>{m.displayMark=mark;});
  }
  for(const item of [...parts,...members]) if(!item.persistentId)item.identityStatus='derived-position';
  return registry;
}

export function groupMembers(members = []) {
  const groups = new Map();
  for (const member of members) {
    const key = JSON.stringify([member.material,member.profile,round(member.length),round(member.cutLength),
      member.source,member.processing || '',member.nodeRef || '',member.excluded === true,(member.notches||[]).map(n=>[n.type,n.offsetMm,n.lengthMm,n.depthMm])]);
    const group = groups.get(key);
    if (group) { group.qty++; group.instances.push(member); }
    else groups.set(key,{ id:member.id, definitionKey:`member:${key}`, member, qty:1, instances:[member] });
  }
  return [...groups.values()];
}

export function starterBoardPlan(surfaces = [], members = []) {
  return surfaces.filter(surface=>/^Э1-С\d+$/.test(surface.id) && !surface.blocked && surface.planStart && surface.planEnd).map(surface=>{
    const boards=members.filter(member=>member.surfaceId===surface.id && !member.excluded && !member.seam && member.a &&
      Math.abs(member.a[1])<.01 && Math.abs(member.b[1])<.01).map(member=>({
        id:member.id,start:Math.min(member.a[0],member.b[0]),end:Math.max(member.a[0],member.b[0]),
        length:round(Math.abs(member.b[0]-member.a[0])),cutLength:member.cutLength,profile:member.profile,
      })).sort((a,b)=>a.start-b.start);
    const openings=(surface.openings||[]).map(opening=>({id:opening.id,name:opening.name,type:opening.type,
      start:opening.x,end:opening.x+opening.width,width:opening.width,sill:Number(opening.sill)||0,
      noBoard:opening.gap || Number(opening.sill)===0})).sort((a,b)=>a.start-b.start);
    return {id:surface.id,name:surface.name,start:surface.planStart,end:surface.planEnd,
      length:surface.width,boards,openings};
  });
}

// Split collinear edges at every endpoint. Shared seams are counted once,
// including T-joints of the staggered layout and edges interrupted by openings.
export function connectionSegments(parts, continuous = false) {
  const lines = new Map();
  for (const part of parts) for (const ring of part.shape) for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 0.01) continue;
    let ux = (b[0] - a[0]) / length, uy = (b[1] - a[1]) / length;
    if (ux < -1e-8 || (Math.abs(ux) < 1e-8 && uy < 0)) { ux = -ux; uy = -uy; }
    const offset = -uy * a[0] + ux * a[1];
    const key = `${ux.toFixed(6)}:${uy.toFixed(6)}:${offset.toFixed(3)}`;
    if (!lines.has(key)) lines.set(key, { ux, uy, offset, spans: [] });
    const start = ux * a[0] + uy * a[1], end = ux * b[0] + uy * b[1];
    lines.get(key).spans.push({ start: Math.min(start, end), end: Math.max(start, end), id: part.id });
  }
  const result = [];
  for (const { ux, uy, offset, spans } of lines.values()) {
    const lineStart = result.length;
    const stops = [...new Set(spans.flatMap(s => [round(s.start), round(s.end)]))].sort((a, b) => a - b);
    for (let i = 0; i < stops.length - 1; i++) {
      const start = stops[i], end = stops[i + 1], mid = (start + end) / 2;
      const adjacent = spans.filter(s => s.start < mid && s.end > mid).map(s => s.id);
      if (!adjacent.length || end - start < 0.01) continue;
      const segment = { a: [round(ux * start - uy * offset), round(uy * start + ux * offset)], b: [round(ux * end - uy * offset), round(uy * end + ux * offset)], length: Math.ceil(end - start - 0.001), seam: adjacent.length > 1, panels: [...new Set(adjacent)] };
      const previous = result.at(-1);
      if (continuous && result.length > lineStart && previous.seam === segment.seam && Math.hypot(previous.b[0]-segment.a[0], previous.b[1]-segment.a[1]) < .01) {
        previous.b = segment.b; previous.length = Math.ceil(Math.hypot(previous.b[0]-previous.a[0],previous.b[1]-previous.a[1])-.001); previous.panels = [...new Set([...previous.panels, ...segment.panels])];
      } else result.push(segment);
    }
  }
  return result;
}

export function packPanelBlanks(parts, stockWidth, stockLength, kerf = 0, allowRotation = false) {
  const sheets = [], unplaced = [];
  const sorted = [...parts].sort((a, b) => b.height - a.height || b.width - a.width || a.id.localeCompare(b.id));
  for (const part of sorted) {
    let width = Math.ceil(round(part.blankWidth ?? part.width)), height = Math.ceil(round(part.blankHeight ?? part.height)), rotated = false;
    if (allowRotation && height <= stockWidth && width <= stockLength && (width > stockWidth || height > stockLength || (width > height && sheets.some(s => s.material === `${part.family}/${part.thickness}` && s.shelves.some(sh => width <= sh.height && sh.used + kerf + height <= stockWidth))))) { [width, height] = [height, width]; rotated = true; }
    const material = `${part.family}/${part.thickness}`;
    if (width > stockWidth || height > stockLength) { unplaced.push(part.id); continue; }
    let placement;
    for (const sheet of sheets.filter(s => s.material === material)) {
      for (const shelf of sheet.shelves) if (height <= shelf.height && shelf.used + kerf + width <= stockWidth) {
        placement = { sheet, shelf, x: shelf.used + kerf }; break;
      }
      if (placement) break;
      const y = sheet.shelves.reduce((sum, s) => sum + s.height + kerf, 0);
      if (y + height <= stockLength) {
        const shelf = { y, height, used: 0 }; sheet.shelves.push(shelf); placement = { sheet, shelf, x: 0 }; break;
      }
    }
    if (!placement) {
      const shelf = { y: 0, height, used: 0 };
      const sheet = { id: `Л-${sheets.length + 1}`, material, thickness: part.thickness, family: part.family, shelves: [shelf], parts: [], width: stockWidth, height: stockLength };
      sheets.push(sheet); placement = { sheet, shelf, x: 0 };
    }
    const { sheet, shelf, x } = placement;
    sheet.parts.push({ id: part.id, displayMark:part.displayMark, x, y: shelf.y, width, height, rotated });
    shelf.used = x + width;
  }
  const remnants = sheets.flatMap(sheet => {
    const right = sheet.shelves.filter(s => stockWidth - s.used - kerf > 0).map(s => ({ sheet: sheet.id, x: s.used + kerf, y: s.y, width: stockWidth - s.used - kerf, height: s.height }));
    const y = sheet.shelves.reduce((sum,s)=>sum+s.height+kerf,0);
    return [...right, ...(y < stockLength ? [{ sheet: sheet.id, x:0, y, width:stockWidth, height:stockLength-y }] : [])];
  });
  const stockArea = sheets.length * stockWidth * stockLength;
  return { sheets, unplaced, remnants, wastePercent: stockArea ? 100 * (1 - parts.filter(p => !unplaced.includes(p.id)).reduce((sum,p)=>sum+(p.area ?? p.width*p.height),0)/stockArea) : 0 };
}

export function packMembers(members, stockLength, kerf) {
  const bars = [], unplaced = [];
  for (const part of [...members].sort((a, b) => b.cutLength - a.cutLength || a.id.localeCompare(b.id))) {
    if (part.cutLength > stockLength) { unplaced.push(part.id); continue; }
    const candidates = bars.filter(b => b.profile === part.profile && b.material === part.material && b.used + kerf + part.cutLength <= stockLength).sort((a, b) => b.used - a.used);
    let bar = candidates[0];
    if (!bar) { bar = { id: `Х-${bars.length + 1}`, profile: part.profile, material: part.material, used: 0, parts: [] }; bars.push(bar); }
    const start = bar.used + (bar.parts.length ? kerf : 0);
    bar.parts.push({ id: part.id, displayMark:part.displayMark, start, length: part.cutLength }); bar.used = start + part.cutLength;
  }
  return { bars, unplaced };
}

export function calculateProductionCutting(project, calculation) {
  const settings = normalizeProductionCutting(project.settings?.productionCutting);
  validateProductionSettings(settings);
  const f = project.settings?.formulas || {}, sip = project.settings?.sip || {}, services = project.services || {};
  const panelWidth = mm(f.panelWidth || 1.25), panelLength = mm(f.panelLength || 2.5);
  if (!(panelWidth >= 100 && panelWidth <= 10000 && panelLength >= 100 && panelLength <= 20000)) throw new Error('Проверьте формат панели в формулах проекта: ширина 100–10 000 мм, длина 100–20 000 мм.');
  const surfaces = [], issues = [], openings = [], walls = [];
  const issue = (code, message, target = '') => issues.push({ code, message, target });
  if (settings.kerfMm === '') issue('KERF', 'Укажите ширину пропила оборудования, мм.');
  if (settings.endAllowanceMm === '') issue('ALLOWANCE', 'Укажите припуск на каждый торец соединительного элемента, мм (0 — без припуска).');
  const plans = calculation.metrics?.floorPlans?.map(item => item.plan) || [project.plan];
  if (calculation.metrics?.floorPlans?.some(item => item.plan.floorType === 'attic' && item.metrics.partitionLength > 0) && services.partitions)
    issue('ATTIC_PARTITIONS', 'Мансарда: перегородки рассчитаны прямоугольными заготовками по отдельной высоте. Подрезка под скаты и верхние узлы требуют рабочей развёртки; выпуск без проверки этих узлов не допускается.');
  const addSurface = data => {
    const surface = { family: 'pps', ...data };
    surface.layoutKey = `${surface.id}:${cuttingRevision([surface.geometry, surface.planStart, surface.planEnd])}`;
    surface.layout = settings.layouts[surface.layoutKey] || {};
    for (const key of ['originX', 'originY', 'step']) if (presentNumber(surface.layout[key]) && (Math.abs(Number(surface.layout[key])) > 100000 || (key === 'step' && (Number(surface.layout[key]) < 100 || Number(surface.layout[key]) > 2500)))) throw new Error(`${surface.id}: недопустимая сетка раскладки`);
    if (presentNumber(surface.layout.step)) surface.layoutWidth = Number(surface.layout.step);
    surface.stockWall=settings.wallPanelMode==='full' && !!surface.planStart;
    surface.effectiveStep = Math.min(panelWidth, surface.stockWall && !presentNumber(surface.layout.step) ? panelWidth : surface.layoutWidth || settings.frameStepMm);
    surfaces.push(surface); return surface;
  };
  plans.forEach((plan, floorIndex) => {
    const floor = floorIndex + 1, contour = houseContourPoints(plan), shape = polygon(contour);
    if (plan.house?.contourDefined === false) { issue('CONTOUR', `${floor} этаж: задайте контур дома на плане.`); return; }
    const h = mm(exteriorHeight(plan));
    const edges = exteriorWallConstruction(plan,sip,project.settings.roof,floorIndex===plans.length-1,services.roof).map(wall=>({ ...wall,a:wall.a,b:wall.b,id:`Э${floor}-С${wall.index+1}`,outer:true }));
    if (services.partitions) {
      const segments = partitionSegments(plan);
      const seen = new Set();
      segments.forEach(([a, b], i) => { const key = [a, b].map(p => `${mm(p.x)},${mm(p.y)}`).sort().join(':'); if (!seen.has(key)) { edges.push({ a, b, id: `Э${floor}-ПГ${i + 1}`, outer: false }); seen.add(key); } });
    }
    const assigned = new Map(edges.map(edge => [edge.id, []]));
    const blockedWalls = new Set();
    let openingNumber=0;
    for (const opening of [...(plan.openings || []), ...(plan.wallGaps || []).map(gap => ({ ...gap, type: 'gap', height: plan.wallHeight }))].filter(o => o.include !== false && o.subtractFromSip !== false)) {
      const outer = typeof opening.outer === 'boolean' ? opening.outer : null;
      if ((outer === true && !services.sipWalls) || (outer === false && !services.partitions)) continue;
      const eligible = edges.filter(edge => (outer == null || edge.outer === outer) && (!edge.outer || services.sipWalls));
      const choices = openingWallCandidates(opening, eligible);
      const nearest = choices[0], key = `${floor}:${opening.id}`;
      const sillValue = opening.type === 'gap' ? 0 : settings.openingSills[key] ?? (presentNumber(opening.sillHeight) ? mm(opening.sillHeight) : opening.type === 'door' ? 0 : settings.windowSillMm);
      const row = { key, id: opening.id, type: opening.type, gap: opening.type === 'gap', name: `${floor} этаж · ${opening.type === 'window' ? 'Окно' : opening.type === 'gap' ? 'Разрыв' : 'Дверь'} ${++openingNumber}`, sill: sillValue, width: mm(opening.width), height: mm(opening.height), wallId: nearest?.edge.id };
      if (!row.gap) openings.push(row);
      if (!nearest || nearest.distance > Math.max(Number(plan.wallThickness) || 0.174, 0.1) + 0.03 || (choices[1] && Math.abs(choices[1].distance - nearest.distance) < .001)) {
        issue('OPENING_WALL', `${row.name}: стена не найдена или привязка неоднозначна. Раскрой возможных стен заблокирован; уточните положение и ориентацию на плане.`, key);
        eligible.forEach(edge => blockedWalls.add(edge.id)); continue;
      }
      assigned.get(nearest.edge.id).push({ ...row, x: mm(nearest.u) - row.width / 2 });
    }
    for (const edge of edges) {
      if (edge.outer && !services.sipWalls) continue;
      const wallKey = `${edge.id}@${mm(edge.a.x)},${mm(edge.a.y)}:${mm(edge.b.x)},${mm(edge.b.y)}`;
      const addition = Number(settings.wallAdditions[wallKey]) || 0;
      const baseHeight = edge.outer ? h : mm(partitionHeight(plan));
      const framedSlope=edge.outer&&calculation.roof?.flatSlopeMode==='structural'&&calculation.roof?.mainGableType==='cold';
      const heightStart=edge.outer&&!framedSlope?mm(edge.heightStart)+addition:baseHeight+addition;
      const heightEnd=edge.outer&&!framedSlope?mm(edge.heightEnd)+addition:baseHeight+addition;
      const height = Math.max(heightStart,heightEnd), width = mm(edge.outer?edge.length:Math.hypot(edge.b.x - edge.a.x, edge.b.y - edge.a.y));
      const selectedOrigin=edge.outer?mm(edge.trimStart):0;
      if (edge.outer && height === 0 && !assigned.get(edge.id).length) continue;
      const holes = [], selectedOpenings = assigned.get(edge.id).map(o=>({...o,x:o.x-selectedOrigin})); let blocked = blockedWalls.has(edge.id);
      if(edge.needsCornerDetail)issue('WALL_CORNER','Наклонный угол: размеры сопряжения и торцевые подрезки требуется задать по рабочему узлу.',edge.id);
      const wallShape=[[[0,0],[width,0],[width,heightEnd],[0,heightStart],[0,0]]];
      walls.push({ id: edge.id, key: wallKey, name: `${edge.outer ? 'Стена' : 'Перегородка'} ${edge.id}`, floor, baseHeight, addition });
      if (height <= 0 || width <= 0 || height > 30000 || width > 100000 || addition < 0) { issue('WALL_SIZE', `${edge.id}: проверьте размеры стены и добавочную высоту.`, edge.id); continue; }
      for (const o of selectedOpenings) {
        if (o.gap) o.height = height;
        const displayRow = openings.find(row => row.key === o.key);
        const localTop=x=>heightStart+(heightEnd-heightStart)*x/width;
        if (displayRow) displayRow.topClearance = Math.min(localTop(o.x),localTop(o.x+o.width)) - Number(o.sill) - o.height;
        if (!presentNumber(o.sill) || Number(o.sill) < 0) { issue('OPENING_SILL', `${o.name}: укажите отметку низа от пола. Развёртка ${edge.id} ожидает данные.`, o.key); blocked = true; continue; }
        if (o.width <= 0 || o.height <= 0 || o.x < -1 || o.x + o.width > width + 1 || Number(o.sill) + o.height > height + 1) { issue('OPENING_SIZE', `${o.name}: проём выходит за стену или имеет неверный размер.`, o.key); blocked = true; continue; }
        const rawHole = rect(o.x, Number(o.sill), o.width, o.height);
        const hole = o.gap?clipping.intersection(rawHole,wallShape):rawHole;
        if(clipping.difference(hole,wallShape).reduce((s,p)=>s+polygonAreaMm(p),0)>1){issue('OPENING_SIZE',`${o.name}: проём пересекает наклонный верх стены.`,o.key);blocked=true;}
        if (holes.some(previous => clipping.intersection(previous, hole).reduce((sum, poly) => sum + polygonAreaMm(poly), 0) > 1)) {
          issue('OPENING_OVERLAP', `${edge.id}: проёмы пересекаются. Исправьте их положение до раскроя.`, edge.id); blocked = true;
        }
        holes.push(hole);
      }
      const geometry = subtract(wallShape, holes);
      const bearing=!edge.outer && bearingForSegment(plan,edge.a,edge.b);
      const source=constructionSource(plan,edge,settings.constructionSources,floor);
      addSurface({ id: edge.id, name: `${edge.outer ? 'Стена' : 'Перегородка'} ${edge.id}`, floor, horizontal: false, planStart: [mm((edge.start||edge.a).x), mm((edge.start||edge.a).y)], planEnd: [mm((edge.end||edge.b).x), mm((edge.end||edge.b).y)], externalLength:edge.outer?mm(edge.externalLength):width,heightStart,heightEnd, thickness: Number(edge.outer ? sip.wallThickness : sip.partitionThickness), family: edge.outer ? sip.wallPanelFamily : sip.partitionPanelFamily, geometry, width, height, blocked, openings: selectedOpenings,
        ...source,...(!edge.outer?partitionBacking(plan,edge.a,edge.b):{}),topPlateLayers:Math.max(1,Math.round(Number(f.partitionTopPlateLayers) || 1)),frameOnly:!edge.outer&&sip.partitionType!=='sip',partitionFrame:!edge.outer&&sip.partitionType!=='sip',bearing:!!bearing,frameProfile:(bearing?.profile||sip.partitionFrameSection||'50x100').replace(/[xх]/g,'×') });
    }
    if ((floorIndex === 0 && services.sipFloor) || (floorIndex > 0 && services.sipSecondFloor)) {
      const hole = plan.floorOpening;
      const holes = floorIndex > 0 && Number(hole?.width) > 0 && Number(hole?.length) > 0 ? [rect(mm(hole.x), mm(hole.y), mm(hole.width), mm(hole.length))] : [];
      const blocked = holes.some(h => clipping.difference(h, shape).reduce((sum, poly) => sum + polygonAreaMm(poly), 0) > 1) || (floorIndex > 0 && ((Number(hole?.width) > 0) !== (Number(hole?.length) > 0)));
      if (blocked) issue('STAIR_BOUNDS', `${floor} этаж: лестничный проём имеет неполный размер или выходит за контур. Перекрытие заблокировано.`, `Э${floor}-ПОЛ`);
      addSurface({ id: `Э${floor}-ПОЛ`, name: `${floor} этаж · ${floorIndex ? 'Межэтажное перекрытие' : 'Пол'}`, floor, horizontal: true, thickness: Number(floorIndex ? sip.secondFloorThickness : sip.floorThickness), family: floorIndex ? sip.secondFloorPanelFamily : sip.floorPanelFamily, layoutWidth: mm(floorIndex ? sip.secondFloorPanelWidth : sip.floorPanelWidth), geometry: subtract(shape, holes), blocked });
    }
    if (floorIndex === plans.length - 1 && services.sipCeiling && hasHorizontalCeiling(plan)) {
      let blocked = false;
      const holes = (plan.rooms || []).filter(r => r.include !== false && ['open', 'open-rafter'].includes(r.ceilingMode)).flatMap(r => {
        const hole = polygon(roomPoints(r)), area = polygonAreaMm(hole) / 1e6;
        if (r.openCeilingArea != null && Number(r.openCeilingArea) === 0) return [];
        if (r.openCeilingArea != null && Number(r.openCeilingArea) < area - 0.001) { blocked = true; issue('CEILING_OPENING', `${floor} этаж: у комнаты «${r.name || r.id}» задана только площадь открытого потолка. Укажите его контур в рабочем проекте.`); return []; }
        if (clipping.difference(hole, shape).length || (r.openCeilingArea != null && Number(r.openCeilingArea) > area + .001)) { blocked = true; issue('CEILING_BOUNDS', `${floor} этаж: открытый потолок комнаты «${r.name || r.id}» выходит за контур или площадь превышает комнату.`); return []; }
        return [hole];
      });
      const ceiling=addSurface({ id: `Э${floor}-ПТ`, name: `${floor} этаж · Потолок`, floor, horizontal: true, thickness: Number(sip.ceilingThickness), family: sip.ceilingPanelFamily, layoutWidth: mm(sip.ceilingPanelWidth), geometry: subtract(shape, holes), blocked });
      if(settings.ceilingBearingAlignment){
        ceiling.bearingCuts=bearingEdges(plan);
        if(ceiling.bearingCuts.some(e=>Math.abs(e.a.x-e.b.x)>.001&&Math.abs(e.a.y-e.b.y)>.001))issue('CEILING_SUPPORT','Наклонная несущая перегородка: стыки потолка требуют индивидуальной раскладки.',ceiling.id);
        if(ceiling.bearingCuts.length)issue('CEILING_SUPPORT_CHECK','Сетка потолка разделена по осям несущих стен. Пролёты, неполные опоры, стыки шпонок вне стен и узлы опирания проверить по проекту.',ceiling.id);
      }
    }
    if ((plan.rooms || []).some(room => room.extension && room.include !== false)) issue('COMPLEX_PLAN', `${floor} этаж: пристроенные помещения требуют отдельной карты — внесите детали вручную.`, `floor-${floor}`);
  });
  const roof = calculation.roof || {};
  const wallKeys = new Set(walls.map(wall => wall.key));
  if (Object.entries(settings.wallAdditions).some(([key, value]) => Number(value) && !wallKeys.has(key))) issue('STALE_HEIGHT', 'Контур стен изменился: часть сохранённых добавочных высот больше не привязана к стенам и не применяется. Перепроверьте высоты в исходных данных.');
  const roofSettings = project.settings?.roof || {}, roofGeometry = roof.geometry;
  if (services.roof && roofGeometry && plans.at(-1).house?.contourDefined !== false) {
    const shape = polygon(houseContourPoints(plans.at(-1))), bounds = polygonBounds(shape);
    const rectangular = Math.abs(polygonAreaMm(shape) - bounds.width * bounds.height) < 1;
    const addRoof = (id, name, shape, thickness = sip.ceilingThickness, horizontal = true) => addSurface({ id, name, floor: plans.length, horizontal, staggered: false, thickness: Number(thickness), family: horizontal ? sip.ceilingPanelFamily : sip.wallPanelFamily, geometry: clipping.union(shape), layoutWidth: mm(roof.sipFrameStep || f.panelWidth || 1.25) });
    const addGable=(id,name,geometry,type)=>{const surface=addRoof(id,`${name} · ${type==='sip'?'СИП':'каркас'}`,geometry,sip.wallThickness,false);surface.frameOnly=type==='cold';};
    if (roof.mainRoofShape === 'tiered' && rectangular && Number(roof.warmSlopeArea) > 0) {
      const settings = roofSettings.tiered || {};
      const warmLevel = settings.warmLevel || 'upper';
      const warmLevels = roofSettings.type === 'sip' || warmLevel === 'both' ? ['upper', 'lower'] : [warmLevel];
      for (const level of warmLevels) {
        const length = mm(roofGeometry.roofLength);
        const slope = mm(roofGeometry[`${level}SlopeLength`]);
        addRoof(`КР-${level === 'upper' ? 'В' : 'Н'}`, `Кровля · ${level === 'upper' ? 'верхний' : 'нижний'} односкатный уровень`, rect(0, 0, length, slope));
      }
      if (Number(roof.warmSlopeArea) < warmLevels.reduce((sum,level)=>sum+Number(roofGeometry[`${level}Area`]||0),0)-0.01)
        issue('ROOF_OPEN', 'На SIP-скатах есть открытые участки. Для вычета из раскроя задайте их точные контуры в рабочем проекте.');
    } else if (roofSettings.type === 'sip' && rectangular) {
      const length = mm(roofGeometry.roofLength), span = mm(roofGeometry.roofSpan), slope = mm(roofGeometry.slopeLength);
      if (roof.mainRoofShape === 'hip') {
        const ridge = mm(roofGeometry.ridgeLength), inset = (length - ridge) / 2;
        for (let i = 1; i <= 2; i++) {
          addRoof(`КР-С${i}`, `Кровля · трапециевидный скат ${i}`, [[[0,0],[length,0],[length-inset,slope],[inset,slope],[0,0]]]);
          addRoof(`КР-В${i}`, `Кровля · вальма ${i}`, [[[0,0],[span,0],[span/2,slope],[0,0]]]);
        }
      } else for (let i = 1; i <= (roof.mainRoofShape === 'flat' ? 1 : 2); i++) addRoof(`КР-С${i}`, `Кровля · скат ${i}`, rect(0, 0, length, slope));
    } else if (roofSettings.type === 'sip' || Number(roof.warmSlopeArea) > 0) issue('ROOF', 'Комбинированная или контурная SIP-кровля: нужны границы тёплых скатов и ендов из рабочего проекта. Автоматический раскрой этих скатов пока не сформирован.');
    if (roof.mainRoofShape === 'tiered' && roof.tieredGables?.zones.some(zone => ['sip','cold'].includes(zone.type))) {
      if (!rectangular) issue('GABLE', 'Г-образный контур: геометрию фронтонов и перепада уровней требуется уточнить в рабочем проекте.');
      else for (const zone of roof.tieredGables.zones.filter(item => ['sip','cold'].includes(item.type))) {
        if (Math.abs(zone.area-zone.calculatedArea)>0.01) { issue('GABLE', `${zone.label}: проектная площадь отличается от геометрической. Автоматическая развёртка не создана.`); continue; }
        const width = mm(zone.internal ? roofGeometry.junctionLength : zone.key.startsWith('upper') ? roofGeometry.upperSpan : roofGeometry.lowerSpan);
        const height = mm(zone.internal ? roofGeometry.stepHeight : zone.key.startsWith('upper') ? roofGeometry.upperRise : roofGeometry.lowerRise);
        if (!width || !height) continue;
        const upper=zone.key.startsWith('upper'),toward=(roofSettings.tiered?.[upper?'upperSlopeDirection':'lowerSlopeDirection']||(upper?'towardJunction':'awayJunction'))==='towardJunction';
        const highRight=(upper?!toward:toward)!==(roofSettings.tiered?.upperSide==='second');
        const geometry = zone.internal ? rect(0,0,width,height) : highRight?[[[0,0],[width,0],[width,height],[0,0]]]:[[[0,0],[width,0],[0,height],[0,0]]];
        addGable(`ФР-${zone.key}`, zone.label, geometry,zone.type);
      }
    } else if (['sip','cold'].includes(roof.mainGableType)) {
      if (rectangular && roof.mainRoofShape === 'gable') {
        const height = mm(roofSettings.ridgeHeight), span = roof.ridgeAxis === 'y' ? bounds.width : bounds.height;
        const along=roof.ridgeAxis==='y'?1:0;
        const endWalls=surfaces.filter(s=>s.floor===plans.length&&/^Э\d+-С\d+$/.test(s.id)&&Math.abs(s.planStart[along]-s.planEnd[along])<1).sort((a,b)=>a.planStart[along]-b.planStart[along]);
        for (let i = 1; i <= Math.min(2, Number(roofSettings.gableCount) || 0); i++) {
          const wall=endWalls[i-1],trim=wall?Math.max(0,(span-wall.width)/2):0;
          const clipped=clipping.intersection([[[0,0],[span,0],[span/2,height],[0,0]]],rect(trim,0,span-2*trim,height));
          addGable(`ФР-${i}`, `Фронтон ${i}`,clipped.map(p=>p.map(r=>r.map(([x,y])=>[x-trim,y]))),roof.mainGableType);
        }
      } else if(rectangular && roof.mainRoofShape==='flat' && roof.mainGableType==='cold'){
        const construction=exteriorWallConstruction(plans.at(-1),sip,roofSettings,true,services.roof);
        let sideCount=0;
        for(const w of construction){
          const left=mm(w.heightStart-w.baseHeight),right=mm(w.heightEnd-w.baseHeight),width=mm(w.length);
          if(Math.max(left,right)<=0)continue;
          if(Math.abs(left-right)>1&&sideCount++>=Math.min(2,Number(roofSettings.gableCount)||0))continue;
          const wallId=`Э${plans.length}-С${w.index+1}`;
          const s=addRoof(`ФР-${wallId}`,`Перепад над стеной ${wallId} · каркас`,[[[0,0],[width,0],[width,right],[0,left],[0,0]]],sip.wallThickness,false);
          s.frameOnly=true;s.parentWallId=wallId;
        }
      } else issue('GABLE', 'Фронтоны сложной или односкатной кровли: требуются отдельные развёртки и проёмы.');
    }
  }
  if ((project.plan.platforms || []).some(p => p.include !== false)) issue('PLATFORMS', 'Пристройки: задайте их производственные детали вручную по конструктивному проекту.');
  const parts = [];
  for (const surface of surfaces) {
    try { parts.push(...tileSurface(surface, panelWidth, panelLength, surface.layoutWidth || settings.frameStepMm, settings.staggered)); }
    catch (error) {
      if (error.code !== 'MIN_PANEL_WIDTH') throw error;
      surface.blocked = true;
      issue(error.code, error.message, surface.id);
    }
  }
  const manualIds = new Set();
  for (const item of settings.manualPanels) {
    try {
      if (!item?.id || manualIds.has(item.id)) throw new Error('Нет уникальной марки');
      manualIds.add(item.id);
      const shape = parseManualPanel(item), quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new Error('Количество: целое от 1 до 100');
      const outer = [shape[0]], holes = shape.slice(1).map(r => [r]);
      if (holes.some(h => clipping.difference(h, outer).length)) throw new Error('Вырез выходит за внешний контур');
      for(let i=0;i<holes.length;i++) for(let j=i+1;j<holes.length;j++) if(clipping.intersection(holes[i],holes[j]).length) throw new Error('Вырезы пересекаются');
      const geometry = subtract(outer, holes);
      if (geometry.length !== 1 || polygonAreaMm(geometry[0]) < 1) throw new Error('Панель должна быть одной связной деталью ненулевой площади');
      const manualBounds=polygonBounds(geometry[0]);
      if(Math.min(manualBounds.width,manualBounds.height)<MIN_PANEL_WIDTH_MM-.001)throw narrowPanelError(item.name);
      for (let i=0;i<quantity;i++) {
        const id = `РП-${settings.manualPanels.indexOf(item)+1}-${i+1}`;
        addSurface({ id, name: item.name, thickness: Number(item.thickness), family: item.family, geometry, horizontal: true, manual: true });
        parts.push({ id: `${id}-P1`, ...(item.hasStableSourceId===false?{}:sourceIdentity('manual-panel',item.id,i+1)), surfaceId: id, surface: item.name, thickness: Number(item.thickness), family: item.family, shape: geometry[0], ...polygonBounds(geometry[0]), area: polygonAreaMm(geometry[0]), upperCourse: false });
      }
    } catch (error) { issue('MANUAL_PANEL', `Ручная панель ${item?.name || ''}: ${error.message}`); }
  }
  const activeLayouts = new Set(surfaces.map(s=>s.layoutKey));
  if (Object.keys(settings.layouts).some(key=>!activeLayouts.has(key))) issue('STALE_LAYOUT', 'Геометрия изменилась: часть индивидуальных сеток не применяется. Проверьте и сбросьте устаревшие настройки.');
  const members = [];
  const overrideKeys = new Set(), profileMismatches = new Set();
  for (const surface of surfaces) {
    if(surface.frameOnly){
      const frame=surface.partitionFrame?partitionFrameMembers(surface,settings):gableFrameMembers(surface,settings);
      if(surface.partitionFrame&&surface.bearing&&!surface.blocked){
        if(settings.partitionBracing&&!frame.some(m=>m.material==='Укосина перегородки'))issue('PARTITION_BRACE',`${surface.id}: нет укосины, которая помещается без пересечения проёмов. Задайте рабочую схему связей.`,surface.id);
        const beam=frame.find(m=>m.material==='Опорная доска на ребре');
        if(beam&&(surface.openings||[]).some(o=>!o.gap&&Number(o.sill)+o.height>beam.a[1]-Number(beam.faceWidth)/2))issue('PARTITION_HEADER',`${surface.id}: проём пересекает доску на ребре. Высоту проёма / верхний узел требуется согласовать.`,surface.id);
      }
      members.push(...frame);continue;
    }
    const segments = splitConnectorsAtBearing(connectionSegments(parts.filter(part => part.surfaceId === surface.id), settings.continuousMembers),surface.bearingCuts);
    const profile = sipTimberProfile(surface.thickness);
    const jambs = !surface.blocked && !surface.horizontal && surface.openings?.length ? surface.openings.filter(opening => !opening.gap && ['window','door'].includes(opening.type))
      .flatMap(opening => [{opening,side:'left',x:opening.x},{opening,side:'right',x:opening.x+opening.width}]) : [];
    segments.forEach((segment, i) => {
      const id = `${surface.id}-${segment.seam ? 'Ш' : 'Т'}${i + 1}`;
      const key = `${surface.layoutKey}:${cuttingRevision([segment.a, segment.b, segment.seam, surface.thickness, sip.connectorType])}`;
      overrideKeys.add(key);
      const override = settings.memberOverrides[key] || {};
      const estimateProfile = segment.seam ? sip.connectorType === 'solid' ? `${profile.core}×100` : `${profile.thermalDepth}×95` : `${profile.endBoardDepth}×45`;
      const savedProfile = `${profile.thermalDepth}×${segment.seam ? settings.splineWidthMm : settings.edgeWidthMm}`;
      const selectedProfile = override.profile?.trim() || (settings.profileMode === 'estimate' ? estimateProfile : savedProfile);
      if (selectedProfile !== estimateProfile) profileMismatches.add(`${selectedProfile} ↔ ${estimateProfile}`);
      const length = presentNumber(override.length) ? Number(override.length) : segment.length;
      if (!(length > 0 && length <= 100000)) { issue('MEMBER_OVERRIDE', `${id}: неверная длина`, key); return; }
      if ((override.exclude || override.profile || presentNumber(override.length)) && !override.nodeRef?.trim()) issue('MEMBER_NODE', `${id}: для изменения или исключения укажите рабочий узел`, key);
      const replacedByJamb = jambs.some(jamb => Math.abs(segment.a[0]-jamb.x)<.01 && Math.abs(segment.b[0]-jamb.x)<.01);
      members.push({ ...segment, id, key, excluded: override.exclude === true || replacedByJamb, replacedByJamb, nodeRef: override.nodeRef || '', processing: override.processing || '', geometricLength: segment.length, length, surface: surface.name, surfaceId: surface.id, material: segment.seam ? ({ thermal: 'Термобрус', 'board-pack': 'Клеёный пакет', solid: 'Брус' }[sip.connectorType] || 'Соединительная шпонка') : 'Торцевая / обрамляющая доска', profile: selectedProfile, estimateProfile, cutLength: length + 2 * Number(settings.endAllowanceMm || 0), source: replacedByJamb ? 'Заменено полной стойкой проёма' : segment.seam ? 'Шов панелей' : 'Открытая кромка / проём' });
    });
    for (const [jambIndex,jamb] of jambs.entries()) {
      const id=`${surface.id}-С${jambIndex+1}-${jamb.side}-${round(jamb.x)}`;
      const key=`${surface.layoutKey}:jamb:${jamb.opening.key}:${jamb.side}:${round(jamb.x)}`;
      overrideKeys.add(key);
      const override=settings.memberOverrides[key] || {};
      const estimateProfile=`${profile.endBoardDepth}×45`;
      const savedProfile=`${profile.thermalDepth}×${settings.edgeWidthMm}`;
      const selectedProfile=override.profile?.trim() || (settings.profileMode==='estimate' ? estimateProfile : savedProfile);
      if (selectedProfile!==estimateProfile) profileMismatches.add(`${selectedProfile} ↔ ${estimateProfile}`);
      const geometricLength=surface.heightStart!=null?Math.round(surface.heightStart+(surface.heightEnd-surface.heightStart)*jamb.x/surface.width):surface.height;
      const length=presentNumber(override.length) ? Number(override.length) : geometricLength;
      if (!(length>0 && length<=100000)) { issue('MEMBER_OVERRIDE',`${id}: неверная длина`,key); continue; }
      if ((override.exclude || override.profile || presentNumber(override.length)) && !override.nodeRef?.trim()) issue('MEMBER_NODE',`${id}: для изменения или исключения укажите рабочий узел`,key);
      const a=[round(jamb.x),0], b=[round(jamb.x),geometricLength];
      members.push({id,key,a,b,length,geometricLength,cutLength:length+2*Number(settings.endAllowanceMm||0),
        material:'Стойка проёма',source:'Стойка проёма',openingRef:`${jamb.opening.name} · ${jamb.side==='left'?'левая':'правая'}`,
        role:'jamb',profile:selectedProfile,estimateProfile,excluded:override.exclude===true,
        nodeRef:override.nodeRef||'',processing:override.processing||'',surface:surface.name,surfaceId:surface.id,
        panels:parts.filter(part=>part.surfaceId===surface.id && (Math.abs(part.x-jamb.x)<.01 || Math.abs(part.x+part.width-jamb.x)<.01)).map(part=>part.id)});
    }
  }
  const notices = [...profileMismatches].map(value => `Сечение раскроя / сметы: ${value} мм. Смета не изменена; подтвердите проектный профиль.`);
  const ids = new Set(); let manualCount = 0;
  for (const item of settings.manualParts) {
    if (ids.has(item.id)) { issue('MANUAL_ID', `Повторная марка ручной детали: ${item.id}`); continue; } ids.add(item.id);
    if (!item.name?.trim() || !item.profile?.trim() || !(Number(item.length) > 0) || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1 || Number(item.quantity) > 1000) { issue('MANUAL', 'Ручная деталь: заполните название, сечение, длину и целое количество от 1 до 1000.', item.id); continue; }
    const quantity = Math.min(1000, Math.floor(Number(item.quantity)));
    manualCount += quantity;
    if (manualCount > 10000) { issue('MANUAL_LIMIT', 'Более 10 000 ручных деталей: разделите комплект на партии.'); break; }
    for (let i = 0; i < quantity; i++) members.push({ id: `Р-${settings.manualParts.indexOf(item)+1}-${i + 1}`, ...(item.hasStableSourceId===false?{}:sourceIdentity('manual-timber',item.id,i+1)), material: item.name.trim(), profile: item.profile.trim(), length: Number(item.length), cutLength: Number(item.length) + 2 * Number(settings.endAllowanceMm || 0), source: 'Ручная деталь', surface: 'Спецузлы', panels: [] });
  }
  const assembly=calculateAssemblyPlan(project,calculation,settings);
  const roofCover=roofCoverLayout(assembly,settings.roofSheets);
  roofCover.issues.forEach(message=>issue('ROOF_SHEETS',message));
  for(const [key,link] of Object.entries(settings.gableLinks)) {
    const gable=surfaces.find(s=>s.layoutKey===key),wall=surfaces.find(s=>s.layoutKey===link?.wallKey);
    if(!gable||(link?.wallKey&&!wall))issue('GABLE_LINK','Привязка фронтона устарела после изменения геометрии. Уточните связь стены и фронтона.',gable?.id||'');
    if(link&&['offset','elevation'].some(k=>link[k]!=null&&(!Number.isFinite(Number(link[k]))||Math.abs(Number(link[k]))>100000)))issue('GABLE_LINK','Привязка фронтона содержит неверное смещение или высоту.',gable?.id||'');
  }
  if(Math.abs(assembly.roofDrawing?.estimateDifference||0)>1)notices.push(`Стропила: раскрой ${assembly.rafters[0].length} мм, сметная модель ${assembly.roofDrawing.estimateLength} мм. Уклон раскроя непрерывный через свес; закупка и итог сметы не заменены автоматически.`);
  assembly.panelLayers=parts.filter(p=>p.surfaceId.endsWith('-ПТ'));
  assembly.floorPanelLayers=parts.filter(p=>p.surfaceId.endsWith('-ПОЛ'));
  assembly.panelConnectors=members.filter(m=>m.a&&m.b&&(m.surfaceId?.endsWith('-ПТ')||m.surfaceId?.endsWith('-ПОЛ'))&&!m.excluded);
  assembly.nodes=settings.assemblyNodes;
  members.push(...assembly.members);
  // Extend the existing production override mechanism to frame/roof/binding pieces.
  // Coordinates are retained: a manufacturing length override is not a moved support.
  for(const member of members.filter(m=>!m.key&&m.source!=='Ручная деталь'&&m.source!=='Проектная опора')){
    const owner=surfaces.find(s=>s.id===member.surfaceId);
    member.key=`detail:${member.id}:${cuttingRevision([owner?.layoutKey,member.a,member.b,member.profile,member.length,member.source])}`;
    overrideKeys.add(member.key);member.geometricLength=member.length;member.estimateProfile=member.profile;
    const override=settings.memberOverrides[member.key]||{};
    if(override.profile && (typeof override.profile!=='string'||!/^\d+(?:[×хx]\d+)+$/.test(override.profile.trim())||override.profile.trim().split(/[×хx]/).some(v=>Number(v)<=0))){issue('MEMBER_OVERRIDE',`${member.id}: неверное сечение`,member.key);member.excluded=true;continue;}
    const length=presentNumber(override.length)?Number(override.length):member.length;
    if(!(length>0&&length<=100000)){issue('MEMBER_OVERRIDE',`${member.id}: неверная производственная длина`,member.key);member.excluded=true;continue;}
    if((override.exclude||override.profile||presentNumber(override.length))&&!override.nodeRef?.trim())issue('MEMBER_NODE',`${member.id}: для изменения или исключения укажите рабочий узел`,member.key);
    member.length=length;member.cutLength=length+2*Number(settings.endAllowanceMm||0);
    member.profile=override.profile?.trim()||member.profile;member.nodeRef=override.nodeRef||member.nodeRef||'';member.processing=override.processing||member.processing||'';member.excluded=override.exclude===true;
  }
  refreshPartitionNotches(members);
  if (Object.keys(settings.memberOverrides).some(key=>!overrideKeys.has(key))) issue('STALE_MEMBER', 'Часть правок соединителей устарела после изменения геометрии/типа соединителя и не применяется.');
  assembly.issues.forEach(message=>issue('ASSEMBLY',message));
  if(services.roof && (roof.warmSlopeArea>0 || roof.rafterStructure?.system==='layered') && !assembly.supports.some(s=>s.type==='purlin'))
    issue('ROOF_SUPPORTS','Опоры кровли: задайте проектные прогоны, стойки и путь нагрузки до фундамента на вкладке «Крыша и опоры».');
  const markRegistry=assignProductionMarks(parts,members,settings.markRegistry);
  const marked=new Map(members.map(m=>[m.id,m.displayMark]));
  for(const list of [assembly.rafters,assembly.roofTimbers,assembly.laths,assembly.counterLaths])for(const m of list||[])m.displayMark=marked.get(m.id)||m.id;
  const panelStock = packPanelBlanks(parts, panelWidth, panelLength, Number(settings.kerfMm || 0), settings.allowRotation);
  const timberStock = packMembers(members.filter(m=>!m.excluded), settings.stockLengthMm, Number(settings.kerfMm || 0));
  if (panelStock.unplaced.length) issue('PANEL_SIZE', `Не помещаются в заготовку: ${panelStock.unplaced.join(', ')}`);
  if (timberStock.unplaced.length) issue('MEMBER_SIZE', `Длиннее хлыста: ${timberStock.unplaced.join(', ')}. Нужен проект стыковки или другая длина заготовки.`);
  if (!surfaces.length && !members.length) issue('EMPTY', 'Нет включённых SIP-конструкций. Задайте план и состав домокомплекта.');
  const { approval, ...revisionSettings } = settings;
  delete revisionSettings.markRegistry; // Derived metadata does not change geometry approval.
  delete revisionSettings.constructionSources;
  // A new, unset diagnostic parameter must not invalidate old approvals.
  if (revisionSettings.bindingJointToleranceMm === '') delete revisionSettings.bindingJointToleranceMm;
  const revision = cuttingRevision({ plans, sip, services, formulas: f, roof: roofSettings, settings: revisionSettings, nodes: project.nodes, construction: project.construction, estimate: calculation.lines, reviewer: approval.reviewer || '', nodeRef: approval.nodeRef || '' });
  const report = { settings, revision, panelWidth, panelLength, surfaces, parts, panelGroups: groupPanels(parts), members, memberGroups:groupMembers(members), starterBoards:starterBoardPlan(surfaces,members), openings, walls, issues, notices, panelStock, timberStock, assembly, netArea: parts.reduce((sum, part) => sum + part.area, 0) / 1e6, upperCourseCount: parts.filter(part => part.upperCourse).length };
  const firstFloorGeometry = buildFirstFloorWallGeometry({ plan: plans[0], sip, roof: roofSettings, services, productionSettings: settings, topFloor: plans.length === 1 });
  report.geometryDiagnostics = { model: firstFloorGeometry, comparison: compareWallGeometry(firstFloorGeometry, surfaces, { framedSlope: calculation.roof?.flatSlopeMode === 'structural' && calculation.roof?.mainGableType === 'cold' }) };
  report.constructionRuleChecks = { bindingStraightSupport: evaluateBindingStraightSupport({
    enabled: services.foundation, foundationType: assembly.foundationType,
    bindingType: calculation.foundation?.bindingType, lines: assembly.binding,
    supports: assembly.piles, toleranceMm: settings.bindingJointToleranceMm,
  }) };
  report.cutting=calculateCutOperations(report);
  report.markRegistry=markRegistry;
  report.constructionSourceRequests=[...new Set(surfaces.filter(s=>s.sourceIdentityStatus==='needs-registration').map(s=>s.sourceRole))];
  report.roofCover=roofCover;
  report.partitionFasteners=(calculation.lines||[]).filter(l=>/^(?:sip-)?partitions(?:SecondFloor)?$/.test(l.source)&&/саморез|крепёж|скоб/i.test(l.name)&&l.kind!=='labor').map(l=>({id:l.id,name:l.name,unit:l.unit,qty:l.qty,catalogId:l.catalogId}));
  report.partitionStock=packMembers(members.filter(m=>m.surfaceId?.includes('-ПГ')&&!m.excluded),settings.stockLengthMm,Number(settings.kerfMm||0));
  report.partitionCatalog=(project.priceMat||[]).filter(c=>settings.partitionFasteners.some(r=>r.catalogId===c.id)).map(c=>({id:c.id,name:c.name,unit:c.unit}));
  report.reconciliation = reconcileCutting(report, calculation);
  report.approvalStatus = approval.revision === revision && !issues.length && approval.reviewer?.trim() && approval.nodeRef?.trim() && ['geometry','nodes','released'].includes(approval.status) ? approval.status : 'draft';
  return report;
}
