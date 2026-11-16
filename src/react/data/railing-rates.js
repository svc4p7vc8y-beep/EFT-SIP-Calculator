import catalog from './default-catalog.json' with {type:'json'};
export const RAILING_LABOR_DEFAULT=catalog.priceLab.find(r=>r.id==='LAB-RAILING-ASSEMBLY');
