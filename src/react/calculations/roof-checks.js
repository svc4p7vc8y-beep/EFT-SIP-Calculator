import {roofAt} from './roof-project.js';
import {roofPanelCapacityChecks} from './roof-panel-capacity.js';
export function roofChecks(project,assembly){
 const d=project.settings.productionCutting?.roofDesign||{},model=assembly.roofModel,checks=[];
 const add=(code,ok,message,path)=>checks.push({code,status:ok?'provided':'open',message,path});
 if(!project.services.roof)return [];
 add('MODEL',d.enabled===true,'Единая геометрия кровли для видов и производства','Кровля: проект → применить модель');
 add('SITE',!!d.site?.trim()&&!!d.climate?.trim(),'Адрес/район строительства и условия участка','Кровля: проект → исходные данные');
 add('LEVELS',d.baseZ!==''&&Number.isFinite(d.baseZ)&&Math.abs(d.baseZ)<=100000,'Проектная отметка основания крыши от нуля; опирание и зазоры согласованы разрезом','Кровля: проект → отметка основания / рабочий разрез');
 for(const [key,label]of [['snow','Снеговая нагрузка'],['wind','Ветровая нагрузка'],['deadLoad','Постоянная нагрузка']])add(key.toUpperCase(),d[key]!==''&&Number.isFinite(d[key])&&d[key]>=0,`${label}, кПа · значение из расчётного документа`,'Кровля: проект → нагрузки');
 add('STRUCTURE',!!d.structuralDocument?.trim()&&!!d.reviewer?.trim(), 'Расчёт конструктора и проверяющий; отдельное подтверждение текущей ревизии обязательно','Кровля: проект → документы / Документация → проверки конструктора');
 add('NODES',!!d.nodeDocument?.trim(),'Альбом рабочих узлов для выбранных рёбер, опор и примыканий','Кровля: проект → документы');
 add('COVER',!!d.coverDocument?.trim(),'Паспорт покрытия и нахлёсты','Кровля: проект → документы / Покрытие');
 add('MIN_SLOPE',d.minSlope!==''&&Number.isFinite(d.minSlope)&&d.minSlope>=0&&(model?.faces||[]).every(f=>f.slopePercent+.001>=d.minSlope),'Все скаты соответствуют заданному паспортному минимуму уклона, %','Кровля: проект → паспортный уклон / параметры кровли');
 if(model?.faces.some(f=>f.warm)){
  add('PANEL_DOCUMENT',!!d.panelDocument?.trim(),'Паспорт SIP-панели и схема допустимых нагрузок','Кровля: проект → документы');
  add('PANEL_SPAN',d.panelSpan!==''&&Number.isFinite(d.panelSpan)&&d.panelSpan>0,'Допустимый пролёт SIP по паспорту; фактические опоры проверяет конструктор','Кровля: проект → паспорт SIP / опоры');
 }
 add('DRAIN',!!d.drainageNote?.trim(),'Водоотвод и расположение водоприёмников','Кровля: проект → водоотвод');
 add('WATERPROOF',!!d.waterproofDocument?.trim(),'Примыкания, проходки и герметизация по рабочим узлам','Кровля: проект → документы');
 add('THERMAL',!!d.thermalDocument?.trim(),'Тепловой контур, вентиляция либо обоснование невентилируемой схемы','Кровля: проект → документы');
 for(const f of model?.faces||[])add(`FACE_NODE:${f.id}`,!!f.nodeRef?.trim(),`${f.id}: рабочие узлы крепления, опирания и обработки деталей ската`,'Кровля: проект → карточка ската / проверки конструктора');
 if(project.settings.roof.flatSlopeMode==='tapered')add('TAPER',!!d.taperMaterial?.trim()&&d.taperMinThickness!==''&&Number.isFinite(d.taperMinThickness)&&d.taperMinThickness>0,'Материал разуклонки и минимальная толщина по проекту','Кровля: проект → разуклонка');
 add('VENTILATION',d.ventilationGap!==''&&Number.isFinite(d.ventilationGap)&&d.ventilationGap>=0,'Проектный вентзазор (0 допускается только с обоснованием невентилируемой схемы)','Кровля: проект → тепло/вентиляция');
 if(calculationCoverNeeded(project))add('SHEET',Number(project.settings.productionCutting?.roofSheets?.usefulWidth)>0,'Рабочая ширина листа покрытия из паспорта','Кровля → Листы покрытия');
 for(const feature of d.features||[]){const hits=model&&[feature.x,feature.y].every(Number.isFinite)?roofAt(model,feature.x,feature.y):[];add(`FEATURE:${feature.id}`,hits?.some(h=>h.face.id===feature.faceId)&&!!feature.nodeRef?.trim(),`${feature.name||feature.id}: точка внутри своего ската и рабочий узел`,'Кровля: проект → элементы');}
 for(const f of d.features||[])if(f.type==='penetration')add(`OPENING:${f.id}`,false,`${f.id}: обозначение проходки не задаёт вырез и обрамление; внесите согласованный раскрой и узел`,'Кровля: проект → проектные элементы / ручные детали');
 if(model?.faces.length===0)add('SURFACES',false,'Нет корректных проектных скатов','Кровля: проект → геометрия');
 for(const check of roofPanelCapacityChecks(model,d.engineering,d))checks.push({...check,path:'Кровля: проект → паспортная проверка SIP'});
 return checks;
}
function calculationCoverNeeded(project){return project.settings.roof.includeCovering!==false;}
