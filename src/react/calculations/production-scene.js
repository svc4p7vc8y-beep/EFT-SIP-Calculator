import { exteriorHeight } from '../../calculations/floor-height.js';
import { gableLinks, drawingCategory } from './drawing-workbench.js';
import { roofAxonometricLines } from './roof-drawings.js';
import { boardFootprint } from './partition-geometry.js';
import { productionLevels } from './production-levels.js';

// Millimetres, right-handed model coordinates X/Y = plan, Z = height.
// This adapter only places existing production geometry; it never creates stock.
export function productionScene(report,project) {
  const {plans,bases,roofBase}=productionLevels(project,report.assembly.floors.length);
  const links=gableLinks(report,report.settings.gableLinks),placements=new Map(),missing=[];
  for(const s of report.surfaces){
    const category=drawingCategory(s),base=bases[(s.floor||1)-1]||0;
    if(s.planStart){const dx=s.planEnd[0]-s.planStart[0],dy=s.planEnd[1]-s.planStart[1],l=Math.hypot(dx,dy)||1;placements.set(s.id,{origin:[...s.planStart,base],u:[dx/l,dy/l,0],v:[0,0,1],normal:[dy/l,-dx/l,0],layer:category});}
    else if(category==='gables'){const link=links.find(l=>l.gable.id===s.id),wall=link?.wall,p=wall&&placements.get(wall.id);if(p){const offset=(link.offset||0)+(link.reverse?s.width:0),elevation=link.elevation||0;placements.set(s.id,{...p,origin:p.origin.map((n,i)=>n+p.u[i]*offset+p.v[i]*elevation),u:link.reverse?p.u.map(n=>-n):p.u,layer:'gables'});}else missing.push(s.id);}
    else if(category==='floor'||category==='ceiling')placements.set(s.id,{origin:[0,0,base+(category==='ceiling'?exteriorHeight(plans[(s.floor||1)-1],project.settings.sip)*1000:0)],u:[1,0,0],v:[0,1,0],normal:[0,0,1],layer:category});
    else if(category==='roof'&&report.assembly.roofShape==='gable'&&/^КР-С[12]$/.test(s.id)){
      const a=report.assembly,axis=a.axis==='x',g=a.roofGeometry||{},span=axis?a.bounds.height:a.bounds.width,eave=Number(g.eaveOverhang||0)*1000,overhang=Number(g.gableOverhang||0)*1000,rise=Number(project.settings.roof.ridgeHeight||0)*1000,angle=Math.atan2(rise,span/2),second=s.id.endsWith('2'),sign=second?-1:1;
      const origin=axis?[a.bounds.x-overhang,a.bounds.y+(second?span+eave:-eave),roofBase-eave*Math.tan(angle)]:[a.bounds.x+(second?span+eave:-eave),a.bounds.y-overhang,roofBase-eave*Math.tan(angle)];
      placements.set(s.id,{origin,u:axis?[1,0,0]:[0,1,0],v:axis?[0,sign*Math.cos(angle),Math.sin(angle)]:[sign*Math.cos(angle),0,Math.sin(angle)],normal:axis?[0,-sign*Math.sin(angle),Math.cos(angle)]:[-sign*Math.sin(angle),0,Math.cos(angle)],layer:'roof'});
    }else if(category==='roof')missing.push(s.id);
  }
  const world=(p,x,y)=>p.origin.map((n,i)=>n+p.u[i]*x+p.v[i]*y);
  const panels=report.parts.flatMap(part=>{const p=placements.get(part.surfaceId);return p?[{id:part.id,layer:p.layer,shape:part.shape,placement:p,thickness:part.thickness}]:[];});
  const boards=report.members.filter(m=>!m.excluded&&m.a&&m.b).flatMap(m=>{const p=placements.get(m.surfaceId);if(!p)return [];const outline=boardFootprint(m);return outline?[{id:m.id,layer:p.layer,shape:[outline],placement:p,thickness:Number(m.profile?.split(/[×xх]/)[m.role==='brace'?0:1])||45,timber:true}]:[];});
  const binding=report.assembly.binding.flatMap(m=>{
    const width=Number(String(m.profile).split(/[×xх]/)[0])||50,n=Number.isInteger(m.layers)&&m.layers>0?m.layers:1;
    const dx=m.b[0]-m.a[0],dy=m.b[1]-m.a[1],length=Math.hypot(dx,dy)||1;
    return Array.from({length:n},(_,i)=>{const offset=(i-(n-1)/2)*width;return {...m,layer:'binding',a:[m.a[0]-dy/length*offset,m.a[1]+dx/length*offset,-150],b:[m.b[0]-dy/length*offset,m.b[1]+dx/length*offset,-150]};});
  });
  const beams=[...roofAxonometricLines(report.assembly).map(m=>({...m,layer:'roof',a:[m.a[0],m.a[1],m.a[2]+roofBase],b:[m.b[0],m.b[1],m.b[2]+roofBase]})),...report.assembly.supports.filter(m=>!m.referenceOnly).map(m=>({...m,id:m.mark,layer:'supports'})),...binding];
  return {panels:[...panels,...boards],beams,missing,world,roofBase,bases,placements};
}
