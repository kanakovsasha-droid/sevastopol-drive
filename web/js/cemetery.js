import * as THREE from 'three';
import { plantFlora } from './flora.js?v=6fe82d29';

// Кладбища. Старое городское кладбище на улице Пожарова (вокруг церкви Всех
// Святых), Караимское и Еврейское рядом с ним.
//
// В OSM контура главного кладбища НЕТ вовсе (там просто лес), поэтому его
// контур, аллеи и ворота заданы здесь вручную — по спутнику Esri, по дорожкам
// из OSM (footway w91744577, w91744604, w91744618, w91744644) и по заметкам
// models/vseh_svyatyh/NOTES.md. Караимское и Еврейское берутся из данных чанка
// (areas, k = cemetery): их контур настоящий, а всё внутри — той же машиной.
//
// Всё, что умножается тысячами, — это InstancedMesh: пять видов православных
// могил, три вида камней для караимского и еврейского участка, три породы
// деревьев и кусты. Редкие памятники (склепы, большие кресты, обелиски со
// звездой) и мелкая арматура (столбы, ворота) слиты в одну статичную сетку
// вместе с подсыпкой земли и дорожками. Итого около тринадцати вызовов
// отрисовки на весь квартал с кладбищами.
//
// Расстановка ДЕТЕРМИНИРОВАНА: каждая точка — функция индексов решётки
// (аллея, шаг, ряд) или координат, а не порядка генерации и не чанка. Объект
// строит тот чанк, в который попала его точка (inChunk), поэтому на шве
// ничего не удваивается и не пропадает.

const CHUNK = 1024;
const PROF = new URLSearchParams(location.search).has('prof');
// ?nocem — выключить кладбища (для снимков «до» и замеров из одной сборки)
const OFF = new URLSearchParams(location.search).has('nocem');
// Пауза между этапами: отдаём кадр менеджеру, но сами считаем только свою работу.
function* pause(acc) {
  acc.ms += performance.now() - acc.t;
  yield;
  acc.t = performance.now();
}

// ------------------------------------------------------------------ данные
// Контур — по границам леса и дорожкам; вдоль запада и севера он идёт ПО
// осевой дорожки OSM, ограда стоит на 3.2 м внутри.
const POZHAROVA = {
  id: 'pozharova', style: 'orthodox', name: 'Старое городское кладбище (Пожарова)',
  poly: [
    -1486, 1501, -1440, 1511, -1424, 1545, -1421, 1700, -1424, 1800, -1436, 1905,
    -1480, 1908, -1521, 1892, -1537, 1846, -1545, 1815, -1553, 1789, -1572, 1750,
    -1585, 1730, -1605, 1688, -1612, 1661, -1628, 1624, -1646, 1598, -1601, 1585,
    -1505, 1521,
  ],
  fence: true, fenceInset: 3.2, fillInset: 4.6,
  // главные ворота — где аллея w91744577 пересекает ограду; остальные
  // пересечения дорожек с оградой — калитки
  mainAlley: 'w91744577',
  // дорожки по спутнику (тропы в лесу между ОСМ-аллеями), мощёные
  alleys: [
    // от церкви на юг
    { w: 2.2, pts: [-1494, 1649, -1499, 1668, -1505, 1692, -1503, 1722, -1500, 1752, -1499, 1792, -1498, 1832, -1495, 1862, -1492, 1886] },
    // восточнее церкви на юг
    { w: 2.0, pts: [-1470, 1646, -1468, 1690, -1467, 1740, -1466, 1790, -1462, 1840, -1458, 1888] },
    // у восточной ограды
    { w: 2.0, pts: [-1440, 1540, -1436, 1620, -1434, 1700, -1434, 1780, -1440, 1860, -1444, 1895] },
    // на запад от площадки у церкви (по спутнику, см. NOTES.md)
    { w: 2.2, pts: [-1511, 1634, -1548, 1634, -1590, 1648, -1612, 1661] },
    // северный квартал: от главной аллеи к дорожке w91744604
    { w: 2.0, pts: [-1472, 1548, -1510, 1566, -1550, 1586, -1590, 1608, -1626, 1626] },
    // поперечные между южными аллеями
    { w: 2.0, pts: [-1522, 1772, -1500, 1766, -1470, 1763, -1436, 1760] },
    { w: 2.0, pts: [-1536, 1852, -1500, 1857, -1470, 1859, -1438, 1864] },
    // между главной аллеей и восточной: поперёк северного квартала
    { w: 2.0, pts: [-1469, 1590, -1450, 1592, -1428, 1596] },
  ],
  noGrave: [{ x0: -1518, x1: -1464, z0: 1614, z1: 1658 }],
  // обмер церкви: привязываем плитку к её же контуру
  plazaRect: [-1510, 1623, -1472, 1648],
};

// Участки Караимского и Еврейского кладбищ берутся из areas; здесь — стиль.
const NEIGHBOURS = [
  { re: /караим/i, style: 'karaite', id: 'karaite' },
  { re: /еврей/i, style: 'jewish', id: 'jewish' },
];

// ------------------------------------------------------------------ мелочи
const s2l = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const lin = c => [s2l(c[0]), s2l(c[1]), s2l(c[2])];

// Целочисленный хеш → [0,1). Всё случайное в модуле — отсюда.
function hash3(a, b, c = 0) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const hxz = (x, z, s = 0) => hash3(Math.round(x * 16), Math.round(z * 16), s);
// Гладкий шум: значение в углах целочисленной решётки, сглаженная интерполяция.
function vnoise(x, z, seed = 0) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = x - xi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash3(xi, zi, seed), b = hash3(xi + 1, zi, seed);
  const c = hash3(xi, zi + 1, seed), d = hash3(xi + 1, zi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function pointInPoly(px, pz, p) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function polyArea2(p) {
  let a = 0;
  for (let i = 0, n = p.length / 2; i < n; i++) {
    const j = (i + 1) % n;
    a += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1];
  }
  return a / 2;
}
function bboxOf(p) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i];
    if (p[i + 1] < z0) z0 = p[i + 1]; if (p[i + 1] > z1) z1 = p[i + 1];
  }
  return [x0, z0, x1, z1];
}
// Контур, смещённый внутрь на d метров (угловой срез по биссектрисе).
function insetPoly(p, d) {
  let n = p.length / 2;
  if (Math.abs(p[0] - p[(n - 1) * 2]) < 1e-6 && Math.abs(p[1] - p[(n - 1) * 2 + 1]) < 1e-6) n--;
  const sgn = polyArea2(p) > 0 ? 1 : -1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n, b = (i + 1) % n;
    let e1x = p[i * 2] - p[a * 2], e1z = p[i * 2 + 1] - p[a * 2 + 1];
    let e2x = p[b * 2] - p[i * 2], e2z = p[b * 2 + 1] - p[i * 2 + 1];
    const l1 = Math.hypot(e1x, e1z) || 1, l2 = Math.hypot(e2x, e2z) || 1;
    e1x /= l1; e1z /= l1; e2x /= l2; e2z /= l2;
    const n1x = -e1z * sgn, n1z = e1x * sgn, n2x = -e2z * sgn, n2z = e2x * sgn;
    const k = 1 + n1x * n2x + n1z * n2z;
    let mx = n1x + n2x, mz = n1z + n2z;
    let s = k > 0.25 ? d / k : d * 2 / Math.max(0.5, Math.hypot(mx, mz));
    if (k <= 0.25) { const m = Math.hypot(mx, mz) || 1; mx /= m; mz /= m; s = d; }
    out.push(p[i * 2] + mx * s, p[i * 2 + 1] + mz * s);
  }
  return out;
}
function distSeg(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const L = vx * vx + vz * vz;
  const t = L > 1e-9 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / L)) : 0;
  return Math.hypot(px - ax - t * vx, pz - az - t * vz);
}
function segIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den;
  const u = ((cx - ax) * rz - (cz - az) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, x: ax + t * rx, z: az + t * rz };
}

