import {windowGeometry,resizeWindowProduct} from './window-products.js';

export function replaceWindowForOpening(project,product){
 const old=product.openingId&&project.windowProducts?.find(p=>p.openingId===product.openingId);
 const replacement={...product,...(old?.facadeId?{facadeId:old.facadeId}:{})};
 project.windowProducts=[...(project.windowProducts||[]).filter(p=>!product.openingId||p.openingId!==product.openingId),replacement];
 return synchronizeWindowOpening(project,replacement);
}

export function synchronizeWindowOpening(project,product){
 const plan=[project.plan,...(project.upperFloors||[])].find(p=>p.openings?.some(o=>o.id===product.openingId)),opening=plan?.openings.find(o=>o.id===product.openingId);
 if(!opening)return project;
 const geometry=windowGeometry(product);if(!(geometry.areaM2>0))return project;
 const facade=plan.facades?.find(f=>f.id===opening.facadeId),gap=Number(facade?.clearanceMm)||0,gaps=product.installationGaps||{};
 const left=Number(gaps.leftMm??gap)||0,right=Number(gaps.rightMm??gap)||0,bottom=Number(gaps.bottomMm??gap)||0,top=Number(gaps.topMm??gap)||0;
 const width=Number(product.widthMm||product.baseWidthMm),height=Math.max(...geometry.vertices.map(p=>p[1]));
 const oldWidth=Number(opening.width);opening.width=(width+left+right)/1000;if(facade){const a=(Number(opening.angle)||0)*Math.PI/180;opening.x+=Math.cos(a)*(opening.width-oldWidth)/2;opening.y+=Math.sin(a)*(opening.width-oldWidth)/2;}opening.height=(height+top+bottom)/1000;
 opening.displayOutline=geometry.vertices.map(([x,y])=>[(x+left)/1000,(y+bottom)/1000]);
 opening.productShape=product.shape!=='rectangle';
 opening.outline=geometry.vertices.map(([x,y])=>[(x/Math.max(1,width)*(width+left+right))/1000,(y/Math.max(1,height)*(height+top+bottom))/1000]);
 if(facade){const key=opening.facadeWindowKey;facade.windowOverrides={...facade.windowOverrides,[key]:{...facade.windowOverrides?.[key],widthMm:width,heightMm:height,shape:product.shape==='trapezoid_sloped_top'?'auto':product.shape,apexPosition:product.apexPosition,productTemplate:structuredClone(product)}};}
 return project;
}
export function updateLinkedWindowDimensions(project,opening,widthMm,heightMm){
 const product=project.windowProducts?.find(p=>p.openingId===opening.id);if(!product){opening.width=widthMm/1000;opening.height=heightMm/1000;return;}
 const facade=[project.plan,...(project.upperFloors||[])].flatMap(p=>p.facades||[]).find(f=>f.id===opening.facadeId),gap=Number(facade?.clearanceMm)||0,g=product.installationGaps||{},oldHeight=Math.max(Number(product.heightMm)||0,Number(product.leftHeightMm)||0,Number(product.rightHeightMm)||0);
 const w=Math.max(50,widthMm-Number(g.leftMm??gap)-Number(g.rightMm??gap)),h=Math.max(50,heightMm-Number(g.topMm??gap)-Number(g.bottomMm??gap));
 Object.assign(product,resizeWindowProduct(product,{widthMm:w,baseWidthMm:w,heightMm:h,...(product.shape==='trapezoid_sloped_top'?{leftHeightMm:product.leftHeightMm*h/oldHeight,rightHeightMm:product.rightHeightMm*h/oldHeight}:{})}));
 synchronizeWindowOpening(project,product);
}
