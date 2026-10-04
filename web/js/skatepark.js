import * as THREE from 'three';

// Деревянные фигуры скейт-парков (data/skateparks.json): квотеры, пирамиды,
// бокс, рейл, бэнк. Площадку под ними (ровную отметку и покрытие) уже кладёт
// sport.js по контуру OSM — здесь только фигуры. Каждая фигура задана точкой,
// направлением dir (куда скатываешься с неё, градусы от оси x к оси z) и
// размерами; источник и что в расстановке прикидка — в поле source.
//
// Весь парк — три сетки: катальная поверхность (тёмный скейтлайт), фанера
// боков и металл (копинги, перила, рейл).

let PARKS = [];

export async function loadSkateparks(v) {
  PARKS = await fetch(`../data/skateparks.json${v ? '?v=' + v : ''}`)
    .then(r => r.ok ? r.json() : []).catch(() => []);
  return PARKS;
}

const SURF = 0x8a7a64, PLY = 0xb4935f, METAL = 0x9a9ca0;

// Набор треугольников в мировых координатах одного материала.
// Обход каждого треугольника выравнивается наружу: у катальной поверхности —
// вверх, у боков и металла — от центра фигуры (Bag.c). Со смешанным обходом
// двусторонний материал рисовал в карту теней обе стороны, и на скатах
// пирамид лежала тёмная сетка.
class Bag {
  constructor(up = false) { this.p = []; this.up = up; this.c = null; }
  tri(a, b, c) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    let out;
    if (this.up || !this.c) out = ny;
    else out = nx * ((a[0] + b[0] + c[0]) / 3 - this.c[0]) + ny * ((a[1] + b[1] + c[1]) / 3 - this.c[1])
             + nz * ((a[2] + b[2] + c[2]) / 3 - this.c[2]);
    if (out < 0) this.p.push(...a, ...c, ...b); else this.p.push(...a, ...b, ...c);
  }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.computeVertexNormals();
    return g;
  }
}

// Брус между двумя точками (копинг, перила, рейл): квадратное сечение.
function bar(bag, a, b, r) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  let s = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0));
  if (s.lengthSq() < 1e-6) s.set(1, 0, 0);
  s.normalize().multiplyScalar(r);
  const u = new THREE.Vector3().crossVectors(s, d).normalize().multiplyScalar(r);
  const c = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([i, j]) => [s.x * i + u.x * j, s.y * i + u.y * j, s.z * i + u.z * j]);
  for (let k = 0; k < 4; k++) {
    const p = c[k], q = c[(k + 1) % 4];
    bag.quad([a[0] + p[0], a[1] + p[1], a[2] + p[2]], [b[0] + p[0], b[1] + p[1], b[2] + p[2]],
             [b[0] + q[0], b[1] + q[1], b[2] + q[2]], [a[0] + q[0], a[1] + q[1], a[2] + q[2]]);
  }
}

// Фигура в своей рамке: f — вперёд (куда скатываться), s — вбок, y — вверх
// от отметки площадки. Возвращает перевод в мировые координаты.
function frame(it, y0) {
  const a = it.dir * Math.PI / 180, fx = Math.cos(a), fz = Math.sin(a);
  return (f, s, y) => [it.x + fx * f - fz * s, y0 + y, it.z + fz * f + fx * s];
}

// Профиль в плоскости (f, y) вытягивается на ширину w: верх — поверхность,
// торцы — фанера. Профиль — точки верха от задней кромки к носку, низ — y=0.
function extrude(P, prof, w, top, side, back) {
  const h = w / 2;
  for (let i = 0; i + 1 < prof.length; i++) {
    const [f0, y0] = prof[i], [f1, y1] = prof[i + 1];
    top.quad(P(f0, h, y0), P(f1, h, y1), P(f1, -h, y1), P(f0, -h, y0));
  }
  // торцы: треугольники по контуру профиля с замыканием по земле
  const poly = [[prof[prof.length - 1][0], 0], [prof[0][0], 0], ...prof];
  const tris = THREE.ShapeUtils.triangulateShape(poly.map(([f, y]) => new THREE.Vector2(f, y)), []);
  for (const [i, j, k] of tris) {
    side.tri(P(poly[i][0], h, poly[i][1]), P(poly[j][0], h, poly[j][1]), P(poly[k][0], h, poly[k][1]));
    side.tri(P(poly[k][0], -h, poly[k][1]), P(poly[j][0], -h, poly[j][1]), P(poly[i][0], -h, poly[i][1]));
  }
  // задняя стенка (если профиль начинается не с земли)
  const [fb, yb] = prof[0];
  if (yb > 0.01) back.quad(P(fb, -h, 0), P(fb, -h, yb), P(fb, h, yb), P(fb, h, 0));
}

