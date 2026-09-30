import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createUpperFloorPlan, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { buildCommercialScope } from '../src/react/calculations/commercial-scope.js';
import { printDiagramLayers } from '../src/react/planner/print-diagram-layers.js';
import { platformRoofFrame } from '../src/react/planner/platform-roof-frame.js';
import { enableAutoSauna } from '../src/react/calculations/sauna-auto.js';
import { createEstimateWorkbook } from '../src/react/export/xlsx.js';
import { unzipSync, strFromU8 } from 'fflate';

const scope = (p, key, options) => buildCommercialScope(p, calculateProject(p), options).find(s => s.key === key);

test('client workbook omits preliminary sauna warning without removing calculation diagnostics', async () => {
  const p=createDefaultProject();p.services.internalFinish=true;
  p.plan.house={w:3,h:3};p.plan.rooms=[{id:'sauna',name:'Парная',x:0,y:0,w:3,h:3}];
  p.settings.internal.roomFinishes={'1:sauna':{sauna:enableAutoSauna()}};
  const c=calculateProject(p);
  assert.ok(c.saunaWarnings.length);
  const files=unzipSync(new Uint8Array(await createEstimateWorkbook(p,c).arrayBuffer()));
  const xml=strFromU8(files['xl/worksheets/sheet1.xml']);
  assert.doesNotMatch(xml,/Комплектация парной предварительная/);
  for(const warning of c.saunaWarnings) assert.ok(!xml.includes(warning));
  assert.match(xml,/ИТОГО ПО СМЕТЕ/);
});

test('proposal describes floor wall ceiling panels and real timber partition profiles', () => {
  const p=createDefaultProject();
  let blocks=scope(p,'sip').blocks;
  assert.match(blocks.find(x=>x.title==='Пол 1 этажа').text,/224 мм.*пенополистирол/);
  assert.match(blocks.find(x=>x.title==='Наружные стены 1 этажа').text,/174 мм/);
  assert.match(blocks.find(x=>x.title==='Потолок').text,/224 мм/);
  assert.match(blocks.find(x=>x.title==='Перегородки 1 этажа').text,/50×100 мм.*100 мм без обшивки/);
  p.settings.sip.partitionFrameSection='50x150';
  assert.match(scope(p,'sip').blocks.find(x=>x.title==='Перегородки 1 этажа').text,/50×150 мм.*150 мм без обшивки/);
  p.settings.sip.partitionType='sip';p.settings.sip.partitionThickness='124';p.settings.sip.partitionPanelFamily='mineral-wool';
  assert.match(scope(p,'sip').blocks.find(x=>x.title==='Перегородки 1 этажа').text,/124 мм.*минеральной ватой/);
});

test('second-floor specification follows selected panel, disabled structures are absent', () => {
  const p=createDefaultProject();p.meta.floors=2;p.upperFloors=[createUpperFloorPlan(p.plan)];p.services.sipSecondFloor=true;
  p.settings.sip.secondFloorThickness='174';p.settings.sip.secondFloorPanelFamily='csp-pps';p.services.sipCeiling=false;
  const blocks=scope(p,'sip').blocks;
  assert.match(blocks.find(x=>x.title==='Межэтажное перекрытие').text,/174 мм.*ЦСП/);
  assert.ok(!blocks.some(x=>x.title==='Потолок'));
});

test('internal scope explains each room by surface and omits excluded materials', () => {
  const p=createDefaultProject();p.services.internalFinish=true;
  p.plan.house={w:6,h:4};p.plan.rooms=[{id:'wet',name:'Санузел',x:0,y:0,w:3,h:4},{id:'dry',name:'Спальня',x:3,y:0,w:3,h:4}];
  const before=calculateProject(p);const saved=JSON.stringify(p);
  const item=scope(p,'internal');
  const wet=item.blocks.find(x=>x.title.includes('Санузел')).text;
  assert.match(wet,/Пол:.*ГВЛВ 20 мм.*плитка/);
  assert.match(wet,/Стены:.*влагостойкий гипсокартон 12,5 мм/);
  assert.match(wet,/Потолок:.*натяжной потолок ПВХ/);
  assert.match(item.blocks.find(x=>x.title.includes('Спальня')).text,/ламинат.*имитация бруса/);
  assert.equal(JSON.stringify(p),saved);assert.deepEqual(calculateProject(p).totals,before.totals);
  p.settings.internal.roomFinishes={'1:dry':{enabled:false}};
  assert.ok(!scope(p,'internal').blocks.some(x=>x.title.includes('Спальня')));
  const c=calculateProject(p);c.sections.find(x=>x.key==='internal').lines=c.sections.find(x=>x.key==='internal').lines.filter(x=>x.catalogId!=='MAT-209');
  assert.doesNotMatch(buildCommercialScope(p,c).find(x=>x.key==='internal').blocks.find(x=>x.title.includes('Санузел')).text,/влагостойкий гипсокартон/);
});

test('sauna scope replaces regular walls and respects work filter and room drain', () => {
  const p=createDefaultProject();p.services.internalFinish=true;
  p.plan.house={w:3,h:3};p.plan.rooms=[{id:'sauna',name:'Парная',x:0,y:0,w:3,h:3}];
  p.settings.internal.roomFinishes={'1:sauna':{sauna:enableAutoSauna(),drain:{quantity:2}}};
  const item=scope(p,'internal',{includeLabor:false});
  const text=item.blocks.find(x=>x.title.includes('Парная')).text;
  assert.match(text,/Парная:.*вагонкой.*утепление.*пароизоляция/);
  assert.match(text,/дымоход/);assert.match(text,/Трап: 2 шт/);
  assert.doesNotMatch(text,/имитация бруса|работы включены|натяжной потолок/);
  assert.deepEqual(scope(migrateProject(JSON.parse(JSON.stringify(p))),'internal').blocks,scope(p,'internal').blocks);
});

test('roof floor and pile diagram layers are independent, with terrace roof only on roof sheet', () => {
  const options={showRoof:true,showPlatforms:false,showBinding:true};
  const roof=printDiagramLayers('roof',options),floor=printDiagramLayers('floor',options),piles=printDiagramLayers('foundation',options);
  assert.equal(roof.showPlatforms,true);assert.equal(roof.showRoof,true);assert.equal(roof.showPiles,false);
  assert.equal(floor.showRoof,false);assert.equal(floor.showPlatforms,false);
  assert.equal(piles.showRoof,false);assert.equal(piles.showPlatforms,true);assert.equal(piles.showBinding,true);
  assert.equal(printDiagramLayers('floor',{},1).showPlatforms,false);
  const terrace={x:6,y:0,w:3,h:4,roof:{mode:'cold'}};
  assert.ok(platformRoofFrame(terrace,{w:6,h:4}));
  assert.equal(platformRoofFrame({...terrace,roof:{mode:'none'}},{w:6,h:4}),null);
  assert.deepEqual(options,{showRoof:true,showPlatforms:false,showBinding:true});
});