// ------------------------------------------------------------------ сетка из кубиков
// Сборщик статичной геометрии: грани с плоскими нормалями, цвета в линейном
// пространстве. Все примитивы — стоячие (ось Y вверх), поворот только вокруг Y.
class MB {
  constructor() { this.P = []; this.N = []; this.C = []; this.I = []; this.v = 0; this.tf = null; }
  // Общий перенос/поворот/масштаб для сборки готовых памятников «на месте».
  place(x, y, z, yaw, k = 1) { this.tf = { x, y, z, c: Math.cos(yaw), s: Math.sin(yaw), k }; return this; }
  clear() { this.tf = null; return this; }
  _t(x, y, z) {
    const t = this.tf;
    if (!t) return [x, y, z];
    const X = x * t.k, Y = y * t.k, Z = z * t.k;
    return [t.x + X * t.c + Z * t.s, t.y + Y, t.z - X * t.s + Z * t.c];
  }
  face(vs, col, cen) {
    const V = vs.map(v => this._t(v[0], v[1], v[2]));
    const C = this._t(cen[0], cen[1], cen[2]);
    const ux = V[1][0] - V[0][0], uy = V[1][1] - V[0][1], uz = V[1][2] - V[0][2];
    const wx = V[2][0] - V[0][0], wy = V[2][1] - V[0][1], wz = V[2][2] - V[0][2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) return;
    nx /= l; ny /= l; nz /= l;
    let fx = 0, fy = 0, fz = 0;
    for (const q of V) { fx += q[0]; fy += q[1]; fz += q[2]; }
    fx = fx / V.length - C[0]; fy = fy / V.length - C[1]; fz = fz / V.length - C[2];
    if (nx * fx + ny * fy + nz * fz < 0) { V.reverse(); nx = -nx; ny = -ny; nz = -nz; }
    const b = this.v;
    for (const q of V) { this.P.push(q[0], q[1], q[2]); this.N.push(nx, ny, nz); this.C.push(col[0], col[1], col[2]); }
    this.I.push(b, b + 1, b + 2);
    if (V.length === 4) this.I.push(b, b + 2, b + 3);
    this.v += V.length;
  }
  // Усечённая пирамида (параллелепипед при tw = bw). Низа нет, если bottom = false.
  frustum(cx, y0, cz, bw, bd, tw, td, h, col, yaw = 0, bottom = false) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const R = (x, z) => [cx + x * c + z * s, cz - x * s + z * c];
    const B = [[-bw / 2, -bd / 2], [bw / 2, -bd / 2], [bw / 2, bd / 2], [-bw / 2, bd / 2]].map(p => R(p[0], p[1]));
    const T = [[-tw / 2, -td / 2], [tw / 2, -td / 2], [tw / 2, td / 2], [-tw / 2, td / 2]].map(p => R(p[0], p[1]));
    const cen = [cx, y0 + h / 2, cz];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      if (tw < 1e-4 && td < 1e-4)
        this.face([[B[i][0], y0, B[i][1]], [B[j][0], y0, B[j][1]], [T[0][0], y0 + h, T[0][1]]], col, cen);
      else
        this.face([[B[i][0], y0, B[i][1]], [B[j][0], y0, B[j][1]], [T[j][0], y0 + h, T[j][1]], [T[i][0], y0 + h, T[i][1]]], col, cen);
    }
    if (tw > 1e-4 && td > 1e-4) this.face(T.map(p => [p[0], y0 + h, p[1]]), col, cen);
    if (bottom) this.face(B.map(p => [p[0], y0, p[1]]), col, cen);
  }
  box(cx, y0, cz, w, h, d, col, yaw = 0, bottom = false) { this.frustum(cx, y0, cz, w, d, w, d, h, col, yaw, bottom); }
  // Двускатная крыша / холмик: конёк вдоль локальной оси z.
  gable(cx, y0, cz, w, d, rise, col, yaw = 0) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const R = (x, y, z) => { const q = [cx + x * c + z * s, y0 + y, cz - x * s + z * c]; return q; };
    const cen = [cx, y0 + rise * 0.4, cz];
    const a = R(-w / 2, 0, -d / 2), b = R(w / 2, 0, -d / 2), cc = R(w / 2, 0, d / 2), dd = R(-w / 2, 0, d / 2);
    const r0 = R(0, rise, -d / 2), r1 = R(0, rise, d / 2);
    this.face([a, dd, r1, r0], col, cen);
    this.face([cc, b, r0, r1], col, cen);
    this.face([a, r0, b], col, cen);
    this.face([cc, r1, dd], col, cen);
  }
  cyl(cx, y0, cz, rB, rT, h, seg, col) {
    const cen = [cx, y0 + h / 2, cz];
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      const p0 = [cx + Math.cos(a0) * rB, y0, cz + Math.sin(a0) * rB], p1 = [cx + Math.cos(a1) * rB, y0, cz + Math.sin(a1) * rB];
      const t1 = [cx + Math.cos(a1) * rT, y0 + h, cz + Math.sin(a1) * rT], t0 = [cx + Math.cos(a0) * rT, y0 + h, cz + Math.sin(a0) * rT];
      this.face([p0, p1, t1, t0], col, cen);
      if (rT > 1e-3) this.face([[cx, y0 + h, cz], t0, t1], col, cen);
    }
  }
  // Плоская фигура в плоскости XY (лицом к +z), выдавленная на толщину th.
  // Выпуклая или звёздчатая относительно центра — веер из центра подходит.
  extrudeXY(cx, cy, cz, pts, th, col, yaw = 0) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const R = (x, y, z) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const cen = [cx, cy, cz];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.face([R(0, 0, th / 2), R(pts[i][0], pts[i][1], th / 2), R(pts[j][0], pts[j][1], th / 2)], col, cen);
      this.face([R(0, 0, -th / 2), R(pts[i][0], pts[i][1], -th / 2), R(pts[j][0], pts[j][1], -th / 2)], col, cen);
      this.face([R(pts[i][0], pts[i][1], th / 2), R(pts[j][0], pts[j][1], th / 2),
                 R(pts[j][0], pts[j][1], -th / 2), R(pts[i][0], pts[i][1], -th / 2)], col, cen);
    }
  }
  // Тонкий столбик: четыре боковые грани и крышка не нужна.
  post(cx, y0, cz, w, h, col) {
    const cen = [cx, y0 + h / 2, cz];
    const q = [[-w / 2, -w / 2], [w / 2, -w / 2], [w / 2, w / 2], [-w / 2, w / 2]];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.face([[cx + q[i][0], y0, cz + q[i][1]], [cx + q[j][0], y0, cz + q[j][1]],
                 [cx + q[j][0], y0 + h, cz + q[j][1]], [cx + q[i][0], y0 + h, cz + q[i][1]]], col, cen);
    }
  }
  // Плоская тонкая пластина, видимая с двух сторон (прутья, перекладины).
  plate(cx, y0, cz, w, h, col, yaw = 0) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const R = (x, y) => [cx + x * c, y0 + y, cz - x * s];
    const a = R(-w / 2, 0), b = R(w / 2, 0), t = R(w / 2, h), u = R(-w / 2, h);
    this.face([a, b, t, u], col, [cx + s * 5, y0 + h / 2, cz + c * 5]);
    this.face([a, b, t, u], col, [cx - s * 5, y0 + h / 2, cz - c * 5]);
  }
  // Любая геометрия three (дерево): плоские грани, как есть.
  geo(g, col, dx = 0, dy = 0, dz = 0) {
    const pa = g.attributes.position.array;
    const ix = g.index ? g.index.array : null;
    const n = ix ? ix.length : pa.length / 3;
    for (let i = 0; i < n; i += 3) {
      const ids = ix ? [ix[i], ix[i + 1], ix[i + 2]] : [i, i + 1, i + 2];
      const V = ids.map(k => this._t(pa[k * 3] + dx, pa[k * 3 + 1] + dy, pa[k * 3 + 2] + dz));
      const ux = V[1][0] - V[0][0], uy = V[1][1] - V[0][1], uz = V[1][2] - V[0][2];
      const wx = V[2][0] - V[0][0], wy = V[2][1] - V[0][1], wz = V[2][2] - V[0][2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      const b = this.v;
      for (const q of V) { this.P.push(q[0], q[1], q[2]); this.N.push(nx, ny, nz); this.C.push(col[0], col[1], col[2]); }
      this.I.push(b, b + 1, b + 2);
      this.v += 3;
    }
  }
  tri(a, b, c, col) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const k = this.v;
    const per = Array.isArray(col[0]);
    [a, b, c].forEach((q, i) => {
      const cc = per ? col[i] : col;
      this.P.push(q[0], q[1], q[2]); this.N.push(nx, ny, nz); this.C.push(cc[0], cc[1], cc[2]);
    });
    this.I.push(k, k + 1, k + 2);
    this.v += 3;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setIndex(this.v > 65000 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------------ палитра
// Всё в sRGB, переводится в линейное при записи.
const K = {
  granite:  lin([0.40, 0.40, 0.41]),
  graniteD: lin([0.26, 0.26, 0.28]),
  marble:   lin([0.80, 0.79, 0.75]),
  concrete: lin([0.56, 0.55, 0.52]),
  lime:     lin([0.80, 0.75, 0.64]),     // известняк
  limeD:    lin([0.66, 0.62, 0.53]),
  iron:     lin([0.11, 0.12, 0.11]),
  ironBlue: lin([0.16, 0.26, 0.42]),
  ironWhite:lin([0.82, 0.82, 0.78]),
  rust:     lin([0.30, 0.19, 0.13]),
  earth:    lin([0.35, 0.28, 0.20]),
  moundG:   lin([0.32, 0.34, 0.20]),     // холм, поросший травой
  moundF:   lin([0.46, 0.42, 0.40]),     // холм в цветах
  grass:    lin([0.27, 0.36, 0.18]),
  wood:     lin([0.36, 0.26, 0.17]),
  wall:     lin([0.80, 0.77, 0.70]),
  wallD:    lin([0.62, 0.59, 0.53]),
  roofRed:  lin([0.52, 0.27, 0.20]),
  roofGrey: lin([0.36, 0.37, 0.38]),
  star:     lin([0.70, 0.12, 0.10]),
  flowerR:  lin([0.75, 0.12, 0.14]),
  flowerW:  lin([0.88, 0.88, 0.84]),
  door:     lin([0.12, 0.10, 0.09]),
};

// ------------------------------------------------------------------ могилы
// Местная система: начало — центр участка на земле, +z — от аллеи вглубь ряда,
// −z — к аллее. Памятник стоит у края, обращённого к дорожке (z ≈ −0.9),
// холм — вглубь (z от −0.65 до +1.2). Каждая геометрия уходит под землю на
// 0.4 м: на склоне основание не должно повисать.
function stela(mb, z, w, h, d, col, top = 'flat', cross = null) {
  mb.box(0, -0.4, z, w + 0.14, 0.54, d + 0.12, col);                     // цоколь
  mb.box(0, 0.14, z, w, h, d, col);                                      // плита
  const y = 0.14 + h;
  if (top === 'gable') mb.gable(0, y, z, w, d, 0.09, col);
  else if (top === 'round') mb.frustum(0, y, z, w, d, w * 0.55, d, 0.1, col);
  else if (top === 'point') mb.gable(0, y, z, w, d, 0.2, col);
  if (cross) {                                                           // крест на плите
    mb.box(0, y + 0.05, z, 0.05, 0.38, 0.04, cross);
    mb.box(0, y + 0.22, z, 0.2, 0.05, 0.04, cross);
  }
}
function mound(mb, w, len, z0, rise, col) {
  mb.gable(0, -0.12, z0 + len / 2, w, len, rise + 0.12, col);
}
// Оградка: четыре столбика и по две перекладины с каждой стороны. Столбики —
// без крышек (сверху их не рассмотреть), перекладины — двусторонние пластины.
function fence(mb, w, len, h, col, z0) {
  const zc = z0 + len / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    mb.post(sx * w / 2, -0.4, zc + sz * len / 2, 0.06, h + 0.4, col);
  for (const y of [h * 0.3, h * 0.92]) {
    for (const sz of [-1, 1]) mb.plate(0, y, zc + sz * len / 2, w, 0.05, col);
    for (const sx of [-1, 1]) mb.plate(sx * w / 2, y, zc, len, 0.05, col, Math.PI / 2);
  }
}
function metalCross(mb, z, h, col) {
  mb.box(0, -0.3, z, 0.1, 0.42, 0.1, K.concrete);
  mb.box(0, 0.12, z, 0.045, h, 0.045, col);
  mb.box(0, 0.12 + h * 0.62, z, h * 0.42, 0.045, 0.04, col);
  mb.box(0, 0.12 + h * 0.74, z, h * 0.26, 0.035, 0.04, col);
}

const VARIANTS = {
  // холмик с железным крестом
  o_cross: () => {
    const mb = new MB();
    mound(mb, 0.85, 1.85, -0.6, 0.17, K.moundG);
    mb.box(0, 0.05, 0.1, 0.34, 0.1, 0.5, K.flowerR);
    metalCross(mb, -0.78, 1.5, K.ironBlue);
    return mb.build();
  },
  // плита-покрытие и гранитная стела
  o_slab: () => {
    const mb = new MB();
    mb.box(0, -0.3, 0.2, 0.96, 0.45, 2.0, K.granite);
    stela(mb, -0.86, 0.62, 0.98, 0.1, K.graniteD, 'round');
    return mb.build();
  },
  // оградка, холм и стела
  o_fence: () => {
    const mb = new MB();
    fence(mb, 1.45, 2.5, 0.85, K.iron, -1.05);
    mound(mb, 0.95, 1.7, -0.55, 0.2, K.moundG);
    stela(mb, -0.78, 0.6, 1.05, 0.1, K.marble, 'gable');
    return mb.build();
  },
  // оградка с большим крестом
  o_fcross: () => {
    const mb = new MB();
    fence(mb, 1.45, 2.5, 0.8, K.ironWhite, -1.05);
    mound(mb, 0.95, 1.7, -0.55, 0.2, K.moundF);
    mb.box(0, -0.4, -0.78, 0.4, 0.56, 0.3, K.concrete);
    mb.box(0, 0.16, -0.78, 0.17, 1.55, 0.14, K.limeD);
    mb.box(0, 1.0, -0.78, 0.62, 0.15, 0.14, K.limeD);
    return mb.build();
  },
  // еврейский / караимский камни
  j_flat: () => {                       // прямая стела
    const mb = new MB();
    mb.box(0, -0.4, 0, 0.74, 0.54, 0.22, K.limeD);
    mb.box(0, 0.14, 0, 0.6, 0.95, 0.12, K.lime);
    mb.frustum(0, 1.09, 0, 0.6, 0.12, 0.34, 0.12, 0.12, K.lime);
    mb.box(0, -0.1, 1.0, 0.7, 0.14, 1.5, K.limeD);                       // ложе камня
    return mb.build();
  },
  j_gable: () => {                      // стела с треугольным верхом
    const mb = new MB();
    mb.box(0, -0.4, 0, 0.8, 0.54, 0.26, K.limeD);
    mb.box(0, 0.14, 0, 0.64, 1.05, 0.14, K.lime);
    mb.gable(0, 1.19, 0, 0.64, 0.14, 0.28, K.lime, Math.PI / 2);
    mb.box(0, -0.1, 1.0, 0.72, 0.14, 1.5, K.limeD);
    return mb.build();
  },
  j_sarco: () => {                      // саркофаг
    const mb = new MB();
    mb.box(0, -0.4, 0.2, 0.96, 0.55, 2.05, K.limeD);
    mb.box(0, 0.15, 0.2, 0.84, 0.28, 1.9, K.lime);
    mb.gable(0, 0.43, 0.2, 0.84, 1.9, 0.2, K.lime);
    return mb.build();
  },
};
const ORTHO_KEYS = ['o_cross', 'o_slab', 'o_fence', 'o_fcross'];
const JEW_KEYS = ['j_flat', 'j_gable', 'j_sarco'];

// Редкие памятники в статичную сетку, на месте.
function rareCrypt(mb, x, y, z, yaw) {
  mb.place(x, y, z, yaw);
  mb.box(0, -0.4, 0, 2.7, 0.5, 2.9, K.concrete);
  mb.box(0, 0.1, 0, 2.3, 2.0, 2.5, K.wall);
  mb.gable(0, 2.1, 0, 2.6, 2.8, 0.95, K.roofGrey);
  mb.box(0, 0.1, -1.27, 0.9, 1.65, 0.06, K.door);
  mb.box(0, 1.75, -1.3, 1.1, 0.12, 0.1, K.wallD);
  mb.box(0, 3.05, 0, 0.07, 0.62, 0.07, K.iron);
  mb.box(0, 3.4, 0, 0.32, 0.06, 0.07, K.iron);
  mb.box(0, 0.1, -1.55, 1.5, 0.08, 0.5, K.wallD);                        // ступень
  mb.clear();
}
function rareCross(mb, x, y, z, yaw) {
  mb.place(x, y, z, yaw);
  mb.box(0, -0.4, 0, 1.5, 0.6, 1.5, K.granite);
  mb.box(0, 0.2, 0, 1.1, 0.25, 1.1, K.granite);
  mb.box(0, 0.45, 0, 0.8, 0.25, 0.8, K.concrete);
  mb.box(0, 0.7, 0, 0.3, 2.3, 0.3, K.marble);
  mb.box(0, 2.0, 0, 1.0, 0.28, 0.3, K.marble);
  mb.clear();
}
function rareObelisk(mb, x, y, z, yaw) {
  mb.place(x, y, z, yaw);
  mb.box(0, -0.4, 0, 1.2, 0.7, 1.2, K.concrete);
  mb.box(0, 0.3, 0, 0.9, 0.4, 0.9, K.granite);
  mb.frustum(0, 0.7, 0, 0.62, 0.62, 0.36, 0.36, 1.9, K.graniteD);
  mb.frustum(0, 2.6, 0, 0.36, 0.36, 0, 0, 0.3, K.graniteD);
  const star = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.1 : 0.22;
    star.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  mb.extrudeXY(0, 3.05, 0, star, 0.06, K.star);
  mb.box(0, 2.88, 0, 0.04, 0.2, 0.04, K.iron);
  mb.clear();
}

// ------------------------------------------------------------------ деревья
// Породы, ступени подробности и отрисовка — общие с городом (flora.js):
// кипарисы и сосны кладбища теперь те же, что на бульварах, а дальний план
// кладбищенского леса — импосторы. Здесь только перевод своих записей в
// общую посадку. Широколиственные на старом кладбище — каштан, софора,
// платан вперемешку (по месту).
const BROAD = ['chestnut', 'acacia', 'platan', 'chestnut'];
function plantTrees(grp, inst) {
  const sets = {};
  const put = (k, ...v) => (sets[k] || (sets[k] = [])).push(...v);
  for (const key of ['t_cypress', 't_pine', 't_broad', 't_bush']) {
    const L = inst[key] || [];
    for (let o = 0; o < L.length; o += 12) {
      const x = L[o], z = L[o + 2];
      const k = key === 't_cypress' ? 'cypress' : key === 't_pine' ? 'pine' : key === 't_bush' ? 'shrub'
        : BROAD[Math.floor(hash3(Math.round(x), Math.round(z), 41) * BROAD.length)];
      const tx = L[o + 7], tz = L[o + 8];
      put(k, x, L[o + 1], z, L[o + 4], L[o + 5], L[o + 3], Math.hypot(tx, tz), Math.atan2(tz, tx), 0);
    }
  }
  plantFlora(grp, sets);
}

// Панель ограды: каменный цоколь, кованые прутья, две перекладины. Длина 3 м,
// по x масштабируется под реальный пролёт.
function fencePanelGeo() {
  const mb = new MB();
  const stone = lin([0.70, 0.67, 0.60]);
  mb.box(0, -0.35, 0, 3.0, 0.8, 0.3, stone);
  mb.box(0, 0.45, 0, 3.02, 0.07, 0.34, lin([0.78, 0.75, 0.68]));
  for (const y of [0.7, 1.28]) mb.box(0, y, 0, 3.0, 0.045, 0.045, K.iron);
  for (let i = 0; i < 15; i++) {
    const x = -1.4 + i * 0.2;
    mb.post(x, 0.52, 0, 0.026, 0.86, K.iron);
    mb.frustum(x, 1.38, 0, 0.026, 0.026, 0, 0, 0.09, K.iron);
  }
  return mb.build();
}

// ------------------------------------------------------------------ сборка
// ГЕНЕРАТОР: отдаёт управление менеджеру между этапами, как остальные сборщики.
export function* buildCemeteries(w, terrain, d) {
  const grp = new THREE.Group();
  grp.name = 'кладбища';
  const cx0 = (d.cx ?? 0) * CHUNK, cz0 = (d.cz ?? 0) * CHUNK;
  const jobs = OFF ? [] : collectJobs(w, cx0, cz0);
  if (!jobs.length) return grp;

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true });
  // статичная сетка и подсыпка лежат на земле: тот же сдвиг глубины, что у площадок
  const matStatic = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -3,
  });
  const acc = {
    inst: {},                                   // ключ → массив [x,y,z,yaw,sx,sy,sz,tiltX,tiltZ,r,g,b]
    stat: new MB(),
    count: { могил: 0, деревьев: 0, кустов: 0, панелей: 0, склепов: 0 },
    ms: 0, t: performance.now(),
  };
  const H = (x, z) => terrain.gridHeightAt(x, z);
  const inChunk = (x, z) => x >= cx0 && x < cx0 + CHUNK && z >= cz0 && z < cz0 + CHUNK;

  for (const job of jobs) {
    yield* buildOne(job, w, H, inChunk, acc, jobs);
    yield* pause(acc);
  }

  // ---- превращаем накопленное в сетки
  // Мелочь (надгробия, панели ограды) видна лишь вблизи: за ~400 м от края
  // кладбища они съедают сотни тысяч треугольников ради пары пикселей. Их
  // прячет LOD; деревья, ограждение-сетка и подсыпка остаются всегда.
  const near = new THREE.Group();
  near.name = 'кладбища: вблизи';
  const mk = (key, geoFn, list, cast, parent) => {
    const n = list.length / 12;
    if (!n) return;
    const m = new THREE.InstancedMesh(geoFn(), mat, n);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ');
    const p = new THREE.Vector3(), s = new THREE.Vector3();
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const o = i * 12;
      e.set(list[o + 7], list[o + 3], list[o + 8], 'YXZ');
      q.setFromEuler(e);
      p.set(list[o], list[o + 1], list[o + 2]);
      s.set(list[o + 4], list[o + 5], list[o + 6]);
      m.setMatrixAt(i, M.compose(p, q, s));
      col[i * 3] = list[o + 9]; col[i * 3 + 1] = list[o + 10]; col[i * 3 + 2] = list[o + 11];
    }
    m.instanceColor = new THREE.InstancedBufferAttribute(col, 3);
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    m.castShadow = cast;
    m.name = 'кладбище:' + key;
    parent.add(m);
  };
  // надгробия тени не отбрасывают: десятки тысяч мелких теней дороже, чем видны
  for (const k of [...ORTHO_KEYS, ...JEW_KEYS]) mk(k, VARIANTS[k], acc.inst[k] || [], false, near);
  yield* pause(acc);
  mk('ограда', fencePanelGeo, acc.inst.panel || [], true, near);
  plantTrees(grp, acc.inst);
  if (acc.stat.v) {
    const sm = new THREE.Mesh(acc.stat.build(), matStatic);
    sm.castShadow = true;
    sm.name = 'кладбище:сетка';
    grp.add(sm);
  }
  if (near.children.length) {
    // центр и радиус — по рамке всех кладбищ квартала
    let b0 = [Infinity, Infinity, -Infinity, -Infinity];
    for (const j of jobs) {
      const b = bboxOf(j.poly);
      b0 = [Math.min(b0[0], b[0]), Math.min(b0[1], b[1]), Math.max(b0[2], b[2]), Math.max(b0[3], b[3])];
    }
    const lod = new THREE.LOD();
    lod.name = 'кладбища: LOD';
    lod.position.set((b0[0] + b0[2]) / 2, 0, (b0[1] + b0[3]) / 2);
    near.position.copy(lod.position).negate();
    lod.addLevel(near, 0);
    lod.addLevel(new THREE.Object3D(), Math.hypot(b0[2] - b0[0], b0[3] - b0[1]) / 2 + 400);
    grp.add(lod);
  }
  grp.userData.counts = acc.count;
  acc.ms += performance.now() - acc.t;
  grp.userData.ms = acc.ms;
  if (PROF) console.log('кладбища: чистая работа ' + acc.ms.toFixed(0) + ' мс, ' + JSON.stringify(acc.count));
  return grp;
}

