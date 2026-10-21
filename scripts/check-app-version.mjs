import { execFileSync } from 'node:child_process';
import { APP_VERSION } from '../src/react/data/app-version.js';

const previousFile = 'src/react/data/app-version.js';
let previous = 263;
execFileSync('git', ['rev-parse', 'HEAD^'], { stdio: 'ignore' });
let source = '';
try {
  source = execFileSync('git', ['show', `HEAD^:${previousFile}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
} catch (error) {
  // This release introduces the version file; its predecessor displayed 263.
  const priorPath = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD^', '--', previousFile], { encoding: 'utf8' });
  if (priorPath.trim() || APP_VERSION !== 264) throw error;
}
if (source) {
  const match = source.match(/export const APP_VERSION = (\d+);/);
  if (!match) throw new Error(`Cannot read previous app version from ${previousFile}`);
  previous = Number(match[1]);
}
if (APP_VERSION !== previous + 1) throw new Error(`App version must advance by one: ${previous} → ${previous + 1}, got ${APP_VERSION}`);
console.log(`App version ${previous} → ${APP_VERSION}`);
