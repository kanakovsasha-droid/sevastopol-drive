import * as THREE from 'three';
import { ENV } from './env.js?v=06f34811';

// Деревья, кусты и живые изгороди: заготовки пород, три ступени подробности
// и общий для всех кварталов учёт того, что рисовать вблизи.
//
// Жалоба на прежние деревья — «выглядят плохо, игрово». Крона была одним-тремя
// икосаэдрами с плоскими гранями одного тёмно-зелёного тона: глаз видел
// огранённый камень на палке. Что изменилось:
//  • крона — кластер из пяти-восьми сглаженных комов с шумом в вершинах,
//    нормали подогнуты к центру кроны: свет ложится на крону как на один
//    рыхлый объём, а не на набор кристаллов;
//  • цвет вершин: верх светлее и желтее, низ и глубина кроны темнее и
//    синее — это и есть «объём» без единой текстуры; плюс разброс тона по
//    деревьям;
//  • ствол ветвится у кроны, у уличных деревьев побелен снизу — так в
//    Севастополе стоит почти каждое дерево вдоль тротуара;
//  • лёгкое покачивание ветром в вершинном шейдере (два синуса на вершину).
//
// Подробность ступенями, и решает её РАССТОЯНИЕ ДО КАЖДОГО ДЕРЕВА, а не до
// квартала:
//  • ближе NEAR — полная модель, отбрасывает тень;
//  • до MID — упрощённая: три-четыре кома без шума, ствол без ветвей;
//  • дальше — импостор: квадрат к камере, в фрагментном шейдере рисуется
//    круглая неровная крона с ложной сферической нормалью. Два треугольника
//    на дерево — именно там, где деревьев десятки тысяч.
// Ближние и средние наборы общие на весь город (по паре InstancedMesh на
// породу) и пересобираются, когда камера сдвинулась на шаг; дальние лежат в
// квартале одной сеткой на все породы и прячут в шейдере то, что уже
// нарисовано подробнее. Отсюда и выигрыш по вызовам отрисовки: было по сетке
// на породу в каждом квадрате 400–800 м, стало ~25 общих плюс одна на квартал.

