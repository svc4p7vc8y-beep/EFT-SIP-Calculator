import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
export async function openPreviewPdf(source) {
  const pdf=await import('pdfjs-dist/build/pdf.mjs');
  pdf.GlobalWorkerOptions.workerSrc=workerUrl;
  const task=pdf.getDocument(typeof source==='string'?{url:source,withCredentials:true,isEvalSupported:false}:{data:new Uint8Array(await source.arrayBuffer()),isEvalSupported:false});
  const document=await task.promise;
  return {numPages:document.numPages,getPage:number=>document.getPage(number),destroy:()=>task.destroy()};
}
export async function renderPdfPage(document,pageNumber=1,width=320) {
  const page=await document.getPage(pageNumber),base=page.getViewport({scale:1});
  const viewport=page.getViewport({scale:width/base.width}),canvas=window.document.createElement('canvas');
  canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
  return canvas.toDataURL('image/jpeg',.82);
}
