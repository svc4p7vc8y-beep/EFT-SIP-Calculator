import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { MAX_ESTIMATE_IMAGES, normalizeEstimateImages } from '../src/react/state/estimate-images.js';

test('project images survive save and reopen, old projects remain empty', () => {
  const project = createDefaultProject();
  const data = 'data:image/png;base64,aGVsbG8=';
  project.estimateImages = [{ id: 'image-1', data, caption: 'Эскиз фасада' }];
  assert.deepEqual(migrateProject(JSON.parse(JSON.stringify(project))).estimateImages, project.estimateImages);
  delete project.estimateImages;
  assert.deepEqual(migrateProject(project).estimateImages, []);
});

test('only bounded embedded raster images enter the project and print view', () => {
  const valid = { id: 'one', data: 'data:image/jpeg;base64,aGVsbG8=', caption: 'Картинка' };
  const images = normalizeEstimateImages([valid, { data: 'https://untrusted.example/image.jpg' }, { data: 'data:image/svg+xml;base64,aGVsbG8=' }, ...Array(MAX_ESTIMATE_IMAGES + 2).fill(valid)]);
  assert.equal(images.length, MAX_ESTIMATE_IMAGES - 2);
  assert.equal(new Set(images.map((item) => item.id)).size, images.length);
  assert.ok(images.every((item) => item.data.startsWith('data:image/jpeg;base64,')));
});
