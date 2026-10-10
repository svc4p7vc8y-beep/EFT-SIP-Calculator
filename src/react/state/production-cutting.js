import { normalizeMarkRegistry } from './production-identities.js';
import { normalizeConstructionSources } from './construction-sources.js';
import { normalizeSourceBaseline } from './source-baseline.js';
import { normalizeAutoRoofSupports } from './auto-roof-supports.js';

export function normalizeDrawingLabels(value) {
  const record=v=>v&&typeof v==='object'&&!Array.isArray(v)?Object.entries(v).slice(0,2000):[];
  return Object.fromEntries(record(value).map(([view,labels])=>[view,Object.fromEntries(record(labels).map(([key,item])=>[key,{
    ...(typeof item?.text==='string'?{text:item.text.slice(0,300)}:{}),
    ...(Array.isArray(item?.offset)&&item.offset.length===2&&item.offset.every(n=>typeof n==='number'&&Number.isFinite(n))?{offset:item.offset}:{}),
  }]))]));
}

export function normalizeProductionCutting(value = {}) {
  value = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  // Preserve finite out-of-range input so validation can report it, not silently replace it.
  const number = (key, fallback) => value[key] != null && Number.isFinite(Number(value[key])) && value[key] !== '' ? Number(value[key]) : fallback;
  const record = source => source && typeof source === 'object' && !Array.isArray(source) ? Object.fromEntries(Object.entries(source).slice(0, 2000).map(([key, item]) => [key, item !== '' && item != null && Number.isFinite(Number(item)) && Number(item) >= 0 && Number(item) <= 30000 ? Number(item) : ''])) : {};
  const jointTolerance = value.bindingJointToleranceMm;
  return {
    markRegistry: normalizeMarkRegistry(value.markRegistry),
    constructionSources: normalizeConstructionSources(value.constructionSources),
    sourceBaseline: normalizeSourceBaseline(value.sourceBaseline),
    frameStepMm: number('frameStepMm', 625, 100, 2500),
    detailedFrameEstimate: value.detailedFrameEstimate !== false,
    partitionBracing: value.partitionBracing !== false,
    partitionBraceProfile: typeof value.partitionBraceProfile==='string'?value.partitionBraceProfile.trim().replace(/[хx]/g,'×'):'25×150',
    partitionBraceDirection: ['left-right','right-left'].includes(value.partitionBraceDirection)?value.partitionBraceDirection:'auto',
    partitionBraceNotchDepthMm: number('partitionBraceNotchDepthMm',''),
    bearingEdgeNotchDepthMm: number('bearingEdgeNotchDepthMm',''),
    bearingEdgeBoard: value.bearingEdgeBoard !== false,
    partitionCornerBacking: value.partitionCornerBacking !== false,
    wallPanelMode: value.wallPanelMode === 'grid' ? 'grid' : 'full',
    gableFrameProfile: typeof value.gableFrameProfile==='string' ? value.gableFrameProfile.trim().replace(/[хx]/g,'×') : '50×150',
    windowSillMm: number('windowSillMm', 850),
    // No source-approved deviation: absent stays blank, explicit zero survives.
    bindingJointToleranceMm: jointTolerance == null || (typeof jointTolerance === 'string' && !jointTolerance.trim()) ? ''
      : ['number', 'string'].includes(typeof jointTolerance) ? Number(jointTolerance) : 'Некорректный тип параметра',
    kerfMm: number('kerfMm', '', 0, 20),
    endAllowanceMm: number('endAllowanceMm', '', 0, 100),
    stockLengthMm: number('stockLengthMm', 6000, 500, 15000),
    splineWidthMm: number('splineWidthMm', 90, 20, 300),
    edgeWidthMm: number('edgeWidthMm', 45, 20, 300),
    staggered: value.staggered !== false,
    ceilingBearingAlignment: value.ceilingBearingAlignment !== false,
    ceilingMaxSpanMm: value.ceilingMaxSpanMm==null?'':value.ceilingMaxSpanMm,
    counterLathProfile: typeof value.counterLathProfile==='string'?value.counterLathProfile.trim().replace(/[xх]/g,'×'):'',
    rafterGeometry: value.rafterGeometry==='estimate'?'estimate':'wallSlope',
    autoRoofSupports: normalizeAutoRoofSupports(value.autoRoofSupports),
    profileMode: value.profileMode === 'estimate' ? 'estimate' : 'saved',
    allowRotation: value.allowRotation === true,
    continuousMembers: value.continuousMembers === true,
    layouts: value.layouts && typeof value.layouts === 'object' && !Array.isArray(value.layouts) ? value.layouts : {},
    gableLinks: value.gableLinks && typeof value.gableLinks==='object' && !Array.isArray(value.gableLinks) ? value.gableLinks : {},
    roofSheets: value.roofSheets && typeof value.roofSheets==='object' && !Array.isArray(value.roofSheets) ? value.roofSheets : {},
    partitionFasteners: Array.isArray(value.partitionFasteners)?value.partitionFasteners.filter(r=>r&&typeof r==='object').slice(0,100).map((r,i)=>({id:String(r.id||`pf-${i}`),catalogId:String(r.catalogId||''),qty:r.qty!==''&&Number.isFinite(Number(r.qty))&&Number(r.qty)>=0?Number(r.qty):''})):[],
    assemblyNodes: Array.isArray(value.assemblyNodes)?value.assemblyNodes.filter(n=>n&&Number.isFinite(n.x)&&Number.isFinite(n.y)&&Math.abs(n.x)<=100000&&Math.abs(n.y)<=100000).slice(0,200).map((n,i)=>({id:String(n.id||`node-${i+1}`),x:n.x,y:n.y,floor:Math.max(1,Number(n.floor)||1),nodeRef:String(n.nodeRef||'').slice(0,200)})):[],
    drawingDimensions: value.drawingDimensions && typeof value.drawingDimensions==='object' && !Array.isArray(value.drawingDimensions) ? Object.fromEntries(Object.entries(value.drawingDimensions).slice(0,500).map(([key,list])=>[key,Array.isArray(list)?list.filter(d=>d&&[d.a,d.b].every(p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=100000))&&(!d.offset||Array.isArray(d.offset)&&d.offset.length===2&&d.offset.every(Number.isFinite))).slice(0,100):[]])) : {},
    drawingLabels: normalizeDrawingLabels(value.drawingLabels),
    roofSupports: Array.isArray(value.roofSupports) ? value.roofSupports.filter(item=>item && typeof item==='object').slice(0,200).map((item,index)=>({
      ...item,...(item.hasStableSourceId===false||!item.id?{hasStableSourceId:false}:{}),id:String(item.id||`support-${index+1}`),name:String(item.name||'').slice(0,200),
      type:['purlin','post','beam','rafter','brace','tie','foundation'].includes(item.type)?item.type:'purlin',
      profile:String(item.profile||'').slice(0,100),nodeRef:String(item.nodeRef||'').slice(0,200),
      ...(item.referenceOnly===undefined?{}:{referenceOnly:item.referenceOnly===true}),
      ...(item.estimateEnabled===undefined?{}:{estimateEnabled:item.estimateEnabled===true}),
      ...(item.estimateCatalogId===undefined?{}:{estimateCatalogId:String(item.estimateCatalogId||'').slice(0,100)}),
      ...(item.upperSupport===undefined?{}:{upperSupport:String(item.upperSupport||'').slice(0,200)}),
      startSupport:String(item.startSupport||''),endSupport:String(item.endSupport||''),foundationRef:String(item.foundationRef||'').slice(0,200),
    })) : [],
    memberOverrides: value.memberOverrides && typeof value.memberOverrides === 'object' && !Array.isArray(value.memberOverrides) ? value.memberOverrides : {},
    manualPanels: Array.isArray(value.manualPanels) ? value.manualPanels.filter(item=>item && typeof item === 'object').slice(0, 100).map((item,index)=>({...(item.hasStableSourceId===false||!item.id?{hasStableSourceId:false}:{}),id:String(item.id || `panel-${index+1}`),name:String(item.name || '').slice(0,200),family:String(item.family || 'pps'),thickness:item.thickness == null ? 174 : Number(item.thickness),quantity:item.quantity == null ? 1 : Number(item.quantity),contour:typeof item.contour === 'string' ? item.contour : JSON.stringify(item.contour || [])})) : [],
    approval: value.approval && typeof value.approval === 'object' ? value.approval : {},
    openingSills: record(value.openingSills),
    wallAdditions: record(value.wallAdditions),
    manualParts: Array.isArray(value.manualParts) ? value.manualParts.filter(item => item && typeof item === 'object').slice(0, 500).map((item, index) => ({ ...(item.hasStableSourceId===false||!item.id?{hasStableSourceId:false}:{}), id: String(item.id || `manual-${index + 1}`), name: String(item.name || '').slice(0, 200), profile: String(item.profile || '').slice(0, 100), length: item.length !== '' && Number.isFinite(Number(item.length)) ? Number(item.length) : '', quantity: item.quantity !== '' && Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : '', ...(item.estimateEnabled === undefined ? {} : { estimateEnabled: item.estimateEnabled === true }), ...(item.estimateCatalogId === undefined ? {} : { estimateCatalogId: String(item.estimateCatalogId || '').slice(0, 100) }) })) : [],
    notes: typeof value.notes === 'string' ? value.notes.slice(0, 10000) : '',
  };
}
