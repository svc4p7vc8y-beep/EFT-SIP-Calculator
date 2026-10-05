const positive=n=>Number.isFinite(Number(n))&&Number(n)>0;
export function normalizeCargoVolumes(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return {};
 return Object.fromEntries(Object.entries(value).slice(0,50).map(([key,r])=>[key,{mode:r?.mode==='manual'?'manual':'auto',volume:r?.volume!==''&&r?.volume!=null&&Number.isFinite(Number(r.volume))&&Number(r.volume)>=0?Number(r.volume):''}]));
}
export function calculateDeliveryVolume(project,calculation){
 const groups=new Map(),saved=normalizeCargoVolumes(project.settings.delivery.volumeGroups);
 const catalog=new Map((project.priceMat||[]).map(c=>[c.id,c]));
 for(const line of calculation.lines){
  if(line.kind!=='material'||line.section==='delivery'||!positive(line.qty)||/^(доставка|погрузка|разгрузка|аренда)(?=\s|[—–-]|$)/iu.test(line.name)||['рейс','км'].includes(line.unit))continue;
  const name=line.name||'',base=catalog.get(line.catalogId)?.name||'',text=`${name} ${base}`;
  const panel=/^(СИП|SIP)[-\s]?панел/iu.test(name)||/^(СИП|SIP)[-\s]?панел/iu.test(base);
  const gluedPackage=/пакет\s+кле[её]н|кле[её]ный\s+пакет/i.test(text);
  const timber=!/саморез|гвозд|крепёж|крепеж|монтаж|уголок/i.test(text)&&(gluedPackage||/доск|досок|термобрус|брус|мауэрлат|обреш[её]тк/i.test(text));
  const key=panel?'panels':timber?'timber':line.section;
  const title=panel?'SIP-панели':timber?'Пиломатериалы':calculation.sections.find(s=>s.key===line.section)?.title||line.section;
  const group=groups.get(key)||{key,title,rows:[],autoVolume:0,unknown:0};
  const dimensions=name.match(/(\d+(?:[.,]\d+)?)\s*[×xх*]\s*(\d+(?:[.,]\d+)?)\s*[×xх*]\s*(\d+(?:[.,]\d+)?)\s*мм/i);
  const section=text.match(/(\d+(?:[.,]\d+)?)\s*[×xх*]\s*(\d+(?:[.,]\d+)?)\s*мм/i);
  const num=s=>Number(s.replace(',','.'));let volume=null,formula='Нет габаритов или объёма упаковки';
  if(['м³','м3'].includes(line.unit)){volume=line.qty;formula='Объём из закупочной строки сметы';}
  else if(panel&&dimensions&&['шт','шт.'].includes(line.unit)){volume=line.qty*num(dimensions[1])*num(dimensions[2])*num(dimensions[3])/1e9;formula='Количество × длина × ширина × полная толщина';}
  else if(timber&&section&&['м.п.','м','пог.м','пог. м'].includes(line.unit)){volume=line.qty*num(section[1])*num(section[2])/1e6;formula='Закупочная длина × сечение';}
  if(volume===null)group.unknown++;else group.autoVolume+=volume;
  group.rows.push({...line,volume,formula,gluedPackage:timber&&gluedPackage});groups.set(key,group);
 }
 const categories=[...groups.values()].sort((a,b)=>({panels:0,timber:1}[a.key]??2)-({panels:0,timber:1}[b.key]??2)).map(g=>{const setting=saved[g.key]||{mode:'auto',volume:''};const manual=setting.mode==='manual';return {...g,...setting,effectiveVolume:manual?(setting.volume===''?null:setting.volume):g.autoVolume,complete:manual?setting.volume!=='':g.unknown===0};});
 return {categories,total:categories.reduce((sum,g)=>sum+(g.effectiveVolume||0),0),complete:categories.every(g=>g.complete)};
}
