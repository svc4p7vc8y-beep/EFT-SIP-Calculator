import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {roofFormPatch,roofFormValue} from '../src/react/calculations/roof-form.js';
import {roofControlVisibility} from '../src/react/calculations/roof-control-visibility.js';

test('flat parapet is a form choice over the existing saved flat roof model',()=>{
  const roof={shape:'gable',flatParapetMode:'none',flatDeckMaterial:'osb',flatDeckLayers:2};
  Object.assign(roof,roofFormPatch(roof,'flat-parapet'));
  assert.equal(roofFormValue(roof),'flat-parapet');
  assert.equal(roof.shape,'flat');
  assert.equal(roof.flatParapetMode,'flashing');
  assert.equal(roof.flatDeckMaterial,'osb');
  Object.assign(roof,roofFormPatch(roof,'flat'));
  assert.equal(roofFormValue(roof),'flat');
  assert.equal(roof.flatParapetMode,'none');
});

test('new roof accessories start off and legacy projects keep their prior inclusion',()=>{
  const project=createDefaultProject();
  for(const key of ['includeEaveTrim','includeVergeTrim','includeRidgeSeal','includeGutter'])assert.equal(project.settings.roof[key],false,key);
  const old=structuredClone(project);old.appVersion=308;
  for(const key of ['includeEaveTrim','includeVergeTrim','includeRidgeSeal','includeGutter'])delete old.settings.roof[key];
  const restored=migrateProject(old);
  for(const key of ['includeEaveTrim','includeVergeTrim','includeRidgeSeal'])assert.equal(restored.settings.roof[key],true,key);
  assert.equal(restored.settings.roof.includeGutter,false);
  const base=calculateProject(project);
  const enabled=structuredClone(project);Object.assign(enabled.settings.roof,{includeEaveTrim:true,includeVergeTrim:true,includeRidgeSeal:true});
  const included=calculateProject(enabled);
  assert.ok(included.totals.total>base.totals.total);
  assert.ok(included.lines.some(line=>line.id==='roof:eave-trim'));
  assert.ok(!base.lines.some(line=>line.id==='roof:eave-trim'));
});

test('controls follow construction and form without clearing saved choices',()=>{
  assert.equal(roofControlVisibility({shape:'flat',type:'cold'}).showMainAccessories,false);
  assert.equal(roofControlVisibility({shape:'gable',type:'sip'}).showMauerlat,false);
  assert.equal(roofControlVisibility({shape:'gable',type:'cold'}).showMauerlat,true);
  assert.equal(roofControlVisibility({shape:'tiered',type:'cold'}).showRidgeSeal,false);
  assert.equal(roofControlVisibility({shape:'hip',type:'cold'}).showVergeTrim,false);
});
