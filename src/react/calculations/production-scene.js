import { exteriorHeight } from '../../calculations/floor-height.js';
import { gableLinks, drawingCategory } from './drawing-workbench.js';
import { roofAxonometricLines } from './roof-drawings.js';
import { boardSectionLayers,framingDepth,framingNormalOffset,spatialNotches } from './partition-geometry.js';
import { productionLevels } from './production-levels.js';
import { rafterEndOutline } from './rafter-end-cuts.js';
import { bindingPlanRows } from './binding-rows.js';
import {foundationGeometry} from './foundation-geometry.js';
import { structuralFlatRoofRise } from './roof-wall-plate.js';
import { flatRoofParapetRuns } from './flat-roof-assembly.js';
import { clipFlatRoofBeam, flatRoofDisplayContour, flatRoofLocalContour, flatRoofPlaneZ } from './flat-roof-visual.js';
import {sectionWidths} from '../state/window-products.js';

// Millimetres, right-handed model coordinates X/Y = plan, Z = height.
// This adapter only places existing production geometry; it never creates stock.
export function productionScene(report,project,{includePlatforms=report.settings.showPlatforms!==false}={}) {
  const {plans,bases,roofBase:defaultRoofBase}=productionLevels(project,report.assembly.floors.length),roofBase=report.assembly.roofModel?.roofBase??defaultRoofBase;
  const roofContext={roof:{mainRoofShape:report.assembly.roofShape,flatSlopeMode:project.settings.roof.flatSlopeMode,ridgeAxis:report.assembly.axis,flatSlopeDirection:project.settings.roof.flatSlopeDirection}};
  const roofRise=(x,y)=>structuralFlatRoofRise(project,roofContext,report.assembly.bounds,[x,y]);
  const links=gableLinks(report,report.settings.gableLinks),placements=new Map(),missing=[];
  const wallPlacement=(s,base,layer)=>{
    const dx=s.planEnd[0]-s.planStart[0],dy=s.planEnd[1]-s.planStart[1],l=Math.hypot(dx,dy)||1;
    const contour=report.assembly.floors[(s.floor||1)-1]?.contour||[],area=contour.reduce((v,p,i)=>{const q=contour[(i+1)%contour.length];return v+p[0]*q[1]-p[1]*q[0];},0),sign=s.exterior&&area<0?-1:1;
    const normal=[sign*dy/l,-sign*dx/l,0],inset=s.exterior?Number(s.thickness)/2:0;
    return {origin:[s.planStart[0]-normal[0]*inset,s.planStart[1]-normal[1]*inset,base],u:[dx/l,dy/l,0],v:[0,0,1],normal,layer};
  };
  for(const s of report.surfaces){
    const category=drawingCategory(s),base=bases[(s.floor||1)-1]||0;
    if(s.roofPlacement)placements.set(s.id,{...s.roofPlacement,layer:'roof'});
    else if(s.planStart)placements.set(s.id,wallPlacement(s,base,category));
    else if(category==='gables'){const link=links.find(l=>l.gable.id===s.id),wall=link?.wall,p=wall&&placements.get(wall.id);if(p){const offset=(link.offset||0)+(link.reverse?s.width:0),elevation=link.elevation||0;placements.set(s.id,{...p,origin:p.origin.map((n,i)=>n+p.u[i]*offset+p.v[i]*elevation),u:link.reverse?p.u.map(n=>-n):p.u,layer:'gables'});}else if(s.gableAnchor&&!report.settings.gableLinks[s.layoutKey])placements.set(s.id,wallPlacement(s.gableAnchor,s.gableAnchor.elevation,'gables'));else missing.push(s.id);}
    // Wall/partition datum is the top face of the floor, not its mid-plane.
    else if(category==='floor'||category==='ceiling'){
      const sloped=category==='ceiling'&&s.floor===plans.length&&project.settings.roof.flatSlopeMode==='structural'&&report.assembly.roofShape==='flat';
      const dx=sloped?roofRise(1,0)-roofRise(0,0):0,dy=sloped?roofRise(0,1)-roofRise(0,0):0;
      const length=Math.hypot(dx,dy,1);
      placements.set(s.id,{origin:[0,0,base+(category==='ceiling'?exteriorHeight(plans[(s.floor||1)-1],project.settings.sip)*1000+Number(s.thickness)/2+(sloped?roofRise(0,0):0):-Number(s.thickness)/2)],u:[1,0,dx],v:[0,1,dy],normal:[-dx/length,-dy/length,1/length],layer:category==='floor'&&s.floor>1?'interfloor':category});
    }
    else if(category==='roof'&&report.assembly.roofShape==='gable'&&/^КР-С[12]$/.test(s.id)){
      const a=report.assembly,axis=a.axis==='x',g=a.roofGeometry||{},span=axis?a.bounds.height:a.bounds.width,eave=Number(g.eaveOverhang||0)*1000,overhang=Number(g.gableOverhang||0)*1000,rise=Number(project.settings.roof.ridgeHeight||0)*1000,angle=Math.atan2(rise,span/2),second=s.id.endsWith('2'),sign=second?-1:1;
      const origin=axis?[a.bounds.x-overhang,a.bounds.y+(second?span+eave:-eave),roofBase-eave*Math.tan(angle)]:[a.bounds.x+(second?span+eave:-eave),a.bounds.y-overhang,roofBase-eave*Math.tan(angle)];
      placements.set(s.id,{origin,u:axis?[1,0,0]:[0,1,0],v:axis?[0,sign*Math.cos(angle),Math.sin(angle)]:[sign*Math.cos(angle),0,Math.sin(angle)],normal:axis?[0,-sign*Math.sin(angle),Math.cos(angle)]:[-sign*Math.sin(angle),0,Math.cos(angle)],layer:'roof'});
    }else if(category==='roof')missing.push(s.id);
  }
  const world=(p,x,y)=>p.origin.map((n,i)=>n+p.u[i]*x+p.v[i]*y);
  const roofFaces=new Map(report.surfaces.map(s=>[s.id,s.roofFaceId]));
  const panels=report.parts.flatMap(part=>{const p=placements.get(part.surfaceId);return p?[{id:part.id,surfaceId:part.surfaceId,faceId:roofFaces.get(part.surfaceId),layer:p.layer,shape:part.shape,placement:p,thickness:part.thickness}]:[];});
  const windowProducts=new Map((project.windowProducts||[]).filter(product=>product.openingId).map(product=>[product.openingId,product]));
  const windowPanels=report.surfaces.flatMap(surface=>{
    const wall=placements.get(surface.id);
    if(!wall||surface.blocked||!['walls','partitions'].includes(wall.layer))return [];
    const face={...wall,origin:wall.origin.map((value,index)=>value+wall.normal[index]*(Number(surface.thickness)/2+5))};
    return (surface.openings||[]).filter(opening=>opening.type==='window'&&!opening.gap).flatMap(opening=>{
      const x=Number(opening.x),y=Number(opening.sill),width=Number(opening.width),height=Number(opening.height),border=Math.min(45,width/8,height/8);
      if(![x,y,width,height].every(Number.isFinite)||width<=0||height<=0)return [];
      const rect=(left,bottom,right,top)=>[[[left,bottom],[right,bottom],[right,top],[left,top]]];
      const id=`window:${opening.id}`;
      const glass={id,layer:'windows',shape:rect(x+border,y+border,x+width-border,y+height-border),placement:face,thickness:6,referenceOnly:true,windowGlass:true};
      const frame=[[x,y,x+width,y+border],[x,y+height-border,x+width,y+height],[x,y+border,x+border,y+height-border],[x+width-border,y+border,x+width,y+height-border]].map(([left,bottom,right,top],index)=>({id:`${id}:frame:${index}`,layer:'windows',shape:rect(left,bottom,right,top),placement:face,thickness:35,referenceOnly:true,windowFrame:true}));
      const product=windowProducts.get(opening.id),sectionCount=product?.sections?.length||1;
      const span=product?.sectionAxis==='horizontal'?height:width;
      const divisions=sectionCount>1?sectionWidths(product).slice(0,-1).reduce((state,part)=>{state.total+=part;state.values.push(state.total/span);return state;},{total:0,values:[]}).values:[];
      const imposts=divisions.filter(ratio=>ratio>0&&ratio<1).map((ratio,index)=>product.sectionAxis==='horizontal'?{id:`${id}:impost:${index}`,layer:'windows',shape:rect(x+border,y+height*ratio-border/3,x+width-border,y+height*ratio+border/3),placement:face,thickness:35,referenceOnly:true,windowFrame:true}:{id:`${id}:impost:${index}`,layer:'windows',shape:rect(x+width*ratio-border/3,y+border,x+width*ratio+border/3,y+height-border),placement:face,thickness:35,referenceOnly:true,windowFrame:true});
      return [glass,...frame,...imposts];
    });
  });
  // Invalid manufacturing surfaces remain visible as warning previews, never
  // as fabricated panels or purchasable stock.
  const previews=report.surfaces.filter(s=>s.blocked&&placements.has(s.id)).flatMap(s=>s.geometry.map((shape,i)=>({id:`preview:${s.id}:${i}`,surfaceId:s.id,layer:placements.get(s.id).layer,shape,placement:placements.get(s.id),thickness:s.thickness,preview:true})));
  const surfaceMap=new Map(report.surfaces.map(s=>[s.id,s])),cutters=report.members.filter(m=>['brace','edge-board'].includes(m.role));
  const boards=report.members.filter(m=>!m.excluded&&!m.worldA&&m.a&&m.b).flatMap(m=>{const p=placements.get(m.surfaceId);if(!p)return [];const surface=surfaceMap.get(m.surfaceId),depth=framingDepth(m),offset=framingNormalOffset(m,surface),notches=spatialNotches(m,surface,cutters);
    return boardSectionLayers({...m,notches},depth).map((slice,i)=>({id:m.id,layer:p.layer,shape:slice.shape,placement:{...p,origin:p.origin.map((n,k)=>n+p.normal[k]*(offset+slice.normalOffsetMm))},thickness:slice.thickness,timber:true,notchContours:i===0?notches.filter(n=>!(Number(n.depthMm)>0)).flatMap(n=>n.shape.flat()):[],notchFaceOffsetMm:depth/2-slice.normalOffsetMm}));});
  const binding=report.assembly.binding.filter(m=>includePlatforms||m.group!=='platform').flatMap(m=>{
    const depth=Number(String(m.profile).split(/[×xх]/)[1])||150,z=-Number(project.settings.sip.floorThickness)-depth/2;
    return bindingPlanRows(m).map(row=>({...row,layer:'binding',a:[...row.a,z],b:[...row.b,z]}));
  });
  const assembly=report.assembly,d=assembly.roofDrawing;
  const flatFace=assembly.roofShape==='flat'?assembly.roofModel?.faces.find(face=>face.group==='main'):null;
  const height=(p,name)=>{if(flatFace)return flatRoofPlaneZ(flatFace,p)-roofBase;const s=d?.sections.find(s=>s.name===name)||d?.sections.find(s=>{const x=p[d.across]-d.origin[d.across];return x>=Math.min(s.a[0],s.b[0])-.1&&x<=Math.max(s.a[0],s.b[0])+.1;});if(!s)return null;const x=p[d.across]-d.origin[d.across];return s.a[1]+(s.b[1]-s.a[1])*(x-s.a[0])/(s.b[0]-s.a[0]);};
  const detail=(m,layer)=>{
    if(m.worldA){const normal=m.normal||[0,0,1],profile=String(m.profile).split(/[×xх]/).map(Number),rafter=assembly.rafters.find(r=>r.faceId===m.faceId),rd=Number(String(rafter?.profile).split(/[×xх]/)[1])||0,cd=Number(String(assembly.counterLaths.find(r=>r.faceId===m.faceId)?.profile).split(/[×xх]/)[1])||0,offset=layer==='laths'?rd/2+cd+profile[0]/2:layer==='counterLaths'?rd/2+profile[1]/2:0;return [{...m,layer,flat:m.flat||layer==='laths',normal,a:m.worldA.map((x,i)=>x+normal[i]*offset),b:m.worldB.map((x,i)=>x+normal[i]*offset)}];}
    // Existing ridge rows have no chord heights: do not draw two coincident boards as a truss.
    if(layer==='roofTimbers'&&m.material?.startsWith('Коньковая')){missing.push(m.id);return [];}
    const za=height(m.a,m.name),zb=height(m.b,m.name);if(za==null||zb==null){missing.push(m.id);return [];}
    const section=d.sections.find(s=>s.name===m.name),normal=[0,0,1];
    if(flatFace)normal.splice(0,3,...flatFace.normal);
    else if(section)normal[d.across]=-(section.b[1]-section.a[1])/(section.b[0]-section.a[0]);
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
    ...assembly.supports.filter(m=>!m.referenceOnly||m.trussTemplate).map(m=>({...m,id:m.mark,layer:m.trussTemplate?'trussTemplates':'supports'})),...binding];
  const bearingPoints=[...assembly.rafters,...(assembly.roofTimbers||[]).filter(item=>item.roofMemberKind==='hip'||item.roofMemberKind==='flat-frame-chord')]
    .filter(item=>!item.excluded&&item.bearingStatus==='geometry-only'&&item.bearingPoint)
    .map(item=>({id:item.id,mauerlatId:item.bearingMauerlatId,point:item.bearingPoint}));
  const platforms=includePlatforms?(assembly.platforms||[]):[];
  const coldRoofSurfaces=(assembly.roofModel?.faces||[]).filter(f=>f.group==='main'&&!panels.some(p=>p.faceId===f.id)).map(f=>({id:f.id,faceId:f.id,layer:'roofSurface',shape:[f.polygon],placement:{origin:f.origin,u:f.u,v:f.v,normal:f.normal},thickness:10,referenceOnly:true}));
  const flatRoof=project.settings.roof||{},flatFaces=assembly.roofModel?.faces.filter(face=>face.group==='main')||[];
  const contour=assembly.floors.at(-1)?.contour||[];
  const parapetRuns=assembly.roofShape==='flat'?flatRoofParapetRuns(contour,flatRoof):[];
  const displayContour=parapetRuns.length&&flatFaces.length===1&&!project.settings.productionCutting?.roofDesign?.manualFaces?.length
    ?flatRoofDisplayContour(contour,flatRoof,project.settings.sip.wallThickness):null;
  const deckIsOsb=flatRoof.flatDeckMaterial==='osb',deckLayers=Math.min(3,Math.max(1,Math.round(Number(flatRoof.flatDeckLayers??2))));
  const deckThickness=(deckIsOsb?(flatRoof.flatOsbThicknessMm===9?9:12):12)*deckLayers;
  const firstDepth=(items,index)=>Number(String(items?.[0]?.profile||'').split(/[×xх]/)[index])||0;
  const flatLathTop=face=>assembly.laths?.length?firstDepth(assembly.rafters,1)/2+firstDepth(assembly.counterLaths,1)+firstDepth(assembly.laths,0):Number(face.thickness||0)/2+25;
  const flatLathBeams=assembly.roofShape==='flat'&&flatRoof.flatCoverSystem==='bitumen'&&flatRoof.includeCovering!==false&&!assembly.laths?.length?flatFaces.flatMap(face=>{
    const polygon=displayContour?flatRoofLocalContour(face,displayContour):face.polygon||[],step=Math.max(100,Number(flatRoof.lathStep||.35)*1000),minV=Math.min(...polygon.map(point=>point[1])),maxV=Math.max(...polygon.map(point=>point[1]));
    const point=(u,v)=>face.origin.map((value,index)=>value+face.u[index]*u+face.v[index]*v+face.normal[index]*(Number(face.thickness||0)/2+12.5));
    const rows=[];
    for(let v=minV+50;v<maxV;v+=step){
      const crossings=polygon.flatMap((a,index)=>{const b=polygon[(index+1)%polygon.length];return (a[1]<=v&&b[1]>v)||(b[1]<=v&&a[1]>v)?[a[0]+(v-a[1])*(b[0]-a[0])/(b[1]-a[1])]:[]}).sort((a,b)=>a-b);
      for(let i=0;i+1<crossings.length;i+=2)rows.push({id:`flat-deck-lath:${face.id}:${rows.length}`,layer:'laths',a:point(crossings[i],v),b:point(crossings[i+1],v),profile:'25×100',flat:true,normal:face.normal,referenceOnly:true});
    }
    return rows;
  }):[];
  const roofSheetPanels=assembly.roofShape==='flat'&&flatRoof.flatCoverSystem==='bitumen'&&flatRoof.includeCovering!==false?flatFaces.flatMap(face=>{
    const offset=(distance)=>face.origin.map((value,index)=>value+face.normal[index]*distance);
    const deckTop=flatLathTop(face)+deckThickness;
    const shape=[displayContour?flatRoofLocalContour(face,displayContour):face.polygon];
    return [{id:`flat-deck:${face.id}`,layer:deckIsOsb?'flatOsb':'flatCsp',shape,placement:{origin:offset(flatLathTop(face)+deckThickness/2),u:face.u,v:face.v,normal:face.normal},thickness:deckThickness,referenceOnly:true},
      {id:`flat-waterproof:${face.id}`,layer:'waterproofing',shape,placement:{origin:offset(deckTop+2),u:face.u,v:face.v,normal:face.normal},thickness:4,referenceOnly:true}];
  }):[];
  const flatSheetCover=assembly.roofShape==='flat'&&flatRoof.flatCoverSystem!=='bitumen'&&flatRoof.includeCovering!==false?flatFaces.map(face=>({
    id:`flat-sheet-cover:${face.id}`,layer:'sheetCover',shape:[displayContour?flatRoofLocalContour(face,displayContour):face.polygon],
    placement:{origin:face.origin.map((value,index)=>value+face.normal[index]*(flatLathTop(face)+2)),u:face.u,v:face.v,normal:face.normal},
    thickness:4,referenceOnly:true,
  })):[];
  const parapetBase=defaultRoofBase+(project.services.sipCeiling?Number(project.settings.sip.ceilingThickness):0);
  const parapetHeight=Math.max(150,Number(flatRoof.flatParapetHeightMm??900));
  const parapetBaseAt=point=>parapetBase+(flatRoof.flatSlopeMode==='structural'?roofRise(point[0],point[1]):0);
  const parapetThickness=Math.max(1,Number(project.settings.sip.wallThickness)||174);
  const parapetSegments=parapetRuns.flatMap((run,index)=>{
    // Panel joints are visual: the calculated purchased sheet count stays in the estimate.
    const count=Math.max(1,Math.ceil(run.length/1250)),segments=[];
    for(let part=0;part<count;part++){
      const at=t=>run.a.map((value,axis)=>value+(run.b[axis]-value)*t);
      const a=at(part/count),b=at((part+1)/count),length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      segments.push({a,b,length,id:`${index}:${part}`,normal:[(b[1]-a[1])/length,-(b[0]-a[0])/length,0]});
    }
    return segments;
  });
  const wallFace=(segment,layer,bottomA,bottomB,topA,topB,offset=0,thickness=parapetThickness)=>{
    const {a,b,length,normal}=segment,base=parapetBaseAt(a),centerOffset=offset-parapetThickness/2,origin=[a[0]+normal[0]*centerOffset,a[1]+normal[1]*centerOffset,base];
    return {id:`flat-${layer}:${segment.id}`,layer,shape:[[[0,bottomA-base],[length,bottomB-base],[length,topB-base],[0,topA-base]]],placement:{origin,u:[(b[0]-a[0])/length,(b[1]-a[1])/length,0],v:[0,0,1],normal},thickness,referenceOnly:true};
  };
  const parapetPanels=parapetSegments.map(segment=>wallFace(segment,'parapet',parapetBaseAt(segment.a),parapetBaseAt(segment.b),parapetBaseAt(segment.a)+parapetHeight,parapetBaseAt(segment.b)+parapetHeight));
  const bitumen=flatRoof.flatCoverSystem==='bitumen'&&flatRoof.includeCovering!==false;
  const parapetRequirement=parapetRuns.length&&flatFace?(()=>{
    const roofTopOffset=flatLathTop(flatFace)+(bitumen?deckThickness+4:10);
    const required=Math.ceil((Math.max(...parapetRuns.flatMap(run=>[run.a,run.b]).map(point=>flatRoofPlaneZ(flatFace,point)+roofTopOffset-parapetBaseAt(point)))+50)/50)*50;
    return {provided:parapetHeight,required:Math.max(150,required),shortfall:Math.max(0,required-parapetHeight)};
  })():null;
  const waterproofUpstand=Math.min(parapetHeight,Math.max(0,Number(flatRoof.flatWaterproofUpstandMm??900)));
  const waterproofOutside=Math.max(0,Number(flatRoof.flatWaterproofOutsideMm??100));
  const edgePanels=parapetSegments.flatMap(segment=>{
    if(flatRoof.includeCovering===false||!flatFace)return [];
    const topA=parapetBaseAt(segment.a)+parapetHeight,topB=parapetBaseAt(segment.b)+parapetHeight;
    const deckOffset=flatLathTop(flatFace)+(bitumen?deckThickness+4:0);
    const bottomA=flatRoofPlaneZ(flatFace,segment.a)+deckOffset,bottomB=flatRoofPlaneZ(flatFace,segment.b)+deckOffset;
    const inner=-(parapetThickness/2-2),outer=parapetThickness/2-2;
    if(!bitumen)return [wallFace(segment,'flashing',bottomA,bottomB,Math.min(topA,bottomA+200),Math.min(topB,bottomB+200),inner,3)];
    const upA=Math.min(topA,parapetBaseAt(segment.a)+waterproofUpstand),upB=Math.min(topB,parapetBaseAt(segment.b)+waterproofUpstand);
    const pieces=[];
    if(upA>bottomA+1&&upB>bottomB+1)pieces.push(wallFace(segment,'waterproofing',bottomA,bottomB,upA,upB,inner,4));
    if(waterproofUpstand>=parapetHeight-1){
      const {a,b,length,normal}=segment,dz=(topB-topA)/length,u=[(b[0]-a[0])/length,(b[1]-a[1])/length,dz],n=[-normal[0]*dz,-normal[1]*dz,1],size=Math.hypot(...n);
      pieces.push({id:`flat-waterproof-cap:${segment.id}`,layer:'waterproofing',shape:[[[0,0],[length,0],[length,parapetThickness],[0,parapetThickness]]],placement:{origin:[a[0]+normal[0]*(inner-parapetThickness/2),a[1]+normal[1]*(inner-parapetThickness/2),topA],u,v:normal,normal:n.map(value=>value/size)},thickness:4,referenceOnly:true});
      if(waterproofOutside>0)pieces.push(wallFace(segment,'waterproofing',topA-waterproofOutside,topB-waterproofOutside,topA,topB,outer,4));
    }
    return pieces;
  });
  const drainBeams=[];
  if(flatRoof.flatParapetMode==='closed'&&flatFace){
    const side=flatRoof.flatSlopeDirection||'back',axis=side==='left'||side==='right'?0:1,extreme=Math[side==='left'||side==='front'?'min':'max'](...contour.map(point=>point[axis]));
    const lowRuns=parapetRuns.filter(run=>Math.abs(run.a[axis]-extreme)<1&&Math.abs(run.b[axis]-extreme)<1);
    const run=(lowRuns.length?lowRuns:parapetRuns).sort((a,b)=>b.length-a.length)[0];
    if(run){const dx=(run.b[0]-run.a[0])/run.length,dy=(run.b[1]-run.a[1])/run.length,normal=[dy,-dx,0],count=Math.max(1,Math.min(20,Math.round(Number(flatRoof.flatDrainCount)||2)));
      for(let i=0;i<count;i++){const position=run.length*(i+1)/(count+1),xy=[run.a[0]+dx*position,run.a[1]+dy*position],z=flatRoofPlaneZ(flatFace,xy)+flatLathTop(flatFace)+(bitumen?deckThickness:0)+45;
        drainBeams.push({id:`flat-drain:${i}`,layer:'drains',profile:'110×110',a:[xy[0]-normal[0]*(parapetThickness+80),xy[1]-normal[1]*(parapetThickness+80),z],b:[xy[0]+normal[0]*80,xy[1]+normal[1]*80,z],normal:[0,0,1],referenceOnly:true});
      }
    }
  }
  const platformPanels=platforms.flatMap(p=>{
    const placement={origin:[0,0,p.deckZ-p.thickness/2],u:[1,0,0],v:[0,1,0],normal:[0,0,1],layer:'platforms'};
    const deck={id:`platform:${p.id}:deck`,layer:'platforms',shape:[p.contour],placement,thickness:p.thickness,timber:true,referenceOnly:true};
    const steps=p.steps.map(s=>({...s,layer:'platforms',shape:[s.ring],placement:{...placement,origin:[0,0,s.z-s.thickness/2]},timber:true,referenceOnly:true}));
    // Legacy roofs have no production placement for cold platform facets.
    const roofs=p.faces.filter(f=>!panels.some(s=>s.faceId===f.id)).map(f=>({id:`platform:${p.id}:roof:${f.id}`,layer:'platformRoof',shape:[f.polygon],placement:{origin:f.origin,u:f.u,v:f.v,normal:f.normal},thickness:10,referenceOnly:true}));
    return [deck,...steps,...roofs];
  });
  const platformFaceIds=new Set((assembly.platforms||[]).flatMap(p=>p.faces.map(f=>f.id)));
  const visible=item=>includePlatforms||!(platformFaceIds.has(item.faceId)||String(item.placement?.layer)==='roof'&&platformFaceIds.has(item.surfaceId));
  const foundation=foundationGeometry(report,project,includePlatforms);
  const host=project.plan?.existingBuilding,hostPoints=host?.points||[],hostHeight=Number(host?.wallHeightMm)||0,hostBase=Number(host?.baseZMm)||0;
  const hostPanels=hostPoints.length>=3?hostPoints.map((a,i)=>{
    const b=hostPoints[(i+1)%hostPoints.length],dx=(b.x-a.x)*1000,dy=(b.y-a.y)*1000,length=Math.hypot(dx,dy);
    return length>1?{id:`existing:${host.id||'building'}:wall:${i}`,layer:'existingBuilding',referenceOnly:true,shape:[[[0,0],[length,0],[length,hostHeight||40],[0,hostHeight||40]]],placement:{origin:[a.x*1000,a.y*1000,hostBase],u:[dx/length,dy/length,0],v:[0,0,1],normal:[dy/length,-dx/length,0]},thickness:20}:null;
  }).filter(Boolean):[];
  const sceneBeams=beams.filter(visible).flatMap(item=>displayContour&&['rafters','laths','counterLaths'].includes(item.layer)?clipFlatRoofBeam(item,displayContour):[item]);
  return {panels:[...panels.filter(visible),...windowPanels,...coldRoofSurfaces,...roofSheetPanels,...flatSheetCover,...parapetPanels,...edgePanels,...boards.filter(visible),...platformPanels,...foundation.filter(p=>p.known).map(p=>({...p,timber:true})),...hostPanels],foundation,previews,beams:[...sceneBeams,...flatLathBeams,...drainBeams,...platforms.flatMap(p=>[...p.posts,...p.ties,...p.frameMembers,...p.stringers])],bearingPoints,parapetRequirement,platforms,missing,world,roofBase,bases,placements};
}
