import { pointInPolygon } from '../planner/geometry.js';
import { planIntersection } from './roof-fabrication.js';
import { roofSupportOpeningAt } from './roof-facet-supports.js';
import { roofGeometrySignature } from './roof-detailing.js';
import { ceilingTopElevation } from './roof-wall-plate.js';

export const ROOF_JUNCTION_SKETCH = 'roof-junction-sketch';
const mix = (a,b,t) => a.map((value,i)=>value+(b[i]-value)*t);
const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
function onSegment(point,a,b,tolerance=1) {
  const span = distance(a,b);
  return span>0 && Math.abs(distance(point,a)+distance(point,b)-span)<=tolerance
    && Math.abs((b[0]-a[0])*(point[1]-a[1])-(b[1]-a[1])*(point[0]-a[0]))/span<=tolerance;
}
const validProfile = value => /^\d+×\d+$/.test(value) && value.split('×').every(n=>Number(n)>0&&Number(n)<=10000);

export function roofJunctionSketch(project, calculation, report) {
  const { assembly, settings } = report;
  const { roofModel: model } = assembly;
  const { postProfile, purlinProfile } = settings.autoRoofSupports;
  const result = { items: [], skippedOpenings: 0 };
  if (calculation.roof.rafterStructure?.system==='truss' || !validProfile(postProfile) || !validProfile(purlinProfile)) return result;
  const floor = assembly.floors.at(-1), ring = floor.contour;
  const outline = ring.map(([x,y])=>({x,y}));
  const walls = ring.map((a,i)=>[a,ring[(i+1)%ring.length]]);
  const inside = ([x,y]) => pointInPolygon({x,y},outline) || walls.some(([a,b])=>onSegment([x,y],a,b));
  const zBase = ceilingTopElevation(project,calculation,assembly.floors.length).topZ;
  const roofSourceKey = roofGeometrySignature(model);
  const cold = new Set(model.faces.filter(face=>face.group==='main'&&!face.warm).map(face=>face.id));
  const edges = model.edges.filter(edge=>edge.faces.every(id=>cold.has(id)));
  const timbers = new Map(assembly.roofTimbers.map(item=>[item.id,item]));
  const postByPoint = new Map();
  const add = (type,name,profile,a,b) => {
    const [x1,y1,z1] = a.map(Math.round), [x2,y2,z2] = b.map(Math.round);
    const item = { id: `${ROOF_JUNCTION_SKETCH}-${result.items.length+1}`, type, name, profile, x1,y1,z1,x2,y2,z2,
      autoLayout: ROOF_JUNCTION_SKETCH, roofJunctionSketch: true, referenceOnly: true, estimateEnabled: false, roofSourceKey };
    result.items.push(item);
    return item;
  };
  const lower = (p,edge) => {
    const timber = timbers.get(`КР-${edge.id}`);
    const profile = timber?.profile || String(calculation.roof.rafterStructure?.section).replace('x','×');
    return [p[0],p[1],p[2]-(Number(profile.split('×')[1])||0)/2];
  };
  const postAt = (point,edge) => {
    const key = point.slice(0,2).map(Math.round).join(',');
    if (postByPoint.has(key)) return postByPoint.get(key);
    const top = lower(point,edge);
    if (top[2]-zBase < 1 || !inside(point)) return null;
    if (roofSupportOpeningAt(project,point[0],point[1],postProfile)) {
      result.skippedOpenings++;
      postByPoint.set(key,null);
      return null;
    }
    const post = add('post','Стойка под узлом кровли',postProfile,[point[0],point[1],zBase],top);
    postByPoint.set(key,post);
    return post;
  };
  for (const edge of edges.filter(edge=>edge.kind==='ridge')) {
    const cuts = [0,1,...walls.map(([a,b])=>planIntersection(edge.a,edge.b,a,b)?.t).filter(t=>t!=null)].sort((a,b)=>a-b);
    for (let i=1;i<cuts.length;i++) {
      const a=mix(edge.a,edge.b,cuts[i-1]), b=mix(edge.a,edge.b,cuts[i]);
      if (distance(a,b)<1 || !inside(mix(a,b,.5))) continue;
      const first=postAt(a,edge), last=postAt(b,edge);
      if (!first || !last) continue;
      const [sleeperDepth,sleeperWidth]=purlinProfile.split('×').map(Number).sort((a,b)=>a-b);
      if (Math.min(first.z2,last.z2)>zBase+sleeperDepth+1) {
        const alongBearing=floor.bearing.some(({a:start,b:end})=>onSegment(a,start,end,10)&&onSegment(b,start,end,10));
        const z=zBase+sleeperDepth/2;
        const sleeper=add('sleeper',alongBearing?'Лежень по несущей линии':'Лежень · опора требует проверки',`${sleeperDepth}×${sleeperWidth}`,[a[0],a[1],z],[b[0],b[1],z]);
        sleeper.flat=true;
        first.z1=last.z1=Math.round(zBase+sleeperDepth);
      }
      const depth=Number(postProfile.split('×')[0]);
      if (distance(a,b)>6*depth) {
        const base=Math.max(first.z1,last.z1);
        const lowerZ=base+(Math.min(first.z2,last.z2)-base)/3;
        add('brace','Подкос конькового прогона',postProfile,[a[0],a[1],lowerZ],lower(mix(a,b,1/3),edge));
        add('brace','Подкос конькового прогона',postProfile,[b[0],b[1],lowerZ],lower(mix(a,b,2/3),edge));
      }
    }
  }
  for (const edge of edges.filter(edge=>edge.kind==='hip'||edge.kind==='valley')) {
    postAt(edge.a[2]>edge.b[2]?edge.a:edge.b,edge);
  }
  return result;
}
