import * as THREE from 'three';
import { ENV } from './env.js?v=e287a336';
import { BUILT } from './series.js?v=e287a336';
import { gateOf, gateCut } from './passage.js?v=e287a336';

// Фасады типовых домов деталями (п. 18 очереди): подоконники, карнизы и
// парапеты, балконы хрущёвок, экраны лоджий девятиэтажек, рустованный цоколь
// и тяга сталинок.
//
// Сам фасад рисует шейдер (materials.js, виды 14–16), и издали этого хватает.
// Вблизи плоская стена выдаёт себя: балкон нарисован на стене, у окна нет
// отлива. Здесь — та же сетка окон, что в шейдере, только объёмом. Детали
// встают ровно на нарисованные проёмы: сетка пролётов, этажи и случайные
// «есть ли балкон на стояке» считаются теми же формулами и тем же хешем
// (hash21 в float32), что и в шейдере.
//
// Скорость. Деталей на хрущёвку — сотни, на весь город — сотни тысяч, поэтому
// в меш чанка их не кладём. Одна InstancedMesh на всю сцену (один вызов
// отрисовки и один в тени) держит только детали вокруг камеры: подоконники
// ближе NEAR_SILL, остальное ближе NEAR, и не больше MAX штук. Набор
// пересобирается, когда камера сдвинулась на STEP метров. Детали дома
// считаются лениво — когда дом впервые попал в круг — и забываются, когда он
// далеко. Дальше круга балконы снова рисует шейдер: ENV.uFacadeR говорит ему,
// где начинаются объёмные, чтобы не было двух балконов разом.

const NEAR = 170, NEAR_SILL = 95, STEP = 10, MAX = 3500;   // 3500 × 10 тр. × (кадр + тень) ≈ 70k
const F = 13;                        // чисел на деталь в кеше дома

// ---- те же формулы, что в шейдере ----
const f = Math.fround;
const fract = x => x - Math.floor(x);
const K1 = f(127.1), K2 = f(311.7), K3 = f(34.56);
// hash21 из materials.js: p = fract(p * (127.1, 311.7)); p += dot(p, p + 34.56); fract(p.x * p.y)
function hash21(x, y) {
  let px = f(fract(f(f(x) * K1))), py = f(fract(f(f(y) * K2)));
  const d = f(f(px * f(px + K3)) + f(py * f(py + K3)));
  px = f(px + d); py = f(py + d);
  return f(fract(f(px * py)));
}
const gmod = (x, y) => x - y * Math.floor(x / y);
// цвет вершины дома — Uint8, линейный (worldgen.js, enc)
const s2l = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const enc = v => Math.round(255 * s2l(Math.max(0, Math.min(1, v))));

// виды детали (aDet, целая часть): 0 гладкая, 1 стекло в раме, 2 решётка, 3 руст
const SOLID = 0, GLASS = 1, BARS = 2, RUST = 3;

// ---- детали одного дома ----
// Коробка у стены: вдоль стены от ua до ub (м от угла A), по высоте y0..y1,
// от стены o0..o1 наружу. tier 0 — подоконник (свой, меньший круг).
function boxer(out) {
  return (wl, tier, kind, ua, ub, y0, y1, o0, o1, c, rnd = 0) => {
    const um = (ua + ub) / 2, om = (o0 + o1) / 2;
    out.push(wl.ax + wl.dx * um + wl.nx * om, (y0 + y1) / 2, wl.az + wl.dz * um + wl.nz * om,
             wl.dx, wl.dz, (ub - ua) / 2, (y1 - y0) / 2, (o1 - o0) / 2,
             c[0], c[1], c[2], kind + rnd * 0.5, tier);
  };
}
const mul = (c, k, a = 0) => [Math.min(1, c[0] * k + a), Math.min(1, c[1] * k + a), Math.min(1, c[2] * k + a)];
const SILL = [0.80, 0.79, 0.77];
const CONC = [0.50, 0.50, 0.48];

