// Карта города. Раньше весь Севастополь один раз рисовался в закадровый
// canvas, а миникарта была из него вырезкой. С полной картой так больше
// нельзя: мир вырос до 50 км по x (коридор трассы до Ялты) при 24 по z, и
// один растр на всё это — либо 400 МБ памяти, либо 6 см на пиксель, на
// которых улицы не видно.
//
// Поэтому карт теперь две:
//   • обзорная (клавиша Tab) — один растр всего мира, но с грубым шагом:
//     разрешение подбирается так, чтобы сторона не вылезла за 3200 пикселей;
//   • миникарта — рисуется ВЕКТОРОМ вокруг игрока каждый раз заново, из
//     пространственного индекса дальнего слоя. В окне 320 м это две сотни
//     объектов, восемь раз в секунду — дешевле, чем гигантский растр.
//
// Обе едят far.json: детальные чанки для карты не нужны и всё равно есть
// не везде.

const OVER_MAX = 3200;          // предел стороны обзорного растра, пикселей
const IDX_CELL = 256;           // ячейка пространственного индекса, метров

const COL = {
  land:   '#cfc8b8',
  sea:    '#254b5c',
  green:  '#7f9463',
  build:  '#a09684',
  road0:  '#f6f2e8',
  road2:  '#ece6d8',
  road3:  '#ddd6c6',
  path:   '#c6bda9',
  rail:   '#8d8474',
};

// bbox объекта по плоскому списку координат
function bbox(p) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i];
    if (p[i + 1] < z0) z0 = p[i + 1]; if (p[i + 1] > z1) z1 = p[i + 1];
  }
  return [x0, z0, x1, z1];
}

export function buildMap(far, terrain) {
  const b = far.meta?.bounds || worldBounds(far);
  const roads = far.roads || [], rail = far.rail || [];
  const green = far.green || [], builds = far.buildings || [];

  // ---- пространственный индекс: ячейка → объекты, которые её задевают
  const idx = new Map();
  const put = (p, o, kind) => {
    const [x0, z0, x1, z1] = bbox(p);
    for (let cx = Math.floor(x0 / IDX_CELL); cx <= Math.floor(x1 / IDX_CELL); cx++)
      for (let cz = Math.floor(z0 / IDX_CELL); cz <= Math.floor(z1 / IDX_CELL); cz++) {
        const k = cx * 100003 + cz;
        let a = idx.get(k); if (!a) idx.set(k, a = []);
        a.push({ o, kind });
      }
  };
  for (const o of green) put(o.poly, o, 'green');
  for (const o of rail) put(o.pts, o, 'rail');
  for (const o of roads) put(o.pts, o, 'road');
  for (const o of builds) put(o.poly, o, 'build');

  // ---- обзорный растр всего мира
  const wm = b.maxX - b.minX, hm = b.maxZ - b.minZ;
  const px = Math.min(0.42, OVER_MAX / Math.max(wm, hm));
  const W = Math.max(1, Math.round(wm * px)), H = Math.max(1, Math.round(hm * px));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const X = x => (x - b.minX) * px;
  const Z = z => (z - b.minZ) * px;

  g.fillStyle = COL.land; g.fillRect(0, 0, W, H);

  // Море по высотам. Шаг подбираем от площади, но с запасом по числу проб:
  // при 400 тысячах шаг выходил 37 м, и при увеличении карты берег
  // разваливался на лестницу из квадратов. Полтора миллиона проб — это ~19 м
  // на охват в 24 км и десятая доля секунды на сборку.
  const STEP = Math.max(10, Math.ceil(Math.sqrt(wm * hm / 1.5e6)));
  g.fillStyle = COL.sea;
  const sp = STEP * px + 1;
  const known = hasData(terrain);
  for (let z = b.minZ; z < b.maxZ; z += STEP)
    for (let x = b.minX; x < b.maxX; x += STEP)
      if (known(x, z) && terrain.gridHeightAt(x, z) < 0.4) g.fillRect(X(x), Z(z), sp, sp);

  const poly = (p, holes) => {
    g.beginPath();
    g.moveTo(X(p[0]), Z(p[1]));
    for (let i = 2; i < p.length; i += 2) g.lineTo(X(p[i]), Z(p[i + 1]));
    g.closePath();
    for (const h of holes || []) {
      g.moveTo(X(h[0]), Z(h[1]));
      for (let i = h.length - 2; i >= 0; i -= 2) g.lineTo(X(h[i]), Z(h[i + 1]));
      g.closePath();
    }
    g.fill('evenodd');
  };
  const line = (p, w, col) => {
    g.strokeStyle = col; g.lineWidth = Math.max(0.7, w * px);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(X(p[0]), Z(p[1]));
    for (let i = 2; i < p.length; i += 2) g.lineTo(X(p[i]), Z(p[i + 1]));
    g.stroke();
  };

  g.fillStyle = COL.green;
  for (const o of green) poly(o.poly, o.holes);
  for (const r of rail) line(r.pts, 3, COL.rail);
  for (const r of roads) if (r.c === 4) line(r.pts, r.w, COL.path);
  for (const r of roads) if (r.c === 3) line(r.pts, r.w, COL.road3);
  for (const r of roads) if (r.c === 2) line(r.pts, r.w, COL.road2);
  for (const r of roads) if (r.c <= 1) line(r.pts, r.w + 1.5, COL.road0);
  g.fillStyle = COL.build;
  for (const o of builds) poly(o.poly, o.holes);

  return { canvas: cv, W, H, px, minX: b.minX, minZ: b.minZ, bounds: b, idx, terrain,
           X, Z, view: null };
}

