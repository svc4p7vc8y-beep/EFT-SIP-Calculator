import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {partitionProcurement} from '../src/react/calculations/partition-procurement.js';
const run=p=>calculateProductionCutting(p,calculateProject(p));
test('partition order counts stock and groups sections across roles, without changing estimate',()=>{
 const p=createDefaultProject();p.settings.productionCutting.kerfMm=3;p.settings.productionCutting.endAllowanceMm=0;
 const r=run(p),s=partitionProcurement(r),total=calculateProject(p).totals.total;
 assert.ok(s.boards.length);assert.equal(s.boards.reduce((n,b)=>n+b.count,0),r.partitionStock.bars.length);
 const ids=s.boards.flatMap(b=>b.ids);assert.equal(ids.length,new Set(ids).size);assert.ok(ids.every(id=>id.includes('-ПГ')));
 assert.equal(calculateProject(p).totals.total,total);
});
test('SIP fasteners retain estimate quantities and units; disabling partitions removes automatic order',()=>{
 const p=createDefaultProject();p.settings.sip.partitionType='sip';const c=calculateProject(p),r=calculateProductionCutting(p,c);
 assert.ok(r.partitionFasteners.length);for(const f of r.partitionFasteners){const l=c.lines.find(l=>l.id===f.id);assert.equal(f.qty,l.qty);assert.equal(f.unit,l.unit);}
 p.services.partitions=false;const off=run(p);assert.equal(off.partitionFasteners.length,0);assert.equal(off.partitionStock.bars.length,0);
});
test('manual fastener quantity survives migration without changing price or estimate',()=>{
 const p=createDefaultProject(),item=p.priceMat.find(c=>/саморез/i.test(c.name)),total=calculateProject(p).totals.total;
 p.settings.productionCutting.partitionFasteners=[{id:'f',catalogId:item.id,qty:5}];const saved=migrateProject(JSON.parse(JSON.stringify(p))),s=partitionProcurement(run(saved));assert.equal(s.manual[0].qty,5);assert.equal(s.manual[0].unit,item.unit);assert.equal(s.manual[0].valid,true);assert.equal(calculateProject(saved).totals.total,total);
});
