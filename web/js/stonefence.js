import * as THREE from 'three';

// Заборы из серого полигонального камня с белыми столбами и кованой решёткой
// (data/stonefence.json). В OSM у частных участков нет ни линий заборов, ни
// границ, поэтому ставим только то, что видно на фото владельца: первый —
// участок Катерная, 28 (п. 41, refs/places/katernaya-villas/).
//
// Забор — ломаная line (x, z, …) с калитками gates (станция s по ломаной от
// первой вершины, ширина w, высота h). Столбы — на концах, в изломах, по
// бокам калитки и между ними с шагом не больше step. Пролёт между столбами —
// каменная стена wall м над землёй (низ уходит под откос) и решётка grille
// поверх неё; верх стены ступенькой по пролёту, как у настоящих заборов на
// склоне. Камень — один общий холст «колотой кладки» (ячейки Вороного), белое и
// железо — цветом вершин: на квадрат два вызова отрисовки.
// Строит забор один квадрат — тот, в чьих границах первая вершина.

let FENCES = [];

export async function loadStoneFences(v) {
  FENCES = await fetch(`../data/stonefence.json${v ? '?v=' + v : ''}`)
    .then(r => r.ok ? r.json() : []).catch(() => []);
  return FENCES;
}

function ownTest(world) {
  const ctx = world.roads && world.roads.ctx;
  if (!FENCES.length || !ctx || ctx.orphan || ctx.x1 === undefined) return null;
  return (x, z) => x >= ctx.x0 && x < ctx.x1 && z >= ctx.z0 && z < ctx.z1;
}

// Разбивка ломаной на пролёты: [{ ax, az, bx, bz, gate }]
function bays(f) {
  const p = f.line, step = f.step || 3.4, out = [];
  const gates = (f.gates || []).slice().sort((a, b) => a.s - b.s);
  let s0 = 0;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const ax = p[i], az = p[i + 1], dx = p[i + 2] - ax, dz = p[i + 3] - az, L = Math.hypot(dx, dz);
    if (L < 0.05) continue;
    const ux = dx / L, uz = dz / L;
    // станции разрезов на этом отрезке: края калиток (столбы ворот)
    const cuts = [0];
    const gs = [];
    for (const g of gates) {
      const a = g.s - g.w / 2 - s0, b = g.s + g.w / 2 - s0;
      if (a > 0.3 && b < L - 0.3) { cuts.push(a, b); gs.push([a, b, g]); }
    }
    cuts.push(L);
    for (let k = 0; k + 1 < cuts.length; k++) {
      const c0 = cuts[k], c1 = cuts[k + 1];
      const gate = gs.find(([a, b]) => Math.abs(a - c0) < 1e-6 && Math.abs(b - c1) < 1e-6);
      const n = gate ? 1 : Math.max(1, Math.round((c1 - c0) / step));
      for (let j = 0; j < n; j++) {
        const t0 = c0 + (c1 - c0) * j / n, t1 = c0 + (c1 - c0) * (j + 1) / n;
        out.push({ ax: ax + ux * t0, az: az + uz * t0, bx: ax + ux * t1, bz: az + uz * t1, ux, uz,
          gate: gate ? gate[2] : null });
      }
    }
    s0 += L;
  }
  return out;
}

// Машину держит весь забор, калитка закрыта: тонкий прямоугольник на пролёт.
export function stoneFenceWalls(world) {
  const own = ownTest(world);
  if (!own) return [];
  const walls = [];
  for (const f of FENCES) {
    if (!own(f.line[0], f.line[1])) continue;
    const t = (f.thick || 0.45) / 2;
    for (const b of bays(f)) {
      const nx = -b.uz * t, nz = b.ux * t;
      walls.push({ poly: [b.ax + nx, b.az + nz, b.bx + nx, b.bz + nz, b.bx - nx, b.bz - nz, b.ax - nx, b.az - nz] });
    }
  }
  return walls;
}

