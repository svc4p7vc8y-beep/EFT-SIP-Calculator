import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {productionScene} from '../src/react/calculations/production-scene.js';
import {productionView} from '../src/react/calculations/production-views.js';
import {assemblyPlatformView} from '../src/react/calculations/platform-assembly.js';
import {platformBindingLines,generateAutoPileRows,bindingLinesFromPileRows} from '../src/react/calculations/foundation-model.js';

const fixture=(side='bottom',mode='shared')=>{
 const p=createDefaultProject();p.plan.house={w:6,h:8};p.plan.rooms=[];p.plan.openings=[];
 const [x,y,w,h]=({bottom:[1,8,4,2],top:[1,-2,4,2],left:[-2,2,2,4],right:[6,2,2,4]})[side];
 p.plan.platforms=[{id:'t',kind:'terrace',x,y,w,h,include:true,foundation:{mode},binding:{mode},steps:3,stairSide:side,tread:.3,riser:.18,stairWidth:1.2,roof:{mode:'cold',shape:'shed'}}];
 p.plan.pileRows=generateAutoPileRows(p.plan,2.5);p.plan.bindingLines=bindingLinesFromPileRows(p.plan.pileRows);
 return p;
};
const run=p=>{const c=calculateProject(p);return {c,r:calculateProductionCutting(p,c)};};
for(const side of ['top','bottom','left','right'])for(const mode of ['shared','separate','none'])test(`platform ${side}/${mode}: physical binding equals existing estimate length`,()=>{
 const p=fixture(side,mode),{c,r}=run(p),lines=platformBindingLines(p.plan,p.settings.piles);
 assert.equal(lines.length,mode==='shared'?3:mode==='separate'?4:0);
 assert.equal(c.foundation.platformBindingLength,mode==='shared'?8:mode==='separate'?12:0);
 assert.ok(Math.abs(r.assembly.binding.reduce((s,m)=>s+m.length/1000,0)-c.foundation.bindingLength)<.01);
 assert.equal(r.assembly.platforms[0].steps.length,3);
 const scene=productionScene(r,p);assert.ok(scene.panels.some(s=>s.id==='platform:t:deck'));
 assert.equal(scene.panels.filter(s=>s.id.startsWith('platform:t:step:')).length,3);
 assert.ok(scene.panels.some(s=>s.layer==='platformRoof'));
 assert.ok(scene.beams.filter(s=>s.id.startsWith('platform:t:post:')).every(s=>s.profile==='150×100'&&s.b[2]>s.a[2]));
});
test('view toggle does not change stock, geometry approval or estimate; hides only platform-only supports',()=>{
 const p=fixture(),{c,r}=run(p),s=productionScene(r,p),house=assemblyPlatformView(r.assembly,false);
 p.settings.productionCutting.showPlatforms=false;const hidden=run(p),scene=productionScene(hidden.r,p);
 assert.equal(hidden.c.totals.total,c.totals.total);assert.equal(hidden.r.revision,r.revision);assert.deepEqual(hidden.r.members,r.members);
 assert.deepEqual(hidden.r.timberStock,r.timberStock);assert.equal(scene.platforms.length,0);assert.ok(!scene.panels.some(s=>s.id.startsWith('platform:')));
 assert.ok(!scene.beams.some(s=>s.group==='platform'));
 assert.ok(house.piles.length<r.assembly.piles.length);assert.ok(house.pileSources.every(s=>s!=='platform'));
 assert.ok(s.beams.length>scene.beams.length);
 assert.ok(productionView(r,p).faces.some(s=>s.id==='platform:t:deck'));assert.ok(!productionView(hidden.r,p).faces.some(s=>s.id==='platform:t:deck'));
});
test('concrete blocks reuse calculated binding, without extra perimeter or duplicated supports',()=>{
 const p=fixture();p.settings.piles.pileType='concreteBlock';const {c,r}=run(p);
 assert.equal(c.foundation.platformBindingLines.length,0);
 assert.equal(r.assembly.binding.length,c.foundation.bindingLines.filter(l=>l.include!==false).length);
 assert.equal(new Set(r.assembly.piles.map(p=>p.join(','))).size,r.assembly.piles.length);
 assert.ok(Math.abs(r.assembly.binding.reduce((s,m)=>s+m.length/1000,0)-c.foundation.bindingLength)<.01);
});
test('excluding foundation platforms omits both their supports and binding; deck is independent',()=>{
 const p=fixture();p.settings.piles.includePlatforms=false;const {c,r}=run(p);
 assert.equal(c.foundation.platformBindingLength,0);assert.equal(c.foundation.platformPiles,0);
 assert.ok(!r.assembly.binding.some(m=>m.group==='platform'));assert.equal(r.assembly.platforms.length,1);
});
test('moving/removing a porch follows plan and does not mutate saved dimensions; JSON defaults are safe',()=>{
 const p=fixture();p.plan.platforms[0].kind='porch';p.plan.platforms[0].x=2;const before=JSON.stringify(p.plan),{r}=run(p);
 assert.equal(r.assembly.platforms[0].contour[0][0],2000);assert.equal(JSON.stringify(p.plan),before);
 const saved=migrateProject(JSON.parse(JSON.stringify(p)));assert.equal(saved.settings.productionCutting.showPlatforms,true);
 saved.settings.productionCutting.showPlatforms=false;assert.equal(migrateProject(JSON.parse(JSON.stringify(saved))).settings.productionCutting.showPlatforms,false);
 p.plan.platforms[0].include=false;const removed=run(p);assert.equal(removed.r.assembly.platforms.length,0);assert.equal(removed.c.foundation.platformBindingLength,0);
});
test('deck and descending stair tops match saved elevations, no roof invented without cover',()=>{
 const p=fixture();p.plan.platforms[0].deckHeightMm=-50;p.plan.platforms[0].roof.mode='none';const {r}=run(p),s=productionScene(r,p),steps=s.panels.filter(s=>s.id.startsWith('platform:t:step:'));
 assert.equal(r.assembly.platforms[0].deckZ,-50);assert.deepEqual(steps.map(s=>s.placement.origin[2]+s.thickness/2),[-230,-410,-590]);
 assert.ok(!s.panels.some(s=>s.layer==='platformRoof'));assert.equal(r.assembly.platforms[0].posts.length,0);
});
test('shared, separate and absent deck supports preserve existing hand binding lines',()=>{
 const p=fixture();p.plan.bindingLines=[{id:'manual',x1:1,y1:1,x2:4,y2:3,include:true}];const before=JSON.stringify(p.plan.bindingLines),{r}=run(p);
 assert.equal(JSON.stringify(p.plan.bindingLines),before);assert.deepEqual(r.assembly.binding[0].a,[1000,1000]);assert.equal(r.assembly.binding.filter(m=>m.group==='platform').length,3);
});