// Какие кладбища касаются этого чанка.
function collectJobs(w, cx0, cz0) {
  const jobs = [];
  const hit = bb => bb[2] >= cx0 - 40 && bb[0] <= cx0 + CHUNK + 40 && bb[3] >= cz0 - 40 && bb[1] <= cz0 + CHUNK + 40;
  if (hit(bboxOf(POZHAROVA.poly))) jobs.push({ ...POZHAROVA, main: true });
  // участки из данных: в OSM каждый нарисован дважды (cm@ и pa@) — берём первый
  const seen = new Set();
  for (const a of w.areas || []) {
    if (a.k !== 'cemetery' || !a.poly || a.poly.length < 6) continue;
    const nb = NEIGHBOURS.find(x => x.re.test(a.n || ''));
    if (!nb || seen.has(nb.id)) continue;
    seen.add(nb.id);
    const bb = bboxOf(a.poly);
    if (!hit(bb)) continue;
    jobs.push({ id: nb.id, style: nb.style, name: a.n, poly: a.poly, fence: false, fillInset: 2.2, alleys: [], noGrave: [], auto: true });
  }
  return jobs;
}

// ------------------------------------------------------------------ одно кладбище
function* buildOne(job, w, H, inChunk, acc, jobs) {
  const style = job.style;
  const poly = job.poly;
  let n0 = poly.length / 2;
  const closed = Math.abs(poly[0] - poly[n0 * 2 - 2]) < 1e-6 && Math.abs(poly[1] - poly[n0 * 2 - 1]) < 1e-6;
  const P = closed ? poly.slice(0, poly.length - 2) : poly.slice();
  const bb = bboxOf(P);
  const fillPoly = insetPoly(P, job.fillInset ?? 3);
  const fencePoly = job.fence ? insetPoly(P, job.fenceInset ?? 3) : null;
  const inFill = (x, z) => x > bb[0] && x < bb[2] && z > bb[1] && z < bb[3] && pointInPoly(x, z, fillPoly);
  const inInner = job.fence ? ((x, z) => pointInPoly(x, z, fencePoly)) : inFill;

  // ---------- дорожки
  const alleys = [];
  for (const r of w.roads || []) {
    if (!r.pts || r.pts.length < 4) continue;
    if (r.c !== 4 || r.br || r.tn) continue;
    // дорожка принадлежит кладбищу, если хоть одна её точка внутри контура или в 3 м от него
    let inside = false;
    for (let i = 0; i < r.pts.length; i += 2)
      if (pointInPoly(r.pts[i], r.pts[i + 1], P) || nearPoly(r.pts[i], r.pts[i + 1], P, 3)) { inside = true; break; }
    if (inside) alleys.push({ id: r.id, pts: r.pts, hw: (r.w || 2.5) / 2, osm: true });
  }
  alleys.sort((a, b) => (a.id < b.id ? -1 : 1));
  if (job.auto) alleys.push(...autoAlleys(P, bb));
  (job.alleys || []).forEach((a, i) => alleys.push({ id: 'syn' + i, pts: a.pts, hw: a.w / 2, paved: true }));

  // препятствия: прочие дороги и здания, постройки рядом с контуром
  const blockSegs = [];
  for (const r of w.roads || []) {
    if (!r.pts || r.c === 4 || r.br || r.tn) continue;
    const hw = (r.w || 6) / 2;
    for (let i = 0; i + 3 < r.pts.length; i += 2)
      blockSegs.push({ ax: r.pts[i], az: r.pts[i + 1], bx: r.pts[i + 2], bz: r.pts[i + 3], hw: hw + 0.6, a: -1 });
  }
  const bldgs = [];
  for (const b of w.buildings || []) {
    if (!b.poly) continue;
    const bq = bboxOf(b.poly);
    if (bq[2] < bb[0] - 6 || bq[0] > bb[2] + 6 || bq[3] < bb[1] - 6 || bq[1] > bb[3] + 6) continue;
    bldgs.push({ poly: b.poly, bb: bq });
  }
  const chapels = [];
  for (const s of (w.places && w.places.structures) || [])
    if (s.k === 'chapel' && s.x !== undefined) chapels.push([s.x, s.z, Math.max(s.w || 6, s.d || 6) * 0.5 + 3]);

  // ---------- индекс отрезков для запросов расстояния
  const CELL = 12;
  const grid = new Map();
  const segs = [];
  const addSeg = sg => {
    const id = segs.length; segs.push(sg);
    const x0 = Math.min(sg.ax, sg.bx) - sg.hw, x1 = Math.max(sg.ax, sg.bx) + sg.hw;
    const z0 = Math.min(sg.az, sg.bz) - sg.hw, z1 = Math.max(sg.az, sg.bz) + sg.hw;
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++)
      for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
        const k = gx * 100003 + gz;
        let a = grid.get(k); if (!a) grid.set(k, a = []);
        a.push(id);
      }
  };
  alleys.forEach((al, ai) => {
    for (let i = 0; i + 3 < al.pts.length; i += 2)
      addSeg({ ax: al.pts[i], az: al.pts[i + 1], bx: al.pts[i + 2], bz: al.pts[i + 3], hw: al.hw, a: ai });
  });
  blockSegs.forEach(addSeg);
  // Расстояние от точки до ближайшей КРОМКИ (расстояние до осевой минус полуширина),
  // с признаком, чья это кромка. Поиск в радиусе lim метров.
  const edgeNear = (x, z, lim) => {
    let best = Infinity, who = -2;
    const gx0 = Math.floor((x - lim - 3) / CELL), gx1 = Math.floor((x + lim + 3) / CELL);
    const gz0 = Math.floor((z - lim - 3) / CELL), gz1 = Math.floor((z + lim + 3) / CELL);
    for (let gx = gx0; gx <= gx1; gx++)
      for (let gz = gz0; gz <= gz1; gz++) {
        const a = grid.get(gx * 100003 + gz);
        if (!a) continue;
        for (const id of a) {
          const sg = segs[id];
          const e = distSeg(x, z, sg.ax, sg.az, sg.bx, sg.bz) - sg.hw;
          if (e < best) { best = e; who = sg.a; }
        }
      }
    return { e: best, a: who };
  };
  const nearPoly2 = (x, z, p, m) => nearPoly(x, z, p, m);
  const blockedStatic = (x, z, m) => {
    for (const b of bldgs) {
      if (x < b.bb[0] - m || x > b.bb[2] + m || z < b.bb[1] - m || z > b.bb[3] + m) continue;
      if (pointInPoly(x, z, b.poly) || nearPoly2(x, z, b.poly, m)) return true;
    }
    for (const c of chapels) if (Math.hypot(x - c[0], z - c[1]) < c[2]) return true;
    for (const r of job.noGrave || [])
      if (x > r.x0 - m + 1 && x < r.x1 + m - 1 && z > r.z0 - m + 1 && z < r.z1 + m - 1) return true;
    return false;
  };
  yield* pause(acc);

  // ---------- занятость: кружки в хеш-сетке
  const occ = new Map();
  const OC = 3;
  const occAt = (x, z, r) => {
    const gx0 = Math.floor((x - r - 2) / OC), gx1 = Math.floor((x + r + 2) / OC);
    const gz0 = Math.floor((z - r - 2) / OC), gz1 = Math.floor((z + r + 2) / OC);
    for (let gx = gx0; gx <= gx1; gx++)
      for (let gz = gz0; gz <= gz1; gz++) {
        const a = occ.get(gx * 100003 + gz);
        if (!a) continue;
        for (let i = 0; i < a.length; i += 3)
          if (Math.hypot(x - a[i], z - a[i + 1]) < r + a[i + 2] - 0.05) return true;
      }
    return false;
  };
  const occAdd = (x, z, r) => {
    const k = Math.floor(x / OC) * 100003 + Math.floor(z / OC);
    let a = occ.get(k); if (!a) occ.set(k, a = []);
    a.push(x, z, r);
  };
  const push = (key, x, y, z, yaw, sx, sy, sz, tx, tz, c) => {
    const l = acc.inst[key] || (acc.inst[key] = []);
    l.push(x, y, z, yaw, sx, sy, sz, tx, tz, c[0], c[1], c[2]);
  };
  const slopeAt = (x, z) => {
    const s = 1.3;
    return Math.max(Math.abs(H(x + s, z) - H(x - s, z)), Math.abs(H(x, z + s) - H(x, z - s))) / (2 * s);
  };

  // ---------- деревья (первыми: могилы потом обходят стволы)
  const treeCells = [];
  if (job.main) {
    const TS = 6.5, BELT = 40;
    const outer = insetPoly(P, -BELT);
    const ob = bboxOf(outer);
    const others = jobs.filter(j => j !== job).map(j => ({ p: j.poly, bb: bboxOf(j.poly) }));
    for (let gx = Math.floor(ob[0] / TS); gx <= Math.floor(ob[2] / TS); gx++)
      for (let gz = Math.floor(ob[1] / TS); gz <= Math.floor(ob[3] / TS); gz++) {
        const x = (gx + 0.5 + (hash3(gx, gz, 11) - 0.5) * 0.85) * TS;
        const z = (gz + 0.5 + (hash3(gx, gz, 12) - 0.5) * 0.85) * TS;
        if (!inChunk(x, z)) continue;
        // плотность: рощи и поляны
        let dens = 0.2 + 0.6 * vnoise(x / 38, z / 38, 5);
        let rim = 1.9;
        if (!inInner(x, z)) {
          // лесной пояс снаружи ограды: реже и тоньше с удалением, чужие участки не трогаем
          if (!pointInPoly(x, z, outer)) continue;
          let dd = Infinity;
          for (let i = 0, j = P.length - 2; i < P.length; j = i, i += 2) dd = Math.min(dd, distSeg(x, z, P[j], P[j + 1], P[i], P[i + 1]));
          if (pointInPoly(x, z, P)) dd = 0;
          dens *= Math.max(0, 1 - dd / BELT) * 0.85;
          if (others.some(o => x > o.bb[0] - 6 && x < o.bb[2] + 6 && z > o.bb[1] - 6 && z < o.bb[3] + 6 &&
                               (pointInPoly(x, z, o.p) || nearPoly(x, z, o.p, 6)))) continue;
          rim = 3.4;
        }
        if (hash3(gx, gz, 13) > dens) continue;
        const ed = edgeNear(x, z, 4);
        if (ed.e < rim) continue;
        if (blockedStatic(x, z, 3.5)) continue;
        treeCells.push([x, z, gx, gz]);
      }
    // кипарисовые аллеи вдоль главной дорожки
    const main = alleys.find(a => a.id === job.mainAlley);
    if (main) {
      for (let i = 0; i + 3 < main.pts.length; i += 2) {
        const ax = main.pts[i], az = main.pts[i + 1], bx = main.pts[i + 2], bz = main.pts[i + 3];
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 1) continue;
        const ux = (bx - ax) / L, uz = (bz - az) / L;
        for (let t = 3; t < L; t += 7.5)
          for (const sd of [-1, 1]) {
            const x = ax + ux * t + uz * sd * 3.1, z = az + uz * t - ux * sd * 3.1;
            if (!inChunk(x, z) || !inInner(x, z) || blockedStatic(x, z, 3)) continue;
            treeCells.push([x, z, 9000 + i, Math.round(t * 3) * sd, 'cypress']);
          }
      }
    }
    for (const [x, z, gx, gz, forced] of treeCells) {
      const y = H(x, z);
      if (y < 1.5) continue;
      const hsp = hash3(gx, gz, 21);
      const mi = vnoise(x / 45, z / 45, 9);
      let sp = forced;
      if (!sp) sp = hsp < 0.30 + 0.25 * mi ? 'cypress' : hsp < 0.52 + 0.1 * mi ? 'pine' : hsp < 0.9 ? 'broad' : 'bush';
      const hs = hash3(gx, gz, 22);
      const sc = sp === 'bush' ? 0.7 + hs * 0.8 : 0.66 + hs * 0.6;
      const sy = sc * (0.85 + hash3(gx, gz, 23) * 0.35);
      const tint = 0.8 + hash3(gx, gz, 24) * 0.4;
      const tcol = [tint * (0.92 + hash3(gx, gz, 25) * 0.16), tint, tint * (0.9 + hash3(gx, gz, 26) * 0.2)];
      push('t_' + sp, x, y - 0.2, z, hash3(gx, gz, 27) * 6.283, sc, sy, sc,
        (hash3(gx, gz, 28) - 0.5) * 0.07, (hash3(gx, gz, 29) - 0.5) * 0.07, tcol);
      occAdd(x, z, sp === 'bush' ? 0.5 : 0.55);
      if (sp === 'bush') acc.count.кустов++; else acc.count.деревьев++;
    }
  }
  yield* pause(acc);

  // ---------- ряды вдоль аллей
  const STEP = 1.75, PITCH = 2.9;
  const pickVariant = (x, z, hv) => {
    // квартал 18 м определяет «эпоху» могил: соседние плиты похожи друг на друга
    const eraN = vnoise(x / 18, z / 18, 31);
    if (style === 'orthodox') {
      // старый квартал — кресты и холмики, новый — плиты и оградки
      const r = hv;
      if (eraN < 0.36) return r < 0.52 ? 'o_cross' : r < 0.72 ? 'o_fcross' : r < 0.9 ? 'o_fence' : 'o_slab';
      if (eraN < 0.68) return r < 0.34 ? 'o_slab' : r < 0.6 ? 'o_fence' : r < 0.78 ? 'o_cross' : 'o_fcross';
      return r < 0.46 ? 'o_fence' : r < 0.74 ? 'o_slab' : r < 0.88 ? 'o_fcross' : 'o_cross';
    }
    if (style === 'jewish') return hv < 0.62 ? 'j_flat' : hv < 0.86 ? 'j_gable' : 'j_sarco';
    return hv < 0.3 ? 'j_flat' : hv < 0.62 ? 'j_gable' : 'j_sarco';              // караимский: больше саркофагов и остроконечных
  };
  const tints = {
    orthodox: [0.82, 0.22], jewish: [0.92, 0.12], karaite: [0.96, 0.1],
  };
  const tcfg = tints[style] || tints.orthodox;
  const placeGrave = (x, z, yaw, hv, ha, rowK, forceOld) => {
    if (!inChunk(x, z) || !inFill(x, z)) return false;
    if (blockedStatic(x, z, 1.2)) return false;
    const sl = slopeAt(x, z);
    if (sl > 0.55) return false;
    const y = H(x, z);
    if (y < 1.2) return false;
    // редкие памятники: в статичную сетку
    if (style === 'orthodox' && ha > 0.992 && !forceOld) {
      if (occAt(x, z, 1.4)) return false;
      const kind = ha < 0.9945 ? 'crypt' : ha < 0.9975 ? 'cross' : 'obelisk';
      if (kind === 'crypt') { rareCrypt(acc.stat, x, y, z, yaw); acc.count.склепов++; }
      else if (kind === 'cross') rareCross(acc.stat, x, y, z, yaw);
      else rareObelisk(acc.stat, x, y, z, yaw);
      occAdd(x, z, 1.5);
      acc.count.могил++;
      return true;
    }
    let key = pickVariant(x, z, hv);
    // крутой склон: оградка и плита повисают — берём лёгкие виды
    if (sl > 0.3 && style === 'orthodox') key = hv < 0.6 ? 'o_cross' : 'o_slab';
    const rad = key === 'o_fence' || key === 'o_fcross' ? 0.95 : style === 'orthodox' ? 0.7 : 0.78;
    if (occAt(x, z, rad)) return false;
    const old = forceOld || (key === 'o_cross' && ha < 0.5);
    const k = tcfg[0] + (hash3(Math.round(x * 3), Math.round(z * 3), 41) - 0.5) * tcfg[1] * 2;
    const hue = (hash3(Math.round(x * 3), Math.round(z * 3), 42) - 0.5) * 0.12;
    const scl = 0.92 + hash3(Math.round(x), Math.round(z), 43) * 0.2;
    push(key, x, y - 0.04, z, yaw, scl, 0.9 + hash3(Math.round(x), Math.round(z), 44) * 0.25, scl,
      old ? (hash3(Math.round(x), Math.round(z), 45) - 0.5) * 0.16 : 0,
      old ? (hash3(Math.round(x), Math.round(z), 46) - 0.5) * 0.14 : 0,
      [k * (1 + hue), k, k * (1 - hue)]);
    occAdd(x, z, rad);
    acc.count.могил++;
    return true;
  };

  let work = 0;
  const maxRows = job.main ? 9 : 12;
  for (let ai = 0; ai < alleys.length; ai++) {
    const al = alleys[ai];
    const pts = al.pts;
    // нарезаем осевую шагом STEP, считаем касательную в каждой точке
    let carry = 0;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const ax = pts[i], az = pts[i + 1], bx = pts[i + 2], bz = pts[i + 3];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.3) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L;
      let t = carry;
      for (; t < L; t += STEP) {
        const px = ax + ux * t, pz = az + uz * t;
        if (px < bb[0] - 30 || px > bb[2] + 30 || pz < bb[1] - 30 || pz > bb[3] + 30) continue;
        if ((++work & 255) === 0) yield* pause(acc);
        for (const sd of [-1, 1]) {
          const nx = uz * sd, nz = -ux * sd;               // от аллеи
          for (let row = 0; row < maxRows; row++) {
            const tk = al.hw + 0.55 + 1.45 + row * PITCH;
            const jx = (hash3(ai * 977 + row, Math.round(t * 4) + 7, sd + 3) - 0.5) * 0.22;
            const jt = (hash3(ai * 977 + row, Math.round(t * 4) + 9, sd + 5) - 0.5) * 0.3;
            const x = px + nx * (tk + jt) + ux * jx, z = pz + nz * (tk + jt) + uz * jx;
            if (!inChunk(x, z) || !inFill(x, z)) continue;
            // дальняя кромка: кладём ряд, только если ближайшая дорожка — эта
            const ed = edgeNear(x, z, tk + 2);
            const eOwn = tk - al.hw;
            if (ed.e < 1.45) continue;
            if (ed.a !== ai && ed.e < eOwn - 0.3) continue;
            // «поляны» и пустые места: участок не сплошь занят
            const dens = 0.62 + 0.38 * vnoise(x / 16, z / 16, 7);
            if (hash3(ai * 31 + row, Math.round(t * 3), sd + 11) > dens) continue;
            const yaw = Math.atan2(nx, nz) + (hash3(ai, Math.round(t * 5) + row, 17) - 0.5) * 0.1;
            placeGrave(x, z, yaw, hash3(ai * 31 + row, Math.round(t * 3) + 100, sd + 13),
              hash3(ai * 31 + row, Math.round(t * 3) + 200, sd + 14), row, false);
          }
        }
      }
      carry = t - L;
    }
  }
  yield* pause(acc);

  // ---------- одиночные старые могилы в глубине леса (куда ряды не дотянулись)
  if (job.main) {
    const WS = 5.2;
    for (let gx = Math.floor(bb[0] / WS); gx <= Math.floor(bb[2] / WS); gx++)
      for (let gz = Math.floor(bb[1] / WS); gz <= Math.floor(bb[3] / WS); gz++) {
        const x = (gx + 0.5 + (hash3(gx, gz, 51) - 0.5) * 0.9) * WS;
        const z = (gz + 0.5 + (hash3(gx, gz, 52) - 0.5) * 0.9) * WS;
        if (!inChunk(x, z) || !inFill(x, z)) continue;
        if (hash3(gx, gz, 53) > 0.2 + 0.2 * vnoise(x / 30, z / 30, 4)) continue;
        const ed = edgeNear(x, z, 4);
        if (ed.e < 1.7) continue;
        if (occAt(x, z, 2.6)) continue;
        placeGrave(x, z, hash3(gx, gz, 54) * Math.PI * 2, hash3(gx, gz, 55), 0.5, 0, true);
      }
  }
  yield* pause(acc);

  // ---------- ограда, ворота
  if (job.fence) buildFence(job, w, fencePoly, alleys, H, inChunk, acc);
  yield* pause(acc);

  // ---------- дорожки, площадка, подсыпка
  buildGround(job, P, alleys, H, inChunk, acc, style);
}

