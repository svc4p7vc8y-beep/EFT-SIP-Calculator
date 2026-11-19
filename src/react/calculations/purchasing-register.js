// A view of the final estimate: no new reserves, prices or material norms.
export function purchaseLayer(line, titles = {}) {
  const source = String(line.source || '');
  if (line.section === 'sip') {
    const key = source.replace(/^sip-/, '').replace(/-(joints|edges)$/, '');
    const names = {floor:'Пол',secondFloor:'Межэтажное перекрытие',walls:'Стены 1 этажа',wallsSecondFloor:'Стены 2 этажа',ceiling:'Потолок',partitions:'Перегородки 1 этажа',partitionsSecondFloor:'Перегородки 2 этажа'};
    if (names[key]) return {id:`sip:${key}`,name:names[key]};
    if (/partition/.test(source)) return {id:'sip:partitions',name:'Перегородки 1 этажа'};
  }
  return {id:line.section || 'other',name:titles[line.section] || line.section || 'Прочие материалы'};
}
export const isPurchaseFastener = name => /креп[её]ж|саморез|шуруп|глухар|гвозд|анкер|болт|шпильк|гайк|шайб|скоб|перфорирован|опора бруса|держатель балки/i.test(name);
export function purchasingRegister(calculation, selected = null) {
  const titles = Object.fromEntries((calculation.sections || []).map(s=>[s.key,s.title]));
  const layers = new Map(), groups = new Map(), fasteners = new Map();
  const includes = id => selected == null || selected.includes(id);
  for (const line of calculation.lines || []) {
    if (line.kind !== 'material' || !(Number(line.qty)>0)) continue;
    const layer = purchaseLayer(line,titles); layers.set(layer.id,layer);
    if (!includes(layer.id)) continue;
    // Keep different sizes, units, groups and project prices separate.
    const key = JSON.stringify([layer.id,line.estimateGroup||'',line.catalogId||'',line.name,line.unit,Number(line.price)||0]);
    const row = groups.get(key) || {id:key,layer:layer.name,layerId:layer.id,group:line.estimateGroup||'',catalogId:line.catalogId||'',name:line.name,unit:line.unit,qty:0,price:Number(line.price)||0,amount:0,fastener:isPurchaseFastener(line.name),manual:false};
    row.qty += Number(line.qty); row.amount += Number(line.qty)*(Number(line.price)||0);
    row.manual ||= !!line.projectOverride || !!line.custom;
    groups.set(key,row);
  }
  // Node overrides have their own purchase calculation. Show it as a separate
  // reference list, never add it to estimate materials a second time.
  for (const item of calculation.nodeFasteners?.rows || []) {
    if (!(item.purchaseQty>0)) continue;
    const layer={id:`nodes:${item.section}`,name:`Крепёж узлов · ${item.section}`};layers.set(layer.id,layer);
    if (!includes(layer.id)) continue;
    const names={'screw':'Саморез','structural-screw':'Конструкционный саморез','lag-screw':'Глухарь','nail':'Гвоздь','anchor':'Анкер','bolt':'Болт'};
    const name=names[item.fastenerType]||(item.fastenerType==='project-selected'?`Крепёж по проекту · ${item.node||'выбранный узел'}`:item.fastenerType);
    const key=JSON.stringify([layer.id,name,item.size,item.packSize]);
    const row=fasteners.get(key)||{id:key,layer:layer.name,name,size:item.size==='—'?'Типоразмер не выбран — уточнить перед заказом':item.size,qty:0,unit:'шт',packs:0,packSize:item.packSize||null,unassigned:item.size==='—'};
    row.qty+=item.purchaseQty;
    row.packs=item.purchasePacks==null?null:row.packs==null?null:row.packs+item.purchasePacks;
    fasteners.set(key,row);
  }
  const rows=[...groups.values()].map(r=>({...r,qty:Math.round(r.qty*1e8)/1e8}));
  return {layers:[...layers.values()],materials:rows.filter(r=>!r.fastener),fasteners:rows.filter(r=>r.fastener),nodeFasteners:[...fasteners.values()],total:rows.reduce((n,r)=>n+r.amount,0)};
}
