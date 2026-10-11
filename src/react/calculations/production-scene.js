import { exteriorHeight } from '../../calculations/floor-height.js';
import { gableLinks, drawingCategory } from './drawing-workbench.js';
import { roofAxonometricLines } from './roof-drawings.js';
import { boardFootprint } from './partition-geometry.js';
import { productionLevels } from './production-levels.js';
import { rafterEndOutline } from './rafter-end-cuts.js';
import { bindingPlanRows } from './binding-rows.js';

// Millimetres, right-handed model coordinates X/Y = plan, Z = height.
// This adapter only places existing production geometry; it never creates stock.
export function productionScene(report,project) {
  const {plans,bases,roofBase:defaultRoofBase}=productionLevels(project,report.assembly.floors.length),roofBase=report.assembly.roofDrawing?.model?report.assembly.roofModel.roofBase:defaultRoofBase;
  const links=gableLinks(report,report.settings.gableLinks),placements=new Map(),missing=[];
  for(const s of report.surfaces){
    const category=drawingCategory(s),base=bases[(s.floor||1)-1]||0;
    if(s.roofPlacement)placements.set(s.id,{...s.roofPlacement,layer:'roof'});
    else if(s.planStart){const dx=s.planEnd[0]-s.planStart[0],dy=s.planEnd[1]-s.planStart[1],l=Math.hypot(dx,dy)||1;placements.set(s.id,{origin:[...s.planStart,base],u:[dx/l,dy/l,0],v:[0,0,1],normal:[dy/l,-dx/l,0],layer:category});}
    else if(category==='gables'){const link=links.find(l=>l.gable.id===s.id),wall=link?.wall,p=wall&&placements.get(wall.id);if(p){const offset=(link.offset||0)+(link.reverse?s.width:0),elevation=link.elevation||0;placements.set(s.id,{...p,origin:p.origin.map((n,i)=>n+p.u[i]*offset+p.v[i]*elevation),u:link.reverse?p.u.map(n=>-n):p.u,layer:'gables'});}else missing.push(s.id);}
    // Wall/partition datum is the top face of the floor, not its mid-plane.
    else if(category==='floor'||category==='ceiling')placements.set(s.id,{origin:[0,0,base+(category==='ceiling'?exteriorHeight(plans[(s.floor||1)-1],project.settings.sip)*1000:-Number(s.thickness)/2)],u:[1,0,0],v:[0,1,0],normal:[0,0,1],layer:category});
    else if(category==='roof'&&report.assembly.roofShape==='gable'&&/^КР-С[12]$/.test(s.id)){
      const a=report.assembly,axis=a.axis==='x',g=a.roofGeometry||{},span=axis?a.bounds.height:a.bounds.width,eave=Number(g.eaveOverhang||0)*1000,overhang=Number(g.gableOverhang||0)*1000,rise=Number(project.settings.roof.ridgeHeight||0)*1000,angle=Math.atan2(rise,span/2),second=s.id.endsWith('2'),sign=second?-1:1;
      const origin=axis?[a.bounds.x-overhang,a.bounds.y+(second?span+eave:-eave),roofBase-eave*Math.tan(angle)]:[a.bounds.x+(second?span+eave:-eave),a.bounds.y-overhang,roofBase-eave*Math.tan(angle)];
      placements.set(s.id,{origin,u:axis?[1,0,0]:[0,1,0],v:axis?[0,sign*Math.cos(angle),Math.sin(angle)]:[sign*Math.cos(angle),0,Math.sin(angle)],normal:axis?[0,-sign*Math.sin(angle),Math.cos(angle)]:[-sign*Math.sin(angle),0,Math.cos(angle)],layer:'roof'});
    }else if(category==='roof')missing.push(s.id);
  }
  const world=(p,x,y)=>p.origin.map((n,i)=>n+p.u[i]*x+p.v[i]*y);
  const panels=report.parts.flatMap(part=>{const p=placements.get(part.surfaceId);return p?[{id:part.id,layer:p.layer,shape:part.shape,placement:p,thickness:part.thickness}]:[];});
  const boards=report.members.filter(m=>!m.excluded&&!m.worldA&&m.a&&m.b).flatMap(m=>{const p=placements.get(m.surfaceId);if(!p)return [];const outline=boardFootprint(m);return outline?[{id:m.id,layer:p.layer,shape:[outline],placement:p,thickness:Number(m.profile?.split(/[×xх]/)[m.role==='brace'?0:1])||45,timber:true}]:[];});
  const binding=report.assembly.binding.flatMap(m=>{
    const depth=Number(String(m.profile).split(/[×xх]/)[1])||150,z=-Number(project.settings.sip.floorThickness)-depth/2;
    return bindingPlanRows(m).map(row=>({...row,layer:'binding',a:[...row.a,z],b:[...row.b,z]}));
  });
  const assembly=report.assembly,d=assembly.roofDrawing;
  const height=(p,name)=>{const s=d?.sections.find(s=>s.name===name)||d?.sections.find(s=>{const x=p[d.across]-d.origin[d.across];return x>=Math.min(s.a[0],s.b[0])-.1&&x<=Math.max(s.a[0],s.b[0])+.1;});if(!s)return null;const x=p[d.across]-d.origin[d.across];return s.a[1]+(s.b[1]-s.a[1])*(x-s.a[0])/(s.b[0]-s.a[0]);};
  const detail=(m,layer)=>{
    if(m.worldA){const normal=m.normal||[0,0,1],profile=String(m.profile).split(/[×xх]/).map(Number),rafter=assembly.rafters.find(r=>r.faceId===m.faceId),rd=Number(String(rafter?.profile).split(/[×xх]/)[1])||0,cd=Number(String(assembly.counterLaths.find(r=>r.faceId===m.faceId)?.profile).split(/[×xх]/)[1])||0,offset=layer==='laths'?rd/2+cd+profile[0]/2:layer==='counterLaths'?rd/2+profile[1]/2:0;return [{...m,layer,flat:layer==='laths',normal,a:m.worldA.map((x,i)=>x+normal[i]*offset),b:m.worldB.map((x,i)=>x+normal[i]*offset)}];}
    // Existing ridge rows have no chord heights: do not draw two coincident boards as a truss.
    if(layer==='roofTimbers'&&m.material?.startsWith('Коньковая')){missing.push(m.id);return [];}
    const za=height(m.a,m.name),zb=height(m.b,m.name);if(za==null||zb==null){missing.push(m.id);return [];}
    const section=d.sections.find(s=>s.name===m.name),normal=[0,0,1];
    if(section)normal[d.across]=-(section.b[1]-section.a[1])/(section.b[0]-section.a[0]);
    const size=Math.hypot(...normal),unit=normal.map(n=>n/size),profile=String(m.profile).split(/[×xх]/).map(Number);
    const rafter=assembly.rafters.find(r=>r.name===m.name),rafterDepth=Number(String(rafter?.profile).split(/[×xх]/)[1])||0;
    const counter=assembly.counterLaths?.find(r=>r.name===m.name),counterDepth=Number(String(counter?.profile).split(/[×xх]/)[1])||0;
    // Place existing sections face-to-face; neither stock nor roof quantities change.
    const offset=layer==='laths'?rafterDepth/2+counterDepth+profile[0]/2:layer==='counterLaths'?rafterDepth/2+profile[1]/2:0;
    const at=(p,z)=>[...p.slice(0,2),roofBase+z].map((n,i)=>n+unit[i]*offset);
    return [{...m,layer,flat:layer==='laths',normal,a:at(m.a,za),b:at(m.b,zb)}];
  };
  const beams=[...roofAxonometricLines(assembly).map(m=>({...m,layer:'rafters',endCutOutline:report.settings.rafterEndCuts?rafterEndOutline(m.a,m.b,Number(m.profile.split(/[×xх]/)[1]))?.outline:null,a:[m.a[0],m.a[1],m.a[2]+roofBase],b:[m.b[0],m.b[1],m.b[2]+roofBase]})),
    ...(assembly.roofTimbers||[]).filter(m=>!m.excluded).flatMap(m=>detail(m,'roofTimbers')),...(assembly.laths||[]).filter(m=>!m.excluded).flatMap(m=>detail(m,'laths')),...(assembly.counterLaths||[]).filter(m=>!m.excluded).flatMap(m=>detail(m,'counterLaths')),
    ...assembly.supports.filter(m=>!m.referenceOnly).map(m=>({...m,id:m.mark,layer:'supports'})),...binding];
  return {panels:[...panels,...boards],beams,missing,world,roofBase,bases,placements};
}
