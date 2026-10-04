// Замер высоты земли игры (чанковый рельеф): node models/morvokzal/terr.mjs x,z x,z ...
import { Terrain } from '../../web/js/terrain.js';
import { readFileSync, existsSync } from 'node:fs';
const dir = 'data/terrain';
const index = JSON.parse(readFileSync(dir + '/index.json', 'utf8'));
const coarse = readFileSync(dir + '/' + index.coarse.file);
const cb = coarse.buffer.slice(coarse.byteOffset, coarse.byteOffset + coarse.byteLength);
const load = async (tx, tz) => { const f = `${dir}/${tx}_${tz}.bin`; if (!existsSync(f)) return null; const b = readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const t = Terrain.chunked(index, cb, load);
await t.ensureRect(-200, -200, 400, 400);
for (const a of process.argv.slice(2)) {
  const [x, z] = a.split(',').map(Number);
  console.log(a, t.heightAt(x, z).toFixed(2));
}