function nearPoly(x, z, p, m) {
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2)
    if (distSeg(x, z, p[j], p[j + 1], p[i], p[i + 1]) < m) return true;
  return false;
}

// Для Караимского и Еврейского участков дорожек в OSM почти нет — разводим
// сетку по главной оси контура: продольная через центр и поперечные через 26 м.
function autoAlleys(P, bb) {
  let cx = 0, cz = 0;
  const n = P.length / 2;
  for (let i = 0; i < n; i++) { cx += P[i * 2]; cz += P[i * 2 + 1]; }
  cx /= n; cz /= n;
  let sxx = 0, sxz = 0, szz = 0;
  for (let i = 0; i < n; i++) {
    const dx = P[i * 2] - cx, dz = P[i * 2 + 1] - cz;
    sxx += dx * dx; sxz += dx * dz; szz += dz * dz;
  }
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  const ux = Math.cos(ang), uz = Math.sin(ang), vx = -uz, vz = ux;
  const R = Math.hypot(bb[2] - bb[0], bb[3] - bb[1]) * 0.6;
  const out = [];
  const clip = (a) => a;
  out.push({ id: 'auto-main', pts: [cx - ux * R, cz - uz * R, cx + ux * R, cz + uz * R], hw: 1.0, paved: false, auto: true });
  for (let k = -4; k <= 4; k++) {
    if (k === 0) continue;
    const ox = cx + ux * k * 26, oz = cz + uz * k * 26;
    out.push({ id: 'auto-x' + k, pts: [ox - vx * R, oz - vz * R, ox + vx * R, oz + vz * R], hw: 0.9, paved: false, auto: true });
  }
  return out.map(clip);
}

