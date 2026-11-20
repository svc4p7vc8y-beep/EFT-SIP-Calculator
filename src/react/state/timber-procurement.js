export function normalizeTimberProcurement(value={}) {
  const number=(n,max)=>Number.isFinite(Number(n))&&Number(n)>0&&Number(n)<=max?Number(n):0;
  return {showPrices:value?.showPrices===true,stockLengthM:number(value?.stockLengthM,24)||6,customer:String(value?.customer||'').slice(0,300),recipient:String(value?.recipient||'').slice(0,300),note:String(value?.note||'').slice(0,2000),recipes:Object.fromEntries(Object.entries(value?.recipes||{}).slice(0,300).filter(([key,r])=>key.length<300&&r&&typeof r==='object').map(([key,r])=>[key,{count:Number.isInteger(Number(r.count))?number(r.count,20):0,thicknessMm:number(r.thicknessMm,1000),widthMm:number(r.widthMm,2000)}]))};
}
