import { polygonBounds } from './production-cutting.js';

export const drawingCategory = surface => surface.id.startsWith('ФР-') ? 'gables' : surface.id.startsWith('КР-') ? 'roof' : surface.id.includes('-ПГ') ? 'partitions' : surface.id.endsWith('-ПТ') ? 'ceiling' : surface.id.endsWith('-ПОЛ') ? 'floor' : 'walls';

// Only rectangular gable roofs have an unambiguous automatic wall association.
// Manual links use geometry-bound keys: changing the wall never silently relinks it.
export function gableLinks(report, saved = {}) {
  const walls = report.surfaces.filter(s=>s.planStart);
  const highest = Math.max(0,...walls.map(s=>s.floor));
  const axis = report.assembly.axis === 'x' ? 0 : 1;
  const ends = walls.filter(s=>drawingCategory(s)==='walls'&&s.floor===highest && Math.abs(s.planStart[axis]-s.planEnd[axis])<1).sort((a,b)=>a.planStart[axis]-b.planStart[axis]);
  const result=[];
  for(const gable of report.surfaces.filter(s=>drawingCategory(s)==='gables')) {
    const override=saved[gable.layoutKey];
    let wall=override ? walls.find(s=>s.layoutKey===override.wallKey&&s.floor===gable.floor) : null;
    if(override&&['offset','elevation'].some(k=>override[k]!=null&&(!Number.isFinite(Number(override[k]))||Math.abs(Number(override[k]))>100000)))wall=null;
    let automatic=false;
    if(!override&&gable.parentWallId){wall=walls.find(s=>s.id===gable.parentWallId);automatic=!!wall;}
    if(!override && report.assembly.roofShape==='gable' && ends.length===2 && /^ФР-[12]$/.test(gable.id)) {
      wall=ends[Number(gable.id.slice(-1))-1];
      const box=polygonBounds(gable.geometry.flat());
      if(Math.abs(box.width-wall.width)>1)wall=null;
      automatic=!!wall;
    }
    result.push({gable,wall,automatic,stale:!!override&&!wall,offset:Number(override?.offset)||0,elevation:override?.elevation==null?wall?.height:Number(override.elevation),reverse:override?.reverse===true});
  }
  return result;
}

export function combinedWall(report, wall, links, mode='combined') {
  const related=links.filter(link=>link.wall?.layoutKey===wall.layoutKey);
  const sources=[...(mode==='gable'?[]:[{surface:wall,offset:0,elevation:0,reverse:false}]),...(mode==='wall'?[]:related.map(link=>({...link,surface:link.gable})))];
  const geometry=[],parts=[],members=[];
  for(const entry of sources){
    const {surface,offset,elevation,reverse}=entry, box=polygonBounds(surface.geometry.flat());
    const transform=([x,y])=>[(reverse?box.x+box.width-(x-box.x):x)+offset,y+elevation];
    const shape=s=>s.map(r=>r.map(transform));
    geometry.push(...surface.geometry.map(shape));
    for(const p of report.parts.filter(p=>p.surfaceId===surface.id)){
      const outline=shape(p.shape),b=polygonBounds(outline);
      parts.push({...p,shape:outline,x:b.x,y:b.y});
    }
    members.push(...report.members.filter(m=>m.surfaceId===surface.id).map(m=>({...m,a:m.a?transform(m.a):null,b:m.b?transform(m.b):null})));
  }
  return {surface:{...wall,name:`${wall.name}${mode==='combined'&&related.length?' с фронтоном':''}`,geometry,openings:mode==='gable'?[]:wall.openings},parts,members};
}

export function purchaseRows(report) {
  const groups=new Map();
  for(const sheet of report.panelStock.sheets){const key=`${sheet.family}:${sheet.thickness}:${sheet.width}:${sheet.height}`;
    const row=groups.get(key)||{id:key,name:`Панель ${sheet.thickness} мм`,profile:`${sheet.width}×${sheet.height}`,unit:'шт.',qty:0,ids:[]};row.qty++;row.ids.push(...sheet.parts.map(p=>p.id));groups.set(key,row);}
  for(const bar of report.timberStock.bars){const key=`${bar.material}:${bar.profile}`;
    const row=groups.get(key)||{id:key,name:bar.material,profile:`${bar.profile} · ${report.settings.stockLengthMm} мм`,unit:'шт.',qty:0,ids:[]};row.qty++;row.ids.push(...bar.parts.map(p=>p.id));groups.set(key,row);}
  for(const slope of report.roofCover?.slopes||[])for(const sheet of slope.sheets){
    const key=`cover:${sheet.blankWidth}:${sheet.blankLength}`;
    const row=groups.get(key)||{id:key,name:'Кровельный лист',profile:`${sheet.blankWidth}×${sheet.blankLength}`,unit:'шт.',qty:0,ids:[]};
    row.qty++;row.ids.push(sheet.id);groups.set(key,row);
  }
  return [...groups.values()];
}
