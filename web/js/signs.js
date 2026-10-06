import * as THREE from 'three';
import { ENV } from './env.js?v=5ecfe1f7';
import { buildShopfronts } from './shopfronts.js?v=5ecfe1f7';

// Вывески заведений на фасадах. Названия — из OSM (data/shops.json), ничего
// не выдумано. Каждая вывеска — один квад с ячейкой атласа: в ячейке уже
// нарисована и подложка нужного цвета, и текст, так что геометрии минимум.

const CELL_W = 256, CELL_H = 32;          // пиксели ячейки, соотношение 8:1
const SHEET = 2048;
const COLS = SHEET / CELL_W, ROWS = SHEET / CELL_H, PER = COLS * ROWS;

// Цвет подложки по типу заведения. Шесть-семь различимых семейств —
// с двадцати метров больше и не разобрать.
const COLORS = {
  cinema:    ['#2b1a4d', '#f4d35e'],
  theatre:   ['#4a1526', '#f2e2c4'],
  mall:      ['#123a5c', '#ffffff'],
  bank:      ['#0d3b2e', '#e8f3ec'],
  pharmacy:  ['#0a5c3a', '#ffffff'],
  health:    ['#12506b', '#ffffff'],
  food:      ['#7a1d16', '#ffe9c9'],
  food_shop: ['#8a4a08', '#fff3dd'],
  hotel:     ['#243b53', '#f0e3c2'],
  museum:    ['#3d3327', '#f3e6cd'],
  fuel:      ['#1b3f6b', '#ffd54a'],
  sport:     ['#1d4d3a', '#ffffff'],
  office:    ['#334155', '#e2e8f0'],
  shop:      ['#5b2b6b', '#ffffff'],
  school:    ['#1b3a63', '#ffffff'],
  church:    ['#4a2018', '#f0d9a8'],
  civic:     ['#2f3a2b', '#f2efe4'],
};

// Сети — узнаваемыми фирменными цветами. Ищем по началу названия из OSM
// (тег name), логотипов не рисуем: только подложка и буквы в цвет сети.
// Записаны лишь федеральные сети с общеизвестными цветами. Местные (ПУД,
// Яблоко, РНКБ, Генбанк, Атан-маркет) — пока цветом своего типа: их цвета
// владелец сверит по панорамам и впишет сюда же.
const BRANDS = [
  [/^(пвз )?wildberries/i, ['#8b1fa9', '#ffffff']],
  [/^ozon\b/i,              ['#005bff', '#ffffff']],
  [/^сдэк/i,                ['#1ab248', '#ffffff']],
  [/^(dns|днс)\b/i,         ['#f07d00', '#ffffff']],
  [/^сбер/i,                ['#21a038', '#ffffff']],
  [/^мтс\b/i,               ['#e30611', '#ffffff']],
  [/^магнит\b/i,            ['#e30613', '#ffffff']],
];
export function signColors(s) {
  for (const [re, col] of BRANDS) if (re.test(s.n)) return col;
  return COLORS[s.c] || COLORS.shop;
}

// Высота листа — по числу занятых строк (степень двойки), а не всегда 2048:
// в квартале обычно десяток-другой вывесок, это три строки из шестидесяти
// четырёх, а лист 2048² с мипмапами — 21 МБ видеопамяти на квартал и долгая
// выгрузка в кадре показа. Тридцать кварталов держали так ~600 МБ.
const sheetRows = count => {
  let h = CELL_H;
  while (h < Math.ceil(count / COLS) * CELL_H) h *= 2;
  return Math.min(h, SHEET) / CELL_H;
};