function quarter(it, P, top, side, metal) {
  const h = it.h, R = h * 1.25, deck = it.deck || 1.0;
  const L = Math.sqrt(R * R - (R - h) * (R - h));        // длина радиуса по земле
  const prof = [[0, h], [deck, h]];
  const N = 10;
  for (let i = 1; i <= N; i++) {
    const f = deck + L * i / N, dc = deck + L - f;
    prof.push([f, R - Math.sqrt(Math.max(0, R * R - dc * dc))]);
  }
  extrude(P, prof, it.w, top, side, side);
  // копинг по кромке радиуса
  bar(metal, P(deck, -it.w / 2, h), P(deck, it.w / 2, h), 0.035);
  if (it.rail) {                                          // перила по краю площадки
    const hr = 1.0, sides = [-it.w / 2 + 0.05, it.w / 2 - 0.05];
    for (const s of sides) bar(metal, P(0.08, s, h), P(0.08, s, h + hr), 0.025);
    bar(metal, P(0.08, sides[0], h + hr), P(0.08, sides[1], h + hr), 0.025);
    for (const s of sides) {
      bar(metal, P(0.08, s, h + hr), P(deck * 0.7, s, h + hr), 0.025);
      bar(metal, P(deck * 0.7, s, h), P(deck * 0.7, s, h + hr), 0.025);
    }
  }
}

function pyramid(it, P, top, side, metal) {
  const b = it.base / 2, t = it.top / 2, h = it.h;
  const c = [[b, b], [-b, b], [-b, -b], [b, -b]], u = [[t, t], [-t, t], [-t, -t], [t, -t]];
  for (let k = 0; k < 4; k++) {
    const j = (k + 1) % 4;
    top.quad(P(c[k][0], c[k][1], 0), P(c[j][0], c[j][1], 0), P(u[j][0], u[j][1], h), P(u[k][0], u[k][1], h));
    bar(metal, P(u[k][0], u[k][1], h), P(u[j][0], u[j][1], h), 0.03);
  }
  top.quad(P(t, t, h), P(-t, t, h), P(-t, -t, h), P(t, -t, h));
  // рёбра пирамиды прикрываем фанерными уголками — иначе на стыке скатов щель
  for (let k = 0; k < 4; k++) bar(side, P(c[k][0], c[k][1], 0), P(u[k][0], u[k][1], h), 0.04);
}

function box(it, P, top, side, metal) {
  const l = it.l / 2, w = it.w / 2, h = it.h;
  top.quad(P(l, w, h), P(-l, w, h), P(-l, -w, h), P(l, -w, h));
  side.quad(P(l, w, 0), P(-l, w, 0), P(-l, w, h), P(l, w, h));
  side.quad(P(-l, -w, 0), P(l, -w, 0), P(l, -w, h), P(-l, -w, h));
  side.quad(P(l, -w, 0), P(l, w, 0), P(l, w, h), P(l, -w, h));
  side.quad(P(-l, w, 0), P(-l, -w, 0), P(-l, -w, h), P(-l, w, h));
  for (const s of [-w, w]) bar(metal, P(-l, s, h), P(l, s, h), 0.03);
}

function rail(it, P, metal) {
  const l = it.l / 2, h = it.h;
  bar(metal, P(-l, 0, h), P(l, 0, h), 0.03);
  for (const f of [-l + 0.3, l - 0.3]) {
    bar(metal, P(f, 0, 0), P(f, 0, h), 0.03);
    bar(metal, P(f, -0.35, 0.02), P(f, 0.35, 0.02), 0.03);
  }
}

function bank(it, P, top, side) {
  extrude(P, [[0, it.h], [it.l, 0]], it.w, top, side, side);
}

// world.meta.bounds — квадрат чанка с запасом 260 м; парк строит только тот
// чанк, в чьём квадрате лежит его первая фигура (как трибуны в sport.js).
export function buildSkateparks(world, terrain) {
  const group = new THREE.Group();
  group.name = 'скейт-парки';
  const B = world.meta && world.meta.bounds;
  const mine = (x, z) => !B || (x >= B.minX + 260 && x < B.maxX - 260 && z >= B.minZ + 260 && z < B.maxZ - 260);
  const top = new Bag(true), side = new Bag(), metal = new Bag();
  for (const park of PARKS) {
    const items = park.items || [];
    if (!items.length || !mine(items[0].x, items[0].z)) continue;
    for (const it of items) {
      // верх покрытия площадки: сетка рельефа плюс подъём, с которым
      // покрытие кладёт buildAreas (~0.23 м), — иначе фигуры тонут в нём
      const P = frame(it, terrain.gridHeightAt(it.x, it.z) + 0.25);
      side.c = metal.c = P(it.k === 'quarter' || it.k === 'bank' ? (it.l || it.deck || 1) / 2 : 0, 0, (it.h || 0.3) / 2);
      if (it.k === 'quarter') quarter(it, P, top, side, metal);
      else if (it.k === 'pyramid') pyramid(it, P, top, side, metal);
      else if (it.k === 'box') box(it, P, top, side, metal);
      else if (it.k === 'rail') rail(it, P, metal);
      else if (it.k === 'bank') bank(it, P, top, side);
    }
  }
  for (const [bag, color, rough, metalness] of [[top, SURF, 0.7, 0], [side, PLY, 0.85, 0], [metal, METAL, 0.4, 0.6]]) {
    if (!bag.p.length) continue;
    const m = new THREE.Mesh(bag.geo(), new THREE.MeshStandardMaterial({
      color, roughness: rough, metalness, side: THREE.DoubleSide, shadowSide: THREE.BackSide }));
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  return group;
}
