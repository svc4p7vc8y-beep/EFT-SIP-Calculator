import {sipTimberProfile} from './sip-joinery.js';

// Only a material/quantity conversion. Structural sizes and bearing checks stay
// project-defined; a volume equivalent is not a manufacturing specification.
export function houseFrameMaterial(project){
 const sip=project.settings.sip,profile=sipTimberProfile(sip.wallThickness),type=sip.connectorType||'thermal';
 const width=type==='solid'?100:95,depth=type==='solid'?profile.core:profile.endBoardDepth;
 const name=type==='board-pack'?`Пакет клеёных досок 95×${depth} мм для СИП ${profile.panelThickness} мм`
  :type==='board-kit'?`Комплект для пакета досок 95×${depth} мм для СИП ${profile.panelThickness} мм`
  :type==='solid'?`Брус соединительный ест. влажности 100×${depth} мм`:`Термобрус 95×${depth} мм`;
 const catalog=(project.priceMat||[]).find(r=>r.name===name&&['м.п.','м','м3','м³'].includes(r.unit));
 return {type,name,catalog,width,depth,areaMm2:width*depth,familyLabel:type==='board-pack'?'Пакет клеёных досок':type==='board-kit'?'Комплект для пакета досок':type==='solid'?'Брус ест. влажности':'Термобрус'};
}
export function inheritFacadeMaterial(project,item){
 if(!item.facadeId||item.type==='foundation'||item.referenceOnly)return item;
 const facade=[project.plan,...(project.upperFloors||[])].flatMap(p=>p.facades||[]).find(f=>f.id===item.facadeId);
 if(!facade||facade.catalogId||item.estimateCatalogId)return item;
 const material=houseFrameMaterial(project);
 return {...item,houseFrameMaterial:material,packagePricing:'package',estimateCatalogId:material.catalog?.id||''};
}
