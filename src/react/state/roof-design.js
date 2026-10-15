export function normalizeRoofDesign(value={}){
 const v=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 const text=x=>typeof x==='string'?x.slice(0,3000):'';
 const number=x=>x==null||x===''?'':Number(x);
 const records=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
 return {enabled:v.enabled===true,baseZ:number(v.baseZ),site:text(v.site),climate:text(v.climate),snow:number(v.snow),wind:number(v.wind),deadLoad:number(v.deadLoad),panelDocument:text(v.panelDocument),coverDocument:text(v.coverDocument),structuralDocument:text(v.structuralDocument),reviewer:text(v.reviewer),nodeDocument:text(v.nodeDocument),waterproofDocument:text(v.waterproofDocument),thermalDocument:text(v.thermalDocument),minSlope:number(v.minSlope),panelSpan:number(v.panelSpan),ventilationGap:number(v.ventilationGap),drainageNote:text(v.drainageNote),taperMaterial:text(v.taperMaterial),taperMinThickness:number(v.taperMinThickness),
 faceOverrides:Object.fromEntries(Object.entries(records(v.faceOverrides)).slice(0,100).map(([id,r])=>[id,{...(typeof r?.warm==='boolean'?{warm:r.warm}:{}),...(r?.thickness!=null?{thickness:Number(r.thickness)}:{}),...(typeof r?.nodeRef==='string'?{nodeRef:text(r.nodeRef)}:{})}])),
 edgeProfiles:Object.fromEntries(Object.entries(records(v.edgeProfiles)).slice(0,300).map(([id,p])=>[id,text(p).replace(/[хx]/g,'×')])),
 edgeGeometry:Object.fromEntries(Object.entries(records(v.edgeGeometry)).slice(0,300).map(([id,p])=>[id,text(p)])),
 hipGeometry:{mode:v.hipGeometry?.mode==='contour'?'contour':'height',angleDeg:number(v.hipGeometry?.angleDeg),eaveZ:number(v.hipGeometry?.eaveZ),edgeAngles:Object.fromEntries(Object.entries(records(v.hipGeometry?.edgeAngles)).slice(0,100).map(([key,angle])=>[text(key),number(angle)]))},
 engineering:{
  loadCases:Array.isArray(v.engineering?.loadCases)?v.engineering.loadCases.slice(0,20).filter(item=>item&&typeof item==='object').map((item,i)=>({id:text(item.id)||`Н${i+1}`,name:text(item.name),kind:item.kind==='uplift'?'uplift':'downward',pressureKPa:number(item.pressureKPa),source:text(item.source),...(item.mode==='components'?{mode:'components',deadFactor:number(item.deadFactor),snowFactor:number(item.snowFactor),windFactor:number(item.windFactor)}:{})})):[],
  panelCapacities:Array.isArray(v.engineering?.panelCapacities)?v.engineering.panelCapacities.slice(0,100).filter(item=>item&&typeof item==='object').map((item,i)=>({id:text(item.id)||`П${i+1}`,thicknessMm:number(item.thicknessMm),maxSpanMm:number(item.maxSpanMm),downwardKPa:number(item.downwardKPa),upliftKPa:number(item.upliftKPa),source:text(item.source)})):[],
  spanOverrides:Object.fromEntries(Object.entries(records(v.engineering?.spanOverrides)).slice(0,100).map(([id,item])=>[id,{spanMm:number(item?.spanMm),reason:text(item?.reason),geometry:text(item?.geometry)}])),
 },
 manualFaces:Array.isArray(v.manualFaces)?v.manualFaces.slice(0,100).filter(f=>f&&typeof f==='object').map((f,i)=>({id:text(f.id)||`КР-Р${i+1}`,name:text(f.name)||`Проектный скат ${i+1}`,group:text(f.group)||'main',warm:f.warm===true,thickness:number(f.thickness),nodeRef:text(f.nodeRef),vertices:Array.isArray(f.vertices)?f.vertices.slice(0,200).map(p=>Array.isArray(p)?p.slice(0,3).map(Number):[]):[]})):[],
 features:Array.isArray(v.features)?v.features.slice(0,200).filter(f=>f&&typeof f==='object').map((f,i)=>({id:text(f.id)||`КЭ${i+1}`,type:['drain','penetration','snow','joint'].includes(f.type)?f.type:'drain',faceId:text(f.faceId),x:number(f.x),y:number(f.y),nodeRef:text(f.nodeRef),name:text(f.name)})):[]};
}