const s2l = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const lin = c => [s2l(c[0]), s2l(c[1]), s2l(c[2])];
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// Хеш и шум. Заготовки строятся один раз, поэтому здесь важна не скорость,
// а повторяемость: одна и та же порода у всех игроков одинакова.
function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  let r = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
    r += hash3(xi + dx, yi + dy, zi + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  }
  return r * 2 - 1;
}
const fbm = (x, y, z) => vnoise(x, y, z) * 0.65 + vnoise(x * 2.03 + 17, y * 2.03, z * 2.03) * 0.35;
// Хеш по мировым координатам — для разброса тона. Порода и тон обязаны быть
// функцией места, а не порядка обхода.
export function hash2(x, z) {
  let h = Math.imul((x * 16) | 0, 374761393) ^ Math.imul((z * 16) | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------ сборщик сетки
// Позиции, нормали, цвет (линейный) и aLeaf: 1 — листва, 0 — кора. По aLeaf
// шейдер решает, что качать ветром и что белить.
class GB {
  constructor() { this.P = []; this.N = []; this.C = []; this.L = []; this.I = []; }
  get n() { return this.P.length / 3; }
  v(x, y, z, nx, ny, nz, c, leaf) {
    this.P.push(x, y, z); this.N.push(nx, ny, nz); this.C.push(c[0], c[1], c[2]); this.L.push(leaf);
    return this.n - 1;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(this.L, 1));
    g.setIndex(this.n > 65000 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// Икосфера с общими вершинами: шум по вершинам должен быть непрерывным, иначе
// ком рвётся по рёбрам на отдельные треугольники.
const SPHERES = [];
function icosphere(detail) {
  if (SPHERES[detail]) return SPHERES[detail];
  const t = (1 + Math.sqrt(5)) / 2;
  let V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
           [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(p => { const l = Math.hypot(...p); return p.map(c => c / l); });
  let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
           [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let d = 0; d < detail; d++) {
    const cache = new Map(), NF = [];
    const mid = (a, b) => {
      const k = a < b ? a * 65536 + b : b * 65536 + a;
      let i = cache.get(k);
      if (i === undefined) {
        const p = [V[a][0] + V[b][0], V[a][1] + V[b][1], V[a][2] + V[b][2]];
        const l = Math.hypot(...p);
        i = V.length; V.push(p.map(c => c / l)); cache.set(k, i);
      }
      return i;
    };
    for (const [a, b, c] of F) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      NF.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    F = NF;
  }
  // обход граней — наружу (проверяем, а не верим таблице)
  F = F.map(([a, b, c]) => {
    const A = V[a], B = V[b], C = V[c];
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
    const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    return nx * (A[0] + B[0] + C[0]) + ny * (A[1] + B[1] + C[1]) + nz * (A[2] + B[2] + C[2]) < 0 ? [a, c, b] : [a, b, c];
  });
  return (SPHERES[detail] = { V, F });
}

// Нормали по граням в пределах куска сетки [v0, v1).
function faceNormals(gb, v0, i0) {
  const P = gb.P, N = gb.N, I = gb.I;
  for (let i = v0 * 3; i < P.length; i++) N[i] = 0;
  for (let i = i0; i < I.length; i += 3) {
    const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { N[k] += nx; N[k + 1] += ny; N[k + 2] += nz; }
  }
  for (let i = v0 * 3; i < P.length; i += 3) {
    const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1;
    N[i] /= l; N[i + 1] /= l; N[i + 2] /= l;
  }
}

// ------------------------------------------------------------ крона
// Ком: x, y, z — центр; r — радиус; s — сплющивание [sx, sy, sz]; det —
// подробность икосферы; amp — сила шума (рыхлость края).
// Крона целиком: все комы, потом общий проход по нормалям и цвету. Нормаль
// каждой вершины подгибаем к лучу из центра кроны — без этого стыки комов
// читаются тёмными швами, и крона снова распадается на шары.
function addCrown(gb, clumps, pal, o = {}) {
  const v0 = gb.n, i0 = gb.I.length;
  const amp0 = o.amp ?? 0.22, freq = o.freq ?? 2.1, seed = o.seed ?? 1;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  const tone = [];
  clumps.forEach((c, ci) => {
    const S = icosphere(c.det ?? o.det ?? 1);
    const base = gb.n;
    for (let k = 0; k < S.V.length; k++) tone.push(c.tone || 0);
    const rot = (c.rot ?? ci * 2.39) + seed;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const [sx, sy, sz] = c.s || [1, 0.8, 1];
    const amp = c.amp ?? amp0;
    for (const u of S.V) {
      const n = fbm(u[0] * freq + ci * 7.1 + seed, u[1] * freq + ci * 3.3, u[2] * freq - ci * 5.7);
      const k = 1 + amp * n;
      let lx = u[0] * k, ly = u[1] * k, lz = u[2] * k;
      // низ кома плоский: у кроны снизу «потолок», а не шар
      if (ly < -0.25) ly = -0.25 + (ly + 0.25) * (o.flat ?? 0.55);
      lx *= c.r * sx; ly *= c.r * sy; lz *= c.r * sz;
      const px = c.x + lx * cs - lz * sn, pz = c.z + lx * sn + lz * cs, py = c.y + ly;
      gb.v(px, py, pz, 0, 1, 0, [0, 0, 0], 1);
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      z0 = Math.min(z0, pz); z1 = Math.max(z1, pz);
    }
    for (const f of S.F) gb.I.push(base + f[0], base + f[1], base + f[2]);
  });
  faceNormals(gb, v0, i0);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  const rx = Math.max(x1 - x0, z1 - z0) / 2, ry = (y1 - y0) / 2;
  const bend = o.bend ?? 0.6;
  const dark = lin(pal.dark), light = lin(pal.light);
  const P = gb.P, N = gb.N, C = gb.C;
  for (let v = v0; v < gb.n; v++) {
    const i = v * 3;
    let dx = (P[i] - cx) / rx, dy = (P[i + 1] - cy) / ry, dz = (P[i + 2] - cz) / rx;
    const rad = Math.hypot(dx, dy, dz) || 1;
    // подгибаем нормаль к центру кроны
    let nx = mix(N[i], dx / rad, bend), ny = mix(N[i + 1], dy / rad, bend), nz = mix(N[i + 2], dz / rad, bend);
    const l = Math.hypot(nx, ny, nz) || 1;
    N[i] = nx / l; N[i + 1] = ny / l; N[i + 2] = nz / l;
    // Свет и тень, вписанные в цвет: верх светлее (молодой лист на солнце),
    // низ и глубина кроны темнее. Разброс по вершине — пятнистость листвы.
    const hgt = clamp01((P[i + 1] - y0) / (y1 - y0 || 1));
    const j = hash3(P[i] * 37, P[i + 1] * 41, P[i + 2] * 43) - 0.5;
    const outer = smooth(0.45, 1.0, rad);
    const t = clamp01(hgt * 0.7 + outer * 0.3 + j * 0.35 + (tone[v - v0] || 0));
    const ao = (o.ao0 ?? 0.66) + 0.2 * hgt + 0.16 * outer;
    let r = mix(dark[0], light[0], t) * ao, g = mix(dark[1], light[1], t) * ao, b = mix(dark[2], light[2], t) * ao;
    // цветы (олеандр) — пятна на верхней половине
    if (pal.bloom && hgt > 0.25) gb.L[v] = 2;
    C[i] = r; C[i + 1] = g; C[i + 2] = b;
  }
  return { cx, cy, cz, rx, ry, y0, y1 };
}

// ------------------------------------------------------------ ствол и ветви
// Труба по ломаной [x, y, z, r]. Крышек нет: низ в земле, верх в кроне.
function addTube(gb, pts, seg, colAt) {
  const base = gb.n;
  const rings = pts.length;
  for (let k = 0; k < rings; k++) {
    const p = pts[k], a = pts[Math.max(0, k - 1)], b = pts[Math.min(rings - 1, k + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    // опорный вектор, не параллельный оси
    let rx = 0, ry = 0, rz = 1;
    if (Math.abs(tz) > 0.9) { rx = 1; rz = 0; }
    let ux = ty * rz - tz * ry, uy = tz * rx - tx * rz, uz = tx * ry - ty * rx;
    const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    const wx = ty * uz - tz * uy, wy = tz * ux - tx * uz, wz = tx * uy - ty * ux;
    for (let s = 0; s <= seg; s++) {
      const an = s / seg * Math.PI * 2;
      const c = Math.cos(an), sn = Math.sin(an);
      const nx = ux * c + wx * sn, ny = uy * c + wy * sn, nz = uz * c + wz * sn;
      gb.v(p[0] + nx * p[3], p[1] + ny * p[3], p[2] + nz * p[3], nx, ny, nz, colAt(p[1], s, k), 0);
    }
  }
  for (let k = 0; k < rings - 1; k++)
    for (let s = 0; s < seg; s++) {
      const a = base + k * (seg + 1) + s, b = a + 1, c = a + seg + 1, d = c + 1;
      gb.I.push(a, b, c, b, d, c);
    }
}

// Кора: основной тон, пятна (у платана — светлые заплаты сброшенной коры)
// и потемнение к земле.
function barkFn(pal) {
  const base = lin(pal.bark), hi = lin(pal.barkHi || pal.bark), lo = lin(pal.barkLo || pal.bark);
  return (y, s, k) => {
    const h = hash3(s * 7 + 3, Math.round(y * 3) * 11, k * 5);
    const c = h < (pal.patch ?? 0.25) ? hi : h > 0.85 ? lo : base;
    const top = pal.barkTop ? clamp01((y - pal.barkTop[0]) / pal.barkTop[1]) : 0;
    const tc = pal.barkTop ? lin(pal.barkTop[2]) : c;
    const g = 0.82 + 0.18 * clamp01(y / 2);
    return [mix(c[0], tc[0], top) * g, mix(c[1], tc[1], top) * g, mix(c[2], tc[2], top) * g];
  };
}

// Ствол: от земли до развилки, с кольцами на 1.0 и 1.12 м — по ним шейдер
// проводит ровную границу побелки.
function trunkPts(top, r0, r1, bend = [0, 0]) {
  const out = [];
  const ys = [0, 1.0, 1.12];
  for (let y = 2; y < top[1] - 0.3; y += 1.6) ys.push(y);
  ys.push(top[1]);
  for (const y of ys) {
    const t = y / top[1];
    const b = Math.sin(t * Math.PI) * 0.5;
    out.push([top[0] * t + bend[0] * b, y, top[2] * t + bend[1] * b, mix(r0, r1, t)]);
  }
  return out;
}

// Ветвь от развилки к кому: до двух третей пути, чтобы конец спрятался в листве.
function limb(from, to, r0, r1, lift = 0.4) {
  const ex = from[0] + (to[0] - from[0]) * 0.75, ey = from[1] + (to[1] - from[1]) * 0.75, ez = from[2] + (to[2] - from[2]) * 0.75;
  // сначала круче вверх, потом наружу: ветвь растёт из ствола, а не торчит спицей
  const m1 = [from[0] + (ex - from[0]) * 0.3, from[1] + (ey - from[1]) * 0.45 + lift, from[2] + (ez - from[2]) * 0.3];
  return [[from[0] * 0.6, from[1] - 0.35, from[2] * 0.6, r0], [m1[0], m1[1], m1[2], r0 * 0.7 + r1 * 0.3], [ex, ey, ez, r1]];
}

// ------------------------------------------------------------ веретено
// Кипарис, туя: тело вращения с шумом. Шум по углу чаще, чем по высоте, —
// вертикальные «языки пламени», как у живого кипариса.
function addSpindle(gb, o) {
  const { y0, y1, R, rings, seg, prof, pal } = o;
  const base = gb.n, i0 = gb.I.length;
  const dark = lin(pal.dark), light = lin(pal.light);
  const groove = [-0.5];
  gb.v(0, y0, 0, 0, -1, 0, dark, 1);                 // низ
  for (let k = 1; k <= rings; k++) {
    const t = k / (rings + 1);
    const y = mix(y0, y1, t);
    for (let s = 0; s < seg; s++) {
      const an = (s + (k & 1) * 0.5) / seg * Math.PI * 2;
      const n = fbm(Math.cos(an) * 1.6 + 5, y * (o.vfreq ?? 0.55), Math.sin(an) * 1.6 - 3);
      const r = R * prof(t) * (1 + (o.amp ?? 0.2) * n);
      gb.v(Math.cos(an) * r, y, Math.sin(an) * r, 0, 1, 0, [0, 0, 0], 1);
      groove.push(n);
    }
  }
  gb.v(0, y1, 0, 0, 1, 0, light, 1);                 // макушка
  groove.push(0.3);
  const top = gb.n - 1;
  for (let s = 0; s < seg; s++) gb.I.push(base, base + 1 + s, base + 1 + (s + 1) % seg);
  for (let k = 0; k < rings - 1; k++)
    for (let s = 0; s < seg; s++) {
      const a = base + 1 + k * seg + s, b = base + 1 + k * seg + (s + 1) % seg;
      const c = a + seg, d = b + seg;
      gb.I.push(a, c, b, b, c, d);
    }
  const last = base + 1 + (rings - 1) * seg;
  for (let s = 0; s < seg; s++) gb.I.push(last + s, top, last + (s + 1) % seg);
  // обход граней: проверяем по первой грани
  {
    const I = gb.I, P = gb.P;
    const a = I[i0] * 3, b = I[i0 + 1] * 3, c = I[i0 + 2] * 3;
    const ny = (P[b + 2] - P[a + 2]) * (P[c] - P[a]) - (P[b] - P[a]) * (P[c + 2] - P[a + 2]);
    if (ny > 0) for (let i = i0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; }
  }
  faceNormals(gb, base, i0);
  const P = gb.P, N = gb.N, C = gb.C;
  for (let v = base; v < gb.n; v++) {
    const i = v * 3;
    const hgt = clamp01((P[i + 1] - y0) / (y1 - y0));
    const rr = Math.hypot(P[i], P[i + 2]) || 1;
    const nx = mix(N[i], P[i] / rr, 0.45), ny = N[i + 1] * 0.7, nz = mix(N[i + 2], P[i + 2] / rr, 0.45);
    const l = Math.hypot(nx, ny, nz) || 1;
    N[i] = nx / l; N[i + 1] = ny / l; N[i + 2] = nz / l;
    const j = hash3(P[i] * 31, P[i + 1] * 29, P[i + 2] * 23) - 0.5;
    // впадины между «языками» темнее, гребни светлее — так колонна читается
    // пучками хвои, а не гладкой мармеладкой
    const gr = groove[v - base] ?? 0;
    const t = clamp01(hgt * 0.6 + 0.15 + j * 0.4 + gr * 0.35);
    const ao = (0.6 + 0.28 * hgt + j * 0.08) * (0.8 + 0.25 * gr);
    C[i] = mix(dark[0], light[0], t) * ao; C[i + 1] = mix(dark[1], light[1], t) * ao; C[i + 2] = mix(dark[2], light[2], t) * ao;
  }
  return { cx: 0, cy: (y0 + y1) / 2, cz: 0, rx: R * 1.05, ry: (y1 - y0) / 2, y0, y1 };
}

// Ель: ярусы-конусы с провисшей юбкой.
function addSpruce(gb, o) {
  const { tiers, seg, pal, H, R } = o;
  const base = gb.n, i0 = gb.I.length;
  const dark = lin(pal.dark), light = lin(pal.light);
  for (let k = 0; k < tiers; k++) {
    const t = k / tiers;
    const yb = mix(1.0, H * 0.82, t), h = mix(3.2, 1.6, t) * H / 10;
    const r = R * (1 - t * 0.85);
    const apex = gb.v(0, yb + h, 0, 0, 1, 0, light, 1);
    const ring = gb.n;
    for (let s = 0; s < seg; s++) {
      const an = (s + k * 0.37) / seg * Math.PI * 2;
      const rr = r * (1 + 0.16 * (hash3(k, s, 7) - 0.5) * 2);
      const droop = 0.25 * (hash3(s, k, 9));
      gb.v(Math.cos(an) * rr, yb - droop, Math.sin(an) * rr, Math.cos(an), 0.5, Math.sin(an), dark, 1);
    }
    const under = gb.v(0, yb + h * 0.28, 0, 0, -1, 0, dark, 1);
    for (let s = 0; s < seg; s++) {
      const a = ring + s, b = ring + (s + 1) % seg;
      gb.I.push(apex, b, a);       // конус
      gb.I.push(under, a, b);      // испод юбки
    }
  }
  faceNormals(gb, base, i0);
  const P = gb.P, N = gb.N, C = gb.C;
  for (let v = base; v < gb.n; v++) {
    const i = v * 3;
    const hgt = clamp01(P[i + 1] / H);
    const rr = Math.hypot(P[i], P[i + 2]);
    const outer = clamp01(rr / R * 1.6);
    const j = hash3(P[i] * 31, P[i + 1] * 29, P[i + 2] * 23) - 0.5;
    const t = clamp01(0.25 + outer * 0.55 + j * 0.3);
    const ao = 0.6 + 0.25 * hgt + 0.2 * outer;
    // нормаль — наполовину от оси: ярусы светятся мягко, без граней
    if (rr > 0.01) {
      const nx = mix(N[i], P[i] / rr, 0.5), ny = N[i + 1] * 0.8 + 0.1, nz = mix(N[i + 2], P[i + 2] / rr, 0.5);
      const l = Math.hypot(nx, ny, nz) || 1;
      N[i] = nx / l; N[i + 1] = ny / l; N[i + 2] = nz / l;
    }
    C[i] = mix(dark[0], light[0], t) * ao; C[i + 1] = mix(dark[1], light[1], t) * ao; C[i + 2] = mix(dark[2], light[2], t) * ao;
  }
  return { cx: 0, cy: H * 0.5, cz: 0, rx: R, ry: H * 0.5, y0: 0.8, y1: H };
}

// ------------------------------------------------------------ породы
// Палитры в sRGB. Подобраны по фото Приморского бульвара и проспекта
// Нахимова: платан и софора — светлая сочная зелень, каштан темнее, хвоя
// почти чёрная с синевой, у крымской сосны рыжая верхушка ствола.
const PAL = {
  platan:   { dark: [0.24, 0.33, 0.14], light: [0.53, 0.63, 0.30], bark: [0.58, 0.56, 0.46], barkHi: [0.74, 0.72, 0.60], barkLo: [0.43, 0.41, 0.33], patch: 0.35 },
  chestnut: { dark: [0.15, 0.24, 0.10], light: [0.37, 0.51, 0.22], bark: [0.36, 0.32, 0.27], barkLo: [0.27, 0.24, 0.20] },
  acacia:   { dark: [0.27, 0.37, 0.15], light: [0.56, 0.66, 0.32], bark: [0.44, 0.40, 0.33], barkLo: [0.33, 0.30, 0.25] },
  poplar:   { dark: [0.19, 0.29, 0.12], light: [0.43, 0.56, 0.25], bark: [0.50, 0.49, 0.43], barkHi: [0.60, 0.59, 0.52] },
  cypress:  { dark: [0.10, 0.18, 0.10], light: [0.27, 0.39, 0.22], bark: [0.38, 0.30, 0.23] },
  thuja:    { dark: [0.16, 0.26, 0.10], light: [0.46, 0.57, 0.25], bark: [0.38, 0.30, 0.23] },
  spruce:   { dark: [0.19, 0.28, 0.27], light: [0.50, 0.61, 0.60], bark: [0.35, 0.29, 0.24] },
  pine:     { dark: [0.11, 0.20, 0.12], light: [0.32, 0.43, 0.27], bark: [0.40, 0.34, 0.28], barkTop: [4.5, 2.5, [0.68, 0.44, 0.29]] },
  olive:    { dark: [0.28, 0.34, 0.22], light: [0.60, 0.67, 0.48], bark: [0.48, 0.46, 0.40], barkLo: [0.38, 0.36, 0.31] },
  shrub:    { dark: [0.16, 0.26, 0.10], light: [0.41, 0.53, 0.23] },
  oleander: { dark: [0.15, 0.25, 0.11], light: [0.37, 0.49, 0.24], bloom: true },
  box:      { dark: [0.11, 0.21, 0.08], light: [0.30, 0.44, 0.17] },
  hedge:    { dark: [0.12, 0.21, 0.08], light: [0.34, 0.48, 0.19] },
};

// Комы по оболочке кроны. Крона — эллипсоид (cy — высота центра, rx, ry —
// полуоси); комы раскладываются по его поверхности спиралью Фибоначчи от
// макушки вниз до доли cover нижней полусферы, с разбросом по месту и
// размеру, и один-два кома заполняют середину. Много мелких бугров по
// краю — это и есть «листва»; три больших шара — это «игра».
function shell(d, seed) {
  const out = [];
  const [cy, rx, ry] = d.env;
  const rnd = (i, k) => hash3(i * 13 + seed * 7, k * 31, seed * 3 + 11);
  for (let i = 0; i < d.n; i++) {
    const yN = 1 - (i + 0.5) / d.n * (1 + (d.cover ?? 0.35));
    const rr = Math.sqrt(Math.max(0, 1 - yN * yN));
    const an = i * 2.39996 + seed;
    const j = d.jit ?? 0.18;
    const k = (d.inset ?? 0.78);
    out.push({
      x: Math.cos(an) * rr * rx * k + (rnd(i, 1) - 0.5) * j * rx,
      y: cy + yN * ry * k + (rnd(i, 2) - 0.5) * j * ry,
      z: Math.sin(an) * rr * rx * k + (rnd(i, 3) - 0.5) * j * rx,
      r: d.cr * (0.8 + 0.4 * rnd(i, 4)),
      s: d.cs || [1, 0.82, 1],
      tone: (rnd(i, 5) - 0.5) * 0.12,
    });
  }
  for (const f of d.fill || []) out.push({ x: 0, y: cy + f[0] * ry, z: 0, r: f[1] * Math.min(rx, ry * 1.4), s: [1, 0.8, 1], det: 0, tone: -0.08 });
  return out;
}

// Широколиственная порода. lod 0 — комы по оболочке с шумом, ствол с
// побелочным кольцом и ветви к нижним комам; lod 1 — оболочка одним
// шумным эллипсоидом (на 150 м силуэт решает всё) и ствол без ветвей.
function broadleaf(gb, lod, d) {
  const pal = PAL[d.pal];
  const [cy, rx, ry] = d.env;
  let crown;
  if (lod === 0) {
    const cl = shell(d, d.seed);
    crown = addCrown(gb, cl, pal, { det: 1, amp: d.amp ?? 0.12, freq: d.freq ?? 2.0, seed: d.seed, flat: d.flat ?? 0.7, bend: d.bend ?? 0.62 });
    const bark = barkFn(pal);
    addTube(gb, trunkPts(d.fork, d.r0, d.r1, d.bend2 || [0, 0]), d.seg ?? 7, bark);
    // Ветви: три-четыре скелетные, отходят от ствола ступенями, а не веником
    // из одной точки, — к нижнему поясу комов (их и видно снизу), разнесённые
    // по сторонам света.
    const nl = d.limbs ?? 4;
    if (nl) {
      const low = cl.slice(0, d.n).filter(c => c.y < cy + ry * 0.35);
      const used = new Set();
      for (let i = 0; i < nl; i++) {
        const want = i * 2.39996 + d.seed;
        let best = null, bd = Infinity;
        for (const c of low) {
          if (used.has(c)) continue;
          const da = Math.abs(Math.atan2(Math.sin(Math.atan2(c.z, c.x) - want), Math.cos(Math.atan2(c.z, c.x) - want)));
          if (da < bd) { bd = da; best = c; }
        }
        if (!best) break;
        used.add(best);
        const fy = d.fork[1] * (0.72 + 0.28 * i / Math.max(1, nl - 1));
        const ft = fy / d.fork[1];
        const from = [d.fork[0] * ft, fy, d.fork[2] * ft];
        const rr = mix(d.r0, d.r1, ft) * 0.72;
        addTube(gb, limb(from, [best.x, best.y, best.z], rr, rr * 0.35, d.lift ?? 0.3), 5, bark);
      }
    }
  } else {
    // четыре крупных кома той же оболочки: силуэт остаётся бугристым
    const cl = shell({ ...d, n: 4, cr: d.cr * 1.7, jit: 0.06, inset: (d.inset ?? 0.78) * 0.85, fill: d.fill }, d.seed).map(c => ({ ...c, det: 0 }));
    crown = addCrown(gb, cl, pal, { det: 0, amp: 0.1, freq: 1.6, seed: d.seed, flat: d.flat ?? 0.7, bend: 0.65 });
    addTube(gb, [[0, 0, 0, d.r0], [d.fork[0], d.fork[1], d.fork[2], d.r1], [d.fork[0], cy, d.fork[2], d.r1 * 0.6]], 4, barkFn(pal));
  }
  return crown;
}

const SPECIES = {
  // Платан восточный: высокий, раскидистый, светлая пятнистая кора.
  platan: lod => broadleaf(...lod, {
    pal: 'platan', env: [7.0, 3.7, 2.5], n: 10, cr: 1.55, cs: [1, 0.8, 1], cover: 0.4, fill: [[0.05, 0.62]],
    fork: [0.15, 4.0, 0.1], r0: 0.36, r1: 0.22, seg: 8, seed: 1.3, limbs: 5,
  }),
  // Каштан конский: плотный тёмный купол на коротком стволе.
  chestnut: lod => broadleaf(...lod, {
    pal: 'chestnut', env: [5.8, 3.3, 2.7], n: 10, cr: 1.55, cs: [1, 0.86, 1], cover: 0.5, jit: 0.12, fill: [[0, 0.68]],
    fork: [0.0, 3.0, 0.05], r0: 0.33, r1: 0.22, seed: 4.1, bend: 0.68, amp: 0.1,
  }),
  // Софора и робиния: ажурная крона на длинных ветвях, светлая желтоватая
  // листва, просветы между комами (заполнителя нет нарочно).
  acacia: lod => broadleaf(...lod, {
    pal: 'acacia', env: [6.8, 3.4, 2.5], n: 10, cr: 1.2, cs: [1.05, 0.85, 1], cover: 0.45, jit: 0.28, inset: 0.82, fill: [[0, 0.5]],
    fork: [0.25, 3.0, 0.0], r0: 0.27, r1: 0.18, seed: 2.7, flat: 0.68, lift: 0.6, bend2: [0.3, 0.1], amp: 0.16, freq: 2.4, limbs: 4,
  }),
  // Тополь пирамидальный: свеча. Веретено, а не стопка шаров — стопка
  // читалась гроздью винограда.
  poplar: ([gb, l]) => {
    addTube(gb, [[0, 0, 0, 0.27], [0, 1.0, 0, 0.26], [0, 1.12, 0, 0.26], [0, 2.4, 0, 0.22]], l ? 4 : 6, barkFn(PAL.poplar));
    return addSpindle(gb, {
      y0: 1.6, y1: 12.2, R: 1.55, rings: l ? 6 : 12, seg: l ? 6 : 11, pal: PAL.poplar, amp: l ? 0.1 : 0.22, vfreq: 0.8,
      prof: t => t < 0.3 ? 0.62 + 0.38 * Math.sin(t / 0.3 * Math.PI / 2) : Math.pow(1 - (t - 0.3) / 0.7, 0.7),
    });
  },
  // Олива: низкая, кривая, серебристая.
  olive: lod => broadleaf(...lod, {
    pal: 'olive', env: [3.6, 2.2, 1.4], n: 6, cr: 1.05, cs: [1, 0.75, 1], cover: 0.3, jit: 0.25, fill: [[0, 0.6]],
    fork: [-0.2, 1.7, 0.1], r0: 0.26, r1: 0.2, seed: 8.8, bend2: [-0.3, 0.2], lift: 0.5, amp: 0.16, freq: 2.4, limbs: 3,
  }),
  // Сосна крымская: рыжий кривой ствол и плоская зонтичная крона из
  // «подушек» хвои на концах ветвей.
  pine: ([gb, l]) => {
    const pal = PAL.pine, bark = barkFn(pal);
    const top = [0.6, 7.6, 0.2];
    let crown;
    if (l === 0) {
      const cl = shell({ env: [8.6, 3.3, 1.2], n: 9, cr: 1.28, cs: [1, 0.6, 1], cover: 0.2, jit: 0.3, inset: 0.82 }, 3.3)
        .map(c => ({ ...c, x: c.x + top[0], z: c.z + top[2] }));
      crown = addCrown(gb, cl, pal, { det: 1, amp: 0.18, freq: 2.4, seed: 3.3, flat: 0.55, bend: 0.5 });
      addTube(gb, [[0, 0, 0, 0.31], [0.05, 1.0, 0, 0.3], [0.06, 1.12, 0, 0.29], [0.2, 2.8, 0.02, 0.26],
                   [0.45, 5.0, 0.1, 0.22], [0.62, 6.8, 0.2, 0.18], [0.6, 8.3, 0.18, 0.13]], 7, bark);
      const low = [...cl].sort((a, b) => Math.hypot(b.x - top[0], b.z - top[2]) - Math.hypot(a.x - top[0], a.z - top[2])).slice(0, 5);
      for (const c of low) addTube(gb, limb([0.6, 6.9, 0.2], [c.x, c.y, c.z], 0.14, 0.06, 0.25), 5, bark);
    } else {
      const cl = shell({ env: [8.6, 3.3, 1.2], n: 4, cr: 1.85, cs: [1, 0.6, 1], cover: 0.2, jit: 0.1, inset: 0.75 }, 3.3)
        .map(c => ({ ...c, x: c.x + top[0], z: c.z + top[2], det: 0 }));
      crown = addCrown(gb, cl, pal, { det: 0, amp: 0.1, freq: 1.8, seed: 3.3, flat: 0.55, bend: 0.6 });
      addTube(gb, [[0, 0, 0, 0.31], [0.45, 5.0, 0.1, 0.22], [0.6, 8.3, 0.18, 0.13]], 4, bark);
    }
    return crown;
  },
  // Кипарис вечнозелёный: узкая колонна-пламя, примета приморской части.
  cypress: ([gb, l]) => {
    addTube(gb, [[0, 0, 0, 0.17], [0, 1.0, 0, 0.16], [0, 1.12, 0, 0.16], [0, 1.6, 0, 0.14]], l ? 4 : 6, barkFn(PAL.cypress));
    return addSpindle(gb, {
      y0: 0.7, y1: 9.4, R: 0.98, rings: l ? 5 : 14, seg: l ? 6 : 11, pal: PAL.cypress, amp: l ? 0.1 : 0.3, vfreq: 0.9,
      prof: t => t < 0.22 ? 0.72 + 0.28 * Math.sin(t / 0.22 * Math.PI / 2) : Math.pow(1 - (t - 0.22) / 0.78, 0.8),
    });
  },
  // Туя и можжевельник: плотный приземистый конус во дворах и у памятников.
  thuja: ([gb, l]) => addSpindle(gb, {
    y0: 0.15, y1: 4.4, R: 0.95, rings: l ? 4 : 8, seg: l ? 6 : 10, pal: PAL.thuja, amp: l ? 0.1 : 0.17, vfreq: 0.9,
    prof: t => Math.pow(Math.sin(Math.PI * (0.16 + 0.84 * t)), 0.85) * (1 - 0.25 * t),
  }),
  // Ель колючая (голубая): у памятников и в скверах Нахимова и Приморского.
  spruce: ([gb, l]) => {
    addTube(gb, [[0, 0, 0, 0.2], [0, 1.0, 0, 0.19], [0, 1.12, 0, 0.19], [0, 2.0, 0, 0.16]], l ? 4 : 6, barkFn(PAL.spruce));
    return addSpruce(gb, { tiers: l ? 4 : 9, seg: l ? 7 : 16, pal: PAL.spruce, H: 9.5, R: 2.4 });
  },
  // Кусты. Рыхлый куст — масса у земли из нескольких комов.
  shrub: ([gb, l]) => addCrown(gb, l
    ? [{ x: 0, y: 0.8, z: 0, r: 1, s: [1.3, 0.85, 1.25] }]
    : shell({ env: [0.85, 1.15, 0.75], n: 4, cr: 0.68, cs: [1, 0.85, 1], cover: 0.3, jit: 0.25, fill: [[0, 0.75]] }, 5.5),
    PAL.shrub, { det: l ? 0 : 1, amp: l ? 0.1 : 0.14, freq: 2.6, seed: 5.5, flat: 0.5, bend: 0.55, ao0: 0.55 }),
  // Олеандр — высокий куст в розовых цветах, южная набережная.
  oleander: ([gb, l]) => addCrown(gb, l
    ? [{ x: 0, y: 1.1, z: 0, r: 1, s: [1.0, 1.1, 1.0] }]
    : shell({ env: [1.1, 1.0, 1.05], n: 6, cr: 0.6, cs: [1, 1.0, 1], cover: 0.9, jit: 0.25, fill: [[-0.2, 0.7]] }, 9.1),
    PAL.oleander, { det: l ? 0 : 1, amp: l ? 0.1 : 0.14, freq: 2.8, seed: 9.1, flat: 0.6, bend: 0.5, ao0: 0.55 }),
  // Самшит, стриженый шаром: ровный, почти без шума.
  box: ([gb, l]) => addCrown(gb, [{ x: 0, y: 0.5, z: 0, r: 0.62, s: [1, 0.86, 1], det: l ? 0 : 1 }],
    PAL.box, { amp: 0.04, freq: 4.5, seed: 0.7, flat: 0.75, bend: 0.15, ao0: 0.6 }),
  // Живая изгородь — секция 2 м стриженой ленты. Секции ставятся встык вдоль
  // кромки газона, поэтому изгородь читается сплошной лентой, а не россыпью
  // кубиков. Профиль скруглён сверху, бока чуть неровные.
  hedge: ([gb, l]) => addHedge(gb, l),
};

function addHedge(gb, lod) {
  const pal = PAL.hedge, dark = lin(pal.dark), light = lin(pal.light);
  const W = 0.36, H = 0.92;
  // профиль поперёк: от низа одной стороны через скруглённый верх к другой
  const prof = lod ? [[-W, 0], [-W, H], [W, H], [W, 0]]
    : [[-W, 0], [-W * 1.04, H * 0.45], [-W * 0.98, H * 0.82], [-W * 0.72, H * 0.98], [W * 0.72, H * 0.98], [W * 0.98, H * 0.82], [W * 1.04, H * 0.45], [W, 0]];
  const steps = lod ? 1 : 4, L = 1.02;   // секция чуть длиннее 2 м: стыки перекрываются
  const base = gb.n, i0 = gb.I.length;
  const np = prof.length;
  for (let s = 0; s <= steps; s++) {
    const x = -L + 2 * L * s / steps;
    for (let k = 0; k < np; k++) {
      const [z, y] = prof[k];
      const nn = lod ? 0 : fbm(x * 1.3 + 3, y * 2.1, z * 3.1) * 0.045;
      const pz = z + Math.sign(z) * nn, py = y + (y > H * 0.9 ? nn * 0.8 : 0);
      const ny = y > H * 0.9 ? 1 : 0.15, nz = y > H * 0.9 ? Math.sign(z) * 0.25 : Math.sign(z);
      const t = clamp01(py / H * 0.85 + (hash3(x * 50, y * 50, z * 50) - 0.5) * 0.3);
      const ao = 0.55 + 0.45 * py / H;
      gb.v(x, py, pz, 0, ny, nz, [mix(dark[0], light[0], t) * ao, mix(dark[1], light[1], t) * ao, mix(dark[2], light[2], t) * ao], 1);
    }
  }
  for (let s = 0; s < steps; s++)
    for (let k = 0; k < np - 1; k++) {
      const a = base + s * np + k, b = a + 1, c = a + np, d = c + 1;
      gb.I.push(a, b, c, b, d, c);
    }
  // торцы — веер по профилю
  for (const s of [0, steps]) {
    const o = base + s * np;
    for (let k = 1; k < np - 1; k++) s ? gb.I.push(o, o + k, o + k + 1) : gb.I.push(o, o + k + 1, o + k);
  }
  // нормали — по граням: у стриженой ленты рёбра профиля и должны читаться
  faceNormals(gb, base, i0);
  return { cx: 0, cy: H / 2, cz: 0, rx: 1.02, ry: H / 2, rz: W, y0: 0, y1: H };
}

// Листопадные породы и насколько: осенью желтеют, зимой облетают. Кипарис,
// сосна, туя, ель, олива, олеандр, самшит и изгородь — вечнозелёные.
const DECID = { platan: 1, chestnut: 1, acacia: 1, poplar: 1, shrub: 0.7 };

// Классы: у кустов и изгородей свои дальности, на дальнем плане их нет вовсе.
export const TREES = ['platan', 'chestnut', 'acacia', 'poplar', 'pine', 'olive', 'cypress', 'thuja', 'spruce'];
export const BUSHES = ['shrub', 'oleander', 'box'];
const KEYS = [...TREES, ...BUSHES, 'hedge'];
const RANGE = {};
for (const k of TREES) RANGE[k] = [150, 600];
for (const k of BUSHES) RANGE[k] = [90, 300];
RANGE.hedge = [110, 380];
const FAR_R = 600;
const SHADOW_R2 = 150 * 150;   // карта теней — квадрат 370 м вокруг игрока

// Заготовки строим лениво, по одной на породу и ступень, и держим на весь
// сеанс: квартал их не освобождает (сетки ближнего и среднего плана общие).
const PROTO = {};
function proto(k) {
  if (PROTO[k]) return PROTO[k];
  const out = {};
  for (const lod of [0, 1]) {
    const gb = new GB();
    const crown = SPECIES[k]([gb, lod]);
    out[lod] = gb.build();
    const nv = out[lod].attributes.position.count;
    out[lod].setAttribute('aDec', new THREE.Float32BufferAttribute(new Float32Array(nv).fill(DECID[k] || 0), 1));
    if (lod === 0) out.crown = crown;
  }
  // средний цвет листвы — тон импостора на дальнем плане
  const g = out[0], C = g.attributes.color.array, L = g.attributes.aLeaf.array;
  let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 0; i < L.length; i++) if (L[i] > 0.5) { r += C[i * 3]; gg += C[i * 3 + 1]; b += C[i * 3 + 2]; n++; }
  out.far = [r / n * 1.12, gg / n * 1.12, b / n * 1.12];
  return (PROTO[k] = out);
}

// Заготовки строятся десятки миллисекунд на все породы. Чтобы за них не
// платил первый собранный квартал, строим их заранее, по одной за тик, пока
// грузятся манифест и рельеф.
if (typeof window !== 'undefined') {
  const todo = [...KEYS];
  const next = () => { const k = todo.shift(); if (!k) return; proto(k); setTimeout(next, 0); };
  setTimeout(next, 0);
}

// Полуширина кроны породы при масштабе 1 — посадке, чтобы не врастить крону в стену.
export const crownRadius = k => proto(k).crown.rx;

// ------------------------------------------------------------ материалы
const U = {
  uTime: { value: 0 },
  uWind: { value: 0.0016 },
  uLodC: { value: new THREE.Vector3(1e9, 0, 1e9) },
  uLodR: { value: FAR_R },
};

// Ближний и средний план: ламбертов свет (листве блик не нужен, а пиксель
// дешевле), ветер, побелка ствола. Флаг побелки едет в instanceColor: зелёный
// канал больше 1.5 значит «побелено», сам тон берётся по модулю.
function nearMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.customProgramCacheKey = () => 'flora-near-2';
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uWind = U.uWind; sh.uniforms.uSeason = ENV.uSeason; sh.uniforms.uWet = ENV.uWet;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;\nattribute float aLeaf;\nattribute float aDec;\nvarying float vLeaf;\nvarying float vDec;\nvarying float vSeed;\nvarying vec3 vLP;')
      .replace('#include <color_vertex>', `
        vColor = vec4(1.0);
        vColor.rgb *= color;
        #ifdef USE_INSTANCING_COLOR
          vec3 ic = instanceColor.rgb;
          float ww = step(1.5, ic.g);
          ic.g -= ww * 2.0;
          // побелка: кора ниже метра у уличных деревьев
          if (aLeaf < 0.5 && ww > 0.5 && position.y < 1.06) vColor.rgb = vec3(0.70, 0.70, 0.66);
          else vColor.rgb *= ic;
        #endif`)
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        vLeaf = aLeaf;
        vDec = aDec;
        vSeed = 0.5;
        vLP = position;
        #ifdef USE_INSTANCING
          vSeed = fract(sin(dot(vec2(instanceMatrix[3][0], instanceMatrix[3][2]), vec2(12.9898, 78.233))) * 43758.5453);
          vLP *= vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
          float ph = ip.x * 0.37 + ip.y * 0.29;
          float wh = max(position.y - 1.3, 0.0);
          float sw = sin(uTime * 0.9 + ph) * 0.65 + sin(uTime * 1.73 + ph * 1.9) * 0.35;
          transformed.xz += vec2(0.8, 0.55) * sw * wh * wh * uWind;
          // дрожь листвы: у стриженых кустов и изгородей (ниже 3 м) почти нет
          transformed += normal * min(aLeaf, 1.0) * 0.035 * clamp(position.y / 3.0, 0.0, 1.0)
                       * sin(uTime * 4.1 + dot(position, vec3(2.3, 1.7, 2.9)) + ph);
        #endif`);
    // Фактура листвы без текстуры: шум по метрам кроны темнит «провалы» между
    // пучками листьев и высветляет отдельные листья. У олеандра поверх —
    // розовые соцветия.
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec4 uSeason;
        uniform vec4 uWet;
        varying float vLeaf;
        varying float vDec;
        varying float vSeed;
        varying vec3 vLP;
        float fh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float fn(vec3 x) {
          vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(fh(i), fh(i + vec3(1,0,0)), f.x), mix(fh(i + vec3(0,1,0)), fh(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(fh(i + vec3(0,0,1)), fh(i + vec3(1,0,1)), f.x), mix(fh(i + vec3(0,1,1)), fh(i + vec3(1,1,1)), f.x), f.y), f.z);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vLeaf > 0.5) {
          float n1 = fn(vLP * 2.6), n2 = fh(floor(vLP * 7.0));
          diffuseColor.rgb *= 0.74 + 0.36 * n1 + 0.14 * (n2 - 0.5);
          // соцветия — круглые пятнышки по ячейкам: в каждой второй ячейке
          // своё место и свой оттенок
          if (vLeaf > 1.5) {
            vec3 fp = vLP * 4.5, fc = floor(fp);
            vec3 fo = vec3(fh(fc + 1.3), fh(fc + 2.7), fh(fc + 5.1)) * 0.6 + 0.2;
            float fhh = fh(fc + 9.9);
            if (fhh > 0.45 && length(fract(fp) - fo) < 0.24) diffuseColor.rgb = mix(vec3(0.85, 0.30, 0.45), vec3(0.92, 0.82, 0.84), step(0.85, fhh)) * (0.8 + 0.3 * n1);
          }
        } else {
          // кора: продольные борозды и пятна
          diffuseColor.rgb *= 0.78 + 0.34 * fn(vLP * vec3(9.0, 1.4, 9.0)) * (0.7 + 0.3 * fn(vLP * 2.2));
        }
        // ---- времена года (env.js)
        if (vLeaf > 0.5) {
          float sd = vDec * (0.85 + 0.3 * vSeed);
          // облетело: крона редеет пятнами, к зиме остаются ветви
          if (uSeason.y > 0.01 && fn(vLP * 1.9 + vSeed * 7.0) * 0.86 + 0.08 < uSeason.y * sd) discard;
          float l = dot(diffuseColor.rgb, vec3(0.30, 0.55, 0.15));
          // осень: у каждого дерева свой тон — лимонный, золотой, ржавый
          vec3 au = mix(vec3(0.62, 0.46, 0.10), vec3(0.58, 0.24, 0.06), vSeed) * (0.55 + 2.2 * l);
          au = mix(au, vec3(0.36, 0.20, 0.08) * (0.7 + 2.0 * l), step(0.82, vSeed) * 0.7);
          // не всё сразу: часть кроны ещё зелёная, у каждого дерева по-своему
          float ak = uSeason.x * vDec * (0.55 + 0.45 * vSeed) * smoothstep(0.15, 0.6, fn(vLP * 0.9 + vSeed * 3.0) + uSeason.x * 0.45);
          diffuseColor.rgb = mix(diffuseColor.rgb, au, clamp(ak, 0.0, 1.0));
          // весна: молодая светлая листва и белые соцветия на каштанах и акациях
          if (uSeason.w > 0.01 && vDec > 0.9) {
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.05, 1.22, 0.78), uSeason.w);
            vec3 bp = vLP * 3.8, bc = floor(bp);
            if (fh(bc + 4.4) > 1.0 - 0.38 * uSeason.w && length(fract(bp) - 0.5) < 0.22) diffuseColor.rgb = vec3(0.93, 0.92, 0.86);
          }
          // снег на верхушках крон и хвое
          float snz = max(uSeason.z, uWet.x);
          if (snz > 0.01) {
            float up = dot(normalize(vNormal), normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
            float sn = snz * smoothstep(0.35, 0.8, up) * step(0.35 - 0.2 * uWet.x, fn(vLP * 4.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.89, 0.94), sn * (1.0 - 0.6 * vDec * uSeason.y));
          }
        }`)
      // Листва на просвет. По одному ламберту теневая сторона кроны — чёрная
      // дыра (зелень тёмная, небо даёт мало), а против солнца живая крона
      // светится. Добавляем солнце, прошедшее сквозь лист, и чуть подсветки.
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
          if (vLeaf > 0.5) {
            float back = pow(saturate(-dot(normalize(vViewPosition), directionalLights[0].direction)), 3.0);
            reflectedLight.indirectDiffuse += directionalLights[0].color * diffuseColor.rgb * (0.05 + 0.32 * back);
          }
        #endif`);
  };
  return m;
}

// Дальний план: импостор. Квадрат разворачивается к камере в вершинном
// шейдере (полуоси — из масштаба матрицы экземпляра), всё, что ближе uLodR к
// точке последней пересборки, сворачивается в точку за экраном — там уже
// стоит подробная модель.
function farMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: false });
  m.customProgramCacheKey = () => 'flora-far-2';
  m.onBeforeCompile = sh => {
    sh.uniforms.uLodC = U.uLodC; sh.uniforms.uLodR = U.uLodR; sh.uniforms.uSeason = ENV.uSeason;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uLodC;\nuniform float uLodR;\nvarying vec3 vImp;\nvarying float vDec;')
      // листопадность едет в красном канале цвета экземпляра: +4 — листопадное
      .replace('#include <color_vertex>', `#include <color_vertex>
        vDec = 0.0;
        #ifdef USE_INSTANCING_COLOR
          vDec = step(3.5, instanceColor.r);
          vColor.r = instanceColor.r - vDec * 4.0;
        #endif`)
      .replace('#include <project_vertex>', `
        vec4 cW = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float rx = length(instanceMatrix[0].xyz), ry = length(instanceMatrix[1].xyz);
        vec3 vd = normalize(cW.xyz - cameraPosition);
        float steep = vd.y * vd.y;
        vec4 mvPosition = viewMatrix * cW;
        mvPosition.xy += position.xy * 1.06 * vec2(rx, mix(ry, max(rx, ry * 0.7), steep));
        // ближние экземпляры уже нарисованы моделью — прячем
        if (distance(cW.xyz, uLodC) < uLodR) mvPosition = vec4(0.0, 0.0, 1.0, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vImp = vec3(position.xy, fract(sin(dot(cW.xz, vec2(12.9898, 78.233))) * 43758.5453));`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uSeason;\nvarying vec3 vImp;\nvarying float vDec;')
      .replace('#include <color_fragment>', `
        #include <color_fragment>
        float r2 = dot(vImp.xy, vImp.xy);
        float an = atan(vImp.y, vImp.x);
        float edge = 0.84 + 0.09 * sin(an * 5.0 + vImp.z * 6.28) + 0.06 * sin(an * 9.0 + vImp.z * 17.0);
        if (r2 > edge * edge) discard;
        float sp = fract(sin(dot(floor(vImp.xy * 5.0 + vImp.z * 9.0), vec2(127.1, 311.7))) * 43758.5453);
        diffuseColor.rgb *= (0.62 + 0.38 * (vImp.y * 0.5 + 0.5)) * (0.9 + 0.2 * sp);
        if (vDec > 0.5) {
          // зимой дальняя крона — редкая серо-бурая сетка ветвей
          if (sp < uSeason.y * 0.8) discard;
          float l = dot(diffuseColor.rgb, vec3(0.30, 0.55, 0.15));
          vec3 au = mix(vec3(0.62, 0.46, 0.10), vec3(0.58, 0.24, 0.06), vImp.z) * (0.55 + 2.2 * l);
          diffuseColor.rgb = mix(diffuseColor.rgb, au, uSeason.x * (0.35 + 0.45 * sp));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.26, 0.22) * (0.8 + 0.4 * sp), uSeason.y * 0.85);
        }`)
      .replace('#include <normal_fragment_begin>', `
        float faceDirection = 1.0;
        vec3 normal = normalize(vec3(vImp.x, vImp.y * 0.85 + 0.2, sqrt(max(0.08, 1.0 - r2))));
        vec3 nonPerturbedNormal = normal;`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
          float back = pow(saturate(-dot(normalize(vViewPosition), directionalLights[0].direction)), 3.0);
          reflectedLight.indirectDiffuse += directionalLights[0].color * diffuseColor.rgb * (0.05 + 0.32 * back);
        #endif`);
  };
  return m;
}

// Тень ближнего плана. Полная модель в карте теней стоила бы столько же,
// сколько в кадре, — сотни тысяч треугольников ради пятна на асфальте. Тень
// кладёт одна общая сетка: шумный эллипсоид по «матрице кроны» каждого
// ближнего дерева, куста и секции изгороди. В кадре она не видна (вершины
// уходят за плоскость отсечения), в карту теней пишется как обычно.
function shadowMaterial() {
  const m = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  m.customProgramCacheKey = () => 'flora-shadow-1';
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\ngl_Position = vec4(0.0, 0.0, 2.0, 1.0);');
  };
  return m;
}
let SHADOW_GEO = null;
function shadowGeo() {
  if (SHADOW_GEO) return SHADOW_GEO;
  const gb = new GB();
  addCrown(gb, [{ x: 0, y: 0, z: 0, r: 1, s: [1, 1, 1] }], PAL.hedge, { det: 1, amp: 0.18, freq: 2.2, seed: 2, flat: 1, bend: 0 });
  return (SHADOW_GEO = gb.build());
}

