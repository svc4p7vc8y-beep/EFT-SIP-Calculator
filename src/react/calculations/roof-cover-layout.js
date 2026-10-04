// Geometry only. Widths and overlaps must come from the selected manufacturer's sheet.
export function roofCoverLayout(assembly, settings={}) {
 const useful=Number(settings.usefulWidth),gross=Number(settings.grossWidth),stock=Number(settings.stockLength),overlap=Number(settings.overlap)||0;
 const configured=settings.usefulWidth!==''&&settings.usefulWidth!=null;
 if(!configured)return {slopes:[],issues:[],configured:false};
 if(!(useful>0&&gross>=useful&&gross<=10000&&useful>=100&&overlap>=0&&overlap<=2000)||settings.stockLength!==''&&settings.stockLength!=null&&!(stock>overlap&&stock<=30000))return {slopes:[],issues:['Покрытие: проверьте полную/рабочую ширину, длину листа и нахлёст.'],configured:true};
 const axis=assembly.axis==='x'?0:1,points=assembly.roofOutline||[],width=Math.max(...points.map(p=>p[axis]))-Math.min(...points.map(p=>p[axis]));
 const slopes=[];
 for(const name of [...new Set(assembly.rafters.map(r=>r.name))]){
  const length=Math.max(...assembly.rafters.filter(r=>r.name===name).map(r=>r.length)),sheetLength=stock>0?stock:length;
  const columns=Math.max(1,Math.ceil(width/useful)),rows=Math.max(1,Math.ceil((length-overlap)/(sheetLength-overlap)));
  if(columns*rows>5000)return {slopes:[],issues:['Покрытие: более 5000 листов, проверьте размеры.'],configured:true};
  const sheets=Array.from({length:columns*rows},(_,i)=>{const c=i%columns,r=Math.floor(i/columns),x=c*useful,y=r*(sheetLength-overlap);return {id:`Л${i+1}`,x,y,width:Math.min(useful,width-x),height:Math.min(sheetLength,length-y),blankWidth:gross,blankLength:sheetLength};});
  slopes.push({name,width,length,sheets,columns,rows,stockArea:sheets.length*gross*sheetLength/1e6,netArea:width*length/1e6});
 }
 return {configured:true,slopes,issues:slopes.length?[]:['Покрытие: для этой формы нужны индивидуальные скаты; автоматическая карта не построена.']};
}