function sheetTexture(names, from, count) {
  const cv = document.createElement('canvas');
  cv.width = SHEET; cv.height = sheetRows(count) * CELL_H;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < count; i++) {
    const s = names[from + i];
    const cx = (i % COLS) * CELL_W, cy = ((i / COLS) | 0) * CELL_H;
    const [bg, fg] = signColors(s);
    // подложка со скруглением и светлой рамкой
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect(cx + 1, cy + 1, CELL_W - 2, CELL_H - 2, 4);
    g.fill();
    g.strokeStyle = fg; g.globalAlpha = 0.42; g.lineWidth = 1.5;
    g.beginPath();
    g.roundRect(cx + 3.5, cy + 3.5, CELL_W - 7, CELL_H - 7, 3);
    g.stroke();
    g.globalAlpha = 1;
    // название: ужимаем, пока не влезет
    let size = 21;
    do { g.font = `700 ${size}px "Helvetica Neue", Arial, sans-serif`; size -= 1; }
    while (g.measureText(s.n).width > CELL_W - 22 && size > 8);
    g.fillStyle = fg;
    g.fillText(s.n, cx + CELL_W / 2, cy + CELL_H / 2 + 1);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Ночью вывеска подсвечена: днём 0.30 свечения (чтобы читалась в тени),
// к ночи — вчетверо ярче, как короб с лампами внутри.
const SIGN_NIGHT = sh => {
  sh.uniforms.uNight = ENV.uNight;
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uNight;')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= 1.0 + 3.0 * uNight;');
};

