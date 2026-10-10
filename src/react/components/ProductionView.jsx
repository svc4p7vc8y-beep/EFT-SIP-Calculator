import { memo,useMemo } from 'react';
import { productionView } from '../calculations/production-views.js';
const path=rings=>rings.map(r=>r.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')+'Z').join(' ');
export default memo(function ProductionView({report,project,yaw=35,layers,frame=false,floor,surfaceIds,title='Аксонометрия домокомплекта'}){
  const view=useMemo(()=>productionView(report,project,{yaw,layers,frame,floor,surfaceIds}),[report,project,yaw,layers,frame,floor,surfaceIds]);
  return <figure className="release-model-view"><svg viewBox={view.viewBox.join(' ')} role="img" aria-label={title}>{view.faces.map((f,i)=><path key={i} data-element-id={f.id} d={path(f.rings)} fill={f.color} fillRule="evenodd" stroke="#343b32" strokeWidth=".45" vectorEffect="non-scaling-stroke"><title>{f.id}</title></path>)}</svg><figcaption>{title}{view.missing.length?` · без привязки: ${view.missing.join(', ')}`:''}</figcaption></figure>;
});
