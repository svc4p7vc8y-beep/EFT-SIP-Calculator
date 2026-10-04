export function normalizeProductionCutting(value = {}) {
  value = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  // Preserve finite out-of-range input so validation can report it, not silently replace it.
  const number = (key, fallback) => value[key] != null && Number.isFinite(Number(value[key])) && value[key] !== '' ? Number(value[key]) : fallback;
  const record = source => source && typeof source === 'object' && !Array.isArray(source) ? Object.fromEntries(Object.entries(source).slice(0, 2000).map(([key, item]) => [key, item !== '' && item != null && Number.isFinite(Number(item)) && Number(item) >= 0 && Number(item) <= 30000 ? Number(item) : ''])) : {};
  return {
    frameStepMm: number('frameStepMm', 625, 100, 2500),
    wallPanelMode: value.wallPanelMode === 'grid' ? 'grid' : 'full',
    gableFrameProfile: typeof value.gableFrameProfile==='string' ? value.gableFrameProfile.trim().replace(/[хx]/g,'×') : '50×150',
    windowSillMm: number('windowSillMm', 850),
    kerfMm: number('kerfMm', '', 0, 20),
    endAllowanceMm: number('endAllowanceMm', '', 0, 100),
    stockLengthMm: number('stockLengthMm', 6000, 500, 15000),
    splineWidthMm: number('splineWidthMm', 90, 20, 300),
    edgeWidthMm: number('edgeWidthMm', 45, 20, 300),
    staggered: value.staggered !== false,
    ceilingBearingAlignment: value.ceilingBearingAlignment !== false,
    counterLathProfile: typeof value.counterLathProfile==='string'?value.counterLathProfile.trim().replace(/[xх]/g,'×'):'',
    rafterGeometry: value.rafterGeometry==='estimate'?'estimate':'wallSlope',
    profileMode: value.profileMode === 'estimate' ? 'estimate' : 'saved',
    allowRotation: value.allowRotation === true,
    continuousMembers: value.continuousMembers === true,
    layouts: value.layouts && typeof value.layouts === 'object' && !Array.isArray(value.layouts) ? value.layouts : {},
    gableLinks: value.gableLinks && typeof value.gableLinks==='object' && !Array.isArray(value.gableLinks) ? value.gableLinks : {},
    roofSheets: value.roofSheets && typeof value.roofSheets==='object' && !Array.isArray(value.roofSheets) ? value.roofSheets : {},
    drawingDimensions: value.drawingDimensions && typeof value.drawingDimensions==='object' && !Array.isArray(value.drawingDimensions) ? Object.fromEntries(Object.entries(value.drawingDimensions).slice(0,500).map(([key,list])=>[key,Array.isArray(list)?list.filter(d=>d&&[d.a,d.b].every(p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=100000))&&(!d.offset||Array.isArray(d.offset)&&d.offset.length===2&&d.offset.every(Number.isFinite))).slice(0,100):[]])) : {},
    roofSupports: Array.isArray(value.roofSupports) ? value.roofSupports.filter(item=>item && typeof item==='object').slice(0,200).map((item,index)=>({
      ...item,id:String(item.id||`support-${index+1}`),name:String(item.name||'').slice(0,200),
      type:['purlin','post','beam','rafter','brace','tie','foundation'].includes(item.type)?item.type:'purlin',
      profile:String(item.profile||'').slice(0,100),nodeRef:String(item.nodeRef||'').slice(0,200),
      ...(item.referenceOnly===undefined?{}:{referenceOnly:item.referenceOnly===true}),
      ...(item.estimateEnabled===undefined?{}:{estimateEnabled:item.estimateEnabled===true}),
      ...(item.estimateCatalogId===undefined?{}:{estimateCatalogId:String(item.estimateCatalogId||'').slice(0,100)}),
      startSupport:String(item.startSupport||''),endSupport:String(item.endSupport||''),foundationRef:String(item.foundationRef||'').slice(0,200),
    })) : [],
    memberOverrides: value.memberOverrides && typeof value.memberOverrides === 'object' && !Array.isArray(value.memberOverrides) ? value.memberOverrides : {},
    manualPanels: Array.isArray(value.manualPanels) ? value.manualPanels.filter(item=>item && typeof item === 'object').slice(0, 100).map((item,index)=>({id:String(item.id || `panel-${index+1}`),name:String(item.name || '').slice(0,200),family:String(item.family || 'pps'),thickness:item.thickness == null ? 174 : Number(item.thickness),quantity:item.quantity == null ? 1 : Number(item.quantity),contour:typeof item.contour === 'string' ? item.contour : JSON.stringify(item.contour || [])})) : [],
    approval: value.approval && typeof value.approval === 'object' ? value.approval : {},
    openingSills: record(value.openingSills),
    wallAdditions: record(value.wallAdditions),
    manualParts: Array.isArray(value.manualParts) ? value.manualParts.filter(item => item && typeof item === 'object').slice(0, 500).map((item, index) => ({ id: String(item.id || `manual-${index + 1}`), name: String(item.name || '').slice(0, 200), profile: String(item.profile || '').slice(0, 100), length: item.length !== '' && Number.isFinite(Number(item.length)) ? Number(item.length) : '', quantity: item.quantity !== '' && Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : '' })) : [],
    notes: typeof value.notes === 'string' ? value.notes.slice(0, 10000) : '',
  };
}