export function buildSigns(world, terrain, roadIndex) {
  const group = new THREE.Group();
  group.name = 'signs';

  // 1. Для каждого дома с вывесками ищем стену, смотрящую на проезжую улицу.
  //    Раньше я брал самую длинную — вывеска уезжала в глухой двор.
  const items = [];
  for (const b of world.buildings) {
    if (!b.sg || !b.sg.length) continue;
    if (b.fuelBox) continue;            // коробка АЗС снята моделью сети (fuel.js) — вывеска повисла бы в воздухе
    const p = b.poly, n = p.length / 2;
    let best = null;
    // Стена задана руками: у гимназии табличка должна висеть на том же фасаде,
    // что и колонны, а «ближайшая к дороге» уводила её за угол.
    if (b.sw) {
      const [ax0, az0, ax1, az1] = b.sw;
      const ddx = ax1 - ax0, ddz = az1 - az0;
      const len0 = Math.hypot(ddx, ddz) || 1;
      let nx0 = ddz / len0, nz0 = -ddx / len0;
      let cx0 = 0, cz0 = 0;
      for (let k = 0; k < n; k++) { cx0 += p[k * 2]; cz0 += p[k * 2 + 1]; }
      cx0 /= n; cz0 /= n;
      const mx0 = (ax0 + ax1) / 2, mz0 = (az0 + az1) / 2;
      if (nx0 * (cx0 - mx0) + nz0 * (cz0 - mz0) > 0) { nx0 = -nx0; nz0 = -nz0; }
      best = { score: -1e9, ax: ax0, az: az0, dx: ddx, dz: ddz, len: len0, nx: nx0, nz: nz0 };
    }
    for (let i = 0; !b.sw && i < n; i++) {
      const j = (i + 1) % n;
      const ax = p[i * 2], az = p[i * 2 + 1];
      const bx = p[j * 2], bz = p[j * 2 + 1];
      const dx = bx - ax, dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 3.2) continue;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const nx = dz / len, nz = -dx / len;         // нормаль ребра
      for (const s of [1, -1]) {
        const qx = mx + nx * s * 5, qz = mz + nz * s * 5;
        const hit = roadIndex.nearest(qx, qz, 60, r => r.c <= 3);
        if (!hit) continue;
        const score = hit.dist - len * 0.08;       // ближе к улице и подлиннее
        if (!best || score < best.score)
          best = { score, ax, az, dx, dz, len, nx: nx * s, nz: nz * s };
      }
    }
    if (!best) continue;

    // Отметка первого этажа — как в buildBuildings (worldgen.js): самая
    // высокая земля у стен с шагом 2 м; ниже неё у дома каменный цоколь.
    // От неё и считаем вывеску с витриной: от земли у самой вывески на
    // склоне витрина вставала перед цоколем, а вывеска уходила под этаж.
    let gmax = -Infinity;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = p[i * 2], az = p[i * 2 + 1];
      const ex = p[j * 2] - ax, ez = p[j * 2 + 1] - az;
      const k = Math.max(1, Math.ceil(Math.hypot(ex, ez) / 2));
      for (let s = 0; s < k; s++) {
        const h = terrain.gridHeightAt(ax + ex * s / k, az + ez * s / k);
        if (h > gmax) gmax = h;
      }
    }
    const top = gmax + b.h;
    const k = Math.min(b.sg.length, Math.max(1, Math.floor(best.len / 4.2)));
    for (let i = 0; i < k; i++) {
      const t = (i + 0.5) / k;
      const cx = best.ax + best.dx * t, cz = best.az + best.dz * t;
      const g = gmax;
      // Вывеска, прибитая к стене руками, — это имя здания, а не ларёк:
      // делаем её крупнее, иначе с улицы её просто не прочесть.
      let w = Math.min(b.sw ? 8.4 : 5.4, best.len * 0.88 / k);
      let h = w / 8;
      // вывеска сидит над витриной, но не выше карниза
      let y = g + (b.sw ? 4.6 : 3.55);
      if (top - g < 4.6) { y = g + (top - g) * 0.70; w = Math.min(w, 4.2); h = w / 8; }
      if (y + h / 2 > top - 0.35) y = top - 0.35 - h / 2;
      if (y - h / 2 < g + 1.9) continue;           // на цоколь вывеску не вешаем
      items.push({ s: b.sg[i], cx, cz, y, w, h, hand: !!b.sw, floor: g,
                   dx: best.dx / best.len, dz: best.dz / best.len,
                   nx: best.nx, nz: best.nz });
    }
  }

  // 2. Атлас: по 512 названий на лист 2048×2048
  const names = items.map(o => o.s);
  const sheets = Math.ceil(names.length / PER);
  for (let sh = 0; sh < sheets; sh++) {
    const from = sh * PER, count = Math.min(PER, names.length - from);
    const tex = sheetTexture(names, from, count);
    const rows = sheetRows(count);
    const P = [], N = [], U = [], I = [];
    let v = 0;
    for (let i = 0; i < count; i++) {
      const o = items[from + i];
      const hx = o.dx * o.w / 2, hz = o.dz * o.w / 2;
      const ox = o.nx * 0.12, oz = o.nz * 0.12;    // чуть вынести из стены
      const y0 = o.y - o.h / 2, y1 = o.y + o.h / 2;
      const A = [o.cx - hx + ox, y0, o.cz - hz + oz];
      const B = [o.cx + hx + ox, y0, o.cz + hz + oz];
      const C = [o.cx + hx + ox, y1, o.cz + hz + oz];
      const D = [o.cx - hx + ox, y1, o.cz - hz + oz];
      P.push(...A, ...B, ...C, ...D);
      for (let q = 0; q < 4; q++) N.push(o.nx, 0, o.nz);
      const col = i % COLS, row = (i / COLS) | 0;
      const u0 = col / COLS, u1 = (col + 1) / COLS;
      const t1 = 1 - row / rows, t0 = 1 - (row + 1) / rows;
      // u идёт справа налево: лицевая сторона квада смотрит наружу, и при
      // прямых координатах название читалось задом наперёд.
      U.push(u1, t0, u0, t0, u0, t1, u1, t1);
      // Обход разворачиваем: при прямом лицевая сторона квада смотрит В дом,
      // и вывеска читалась зеркально изнутри двора, просвечивая сквозь стену.
      I.push(v, v + 2, v + 1, v, v + 3, v + 2);
      v += 4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    geo.setIndex(I);
    geo.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, alphaTest: 0.35, side: THREE.FrontSide,
      roughness: 0.55, metalness: 0.0,
      emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.30,
    });
    mat.onBeforeCompile = SIGN_NIGHT;
    mat.customProgramCacheKey = () => 'sign';
    group.add(new THREE.Mesh(geo, mat));
  }
  // витрины и маркизы под вывесками (shopfronts.js) — одна сетка на квартал
  const fronts = buildShopfronts(items, signColors);
  if (fronts) group.add(fronts);
  group.userData.count = items.length;
  return group;
}
