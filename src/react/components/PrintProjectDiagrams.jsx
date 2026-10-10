import { useId } from 'react';
import { stairStepGeometry } from '../planner/stair-steps.js';
import { calculateClearAreas } from '../calculations/plan-clear-area.js';
import { calculateFoundation } from '../calculations/foundation-model.js';
import { platformRoofFrame } from '../planner/platform-roof-frame.js';
import { printDiagramLayers, printRoofBounds } from '../planner/print-diagram-layers.js';
import { normalizeTieredRoof } from '../calculations/tiered-roof.js';
import { boundsOf, houseContourPoints, lineEndpoints, roomPoints, unifiedWallSegments } from '../planner/geometry.js';
import { formatNumber } from '../utils/format.js';

const PLAN_VIEW = { width: 760, height: 500, margin: 62 };

function doorSwingGeometry(opening, q, size, plan) {
  const left = opening.hinge === 'left';
  if (opening.orientation === 'h') {
    const hingeX = q.x + (left ? -size / 2 : size / 2);
    const closedX = q.x + (left ? size / 2 : -size / 2);
    const inward = opening.outer ? (opening.y < plan.house.h / 2 ? 1 : -1) : 1;
    const direction = opening.swing === 'out' ? -inward : inward;
    const leafY = q.y + direction * size;
    return { leaves: [{ x1: hingeX, y1: q.y, x2: hingeX, y2: leafY }], arcs: [`M ${closedX} ${q.y} A ${size} ${size} 0 0 ${left === (direction > 0) ? 1 : 0} ${hingeX} ${leafY}`] };
  }
  const hingeY = q.y + (left ? -size / 2 : size / 2);
  const closedY = q.y + (left ? size / 2 : -size / 2);
  const inward = opening.outer ? (opening.x < plan.house.w / 2 ? 1 : -1) : 1;
  const direction = opening.swing === 'out' ? -inward : inward;
  const leafX = q.x + direction * size;
  return { leaves: [{ x1: q.x, y1: hingeY, x2: leafX, y2: hingeY }], arcs: [`M ${q.x} ${closedY} A ${size} ${size} 0 0 ${left === (direction < 0) ? 1 : 0} ${leafX} ${hingeY}`] };
}

function garageSwingGeometry(opening, q, size, plan) {
  const half = size / 2;
  if (opening.orientation === 'h') {
    const inward = opening.outer ? (opening.y < plan.house.h / 2 ? 1 : -1) : 1;
    const direction = opening.swing === 'out' ? -inward : inward;
    const leafY = q.y + direction * half;
    return {
      leaves: [{ x1: q.x - half, y1: q.y, x2: q.x - half, y2: leafY }, { x1: q.x + half, y1: q.y, x2: q.x + half, y2: leafY }],
      arcs: [`M ${q.x} ${q.y} A ${half} ${half} 0 0 ${direction > 0 ? 1 : 0} ${q.x - half} ${leafY}`, `M ${q.x} ${q.y} A ${half} ${half} 0 0 ${direction > 0 ? 0 : 1} ${q.x + half} ${leafY}`]
    };
  }
  const inward = opening.outer ? (opening.x < plan.house.w / 2 ? 1 : -1) : 1;
  const direction = opening.swing === 'out' ? -inward : inward;
  const leafX = q.x + direction * half;
  return {
    leaves: [{ x1: q.x, y1: q.y - half, x2: leafX, y2: q.y - half }, { x1: q.x, y1: q.y + half, x2: leafX, y2: q.y + half }],
    arcs: [`M ${q.x} ${q.y} A ${half} ${half} 0 0 ${direction > 0 ? 0 : 1} ${leafX} ${q.y - half}`, `M ${q.x} ${q.y} A ${half} ${half} 0 0 ${direction > 0 ? 1 : 0} ${leafX} ${q.y + half}`]
  };
}