// ---- холст кладки: ячейки Вороного на торе (бесшовно), серые камни разного
// тона, тёмный шов там, где две ближайшие точки почти на равном расстоянии
let STONE = null;
function stoneTexture() {
  if (STONE) return STONE;
  const N = 256, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const cx = cv.getContext('2d'), img = cx.createImageData(N, N);
  let seed = 41;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const P = [];
  for (let i = 0; i < 46; i++) P.push([rnd() * N, rnd() * N, 0.46 + rnd() * 0.26, 0.03 + rnd() * 0.03]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let d1 = 1e9, d2 = 1e9, c = null;
    for (const p of P) {
      let dx = Math.abs(x - p[0]), dy = Math.abs(y - p[1]);
      if (dx > N / 2) dx = N - dx;
      if (dy > N / 2) dy = N - dy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < d1) { d2 = d1; d1 = d; c = p; } else if (d < d2) d2 = d;
    }
    const joint = d2 - d1 < 2.2;
    const g = joint ? 0.30 : c[2] - Math.min(d1, 18) * 0.004;
    const k = (y * N + x) * 4;
    // серый с лёгкой голубизной, как сланец на фото
    img.data[k] = Math.round((g - c[3]) * 255);
    img.data[k + 1] = Math.round(g * 255);
    img.data[k + 2] = Math.round((g + c[3]) * 255);
    img.data[k + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.userData.shared = true;               // общий на все квадраты — выгрузка его не трогает
  STONE = tex;
  return tex;
}

const s2l = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const WHITE = [0.90, 0.90, 0.87].map(s2l), CAP = [0.84, 0.84, 0.81].map(s2l),
      IRON = [0.07, 0.07, 0.075].map(s2l), STONEC = [1, 1, 1];
const UVM = 2.6;                            // метров камня на повтор холста

// Сетка из повёрнутых брусков: позиция, нормаль, цвет, uv (u — вдоль, в м).
function Mesher() {
  const P = [], N = [], C = [], U = [];
  const quad = (a, b, c, d, n, col, uv) => {
    // обход — лицом по нормали n (материал односторонний)
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    if ((uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2] < 0) {
      [b, d] = [d, b]; uv = [uv[0], uv[3], uv[2], uv[1]];
    }
    for (const [v, t] of [[a, uv[0]], [b, uv[1]], [c, uv[2]], [a, uv[0]], [c, uv[2]], [d, uv[3]]]) {
      P.push(...v); N.push(...n); C.push(...col); U.push(t[0] / UVM, t[1] / UVM);
    }
  };
  // брус: от (ax, az) к (bx, bz) по оси, полутолщина t, y0..y1 (у начала и
  // конца можно разные низы — пролёт на склоне)
  const bar = (ax, az, bx, bz, t, y0, y1, col, top = true) => {
    const L = Math.hypot(bx - ax, bz - az) || 1, ux = (bx - ax) / L, uz = (bz - az) / L;
    const nx = -uz, nz = ux;
    const A = [ax + nx * t, az + nz * t], B = [bx + nx * t, bz + nz * t];
    const A2 = [ax - nx * t, az - nz * t], B2 = [bx - nx * t, bz - nz * t];
    const v = (q, y) => [q[0], y, q[1]];
    quad(v(A, y0), v(B, y0), v(B, y1), v(A, y1), [nx, 0, nz], col, [[0, y0], [L, y0], [L, y1], [0, y1]]);
    quad(v(B2, y0), v(A2, y0), v(A2, y1), v(B2, y1), [-nx, 0, -nz], col, [[L, y0], [0, y0], [0, y1], [L, y1]]);
    quad(v(A2, y0), v(A, y0), v(A, y1), v(A2, y1), [-ux, 0, -uz], col, [[0, y0], [2 * t, y0], [2 * t, y1], [0, y1]]);
    quad(v(B, y0), v(B2, y0), v(B2, y1), v(B, y1), [ux, 0, uz], col, [[0, y0], [2 * t, y0], [2 * t, y1], [0, y1]]);
    if (top) quad(v(A, y1), v(B, y1), v(B2, y1), v(A2, y1), [0, 1, 0], col, [[0, 0], [L, 0], [L, 2 * t], [0, 2 * t]]);
  };
  // столб квадратного сечения со стороной s, развёрнутый по (ux, uz)
  const post = (x, z, ux, uz, s, y0, y1, col) => bar(x - ux * s / 2, z - uz * s / 2, x + ux * s / 2, z + uz * s / 2, s / 2, y0, y1, col);
  const mesh = (name, mat) => {
    if (!P.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    const m = new THREE.Mesh(g, mat);
    m.name = name; m.castShadow = true; m.receiveShadow = true;
    return m;
  };
  return { bar, post, mesh, tris: () => P.length / 9 };
}

export function buildStoneFences(world, terrain) {
  const group = new THREE.Group();
  group.name = 'stonefence';
  const own = ownTest(world);
  if (!own) return group;
  // отметка — как у плитки plazas.js/paving.js: полотно с предохранителем, не ниже земли
  const H = (x, z) => {
    const g = terrain.gridHeightAt(x, z), d = terrain.driveHeightAt(x, z);
    return Math.max(d < g - 1.7 ? g - 1.7 : d > g + 1.1 ? g + 1.1 : d, g);
  };
  const S = Mesher(), M = Mesher();
  let n = 0;
  for (const f of FENCES) {
    if (!own(f.line[0], f.line[1])) continue;
    n++;
    const WALL = f.wall || 1.35, GR = f.grille || 0.6, T = (f.thick || 0.45) / 2;
    const PS = 0.42, PTOP = WALL + GR + 0.12;          // столб чуть выше решётки
    const list = bays(f);
    const posts = new Map();                            // столбы по точке — без дублей на стыках
    const addPost = (x, z, ux, uz, gate) => {
      const k = Math.round(x * 10) + ',' + Math.round(z * 10);
      const old = posts.get(k);
      if (!old || gate) posts.set(k, { x, z, ux, uz, gate: gate || (old && old.gate) });
    };
    for (const b of list) {
      const ya = H(b.ax, b.az), yb = H(b.bx, b.bz), ym = H((b.ax + b.bx) / 2, (b.az + b.bz) / 2);
      const y0 = Math.min(ya, yb) - 0.6;
      addPost(b.ax, b.az, b.ux, b.uz, b.gate);
      addPost(b.bx, b.bz, b.ux, b.uz, b.gate);
      // столбы съедают концы пролёта — стену и решётку ставим между их гранями
      const L = Math.hypot(b.bx - b.ax, b.bz - b.az), e = Math.min(PS / 2, L / 4);
      const ax = b.ax + b.ux * e, az = b.az + b.uz * e, bx = b.bx - b.ux * e, bz = b.bz - b.uz * e;
      if (b.gate) {
        // калитка: железная створка во весь проём, внизу глухая филёнка
        const g = b.gate, y = Math.min(ya, yb), hh = g.h || 2.35;
        M.bar(ax, az, bx, bz, 0.03, y + 0.05, y + 0.95, IRON);              // филёнка
        M.bar(ax, az, bx, bz, 0.04, y + hh - 0.06, y + hh, IRON);            // верхняя обвязка
        M.bar(ax, az, bx, bz, 0.04, y + 0.95, y + 1.0, IRON);
        const nb = Math.max(3, Math.round(L / 0.13));
        for (let i = 1; i < nb; i++) {
          const t = i / nb, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          // верх прутьев дугой: выше к середине створки
          const arc = Math.sin(Math.PI * t) * 0.28;
          M.post(x, z, b.ux, b.uz, 0.022, y + 1.0, y + hh - 0.3 + arc, IRON);
        }
        // кольцо-розетка посередине — четыре коротких бруска ромбом
        const cx = (ax + bx) / 2, cz = (az + bz) / 2, cy = y + 1.55, r = Math.min(0.28, L / 4);
        for (const [s1, h1, s2, h2] of [[-r, 0, 0, r], [0, r, r, 0], [r, 0, 0, -r], [0, -r, -r, 0]]) {
          const x1 = cx + b.ux * s1, z1 = cz + b.uz * s1, x2 = cx + b.ux * s2, z2 = cz + b.uz * s2;
          M.bar(x1, z1, x2, z2, 0.025, cy + Math.min(h1, h2) - 0.02, cy + Math.max(h1, h2) + 0.02, IRON);
        }
        continue;
      }
      // каменная стена: верх ступенькой по середине пролёта
      const top = ym + WALL;
      S.bar(ax, az, bx, bz, T, y0, top, STONEC);
      // белый поясок-слив по верху стены
      M.bar(ax, az, bx, bz, T + 0.03, top, top + 0.07, CAP);
      // решётка: нижний пояс, прутья с верхом «волной» (ниже к середине), верхний пояс
      const g0 = top + 0.07;
      M.bar(ax, az, bx, bz, 0.02, g0 + 0.06, g0 + 0.1, IRON);
      const nb = Math.max(3, Math.round(L / 0.14));
      let px = ax, pz = az, py = g0 + GR;
      for (let i = 1; i < nb; i++) {
        const t = i / nb, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const yt = g0 + GR - Math.sin(Math.PI * t) * 0.22;
        M.post(x, z, b.ux, b.uz, 0.02, g0 + 0.06, yt, IRON);
        // верхний пояс — ломаной по верхам прутьев
        M.bar(px, pz, x, z, 0.018, Math.min(py, yt) - 0.035, Math.max(py, yt), IRON, false);
        px = x; pz = z; py = yt;
      }
      M.bar(px, pz, bx, bz, 0.018, Math.min(py, g0 + GR) - 0.035, g0 + GR, IRON, false);
      // завитки: два кольца-ромба у середины пролёта
      for (const t of [0.33, 0.67]) {
        const cx = ax + (bx - ax) * t, cz = az + (bz - az) * t, cy = g0 + 0.28, r = 0.13;
        for (const [s1, h1, s2, h2] of [[-r, 0, 0, r], [0, r, r, 0], [r, 0, 0, -r], [0, -r, -r, 0]]) {
          const x1 = cx + b.ux * s1, z1 = cz + b.uz * s1, x2 = cx + b.ux * s2, z2 = cz + b.uz * s2;
          M.bar(x1, z1, x2, z2, 0.015, cy + Math.min(h1, h2) - 0.015, cy + Math.max(h1, h2) + 0.015, IRON, false);
        }
      }
    }
    // белые столбы с шапкой; у калитки — толще и выше
    for (const p of posts.values()) {
      const y = H(p.x, p.z), s = p.gate ? 0.55 : PS, top = y + (p.gate ? (p.gate.h || 2.35) + 0.3 : PTOP);
      M.post(p.x, p.z, p.ux, p.uz, s, y - 0.6, top, WHITE);
      M.post(p.x, p.z, p.ux, p.uz, s + 0.1, top, top + 0.08, CAP);
      M.post(p.x, p.z, p.ux, p.uz, s * 0.55, top + 0.08, top + 0.2, CAP);
    }
  }
  if (!n) return group;
  const stone = S.mesh('stonefence:камень', new THREE.MeshStandardMaterial({
    map: stoneTexture(), vertexColors: true, roughness: 0.92, metalness: 0 }));
  const rest = M.mesh('stonefence:столбы и решётка', new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.6, metalness: 0.15 }));
  if (stone) group.add(stone);
  if (rest) { rest.userData.far = 350; group.add(rest); }
  group.userData.counts = { заборы: n, тр: S.tris() + M.tris() };
  return group;
}