function details(ser) {
  const out = [], box = boxer(out);
  const { yFloor, yTop, yBase, wall } = ser.f;
  const Hb = yTop - yFloor;
  const R8 = enc(wall[0]), G8 = enc(wall[1]);
  const cl = [R8 / 255, G8 / 255, enc(wall[2]) / 255];        // цвет стены, как его видит шейдер
  const bs = hash21(R8, G8);
  const gate = ser.b ? gateOf(ser.b) : null;
  for (const w of ser.walls) {
    const wl = { ax: w.ax, az: w.az, dx: (w.bx - w.ax) / w.l, dz: (w.bz - w.az) / w.l };
    wl.nx = wl.dz; wl.nz = -wl.dx;
    const s = w.l / (w.u1 - w.u0);                             // растяжка сетки под длину стены
    const at = u => (u - w.u0) * s;                             // метры по стене от угла A
    const cut = gate && gateCut(gate, w.i, w.ax, w.az, w.bx, w.bz, w.l);
    const inCut = (ua, ub, y) => cut && ub > cut[0] - 0.3 && ua < cut[1] + 0.3 && y < yFloor + gate.H + 0.6;
    const fk = fract(w.kind), blank = fk >= 0.8;
    if (ser.code === 's') stalinka(ser, w, wl, s, at, cut, inCut, blank, Hb, yFloor, yBase, cl, box);
    else panelHouse(ser, w, wl, s, at, inCut, blank, fk, Hb, yFloor, yTop, cl, bs, box);
  }
  return new Float32Array(out);
}

// хрущёвка (14) и девятиэтажка (16) — ветка vKind > 13.5 в materials.js
function panelHouse(ser, w, wl, s, at, inCut, blank, fk, Hb, yFloor, yTop, cl, bs, box) {
  const p9 = ser.code === 'p';
  // парапет со сливом поверху — у всех стен, торцы тоже; концы с напуском на угол
  box(wl, 1, SOLID, -0.12, w.l + 0.12, yTop - 0.16, yTop + 0.05, 0, 0.12, mul(cl, 1.08, 0.03));
  if (blank) return;
  const S = Math.floor(fk * 16 + 0.5);
  const B = ser.bay;
  const top = Hb - 1.2;
  const nf = Math.max(1, Math.floor(top / 3.2 + 0.5)), fh = top / nf;
  const b0 = Math.round(w.u0 / B), b1 = Math.round(w.u1 / B);
  const sB = f(bs * 17), sR = f(bs * 5);
  for (let bi = b0; bi < b1; bi++) {
    const ua = at(bi * B), ub = at((bi + 1) * B), bw = ub - ua, um = (ua + ub) / 2;
    const stair = S > 0 && Math.abs(gmod(bi, S) - Math.floor(S * 0.5)) < 0.5;
    if (stair) {
      // окна площадок — в полэтажа выше; на земле — дверь, у неё козырёк (series.js)
      for (let k = 0; k <= nf - 2; k++) {
        const y = yFloor + (k + 0.8) * fh;
        if (inCut(ua, ub, y)) continue;
        const hw = 0.16 * bw + 0.05;
        box(wl, 0, SOLID, um - hw, um + hw, y - 0.05, y, 0, 0.13, SILL);
      }
      continue;
    }
    const wide = gmod(bi, 2) >= 0.5;
    const hw = (wide ? 0.28 : 0.20) * bw + 0.05;
    const rc = hash21(bi + sB, 4 + sB);
    const stack = rc >= 0.55;                                     // стояк балконов / лоджий
    for (let fi = 0; fi < nf; fi++) {
      const y = yFloor + fi * fh;
      if (inCut(ua, ub, y)) continue;
      const rk = hash21(bi + sR, fi + sR);
      const ys = y + 0.32 * fh;
      if (!(stack && fi >= 1)) { box(wl, 0, SOLID, um - hw, um + hw, ys - 0.05, ys, 0, 0.13, SILL); continue; }
      if (p9) {
        // лоджия: экран ограждения заподлицо с проёмом, под ним торец плиты
        box(wl, 1, SOLID, at((bi + 0.03) * B), at((bi + 0.97) * B), y - 0.13, y + 0.01, 0, 0.14, mul(cl, 0.86));
        box(wl, 1, SOLID, at((bi + 0.06) * B), at((bi + 0.94) * B), y + 0.01, y + 0.36 * fh, 0, 0.09, mul(cl, 1 + 0.10 * rk));
        // застеклённая лоджия — рама во весь проём над экраном
        if (fract(rk * 5.1) >= 0.62)
          box(wl, 1, GLASS, at((bi + 0.06) * B), at((bi + 0.94) * B), y + 0.36 * fh, y + 0.97 * fh, 0, 0.05, [0.9, 0.9, 0.88], fract(rk * 13.7));
        continue;
      }
      // окно (балконная дверь) за балконом — со своим отливом
      box(wl, 0, SOLID, um - hw, um + hw, ys - 0.05, ys, 0, 0.13, SILL);
      // хрущёвка: плита на консолях и ограждение — решётка, профлист или
      // остеклённая рама, у каждой квартиры своё (как в шейдере)
      const sa = at((bi + 0.08) * B), sb = at((bi + 0.92) * B), D = 0.95;
      box(wl, 1, SOLID, sa, sb, y - 0.10, y + 0.03, 0, D + 0.04, CONC);
      let rcol, rkind = SOLID;
      if (rk < 0.4) { rcol = [0.70 * 0.55 + cl[0] * 0.2, 0.70 * 0.55 + cl[1] * 0.2, 0.68 * 0.55 + cl[2] * 0.2]; rkind = BARS; }
      else if (rk < 0.75) rcol = fract(rk * 7.3) >= 0.6 ? [0.55, 0.40, 0.30] : [0.62, 0.64, 0.62];
      else rcol = [0.86, 0.86, 0.84];
      const ra = at((bi + 0.10) * B), rb = at((bi + 0.90) * B), yr = y + 0.33 * fh;
      box(wl, 1, rkind, ra, rb, y + 0.03, yr, D - 0.04, D, rcol);
      box(wl, 1, rkind, ra, ra + 0.04, y + 0.03, yr, 0.02, D - 0.04, rcol);
      box(wl, 1, rkind, rb - 0.04, rb, y + 0.03, yr, 0.02, D - 0.04, rcol);
      if (fract(rk * 3.7) >= 0.6) {
        // остеклённый: рама от ограждения до плиты следующего этажа
        const yg = y + 0.97 * fh, lit = fract(rk * 13.7);
        box(wl, 1, GLASS, ra, rb, yr, yg, D - 0.05, D - 0.01, [0.9, 0.9, 0.88], lit);
        box(wl, 1, GLASS, ra, ra + 0.04, yr, yg, 0.02, D - 0.05, [0.9, 0.9, 0.88], lit);
        box(wl, 1, GLASS, rb - 0.04, rb, yr, yg, 0.02, D - 0.05, [0.9, 0.9, 0.88], lit);
        // на последнем этаже над ним нет плиты — своя кровелька
        if (fi === nf - 1) box(wl, 1, SOLID, sa, sb, yg, yg + 0.08, 0, D + 0.06, CONC);
      }
    }
  }
}

