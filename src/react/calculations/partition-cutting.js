// Geometric framing proposal. Header capacity, bracing and connections require project nodes.
export function partitionFrameMembers(surface,settings) {
  if(surface.blocked)return [];
  const profile=surface.frameProfile, [t]=profile.split(/[×xх]/).map(Number),W=surface.width,H=surface.height;
  if(!(t>0&&H>3*t))return [];
  const members=[],holes=surface.openings||[];
  const add=(a,b,material)=>{const length=Math.round(Math.hypot(b[0]-a[0],b[1]-a[1]));if(length<=0)return;
    members.push({id:`${surface.id}-К${members.length+1}`,a,b,length,cutLength:length+2*Number(settings.endAllowanceMm||0),material,profile,role:'frame',surface:surface.name,surfaceId:surface.id,panels:[],source:surface.bearing?'Несущая перегородка · проектное сечение':'Каркас перегородки',processing:'Сопряжения, усиление перемычек и раскосы по рабочему узлу'});};
  const doorSpans=holes.filter(o=>Number(o.sill)===0).map(o=>[o.x,o.x+o.width]).sort((a,b)=>a[0]-b[0]);
  let from=0;for(const [a,b]of doorSpans){if(a>from)add([from,t/2],[a,t/2],'Нижняя обвязка перегородки');from=Math.max(from,b);}if(from<W)add([from,t/2],[W,t/2],'Нижняя обвязка перегородки');
  const gaps=holes.filter(o=>o.gap).map(o=>[o.x,o.x+o.width]).sort((a,b)=>a[0]-b[0]);
  for(const y of [H-t/2,H-1.5*t]){let start=0;for(const [a,b]of gaps){if(a>start)add([start,y],[a,y],'Верхняя обвязка перегородки');start=Math.max(start,b);}if(start<W)add([start,y],[W,y],'Верхняя обвязка перегородки');}
  const anchors=[t/2,W-t/2,...holes.flatMap(o=>[o.x-t/2,o.x+o.width+t/2])].sort((a,b)=>a-b),positions=new Set(anchors);
  for(let i=1;i<anchors.length;i++){const count=Math.ceil((anchors[i]-anchors[i-1])/settings.frameStepMm);for(let j=1;j<count;j++)positions.add(anchors[i-1]+(anchors[i]-anchors[i-1])*j/count);}
  for(const o of holes){
    if(Number(o.sill)>0)add([o.x,Number(o.sill)-t/2],[o.x+o.width,Number(o.sill)-t/2],'Подоконная доска');
    if(Number(o.sill)+o.height<H-2*t)add([o.x,Number(o.sill)+o.height+t/2],[o.x+o.width,Number(o.sill)+o.height+t/2],'Перемычка проёма · сечение проверить');}
  const jambs=holes.flatMap(o=>[o.x-t/2,o.x+o.width+t/2]);
  for(const x of [...positions].sort((a,b)=>a-b)){
    if(x<t/2-.01||x>W-t/2+.01)continue;
    if(jambs.some(j=>Math.abs(j-x)<t-.01)&&!jambs.some(j=>Math.abs(j-x)<.01))continue;
    const opening=holes.find(o=>x+t/2>o.x+.01&&x-t/2<o.x+o.width-.01);
    if(!opening)add([x,t],[x,H-2*t],'Стойка перегородки');
    else {if(Number(opening.sill)>2*t)add([x,t],[x,Number(opening.sill)-t],'Стойка под окном');const top=Number(opening.sill)+opening.height+t;if(top<H-2*t)add([x,top],[x,H-2*t],'Стойка над проёмом');}
  }
  return members;
}