function planBounds(plan, options = {}, roof = {}) {
  const platforms = (plan.platforms || []).filter(item => item.include !== false);
  const roofPoints = options.showRoof && options.showPlatforms !== false ? platforms.flatMap(item => {
    const frame = platformRoofFrame(item, plan.house, item.roof?.rafterStep ?? roof.rafterStep, roof);
    return frame ? [{ x: frame.bounds.x1, y: frame.bounds.y1 }, { x: frame.bounds.x2, y: frame.bounds.y2 }] : [];
  }) : [];
  if (options.showRoof) {
    const b = printRoofBounds(plan, roof);
    roofPoints.push({x:b.x1,y:b.y1},{x:b.x2,y:b.y2});
  }
  const points = [
    ...houseContourPoints(plan),
    ...roofPoints,
    ...(options.showRooms === false ? [] : (plan.rooms || []).flatMap(roomPoints)),
    ...(options.showPlatforms === false ? [] : platforms.flatMap((item) => [
      { x: item.x, y: item.y }, { x: item.x + item.w, y: item.y + item.h }
    ])),
    ...(options.showDimensions === false ? [] : (plan.dimensions || []).flatMap(item => [{ x: item.x1, y: item.y1 }, { x: item.x2, y: item.y2 }])),
    ...(options.showRooms === false ? [] : (plan.annotations || []).flatMap(item => [{ x: item.x, y: item.y }, { x: item.targetX, y: item.targetY }]))
  ];
  return boundsOf(points);
}

function PrintPlatformRoof({ item, frame, p }) {
  const a = p(frame.bounds.x1, frame.bounds.y1);
  const b = p(frame.bounds.x2, frame.bounds.y2);
  const segment = ([start, end], key, className) => { const from = p(start.x, start.y); const to = p(end.x, end.y); return <line key={key} className={className} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />; };
  const outline = {top:`M ${a.x} ${b.y} L ${a.x} ${a.y} L ${b.x} ${a.y} L ${b.x} ${b.y}`,bottom:`M ${a.x} ${a.y} L ${a.x} ${b.y} L ${b.x} ${b.y} L ${b.x} ${a.y}`,left:`M ${b.x} ${a.y} L ${a.x} ${a.y} L ${a.x} ${b.y} L ${b.x} ${b.y}`,right:`M ${a.x} ${a.y} L ${b.x} ${a.y} L ${b.x} ${b.y} L ${a.x} ${b.y}`}[frame.attachmentSide];
  return <g className={`print-platform-roof${frame.continuation ? ' continuation' : ''}`} aria-label={`Кровля ${item.kind === 'porch' ? 'крыльца' : 'террасы'}`}>
    <rect x={a.x} y={a.y} width={b.x-a.x} height={b.y-a.y} />
    {frame.rafters.map((pair, index) => segment(pair, index))}
    {frame.ridge ? segment(frame.ridge, 'ridge', 'ridge') : null}
    {frame.continuation ? <path className="continuation-outline" d={outline} /> : null}
  </g>;
}

