import {roofLocal,roofWorld} from './roof-project.js';

const distance=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));
const pointOnSegment=(p,a,b,tolerance=2)=>{
  const d=b.map((n,i)=>n-a[i]),length2=d.reduce((s,n)=>s+n*n,0);
  if(!length2)return false;
  const t=d.reduce((s,n,i)=>s+n*(p[i]-a[i]),0)/length2;
  return t>=-.001&&t<=1.001&&distance(p,a.map((n,i)=>n+t*d[i]))<=tolerance;
};

export function roofGeometrySignature(model){
  const payload=JSON.stringify((model?.faces||[]).map(face=>[face.id,face.vertices.map(point=>point.map(Math.round))]));
  let hash=2166136261;
  for(let i=0;i<payload.length;i++)hash=Math.imul(hash^payload.charCodeAt(i),16777619);
  return `${model?.faces?.length||0}:${(hash>>>0).toString(16)}`;
}

// A read-only index over the same XYZ facets and saved production members.
// It never creates a second roof or changes estimate quantities.
export function roofDetailing(report){
  const model=report.assembly.roofModel,faces=new Map(model.faces.map(face=>[face.id,{...face,parts:[],members:[],supports:[],edges:[],features:[]}]));
  for(const edge of model.edges)for(const id of edge.faces||[])faces.get(id)?.edges.push(edge);
  for(const part of report.parts||[])faces.get(part.surfaceId)?.parts.push(part);
  for(const member of report.members||[])faces.get(member.faceId||member.surfaceId)?.members.push(member);
  for(const support of report.assembly.supports||[]){
    for(const face of faces.values())if(support.faceId===face.id||[support.a,support.b].some(point=>point?.length===3&&pointOnFace(point,face)))face.supports.push(support);
  }
  for(const feature of report.settings.roofDesign?.features||[])faces.get(feature.faceId)?.features.push(feature);
  return {revision:report.revision,model,faces:[...faces.values()],byId:faces};
}

function pointOnFace(point,face){
  const local=roofLocal(face,point),polygon=face.polygon;
  if(Math.abs(local[0])>1e7||Math.abs(local[1])>1e7)return false;
  if(Math.abs(point[2]-roofWorld(face,local)[2])>100)return false;
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if(pointOnSegment(local,a,b))return true;
    if((a[1]>local[1])!==(b[1]>local[1])&&local[0]<(b[0]-a[0])*(local[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
