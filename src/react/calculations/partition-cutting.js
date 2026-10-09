// Geometric framing proposal. Header capacity, bracing and connections require project nodes.
export function partitionFrameMembers(surface,settings) {
  if(surface.blocked)return [];
  const profile=surface.frameProfile, [t]=profile.split(/[×xх]/).map(Number),W=surface.width,H=surface.height,layers=surface.topPlateLayers||2;
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
    for(const [a,b]of gaps){if(a>start)add([start,y],[a,y],'Опорная доска на ребре',{faceWidth:depth,reinforcement:true,processing:'Врезки в стойки и крепёж — по проекту'});start=Math.max(start,b);}
    if(start<W-t)add([start,y],[W-t,y],'Опорная доска на ребре',{faceWidth:depth,reinforcement:true,processing:'Врезки в стойки и крепёж — по проекту'});
  }
  if(settings.partitionCornerBacking)for(const [x,backing]of [[t*1.5,surface.startBacking],[W-t*1.5,surface.endBacking]]){
    if(backing&&!holes.some(o=>x+t/2>o.x&&x-t/2<o.x+o.width))add([x,t],[x,H-layers*t],'Угловая стойка под обшивку',{reinforcement:true,backing:true,processing:'Угол / Т-примыкание; положение доски и крепёж по узлу'});
  }
  if(surface.bearing&&settings.partitionBracing){
    const braceProfile=settings.partitionBraceProfile||'25×150',faceWidth=Number(braceProfile.split(/[×xх]/)[1]);
    const low=t,high=H-layers*t-(settings.bearingEdgeBoard?depth:0);
    const intersectsOpening=(a,b)=>holes.some(o=>{
      const left=o.x-faceWidth/2,right=o.x+o.width+faceWidth/2,bottom=Number(o.sill)-faceWidth/2,top=Number(o.sill)+o.height+faceWidth/2;
      const lo=Math.max(Math.min(a[0],b[0]),left),hi=Math.min(Math.max(a[0],b[0]),right);
      if(lo>hi)return false;
      const y=x=>a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);
      return Math.max(y(lo),y(hi))>=bottom&&Math.min(y(lo),y(hi))<=top;
    });
    if(high>low)for(const side of ['left','right']){
      const x=side==='left'?t/2:W-t/2;
      const targets=[...positions].filter(v=>side==='left'?v>x+t:v<x-t).sort((a,b)=>Math.abs(Math.abs(a-x)-(high-low))-Math.abs(Math.abs(b-x)-(high-low)));
      const target=targets.find(v=>!intersectsOpening([x,high],[v,low]));
      if(target!=null)add([x,high],[target,low],'Укосина перегородки',{profile:braceProfile,faceWidth,reinforcement:true,processing:`Укосина ${braceProfile}; торцы ${side==='left'?'Л':'П'} / ${Math.atan2(high-low,Math.abs(target-x))*180/Math.PI}°; врезки и крепёж по рабочему узлу`});
    }
  }
  return members;
}
