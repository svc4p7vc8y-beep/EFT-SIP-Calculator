import WindowDiagram from '../screens/WindowDiagram.jsx';
export default function OpeningSketch({opening,product,index}){
 if(opening.type!=='window')return null;
 const label=`Окно ${index+1}`,ring=opening.displayOutline||opening.outline||[[0,0],[opening.width,0],[opening.width,opening.height],[0,opening.height]],maxX=Math.max(...ring.map(p=>p[0]),.1),maxY=Math.max(...ring.map(p=>p[1]),.1);
 const scale=Math.min(170/maxX,125/maxY);
 return <figure className="parameter-opening-sketch">{product?<WindowDiagram product={product} mark={label} dimensions={false}/>:<svg viewBox="0 0 240 175" role="img" aria-label={`Эскиз ${label.toLowerCase()} по контуру проёма`}><g transform={`translate(${(240-maxX*scale)/2} ${(175+maxY*scale)/2}) scale(${scale} ${-scale})`}><polygon points={ring.map(p=>p.join(',')).join(' ')} fill="#dceff2" stroke="#3c707c" strokeWidth="3" vectorEffect="non-scaling-stroke"/></g></svg>}<figcaption>{Math.round(opening.width*1000)} × {Math.round(opening.height*1000)} мм{product?' · конструкция изделия':' · контур проёма, конструкция не выбрана'}</figcaption></figure>;
}
