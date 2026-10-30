import { isEstimateAccessory, isEstimateCutting } from './estimate-line-types.js';

const TIMBER = /(доск|брус|пиломатериал|стропил|риг[её]л|лаг[аи]|мауэрлат|обреш[её]тк|контробреш[её]тк|каркас|пакет.*дос)/iu;
const ROOF_FINISH = /(профлист|металлочерепиц|кровельн.*покрыт|гидроизол|гидроизоляц|мембран|осб|цсп|планк|кон[её]к|водост|воронк|софит|капельник|уплотнител)/iu;
const ROLE_LABELS = { panel:'СИП-панели', timber:'Пиломатериал и каркас', cutting:'Раскрой', labor:'Монтаж и работы', accessory:'Крепёж и расходные материалы', material:'Прочие материалы' };
const ORDER = { foundation:0, sip:1, roof:2, terrace:3, openings:4, engineering:5, external:6, internal:7, delivery:8 };

function stageForLine(section, line) {
  if (/gable|фронтон/iu.test(`${line.id} ${line.estimateGroup||''} ${line.name}`)) return ['roof:gables','Фронтоны'];
  if (section.key === 'foundation') return /binding|обвязк/iu.test(`${line.id} ${line.name}`) ? ['foundation:binding','Обвязка фундамента'] : ['foundation:piles','Фундамент и разбивка осей'];
  if (section.key === 'sip') {
    const group = String(line.estimateGroup || 'Прочие СИП-конструкции');
    return [`sip:${group}`,group];
  }
  if (section.key === 'roof') {
    if (ROOF_FINISH.test(String(line.name || '')) && !TIMBER.test(String(line.name || ''))) return ['roof:cover','Покрытие и доборные элементы кровли'];
    return ['roof:frame','Каркас кровли'];
  }
  return [section.key,section.title];
}

function roleForLine(section, line) {
  if (isEstimateCutting(line)) return 'cutting';
  if (line.kind === 'labor') return 'labor';
  if (isEstimateAccessory(line)) return 'accessory';
  if (/сип-панел|(?:^|:)panel-|sip-panel/iu.test(`${line.id} ${line.name}`)) return 'panel';
  if (TIMBER.test(String(line.name || ''))) return 'timber';
  return 'material';
}

export function estimateLayerId(section, line) {
  const [stage] = stageForLine(section,line);
  return `${stage}|${roleForLine(section,line)}`;
}

export function isEstimateLayerIncluded(section, line, options = {}) {
  const excluded = options.excludedEstimateLayers;
  return !Array.isArray(excluded) || !excluded.includes(estimateLayerId(section,line));
}

export function estimateLayerStages(calculation) {
  const stages = new Map();
  for (const section of calculation.sections || []) for (const line of section.lines || []) {
    if (!(Number(line.qty) > 0)) continue;
    const [key,title] = stageForLine(section,line), role=roleForLine(section,line);
    if (!stages.has(key)) stages.set(key,{key,title,sectionKey:key.startsWith('roof:')?'roof':section.key,layers:new Map()});
    const stage=stages.get(key);
    if (!stage.layers.has(role)) stage.layers.set(role,{id:`${key}|${role}`,title:ROLE_LABELS[role],count:0,amount:0});
    const layer=stage.layers.get(role);
    layer.count++;
    layer.amount+=Number(line.qty)*Number(line.price);
  }
  return [...stages.values()].sort((a,b)=>(ORDER[a.sectionKey]??99)-(ORDER[b.sectionKey]??99)).map(stage=>({...stage,layers:[...stage.layers.values()],amount:[...stage.layers.values()].reduce((sum,layer)=>sum+layer.amount,0)}));
}