// Квадрат импостора: ±1 по x и y, лицом к +z (в пространстве вида).
let FAR_GEO = null;
function farGeo() {
  if (FAR_GEO) return FAR_GEO;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeBoundingSphere();
  return (FAR_GEO = g);
}

// ------------------------------------------------------------ посадка
// Запись экземпляра — 9 чисел: x, y, z, ширина, высота, поворот, наклон,
// азимут наклона, флаги (1 — побелённый ствол). У изгороди «ширина» — длина
// секции (масштаб по x), поперёк она не растягивается.
export const ST = 9;

const entries = [];
let dirty = true;

const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), qt = new THREE.Quaternion(),
      sv = new THREE.Vector3(), pv = new THREE.Vector3(), ax = new THREE.Vector3(), tv = new THREE.Vector3(),
      UP = new THREE.Vector3(0, 1, 0);

// Сажает набор в квартал: считает матрицы и тон, строит дальнюю сетку
// импосторов (одну на все породы) и записывает квартал в общий учёт.
// parent — группа квартала: по ней учёт узнаёт, что квартал выгрузили.
export function plantFlora(parent, sets) {
  const ent = { parent, sets: {}, x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity, n: 0 };
  let farN = 0;
  for (const k of KEYS) {
    const arr = sets[k];
    if (!arr || !arr.length) continue;
    const n = arr.length / ST;
    const P = proto(k), cr = P.crown;
    const M = new Float32Array(n * 16), C = new Float32Array(n * 3), L = new Float32Array(n * 3), CM = new Float32Array(n * 16);
    for (let i = 0; i < n; i++) {
      const o = i * ST;
      const x = arr[o], y = arr[o + 1], z = arr[o + 2], w = arr[o + 3], h = arr[o + 4];
      pv.set(x, y, z);
      if (k === 'hedge') sv.set(w, h, 1); else sv.set(w, h, w);
      q4.setFromAxisAngle(UP, arr[o + 5]);
      if (arr[o + 6]) {
        ax.set(Math.cos(arr[o + 7]), 0, Math.sin(arr[o + 7]));
        q4.premultiply(qt.setFromAxisAngle(ax, arr[o + 6]));
      }
      m4.compose(pv, q4, sv).toArray(M, i * 16);
      // тон дерева: яркость ±12 %, лёгкий сдвиг в жёлтое или синее
      const hb = hash2(x * 1.3 + 7, z * 1.3 - 3), hh = hash2(z * 0.7, x * 0.7) - 0.5;
      const br = 0.88 + hb * 0.24;
      C[i * 3] = br * (1 + hh * 0.12); C[i * 3 + 1] = br; C[i * 3 + 2] = br * (1 - hh * 0.16);
      if (arr[o + 8] & 1) C[i * 3 + 1] += 2.0;
      // точка, по которой решается ступень: центр кроны у дерева, основание у куста
      L[i * 3] = x; L[i * 3 + 1] = y + (TREES.includes(k) ? cr.cy * h : 0); L[i * 3 + 2] = z;
      // «Матрица кроны»: центр и полуоси кроны в мире. По ней рисуется
      // импостор дальнего плана и отбрасывается тень ближнего.
      sv.set(cr.rx * w, cr.ry * h, (cr.rz ?? cr.rx) * (k === 'hedge' ? 1 : w));
      q4.setFromAxisAngle(UP, arr[o + 5]);
      pv.set(cr.cx, cr.cy, cr.cz).multiply(tv.set(w, h, k === 'hedge' ? 1 : w)).applyQuaternion(q4);
      pv.x += x; pv.y += y; pv.z += z;
      m4.compose(pv, q4, sv).toArray(CM, i * 16);
      ent.x0 = Math.min(ent.x0, x); ent.x1 = Math.max(ent.x1, x);
      ent.z0 = Math.min(ent.z0, z); ent.z1 = Math.max(ent.z1, z);
    }
    ent.sets[k] = { M, C, L, CM, n };
    ent.n += n;
    if (TREES.includes(k)) farN += n;
  }
  if (!ent.n) return null;
  // дальний план — один InstancedMesh на квартал
  if (farN) {
    const fm = new THREE.InstancedMesh(farGeo(), farMaterial(), farN);
    fm.name = 'flora:far';
    const FC = new Float32Array(farN * 3);
    let j = 0;
    for (const k of TREES) {
      const s = ent.sets[k]; if (!s) continue;
      const fc = proto(k).far;
      fm.instanceMatrix.array.set(s.CM, j * 16);
      for (let i = 0; i < s.n; i++, j++) {
        const g = s.C[i * 3 + 1] > 1.5 ? s.C[i * 3 + 1] - 2 : s.C[i * 3 + 1];
        FC[j * 3] = fc[0] * s.C[i * 3] + (DECID[k] ? 4 : 0); FC[j * 3 + 1] = fc[1] * g; FC[j * 3 + 2] = fc[2] * s.C[i * 3 + 2];
      }
    }
    fm.instanceColor = new THREE.InstancedBufferAttribute(FC, 3);
    fm.instanceMatrix.needsUpdate = true;
    fm.computeBoundingSphere();
    parent.add(fm);
  }
  entries.push(ent);
  dirty = true;
  return ent;
}

