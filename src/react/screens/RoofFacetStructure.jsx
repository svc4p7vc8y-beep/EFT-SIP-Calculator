import {roofLocal,roofHeight} from '../calculations/roof-project.js';

const line=(a,b)=>({x1:a[0],y1:a[1],x2:b[0],y2:b[1]});
const edgeNames={ridge:'Конёк',hip:'Вальмовое ребро',valley:'Ендова',joint:'Стык / примыкание',eave:'Карниз',verge:'Торец'};

export default function RoofFacetStructure({face,selected='',onSelect}){
  const all=face.polygon,x=Math.min(...all.map(p=>p[0])),y=Math.min(...all.map(p=>p[1])),w=Math.max(...all.map(p=>p[0]))-x,h=Math.max(...all.map(p=>p[1]))-y,size=Math.max(w,h,1000),pad=size*.12,font=size*.023;
  const member=entry=>{
    const a=entry.worldA||entry.a,b=entry.worldB||entry.b;
    return a?.length===3&&b?.length===3?[roofLocal(face,a),roofLocal(face,b)]:null;
  };
  const lines=[...face.members.map(item=>({item,isSupport:false})),...face.supports.map(item=>({item,isSupport:true}))].flatMap(({item,isSupport})=>{const points=member(item);return points?[{item,points,isSupport}]:[];});
  return <svg className="roof-document-drawing roof-facet-structure" role="img" aria-label={`Конструктивная развёртка ската ${face.name}`} viewBox={`${x-pad} ${y-pad} ${w+2*pad} ${h+2*pad}`}>
    <polygon points={all.map(p=>p.join(',')).join(' ')} fill="#fff" stroke="#253229" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
    {face.edges.map(edge=>{const a=roofLocal(face,edge.a),b=roofLocal(face,edge.b);return <g key={edge.id}><line {...line(a,b)} stroke={edge.kind==='valley'?'#226fa2':edge.kind==='ridge'?'#884d28':'#68786d'} strokeWidth={['ridge','hip','valley'].includes(edge.kind)?2:1} vectorEffect="non-scaling-stroke"/><text x={(a[0]+b[0])/2} y={(a[1]+b[1])/2-font*.4} fontSize={font*.7} textAnchor="middle">{edge.id} · {edgeNames[edge.kind]}</text></g>;})}
    {lines.map(({item,points,isSupport})=>{const [a,b]=points;return <g key={item.id} role={onSelect?'button':undefined} tabIndex={onSelect?0:undefined} onClick={()=>onSelect?.(item.mark||item.id)} onKeyDown={event=>{if(event.key==='Enter')onSelect?.(item.mark||item.id);}}><line {...line(a,b)} stroke={selected===(item.mark||item.id)?'#0a7046':isSupport?item.type==='post'?'#b05f22':'#684c2d':'#84928a'} strokeDasharray={item.referenceOnly?'7 4':undefined} strokeWidth={isSupport?2:1} vectorEffect="non-scaling-stroke"/>{isSupport?<><circle cx={a[0]} cy={a[1]} r={font*.13} fill="#684c2d"/><text x={(a[0]+b[0])/2} y={(a[1]+b[1])/2-font*.3} fontSize={font*.72} textAnchor="middle">{item.mark||item.id}</text></>:null}<title>{`${item.name||item.material||item.id} · ${item.profile||'сечение по проекту'} · ${item.nodeRef||'узел не задан'}`}</title></g>;})}
    {face.features.map(feature=>{const point=roofLocal(face,[feature.x,feature.y,roofHeight(face,feature.x,feature.y)]);return <g key={feature.id}><circle cx={point[0]} cy={point[1]} r={font*.3} fill="white" stroke="#000"/><text x={point[0]+font*.4} y={point[1]} fontSize={font*.8}>{feature.id}</text></g>;})}
    <text x={x+w/2} y={y+h+pad*.65} fontSize={font} textAnchor="middle">{face.id} · истинные размеры в плоскости ската, мм · {face.angle.toFixed(1)}°</text>
  </svg>;
}