// Есть ли в этой точке поле высот. Вне его heightAt честно отдаёт дно моря, и
// карта закрашивала синим весь охват, где данных просто нет ещё. Проверку
// делаем через сам Terrain, но осторожно: соседняя задача переписывает его на
// чанки, и внутренностей может не стать — тогда считаем, что данные есть везде.
function hasData(terrain) {
  // У чанкового рельефа грубое поле (coarse) покрывает весь охват, высота есть
  // везде. hasDetail() тут НЕ подходит: он говорит про детальный квадрат, а
  // морские квадраты в индекс не попадают вовсе — по нему бухта осталась бы
  // незакрашенной.
  if (terrain.mode === 'chunk') return () => true;
  if (typeof terrain.pixel !== 'function' || !terrain.dem) return () => true;
  const W = terrain.dem.width, H = terrain.dem.height;
  return (x, z) => {
    const [px2, py] = terrain.pixel(x, z);
    return px2 >= 0 && py >= 0 && px2 < W - 1 && py < H - 1;
  };
}

function worldBounds(far) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const o of (far.buildings || []).concat(far.roads || [])) {
    const [a, c, d, e] = bbox(o.poly || o.pts);
    if (a < minX) minX = a; if (d > maxX) maxX = d;
    if (c < minZ) minZ = c; if (e > maxZ) maxZ = e;
  }
  return { minX, minZ, maxX, maxZ };
}

// объекты индекса в окне (в метрах)
function pick(map, x0, z0, x1, z1) {
  const seen = new Set(), out = [];
  for (let cx = Math.floor(x0 / IDX_CELL); cx <= Math.floor(x1 / IDX_CELL); cx++)
    for (let cz = Math.floor(z0 / IDX_CELL); cz <= Math.floor(z1 / IDX_CELL); cz++) {
      const a = map.idx.get(cx * 100003 + cz);
      if (!a) continue;
      for (const e of a) { if (seen.has(e.o)) continue; seen.add(e.o); out.push(e); }
    }
  return out;
}