// ------------------------------------------------------------ общий учёт
// По паре InstancedMesh на породу: ближний и средний план. Ёмкость растёт
// удвоением; в кадр уходит только заполненная часть буфера.
const live = {};       // k → { near: {mesh, cap}, mid: {...} }
let MAT = null, SMAT = null;
const last = new THREE.Vector3(1e9, 1e9, 1e9);
const fwd = new THREE.Vector3(), lastDir = new THREE.Vector3(0, -2, 0);
const CONE_PAD = THREE.MathUtils.degToRad(18), TURN = THREE.MathUtils.degToRad(8);
const NEAR_ALL2 = 25 * 25;          // ближе 25 м — всё: крона над головой и сбоку
const scratch = {};
export const floraStats = { near: 0, mid: 0, rebuilds: 0, ms: 0 };
// Отладка (tools/flora.html): force = 0 / 1 / 2 — всё ближним, средним или дальним планом.
export const floraDebug = { force: -1 };

function slot(scene, k, lod, need) {
  const L = live[k] || (live[k] = {});
  let s = L[lod];
  if (s && s.cap >= need) return s;
  const cap = Math.max(64, 1 << Math.ceil(Math.log2(Math.max(need, 1) * 1.25)));
  if (!MAT) MAT = nearMaterial();
  const sh = k === 'shadow';
  if (sh && !SMAT) SMAT = shadowMaterial();
  const mesh = new THREE.InstancedMesh(sh ? shadowGeo() : proto(k)[lod], sh ? SMAT : MAT, cap);
  mesh.name = sh ? 'flora:shadow' : `flora:${lod ? 'mid' : 'near'}:${k}`;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;      // набор и так вокруг камеры
  // тень — только у ближнего плана и только общей сеткой-тенью (см. выше)
  mesh.castShadow = sh;
  mesh.count = 0;
  if (s) { scene.remove(s.mesh); s.mesh.dispose(); }
  scene.add(mesh);
  return (L[lod] = { mesh, cap });
}

