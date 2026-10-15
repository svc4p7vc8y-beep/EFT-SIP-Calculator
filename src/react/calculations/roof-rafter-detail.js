const degrees=radians=>radians*180/Math.PI;
const distanceToSegment=(point,a,b)=>{
 const v=b.map((value,i)=>value-a[i]),length2=v.reduce((sum,value)=>sum+value*value,0),t=length2?Math.max(0,Math.min(1,v.reduce((sum,value,i)=>sum+value*(point[i]-a[i]),0)/length2)):0;
 return Math.hypot(...point.map((value,i)=>value-a[i]-t*v[i]));
};
const sectionVolume=(profile,lengthMm)=>{
 const parts=String(profile).split(/[×xх]/).map(Number);
 return parts.length===2&&parts.every(value=>Number.isFinite(value)&&value>0)?parts[0]*parts[1]*lengthMm/1e9:null;
};

export function roofMemberGeometry(a,b,profile){
 const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],planLengthMm=Math.hypot(dx,dy),lengthMm=Math.hypot(dx,dy,dz);
 const slopeDeg=degrees(Math.atan2(Math.abs(dz),planLengthMm));
 return {planLengthMm,lengthMm,planAzimuthDeg:degrees(Math.atan2(dy,dx)),slopeDeg,plumbCutDeg:90-slopeDeg,volumeM3:sectionVolume(profile,lengthMm)};
}

export function roofRafterDetail(model,a,b,profile){
 const at=point=>model.edges.filter(edge=>distanceToSegment(point,edge.a,edge.b)<1).map(edge=>({id:edge.id,kind:edge.kind}));
 const endA=at(a),endB=at(b),kinds=[...endA,...endB].map(edge=>edge.kind);
 return {...roofMemberGeometry(a,b,profile),rafterKind:kinds.some(kind=>kind==='hip'||kind==='valley')?'jack':'common',endA,endB,compoundCutRequired:kinds.some(kind=>kind==='hip'||kind==='valley')};
}
