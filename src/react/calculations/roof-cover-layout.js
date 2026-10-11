// Geometry only. Widths and overlaps must come from the selected manufacturer's sheet.
import clipping from 'polygon-clipping';
export function roofCoverLayout(assembly, settings={}) {
 const useful=Number(settings.usefulWidth),gross=Number(settings.grossWidth),stock=Number(settings.stockLength),overlap=Number(settings.overlap)||0;
 const configured=settings.usefulWidth!==''&&settings.usefulWidth!=null;
 if(!configured)return {slopes:[],issues:[],configured:false};
 if(!(useful>0&&gross>=useful&&gross<=10000&&useful>=100&&overlap>=0&&overlap<=2000)||settings.stockLength!==''&&settings.stockLength!=null&&!(stock>overlap&&stock<=30000))return {slopes:[],issues:['Покрытие: проверьте полную/рабочую ширину, длину листа и нахлёст.'],configured:true};
 const axis=assembly.axis==='x'?0:1,points=assembly.roofOutline||[],width=Math.max(...points.map(p=>p[axis]))-Math.min(...points.map(p=>p[axis]));
 const slopes=[];
 if(assembly.roofDrawing?.model){for(const f of assembly.roofModel.faces){
   const xs=f.polygon.map(p=>p[0]),ys=f.polygon.map(p=>p[1]),x0=Math.min(...xs),y0=Math.min(...ys),width=Math.max(...xs)-x0,length=Math.max(...ys)-y0,polygon=f.polygon.map(([x,y])=>[x-x0,y-y0]),ring=[...polygon,polygon[0]],sheetLength=stock>0?stock:length,columns=Math.ceil(width/useful),rows=sheetLength>=length?1:Math.ceil((length-overlap)/(sheetLength-overlap)),sheets=[];
   if(columns*rows>5000)return {slopes:[],issues:['Покрытие: более 5000 листов, проверьте размеры.'],configured:true};
   for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){const x=c*useful,y=r*(sheetLength-overlap),shape=clipping.intersection([ring],[[[x,y],[x+useful,y],[x+useful,y+sheetLength],[x,y+sheetLength],[x,y]]]);if(!shape.length)continue;
    const pts=shape.flat(2),xx=pts.map(p=>p[0]),yy=pts.map(p=>p[1]);sheets.push({id:`${f.id}-Л${sheets.length+1}`,x:Math.min(...xx),y:Math.min(...yy),width:Math.max(...xx)-Math.min(...xx),height:Math.max(...yy)-Math.min(...yy),shape,blankWidth:gross,blankLength:sheetLength});}
   slopes.push({id:f.id,name:f.name,width,length,geometry:[[ring]],sheets,columns,rows,stockArea:sheets.length*gross*sheetLength/1e6,netArea:f.area,faceId:f.id,localOrigin:[x0,y0]});
  }return {configured:true,slopes,issues:slopes.length?[]:['Покрытие: нет корректных проектных скатов.']};}
 for(const name of [...new Set(assembly.rafters.map(r=>r.name))]){
  const length=Math.max(...assembly.rafters.filter(r=>r.name===name).map(r=>r.length)),sheetLength=stock>0?stock:length;
  const columns=Math.max(1,Math.ceil(width/useful)),rows=sheetLength>=length?1:Math.max(1,Math.ceil((length-overlap)/(sheetLength-overlap)));
  if(columns*rows>5000)return {slopes:[],issues:['Покрытие: более 5000 листов, проверьте размеры.'],configured:true};
  const sheets=Array.from({length:columns*rows},(_,i)=>{const c=i%columns,r=Math.floor(i/columns),x=c*useful,y=r*(sheetLength-overlap);return {id:`СК${slopes.length+1}-Л${i+1}`,x,y,width:Math.min(useful,width-x),height:Math.min(sheetLength,length-y),blankWidth:gross,blankLength:sheetLength};});
  slopes.push({name,width,length,sheets,columns,rows,stockArea:sheets.length*gross*sheetLength/1e6,netArea:width*length/1e6});
 }
 return {configured:true,slopes,issues:slopes.length?[]:['Покрытие: для этой формы нужны индивидуальные скаты; автоматическая карта не построена.']};
}
