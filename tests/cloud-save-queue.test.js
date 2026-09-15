import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('queued cloud saves stay attached to their original project and revision', async () => {
  const source = readFileSync(new URL('../src/react/cloud/TeamContext.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const callback = source.split('const saveProject = useCallback(')[1].split(',\n    [session.csrf]')[0].trim();
  const original = { id: 1, revision: 1, name: 'A' };
  const currentRef = { current: original };
  const calls = [];
  const states = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const api = async (_endpoint, { body }) => {
    calls.push(body);
    if (calls.length === 1) await gate;
    return { revision: body.revision + 1, name: 'A' };
  };
  const save = new Function('currentRef', 'saveQueue', 'session', 'eftApi', 'setCurrent', 'setSyncState', `return (${callback});`)(
    currentRef, { current: Promise.resolve() }, { csrf: '' }, api,
    value => states.push(value), () => {},
  );
  const first = save({ value: 1 });
  const second = save({ value: 2 });
  await new Promise(resolve => setImmediate(resolve));
  currentRef.current = { id: 2, revision: 8, name: 'B' };
  release();
  await Promise.all([first, second]);
  assert.deepEqual(calls.map(({ id, revision }) => [id, revision]), [[1, 1], [1, 2]]);
  assert.equal(currentRef.current.id, 2);
  assert.deepEqual(states, []);
});
