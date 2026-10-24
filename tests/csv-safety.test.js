import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeCsv } from '../src/react/utils/csv.js';

test('CSV export neutralizes spreadsheet formulas while preserving quoted cells', () => {
  assert.equal(serializeCsv([['=1+1', ' +cmd', '@name', 'a"b']]), '\uFEFF"\'=1+1";"\' +cmd";"\'@name";"a""b"');
});
