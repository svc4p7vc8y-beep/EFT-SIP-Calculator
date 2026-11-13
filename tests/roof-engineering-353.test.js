import test from 'node:test';
import clipping from 'polygon-clipping';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {flatWallDrop,setFlatWallDrop,flatSlopeAngle,setFlatSlopeAngle} from '../src/react/calculations/flat-wall-height.js';
import {roofOverhangValue,resetSeparateOverhangs,hasSeparateOverhangs} from '../src/react/calculations/roof-overhangs.js';
import {normalizePriceAdjustments,setCommonPriceAdjustment} from '../src/react/calculations/price-adjustments.js';
import {engineeringSymbolSize} from '../src/react/state/engineering-symbol-size.js';
const near=(a,b,t=.01)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const fixture=()=>{const p=createDefaultProject();p.plan.house={w:6,h:8};p.plan.rooms=[];p.plan.platforms=[];p.plan.openings=[];p.services.terrace=false;return p;};

test('flat height drop and angle are reciprocal in both directions without enabling structural wall trimming',()=>{
 const p=fixture();Object.assign(p.settings.roof,{shape:'flat',flatSlopeMode:'tapered',flatSlopeDirection:'back'});
 setFlatWallDrop(p,.4);near(p.settings.roof.flatSlopePercent,5);near(flatSlopeAngle(p),2.862405);
 setFlatSlopeAngle(p,Math.atan(.04)*180/Math.PI);near(flatWallDrop(p),.32);
 p.settings.roof.flatSlopeDirection='left';near(flatWallDrop(p),.24);
 const saved=migrateProject(JSON.parse(JSON.stringify(p)));near(flatWallDrop(saved),.24);assert.equal(saved.settings.roof.flatSlopeMode,'tapered');
});
for(const shape of ['gable','hip','flat'])for(const axis of ['x','y'])test(`${shape}/${axis}: four overhangs define roof planes, framing and purchasable area`,()=>{
 const p=fixture();Object.assign(p.settings.roof,{shape,ridgeAxis:axis,type:'cold',flatSlopeMode:'tapered',flatSlopeDirection:axis==='x'?'back':'right',overhangFrontM:.1,overhangBackM:.8,overhangFirstM:.2,overhangSecondM:.7});
 const before=structuredClone(p),c=calculateProject(p),r=calculateProductionCutting(p,c),faces=r.assembly.roofModel.faces.filter(f=>f.group==='main'),v=faces.flatMap(f=>f.vertices);
 const ai=axis==='x'?0:1,ci=1-ai,A=ai===0?6000:8000,C=ci===0?6000:8000;
 near(Math.min(...v.map(p=>p[ai])),-100);near(Math.max(...v.map(p=>p[ai])),A+800);near(Math.min(...v.map(p=>p[ci])),-200);near(Math.max(...v.map(p=>p[ci])),C+700);
 near(faces.reduce((sum,f)=>sum+f.area,0),c.roof.geometry.totalSlopeArea,.03);
 assert.ok(r.assembly.rafters.length);assert.ok(r.assembly.rafters.every(r=>r.worldA?.every(Number.isFinite)&&r.worldB?.every(Number.isFinite)));
 assert.deepEqual(p,before);
 const saved=migrateProject(JSON.parse(JSON.stringify(p)));assert.equal(saved.settings.roof.overhangBackM,.8);
});
test('old overhangs remain fallback and common edit resets only its matching overrides',()=>{
 const p=fixture(),old=calculateProject(p);assert.equal(hasSeparateOverhangs(p.settings.roof),false);
 assert.deepEqual(calculateProject(migrateProject(JSON.parse(JSON.stringify(p)))).roof.geometry,old.roof.geometry);
 Object.assign(p.settings.roof,{overhangFrontM:.1,overhangBackM:.8,overhangFirstM:.2});resetSeparateOverhangs(p.settings.roof,'gableOverhang');assert.equal(p.settings.roof.overhangFrontM,undefined);assert.equal(p.settings.roof.overhangFirstM,.2);near(roofOverhangValue(p.settings.roof,'overhangBackM','gableOverhang'),.3);
});
test('section shared percentage assigns materials and labor, subsequent individual edits remain independent after save',()=>{
 let settings=setCommonPriceAdjustment({},'roof',-12);assert.deepEqual(settings.roof,{common:-12,materials:-12,labor:-12});settings.roof.materials=-7;settings=normalizePriceAdjustments(JSON.parse(JSON.stringify(settings)));assert.deepEqual(settings.roof,{common:-12,materials:-7,labor:-12});
 settings=setCommonPriceAdjustment(settings,'roof',0);assert.deepEqual(settings.roof,{common:0,materials:0,labor:0});
});
test('wall symbols use physical dimensions rather than a universal forty-centimetre marker',()=>{
 assert.deepEqual(engineeringSymbolSize({kind:'ball-valve',width:.08,depth:.06}),{width:8,height:6});
 assert.deepEqual(engineeringSymbolSize({kind:'radiator',width:1,depth:.12}),{width:100,height:60});
});

for(const [name,points] of [['L',[[0,0],[10,0],[10,4],[4,4],[4,8],[0,8]]],['T',[[0,0],[10,0],[10,4],[7,4],[7,8],[3,8],[3,4],[0,4]]]])for(const shape of ['gable','hip','flat'])test(`${name}/${shape}: separate overhangs retain a single contour and matching roof area`,()=>{
 const p=fixture();p.plan.house={w:10,h:8,points:points.map(([x,y])=>({x,y}))};Object.assign(p.settings.roof,{shape,type:'cold',ridgeAxis:'x',overhangFrontM:.1,overhangBackM:.8,overhangFirstM:.2,overhangSecondM:.7});
 const c=calculateProject(p),r=calculateProductionCutting(p,c),model=r.assembly.roofModel;
 assert.ok(model.faces.length);assert.equal(clipping.union(...model.faces.filter(f=>f.group==='main').map(f=>[[...f.vertices.map(v=>v.slice(0,2)),f.vertices[0].slice(0,2)]])).length,1);assert.equal(c.roof.pitchedError,'');near(model.faces.filter(f=>f.group==='main').reduce((sum,f)=>sum+f.area,0),c.roof.geometry.totalSlopeArea,.03);
});
test('focusing an already rounded height or angle never changes the underlying slope',()=>{
 const p=fixture();Object.assign(p.settings.roof,{shape:'flat',flatSlopeMode:'tapered',flatSlopePercent:5.123});
 setFlatWallDrop(p,Number(flatWallDrop(p).toFixed(2)));setFlatSlopeAngle(p,Number(flatSlopeAngle(p).toFixed(1)));assert.equal(p.settings.roof.flatSlopePercent,5.123);
});
