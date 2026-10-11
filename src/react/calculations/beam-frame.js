// Orthonormal model-space axes: board thickness across the plan, depth on edge.
export function beamFrame(a,b,normal=[0,0,1]) {
  const delta=b.map((v,i)=>v-a[i]),length=Math.hypot(...delta);
  if(!Number.isFinite(length)||length<=0)return null;
  const along=delta.map(n=>n/length),crossWith=n=>[n[1]*along[2]-n[2]*along[1],n[2]*along[0]-n[0]*along[2],n[0]*along[1]-n[1]*along[0]];
  let cross=crossWith(normal),size=Math.hypot(...cross);
  if(size<=1e-8){const axis=along.map(Math.abs).indexOf(Math.min(...along.map(Math.abs)));cross=crossWith([0,1,2].map(i=>i===axis?1:0));size=Math.hypot(...cross);}
  const across=cross.map(n=>n/size);
  const depth=[across[1]*along[2]-across[2]*along[1],across[2]*along[0]-across[0]*along[2],across[0]*along[1]-across[1]*along[0]];
  return {along,across,depth,length};
}
