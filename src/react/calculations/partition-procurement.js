export function partitionProcurement(report, catalog=report.partitionCatalog||[]) {
  const boards=new Map();
  for(const bar of report.partitionStock?.bars||[]){
    const key=bar.profile, row=boards.get(key)||{profile:key,count:0,lengthM:0,volumeM3:0,ids:[]};
    const section=key.split(/[×xх]/).map(Number),length=report.settings.stockLengthMm/1000;
    row.count++;row.lengthM+=length;row.volumeM3+=section.length===2?section[0]*section[1]*length/1e6:0;row.ids.push(...bar.parts.map(p=>p.id));boards.set(key,row);
  }
  const screws=new Map();
  for(const r of report.partitionFasteners||[]){const key=`${r.catalogId}:${r.unit}`,old=screws.get(key)||{...r,names:[],qty:0};old.qty+=Number(r.qty)||0;old.names.push(r.name);screws.set(key,old);}
  const manual=(report.settings.partitionFasteners||[]).map(r=>{const c=catalog.find(c=>c.id===r.catalogId);return {...r,name:c?.name||'Материал не выбран',unit:c?.unit||'—',valid:!!c&&r.qty!==''&&Number(r.qty)>=0};});
  return {boards:[...boards.values()],screws:[...screws.values()],manual,unplaced:report.partitionStock?.unplaced||[]};
}
