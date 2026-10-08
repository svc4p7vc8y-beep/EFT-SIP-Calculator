import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
const section=p=>calculateProject(p).sections.find(s=>s.key==='foundation');
test('concrete pile package costs 8750 per unique pile without duplicate installation or screw-pile supplies',()=>{
  const p=createDefaultProject(),before=calculateProject(p);p.settings.piles.pileType='reinforcedConcrete';
  const after=calculateProject(p),s=section(p),pile=s.lines.find(l=>l.catalogId==='MAT-JB-C30-15');
  assert.equal(after.foundation.totalPiles,before.foundation.totalPiles);
  assert.equal(pile.qty,after.foundation.totalPiles);assert.equal(pile.price,8750);assert.equal(pile.unit,'шт');
  assert.match(s.title,/железобетонных/);
  for(const key of ['axes','pile-work','piles','concrete','heads','heads-work'])assert.equal(s.lines.some(l=>l.id===`foundation:${key}`),false);
  assert.ok(s.lines.some(l=>l.id==='foundation:binding-work'));
  assert.equal(pile.qty*pile.price,after.foundation.totalPiles*8750);
});
test('legacy projects remain screw piles; selected type and manual price survive save/import',()=>{
  const p=createDefaultProject();delete p.settings.piles.pileType;
  const legacy=migrateProject(JSON.parse(JSON.stringify(p)));assert.equal(legacy.settings.piles.pileType,'screw');
  assert.ok(section(legacy).lines.some(l=>l.id==='foundation:pile-work'));
  p.settings.piles.pileType='reinforcedConcrete';p.priceMat.find(m=>m.id==='MAT-JB-C30-15').price=9000;
  const restored=migrateProject(JSON.parse(JSON.stringify(p)));assert.equal(restored.settings.piles.pileType,'reinforcedConcrete');
  assert.equal(section(restored).lines.find(l=>l.catalogId==='MAT-JB-C30-15').price,9000);
  assert.equal(createDefaultProject().priceMat.find(m=>m.id==='MAT-JB-C30-15').price,8750);
});
test('foundation disabled does not add concrete pile package',()=>{
  const p=createDefaultProject();p.settings.piles.pileType='reinforcedConcrete';p.services.foundation=false;
  assert.equal(section(p).lines.some(l=>l.catalogId==='MAT-JB-C30-15'),false);
});
