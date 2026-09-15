import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveLocalProjectNumber } from '../src/react/storage/project-number.js';

test('local numbering never rewinds when an older project is opened', async () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  assert.equal(await reserveLocalProjectNumber('0001', storage), '0002');
  assert.equal(await reserveLocalProjectNumber('0001', storage), '0003');
  assert.equal(await reserveLocalProjectNumber('0100', storage), '0101');
  assert.equal(await reserveLocalProjectNumber('old-plan', storage), '0102');
});