function grow(k, lod, n) {
  const key = k + lod;
  let s = scratch[key];
  if (!s || s.M.length < n * 16) {
    const cap = Math.max(256, 1 << Math.ceil(Math.log2(n * 1.5)));
    const M = new Float32Array(cap * 16), C = new Float32Array(cap * 3);
    if (s) { M.set(s.M); C.set(s.C); }
    s = scratch[key] = { M, C };
  }
  return s;
}

// 0 — квартал снят со сцены, 1 — на сцене, но ещё не показан (main.js
// открывает квартал, когда собраны его шейдеры), 2 — виден.
function state(o) {
  let vis = true;
  for (; o.parent; o = o.parent) if (!o.visible) vis = false;
  return o.isScene ? (vis ? 2 : 1) : 0;
}

// Заранее, за экраном загрузки: создать общие сетки всех пород, чтобы прогрев
// шейдеров (warm.js) собрал их программы и вариант тени до первого кадра, а не
// в тот момент, когда на экране впервые появится дерево.
export function warmFlora(scene) {
  for (const k of KEYS) for (const lod of [0, 1]) slot(scene, k, lod, 1).mesh.visible = false;
  slot(scene, 'shadow', 0, 1).mesh.visible = false;
}

// Каждый кадр: время ветра, выбывшие кварталы, а при сдвиге камеры на шаг —
// пересборка ближнего и среднего наборов.
export function updateFlora(camera, scene, now) {
  U.uTime.value = now / 1000;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i], st = state(e.parent);
    if (!st) { entries.splice(i, 1); dirty = true; continue; }
    if (st !== e.st) { e.st = st; dirty = true; }
  }
  const c = camera.position;
  // НАБОР — ТОЛЬКО ПЕРЕД КАМЕРОЙ. Ближний и средний план рисуются одной
  // сеткой на породу без отсечения по кадру, и раньше в неё шли все деревья
  // на 600 м кругом — две трети за спиной и по бокам: с Большой Морской это
  // 290 тысяч треугольников в кадре. Теперь берём конус взгляда с запасом
  // CONE_PAD на каждую сторону и пересобираем набор и при повороте больше
  // чем на TURN — запас его покрывает, дерево у края кадра не моргает.
  // Тень от деревьев — своя сетка (flora:shadow), её набираем по-прежнему
  // кругом: тень от дерева за спиной падает в кадр.
  camera.getWorldDirection(fwd);
  const turned = fwd.dot(lastDir) < Math.cos(TURN);
  if (!dirty && !turned && c.distanceToSquared(last) < 100) return;
  const t0 = performance.now();
  dirty = false;
  last.copy(c);
  lastDir.copy(fwd);
  const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov || 60) / 2);
  const cone = Math.atan(Math.hypot(tv, tv * (camera.aspect || 1.8))) + CONE_PAD;
  const cosC = cone >= Math.PI ? -2 : Math.cos(cone);
  const fx = fwd.x, fy = fwd.y, fz = fwd.z;
  const cnt = { shadow0: 0 };
  for (const k of KEYS) cnt[k + 0] = cnt[k + 1] = 0;
  for (const e of entries) {
    if (e.st !== 2) continue;                    // квартал ещё не открыт
    // квартал целиком дальше среднего плана — пропускаем
    const dx = Math.max(e.x0 - c.x, 0, c.x - e.x1), dz = Math.max(e.z0 - c.z, 0, c.z - e.z1);
    if (dx * dx + dz * dz > FAR_R * FAR_R && floraDebug.force < 0) continue;
    for (const k in e.sets) {
      const s = e.sets[k], [rn, rm] = RANGE[k];
      const rn2 = rn * rn, rm2 = rm * rm;
      const L = s.L;
      for (let i = 0; i < s.n; i++) {
        const ex = L[i * 3] - c.x, ey = L[i * 3 + 1] - c.y, ez = L[i * 3 + 2] - c.z;
        const d2 = ex * ex + ey * ey + ez * ez;
        let lod = d2 < rn2 ? 0 : 1;
        if (floraDebug.force >= 0) { if (floraDebug.force === 2) continue; lod = floraDebug.force; }
        else if (d2 >= rm2) continue;
        // в конусе взгляда (или вплотную к камере — крона над головой)
        if (d2 < NEAR_ALL2 || ex * fx + ey * fy + ez * fz >= cosC * Math.sqrt(d2)) {
          const key = k + lod, j = cnt[key]++;
          const sc = grow(k, lod, j + 1);
          sc.M.set(s.M.subarray(i * 16, i * 16 + 16), j * 16);
          sc.C[j * 3] = s.C[i * 3]; sc.C[j * 3 + 1] = s.C[i * 3 + 1]; sc.C[j * 3 + 2] = s.C[i * 3 + 2];
        }
        if (!lod && d2 < SHADOW_R2) {
          const js = cnt.shadow0++;
          grow('shadow', 0, js + 1).M.set(s.CM.subarray(i * 16, i * 16 + 16), js * 16);
        }
      }
    }
  }
  let nn = 0, nm = 0;
  for (const k of [...KEYS, 'shadow']) for (const lod of [0, 1]) {
    const n = cnt[k + lod] || 0;
    if (!n && !(live[k] && live[k][lod])) continue;
    const { mesh } = slot(scene, k, lod, n);
    if (n) {
      const sc = scratch[k + lod];
      mesh.instanceMatrix.array.set(sc.M.subarray(0, n * 16));
      mesh.instanceColor.array.set(sc.C.subarray(0, n * 3));
      mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, n * 16);
      mesh.instanceColor.clearUpdateRanges(); mesh.instanceColor.addUpdateRange(0, n * 3);
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    }
    mesh.count = n;
    mesh.visible = n > 0;
    if (k !== 'shadow') { if (lod) nm += n; else nn += n; }
  }
  U.uLodC.value.copy(c);
  U.uLodR.value = floraDebug.force === 2 ? 0 : floraDebug.force >= 0 ? 1e9 : FAR_R;
  floraStats.near = nn; floraStats.mid = nm; floraStats.rebuilds++;
  floraStats.ms = +(performance.now() - t0).toFixed(2);
}
