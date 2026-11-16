export function normalizeRailings(value){
 return Array.isArray(value)?value.filter(r=>r&&typeof r.id==='string'&&[r.a,r.b].every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<1000))&&Math.hypot(r.a[0]-r.b[0],r.a[1]-r.b[1])>.05).slice(0,200).map(r=>({...r,a:[...r.a],b:[...r.b],enabled:r.enabled!==false})):[];
}
