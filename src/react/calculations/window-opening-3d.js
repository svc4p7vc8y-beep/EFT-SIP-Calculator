import clipping from 'polygon-clipping';
import {openingSymbolPolylines} from '../state/window-opening-symbol.js';
import {sectionWidths} from '../state/window-products.js';
// Display-only geometry. Symbols use the same inside-view convention as the window sketch.
export function windowOpeningOverlays({product,outer,envelope,face,id}){
 if(!product?.sections?.length)return [];
 const points=outer.flat(),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;
 const horizontal=product.sectionAxis==='horizontal',sizes=sectionWidths(product),total=sizes.reduce((a,b)=>a+b,0);if(!(total>0&&w>0&&h>0))return [];
 const result=[],rect=(l,b,r,t)=>[[[l,b],[r,b],[r,t],[l,t]]];let cursor=0;
 for(const [i,section] of product.sections.entries()){
  const start=cursor/total;cursor+=sizes[i];const end=cursor/total,mode=section.openingMode||'fixed';if(mode==='fixed')continue;
  const l=x+(horizontal?0:w*start),r=x+(horizontal?w:w*end),b=y+(horizontal?h*(1-end):0),t=y+(horizontal?h*(1-start):h),margin=Math.min(85,(r-l)/5,(t-b)/5),bounds={left:l+margin,right:r-margin,bottom:b+margin,top:t-margin};
  const shapes=[];
  for(const line of openingSymbolPolylines(mode,bounds))for(let j=1;j<line.length;j++){
   const a=line[j-1],z=line[j],dx=z[0]-a[0],dy=z[1]-a[1],len=Math.hypot(dx,dy);if(!len)continue;const width=Math.max(6,Math.min(12,(r-l)/70)),nx=-dy/len*width/2,ny=dx/len*width/2;
   shapes.push({kind:'symbol',shape:[[[a[0]+nx,a[1]+ny],[z[0]+nx,z[1]+ny],[z[0]-nx,z[1]-ny],[a[0]-nx,a[1]-ny]]]});
  }
  const left=mode.endsWith('_left'),right=mode.endsWith('_right');
  if(left||right){const hx=left?r-margin:l+margin,hy=mode.startsWith('door_')?Math.min(t-margin,b+1050):(b+t)/2;shapes.push({kind:'handle',shape:rect(hx-9,hy-45,hx+9,hy+45)});}
  else if(mode==='tilt'||mode==='bottom_hinged_transom')shapes.push({kind:'handle',shape:rect((l+r)/2-40,t-margin-8,(l+r)/2+40,t-margin+8)});
  for(const side of [-1,1])for(const [j,part] of shapes.entries())for(const [k,shape] of clipping.intersection(part.shape,outer,envelope).entries())result.push({id:`${id}:opening:${i}:${side}:${j}:${k}`,layer:'windows',shape,placement:{...face,origin:face.origin.map((v,n)=>v+face.normal[n]*side*23)},thickness:3,referenceOnly:true,windowOpeningMark:true,windowHandle:part.kind==='handle',visualColor:part.kind==='handle'?'#3c4145':'#174c60'});
 }
 return result;
}
