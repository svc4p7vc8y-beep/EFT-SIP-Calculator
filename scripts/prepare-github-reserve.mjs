import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve('dist');
const destination = resolve('dist-public/reserve');
const marker = resolve(source, 'standalone-build.json');
if (!existsSync(marker) || JSON.parse(readFileSync(marker, 'utf8')).standalone !== true) {
  throw new Error('Refusing to publish a server-dependent calculator as the reserve build. Set VITE_EFT_STANDALONE=true for its build.');
}
if (!existsSync(resolve(source, 'react.html')) || !existsSync('dist-public/index.html')) {
  throw new Error('Build both the public site and the standalone calculator before packaging Pages.');
}
cpSync(source, destination, { recursive: true });
const revision = (process.env.GITHUB_SHA || 'local').slice(0, 12);
const worker = resolve(destination, 'sw.js');
writeFileSync(worker, readFileSync(worker, 'utf8').replace(/const CACHE_NAME = '[^']+';/, `const CACHE_NAME = 'eft-calculator-react-reserve-${revision}';`));
const manifest = resolve(destination, 'manifest.webmanifest');
const app = JSON.parse(readFileSync(manifest, 'utf8'));
app.name = 'ЭФТ — резервный калькулятор';
app.short_name = 'ЭФТ Резерв';
writeFileSync(manifest, JSON.stringify(app, null, 2));
writeFileSync(resolve(destination, 'index.html'), '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=./react.html"><title>Резервный калькулятор ЭФТ</title><a href="./react.html">Открыть резервный калькулятор ЭФТ</a></html>');
console.log('Standalone calculator packaged at /reserve/react.html');
