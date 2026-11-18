const escape=text=>String(text||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function productionPrintDocument({html,title,styles='',paper='A3'}){
 const a4=paper==='A4';
 return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title>${styles}<style>
 html,body{background:#fff!important;color:#111;margin:0;padding:0;height:auto!important;overflow:visible!important;font-family:Arial,sans-serif;}
 .production-print{display:block!important;width:${a4?281:404}mm;max-width:none;margin:0 auto;}
 .print-toolbar{position:sticky;top:0;z-index:100;background:#eff5e9;border-bottom:1px solid #adc39c;padding:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;font:14px Arial,sans-serif;}
 .print-toolbar button{padding:12px 18px;border:1px solid #90ac7d;border-radius:8px;background:white;color:#173c20;font:inherit;cursor:pointer;}
 @media screen{.production-print>.mounting-sheet{width:100%;height:${a4?190:278}mm;box-sizing:border-box;padding:5mm;display:flex;flex-direction:column;page-break-after:always;}.mounting-content{flex:1;min-height:0;}.mounting-sheet>header{font-size:17pt;border-bottom:1px solid;padding-bottom:3mm;margin-bottom:5mm;}.mounting-sheet>footer{font-size:9pt;text-align:center;}.mounting-sheet:has(.panel-cut-map-page)>header,.mounting-sheet:has(.panel-cut-map-page)>footer{display:none;}.mounting-sheet:has(.panel-cut-map-page){padding:0;}}
 @media print{@page{size:${a4?'A4':'A3'} landscape;margin:8mm;} .print-toolbar{display:none!important;} .production-print{margin:0!important;}body.print-production>.production-print{display:block!important;} .mounting-sheet{break-inside:avoid;page-break-inside:avoid;}}
 </style></head><body class="print-production"><nav class="print-toolbar"><button id="print-again" type="button">Печать / Сохранить PDF</button><span id="print-status">Подготавливаю листы…</span></nav>${html}</body></html>`;
}
// A visible, independent document avoids WebKit taking a snapshot of a just-mounted,
// hidden React portal. The repeat button always starts printing inside a user gesture.
export function openProductionPrint(element,{title='ЭФТ · чертежи',paper='A3',autoPrint=true,host=window}={}){
 if(!element)throw new Error('Печатный лист не сформирован.');
 const target=host.open('','_blank');
 if(!target)throw new Error('Браузер заблокировал окно печати. Разрешите всплывающие окна для калькулятора и повторите.');
 const doc=element.ownerDocument,styles=[...doc.querySelectorAll('link[rel="stylesheet"],style')].map(el=>el.tagName==='LINK'?`<link rel="stylesheet" href="${escape(el.href)}">`:el.outerHTML).join('\n');
 target.document.open();target.document.write(productionPrintDocument({html:element.outerHTML,title,styles,paper}));target.document.close();
 const print=()=>{target.focus();target.print();};
 let prepared=false;
 const ready=async()=>{
  if(prepared)return;prepared=true;
  try{await target.document.fonts?.ready;}catch{/* System fonts still permit printing. */}
  target.requestAnimationFrame(()=>target.requestAnimationFrame(()=>{
   const button=target.document.getElementById('print-again'),status=target.document.getElementById('print-status');
   button?.addEventListener('click',print);if(status)status.textContent='Листы готовы. На iPad можно также выбрать «Поделиться» → «Напечатать».';
   if(autoPrint)print();
  }));
 };
 target.addEventListener('load',ready,{once:true});
 if(target.document.readyState==='complete')ready();
 return target;
}
