// A full-height gap may cross consecutive collinear fabrication segments.
// Split its representation, never its saved coordinates or physical width.
export function gapFragments(gap, edges, tolerance = .001) {
  const horizontal = gap.orientation !== 'v', axis = horizontal ? 'x' : 'y';
  const fixed = horizontal ? 'y' : 'x', center = Number(gap[axis]), width = Number(gap.width);
  if (!Number.isFinite(center) || !(width > 0)) return { fragments: [], error: 'Неверный размер разрыва' };
  const low = center - width / 2, high = center + width / 2;
  const candidates = edges.filter(e => Math.abs(e.a[fixed] - e.b[fixed]) <= tolerance)
    .map(e => ({ edge:e, distance:Math.abs(e.a[fixed] - gap[fixed]), low:Math.min(e.a[axis],e.b[axis]), high:Math.max(e.a[axis],e.b[axis]) }))
    .filter(e => e.distance <= .015 && e.high > low + tolerance && e.low < high - tolerance)
    .sort((a,b)=>a.distance-b.distance);
  if (!candidates.length) return { fragments:[], error:'Разрыв не попадает на стену' };
  const nearest = candidates[0];
  const aligned = candidates.filter(e=>Math.abs(e.edge.a[fixed]-nearest.edge.a[fixed]) <= tolerance);
  if(candidates.some(e=>!aligned.includes(e)&&Math.abs(e.distance-nearest.distance)<tolerance))
    return { fragments:[], error:'Привязка разрыва к стене неоднозначна' };
  let cursor = low;
  const fragments = [];
  for(const e of aligned.sort((a,b)=>a.low-b.low)) {
    const start=Math.max(low,e.low), end=Math.min(high,e.high);
    if(start>cursor+tolerance)return {fragments,error:'Разрыв выходит за стену или пересекает незамкнутое примыкание'};
    if(end<=cursor+tolerance)continue;
    const from=Math.max(start,cursor);
    const forward=e.edge.b[axis]>=e.edge.a[axis];
    fragments.push({edge:e.edge,x:forward?from-e.edge.a[axis]:e.edge.a[axis]-end,width:end-from});
    cursor=end;
  }
  return {fragments,error:cursor<high-tolerance?'Разрыв выходит за стену':null};
}