function PrintRoofTopLayer({ plan, roof = {}, p }) {
  const { x1, x2, y1, y2, shape, vertical } = printRoofBounds(plan, roof);
  const centerX = (x1 + x2) / 2; const centerY = (y1 + y2) / 2;
  const step = Math.max(0.3, Number(roof.rafterStep) || 0.6);
  const longStart = vertical ? y1 : x1;
  const longEnd = vertical ? y2 : x2;
  const rafterCount = Math.max(2, Math.ceil((longEnd - longStart) / step) + 1);
  const rafters = Array.from({ length: rafterCount }, (_, index) => longStart + ((longEnd - longStart) * index) / Math.max(1, rafterCount - 1));
  const a = p(x1, y1); const b = p(x2, y2);
  const axisLength = vertical ? y2 - y1 : x2 - x1;
  const spanLength = vertical ? x2 - x1 : y2 - y1;
  const ridgeInset = shape === 'hip' ? Math.min(axisLength, spanLength) / 2 : 0;
  const ridgeA = vertical ? p(centerX, y1 + ridgeInset) : p(x1 + ridgeInset, centerY);
  const ridgeB = vertical ? p(centerX, y2 - ridgeInset) : p(x2 - ridgeInset, centerY);
  if (shape === 'tiered') {
    const settings = normalizeTieredRoof(roof.tiered);
    const house = boundsOf(houseContourPoints(plan));
    const split = vertical
      ? house.x + house.w * (settings.upperSide === 'first' ? settings.upperShare : 100 - settings.upperShare) / 100
      : house.y + house.h * (settings.upperSide === 'first' ? settings.upperShare : 100 - settings.upperShare) / 100;
    const j1 = vertical ? p(split, y1) : p(x1, split);
    const j2 = vertical ? p(split, y2) : p(x2, split);
    const zones = vertical ? [[x1, split], [split, x2]] : [[y1, split], [split, y2]];
    return <g className="print-roof-top-layer tiered" aria-label="Кровля: два односкатных уровня">
      {zones.map(([start,end],index) => {
        const first = vertical ? p(start,y1) : p(x1,start);
        const last = vertical ? p(end,y2) : p(x2,end);
        const label = (index === 0) === (settings.upperSide === 'first') ? 'Верхний скат' : 'Нижний скат';
        return <g key={index}>
          <rect className="print-roof-overhang" x={first.x} y={first.y} width={last.x-first.x} height={last.y-first.y} fillOpacity={index === 0 ? 0.6 : 0.32} />
          <g className="print-roof-rafters">{rafters.map((value,i) => {
            const q1 = vertical ? p(start,value) : p(value,start);
            const q2 = vertical ? p(end,value) : p(value,end);
            return <line key={i} x1={q1.x} y1={q1.y} x2={q2.x} y2={q2.y} />;
          })}</g>
          <text className="print-roof-caption" x={(first.x+last.x)/2} y={(first.y+last.y)/2}>{label}</text>
        </g>;
      })}
      <line className="print-roof-ridge" x1={j1.x} y1={j1.y} x2={j2.x} y2={j2.y} />
      <text className="print-roof-caption" x={p(centerX,centerY).x} y={p(centerX,centerY).y - 32}>Два односкатных уровня · стык</text>
    </g>;
  }
  return <g className={`print-roof-top-layer ${shape}`} aria-label="Крыша из текущего плана">
    <rect className="print-roof-overhang" x={a.x} y={a.y} width={b.x - a.x} height={b.y - a.y} />
    {shape !== 'flat' ? <line className="print-roof-ridge" x1={ridgeA.x} y1={ridgeA.y} x2={ridgeB.x} y2={ridgeB.y} /> : null}
    {shape === 'hip' ? <g className="print-roof-diagonals">
      <line x1={a.x} y1={a.y} x2={ridgeA.x} y2={ridgeA.y} /><line x1={b.x} y1={a.y} x2={ridgeB.x} y2={ridgeB.y} />
      <line x1={a.x} y1={b.y} x2={ridgeA.x} y2={ridgeA.y} /><line x1={b.x} y1={b.y} x2={ridgeB.x} y2={ridgeB.y} />
    </g> : null}
    <g className="print-roof-rafters">{rafters.map((value, index) => {
      const q1 = vertical ? p(x1, value) : p(value, y1);
      const q2 = vertical ? p(x2, value) : p(value, y2);
      return <line key={index} x1={q1.x} y1={q1.y} x2={q2.x} y2={q2.y} />;
    })}</g>
    <text className="print-roof-caption" x={p(centerX, centerY).x} y={p(centerX, centerY).y - 12}>{shape === 'hip' ? 'Вальмовая кровля' : shape === 'flat' ? 'Плоская кровля' : 'Двускатная кровля'}</text>
  </g>;
}

