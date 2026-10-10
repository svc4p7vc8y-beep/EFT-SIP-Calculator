const profileOf = text => {
  const match=String(text).match(/(\d+(?:\.\d+)?)\s*[×xх]\s*(\d+(?:\.\d+)?)/i);
  return match ? [Number(match[1]),Number(match[2])].sort((a,b)=>a-b) : null;
};
const boardRoles=new Set(['Торцевая / обрамляющая доска','Стойка проёма','Нижняя обвязка перегородки','Верхняя обвязка перегородки','Стойка перегородки','Угловая стойка под обшивку','Опорная доска на ребре','Укосина перегородки','Обвязка фронтона','Стойка фронтона','Доска пакета обвязки','Стропило','Обрешётка','Контробрешётка','Коньковый прогон']);
const familyOf = (material,profile) => {
  if(boardRoles.has(material))return 'Пиломатериалы';
  if(material==='Мауэрлат')return profile[0]<100?'Пиломатериалы':'Брус';
  if(material==='Брус обвязки')return 'Брус';
  if(['Термобрус','Клеёный пакет','Брус'].includes(material))return material;
  return null;
};
const lineFamily = name => /(?:пакет\s+кле|кле[её]ный\s+пакет)/i.test(name)?'Клеёный пакет':/термобрус/i.test(name)?'Термобрус':/брус(?:\s|$)/i.test(name)?'Брус':/(?:доск[аиу]|укосин|обреш[её]т|усиление перегородок)/i.test(name)?'Пиломатериалы':null;

// Stock requirements and purchasing use material families and physical sections,
// not assembly roles. No price, purchase quantity or project field is changed.
export function reconcileCutting(report,calculation) {
  const rows=new Map();
  const get=(key,name,unit)=>{
    if(!rows.has(key))rows.set(key,{key,name,unit,required:0,purchased:0,matched:false,pendingCount:0,incomplete:false});
    return rows.get(key);
  };
  const timberRow=(material,text)=>{
    const profile=profileOf(text);if(!profile)return null;
    const family=familyOf(material,profile),key=`${family||material}:${profile.join('×')}`;
    const row=get(key,`${family||material} ${profile.join('×')} мм`,'м³');
    row.family=family;row.profile=profile;return row;
  };
  const panelRow=(family,thickness)=>get(`panel:${family}:${thickness}`,`SIP ${family.toUpperCase()} ${thickness} мм`,'шт.');
  for(const sheet of report.panelStock.sheets)panelRow(sheet.family,sheet.thickness).required++;
  for(const surface of report.surfaces||[])if(surface.blocked&&!surface.frameOnly)panelRow(surface.family,surface.thickness).incomplete=true;
  for(const bar of report.timberStock.bars){const row=timberRow(bar.material,bar.profile);if(row)row.required+=report.settings.stockLengthMm*row.profile[0]*row.profile[1]/1e9;}
  const unplaced=new Set(report.timberStock.unplaced);
  for(const member of report.fabricationMembers||report.members||[])if(!member.excluded&&unplaced.has(member.id)){const row=timberRow(member.material,member.profile);if(row)row.pendingCount++;}
  for(const line of calculation.lines||[]){
    if(line.kind!=='material')continue;
    const panel=line.name.match(/СИП-панель\s+(CSP PPS|PPS|минвата)\s+\d+×\d+×(\d+)/i);
    if(panel){const family=panel[1].toLowerCase()==='минвата'?'mineral-wool':panel[1].toLowerCase().replace(' ','-');const row=panelRow(family,panel[2]);row.purchased+=Number(line.qty)||0;row.matched=true;continue;}
    const family=lineFamily(line.name),profile=profileOf(line.name);
    if(!family||!profile)continue;
    let volume=null;
    if(['м³','м3'].includes(line.unit))volume=Number(line.qty);
    else if(['м.п.','м.п','м','п.м.'].includes(line.unit))volume=Number(line.qty)*profile[0]*profile[1]/1e6;
    if(volume==null||!Number.isFinite(volume))continue;
    const row=get(`${family}:${profile.join('×')}`,`${family} ${profile.join('×')} мм`,'м³');
    row.family=family;row.profile=profile;row.purchased+=volume;row.matched=true;
  }
  const anyIncomplete=(report.surfaces||[]).some(s=>s.blocked);
  return [...rows.values()].map(row=>{
    // Missing purchase matches and unallocated/blocked geometry are incomparable.
    const known=row.matched;
    const status=row.incomplete||anyIncomplete&&row.unit==='м³'?'incomplete-layout':row.pendingCount?'unplaced-stock':!known?'manual-match':'compared';
    const purchased=known?row.purchased:null;
    return {...row,purchased,status,difference:status==='compared'?Math.round((row.required-purchased)*1e6)/1e6:null};
  });
}
