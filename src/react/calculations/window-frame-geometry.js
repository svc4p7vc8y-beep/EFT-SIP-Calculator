// Convex window outlines: a constant normal offset, never a scale about the centre.
export function insetWindowRing(input,distance){
 const ring=input.filter((p,i)=>!i||p[0]!==input[i-1][0]||p[1]!==input[i-1][1]);if(ring.length>1&&ring[0][0]===ring.at(-1)[0]&&ring[0][1]===ring.at(-1)[1])ring.pop();if(ring.length<3)return [];
 const area=ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p[0]*q[1]-q[0]*p[1];},0),sign=area>=0?1:-1;
 const lines=ring.map((p,i)=>{const q=ring[(i+1)%ring.length],d=[q[0]-p[0],q[1]-p[1]],l=Math.hypot(...d),n=[-sign*d[1]/l,sign*d[0]/l];return {p:[p[0]+n[0]*distance,p[1]+n[1]*distance],d,n,origin:p};});
 const result=lines.map((line,i)=>{const prev=lines[(i+lines.length-1)%lines.length],cross=prev.d[0]*line.d[1]-prev.d[1]*line.d[0];if(Math.abs(cross)<1e-8)return line.p;const v=[line.p[0]-prev.p[0],line.p[1]-prev.p[1]],t=(v[0]*line.d[1]-v[1]*line.d[0])/cross;return [prev.p[0]+prev.d[0]*t,prev.p[1]+prev.d[1]*t];});
 return result.every(p=>p.every(Number.isFinite)&&lines.every(l=>(p[0]-l.origin[0])*l.n[0]+(p[1]-l.origin[1])*l.n[1]>=distance-.001))?result:[];
}
