export const OVERHANG_FIELDS = [
  ['overhangFrontM','Торцевой свес · передний','gableOverhang'],
  ['overhangBackM','Торцевой свес · задний','gableOverhang'],
  ['overhangFirstM','Карнизный свес · первый скат','eaveOverhang'],
  ['overhangSecondM','Карнизный свес · второй скат','eaveOverhang'],
];
export const hasSeparateOverhangs=roof=>OVERHANG_FIELDS.some(([key])=>roof[key]!==null&&roof[key]!==undefined&&roof[key]!==''&&Number.isFinite(Number(roof[key])));
export function roofOverhangValue(roof,key,fallback){return Math.max(0,Math.min(2,Number(roof[key]??roof[fallback])||0));}
export function overhangEdgeOverrides(points,axis,roof,scale=1){
  if(!hasSeparateOverhangs(roof))return undefined;
  const area=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y;},0),sign=area>=0?1:-1;
  return points.map((a,i)=>{const b=points[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y,nx=sign*dy,ny=-sign*dx;
    const along=axis==='x'?nx:ny,across=axis==='x'?ny:nx;
    const key=Math.abs(along)>Math.abs(across)?along<0?'overhangFrontM':'overhangBackM':across<0?'overhangFirstM':'overhangSecondM';
    return roof[key]===null||roof[key]===undefined||roof[key]===''?undefined:roofOverhangValue(roof,key,Math.abs(along)>Math.abs(across)?'gableOverhang':'eaveOverhang')*scale;
  });
}
export function resetSeparateOverhangs(roof,key){for(const [field,,fallback] of OVERHANG_FIELDS)if(fallback===key)delete roof[field];}

export function convexEdgeOverhang(a,b,axis,roof){
 const nx=b[1]-a[1],ny=a[0]-b[0],along=axis==='x'?nx:ny,across=axis==='x'?ny:nx;
 const field=Math.abs(along)>Math.abs(across)?along<0?'overhangFrontM':'overhangBackM':across<0?'overhangFirstM':'overhangSecondM';
 return roof[field]==null?undefined:roofOverhangValue(roof,field,Math.abs(along)>Math.abs(across)?'gableOverhang':'eaveOverhang')*1000;
}
