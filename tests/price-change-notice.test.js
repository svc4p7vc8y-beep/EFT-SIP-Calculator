import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, summarizePriceCatalogChanges } from '../src/react/state/project-model.js';
import { priceCatalogFingerprint, showLocalPriceChangeNotice } from '../src/react/state/price-change-notice.js';

test('shared server nomenclature never appears as a local price reset warning', () => {
  const project = createDefaultProject();
  project.priceMat.push({ id: 'MAT-LOCAL', price: 900 });
  const changes = summarizePriceCatalogChanges(project);
  assert.equal(changes.added, 1);
  assert.equal(showLocalPriceChangeNotice({ id: 'team-user' }, changes, priceCatalogFingerprint(project), ''), false);
});

test('local price notice can be dismissed without changing prices and reappears for a new change', () => {
  const project = createDefaultProject();
  project.priceMat[0].price += 10;
  const changes = summarizePriceCatalogChanges(project);
  const fingerprint = priceCatalogFingerprint(project);
  assert.equal(showLocalPriceChangeNotice(null, changes, fingerprint, ''), true);
  assert.equal(showLocalPriceChangeNotice(null, changes, fingerprint, fingerprint), false);
  assert.equal(project.priceMat[0].price, createDefaultProject().priceMat[0].price + 10);
  project.priceMat[0].price += 1;
  assert.equal(showLocalPriceChangeNotice(null, summarizePriceCatalogChanges(project), priceCatalogFingerprint(project), fingerprint), true);
});
