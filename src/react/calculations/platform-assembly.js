import { normalizeTerracePlatform } from '../../calculations/terrace-model.js';
import { roofAt, roofHeight } from './roof-project.js';

const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]];

// Presentation of saved platforms, not a second material/strength calculation.
export function platformAssembly(project, calculation, roofModel) {
  if (!project.services.terrace) return [];
  return (project.plan.platforms||[]).filter(p=>p.include!==false&&p.w>0&&p.h>0).map((raw,index)=>{
    const p=normalizeTerracePlatform(raw),x=(Number(p.x)||0)*1000,y=(Number(p.y)||0)*1000,w=Number(p.w)*1000,h=Number(p.h)*1000;
    const result=calculation.roof?.terraceRoofs?.find(r=>r.platform.id===p.id)?.result;
    const count=Math.max(0,Math.min(200,Math.round(Number(p.steps)||0))),tread=(Number(p.tread)||.3)*1000,riser=(Number(p.riser)||.18)*1000;
    const deckZ=p.deckHeightMm!==''&&p.deckHeightMm!=null&&Number.isFinite(Number(p.deckHeightMm))?Number(p.deckHeightMm):0;
    const side=p.stairSide||'bottom',vertical=['left','right'].includes(side),width=Math.min((Number(p.stairWidth)||1.2)*1000,vertical?h:w);
    const steps=Array.from({length:count},(_,i)=>{
      const distance=i*tread,ring=side==='left'?rect(x-distance-tread,y+(h-width)/2,tread,width):side==='right'?rect(x+w+distance,y+(h-width)/2,tread,width):side==='top'?rect(x+(w-width)/2,y-distance-tread,width,tread):rect(x+(w-width)/2,y+h+distance,width,tread);
      return {id:`platform:${p.id}:step:${i+1}`,ring,z:deckZ-(i+1)*riser,thickness:45};
    });
    const faces=(roofModel?.faces||[]).filter(f=>f.group===`terrace:${p.id}`),posts=[],ties=[];
    if(result?.postCount&&faces.length){
      const n=Math.min(500,result.postCount),attached=result.side;
      for(let i=0;i<n;i++){
        const t=n===1?.5:i/(n-1),pos=attached==='left'?[x,y+h*t]:attached==='right'?[x+w,y+h*t]:attached==='top'?[x+w*t,y]:[x+w*t,y+h];
        const face=roofAt({faces},...pos)[0]?.face;if(!face)continue;
        const z=roofHeight(face,...pos);if(z<=deckZ)continue;
        posts.push({id:`platform:${p.id}:post:${i+1}`,a:[...pos,deckZ],b:[...pos,z],profile:result.postSection.replace('x','×'),layer:'platforms',referenceOnly:true});
      }
      // The terrace wall plate follows the lowest eave bearing of these posts.
      // A gable roof has taller ridge posts, but the tie must stay level.
      const plateTopZ=Math.min(...posts.map(post=>post.b[2]));
      const plateZ=plateTopZ-Number(result.postSection.split('x')[1])/2;
      for(let i=1;i<posts.length;i++)ties.push({id:`platform:${p.id}:tie:${i}`,a:[...posts[i-1].b.slice(0,2),plateZ],b:[...posts[i].b.slice(0,2),plateZ],profile:result.postSection.replace('x','×'),layer:'platforms',referenceOnly:true,name:'Стяжка по уровню мауэрлата террасы',plateTopZ});
    }
    return {id:p.id,name:p.name||(p.kind==='porch'?'Крыльцо':'Терраса')+` ${index+1}`,kind:p.kind,contour:rect(x,y,w,h),deckZ,thickness:45,steps,faces,posts,ties,
      foundationMode:p.foundation.mode,bindingMode:p.binding.mode,referenceOnly:true};
  });
}

export function assemblyPlatformView(assembly, include=true) {
  if(include)return assembly;
  const keep=assembly.piles.map((p,i)=>({p,source:assembly.pileSources?.[i]})).filter(p=>p.source!=='platform');
  const platformFaces=new Set((assembly.platforms||[]).flatMap(p=>p.faces.map(f=>f.id)));
  return {...assembly,platforms:[],binding:assembly.binding.filter(m=>m.group!=='platform'),piles:keep.map(p=>p.p),pileSources:keep.map(p=>p.source),rafters:assembly.rafters.filter(m=>!platformFaces.has(m.faceId)),roofTimbers:assembly.roofTimbers.filter(m=>!platformFaces.has(m.faceId)),laths:assembly.laths.filter(m=>!platformFaces.has(m.faceId)),counterLaths:assembly.counterLaths.filter(m=>!platformFaces.has(m.faceId)),roofModel:assembly.roofModel?{...assembly.roofModel,faces:assembly.roofModel.faces.filter(f=>!platformFaces.has(f.id))}:assembly.roofModel};
}
