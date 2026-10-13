// Opening borders are continuous boards between the two full jambs. Panel
// cutting seams do not prescribe structural splices in the opening frame.
export function completeSipOpeningBoards(surface,members,settings,issue=()=>{}) {
  const keys=[];
  const jambs=new Map();
  for(const member of members.filter(m=>m.surfaceId===surface.id&&m.role==='jamb'&&!m.excluded)){
    const key=JSON.stringify([member.a,member.b,member.profile]),previous=jambs.get(key);
    if(!previous){jambs.set(key,member);continue;}
    if([previous,member].some(m=>Object.keys(settings.memberOverrides?.[m.key]||{}).length))continue;
    previous.panels=[...new Set([...previous.panels,...member.panels])];previous.openingRef+=` / ${member.openingRef}`;
    member.excluded=true;member.replacedByOpeningJamb=previous.id;member.source='Совпадает с общей стойкой проёмов';
  }
  for(const opening of surface.openings||[]){
    if(opening.gap||!['window','door'].includes(opening.type))continue;
    for(const [role,y]of [['opening-head',Number(opening.sill)+opening.height],...(Number(opening.sill)>0?[['opening-sill',Number(opening.sill)]]:[])]){
      const pieces=members.filter(m=>m.surfaceId===surface.id&&!m.excluded&&!m.seam&&m.axisA&&m.axisB&&Math.abs(m.axisA[1]-y)<.01&&Math.abs(m.axisB[1]-y)<.01&&Math.min(m.axisA[0],m.axisB[0])>=opening.x-.01&&Math.max(m.axisA[0],m.axisB[0])<=opening.x+opening.width+.01).sort((a,b)=>Math.min(...[a.axisA[0],a.axisB[0]])-Math.min(...[b.axisA[0],b.axisB[0]]));
      if(!pieces.length||pieces.some(m=>Object.keys(settings.memberOverrides?.[m.key]||{}).length))continue;
      let end=opening.x;
      const continuous=pieces.every(m=>{const from=Math.min(m.axisA[0],m.axisB[0]),to=Math.max(m.axisA[0],m.axisB[0]);if(Math.abs(from-end)>.01||m.profile!==pieces[0].profile)return false;end=to;return true;});
      if(!continuous||Math.abs(end-opening.x-opening.width)>.01)continue;
      const first=pieces[0],last=pieces.at(-1),firstStart=first.a[0]<=first.b[0]?first.a:first.b,lastEnd=last.a[0]<=last.b[0]?last.b:last.a;
      first.a=[...firstStart];first.b=[...lastEnd];first.axisA=[opening.x,y];first.axisB=[opening.x+opening.width,y];
      first.geometricLength=first.length=Math.ceil(Math.hypot(first.b[0]-first.a[0],first.b[1]-first.a[1])-.001);
      first.cutLength=first.length+2*Number(settings.endAllowanceMm||0);first.role=role;first.openingRef=opening.name;
      first.key=`${surface.layoutKey}:opening-board:${opening.key}:${role}`;keys.push(first.key);
      first.panels=[...new Set(pieces.flatMap(m=>m.panels||[]))];
      first.processing='Цельная доска обрамления между боковыми стойками; стык длинной детали — по рабочему узлу';
      for(const piece of pieces.slice(1)){piece.excluded=true;piece.replacedByOpeningBoard=first.id;piece.source='Включено в цельную доску обрамления';}
      const override=settings.memberOverrides?.[first.key]||{},length=override.length!==''&&override.length!=null?Number(override.length):first.length;
      const profile=override.profile?.trim()||first.profile,dims=profile.replace(/[xх]/g,'×').split('×').map(Number);
      if(!(length>0&&length<=100000&&dims.length===2&&dims.every(n=>n>0))){first.excluded=true;issue('MEMBER_OVERRIDE',`${first.id}: неверная длина или сечение доски проёма`,first.key);continue;}
      if((override.exclude||override.profile||override.length!==''&&override.length!=null)&&!override.nodeRef?.trim())issue('MEMBER_NODE',`${first.id}: для изменения или исключения укажите рабочий узел`,first.key);
      first.length=length;first.cutLength=length+2*Number(settings.endAllowanceMm||0);first.profile=profile;first.normalDepthMm=dims[0];first.faceWidth=dims[1];
      first.a[1]=first.b[1]=y+(role==='opening-head'?1:-1)*dims[1]/2;first.nodeRef=override.nodeRef||'';first.excluded=override.exclude===true;first.processing=override.processing||first.processing;
    }
  }
  return keys;
}
