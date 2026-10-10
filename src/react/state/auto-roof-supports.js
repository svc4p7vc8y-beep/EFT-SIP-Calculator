export const AUTO_ROOF_LAYOUT='roof-purlins';
export const ROOF_SUPPORT_VARIANTS=[['single','Один центральный прогон'],['double','Два прогона'],['triple','Три прогона']];
export function normalizeAutoRoofSupports(value={}) {
  const v=value&&typeof value==='object'?value:{};
  return {variant:['single','double','triple'].includes(v.variant)?v.variant:'single',distribution:v.distribution==='bearing'?'bearing':'uniform',postCount:v.postCount==null?3:Number(v.postCount),
    purlinProfile:String(v.purlinProfile??'100×150').replace(/[xх]/g,'×'),postProfile:String(v.postProfile??'100×150').replace(/[xх]/g,'×'),
    baseZ:v.baseZ==null||v.baseZ===''?'':Number(v.baseZ),nodeRef:String(v.nodeRef||'').slice(0,200),
    purlinCatalogId:String(v.purlinCatalogId||''),postCatalogId:String(v.postCatalogId||''),estimateEnabled:v.estimateEnabled===true};
}
