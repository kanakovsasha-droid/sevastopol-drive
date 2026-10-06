// Цвет города (п. 27 очереди облака): меньше серого.
//
// Раньше стена дома бралась из одной общей палитры, почти вся она — кремовый
// и светло-серый, и квартал за кварталом выходил одинаково бежево-серым, а
// дальний слой красил все дома одним цветом. Теперь цвет решают три вещи:
//  - тип дома из тега OSM building (частный дом, многоквартирный, магазин,
//    склад) — у каждого свой набор семейств цвета;
//  - район: плавный шум по ячейкам ~400 м выбирает «ведущее» семейство, и
//    соседние дома чаще в одной гамме (охристая улица, персиковый квартал),
//    а не пёстрая россыпь;
//  - id дома — свой хеш, поэтому детальный и дальний слой красят дом одним
//    цветом и граница загрузки не видна сменой цвета.
// Свой тег цвета OSM (building:colour → b.wc, roof:colour → b.rc) по-прежнему
// главнее, его разбирает worldgen.js. Типовые дома красит series.js.
// Без кислотных цветов: всё — штукатурка, известняк, крашеная жесть.

import { seriesOf } from './series.js?v=5ecfe1f7';

// Семейства стен
const F = {
  // инкерманский камень и белёная штукатурка
  stone: [[0.933, 0.902, 0.824], [0.953, 0.925, 0.855], [0.902, 0.859, 0.769], [0.918, 0.882, 0.792]],
  // охра
  ochre: [[0.863, 0.718, 0.463], [0.835, 0.671, 0.416], [0.894, 0.765, 0.533], [0.847, 0.737, 0.529]],
  // персик, абрикос
  peach: [[0.941, 0.773, 0.635], [0.922, 0.737, 0.596], [0.957, 0.827, 0.710], [0.929, 0.788, 0.671]],
  // палевый, светло-жёлтый
  yellow: [[0.949, 0.882, 0.639], [0.929, 0.851, 0.596], [0.957, 0.906, 0.706], [0.910, 0.847, 0.651]],
  // пастель: шалфей, голубой, розоватый, мятный
  pastel: [[0.800, 0.851, 0.737], [0.780, 0.839, 0.878], [0.933, 0.796, 0.765], [0.812, 0.890, 0.824],
           [0.871, 0.839, 0.902]],
  // кирпич (красный и силикатный)
  brick: [[0.706, 0.459, 0.357], [0.659, 0.420, 0.333], [0.878, 0.859, 0.816]],
  // серый — немного, чтобы город не стал карамельным
  grey: [[0.835, 0.831, 0.804], [0.796, 0.792, 0.765], [0.871, 0.863, 0.839]],
  // склады, цеха, гаражи: беж, серый бетон, выгоревшая краска
  ind: [[0.776, 0.757, 0.714], [0.722, 0.714, 0.690], [0.820, 0.788, 0.718], [0.753, 0.769, 0.765],
        [0.769, 0.722, 0.643]],
};

// Тип дома → семейства с весами
const MIX = {
  house:  [['stone', 3], ['peach', 3], ['yellow', 3], ['pastel', 2], ['ochre', 2], ['brick', 1]],
  flat:   [['stone', 4], ['ochre', 3], ['peach', 2], ['yellow', 2], ['pastel', 1], ['grey', 1]],
  tall:   [['stone', 4], ['grey', 2], ['yellow', 2], ['peach', 1], ['pastel', 1]],
  shop:   [['stone', 3], ['grey', 2], ['yellow', 2], ['peach', 2], ['pastel', 1]],
  ind:    [['ind', 6], ['grey', 2], ['stone', 1]],
  public: [['stone', 4], ['yellow', 2], ['ochre', 2], ['peach', 1]],
};

// Кровли. Скатные: черепица и крашеная жесть (красная, зелёная, коричневая,
// серо-синяя) — в частном секторе Крыма жесть всех этих цветов. Плоские:
// битум, гравий, светлая мембрана, ржавый профнастил.
const TILE = [[0.545, 0.271, 0.196], [0.494, 0.239, 0.169], [0.612, 0.325, 0.216], [0.463, 0.255, 0.192]];
const METAL = [[0.580, 0.204, 0.165], [0.282, 0.424, 0.337], [0.369, 0.247, 0.188],
               [0.373, 0.427, 0.482], [0.471, 0.200, 0.180], [0.333, 0.471, 0.420]];
