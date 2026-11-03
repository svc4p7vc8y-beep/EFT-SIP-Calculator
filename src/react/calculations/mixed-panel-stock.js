export function mixedPanelStock(parts, width, kerf, rotation, pack, catalog) {
  const groups=new Map();
  for(const part of parts){const key=`${part.family}/${part.thickness}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(part);}
  const sheets=[],unplaced=[];
  for(const [material,items] of groups){
    const price=length=>Number(catalog.find(row=>row.name===`СИП-панель PPS ${length}×1250×${items[0].thickness} мм`)?.price)||Infinity;
    if(items[0].family!=='pps'||!Number.isFinite(price(2500))||!Number.isFinite(price(2800))){const result=pack(items,width,2500,kerf,rotation);sheets.push(...result.sheets);unplaced.push(...result.unplaced);continue;}
    const tall=items.filter(p=>!(Math.ceil(p.blankWidth??p.width)<=width&&Math.ceil(p.blankHeight??p.height)<=2500||rotation&&Math.ceil(p.blankHeight??p.height)<=width&&Math.ceil(p.blankWidth??p.width)<=2500));
    const tallIds=new Set(tall.map(p=>p.id));
    const candidateA=pack(items,width,2800,kerf,rotation);
    for(const sheet of candidateA.sheets)if(sheet.parts.every(p=>p.y+p.height<=2500))sheet.height=2500;
    const shortPack=pack(items.filter(p=>!tallIds.has(p.id)),width,2500,kerf,rotation),tallPack=pack(tall,width,2800,kerf,rotation);
    const candidateB={sheets:[...shortPack.sheets,...tallPack.sheets],unplaced:[...shortPack.unplaced,...tallPack.unplaced]};
    const score=c=>c.unplaced.length?Infinity:c.sheets.reduce((sum,s)=>sum+price(s.height),0);
    const chosen=score(candidateB)<score(candidateA)?candidateB:candidateA;
    sheets.push(...chosen.sheets);unplaced.push(...chosen.unplaced);
  }
  const remnants=[];
  sheets.forEach((sheet,index)=>{sheet.id=`Л-${index+1}`;for(const shelf of sheet.shelves)if(width-shelf.used-kerf>0)remnants.push({sheet:sheet.id,x:shelf.used+kerf,y:shelf.y,width:width-shelf.used-kerf,height:shelf.height});const y=sheet.shelves.reduce((sum,s)=>sum+s.height+kerf,0);if(y<sheet.height)remnants.push({sheet:sheet.id,x:0,y,width,height:sheet.height-y});});
  const area=sheets.reduce((sum,s)=>sum+s.width*s.height,0);
  return {sheets,unplaced,remnants,wastePercent:area?100*(1-parts.filter(p=>!unplaced.includes(p.id)).reduce((sum,p)=>sum+(p.area??p.width*p.height),0)/area):0};
}
