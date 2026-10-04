// Пятна моделей памятников: габарит GLB по горизонтали → data/landmark-footprints.json.
//   node tools/landmark-footprints.mjs
//
// Зачем: деревья и кусты сажаются по зелени OSM и вдоль улиц и не знают, где
// стоит модель памятника (у памятников, в отличие от зданий, контура в OSM
// нет). Отсюда сосна на граните «Солдата и Матроса». Посадке (props.js через
// world.__noPlant) нужен хотя бы прямоугольник модели.
//
// Модели ставятся без поворота — сдвигом в (ox, y, oz), поэтому габарит
// модели в её осях и есть пятно в мире относительно (ox, oz). Габарит берём
// по min/max атрибута POSITION каждой сетки с учётом матриц узлов — читать
// сами вершины не нужно.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const defs = JSON.parse(readFileSync(join(ROOT, 'data', 'landmarks.json'), 'utf8'));

function glbJson(path) {
  const b = readFileSync(path);
  const len = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + len).toString('utf8'));
}

// 4×4 по столбцам, как в glTF
const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
function trs(n) {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
    (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
    (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function footprint(g) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  const visit = (i, parent) => {
    const n = g.nodes[i], m = mul(parent, trs(n));
    if (n.mesh != null) for (const pr of g.meshes[n.mesh].primitives) {
      const a = g.accessors[pr.attributes.POSITION];
      if (!a.min || !a.max) continue;
      for (let c = 0; c < 8; c++) {
        const p = [c & 1 ? a.max[0] : a.min[0], c & 2 ? a.max[1] : a.min[1], c & 4 ? a.max[2] : a.min[2]];
        const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
        const z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      }
    }
    for (const c of n.children || []) visit(c, m);
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const i of g.scenes[g.scene || 0].nodes) visit(i, I);
  return [x0, z0, x1, z1].map(v => +v.toFixed(2));
}

const out = {};
for (const d of defs) {
  if (d.style !== 'model' || !d.file) continue;
  const p = join(ROOT, 'data', 'models', d.file);
  if (!existsSync(p)) { console.warn('нет файла', d.file); continue; }
  const fp = footprint(glbJson(p));
  out[d.file] = fp;
  console.log(d.file.padEnd(28), fp.join(' '), `${(fp[2] - fp[0]).toFixed(1)} × ${(fp[3] - fp[1]).toFixed(1)} м`);
}
writeFileSync(join(ROOT, 'data', 'landmark-footprints.json'), JSON.stringify(out, null, 0) + '\n');
console.log('моделей', Object.keys(out).length, '→ data/landmark-footprints.json');