// ------------------------------------------------------------------ ограда
// Каменный цоколь, кованые прутья, столбы через каждые ~3 м. Панели — один
// InstancedMesh; столбы, ворота и калитки — в статичной сетке. Там, где
// дорожка пересекает ограду, оставляем проём: широкий с воротами у главной
// аллеи, узкий с калиткой у остальных.
function buildFence(job, w, fp, alleys, H, inChunk, acc) {
  const n = fp.length / 2;
  const openings = [];                    // {e, s, half, main, x, z}
  for (const al of alleys) {
    for (let i = 0; i + 3 < al.pts.length; i += 2) {
      for (let e = 0; e < n; e++) {
        const f = e * 2, g = ((e + 1) % n) * 2;
        const hit = segIntersect(al.pts[i], al.pts[i + 1], al.pts[i + 2], al.pts[i + 3], fp[f], fp[f + 1], fp[g], fp[g + 1]);
        if (!hit) continue;
        const L = Math.hypot(fp[g] - fp[f], fp[g + 1] - fp[f + 1]);
        const main = al.id === job.mainAlley;
        openings.push({ e, s: hit.u * L, half: main ? 2.3 : 1.15, main, x: hit.x, z: hit.z });
      }
    }
  }
  const stone = lin([0.76, 0.73, 0.66]), stoneD = lin([0.62, 0.59, 0.53]);
  const pillar = (x, z, big) => {
    if (!inChunk(x, z)) return;
    const y = H(x, z);
    const s = big ? 0.75 : 0.42, h = big ? 3.2 : 1.7;
    acc.stat.box(x, y - 0.5, z, s, h + 0.5, s, stone);
    acc.stat.frustum(x, y + h, z, s + 0.14, s + 0.14, s * 0.55, s * 0.55, big ? 0.35 : 0.2, stoneD);
    if (big) acc.stat.frustum(x, y + h + 0.35, z, s * 0.55, s * 0.55, 0, 0, 0.5, stoneD);
  };
  const panels = acc.inst.panel || (acc.inst.panel = []);
  for (let e = 0; e < n; e++) {
    const f = e * 2, g = ((e + 1) % n) * 2;
    const ax = fp[f], az = fp[f + 1], bx = fp[g], bz = fp[g + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1.2) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L;
    const ops = openings.filter(o => o.e === e).sort((p, q) => p.s - q.s);
    // интервалы глухой стены между проёмами
    const iv = [];
    let cur = 0;
    for (const o of ops) {
      if (o.s - o.half > cur + 0.5) iv.push([cur, o.s - o.half]);
      cur = Math.max(cur, o.s + o.half);
    }
    if (cur < L - 0.5) iv.push([cur, L]);
    for (const [s0, s1] of iv) {
      const len = s1 - s0;
      const cnt = Math.max(1, Math.round(len / 3));
      const pl = len / cnt;
      for (let k = 0; k <= cnt; k++) {
        // угол контура принадлежит началу следующего ребра — не удваиваем
        if (k === cnt && s1 >= L - 1e-6) continue;
        pillar(ax + ux * (s0 + k * pl), az + uz * (s0 + k * pl), false);
      }
      for (let k = 0; k < cnt; k++) {
        const sm = s0 + (k + 0.5) * pl;
        const x = ax + ux * sm, z = az + uz * sm;
        if (!inChunk(x, z)) continue;
        const ya = H(x - ux * pl / 2, z - uz * pl / 2), yb = H(x + ux * pl / 2, z + uz * pl / 2);
        // x,y,z,yaw,sx,sy,sz,tiltX,tiltZ,r,g,b; уклон панели — наклон вокруг её оси z
        panels.push(x, (ya + yb) / 2, z, Math.atan2(-uz, ux), pl / 3.0, 1, 1, 0, Math.atan2(yb - ya, pl), 1, 1, 1);
        acc.count.панелей++;
      }
    }
    // ворота и калитки
    for (const o of ops) {
      const cx = ax + ux * o.s, cz = az + uz * o.s;
      if (!inChunk(cx, cz)) continue;
      const y = H(cx, cz);
      const yawE = Math.atan2(-uz, ux);
      pillar(cx - ux * (o.half + 0.2), cz - uz * (o.half + 0.2), o.main);
      pillar(cx + ux * (o.half + 0.2), cz + uz * (o.half + 0.2), o.main);
      // внутренняя сторона ограды
      let mx = -uz, mz = ux;
      if (!pointInPoly(cx + mx * 2, cz + mz * 2, fp)) { mx = -mx; mz = -mz; }
      if (o.main) {
        const span = 2 * (o.half + 0.2);
        acc.stat.box(cx, y + 3.2, cz, span + 0.5, 0.55, 0.5, stoneD, yawE);
        acc.stat.gable(cx, y + 3.75, cz, 0.62, span + 0.6, 0.38, stone, yawE);
        acc.stat.box(cx, y + 4.1, cz, 0.14, 0.95, 0.14, K.iron);
        acc.stat.box(cx, y + 4.62, cz, 0.62, 0.12, 0.14, K.iron, yawE);
        // створки распахнуты внутрь
        for (const sd of [-1, 1]) {
          const hx = cx + ux * sd * o.half, hz = cz + uz * sd * o.half;
          const phi = 1.15;                                     // угол раствора
          const dx = -ux * sd * Math.cos(phi) + mx * Math.sin(phi);
          const dz = -uz * sd * Math.cos(phi) + mz * Math.sin(phi);
          const len = o.half;
          acc.stat.box(hx + dx * len / 2, y, hz + dz * len / 2, len, 1.75, 0.05, K.iron, Math.atan2(-dz, dx));
        }
      } else {
        acc.stat.box(cx, y + 1.78, cz, 2 * o.half + 0.5, 0.09, 0.09, K.iron, yawE);
        // калитка прикрыта: одна створка
        const len = o.half * 2 - 0.1;
        acc.stat.box(cx - ux * 0.05, y, cz - uz * 0.05, len, 1.5, 0.04, K.iron, yawE);
      }
    }
  }
}