// сталинка (15) — общий фасад materials.js с поправкой stal
function stalinka(ser, w, wl, s, at, cut, inCut, blank, Hb, yFloor, yBase, cl, box) {
  const L = w.l;
  // карниз: полка с выносом и ступень под ней — там, где шейдер рисует тень
  box(wl, 1, SOLID, -0.45, L + 0.45, yFloor + Hb - 0.55, yFloor + Hb - 0.28, 0, 0.45, mul(cl, 1.10, 0.02));
  box(wl, 1, SOLID, -0.22, L + 0.22, yFloor + Hb - 0.88, yFloor + Hb - 0.55, 0, 0.22, mul(cl, 0.97));
  const nf = Math.max(1, Math.floor(Hb / 3.3 + 0.35)), fh = Hb / nf;
  // рустованный цоколь до низа витрин и тяга над первым этажом; у арки-проезда
  // цоколь рвётся. Ниже 1.15 м под отметкой шейдер рисует окна полуподвала
  // (материалы, «цоколь») — их не закрываем, там камень остаётся в плоскости.
  const segs = cut ? [[0, cut[0]], [cut[1], L]] : [[0, L]];
  const yp = Math.max(yBase, yFloor - 1.15);
  for (const [a, b] of segs) if (b - a > 0.3) box(wl, 1, RUST, a - 0.07, b + 0.07, yp, yFloor + 0.26, 0, 0.07, mul(cl, 0.80));
  if (nf >= 2) for (const [a, b] of segs) if (b - a > 0.3) box(wl, 1, SOLID, a - 0.09, b + 0.09, yFloor + fh - 0.05, yFloor + fh + 0.10, 0, 0.09, mul(cl, 1.04));
  if (blank) return;
  const B = ser.bay;
  const b0 = Math.round(w.u0 / B), b1 = Math.round(w.u1 / B);
  for (let bi = b0; bi < b1; bi++) {
    const ua = at(bi * B), ub = at((bi + 1) * B), bw = ub - ua, um = (ua + ub) / 2;
    for (let fi = 1; fi < nf; fi++) {
      const top = fi >= nf - 1.5 ? 1 : 0;
      const x0 = 0.27 + 0.05 * top, x1 = 0.73 - 0.05 * top, y0 = 0.20 + 0.03 * top;
      const y = yFloor + (fi + y0) * fh;
      if (y - yFloor > Hb - 1.0 || inCut(ua, ub, y)) continue;   // под карнизом окна нет
      const hw = (x1 - x0) * bw / 2 + 0.08;
      box(wl, 0, SOLID, um - hw, um + hw, y - 0.07, y, 0, 0.11, mul(cl, 1.06, 0.02));
    }
  }
}

