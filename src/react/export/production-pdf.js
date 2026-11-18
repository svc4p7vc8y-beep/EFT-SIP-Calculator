export function productionPdfHasContent(pixels){
 for(let p=0;p<pixels.length;p+=4)if(pixels[p+3]>0&&(pixels[p]<245||pixels[p+1]<245||pixels[p+2]<245))return true;
 return false;
}
// One bounded canvas at a time keeps multi-sheet export usable on tablets.
export async function downloadProductionPdf(source,{paper='A3',filename='Чертежи_ЭФТ',save=true}={}){
 if(!source)throw new Error('Печатные листы не сформированы.');
 const [{jsPDF},{toCanvas},{inlineEstimateSvgPaint}]=await Promise.all([import('jspdf'),import('html-to-image'),import('./download-estimate-pdf.js')]);
 const a4=paper==='A4',width=a4?281:404,height=a4?190:278;
 const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:a4?'a4':'a3',compress:true});
 const holder=document.createElement('div');holder.className=`mounting-album paper-${paper} production-pdf-export`;
 holder.style.cssText=`position:fixed;left:-20000px;top:0;width:${width}mm;height:${height}mm;background:#fff;color:#111;font:10pt Arial,sans-serif;z-index:-1;`;
 document.body.append(holder);
 try{
  const sheets=[...source.querySelectorAll('.mounting-sheet')];if(!sheets.length)throw new Error('Нет выбранных листов для PDF.');
  for(const [i,original]of sheets.entries()){
   const page=original.cloneNode(true),maps=page.querySelector('.panel-cut-map-page');
   page.style.cssText='width:100%;height:100%;box-sizing:border-box;padding:5mm;display:flex;flex-direction:column;background:#fff;color:#111;';
   const head=page.querySelector(':scope>header'),foot=page.querySelector(':scope>footer'),body=page.querySelector('.mounting-content');
   if(body)body.style.cssText='flex:1;min-height:0;display:flex;flex-direction:column;';
   if(head)head.style.cssText='font:17pt Arial,sans-serif;border-bottom:1px solid #111;margin-bottom:4mm;padding-bottom:3mm;flex:none;';
   if(foot)foot.style.cssText='font:9pt Arial,sans-serif;text-align:center;padding-top:3mm;flex:none;';
   if(maps){head?.remove();foot?.remove();page.querySelector('.release-sheet-meta')?.remove();page.style.padding='0';}
   else for(const svg of body?.querySelectorAll(':scope>svg')||[])svg.style.cssText='width:100%;height:0;flex:1;min-height:0;max-height:none;display:block;';
   holder.replaceChildren(page);await document.fonts?.ready;
   inlineEstimateSvgPaint(page);
   // Capture the page, not its offscreen holder: retaining the holder's negative
   // fixed position in a foreignObject produces a completely white PDF.
   const canvas=await toCanvas(page,{width:holder.clientWidth,height:holder.clientHeight,pixelRatio:1.5,backgroundColor:'#fff',skipFonts:true,cacheBust:false,style:{position:'static',left:'auto',top:'auto',margin:'0'}});
   const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
   if(!productionPdfHasContent(pixels))throw new Error('Браузер не отрисовал лист PDF. Повторите или используйте «Печать вида».');
   if(i)pdf.addPage(a4?'a4':'a3','landscape');
   pdf.addImage(canvas.toDataURL('image/png'),'PNG',8,8,width,height,undefined,'FAST');
   canvas.width=canvas.height=0;
  }
  const blob=pdf.output('blob');if(save)pdf.save(`${filename.replace(/[<>:"/\\|?*]/g,'-')}.pdf`);return blob;
 }finally{holder.remove();}
}
