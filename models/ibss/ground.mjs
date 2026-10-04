// Высота земли игры в точках: node models/ibss/ground.mjs
import { Terrain } from '../../web/js/terrain.js';
import { readFileSync, existsSync } from 'node:fs';
const dir = 'data/terrain';
const index = JSON.parse(readFileSync(dir + '/index.json', 'utf8'));
const coarse = readFileSync(dir + '/' + index.coarse.file);
const ab = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const load = (tx, tz) => { const f = `${dir}/${tx}_${tz}.bin`; return Promise.resolve(existsSync(f) ? ab(readFileSync(f)) : null); };
const t = Terrain.chunked(index, ab(coarse), load);
const k = t.chunkKey(-248, -36);
const [tx, tz] = k.split('_').map(Number);
const tile = t.tiles.get(k);
tile.data = new Int16Array(await load(tx, tz));
const s = Math.sin, a = 0;
// ось: sea direction e_sea = (-0.888,-0.459) в (x,z), along-shore s=(-0.459,0.888)
const O = [-252.0 + 0, -27.9]; // не важно
const pts = process.argv.slice(2).map(v => v.split(',').map(Number));
const rows = [];
for (const [x, z] of pts) rows.push([x, z, +t.heightAt(x, z).toFixed(2)]);
console.log(JSON.stringify(rows));