const FLAT = [[0.318, 0.310, 0.294], [0.286, 0.310, 0.325], [0.361, 0.349, 0.329], [0.255, 0.267, 0.275],
              [0.478, 0.459, 0.420], [0.600, 0.604, 0.592], [0.408, 0.341, 0.282], [0.427, 0.420, 0.400]];

const IND = /^(industrial|warehouse|manufacture|hangar|service|garages?|shed|storage_tank|roof|construction|ruins|transformer_tower|barn|greenhouse)$/;
const HOUSE = /^(house|detached|semidetached_house|terrace|bungalow|cabin|dacha|farm)$/;
const SHOP = /^(retail|commercial|office|kiosk|supermarket)$/;
const PUBLIC = /^(school|kindergarten|university|college|hospital|government|public|civic|hotel)$/;

function hashId(s) {
  s = String(s);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
function hash2(i, j) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fract = x => x - Math.floor(x);

// Плавный шум района 0..1: билинейно по ячейкам CELL м
const CELL = 420;
function district(x, z) {
  const fx = x / CELL, fz = z / CELL, i = Math.floor(fx), j = Math.floor(fz);
  let u = fx - i, v = fz - j;
  u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function typeOf(b) {
  const t = b.t || '';
  if (IND.test(t)) return 'ind';
  if (b.school || PUBLIC.test(t)) return 'public';
  if (HOUSE.test(t)) return 'house';
  if (SHOP.test(t)) return 'shop';
  if ((b.h || 0) > 27) return 'tall';
  // без тега: низкий и маленький — скорее частный дом
  if (!t && (b.h || 0) <= 7.5) return 'house';
  return 'flat';
}

function center(b) {
  const p = b.poly, n = p.length >> 1;
  let x = 0, z = 0;
  for (let i = 0; i < n; i++) { x += p[i * 2]; z += p[i * 2 + 1]; }
  return [x / n, z / n];
}

function pickWeighted(mix, r) {
  let s = 0;
  for (const m of mix) s += m[1];
  r *= s;
  for (const m of mix) { if ((r -= m[1]) < 0) return m[0]; }
  return mix[mix.length - 1][0];
}

// Цвет стен дома (sRGB 0..1). Детерминирован по id и месту.
export function wallColor(b) {
  const type = typeOf(b), mix = MIX[type];
  const h = hashId(b.id || (b.poly[0] + ':' + b.poly[1]));
  const [x, z] = center(b);
  // ведущее семейство района: шум выбирает его из того же набора
  const lead = pickWeighted(mix, district(x, z));
  const fam = (type !== 'ind' && fract(h * 3.17) < 0.5) ? lead : pickWeighted(mix, fract(h * 5.71));
  const pal = F[fam];
  return pal[(fract(h * 11.3) * pal.length) | 0];
}

// Цвет кровли (sRGB 0..1). flat — плоская кровля.
export function roofColor(b, flat) {
  const h = hashId((b.id || (b.poly[0] + ':' + b.poly[1])) + 'r');
  if (flat) return FLAT[(h * FLAT.length) | 0];
  const type = typeOf(b);
  // частный сектор и склады — чаще жесть, многоэтажки центра — черепица
  const metal = type === 'house' ? 0.55 : type === 'ind' ? 0.6 : 0.2;
  const pal = fract(h * 7.7) < metal ? METAL : TILE;
  return pal[(fract(h * 13.1) * pal.length) | 0];
}

// Дальний слой (main.js, buildFarCity): тот же цвет дома, что у детального,
// в масштабе, под который подобраны прежние цвета силуэта (стена ≈ линейный
// цвет детального слоя, кровля — sRGB как есть). Типовой дом — цветом серии.
const s2l = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
export function farColors(b) {
  const ser = b.id ? seriesOf(b) : null;
  const w = b.wc ? hexRGB(b.wc) : ser ? ser.color : wallColor(b);
  const flat = b.rs === 'flat' || b.fx === 'glass' || (b.h || 0) > 22;
  const r = b.rc ? hexRGB(b.rc) : (ser && ser.roof && !flat) ? ser.roof : roofColor(b, flat);
  // издали крашеная жесть пестрит и зелёная кровля читается как роща, а к
  // серому — мутнеет: кровли дальнего слоя наполовину к прежней терракоте
  return [[s2l(w[0]) * 0.94, s2l(w[1]) * 0.94, s2l(w[2]) * 0.94],
          [(r[0] + 0.55) / 2, (r[1] + 0.33) / 2, (r[2] + 0.24) / 2]];
}
const hexRGB = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
