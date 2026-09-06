import { readFileSync } from 'node:fs';

// Севастополь целиком: Северная сторона и Инкерман на севере и востоке,
// Балаклава на юге, Камышовая с Казачьей и мыс Херсонес на западе.
// Раньше здесь был квадрат 5 × 5 км вокруг Нахимова — он остался ниже как
// BBOX_CENTER: по нему всё ещё удобно быстро пересобрать один центр.
export const BBOX = {
  south: 44.48,
  west:  33.35,
  north: 44.69,
  east:  33.65,
};

// Прежний охват центра. Ничего не строит, но по нему сверяются старые снимки
// и он же — быстрый режим сборки (`node tools/build-world.mjs --center`).
export const BBOX_CENTER = {
  south: 44.5875,
  west:  33.4985,
  north: 44.6325,
  east:  33.5615,
};

// Сторона чанка в метрах. Мир режется на квадраты и грузится вокруг игрока —
// см. docs/CHUNKS.md. Менять только вместе с пересборкой data/chunks.
export const CHUNK = 1024;

// Точка отсчёта локальных координат (метры) — площадь Нахимова.
export const ORIGIN = { lat: 44.6166, lon: 33.5254 };

// Зум тайлов высот. z14 при lat 44.6 ≈ 6.8 м/пиксель.
// Исходник (Copernicus/SRTM) ~30 м, так что это уже с запасом.
export const DEM_ZOOM = 14;

export const R_EARTH = 6378137;

// Трасса Севастополь — Ялта по Южному берегу.
//
// Осевую НЕЛЬЗЯ ставить по памяти. Первый заход я написал её списком посёлков
// (Гончарное, Ласпи, Форос, Симеиз, Алупка, Гаспра) — сверка с реальной
// геометрией OSM показала, что половина точек шоссе оказалась вне коридора,
// а худшая промашка — 4657 метров. Теперь осевая берётся из самой дороги:
// Южнобережное шоссе (67К-1, 35А-002, 35К-022), прорежённое до шага 150 м.
// Пересобрать при нужде: см. заголовок data/route-yalta.json.
const ROUTE_FILE = new URL('../data/route-yalta.json', import.meta.url);
export const ROUTE_YALTA = JSON.parse(readFileSync(ROUTE_FILE, 'utf8')).pts;

// Полуширина коридора. 1500 м хватает: посёлки ЮБК вытянуты вдоль моря узкой
// лентой и от шоссе до воды там редко больше километра.
export const ROUTE_HALF_WIDTH = 1500;

// Сама Ялта коридором не описывается — это город, ему нужен свой квадрат.
export const BBOX_YALTA = {
  south: 44.4600, west: 34.0950,
  north: 44.5350, east: 34.2250,
};

// Локальная проекция: равнопромежуточная относительно ORIGIN.
//
// ВНИМАНИЕ, тут была ошибка, которая всплыла только на трассе до Ялты. Длина
// градуса долготы считалась ОДИН раз, по широте Нахимова, и на пяти километрах
// центра это честно до метра. Но Ялта на 13 км южнее, там градус долготы уже
// на 0.2% длиннее — и точка уезжала на 106 метров. Дороги ЮБК при этом сходят
// со своего склона: рельеф-то приходит из тайлов со своей, правильной,
// привязкой. Поэтому длина градуса долготы теперь считается ПО ШИРОТЕ ТОЧКИ.
//
// Обратимость не потеряна: широта восстанавливается из z независимо от x,
// а зная широту, мы знаем и масштаб долготы. Внутри прежнего центра сдвиг
// от этой правки меньше метра, так что ручные правки домов не разъезжаются.
const RAD = Math.PI / 180;
const M_PER_DEG_LAT = 111132.92 - 559.82 * Math.cos(2 * ORIGIN.lat * RAD)
                    + 1.175 * Math.cos(4 * ORIGIN.lat * RAD);
export function mPerDegLon(lat) {
  return 111412.84 * Math.cos(lat * RAD) - 93.5 * Math.cos(3 * lat * RAD);
}
const M_PER_DEG_LON = mPerDegLon(ORIGIN.lat);   // справочно, для старых данных

export function project(lat, lon) {
  return {
    x: (lon - ORIGIN.lon) * mPerDegLon(lat),   // восток +
    z: -(lat - ORIGIN.lat) * M_PER_DEG_LAT,    // север = -Z (правая система Three.js)
  };
}

// Обратное преобразование. Порядок важен: сперва широта из z, и только потом
// долгота — масштаб долготы зависит от широты.
export function unproject(x, z) {
  const lat = ORIGIN.lat - z / M_PER_DEG_LAT;
  return { lat, lon: ORIGIN.lon + x / mPerDegLon(lat) };
}

export const SCALE = { mPerDegLat: M_PER_DEG_LAT, mPerDegLon: M_PER_DEG_LON };

// Расстояние от точки до трассы, в метрах. Осевая — не ломаная, а густой набор
// точек с шагом 150 м, поэтому меряем до ближайшей точки: погрешность меньше
// 75 м при коридоре в 1500, зато не надо собирать 349 кусков дороги в связную
// цепь (они лежат вперемешку, со встречными полосами и развязками).
//
// Перебирать 655 точек на каждый запрос дорого — качалка зовёт это миллионы
// раз, — поэтому точки разложены по клеткам километровой сетки, и смотрим
// только девять клеток вокруг.
const ROUTE_CELL = 1000;
const routeGrid = new Map();
const cellKey = (cx, cz) => cx + ',' + cz;
for (const [lat, lon] of ROUTE_YALTA) {
  const p = project(lat, lon);
  const k = cellKey(Math.floor(p.x / ROUTE_CELL), Math.floor(p.z / ROUTE_CELL));
  let a = routeGrid.get(k);
  if (!a) routeGrid.set(k, a = []);
  a.push([p.x, p.z]);
}

export function distToRoute(lat, lon) {
  const p = project(lat, lon);
  const cx = Math.floor(p.x / ROUTE_CELL), cz = Math.floor(p.z / ROUTE_CELL);
  // Радиус поиска — до двух клеток: точка может стоять у дальнего края своей
  // клетки, а ближайший кусок дороги — у дальнего края соседней.
  let best = Infinity;
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      const arr = routeGrid.get(cellKey(cx + i, cz + j));
      if (!arr) continue;
      for (const [qx, qz] of arr) {
        const d = Math.hypot(p.x - qx, p.z - qz);
        if (d < best) best = d;
      }
    }
  }
  return best;
}

export const inBox = (lat, lon, b) =>
  lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east;

// Входит ли точка в мир целиком: город, коридор трассы или сама Ялта.
export function inWorld(lat, lon) {
  return inBox(lat, lon, BBOX)
      || inBox(lat, lon, BBOX_YALTA)
      || distToRoute(lat, lon) <= ROUTE_HALF_WIDTH;
}