// круглая миникарта в углу, повёрнутая по направлению движения.
// Рисуется вектором прямо в метрах: единица холста = метр мира.
export function drawMini(ctx, map, px, pz, yaw, size, scaleM) {
  const r = size / 2;
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  ctx.beginPath(); ctx.arc(r, r, r - 2, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = COL.land; ctx.fillRect(0, 0, size, size);

  const half = scaleM / 2 * 1.45;             // с запасом на поворот
  const x0 = px - half, x1 = px + half, z0 = pz - half, z1 = pz + half;

  ctx.translate(r, r);
  // Курс в мире — это +(sin, cos), то есть на холсте (sin, cos) при оси Y вниз.
  // Чтобы он смотрел ВВЕРХ, полотно надо повернуть на yaw + пол-оборота:
  // при простом rotate(yaw) курс уезжал ровно вниз, карта была задом наперёд.
  ctx.rotate(yaw + Math.PI);
  ctx.scale(size / scaleM, size / scaleM);
  ctx.translate(-px, -pz);

  // море — по высотам, редкой сеткой
  const STEP = Math.max(8, scaleM / 26);
  ctx.fillStyle = COL.sea;
  for (let z = Math.floor(z0 / STEP) * STEP; z < z1; z += STEP)
    for (let x = Math.floor(x0 / STEP) * STEP; x < x1; x += STEP)
      if (map.terrain.gridHeightAt(x, z) < 0.4) ctx.fillRect(x, z, STEP + 0.6, STEP + 0.6);

  const items = pick(map, x0, z0, x1, z1);
  const poly = p => {
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.closePath(); ctx.fill();
  };
  const line = (p, w, col) => {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.stroke();
  };
  ctx.fillStyle = COL.green;
  for (const e of items) if (e.kind === 'green') poly(e.o.poly);
  for (const e of items) if (e.kind === 'rail') line(e.o.pts, 3, COL.rail);
  // Порядок как на большой карте: широкие ложатся поверх узких.
  const CLS = [[4, COL.path], [3, COL.road3], [2, COL.road2], [1, COL.road0]];
  for (const [cls, col] of CLS)
    for (const e of items) {
      if (e.kind !== 'road') continue;
      const c = e.o.c;
      if (cls === 1 ? c > 1 : c !== cls) continue;
      line(e.o.pts, cls === 1 ? e.o.w + 1.5 : e.o.w, col);
    }
  ctx.fillStyle = COL.build;
  for (const e of items) if (e.kind === 'build') poly(e.o.poly);
  ctx.restore();

  // рамка и стрелка игрока
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(r, r, r - 2, 0, Math.PI * 2); ctx.stroke();
  ctx.translate(r, r);
  ctx.fillStyle = '#e8b451';
  ctx.beginPath();
  ctx.moveTo(0, -8); ctx.lineTo(5.5, 7); ctx.lineTo(0, 4); ctx.lineTo(-5.5, 7);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// Вся карта на весь экран. zoom = 1 — весь мир целиком; больше — приближение
// с центром на игроке (на полосе трассы в 50 км без этого ничего не разобрать).
// Использованное преобразование кладём в map.view, чтобы клик по карте умел
// пересчитать пиксели обратно в метры.
export function drawFull(ctx, map, w, h, px, pz, yaw, marks, zoom = 1) {
  ctx.clearRect(0, 0, w, h);
  const fit = Math.min(w / map.W, h / map.H) * 0.94;
  const k = fit * zoom;
  let ox, oy;
  if (zoom <= 1.001) { ox = (w - map.W * k) / 2; oy = (h - map.H * k) / 2; }
  else { ox = w / 2 - map.X(px) * k; oy = h / 2 - map.Z(pz) * k; }
  map.view = { k, ox, oy };

  ctx.save();
  ctx.translate(ox, oy); ctx.scale(k, k);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(map.canvas, 0, 0);
  ctx.restore();

  const toS = (x, z) => [ox + map.X(x) * k, oy + map.Z(z) * k];
  ctx.font = '600 12px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  // На весь мир подписей влезает мало: на общем плане они ложились друг на
  // друга в семь слоёв и не читалась ни одна. Занятые прямоугольники помним и
  // накладывающиеся пропускаем — точка всё равно остаётся.
  const busy = [];
  for (const m of marks || []) {
    const [sx, sy] = toS(m.x, m.z);
    if (sx < -40 || sy < -20 || sx > w + 40 || sy > h + 20) continue;
    ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#e8b451'; ctx.fill();
    const tw = ctx.measureText(m.name).width;
    const r = [sx - tw / 2 - 5, sy - 22, tw + 10, 16];
    if (busy.some(o => r[0] < o[0] + o[2] && r[0] + r[2] > o[0]
                    && r[1] < o[1] + o[3] && r[1] + r[3] > o[1])) continue;
    busy.push(r);
    ctx.fillStyle = 'rgba(20,24,28,.78)';
    ctx.fillRect(r[0], r[1], r[2], r[3]);
    ctx.fillStyle = '#f2ede2';
    ctx.fillText(m.name, sx, sy - 10);
  }
  const [sx, sy] = toS(px, pz);
  ctx.save();
  // Стрелка нарисована остриём вверх (0,-11); чтобы остриё легло на курс
  // (sin yaw, cos yaw) на карте «север вверху», поворот равен π - yaw.
  ctx.translate(sx, sy); ctx.rotate(Math.PI - yaw);
  ctx.fillStyle = '#d1573f';
  ctx.beginPath();
  ctx.moveTo(0, -11); ctx.lineTo(7, 9); ctx.lineTo(0, 5); ctx.lineTo(-7, 9);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
}

// пиксель полноэкранной карты → метры мира
export function mapUnproject(map, sx, sy) {
  const v = map.view;
  if (!v) return null;
  return { x: (sx - v.ox) / v.k / map.px + map.minX,
           z: (sy - v.oy) / v.k / map.px + map.minZ };
}
