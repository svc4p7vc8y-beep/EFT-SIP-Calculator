import {WINDOW_REFERENCE_ITEMS,windowQuote,createWindowFromReference,resizeWindowProduct,windowConstructionKey,windowGeometry} from './window-products.js';
// Choosing a construction never replaces the plan's opening dimensions.
export function fitWindowChoice(project,product){
 const plan=[project.plan,...(project.upperFloors||[])].find(p=>p.openings?.some(o=>o.id===product.openingId)),opening=plan?.openings.find(o=>o.id===product.openingId);if(!opening)return product;
 const old=project.windowProducts.find(p=>p.openingId===opening.id),facade=plan.facades?.find(f=>f.id===opening.facadeId),gap=Number(facade?.clearanceMm)||0,source=old?.installationGaps||product.installationGaps||{},gaps=Object.fromEntries(['leftMm','rightMm','topMm','bottomMm'].map(k=>[k,Number(source[k]??gap)||0]));
 const width=Math.max(50,opening.width*1000-gaps.leftMm-gaps.rightMm),height=Math.max(50,opening.height*1000-gaps.topMm-gaps.bottomMm),shape=opening.facadeId&&old?old.shape:product.shape;
 const proportions=opening.facadeId&&old?old:product,oldHeight=Math.max(...windowGeometry(proportions).vertices.map(p=>p[1]),1);
 let next=resizeWindowProduct(product,{widthMm:width,baseWidthMm:width,heightMm:height,shape,apexPosition:proportions.apexPosition,...(shape==='trapezoid_sloped_top'?{leftHeightMm:(proportions.leftHeightMm||oldHeight)*height/oldHeight,rightHeightMm:(proportions.rightHeightMm||oldHeight)*height/oldHeight}:{}),installationGaps:gaps,roughOpening:{widthMm:opening.width*1000,heightMm:opening.height*1000,source:'Размер проёма на плане'}});
 if(['manual','parametric'].includes(product.price?.mode))return next;
 const candidates=WINDOW_REFERENCE_ITEMS.map(item=>({item,base:createWindowFromReference(item)})).filter(c=>windowConstructionKey(c.base)===windowConstructionKey(next)).sort((a,b)=>Math.abs(Math.log(a.item.areaM2Exact/windowGeometry(next).areaM2))-Math.abs(Math.log(b.item.areaM2Exact/windowGeometry(next).areaM2)));
 if(candidates.length){const preferred=Number(product.price?.referenceNumber)||Number(String(product.presetId||'').match(/^\d+-(\d+)$/)?.[1]),item=(candidates.find(c=>c.item.number===preferred&&windowQuote(c.item).quoteId===(product.price?.referenceQuoteId||product.price?.sourceId||String(product.presetId||'').split('-')[0]))||candidates[0]).item;next={...next,price:{...next.price,mode:'reference_area',referenceNumber:item.number,referenceQuoteId:windowQuote(item).quoteId,baseAmountRub:item.priceRubExact,baseAreaM2:item.areaM2Exact},geometryPriceReview:false};}else next={...next,price:{...next.price,mode:'design_unpriced'},geometryPriceReview:false};
 return next;
}
export function sectionShare(sections,index,percent){
 const fraction=Math.max(.01,Math.min(.99,Number(percent)/100)),other=sections.reduce((sum,s,i)=>sum+(i===index?0:Number(s.ratio)||1),0)||1;
 return sections.map((s,i)=>({...s,widthMm:null,ratio:i===index?fraction/(1-fraction)*other:Number(s.ratio)||1}));
}

export function suggestWindowForOpening(project,openingId){
 const opening=[project.plan,...(project.upperFloors||[])].flatMap(p=>p.openings||[]).find(o=>o.id===openingId);if(!opening)return null;
 const ring=opening.displayOutline||opening.outline||[],vertices=[...new Map(ring.map(p=>[JSON.stringify(p),p])).values()],shape=vertices.length===3?'triangle':vertices.length===4&&new Set(vertices.map(p=>p[1])).size>2?'trapezoid_sloped_top':'rectangle',w=Number(opening.width)*1000,h=Number(opening.height)*1000;
 const candidates=WINDOW_REFERENCE_ITEMS.filter(i=>i.shape===shape).slice().sort((a,b)=>Math.abs(Math.log((a.widthMm||a.baseWidthMm)/w))+Math.abs(Math.log((a.heightMm||Math.max(a.leftHeightMm,a.rightHeightMm))/h))-(Math.abs(Math.log((b.widthMm||b.baseWidthMm)/w))+Math.abs(Math.log((b.heightMm||Math.max(b.leftHeightMm,b.rightHeightMm))/h))));
 return candidates.length?fitWindowChoice(project,createWindowFromReference(candidates[0],{openingId})):null;
}

export function windowDivision(product,axis){
 const first={id:'section-1',openingMode:'fixed',...(product.sections?.[0]||{}),widthMm:null,ratio:1};
 if(axis==='none')return {sectionAxis:'vertical',sections:[first]};
 return {sectionAxis:axis==='horizontal'?'horizontal':'vertical',sections:product.sections?.length>1?product.sections.map(s=>({...s,widthMm:null})): [first,{id:'section-2',openingMode:'fixed',ratio:1,widthMm:null,hardwareSystem:null,handleSide:null}]};
}