export function PrintPlanDiagram({ plan, pileSettings, options = {}, roofSettings, floorOpening }) {
  const clearAreas=calculateClearAreas(plan);
  const wallClipId=useId().replace(/:/g,'');
  const bounds = planBounds(plan, options, roofSettings);
  const scale = Math.min(
    (PLAN_VIEW.width - PLAN_VIEW.margin * 2) / Math.max(1, bounds.w),
    (PLAN_VIEW.height - PLAN_VIEW.margin * 2) / Math.max(1, bounds.h)
  );
  const ox = (PLAN_VIEW.width - bounds.w * scale) / 2 - bounds.x * scale;
  const oy = (PLAN_VIEW.height - bounds.h * scale) / 2 - bounds.y * scale;
  const p = (x, y) => ({ x: ox + x * scale, y: oy + y * scale });
  const contour = houseContourPoints(plan);
  const houseBounds = boundsOf(contour);
  const houseStart = p(houseBounds.x, houseBounds.y);
  const houseScreen = contour.map((point) => p(point.x, point.y));
  const showPiles = options.showPiles !== false;
  const showBinding = options.showBinding !== false;
  const showDimensions = options.showDimensions !== false;
  const showContour = options.showContour !== false;
  const showRooms = options.showRooms !== false;
  const showOpenings = options.showOpenings !== false;
  const showPlatforms = options.showPlatforms !== false;
  const foundation = calculateFoundation(plan, pileSettings);
  const line = (item) => ({ a: p(item.x1, item.y1), b: p(item.x2, item.y2) });
  const openingLine = (opening) => {
    const q = p(opening.x, opening.y);
    const half = Math.max(8, opening.width * scale / 2);
    return opening.orientation === 'v'
      ? { x1: q.x, y1: q.y - half, x2: q.x, y2: q.y + half }
      : { x1: q.x - half, y1: q.y, x2: q.x + half, y2: q.y };
  };
  const gapLine = (gap) => {
    const q = p(gap.x, gap.y);
    const half = Math.max(8, (Number(gap.width) || 1) * scale / 2);
    return gap.orientation === 'v' ? { x1: q.x, y1: q.y - half, x2: q.x, y2: q.y + half } : { x1: q.x - half, y1: q.y, x2: q.x + half, y2: q.y };
  };
  const renderOpening = (opening) => {
    const q = p(opening.x, opening.y);
    const size = Math.max(16, opening.width * scale);
    const garage = opening.type === 'door' && opening.doorType === 'garage';
    const geometry = opening.type === 'door' ? (garage ? garageSwingGeometry(opening, q, size, plan) : doorSwingGeometry(opening, q, size, plan)) : null;
    return <g key={opening.id} className={`print-opening-group ${garage ? 'garage' : opening.type}`}>
      <line className="print-opening-cut" style={{strokeWidth:Math.max(18,2*(Number(plan.wallThickness)||.174)*scale)}} {...openingLine(opening)} />
      <line className={`print-opening ${garage ? 'garage' : opening.type}`} {...openingLine(opening)} />
      {geometry ? <g className={`print-door-swing ${garage ? 'garage' : ''}`} aria-label={garage ? 'Двустворчатое открывание гаражных ворот' : 'Направление открывания двери'}>
        {geometry.leaves.map((leaf, index) => <line key={`leaf-${index}`} {...leaf} />)}
        {geometry.arcs.map((path, index) => <path key={`arc-${index}`} d={path} />)}
      </g> : null}
      {garage ? <text className="print-opening-tag" x={q.x} y={q.y - 9}>ГВ</text> : null}
    </g>;
  };
  const sharedFloorOpenings = Array.isArray(floorOpening)?floorOpening:Array.isArray(plan.floorOpenings)?plan.floorOpenings:[floorOpening || plan.floorOpening || {}];
  return <svg className="print-plan-svg" viewBox={`0 0 ${PLAN_VIEW.width} ${PLAN_VIEW.height}`} role="img" aria-label="План дома для печати">
    <defs><marker id="print-plan-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" /></marker><marker id="print-note-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" /></marker></defs>
    {showPlatforms ? (plan.platforms || []).filter(item => item.include !== false).map((item) => {
      const q = p(item.x, item.y);
      const frame = options.showRoof ? platformRoofFrame(item, plan.house, item.roof?.rafterStep ?? roofSettings?.rafterStep, roofSettings) : null;
      const labelSize = Math.max(6, Math.min(13, item.w * scale / 5, item.h * scale / 3));
      return <g key={item.id} className="print-platform">
        <rect x={q.x} y={q.y} width={item.w * scale} height={item.h * scale} />
        {frame && !frame.continuation ? <PrintPlatformRoof item={item} frame={frame} p={p} /> : null}
        <text className="print-platform-title" style={{fontSize:labelSize}} x={q.x + item.w * scale / 2} y={q.y + item.h * scale / 2 - labelSize / 3}>{item.kind === 'porch' ? 'Крыльцо' : 'Терраса'}</text>
        <text className="print-platform-area" style={{fontSize:labelSize * .8}} x={q.x + item.w * scale / 2} y={q.y + item.h * scale / 2 + labelSize}>{formatNumber(item.w * item.h)} м²</text>
      </g>;
    }) : null}
    {showContour || showRooms || options.showRoof ? <polygon className="print-house-fill" points={houseScreen.map((point) => `${point.x},${point.y}`).join(' ')} /> : null}
    {options.showRoof ? <PrintRoofTopLayer plan={plan} roof={roofSettings} p={p} /> : null}
    {options.showRoof && showPlatforms ? (plan.platforms || []).filter(item => item.include !== false && item.roof?.shape === 'continuation').map(item => {
      const frame = platformRoofFrame(item, plan.house, item.roof?.rafterStep ?? roofSettings?.rafterStep, roofSettings);
      if (!frame) return null;
      const center = p(item.x + item.w/2, item.y + item.h/2);
      const labelSize = Math.max(6, Math.min(13, item.w * scale / 5, item.h * scale / 3));
      return <g key={`roof-${item.id}`}>
        <PrintPlatformRoof item={item} frame={frame} p={p} />
        <text className="print-platform-title" style={{fontSize:labelSize}} x={center.x} y={center.y-labelSize/3}>{item.kind === 'porch' ? 'Крыльцо' : 'Терраса'}</text>
        <text className="print-platform-area" style={{fontSize:labelSize*.8}} x={center.x} y={center.y+labelSize}>{formatNumber(item.w*item.h)} м²</text>
      </g>;
    }) : null}
    {showRooms ? (plan.rooms || []).map((room) => { const points = roomPoints(room); const screen = points.map((point) => p(point.x, point.y)); const roomBounds = boundsOf(points); const center = p(Number.isFinite(Number(room.labelX)) ? Number(room.labelX) : roomBounds.x + roomBounds.w / 2, Number.isFinite(Number(room.labelY)) ? Number(room.labelY) : roomBounds.y + roomBounds.h / 2); const clearArea = clearAreas.rooms[room.id]?.clearArea; const titleSize = Math.max(8, (Number(room.labelFontSize) || 22) * .55); return <g key={room.id} className="print-room"><polygon points={screen.map((point) => `${point.x},${point.y}`).join(' ')} /><text className="room-title" style={{ fontSize:titleSize }} x={center.x} y={center.y - titleSize * 1.1}>{room.name}</text><text style={{fontSize:titleSize * .75}} x={center.x} y={center.y + titleSize * .2}>{formatNumber(roomBounds.w)} × {formatNumber(roomBounds.h)} м</text><text className="room-clear-area" style={{fontSize:titleSize}} x={center.x} y={center.y + titleSize * 1.45}>{clearArea != null ? `${formatNumber(clearArea,2)} м²` : 'Площадь уточнить'}</text></g>; }) : null}
    {showRooms ? (plan.annotations || []).map(item => { const label = p(item.x, item.y); const target = p(item.targetX, item.targetY); return <g key={item.id} className="print-annotation">{item.showArrow !== false ? <line x1={label.x} y1={label.y + 4} x2={target.x} y2={target.y} markerEnd="url(#print-note-arrow)" /> : null}<text x={label.x} y={label.y} style={{ fontSize: Math.max(8, (Number(item.fontSize) || 18) * .55) }}>{item.text}</text></g>; }) : null}
    {showRooms ? sharedFloorOpenings.filter(o=>o.include!==false&&o.width>0&&o.length>0).map((sharedFloorOpening,i)=>{
      const floorOpeningArea=sharedFloorOpening.width*sharedFloorOpening.length,floorOpeningStart=p(sharedFloorOpening.x,sharedFloorOpening.y),floorOpeningSteps=stairStepGeometry({x:floorOpeningStart.x,y:floorOpeningStart.y,width:sharedFloorOpening.width*scale,height:sharedFloorOpening.length*scale},sharedFloorOpening.direction,sharedFloorOpening.stepCount);
      return <g key={sharedFloorOpening.id||i} className="print-floor-opening" aria-label="Лестничный проём между этажами">
      <rect x={floorOpeningStart.x} y={floorOpeningStart.y} width={sharedFloorOpening.width * scale} height={sharedFloorOpening.length * scale} />
      {floorOpeningSteps.treads.map((tread, index) => <line key={index} {...tread} />)}
      <line className="stair-direction-shaft" {...floorOpeningSteps.arrow} />
      <polygon className="stair-direction-head" points={floorOpeningSteps.head} />
      <text x={floorOpeningStart.x + sharedFloorOpening.width * scale / 2} y={floorOpeningStart.y + sharedFloorOpening.length * scale / 2 - 4}>{sharedFloorOpening.name||'Лестничный проём'}</text>
      <text x={floorOpeningStart.x + sharedFloorOpening.width * scale / 2} y={floorOpeningStart.y + sharedFloorOpening.length * scale / 2 + 12}>{formatNumber(floorOpeningArea)} м²</text>
    </g>;}) : null}
    <defs><clipPath id={wallClipId}><polygon points={houseScreen.map(point=>`${point.x},${point.y}`).join(' ')}/></clipPath></defs>
    {showContour || options.showRoof ? <polygon className="print-outer-wall" clipPath={`url(#${wallClipId})`} style={{strokeWidth:2*(Number(plan.wallThickness)||.174)*scale}} points={houseScreen.map((point) => `${point.x},${point.y}`).join(' ')} /> : null}
    {showRooms ? unifiedWallSegments(plan).map((segment, index) => { const [a, b] = lineEndpoints(segment); const q1 = p(a.x, a.y); const q2 = p(b.x, b.y); return <line className="print-inner-wall" style={{strokeWidth:(Number(plan.partitionThickness)||.1)*scale}} key={index} x1={q1.x} y1={q1.y} x2={q2.x} y2={q2.y} />; }) : null}
    {showRooms ? (plan.walls || []).map((wall) => { const a = p(wall.x1, wall.y1); const b = p(wall.x2, wall.y2); return <line className="print-inner-wall" style={{strokeWidth:(Number(plan.partitionThickness)||.1)*scale}} key={wall.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />; }) : null}
    {showOpenings ? (plan.wallGaps || []).map(gap => <line key={gap.id} className="print-wall-gap" {...gapLine(gap)} />) : null}
    {showBinding ? <g className="print-binding" aria-label="Обвязка на печатном плане">
      {(foundation.bindingLines || plan.bindingLines || []).filter((item) => item.include !== false).map((item) => { const q = line(item); return <line key={item.id} x1={q.a.x} y1={q.a.y} x2={q.b.x} y2={q.b.y} />; })}
      {pileSettings?.pileType!=='concreteBlock'?(plan.platforms || []).filter((item) => item.include !== false && item.binding?.mode !== 'none').map((item) => { const q = p(item.x, item.y); return <rect key={item.id} x={q.x} y={q.y} width={item.w * scale} height={item.h * scale} />; }):null}
    </g> : null}
    {showOpenings ? (plan.openings || []).map(renderOpening) : null}
    {showPiles ? <g className="print-piles" aria-label="Сваи на печатном плане">{foundation.points.map((point, index) => { const q = p(point.x, point.y); return <circle key={index} cx={q.x} cy={q.y} r="5" />; })}</g> : null}
    {showDimensions ? <g className="print-house-dimensions" aria-label="Размеры на печатном плане">
      <line x1={houseStart.x} y1={houseStart.y - 24} x2={houseStart.x + houseBounds.w * scale} y2={houseStart.y - 24} markerStart="url(#print-plan-arrow)" markerEnd="url(#print-plan-arrow)" />
      <text x={houseStart.x + houseBounds.w * scale / 2} y={houseStart.y - 31}>{Math.round(houseBounds.w * 1000).toLocaleString('ru-RU')} мм</text>
      <line x1={houseStart.x - 24} y1={houseStart.y} x2={houseStart.x - 24} y2={houseStart.y + houseBounds.h * scale} markerStart="url(#print-plan-arrow)" markerEnd="url(#print-plan-arrow)" />
      <text transform={`translate(${houseStart.x - 31} ${houseStart.y + houseBounds.h * scale / 2}) rotate(-90)`}>{Math.round(houseBounds.h * 1000).toLocaleString('ru-RU')} мм</text>
      {(plan.dimensions || []).map((item) => { const q = line(item); const length = Math.hypot(item.x2 - item.x1, item.y2 - item.y1); return <g className="print-custom-dimension" key={item.id}><line x1={q.a.x} y1={q.a.y} x2={q.b.x} y2={q.b.y} markerStart="url(#print-plan-arrow)" markerEnd="url(#print-plan-arrow)" /><text style={{ fontSize: Math.max(8, (Number(item.fontSize) || 16) * .65) }} x={(q.a.x + q.b.x) / 2} y={(q.a.y + q.b.y) / 2 - 7}>{Math.round(length * 1000).toLocaleString('ru-RU')} мм</text></g>; })}
    </g> : null}
    {options.showLegend === false ? null : <g className="print-plan-legend" transform="translate(35 456)" aria-label="Условные обозначения плана">
      <rect className="legend-background" x="0" y="0" width="690" height="34" rx="6" />
      <g className="legend-item" transform="translate(14 17)"><line className="legend-outer" x1="0" y1="0" x2="25" y2="0" /><text x="32" y="4">Наружная стена</text></g>
      <g className="legend-item" transform="translate(158 17)"><line className="legend-inner" x1="0" y1="0" x2="25" y2="0" /><text x="32" y="4">Перегородка</text></g>
      {showBinding ? <g className="legend-item" transform="translate(282 17)"><line className="legend-binding" x1="0" y1="0" x2="25" y2="0" /><text x="32" y="4">Обвязка</text></g> : null}
      <g className="legend-item" transform="translate(392 17)"><line className="legend-window" x1="0" y1="0" x2="25" y2="0" /><text x="32" y="4">Окно</text></g>
      <g className="legend-item" transform="translate(490 17)"><line className="legend-door" x1="0" y1="0" x2="25" y2="0" /><text x="32" y="4">Дверь / ворота</text></g>
    </g>}
  </svg>;
}

export function PrintRoofDiagram({ project, roof }) {
  const structure = roof.rafterStructure || {};
  const count = Math.max(2, structure.pairCount || 2);
  const rafters = Array.from({ length: count }, (_, index) => 394 + index * (302 / Math.max(1, count - 1)));
  const layered = structure.system === 'layered';
  const truss = structure.system === 'truss';
  const flat = roof.mainRoofShape === 'flat';
  const hip = roof.mainRoofShape === 'hip';
  return <svg className="print-roof-svg" viewBox="0 0 760 300" role="img" aria-label="Схема кровли для печати">
    <g className="print-roof-section">
      <rect x="48" y="178" width="270" height="54" />
      {flat ? <line x1="35" y1="170" x2="330" y2="155" /> : <><line x1="34" y1="178" x2="183" y2="55" /><line x1="183" y1="55" x2="332" y2="178" /></>}
      {!flat ? <><line className="mauerlat" x1="52" y1="173" x2="78" y2="173" /><line className="mauerlat" x1="288" y1="173" x2="314" y2="173" /></> : null}
      {layered ? <><line className="support" x1="183" y1="62" x2="183" y2="178" /><line className="support" x1="183" y1="164" x2="118" y2="111" /><line className="support" x1="183" y1="164" x2="248" y2="111" /></> : truss ? <><line className="support" x1="52" y1="169" x2="314" y2="169" /><line className="support" x1="183" y1="61" x2="183" y2="169" /><line className="support" x1="116" y1="111" x2="183" y2="169" /><line className="support" x1="250" y1="111" x2="183" y2="169" /></> : !flat ? <line className="support" x1="88" y1="132" x2="278" y2="132" /> : null}
      <text x="183" y="258">{flat ? 'Плоская кровля' : hip ? 'Вальмовая кровля' : layered ? 'Наслонная система' : truss ? 'Стропильная ферма' : 'Висячая A-frame'}</text>
      <text x="183" y="276">Высота конька {formatNumber(project.settings.roof.ridgeHeight)} м</text>
    </g>
    <g className="print-roof-plan">
      <rect x="394" y="55" width="302" height="177" />
      <line className="mauerlat" x1="398" y1="64" x2="692" y2="64" />
      <line className="mauerlat" x1="398" y1="223" x2="692" y2="223" />
      {!flat ? <line className="ridge" x1={hip ? 482 : 394} y1="143" x2={hip ? 608 : 696} y2="143" /> : null}
      {hip ? <g className="print-roof-hips"><line x1="394" y1="55" x2="482" y2="143" /><line x1="394" y1="232" x2="482" y2="143" /><line x1="696" y1="55" x2="608" y2="143" /><line x1="696" y1="232" x2="608" y2="143" /></g> : null}
      {rafters.map((x) => <line key={x} x1={x} y1="55" x2={x} y2="232" />)}
      <text x="545" y="258">{structure.pairCount || 0} пар · шаг {formatNumber(structure.step || 0.6)} м</text>
      <text x="545" y="276">Свесы: карниз {formatNumber(roof.eaveOverhang)} м · торец {formatNumber(roof.gableOverhang)} м</text>
    </g>
  </svg>;
}

export function PrintProjectDiagrams({ project, calculation }) {
  const options = project.settings.print || {};
  const includePlan = options.includePlan !== false;
  const includeRoof = options.includeRoof === true;
  const separatePileSheet = options.separatePileSheet === true && options.showPiles !== false;
  const separateRoofSheet = options.separateRoofSheet !== false && includeRoof;
  const floorCount = Math.max(1, Math.min(2, Number(project.meta?.floors) || 1));
  const floorPlans = [
    project.plan,
    ...(project.upperFloors || []).slice(0, floorCount - 1),
  ];
  if (!includePlan && !includeRoof && !separatePileSheet) return null;
  const diagramCount = (includePlan ? floorPlans.length : 0) + (includeRoof ? 1 : 0) + (separatePileSheet ? 1 : 0);
  return <section className={`print-diagrams ${diagramCount > 1 ? 'two' : 'one'}`} aria-label="Иллюстрации проекта">
    {includePlan ? floorPlans.map((floorPlan, floorIndex) => <article className={options.separatePlanSheets !== false ? 'print-diagram-sheet floor-sheet' : ''} key={`floor-${floorIndex + 1}`}><h2>План {floorIndex + 1} этажа</h2><PrintPlanDiagram plan={floorPlan} floorOpening={floorCount > 1 ? (project.upperFloors?.[0]?.floorOpenings||project.upperFloors?.[0]?.floorOpening) : null} pileSettings={project.settings.piles} roofSettings={project.settings.roof} options={printDiagramLayers('floor', options, floorIndex, separatePileSheet)} /></article>) : null}
    {separatePileSheet ? <article className="print-diagram-sheet pile-sheet"><h2>Свайное поле и обвязка</h2><PrintPlanDiagram plan={project.plan} pileSettings={project.settings.piles} options={printDiagramLayers('foundation', options)} /></article> : null}
    {includeRoof ? <article className={separateRoofSheet ? "print-diagram-sheet roof-sheet" : ""}><h2>Крыша на контуре дома</h2><PrintPlanDiagram plan={project.plan} pileSettings={project.settings.piles} roofSettings={project.settings.roof} options={printDiagramLayers('roof', options)} /></article> : null}
  </section>;
}
