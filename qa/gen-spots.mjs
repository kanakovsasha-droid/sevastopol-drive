// Собирает qa/spots.json — фиксированный набор мест для tools/qa.mjs.
// Набор лежит в git готовым; этот скрипт нужен, чтобы понять, откуда взялись
// числа, и чтобы добавить место, не пересчитывая остальные вручную:
//   node qa/gen-spots.mjs
//
// Откуда координаты:
//  • улицы и спуски — старт и точка «куда ехать» из drive.txt потока roads3;
//  • площади — точки потоков roads2/roads3 и trees;
//  • здания и памятники — data/landmarks.json: x,z — центр контура, ox,oz —
//    начало координат модели (главный вход), поэтому снимок «с земли» ставим
//    перед входом, на линии центр → вход;
//  • перекрёстки на склонах — найдены перебором узлов дорог класса ≤ 2 в
//    центре города по уклону рельефа (12 м по обе стороны), развёрнуты вдоль
//    спуска: камера стоит выше по склону и смотрит вниз по улице;
//  • стадионы, рынок, кладбища — data/sport.json, data/poi.json, OSM.
//
// Поля места: id, group, name, x,z — центр кадра сверху, top — высота камеры
// сверху (м над землёй), ground — {from:[x,z], look:[x,z,h]} кадр «с высоты
// машины» (2 м), profile — {toward:[x,z], len} для замера профиля полотна по
// улице от (x0,z0)=ground.from, quick — входит в быстрый прогон.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const L = JSON.parse(readFileSync(join(ROOT, 'data/landmarks.json'), 'utf8'));

const spots = [];
const add = s => spots.push(s);
const r1 = v => Math.round(v * 10) / 10;

// ---- улицы: профиль полотна + кадры
const STREETS = [
  ['bolshaya-morskaya', 'Большая Морская', [-315, 979], [-297, 1046], true],
  ['lenina', 'улица Ленина', [92, 784], [73, 716], true],
  ['nakhimova', 'проспект Нахимова', [-165, 7], [-190, 73], true],
  ['petrova', 'Генерала Петрова', [-1051, 1103], [-1106, 1147], true],
  ['gogolya', 'улица Гоголя', [-552, 2572], [-596, 2627], false],
  ['streletsky', 'Стрелецкий спуск', [-1136, 1313], [-1102, 1374], false],
  ['trolleybus', 'Троллейбусный спуск', [68, 1710], [112, 1655], false],
  ['oktyabrskogo', 'улица Адмирала Октябрьского', [-690, 1590], [-540, 1538], false],
];
for (const [id, name, a, b, quick] of STREETS) {
  add({ id: 'st-' + id, group: 'улица', name, x: r1((a[0] + b[0]) / 2), z: r1((a[1] + b[1]) / 2), top: 70,
        ground: { from: a, look: [b[0], b[1], 1.5] }, profile: { toward: b, len: 520 }, quick });
}

// ---- площади
add({ id: 'sq-nakhimova', group: 'площадь', name: 'площадь Нахимова', x: -5, z: 10, top: 100,
      ground: { from: [-62, 52], look: [-6, 2, 4] }, quick: true });
add({ id: 'sq-lazareva', group: 'площадь', name: 'площадь Лазарева', x: -430, z: 570, top: 90,
      ground: { from: [-470, 600], look: [-440, 555, 2] } });
add({ id: 'sq-ushakova', group: 'площадь', name: 'площадь Ушакова', x: -112, z: 1711, top: 90,
      ground: { from: [-141, 1708], look: [-72, 1716, 2] } });
add({ id: 'sq-vosstavshih', group: 'площадь', name: 'площадь Восставших', x: -810, z: 1637, top: 90,
      ground: { from: [-735, 1607], look: [-800, 1630, 2] }, quick: true });

// ---- здания и памятники (по landmarks.json)
const MODELS = [
  ['hospital', 'Городская больница №1', 'Городская больница №1', 55, true],
  ['theatre', 'Театр Луначарского', 'Севастопольский академический русский драматический театр', 60, true, 14],
  ['hotel', 'Гостиница «Севастополь»', 'Гостиница «Севастополь»', 60],
  ['shtab', 'Штаб Черноморского флота', 'Штаб Краснознамённого Черноморского флота', 60],
  ['vokzal', 'Железнодорожный вокзал', 'Железнодорожный вокзал Севастополя', 80],
  ['panorama', 'Панорама обороны', 'Панорама «Оборона Севастополя', 70],
  ['vladimir', 'Владимирский собор', 'Собор Владимира равноапостольного', 50],
  ['nakhimov-mon', 'Памятник Нахимову', 'Памятник адмиралу Нахимову', 30],
  ['sunken', 'Памятник затопленным кораблям', 'Памятник затопленным кораблям', 40],
  ['ushakov-mon', 'Бюст Ушакова', 'Памятник-бюст адмиралу Ф. Ф. Ушакову', 30],
];
for (const [id, name, match, top, quick, side = 0] of MODELS) {
  const d = L.find(l => l.style === 'model' && l.name.startsWith(match));
  if (!d) throw new Error('нет в landmarks.json: ' + match);
  let dx = d.ox - d.x, dz = d.oz - d.z;
  const len = Math.hypot(dx, dz);
  const mon = len < 4;
  if (mon) { dx = 0.6; dz = 0.8; } else { dx /= len; dz /= len; }   // памятник: взгляд с юго-востока
  const back = mon ? 20 : 28;
  add({ id: 'bld-' + id, group: 'здание', name, x: r1(d.x), z: r1(d.z), top,
        ground: { from: [r1(d.ox + dx * back - dz * side), r1(d.oz + dz * back + dx * side)], look: [r1(d.x), r1(d.z), 7] }, quick: !!quick });
}

