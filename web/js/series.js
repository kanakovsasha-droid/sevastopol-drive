// Типовые дома: хрущёвки, сталинки, девятиэтажки (п. 9 плана).
//
// Какой дом какой серии — решает tools/build-series.mjs по этажности из тегов
// OSM и пятну застройки (data/series.json). Здесь — как такой дом строится.
// Это не отдельные модели: дом остаётся своим контуром OSM в общем меше
// зданий, меняется только фасад (свой вид aKind в materials.js) и пара
// деталей — козырьки над подъездами и лифтовые будки на кровле. Ни одного
// нового вызова отрисовки, треугольников — десятки на дом.
//
// Фасад типового дома держится на сетке пролётов: на каждой стене их целое
// число (шаг чуть тянется под длину стены), иначе на углу окно режется
// пополам. Подъезды — на стене, которую сборщик определил как дворовую:
// лестничная клетка через каждые S пролётов, S уходит в шейдер дробной
// частью aKind (вид + S/16), глухой торец — вид + 0.875.
//
// Модуль ждёт файл на загрузке (top-level await), как roadlevels.js: сборка
// домов синхронная. Нет файла — все дома строятся по-старому.
const v = (() => { try { return new URL(import.meta.url).searchParams.get('v') || ''; } catch { return ''; } })();
let S = null;
try {
  const r = await fetch(new URL('../../data/series.json' + (v ? '?v=' + v : ''), import.meta.url));
  if (r.ok) S = await r.json();
} catch { S = null; }

export const SERIES = S;

// вид фасада в aKind и шаг пролёта по сериям — шаг тот же, что в шейдере
const KIND = { k: 14, s: 15, p: 16 };
const BAY = { k: 3.2, s: 3.1, p: 3.0 };
const SECTION = { k: 5, s: 0, p: 7 };      // пролётов на секцию (подъезд)

// Палитры. Хрущёвки Севастополя — белый силикатный кирпич и инкерманский
// камень, панели светлые; сталинки центра — тёсаный инкерманский известняк.
const PAL = {
  k: [[0.905, 0.893, 0.862], [0.874, 0.858, 0.818], [0.871, 0.824, 0.722],
      [0.902, 0.866, 0.784], [0.835, 0.827, 0.800], [0.894, 0.851, 0.741]],
  s: [[0.918, 0.876, 0.784], [0.902, 0.855, 0.757], [0.933, 0.902, 0.835],
      [0.890, 0.847, 0.765], [0.925, 0.886, 0.800]],
  p: [[0.882, 0.874, 0.851], [0.851, 0.843, 0.820], [0.902, 0.886, 0.851],
      [0.863, 0.831, 0.765], [0.835, 0.835, 0.819]],
};

// Свой хеш от id: общий генератор buildBuildings трогать нельзя — лишний
// вызов сдвинул бы кровли и цвета всех следующих домов квадрата.
function hashId(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

// Серия дома или null.
export function seriesOf(b) {
  const e = S && b.id && S.b[b.id];
  if (!e) return null;
  const code = e[0], poly = b.poly, n = poly.length / 2;
  const pal = PAL[code];
  const ser = { code, kind: KIND[code], bay: BAY[code], edge: e[1], color: pal[(hashId(b.id) * pal.length) | 0],
                ax: 1, az: 0, aspect: 1, doors: [] };
  // ось дома — по стене подъездов, торцы — стены поперёк неё
  if (ser.edge >= 0 && ser.edge < n) {
    const i = ser.edge, j = (i + 1) % n;
    const dx = poly[j * 2] - poly[i * 2], dz = poly[j * 2 + 1] - poly[i * 2 + 1];
    const l = Math.hypot(dx, dz) || 1;
    ser.ax = dx / l; ser.az = dz / l;
    let a0 = Infinity, a1 = -Infinity, c0 = Infinity, c1 = -Infinity;
    for (let k = 0; k < n; k++) {
      const x = poly[k * 2], z = poly[k * 2 + 1];
      const a = x * ser.ax + z * ser.az, c = -x * ser.az + z * ser.ax;
      if (a < a0) a0 = a; if (a > a1) a1 = a;
      if (c < c0) c0 = c; if (c > c1) c1 = c;
    }
    ser.aspect = (a1 - a0) / Math.max(1, c1 - c0);
    ser.depth = c1 - c0;
  }
  return ser;
}

// Стена i длиной l: вид фасада и координата вдоль стены (u0 → u1).
// Двери подъездов запоминаются в ser.doors — по ним встают козырьки.
export function seriesWall(ser, i, ax, az, bx, bz, l) {
  const B = ser.bay;
  const N = Math.max(1, Math.round(l / B));
  const dx = (bx - ax) / l, dz = (bz - az) / l;
  // торец пластины глухой: стена поперёк оси у вытянутого дома
  if (ser.code !== 's' && ser.aspect >= 1.8 && Math.abs(dx * ser.ax + dz * ser.az) < 0.35)
    return { kind: ser.kind + 0.875, u0: 0, u1: N * B };
  // короткий выступ — без окон, иначе на нём рисуется обрезок пролёта
  if (l < B * 0.9) return { kind: ser.kind + 0.875, u0: 0, u1: l };
  if (i !== ser.edge || !SECTION[ser.code]) return { kind: ser.kind, u0: 0, u1: N * B };
  // стена подъездов: секции по S пролётов, лестница в середине секции
  const Sec = Math.max(4, Math.min(9, Math.round(N / Math.max(1, Math.round(N / SECTION[ser.code])))));
  const rem = N % Sec, off = Math.floor(rem / 2);
  const mid = Math.floor(Sec / 2), step = l / N;
  for (let b = -off; b < N - off; b++) {
    if (((b % Sec) + Sec) % Sec !== mid) continue;
    const t = (b + off + 0.5) * step;
    ser.doors.push([ax + dx * t, az + dz * t, dx, dz]);
  }
  return { kind: ser.kind + Sec / 16, u0: -off * B, u1: (N - off) * B };
}

// Козырьки над подъездами и лифтовые будки девятиэтажки.
// box — boxSolid из buildBuildings (центр, полуоси, низ, верх, цвет, вид, ось).
export function seriesExtras(ser, yFloor, yTop, wall, Hb, box) {
  if (!ser.doors.length) return;
  const conc = [wall[0] * 0.80, wall[1] * 0.79, wall[2] * 0.77];
  for (const [x, z, dx, dz] of ser.doors) {
    // нормаль наружу у контура против часовой — (dz, −dx)
    const nx = dz, nz = -dx;
    // бетонная плита козырька над дверью (дверь в шейдере 2.2 м)
    box(x + nx * 0.55, z + nz * 0.55, 1.15, 0.6, yFloor + 2.38, yFloor + 2.52, conc, 2, dx, dz, Hb);
    if (ser.code === 'p') {
      // машинное отделение лифта над лестничной клеткой, у середины корпуса
      const d = Math.min(4.5, (ser.depth || 12) * 0.35);
      box(x - nx * d, z - nz * d, 2.4, 2.0, yTop - 0.3, yTop + 2.5, conc, 2, dx, dz, Hb);
    }
  }
}
