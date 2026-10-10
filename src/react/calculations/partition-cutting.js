// Geometric framing proposal. Header capacity, bracing and connections require project nodes.
import clipping from 'polygon-clipping';
import { singleBevelBrace, partitionNotches } from './partition-geometry.js';

export function partitionFrameMembers(surface,settings) {
  if(surface.blocked)return [];
  const profile=surface.frameProfile, [t]=profile.split(/[×xх]/).map(Number),W=surface.width,H=surface.height,layers=surface.topPlateLayers||1;
  if(!(t>0&&H>(layers+1)*t))return [];
  const members=[],holes=surface.openings||[];
  const add=(a,b,material,extra={})=>{const length=Math.round(Math.hypot(b[0]-a[0],b[1]-a[1]));if(length<=0)return;
    members.push({id:`${surface.id}-К${members.length+1}`,a,b,length,cutLength:length+2*Number(settings.endAllowanceMm||0),material,profile,role:'frame',surface:surface.name,surfaceId:surface.id,panels:[],source:surface.bearing?'Несущая перегородка · проектное сечение':'Каркас перегородки',processing:'Сопряжения, усиление перемычек и раскосы по рабочему узлу',...extra});};
  const doorSpans=holes.filter(o=>Number(o.sill)===0).map(o=>[o.x,o.x+o.width]).sort((a,b)=>a[0]-b[0]);
  let from=0;for(const [a,b]of doorSpans){if(a>from)add([from,t/2],[a,t/2],'Нижняя обвязка перегородки');from=Math.max(from,b);}if(from<W)add([from,t/2],[W,t/2],'Нижняя обвязка перегородки');
  const gaps=holes.filter(o=>o.gap).map(o=>[o.x,o.x+o.width]).sort((a,b)=>a[0]-b[0]);
  for(let layer=0;layer<layers;layer++){const y=H-(layer+.5)*t;let start=0;for(const [a,b]of gaps){if(a>start)add([start,y],[a,y],'Верхняя обвязка перегородки');start=Math.max(start,b);}if(start<W)add([start,y],[W,y],'Верхняя обвязка перегородки');}
  const anchors=[t/2,W-t/2,...holes.flatMap(o=>[o.x-t/2,o.x+o.width+t/2])].sort((a,b)=>a-b),positions=new Set(anchors);
  for(let i=1;i<anchors.length;i++){const count=Math.ceil((anchors[i]-anchors[i-1])/settings.frameStepMm);for(let j=1;j<count;j++)positions.add(anchors[i-1]+(anchors[i]-anchors[i-1])*j/count);}
  for(const o of holes){
    if(Number(o.sill)>0)add([o.x,Number(o.sill)-t/2],[o.x+o.width,Number(o.sill)-t/2],'Подоконная доска');
    if(Number(o.sill)+o.height<H-layers*t)add([o.x,Number(o.sill)+o.height+t/2],[o.x+o.width,Number(o.sill)+o.height+t/2],'Перемычка проёма · сечение проверить');}
  const jambs=holes.flatMap(o=>[o.x-t/2,o.x+o.width+t/2]);
  for(const x of [...positions].sort((a,b)=>a-b)){
    if(x<t/2-.01||x>W-t/2+.01)continue;
    if(jambs.some(j=>Math.abs(j-x)<t-.01)&&!jambs.some(j=>Math.abs(j-x)<.01))continue;
    const opening=holes.find(o=>x+t/2>o.x+.01&&x-t/2<o.x+o.width-.01);
    if(!opening)add([x,t],[x,H-layers*t],'Стойка перегородки');
    else {if(Number(opening.sill)>2*t)add([x,t],[x,Number(opening.sill)-t],'Стойка под окном');const top=Number(opening.sill)+opening.height+t;if(top<H-layers*t)add([x,top],[x,H-layers*t],'Стойка над проёмом');}
  }
  const depth=Number(profile.split(/[×xх]/)[1]);
  if(surface.bearing&&settings.bearingEdgeBoard){
    const y=H-layers*t-depth/2;let start=t;
    const edgeDetails={role:'edge-board',faceWidth:depth,reinforcement:true,notchDepthMm:settings.bearingEdgeNotchDepthMm??'',processing:'Доска на ребре под верхней обвязкой; врезки в стойки и крепёж — по проекту'};
    for(const [a,b]of gaps){if(a>start)add([start,y],[a,y],'Опорная доска на ребре',edgeDetails);start=Math.max(start,b);}
    if(start<W-t)add([start,y],[W-t,y],'Опорная доска на ребре',edgeDetails);
  }
  if(settings.partitionCornerBacking)for(const [x,backing]of [[t*1.5,surface.startBacking],[W-t*1.5,surface.endBacking]]){
    if(backing&&!holes.some(o=>x+t/2>o.x&&x-t/2<o.x+o.width))add([x,t],[x,H-layers*t],'Угловая стойка под обшивку',{reinforcement:true,backing:true,processing:'Угол / Т-примыкание; положение доски и крепёж по узлу'});
  }
  if(surface.bearing&&settings.partitionBracing){
    const braceProfile=settings.partitionBraceProfile||'25×150',faceWidth=Number(braceProfile.split(/[×xх]/)[1]);
    const low=t,high=H-layers*t;
    const intersectsOpening=outline=>holes.some(o=>clipping.intersection([[...outline,outline[0]]],[[[o.x,Number(o.sill)],[o.x+o.width,Number(o.sill)],[o.x+o.width,Number(o.sill)+o.height],[o.x,Number(o.sill)+o.height],[o.x,Number(o.sill)]]]).length);
    const sides=settings.partitionBraceDirection==='right-left'?['right']:settings.partitionBraceDirection==='left-right'?['left']:['left','right'];
    if(high>low)for(const side of sides){
      const x=side==='left'?t/2:W-t/2;
      const targets=[...positions].filter(v=>side==='left'?v>x+t:v<x-t).sort((a,b)=>Math.abs(Math.abs(a-x)-(high-low))-Math.abs(Math.abs(b-x)-(high-low)));
      // Prefer the bottom stud nearest the 45-degree reference. Do not evade an
      // opening by manufacturing an almost vertical, ineffective short brace.
      const proposal=targets.map(target=>singleBevelBrace(side,target,faceWidth,W,low,high)).find(Boolean);
      if(proposal&&!intersectsOpening(proposal.outline)){
        const {a,b,outline}=proposal,axis=Math.hypot(b[0]-a[0],high-low),along=outline.map(([u,v])=>(u-a[0])*(b[0]-a[0])/axis+(v-high)*(low-high)/axis),length=Math.ceil(Math.max(...along)-Math.min(...along));
        add(a,b,'Укосина перегородки',{profile:braceProfile,faceWidth,outline,length,cutLength:length+2*Number(settings.endAllowanceMm||0),role:'brace',reinforcement:true,notchDepthMm:settings.partitionBraceNotchDepthMm??'',processing:`Укосина ${braceProfile}; верхний ${side==='left'?'левый':'правый'} угол → нижняя стойка; один плоский срез на каждом торце ${Math.round(Math.atan2(high-low,Math.abs(b[0]-a[0]))*180/Math.PI*10)/10}°; врезки и крепёж по рабочему узлу`});
        break; // One chosen direction; never a crossed pair in the same wall.
      }
    }
  }
  const cutters=members.filter(m=>m.role==='brace'||m.role==='edge-board');
  for(const member of members){
    const vertical=Math.abs(member.a[0]-member.b[0])<.01;
    if(vertical||member.role==='edge-board')member.notches=partitionNotches(member,cutters.filter(c=>c!==member&&(vertical||c.role==='brace')));
  }
  return members;
}
