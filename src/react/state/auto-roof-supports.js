export const AUTO_ROOF_LAYOUT='roof-purlins';
// Automatic proposals belong to the roof system that generated them. Locked
// manual edits remain visible until the designer changes them explicitly.
export const roofSupportMatchesSystem=(item,system)=>item.autoLayout!==AUTO_ROOF_LAYOUT||item.autoLocked===true||!system
  ||(system==='truss'?item.trussTemplate===true:item.trussTemplate!==true);
export const ROOF_SUPPORT_VARIANTS=[['single','Один центральный прогон'],['double','Два прогона'],['triple','Три прогона']];
export function normalizeAutoRoofSupports(value={}) {
  const v=value&&typeof value==='object'?value:{};
  return {variant:['single','double','triple'].includes(v.variant)?v.variant:'single',distribution:v.distribution==='bearing'?'bearing':'uniform',postCount:v.postCount==null?3:Number(v.postCount),includePlatforms:v.includePlatforms!==false,
    purlinProfile:String(v.purlinProfile??'100×150').replace(/[xх]/g,'×'),postProfile:String(v.postProfile??'100×150').replace(/[xх]/g,'×'),
    baseZ:v.baseZ==null||v.baseZ===''?'':Number(v.baseZ),trussDepthMm:v.trussDepthMm==null?400:Number(v.trussDepthMm),nodeRef:String(v.nodeRef||'').slice(0,200),
    purlinCatalogId:String(v.purlinCatalogId||''),postCatalogId:String(v.postCatalogId||''),estimateEnabled:v.estimateEnabled===true};
}
