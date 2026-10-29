import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {productionScene} from '../src/react/calculations/production-scene.js';
import {createWindowFromDesign,WINDOW_DESIGN_LIBRARY,windowPrice,validateWindow} from '../src/react/state/window-products.js';

test('design library offers valid varied schemes without inventing supplier prices',()=>{
  assert.ok(WINDOW_DESIGN_LIBRARY.length>=16);
  assert.equal(new Set(WINDOW_DESIGN_LIBRARY.map(item=>item.id)).size,WINDOW_DESIGN_LIBRARY.length);
  for(const design of WINDOW_DESIGN_LIBRARY){
    const product=createWindowFromDesign(design);
    assert.deepEqual(validateWindow(product),[],design.id);
    assert.equal(windowPrice(product).unitRub,null,design.id);
    assert.equal(product.price.mode,'design_unpriced');
  }
});

test('3D window geometry follows the assigned opening and remains a separate layer',()=>{
  const project=createDefaultProject();
  project.plan.openings.push({id:'window-3d-test',type:'window',width:1.2,height:1.2,x:2,y:.087,orientation:'h',outer:true,sillHeight:.85});
  project.windowProducts=[createWindowFromDesign(WINDOW_DESIGN_LIBRARY.find(item=>item.id==='two-opening'),{openingId:'window-3d-test'})];
  const estimate=calculateProject(project),report=calculateProductionCutting(project,estimate),scene=productionScene(report,project);
  const windowParts=scene.panels.filter(item=>item.layer==='windows');
  assert.equal(windowParts.length,6);
  const openingSurface=report.surfaces.find(surface=>surface.openings?.some(opening=>opening.id==='window-3d-test'));
  assert.ok(openingSurface);
  const opening=openingSurface.openings.find(item=>item.id==='window-3d-test');
  const glass=windowParts.find(item=>item.windowGlass);
  assert.deepEqual(glass.shape[0][0],[opening.x+45,opening.sill+45]);
  assert.equal(glass.placement.origin[2],scene.bases[0]);
  assert.ok(windowParts.every(item=>item.referenceOnly));
  assert.ok(report.parts.every(item=>item.layer!=='windows'));
});