// ------------------------------------------------------------------ земля
// Подсыпка контура, мощёные дорожки, плитка у церкви. Всё ложится на рельеф
// своими вершинами и чуть приподнято (polygonOffset в материале добавляет запас).
function buildGround(job, P, alleys, H, inChunk, acc, style) {
  const mb = acc.stat;
  const LIFT = 0.06;
  // --- подсыпка контура: сухая трава и подстилка из хвои вместо ровного газона
  const tone = (x, z) => {
    const n = vnoise(x / 9, z / 9, 61) * 0.6 + vnoise(x / 3.2, z / 3.2, 62) * 0.4;
    if (style === 'orthodox') {
      const a = lin([0.37, 0.38, 0.21]), b = lin([0.45, 0.40, 0.24]), c = lin([0.31, 0.35, 0.19]);
      const t = n * 2;
      return t < 1 ? mix3(c, a, t) : mix3(a, b, t - 1);
    }
    const a = lin([0.46, 0.42, 0.28]), b = lin([0.55, 0.49, 0.33]);      // сухая степная трава
    return mix3(a, b, n);
  };
  const pts = [];
  for (let i = 0; i < P.length; i += 2) {
    if (pts.length && Math.abs(pts[pts.length - 1].x - P[i]) < 1e-6 && Math.abs(pts[pts.length - 1].y - P[i + 1]) < 1e-6) continue;
    pts.push(new THREE.Vector2(P[i], P[i + 1]));
  }
  let tri = [];
  try { tri = THREE.ShapeUtils.triangulateShape(pts, []); } catch { tri = []; }
  const vtx = (x, z, lift) => [x, H(x, z) + lift, z];
  const emit = (a, b, c) => {
    // треугольник принадлежит чанку по центру тяжести
    const mx = (a[0] + b[0] + c[0]) / 3, mz = (a[1] + b[1] + c[1]) / 3;
    if (!inChunk(mx, mz)) return;
    const va = vtx(a[0], a[1], LIFT), vb = vtx(b[0], b[1], LIFT), vc = vtx(c[0], c[1], LIFT);
    triUp(mb, va, vb, vc, [tone(a[0], a[1]), tone(b[0], b[1]), tone(c[0], c[1])]);
  };
  const sub = (a, b, c, depth) => {
    const lab = Math.hypot(b[0] - a[0], b[1] - a[1]), lbc = Math.hypot(c[0] - b[0], c[1] - b[1]), lca = Math.hypot(a[0] - c[0], a[1] - c[1]);
    const m = Math.max(lab, lbc, lca);
    if (m < 3.6 || depth > 9) { emit(a, b, c); return; }
    if (m === lab) { const mm = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; sub(a, mm, c, depth + 1); sub(mm, b, c, depth + 1); }
    else if (m === lbc) { const mm = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2]; sub(a, b, mm, depth + 1); sub(a, mm, c, depth + 1); }
    else { const mm = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2]; sub(a, b, mm, depth + 1); sub(mm, b, c, depth + 1); }
  };
  if (job.main) {                        // у соседей земля своя — не перекрашиваем
    for (const t of tri) {
      const a = pts[t[0]], b = pts[t[1]], c = pts[t[2]];
      sub([a.x, a.y], [b.x, b.y], [c.x, c.y], 0);
    }
  }

  // --- мощёные дорожки
  const tile = [lin([0.66, 0.64, 0.60]), lin([0.60, 0.58, 0.54])];
  const curb = lin([0.45, 0.44, 0.41]);
  for (const al of alleys) {
    if (!al.paved) continue;
    const pp = al.pts;
    const hw = al.hw;
    let prev = null, run = 0;
    const STEPR = 1.2;
    let dist = 0, idx = 0;
    // точки по длине
    const line = [];
    for (let i = 0; i + 3 < pp.length; i += 2) {
      const ax = pp[i], az = pp[i + 1], bx = pp[i + 2], bz = pp[i + 3];
      const L = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / L, uz = (bz - az) / L;
      for (let t = (i === 0 ? 0 : STEPR - (dist % STEPR)); t < L + 1e-6; t += STEPR) {
        line.push([ax + ux * t, az + uz * t, ux, uz]);
        if (i === 0 && t === 0) { /* первая */ }
      }
      dist += L;
    }
    // сглаженная касательная: средняя по соседям
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1];
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      if (!inChunk(mx, mz)) continue;
      const make = (p) => {
        const nx = -p[3], nz = p[2];
        return [
          [p[0] - nx * hw, p[1] - nz * hw], [p[0] - nx * (hw - 0.14), p[1] - nz * (hw - 0.14)],
          [p[0] + nx * (hw - 0.14), p[1] + nz * (hw - 0.14)], [p[0] + nx * hw, p[1] + nz * hw],
        ];
      };
      const A = make(a), B = make(b);
      const col = [curb, tile[i & 1], curb];
      for (let k = 0; k < 3; k++) {
        const p0 = vtx(A[k][0], A[k][1], LIFT + 0.1), p1 = vtx(A[k + 1][0], A[k + 1][1], LIFT + 0.1);
        const p2 = vtx(B[k + 1][0], B[k + 1][1], LIFT + 0.1), p3 = vtx(B[k][0], B[k][1], LIFT + 0.1);
        quadUp(mb, p0, p1, p2, p3, col[k]);
      }
    }
  }

  // --- площадка у церкви: светлая плитка 2 × 2 м в шахматку
  if (job.plazaRect) {
    const [x0, z0, x1, z1] = job.plazaRect;
    const pl = [lin([0.64, 0.58, 0.47]), lin([0.60, 0.55, 0.45]), lin([0.62, 0.56, 0.46])];
    const C = 2.0;
    for (let x = x0; x < x1 - 0.01; x += C)
      for (let z = z0; z < z1 - 0.01; z += C) {
        const xe = Math.min(x + C, x1), ze = Math.min(z + C, z1);
        if (!inChunk((x + xe) / 2, (z + ze) / 2)) continue;
        const col = pl[Math.floor(hash3(Math.floor(x), Math.floor(z), 71) * 3) % 3];
        const L2 = LIFT + 0.11;
        quadUp(mb, vtx(x, z, L2), vtx(xe, z, L2), vtx(xe, ze, L2), vtx(x, ze, L2), col);
      }
  }
}
function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function triUp(mb, a, b, c, col) {
  const up = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
  if (up >= 0) mb.tri(a, b, c, col); else mb.tri(a, c, b, Array.isArray(col[0]) ? [col[0], col[2], col[1]] : col);
}
// Четырёхугольник лицом вверх, независимо от порядка обхода.
function quadUp(mb, a, b, c, d, col) {
  const ux = b[0] - a[0], uz = b[2] - a[2], wx = c[0] - a[0], wz = c[2] - a[2];
  const up = uz * wx - ux * wz;           // знак y-компоненты (u × w)
  if (up >= 0) { mb.tri(a, b, c, col); mb.tri(a, c, d, col); }
  else { mb.tri(a, c, b, col); mb.tri(a, d, c, col); }
}