// ---- перекрёстки на склонах: [x, z, qx, qz] — qx,qz точка той дороги к
// перекрёстку, что идёт круче всего вверх, в 22 м от него (камера стоит на
// этой дороге и смотрит вниз, через перекрёсток)
const SLOPES = [
  [-216, 491, -212.9, 513], [-132, 1368, -118.5, 1351], [38, 1906, 40.6, 1884.2],
  [-941, 750, -962, 745], [154, 1216, 140.5, 1213.8], [-1361, 894, -1341.1, 884.2],
  [-938, 1682, -929.2, 1694.4], [167, 2217, 145.9, 2211.2], [7, 390, 8, 411.5], [826, 2143, 830, 2121.9],
];
SLOPES.forEach(([x, z, qx, qz], i) => add({
  id: 'sl-' + (i + 1), group: 'склон', name: `перекрёсток на склоне ${i + 1} (${x}, ${z})`, x, z, top: 70,
  ground: { from: [qx, qz], look: [r1(x + (x - qx) * 1.4), r1(z + (z - qz) * 1.4), 1.5] }, quick: i === 0 || i === 3,
}));

// ---- стадионы, рынок, кладбища, набережная, прочее
add({ id: 'sp-sok', group: 'стадион', name: 'стадион СОК', x: -1150, z: 1800, top: 130,
      ground: { from: [-1160, 1830], look: [-1100, 1780, 6] }, quick: true });
add({ id: 'sp-chaika', group: 'стадион', name: 'стадион «Чайка» и рынок', x: -725, z: 1515, top: 130,
      ground: { from: [-735, 1600], look: [-735, 1480, 4] } });
add({ id: 'sp-sevastopol', group: 'стадион', name: 'стадион «Севастополь» (Брестская)', x: 1318, z: 1555, top: 130,
      ground: { from: [1300, 1590], look: [1358, 1540, 6] } });
add({ id: 'mk-central', group: 'рынок', name: 'Центральный рынок', x: -700, z: 1515, top: 90,
      ground: { from: [-640, 1500], look: [-710, 1515, 2] } });
add({ id: 'mk-flowers', group: 'рынок', name: 'Цветочный рынок', x: -340, z: 1461, top: 70,
      ground: { from: [-300, 1440], look: [-345, 1465, 2] } });
add({ id: 'cm-karaim', group: 'кладбище', name: 'Караимское кладбище', x: -1794, z: 1578, top: 100,
      ground: { from: [-1800, 1590], look: [-1830, 1620, 1] } });
add({ id: 'cm-evrey', group: 'кладбище', name: 'Еврейское кладбище', x: -1718, z: 1817, top: 100,
      ground: { from: [-1712, 1806], look: [-1738, 1776, 1] } });
add({ id: 'em-grafskaya', group: 'набережная', name: 'набережная у Графской пристани', x: 110, z: -55, top: 90,
      ground: { from: [40, -10], look: [110, -70, 3] }, quick: true });
add({ id: 'bv-primorsky', group: 'парк', name: 'Приморский бульвар', x: -140, z: -100, top: 90,
      ground: { from: [-90, -20], look: [-125, -68, 3] } });
add({ id: 'bv-hedge', group: 'парк', name: 'живая изгородь у площади Нахимова', x: -118, z: 218, top: 60,
      ground: { from: [-140, 262], look: [-95, 175, 2] } });
add({ id: 'vd-viaduct', group: 'мост', name: 'виадук у вокзала', x: 329, z: 2479, top: 80,
      ground: { from: [346, 2504], look: [329, 2479, 2] } });
add({ id: 'br-east', group: 'мост', name: 'мост на Ластовой', x: 1087, z: 316, top: 80,
      ground: { from: [1066, 303], look: [1087, 316, 2] } });
add({ id: 'hl-malakhov', group: 'холм', name: 'Малахов курган', x: 1790, z: 1400, top: 100,
      ground: { from: [1740, 1390], look: [1796, 1443, 4] } });

const out = { _: 'Собрано qa/gen-spots.mjs. Мир: x — восток, z — юг, метры. ground.from — камера на 2 м над землёй/полотном.', spots };
writeFileSync(join(ROOT, 'qa/spots.json'), '{"_": ' + JSON.stringify(out._) + ',\n"spots": [\n' + spots.map(s => JSON.stringify(s)).join(',\n') + '\n]}\n');
console.log('мест:', spots.length, ' быстрых:', spots.filter(s => s.quick).length);
