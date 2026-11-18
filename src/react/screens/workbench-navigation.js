export const DOCUMENT_GROUPS=['Общие данные','Основание и обвязка','Пол и перекрытия','Стены и фронтоны','Кровля и опоры','Спецификации','Карты раскроя'];
export function workbenchDocumentGroup(title){
 if(/^Карты раскроя/.test(title))return 'Карты раскроя';
 if(/^(Состав|Ведомость листов|Марки и узлы|Замечания|Монтажный план)/.test(title))return 'Общие данные';
 if(/^(Закупка|Сводная|Каталог|Обвязка и несущие)/.test(title))return 'Спецификации';
 if(/Свайное|Основание|Бетонные|обвязки|^Н1 /.test(title))return 'Основание и обвязка';
 if(/Стена|стеновых|Стеновые|Перегород|перегород|Фронтон|^Н3/.test(title))return 'Стены и фронтоны';
 if(/Пол|Потолок|Перекрытие|перекрыти/.test(title))return 'Пол и перекрытия';
 if(/кровл|Крыш|Строп|Обреш|Покрытие|^Н4|Прогон|опор/i.test(title))return 'Кровля и опоры';
 return 'Спецификации';
}
export function groupedWorkbenchPages(pages){return DOCUMENT_GROUPS.map(name=>({name,pages:pages.filter(page=>workbenchDocumentGroup(page.title)===name)})).filter(group=>group.pages.length);}
export function selectedPanelMap(maps,sheets,selection){
 const sheet=sheets.find(s=>s.parts.some(p=>selection.includes(p.id)));
 return sheet?maps.find(map=>map.ids.includes(sheet.id)):undefined;
}
export function panelMapHighlight(map,sheets,selection){
 const result=new Set(selection);
 for(const sheet of sheets.filter(s=>map.ids.includes(s.id)))sheet.parts.forEach((part,i)=>{if(selection.includes(part.id)&&map.sheet.parts[i])result.add(map.sheet.parts[i].id);});
 return [...result];
}
export function clampDrawingZoom(value){return Math.min(4,Math.max(.5,Number.isFinite(value)?value:1));}
export function pinchDrawingView(start,a,b){
 const distance=Math.hypot(b[0]-a[0],b[1]-a[1]);
 const zoom=clampDrawingZoom(start.zoom*distance/Math.max(start.distance,1));
 return {zoom,offset:[start.offset[0]+(a[0]+b[0])/2-start.center[0],start.offset[1]+(a[1]+b[1])/2-start.center[1]]};
}

export function fabricationSelection(report,selection){return [...new Set([...selection,...(report.fabricationMembers||[]).filter(p=>selection.includes(p.assemblyMemberId)).map(p=>p.id)])];}
