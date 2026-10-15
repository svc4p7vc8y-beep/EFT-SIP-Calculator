const EPS=1e-7;
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
const area=poly=>poly.reduce((sum,a,i)=>{const b=poly[(i+1)%poly.length];return sum+a[0]*b[1]-a[1]*b[0];},0)/2;
const round=value=>Math.round(value*1000)/1000;

export const hipEdgeKey=(a,b)=>[a,b].map(point=>point.map(value=>Math.round(value)).join(',')).sort().join('|');

export function convexHipContour(points){
 if(!Array.isArray(points)||points.length<3||points.length>100)throw new Error('Для вальмовой крыши нужны 3–100 точек замкнутого контура.');
 const input=points.map(point=>Array.isArray(point)?point:[point?.x,point?.y]);
 if(input.some(point=>point.length!==2||point.some(value=>!Number.isFinite(value)||Math.abs(value)>100000)))throw new Error('Точки контура должны иметь конечные координаты XY в пределах ±100000 мм.');
 const clean=input.filter((point,i)=>i===0||Math.hypot(point[0]-input[i-1][0],point[1]-input[i-1][1])>.001);
 if(clean.length>3&&Math.hypot(clean[0][0]-clean.at(-1)[0],clean[0][1]-clean.at(-1)[1])<.001)clean.pop();
 if(clean.length<3||Math.abs(area(clean))<1)throw new Error('Контур крыши имеет нулевую площадь.');
 const oriented=area(clean)>0?clean:[...clean].reverse();
 const compact=oriented.filter((point,i,list)=>Math.abs(cross(list[(i+list.length-1)%list.length],point,list[(i+1)%list.length]))>.01);
 if(compact.length<3||compact.some((point,i)=>cross(point,compact[(i+1)%compact.length],compact[(i+2)%compact.length])<.01))throw new Error('Контур для этого режима должен быть выпуклым. Для Г-образной крыши выберите схему по высоте или задайте проектные скаты XYZ.');
 return compact;
}

function clip(poly,plane){
 const result=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],da=plane(a),db=plane(b);
  if(da<=EPS)result.push(a);
  if((da<-EPS&&db>EPS)||(da>EPS&&db<-EPS)){
   const t=da/(da-db);result.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);
  }
 }
 return result.filter((point,i)=>i===0||Math.hypot(point[0]-result[i-1][0],point[1]-result[i-1][1])>.001);
}

export function hipRoofFromContour(points,{angleDeg,edgeAngles={},overhangMm=0,roofBase,eaveZ=''}={}){
 const contour=convexHipContour(points);
 if(!Number.isFinite(overhangMm)||overhangMm<0||overhangMm>10000)throw new Error('Свес должен быть от 0 до 10000 мм.');
 if(!Number.isFinite(roofBase))throw new Error('Нужна отметка опирания крыши.');
 const slopes=contour.map((a,i)=>{
  const b=contour[(i+1)%contour.length],key=hipEdgeKey(a,b),override=edgeAngles[key],angle=override===''||override==null?angleDeg:Number(override);
  if(!Number.isFinite(angle)||angle<=0||angle>=80)throw new Error(`Ребро ${i+1}: угол ската должен быть больше 0° и меньше 80°.`);
  const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),n=[-dy/length,dx/length];
  return {index:i,key,angleDeg:angle,n,c:n[0]*a[0]+n[1]*a[1]-overhangMm,slope:Math.tan(angle*Math.PI/180)};
 });
 const distinct=slopes.some(item=>Math.abs(item.angleDeg-slopes[0].angleDeg)>1e-8);
 if(distinct&&overhangMm>0&&eaveZ==='')throw new Error('Для разных углов и общего уровня карнизов со свесом задайте отметку карниза Z. Проверьте высоты опирания на стены.');
 const base=eaveZ===''?roofBase-overhangMm*slopes[0].slope:Number(eaveZ);
 if(!Number.isFinite(base)||Math.abs(base)>100000)throw new Error('Нужна конечная отметка карниза Z в мм.');
 const eaves=slopes.map((item,i)=>{
  const previous=slopes[(i+slopes.length-1)%slopes.length],det=previous.n[0]*item.n[1]-previous.n[1]*item.n[0];
  if(Math.abs(det)<1e-8)throw new Error('Соседние грани контура параллельны.');
  return [(previous.c*item.n[1]-previous.n[1]*item.c)/det,(previous.n[0]*item.c-previous.c*item.n[0])/det];
 });
 const height=(item,point)=>base+item.slope*(item.n[0]*point[0]+item.n[1]*point[1]-item.c);
 const facets=[];
 for(const item of slopes){
  let polygon=eaves;
  for(const other of slopes){if(other===item)continue;polygon=clip(polygon,point=>height(item,point)-height(other,point));if(polygon.length<3)break;}
  if(polygon.length<3||Math.abs(area(polygon))<1)continue;
  facets.push({edgeKey:item.key,angleDeg:item.angleDeg,vertices:polygon.map(point=>[round(point[0]),round(point[1]),round(height(item,point))])});
 }
 if(facets.length<3)throw new Error('Не удалось получить замкнутые скаты. Проверьте углы и контур.');
 const topZ=Math.max(...facets.flatMap(facet=>facet.vertices.map(point=>point[2])));
 return {contour,eaves,facets,eaveZ:base,topZ,riseMm:topZ-base,edgeAngles:slopes.map(item=>({key:item.key,angleDeg:item.angleDeg})),wallAlignmentReview:distinct&&overhangMm>0};
}
