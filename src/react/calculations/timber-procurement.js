import {timberMaterialSummary} from './timber-member-summary.js';
import {purchaseLayer,isPurchaseFastener} from './purchasing-register.js';
import {normalizeTimberProcurement} from '../state/timber-procurement.js';
const num=s=>Number(String(s).replace(',','.'));
const unit=s=>String(s||'').replace(/[.\s]/g,'').replace('³','3');
const profile=text=>{const m=String(text).match(/(\d+(?:[.,]\d+)?)\s*[×xх*]\s*(\d+(?:[.,]\d+)?)/i);return m?[num(m[1]),num(m[2])]:null;};
const compound=text=>/термобрус|кле[её]ный\s+пакет|пакет\s+кле|комплект.*(?:пакет|досок)|^пакет\b/i.test(text);
const round=n=>Math.round(n*1e9)/1e9;
export function timberComposition(name,section,recipes={}) {
  const text=String(name||''),p=profile(section||text);
  if(!p)return null;
  const packed=compound(text),family=/термобрус/i.test(text)?'thermal':/комплект/i.test(text)?'kit':'pack';
  const explicit=packed&&text.match(/(\d+)\s*[×xх*]\s*(\d+(?:[.,]\d+)?)\s*[×xх*]\s*(\d+(?:[.,]\d+)?)/i);
  // 95-wide SIP products: EFT confirmed two boards, 45 mm thick, on 19.11.2026.
  // Depth follows the selected product, not the nominal panel thickness.
  const assembled=p.includes(95)?95:p.includes(90)?90:null,depth=assembled?p.find(n=>n!==assembled)||assembled:null;
  const nominal=p.map(n=>packed&&n===90?95:n);
  const key=packed?explicit?`${family}:${explicit.slice(1).map(num).join('x')}`:`${family}:${nominal.sort((a,b)=>a-b).join('x')}`:`board:${[...p].sort((a,b)=>a-b).join('x')}`;
  const base=explicit?{count:num(explicit[1]),thicknessMm:num(explicit[2]),widthMm:num(explicit[3])}:packed&&depth?{count:2,thicknessMm:45,widthMm:depth}:!packed?{count:1,thicknessMm:Math.min(...p),widthMm:Math.max(...p)}:null;
  const saved=recipes[key],recipe=saved||base;
  return {key,packed,profile:p,recipe,valid:!!recipe&&recipe.count>0&&recipe.thicknessMm>0&&recipe.widthMm>0,name:packed?explicit?text.split(' · ')[0]:`${/термобрус/i.test(text)?'Термобрус':/комплект/i.test(text)?'Комплект пакета':'Клеёный пакет'} ${[...p].sort((a,b)=>a-b).join('×')} мм`:text.split(' · ')[0],basis:saved?'Состав проекта':explicit?'Состав указан в наименовании изделия':packed&&depth?'Состав EFT: 2 доски 45 мм; ширина по глубине изделия':'Сечение доски по проекту'};
}
function stockRows(report) {
  const members=new Map([...(report?.members||[]),...(report?.fabricationMembers||[])].map(m=>[m.id,m]));
  return (report?.timberStock?.bars||[]).map(bar=>({id:bar.id,name:bar.material,sectionProfile:bar.profile,qty:(bar.stockLength||bar.stockLengthMm||report.settings?.stockLengthMm)/1000,unit:'м.п.',layer:[...new Set((bar.parts||[]).map(p=>members.get(p.id)?.surface).filter(Boolean))].join(', ')||'По картам раскроя'}));
}
export function timberProcurement(project,calculation,report,{source='estimate',layers=null}={}) {
  const settings=normalizeTimberProcurement(project.settings?.productionCutting?.timberProcurement),catalog=new Map((project.priceMat||[]).map(c=>[c.id,c])),titles=Object.fromEntries((calculation?.sections||[]).map(s=>[s.key,s.title]));
  const inputs=source==='cutting'?stockRows(report):(calculation?.lines||[]).filter(l=>l.kind==='material'&&l.qty>0).map(l=>({...l,layer:purchaseLayer(l,titles).name,layerId:purchaseLayer(l,titles).id})).filter(l=>layers==null||layers.includes(l.layerId));
  const groups=new Map(),compositions=new Map(),unresolved=[];
  for(const input of inputs){
    const base=catalog.get(input.catalogId)?.name||input.name||'',name=input.name||base,text=`${name} ${base}`;
    if(isPurchaseFastener(text)||source!=='cutting'&&!/доск|досок|термобрус|брус|мауэрлат|обреш[её]т|пакет|ригель|стропил|стойк|лага|балк|затяжк|укосин/i.test(text)||/СИП-панел|SIP-панел|ОСБ|OSB|ЦСП|утеплител/i.test(text))continue;
    const explicit=base.match(/\((\d+)\s*[×xх*]\s*(\d+)\s*мм\)/i);
    const dimensions=input.sectionProfile||(explicit?`${explicit[1]}×${explicit[2]}`:profile(name)?name:base);
    const individualBoard=source==='cutting'&&profile(dimensions)?.some(n=>n===45||n===50)&&!base.match(/\d+\s*[×xх*]\s*\d+\s*[×xх*]\s*\d+/);
    const item=timberComposition(individualBoard?'Доска каркаса':compound(base)?base:name,dimensions,settings.recipes);
    if(!item){unresolved.push({name,reason:'Не указано сечение древесины'});continue;}
    if(item.packed||settings.recipes[item.key])compositions.set(item.key,item);
    const area=item.profile[0]*item.profile[1]/1e6,u=unit(input.unit);
    let length=['м','мп','погм','погонныйметр'].includes(u)?Number(input.qty):u==='м3'?Number(input.qty)/area:null;
    if(input.materialVolumeM3>0){const ratio=input.materialVolumeBasisQty>0?input.qty/input.materialVolumeBasisQty:1;length=input.materialVolumeM3*ratio/area;}
    if(length==null&&['шт','штука'].includes(u)){
      const match=name.match(/шт\s*[×xх*]\s*(\d+(?:[.,]\d+)?)\s*м(?:\s|$|[·,])/i);if(match)length=Number(input.qty)*num(match[1]);
    }
    if(!(length>0)||!item.valid){unresolved.push({name,reason:!item.valid?'Укажите состав досок для изделия':'Нельзя определить длину из единицы сметы',compositionKey:item.key});if(!item.valid)compositions.set(item.key,item);continue;}
    const r=item.recipe,thickness=Math.min(r.thicknessMm,r.widthMm),width=Math.max(r.thicknessMm,r.widthMm),finish=/строган/i.test(text)||item.packed?'строганая':'по проекту';
    const kind=!item.packed&&(/брус|мауэрлат/i.test(text)&&Math.min(...item.profile)>=90||Math.min(...item.profile)>=100)?'Брус':'Доска';
    const key=`${kind}:${thickness}x${width}:${finish}`,row=groups.get(key)||{id:key,name:`${kind} ${thickness}×${width} мм`,finish,thicknessMm:thickness,widthMm:width,lengthM:0,volumeM3:0,sources:[]};
    const lengthM=length*r.count,volumeM3=lengthM*thickness*width/1e6;
    row.lengthM+=lengthM;row.volumeM3+=volumeM3;row.sources.push({id:input.id,name,layer:input.layer,lengthM:round(lengthM),assemblyLengthM:round(length),boards:r.count,basis:item.basis});groups.set(key,row);
  }
  const rows=[...groups.values()].map(r=>({...r,lengthM:round(r.lengthM),volumeM3:round(r.volumeM3)})).sort((a,b)=>a.thicknessMm-b.thicknessMm||a.widthMm-b.widthMm||a.finish.localeCompare(b.finish));
  const warnings=source==='cutting'&&report?.timberStock?.unplaced?.length?[`В раскрое не размещено деталей: ${report.timberStock.unplaced.length}. Ведомость содержит только размещённые хлысты.`]:[];
  const missing=new Map();for(const row of unresolved){const key=`${row.name}:${row.reason}`;const previous=missing.get(key);missing.set(key,{...row,occurrences:(previous?.occurrences||0)+1});}
  const unplacedMembers=source==='cutting'?(report.fabricationMembers||report.members||[]).filter(m=>report.timberStock?.unplaced?.includes(m.id)).map(m=>({id:m.id,mark:m.displayMark||m.id,name:m.material,profile:m.profile,lengthMm:m.cutLength,volumeM3:(Number(m.cutLength)||0)*String(m.profile).split(/[×xх]/).map(Number).reduce((n,v)=>n*v,1)/1e9})):[];
  return {source,rows,detailRows:source==='cutting'?timberMaterialSummary(report.scopeMembers||report.members||[]):[],unplacedMembers,compositions:[...compositions.values()],unresolved:[...missing.values()],warnings,totalLengthM:round(rows.reduce((n,r)=>n+r.lengthM,0)),totalVolumeM3:round(rows.reduce((n,r)=>n+r.volumeM3,0)),settings};
}
