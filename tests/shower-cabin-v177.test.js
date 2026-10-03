import test from 'node:test';
import assert from 'node:assert/strict';
import { showerCabinLines, resolveShowerCabin } from '../src/react/calculations/shower-cabin.js';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';

const room=(settings={})=>({floor:1,id:'bath',name:'Санузел',settings});
const shower=lines=>lines.filter(line=>['MAT-234','LAB-130'].includes(line.catalogId));

test('shower cabin is opt-in, rounds quantity and marks up material but not assembly work',()=>{
  assert.deepEqual(showerCabinLines(room()),[]);
  const lines=showerCabinLines(room({showerCabin:{quantity:1.2}}));
  assert.equal(lines.length,2);
  assert.equal(lines[0].qty,2);
  assert.equal(lines[0].projectPrice,29900);
  assert.equal(lines[0].priceMultiplier,1.25);
  assert.equal(lines[1].qty,2);
  assert.equal(lines[1].projectPrice,6600);
  assert.equal(lines[1].priceMultiplier,undefined);
  assert.deepEqual(showerCabinLines(room({enabled:false,showerCabin:{quantity:1}})),[]);
});

test('manual room prices survive migration, do not change catalog or add plumbing points',()=>{
  const project=createDefaultProject();
  project.services.internalFinish=true;
  project.plan.house={w:3,h:2};
  project.plan.rooms=[{id:'bath',name:'Санузел',x:0,y:0,w:3,h:2}];
  project.plan.openings=[];
  project.settings.internal.roomFinishes={'1:bath':{showerCabin:{quantity:1,materialPrice:27000,workPrice:7000,markup:10}}};
  const migrated=migrateProject(JSON.parse(JSON.stringify(project)));
  const section=calculateProject(migrated).sections.find(section=>section.key==='internal');
  const lines=shower(section.lines);
  assert.equal(lines.length,2);
  assert.equal(Math.round(lines[0].price*100)/100,29700);
  assert.equal(lines[1].price,7000);
  assert.equal(migrated.priceMat.find(item=>item.id==='MAT-234').price,29900);
  assert.equal(migrated.priceLab.find(item=>item.id==='LAB-130').price,6600);
  assert.equal(migrated.settings.internal.roomFinishes['1:bath'].showerCabin.quantity,1);
  assert.deepEqual(migrated.plan.openings,[]);
  assert.equal(resolveShowerCabin(room({showerCabin:{quantity:1,materialPrice:0,workPrice:0,markup:0}})).materialPrice,0);
  assert.equal(shower(calculateProject(project).sections.find(section=>section.key==='engineering')?.lines||[]).length,0);
});

test('one selected cabin adds exactly one priced material and one assembly line to the estimate',()=>{
  const project=createDefaultProject();
  project.services.internalFinish=true;
  project.plan.house={w:3,h:2};
  project.plan.rooms=[{id:'bath',name:'Санузел',x:0,y:0,w:3,h:2}];
  project.plan.openings=[];
  assert.equal(shower(calculateProject(project).sections.find(section=>section.key==='internal').lines).length,0);
  project.settings.internal.roomFinishes={'1:bath':{showerCabin:{quantity:1}}};
  const lines=shower(calculateProject(project).sections.find(section=>section.key==='internal').lines);
  assert.deepEqual(lines.map(line=>[line.catalogId,line.qty,line.price]),[
    ['MAT-234',1,37375],
    ['LAB-130',1,6600],
  ]);
  assert.equal(lines.reduce((sum,line)=>sum+line.qty*line.price,0),43975);
});
