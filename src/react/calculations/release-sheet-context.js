// Sheet captions use the same immutable building snapshot as their views.
// An axis reference does not claim that the local detail itself draws these axes.
export function releaseAxisReference(release){
 const axes=release.building?.settings?.axes;
 if(!Array.isArray(axes)||!axes.length)return 'Проектные оси не назначены';
 const valid=axes.filter(a=>a&&typeof a.name==='string'&&a.name&&['x','y'].includes(a.direction)&&a.coordinateMm!==''&&Number.isFinite(a.coordinateMm));
 if(valid.length!==axes.length)return 'Оси требуют исправления — см. диагностику общих видов';
 const names=valid.map(a=>a.name).join(', '),plans=release.views?.plans;
 const refs=Array.isArray(plans)?plans.map((_,i)=>`АР-П${i+1}`).join(', '):'';
 return refs?`Оси ${names}: привязки см. ${refs}`:`Оси ${names} назначены; общая схема отсутствует`;
}

// Preserve archived captions and revision metadata instead of silently rewriting
// a saved/checksummed manifest with the current renderer's defaults.
export function releaseSheetMetadata(release,page){
 const archived=Array.isArray(release.manifest)?release.manifest.find(p=>p?.id===page.id):null;
 if(!archived)return page;
 const result={...page};
 for(const field of ['id','group','title','scale','units','direction','axes'])if(typeof archived[field]==='string')result[field]=archived[field];
 return result;
}
