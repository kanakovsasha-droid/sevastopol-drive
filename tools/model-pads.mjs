// Пятна моделей без контура OSM (памятники, фонтан, «Ракушка», мостик,
// деревья-модели): node tools/model-pads.mjs
//
// Посадка (props.js, street.js) знает дома и площадки, но не модели: у
// памятника своего контура в OSM нет, и деревья сажались прямо на его
// гранит — у «Солдата и Матроса» роща росла на клине постамента. Модель
// приезжает в чанк асинхронно, позже посадки, поэтому пятно считаем
// заранее: выпуклая оболочка нижней части модели (вершины ниже 1.5 м над
// её нулём — стилобат, ступени, площадка, ствол дерева-модели, а не крона
// и не вытянутая рука) в метрах мира. Пишем полем `pad` в
// data/landmarks.json: его целиком грузит main.js, и квадрат у шва знает
// пятно памятника, который стоит в соседнем.
import { readFileSync, writeFileSync } from 'node:fs';

const LOW = 1.5;

function glbPoints(file) {
  const b = readFileSync(file);
  const jl = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'));
  const bin = b.subarray(20 + jl + 8);
  const pts = [];
  const mul = (a, m) => {           // 4×4 по столбцам, как в glTF
    const r = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++)
      for (let k = 0; k < 4; k++) r[c * 4 + rr] += a[k * 4 + rr] * m[c * 4 + k];
    return r;
  };
  const local = n => {
    if (n.matrix) return n.matrix;
    const [tx, ty, tz] = n.translation || [0, 0, 0];
    const [x, y, z, w] = n.rotation || [0, 0, 0, 1];
    const [sx, sy, sz] = n.scale || [1, 1, 1];
    return [
      (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
      2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
      2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
      tx, ty, tz, 1];
  };
  const walk = (ni, parent) => {
    const n = j.nodes[ni];
    const m = mul(parent, local(n));
    if (n.mesh !== undefined) for (const pr of j.meshes[n.mesh].primitives) {
      const a = j.accessors[pr.attributes.POSITION];
      const bv = j.bufferViews[a.bufferView];
      const stride = bv.byteStride || 12, off = (bv.byteOffset || 0) + (a.byteOffset || 0);
      if (a.componentType !== 5126) throw new Error(file + ': вершины не float');
      for (let i = 0; i < a.count; i++) {
        const o = off + i * stride;
        const x = bin.readFloatLE(o), y = bin.readFloatLE(o + 4), z = bin.readFloatLE(o + 8);
        const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
        if (wy > LOW) continue;
        pts.push([m[0] * x + m[4] * y + m[8] * z + m[12], m[2] * x + m[6] * y + m[10] * z + m[14]]);
      }
    }
    for (const c of n.children || []) walk(c, m);
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const ni of j.scenes[j.scene || 0].nodes) walk(ni, I);
  return pts;
}

// выпуклая оболочка (монотонная цепь Эндрю)
function hull(p) {
  p = p.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

const L = JSON.parse(readFileSync('data/landmarks.json', 'utf8'));
for (const d of L) {
  // у модели с контуром (skip) пятно — сам дом из OSM, посадка его знает
  if (d.style !== 'model' || (d.skip && d.skip.length)) continue;
  const pts = glbPoints('data/models/' + d.file);
  if (pts.length < 3) { console.log('нет низа:', d.name); continue; }
  const h = hull(pts);
  const pad = [];
  for (const [x, z] of h) pad.push(+(d.ox + x).toFixed(1), +(d.oz + z).toFixed(1));
  d.pad = pad;
  let a = 0;
  for (let i = 0, n = pad.length / 2; i < n; i++) {
    const k = (i + 1) % n;
    a += pad[i * 2] * pad[k * 2 + 1] - pad[k * 2] * pad[i * 2 + 1];
  }
  console.log(d.name.padEnd(60), (h.length + ' углов').padEnd(10), Math.abs(a / 2).toFixed(0) + ' м²');
}

// формат файла прежний (отступ 2), только пятно — одной строкой
writeFileSync('data/landmarks.json', JSON.stringify(L, null, 2)
  .replace(/"pad": \[[^\]]*\]/g, m => m.replace(/\s+/g, '').replace('"pad":', '"pad": ').replace(/,/g, ', ')) + '\n');
