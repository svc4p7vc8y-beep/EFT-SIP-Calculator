// Coordinates are millimetres in the existing production coordinate system.
// Empty values remain unknown; normalization is not engineering approval.
const text=v=>typeof v==='string'?v.slice(0,2000):'';
const number=v=>v===''||v==null?'':Number(v);
const records=v=>Array.isArray(v)?v.filter(r=>r&&typeof r==='object'&&!Array.isArray(r)).slice(0,500):[];
export function normalizeBuildingDocumentation(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))value={};
 return {...value,version:1,toleranceMm:number(value.toleranceMm??1),planCutHeightMm:number(value.planCutHeightMm??1200),
  foundation:{...value.foundation,widthMm:number(value.foundation?.widthMm),depthMm:number(value.foundation?.depthMm),topMm:number(value.foundation?.topMm),bottomMm:number(value.foundation?.bottomMm)},
  datum:{...value.datum,name:text(value.datum?.name),elevationMm:number(value.datum?.elevationMm),confirmed:value.datum?.confirmed===true},
  axes:records(value.axes).map(r=>({...r,id:text(r.id),name:text(r.name),direction:['x','y'].includes(r.direction)?r.direction:'',coordinateMm:number(r.coordinateMm)})),
  floorLevels:records(value.floorLevels).map(r=>({...r,floor:Number(r.floor),name:text(r.name),elevationMm:number(r.elevationMm)})),
  sections:records(value.sections).map(r=>({...r,id:text(r.id),name:text(r.name),a:Array.isArray(r.a)?r.a.map(number):[],b:Array.isArray(r.b)?r.b.map(number):[],depthMm:number(r.depthMm??0),confirmed:r.confirmed===true})),
  catalogMappings:records(value.catalogMappings).map(r=>({...r,key:text(r.key),catalogId:text(r.catalogId),factor:number(r.factor),evidence:text(r.evidence),reviewer:text(r.reviewer)})),
  annotations:records(value.annotations).map(r=>({...r,viewId:text(r.viewId),id:text(r.id),x:number(r.x),y:number(r.y)})),
 };
}