// ---- сцена ----
function geometry() {
  // единичный куб без задней грани (она прижата к стене)
  const g = new THREE.BoxGeometry(1, 1, 1);
  const idx = g.index.array, keep = [];
  for (const gr of g.groups) if (gr.materialIndex !== 5) for (let i = gr.start; i < gr.start + gr.count; i++) keep.push(idx[i]);
  g.setIndex(keep);
  g.clearGroups();
  g.deleteAttribute('uv');
  return g;
}

function material() {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  mat.customProgramCacheKey = () => 'sev-facade';
  mat.onBeforeCompile = sh => {
    sh.uniforms.uNight = ENV.uNight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aDet; varying float vDet; varying vec3 vLoc; varying vec3 vSize; varying float vWY;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vDet = aDet;
        vSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vLoc = position * vSize;
        vWY = (modelMatrix * instanceMatrix * vec4(position, 1.0)).y;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNight; varying float vDet; varying vec3 vLoc; varying vec3 vSize; varying float vWY;
        float fh21(vec2 p){ p = fract(p * vec2(127.1, 311.7)); p += dot(p, p + 34.56); return fract(p.x * p.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float fRough = 0.85; vec3 fEmit = vec3(0.0);
        {
          float kind = floor(vDet), rnd = fract(vDet) * 2.0;
          // координата вдоль длинной горизонтальной стороны: у боковин — глубина
          float u = vSize.x >= vSize.z ? vLoc.x : vLoc.z;
          float hu = max(vSize.x, vSize.z) * 0.5, hy = vSize.y * 0.5;
          if (kind > 2.5) {
            // руст: блоки инкерманского камня 0.92 x 0.46 вразбежку
            vec2 blk = vec2(u / 0.92, vWY / 0.46);
            blk.x += step(0.5, fract(blk.y * 0.5)) * 0.5;
            vec2 fb = abs(fract(blk) - 0.5);
            diffuseColor.rgb *= (1.0 - 0.34 * smoothstep(0.40, 0.48, max(fb.x, fb.y)))
                              * (0.95 + 0.10 * fh21(floor(blk)));
          } else if (kind > 1.5) {
            // решётка ограждения: поручень, нижний пояс и прутья через 12 см
            float bar = step(0.36, abs(fract(u / 0.12) - 0.5));
            float rail = step(hy - 0.05, vLoc.y) + step(vLoc.y, -hy + 0.05) + step(hu - 0.03, abs(u));
            if (bar + rail < 0.5) discard;
          } else if (kind > 0.5) {
            // стекло в белой раме: створки по 0.7 м, импост
            float fu = abs(fract(u / 0.7 + 0.5) - 0.5) * 0.7;
            float frame = max(step(fu, 0.03), max(step(hu - 0.05, abs(u)), step(hy - 0.05, abs(vLoc.y))));
            float gy = clamp(vLoc.y / max(vSize.y, 0.01) + 0.5, 0.0, 1.0);
            vec3 glass = mix(vec3(0.07, 0.085, 0.10), vec3(0.22, 0.26, 0.29), gy);
            diffuseColor.rgb = mix(glass, diffuseColor.rgb, frame);
            fRough = mix(0.14, 0.7, frame);
            if (uNight > 0.01) fEmit = vec3(1.0, 0.74, 0.42) * step(rnd, uNight * 0.6) * uNight * (1.0 - frame) * 0.8;
          }
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = fRough;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += fEmit;');
  };
  return mat;
}

export class Facades {
  constructor(scene) {
    const geo = geometry();
    this.det = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    this.det.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aDet', this.det);
    this.mesh = new THREE.InstancedMesh(geo, material(), MAX);
    this.mesh.name = 'фасады';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;         // детали вокруг камеры: сфера у них — весь круг
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.marks = new Set();                  // метки чанков со списком домов
    this.cache = new Map();                  // id дома → детали (Float32Array)
    this.lx = Infinity; this.lz = Infinity; this.ly = Infinity;
    this.dirty = false;
    this.stats = { houses: 0, shown: 0, radius: 0 };
    this._m = new THREE.Matrix4();
  }

  // Метка чанка: дома серий, собранные buildBuildings этого чанка. Метка
  // живёт в группе чанка — выгрузили чанк, ушла и она.
  chunk(w, skip) {
    const list = [];
    w.buildings.forEach((b, i) => {
      if ((skip && skip.has(i)) || !b.id) return;
      const ser = BUILT.get(b.id);
      if (!ser) return;
      BUILT.delete(b.id);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      const p = b.poly;
      for (let k = 0; k < p.length; k += 2) {
        if (p[k] < x0) x0 = p[k]; if (p[k] > x1) x1 = p[k];
        if (p[k + 1] < z0) z0 = p[k + 1]; if (p[k + 1] > z1) z1 = p[k + 1];
      }
      ser.cx = (x0 + x1) / 2; ser.cz = (z0 + z1) / 2; ser.r = Math.hypot(x1 - x0, z1 - z0) / 2;
      list.push(ser);
    });
    const m = new THREE.Object3D();
    m.name = 'фасады: дома';
    m.userData.facades = list;
    if (list.length) { this.marks.add(m); this.dirty = true; }
    return m;
  }

  update(cam) {
    const p = cam.position;
    const moved = Math.hypot(p.x - this.lx, p.y - this.ly, p.z - this.lz) > STEP;
    if (!moved && !this.dirty) return;
    // метки выгруженных чанков: группа снята со сцены
    for (const m of this.marks) {
      let r = m; while (r.parent) r = r.parent;
      if (!r.isScene) { this.marks.delete(m); this.dirty = true; }
    }
    this.lx = p.x; this.ly = p.y; this.lz = p.z; this.dirty = false;
    this.fill(p);
  }

  fill(p) {
    const seen = new Set(), houses = [];
    for (const m of this.marks) for (const ser of m.userData.facades) {
      if (seen.has(ser.id)) continue;                     // дом на шве лежит в двух чанках
      seen.add(ser.id);
      const d = Math.hypot(ser.cx - p.x, ser.cz - p.z) - ser.r;
      if (d < NEAR + 10) houses.push(ser);
      else if (d > NEAR + 250) this.cache.delete(ser.id);
    }
    // кандидаты: индекс детали в кеше и расстояние
    const cand = [];
    for (const ser of houses) {
      let a = this.cache.get(ser.id);
      if (!a) this.cache.set(ser.id, a = details(ser));
      for (let o = 0; o < a.length; o += F) {
        const d = Math.hypot(a[o] - p.x, a[o + 1] - p.y, a[o + 2] - p.z);
        if (d < (a[o + 12] < 0.5 ? NEAR_SILL : NEAR)) cand.push(d, a, o);
      }
    }
    let n = cand.length / 3, R = NEAR;
    let order = null;
    if (n > MAX) {
      // не влезает — оставляем ближние, круг для шейдера сужается
      order = Array.from({ length: n }, (_, i) => i).sort((i, j) => cand[i * 3] - cand[j * 3]);
      n = MAX;
      R = cand[order[n - 1] * 3];
    }
    const M = this._m, mi = this.mesh.instanceMatrix.array, ci = this.mesh.instanceColor.array, di = this.det.array;
    const e = M.elements;
    for (let k = 0; k < n; k++) {
      const i = order ? order[k] : k;
      const a = cand[i * 3 + 1], o = cand[i * 3 + 2];
      const dx = a[o + 3], dz = a[o + 4], sx = a[o + 5] * 2, sy = a[o + 6] * 2, sz = a[o + 7] * 2;
      // базис правый: x — против хода стены, z — наружу (dz, −dx)
      e[0] = -dx * sx; e[1] = 0; e[2] = -dz * sx; e[3] = 0;
      e[4] = 0; e[5] = sy; e[6] = 0; e[7] = 0;
      e[8] = dz * sz; e[9] = 0; e[10] = -dx * sz; e[11] = 0;
      e[12] = a[o]; e[13] = a[o + 1]; e[14] = a[o + 2]; e[15] = 1;
      mi.set(e, k * 16);
      ci[k * 3] = a[o + 8]; ci[k * 3 + 1] = a[o + 9]; ci[k * 3 + 2] = a[o + 10];
      di[k] = a[o + 11];
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.det.needsUpdate = true;
    // шейдер дома прячет нарисованные балконы ближе этого круга
    ENV.uFacadeR.value = n > 0 ? R : 0;
    this.stats.houses = houses.length; this.stats.shown = n; this.stats.radius = Math.round(R);
  }
}
