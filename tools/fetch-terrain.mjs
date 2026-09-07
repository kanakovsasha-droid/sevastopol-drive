// Поле высот на весь мир игры. Раньше здесь был один файл data/terrain.bin
// (Float32, 1536×1536 = 9 МБ) на квадрат 5 × 5 км. Мир вырос до города целиком
// плюс коридор трассы до Ялты — тот же формат дал бы десятки мегабайт одним
// куском, браузеру такое грузить нельзя. Режем по контракту docs/CHUNKS.md:
//
//   data/terrain/<tx>_<tz>.bin  — Int16, дециметры, чанк 1024 м, кайма 1 пиксель
//   data/terrain/coarse.bin     — весь охват на z11 (~54 м/px, Int16 в дециметрах), фолбэк
//   data/terrain/index.json     — метаданные обеих сеток и список чанков
//
// Охват детальной нарезки = BBOX города ∪ BBOX_YALTA ∪ коридор вдоль
// ROUTE_YALTA полушириной ROUTE_HALF_WIDTH. Прямоугольник от Севастополя до
// Ялты качать нельзя: это 1150 км² гор ради полосы застройки в километр.
// Грубая сетка, наоборот, кроет ВЕСЬ прямоугольник — heightAt обязан отвечать
// синхронно в любой точке, в том числе там, где детали нет и не будет.
//
// Сырые PNG кэшируются в data/dem-tiles/<z>/<x>/<y>.png — повторный запуск
// ничего не качает, оборвавшуюся закачку можно просто перезапустить.
//
// Запуск:
//   node tools/fetch-terrain.mjs              — качает недостающее и режет
//   node tools/fetch-terrain.mjs --skip-fetch — только пересобрать из кэша
//   node tools/fetch-terrain.mjs --mono       — вдобавок старый монолит по BBOX_CENTER
//
// Тайлы Terrarium — публичные данные AWS Open Data (атрибуция в README).

import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { decodePNG } from './png.mjs';
import {
  BBOX, BBOX_CENTER, BBOX_YALTA, DEM_ZOOM, CHUNK, ORIGIN, SCALE,
  ROUTE_YALTA, ROUTE_HALF_WIDTH, project, unproject, inBox,
} from './config.mjs';

const DATA = new URL('../data/', import.meta.url).pathname;
const TILES = DATA + 'dem-tiles/';
const OUT = DATA + 'terrain/';
const TILE = 256;
const COARSE_ZOOM = 11;          // ~54 м/пиксель на широте Крыма
// Ниже этой отметки рантайм всё равно зажимает высоту (SEA_FLOOR в web/js/terrain.js).
// Чанк, у которого весь максимум ниже, на выходе неотличим от фолбэка — не пишем его.
const SEA_FLOOR = -28;

// Провалы в исходнике. В тайлах ЮБК попадаются одиночные пиксели вроде -7000 м
// посреди горного склона — это дыры в SRTM, а не рельеф. Оставить их нельзя:
// рантайм зажмёт такой пиксель до SEA_FLOOR и на склоне будет колодец.
const VOID_BELOW = -300;         // подозрительно глубоко
const VOID_NEAR = -50;           // сосед выше этого считается нормальной сушей
const VOID_FRACTION = 0.75;      // доля соседей-суши: у обрыва в море столько не наберётся

const HEADERS = { 'User-Agent': 'sevastopol-game/0.1 (personal hobby project)' };
const PARALLEL = 4;              // качаем вежливо: четыре потока и пауза между запросами
const PAUSE_MS = 40;
const RETRIES = 6;

const args = process.argv.slice(2);
const has = f => args.includes(f);

// ----------------------------------------------------------------- проекции
const lon2px = (lon, z) => (lon + 180) / 360 * 2 ** z * TILE;
const lat2py = (lat, z) => {
  const r = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z * TILE;
};
// Локальные метры → глобальный пиксель тайловой сетки. Через unproject, потому
// что масштаб долготы теперь зависит от широты точки (см. config.mjs).
const m2px = (x, z, zoom) => lon2px(unproject(x, z).lon, zoom);
const m2py = (z, zoom) => lat2py(unproject(0, z).lat, zoom);

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ----------------------------------------------------------------- закачка
async function fetchTile(z, tx, ty) {
  const file = `${TILES}${z}/${tx}/${ty}.png`;
  if (existsSync(file)) return readFileSync(file);
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${tx}/${ty}.png`;
  let last;
  for (let a = 0; a < RETRIES; a++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.status === 404) return null;             // за краем покрытия — не беда
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      decodePNG(buf);                                  // проверяем, что скачался целый файл
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, buf);
      return buf;
    } catch (e) {
      last = e;
      await sleep(400 * 2 ** a);                       // экспоненциальная пауза при обрыве
    }
  }
  throw new Error(`тайл ${z}/${tx}/${ty}: ${last?.message}`);
}

// Качает список тайлов в кэш. Список — строки "z/x/y", уже без дублей.
async function fetchList(keys, label) {
  const jobs = keys.filter(k => !existsSync(`${TILES}${k}.png`));
  console.log(`${label}: нужно ${keys.length} тайлов, в кэше ${keys.length - jobs.length}, качаем ${jobs.length}`);
  let done = 0;
  const worker = async () => {
    for (;;) {
      const k = jobs.shift();
      if (!k) return;
      const [z, x, y] = k.split('/').map(Number);
      await fetchTile(z, x, y);
      if (++done % 25 === 0) console.log(`  … скачано ${done} из ${jobs.length + done}`);
      await sleep(PAUSE_MS);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  if (done) console.log(`  скачано ${done}`);
}

// ------------------------------------------------------- декодирование тайла
// Кэш РАСПАКОВАННЫХ тайлов: соседние чанки делят одни и те же тайлы, и без
// кэша каждый заново распаковывался бы по нескольку раз.
const decoded = new Map();
let voidsFixed = 0;

function fillVoids(a) {
  // Дырки чиним на уровне тайла, а не чанка: тайл распаковывается один раз и
  // кэшируется, значит все чанки читают ОДНО И ТО ЖЕ значение и шва не будет.
  // Края тайла тоже чиним — там дыр не меньше, просто соседей у пикселя 5 или 3,
  // поэтому порог берём долей от доступных, а не абсолютным числом.
  for (let pass = 0; pass < 6; pass++) {
    let fixed = 0;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const i = y * TILE + x;
        if (a[i] >= VOID_BELOW) continue;
        let avail = 0, n = 0, sum = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const yy = y + dy, xx = x + dx;
            if (yy < 0 || xx < 0 || yy >= TILE || xx >= TILE) continue;
            avail++;
            const v = a[yy * TILE + xx];
            if (v > VOID_NEAR) { n++; sum += v; }
          }
        // Настоящий обрыв в море окружён морем, столько «сухих» соседей у него
        // не наберётся — а одиночная дыра в SRTM окружена склоном со всех сторон.
        if (n >= Math.ceil(avail * VOID_FRACTION)) { a[i] = sum / n; fixed++; }
      }
    }
    voidsFixed += fixed;
    if (!fixed) break;
  }
}

async function tileData(z, tx, ty) {
  const key = `${z}/${tx}/${ty}`;
  const hit = decoded.get(key);
  if (hit !== undefined) return hit;
  const buf = await fetchTile(z, tx, ty);
  let out = null;
  if (buf) {
    const img = decodePNG(buf);
    const c = img.channels;
    out = new Float32Array(TILE * TILE);
    for (let i = 0; i < TILE * TILE; i++) {
      const p = i * c;
      out[i] = img.data[p] * 256 + img.data[p + 1] + img.data[p + 2] / 256 - 32768;
    }
    fillVoids(out);
  }
  if (decoded.size > 256) decoded.delete(decoded.keys().next().value);
  decoded.set(key, out);
  return out;
}

// Float32 поле по прямоугольнику ГЛОБАЛЬНЫХ пикселей. Дырки покрытия (404)
// остаются нулями — там всё равно открытое море.
async function field(z, px0, py0, w, h) {
  const tx0 = Math.floor(px0 / TILE), tx1 = Math.floor((px0 + w - 1) / TILE);
  const ty0 = Math.floor(py0 / TILE), ty1 = Math.floor((py0 + h - 1) / TILE);
  const out = new Float32Array(w * h);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const t = await tileData(z, tx, ty);
      if (!t) continue;
      const ox = tx * TILE - px0, oy = ty * TILE - py0;
      const ix0 = Math.max(0, -ox), ix1 = Math.min(TILE, w - ox);
      const iy0 = Math.max(0, -oy), iy1 = Math.min(TILE, h - oy);
      for (let y = iy0; y < iy1; y++) {
        const row = (oy + y) * w + ox, src = y * TILE;
        for (let x = ix0; x < ix1; x++) out[row + x] = t[src + x];
      }
    }
  }
  return out;
}

// ------------------------------------------------------------- выбор чанков
// Пиксельный прямоугольник чанка + кайма в 1 пиксель с каждой стороны.
// Без каймы билинейная выборка у самого шва берёт пиксель соседнего чанка,
// которого в файле нет — и нормаль на стыке рвётся видимой складкой.
// Масштаб долготы зависит от широты, поэтому квадрат в метрах — не совсем
// прямоугольник в пикселях: берём габарит по всем четырём углам.
function chunkRect(tx, tz, zoom) {
  const X0 = tx * CHUNK, X1 = (tx + 1) * CHUNK;
  const Z0 = tz * CHUNK, Z1 = (tz + 1) * CHUNK;
  let a = Infinity, b = -Infinity;
  for (const zz of [Z0, Z1]) for (const xx of [X0, X1]) {
    const p = m2px(xx, zz, zoom);
    if (p < a) a = p; if (p > b) b = p;
  }
  const y0 = m2py(Z0, zoom), y1 = m2py(Z1, zoom);
  const px0 = Math.floor(a) - 1, px1 = Math.ceil(b) + 1;
  const py0 = Math.floor(Math.min(y0, y1)) - 1, py1 = Math.ceil(Math.max(y0, y1)) + 1;
  return { px0, py0, w: px1 - px0 + 1, h: py1 - py0 + 1 };
}

// Точки осевой трассы в локальных метрах. ROUTE_YALTA — это НАБОР точек
// реальной геометрии шоссе с шагом 150 м (data/route-yalta.json), а не ломаная:
// соединять соседние отрезком нельзя, они бывают с разных дорог. Шага 150 м при
// полуширине коридора 1500 м с запасом хватает, чтобы мерить прямо по точкам.
function routePoints() {
  return ROUTE_YALTA.map(([lat, lon]) => {
    const p = project(lat, lon);
    return [p.x, p.z];
  });
}

// Квадрат в lat/lon: широта зависит только от z, долгота — от x и широты,
// поэтому долготный габарит берём по обоим краям по широте.
function chunkBox(tx, tz) {
  const X0 = tx * CHUNK, X1 = (tx + 1) * CHUNK;
  const Z0 = tz * CHUNK, Z1 = (tz + 1) * CHUNK;
  const north = unproject(0, Z0).lat, south = unproject(0, Z1).lat;
  let west = Infinity, east = -Infinity;
  for (const zz of [Z0, Z1]) for (const xx of [X0, X1]) {
    const lon = unproject(xx, zz).lon;
    if (lon < west) west = lon; if (lon > east) east = lon;
  }
  return { south, west, north, east };
}

const boxesOverlap = (a, b) =>
  a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;

function selectChunks() {
  // Габарит по всем трём частям мира — в нём и перебираем клетки.
  const corners = [];
  for (const b of [BBOX, BBOX_YALTA]) {
    for (const lat of [b.south, b.north]) for (const lon of [b.west, b.east]) corners.push(project(lat, lon));
  }
  const route = routePoints();
  for (const [x, z] of route) corners.push({ x, z });
  const pad = ROUTE_HALF_WIDTH + CHUNK;
  const minX = Math.min(...corners.map(c => c.x)) - pad;
  const maxX = Math.max(...corners.map(c => c.x)) + pad;
  const minZ = Math.min(...corners.map(c => c.z)) - pad;
  const maxZ = Math.max(...corners.map(c => c.z)) + pad;
  const tx0 = Math.floor(minX / CHUNK), tx1 = Math.floor(maxX / CHUNK);
  const tz0 = Math.floor(minZ / CHUNK), tz1 = Math.floor(maxZ / CHUNK);

  const list = [];
  for (let tz = tz0; tz <= tz1; tz++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const box = chunkBox(tx, tz);
      let take = boxesOverlap(box, BBOX) || boxesOverlap(box, BBOX_YALTA);
      if (!take) {
        // расстояние от точки трассы до квадрата чанка (в метрах)
        const X0 = tx * CHUNK, X1 = X0 + CHUNK, Z0 = tz * CHUNK, Z1 = Z0 + CHUNK;
        for (const [x, z] of route) {
          const dx = x < X0 ? X0 - x : x > X1 ? x - X1 : 0;
          const dz = z < Z0 ? Z0 - z : z > Z1 ? z - Z1 : 0;
          if (dx * dx + dz * dz <= ROUTE_HALF_WIDTH * ROUTE_HALF_WIDTH) { take = true; break; }
        }
      }
      if (take) list.push({ tx, tz });
    }
  }
  return { list, tx0, tx1, tz0, tz1 };
}

// ----------------------------------------------------------------- монолит
// Старый формат по BBOX_CENTER — чтобы можно было пересобрать data/terrain.bin,
// если понадобится сверка со старыми снимками центра.
async function buildMono() {
  const z = DEM_ZOOM;
  const x0 = Math.floor(lon2px(BBOX_CENTER.west, z) / TILE) - 1;
  const x1 = Math.floor(lon2px(BBOX_CENTER.east, z) / TILE) + 1;
  const y0 = Math.floor(lat2py(BBOX_CENTER.north, z) / TILE) - 1;
  const y1 = Math.floor(lat2py(BBOX_CENTER.south, z) / TILE) + 1;
  const keys = [];
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) keys.push(`${z}/${tx}/${ty}`);
  await fetchList(keys, `монолит z${z}`);
  const W = (x1 - x0 + 1) * TILE, H = (y1 - y0 + 1) * TILE;
  const heights = await field(z, x0 * TILE, y0 * TILE, W, H);
  let min = Infinity, max = -Infinity;
  for (const v of heights) { if (v < min) min = v; if (v > max) max = v; }
  writeFileSync(DATA + 'terrain.bin', Buffer.from(heights.buffer));
  writeFileSync(DATA + 'terrain.json', JSON.stringify({
    zoom: z, tileX0: x0, tileY0: y0, tileSize: TILE, width: W, height: H, min, max,
  }, null, 2));
  console.log(`монолит: ${W}×${H}, ${min.toFixed(1)} … ${max.toFixed(1)} м`);
}

// ----------------------------------------------------------------- главное
// Высота прямо из исходного тайла по честным географическим координатам —
// эталон для сверки нарезки (tools/check-terrain.mjs).
export async function rawHeight(lat, lon, zoom = DEM_ZOOM) {
  const px = lon2px(lon, zoom), py = lat2py(lat, zoom);
  const x0 = Math.floor(px), y0 = Math.floor(py);
  const fx = px - x0, fy = py - y0;
  const at = async (gx, gy) => {
    const t = await tileData(zoom, Math.floor(gx / TILE), Math.floor(gy / TILE));
    return t ? t[(gy - Math.floor(gy / TILE) * TILE) * TILE + (gx - Math.floor(gx / TILE) * TILE)] : 0;
  };
  const a = await at(x0, y0), b = await at(x0 + 1, y0);
  const c = await at(x0, y0 + 1), d = await at(x0 + 1, y0 + 1);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(TILES, { recursive: true });
  const z = DEM_ZOOM;

  const { list, tx0, tx1, tz0, tz1 } = selectChunks();
  console.log(`габарит сетки: tx ${tx0}…${tx1}, tz ${tz0}…${tz1} = ${(tx1 - tx0 + 1) * (tz1 - tz0 + 1)} клеток;`
            + ` в мире ${list.length} (${(100 * list.length / ((tx1 - tx0 + 1) * (tz1 - tz0 + 1))).toFixed(0)}%)`);

  // Тайлы качаем ТОЛЬКО под выбранные чанки: прямоугольник до Ялты — это горы,
  // которые в игре никто не увидит.
  const rects = new Map();
  const need = new Set();
  for (const c of list) {
    const r = chunkRect(c.tx, c.tz, z);
    rects.set(c.tx + '_' + c.tz, r);
    for (let ty = Math.floor(r.py0 / TILE); ty <= Math.floor((r.py0 + r.h - 1) / TILE); ty++)
      for (let tx = Math.floor(r.px0 / TILE); tx <= Math.floor((r.px0 + r.w - 1) / TILE); tx++)
        need.add(`${z}/${tx}/${ty}`);
  }
  if (!has('--skip-fetch')) await fetchList([...need], `детальная z${z}`);

  // Старые чанки сносим: после сдвига охвата рядом с новыми остались бы файлы
  // от прошлой нарезки, и рантайм подхватил бы несовместимую сетку.
  for (const f of readdirSync(OUT)) if (f.endsWith('.bin') || f === 'index.json') rmSync(OUT + f);

  const chunks = [];
  let bytes = 0, sea = 0;
  let gmin = Infinity, gmax = -Infinity;
  // Порядок построчный: соседние чанки делят тайлы, и кэш распакованных
  // тайлов при таком обходе почти не промахивается.
  list.sort((a, b) => a.tz - b.tz || a.tx - b.tx);
  for (const c of list) {
    const r = rects.get(c.tx + '_' + c.tz);
    const f = await field(z, r.px0, r.py0, r.w, r.h);
    let min = Infinity, max = -Infinity;
    const buf = new Int16Array(r.w * r.h);
    for (let i = 0; i < f.length; i++) {
      const v = f[i];
      if (v < min) min = v; if (v > max) max = v;
      const d = Math.round(v * 10);          // дециметры: ±3276 м с запасом
      buf[i] = d < -32760 ? -32760 : d > 32760 ? 32760 : d;
    }
    // Чанк без единого клочка суши не пишем: открытое море на z14 приходит
    // сплошными нулями (батиметрии на этом зуме нет), и 214 таких файлов —
    // это 10 МБ нулей. Синхронный heightAt там ответит из coarse, а глубину
    // бухт worldgen всё равно вырезает сам (seaMask).
    if (max <= 0.05) { sea++; continue; }
    writeFileSync(`${OUT}${c.tx}_${c.tz}.bin`, Buffer.from(buf.buffer));
    bytes += buf.byteLength;
    if (min < gmin) gmin = min; if (max > gmax) gmax = max;
    chunks.push({ tx: c.tx, tz: c.tz, px0: r.px0, py0: r.py0, w: r.w, h: r.h, min: +min.toFixed(2), max: +max.toFixed(2) });
  }
  console.log(`чанков записано ${chunks.length} (${(bytes / 1048576).toFixed(1)} МБ), пропущено морских ${sea};`
            + ` дыр в исходнике залатано ${voidsFixed}`);

  // ---- грубая сетка z11: ВЕСЬ габарит, включая то, чего нет в деталях
  const cz = COARSE_ZOOM;
  const X0 = tx0 * CHUNK, X1 = (tx1 + 1) * CHUNK;
  const Z0 = tz0 * CHUNK, Z1 = (tz1 + 1) * CHUNK;
  let a = Infinity, b = -Infinity;
  for (const zz of [Z0, Z1]) for (const xx of [X0, X1]) {
    const p = m2px(xx, zz, cz);
    if (p < a) a = p; if (p > b) b = p;
  }
  const cpx0 = Math.floor(a) - 2, cpx1 = Math.ceil(b) + 2;
  const cpy0 = Math.floor(m2py(Z0, cz)) - 2, cpy1 = Math.ceil(m2py(Z1, cz)) + 2;
  const CW = cpx1 - cpx0 + 1, CH = cpy1 - cpy0 + 1;
  if (!has('--skip-fetch')) {
    const keys = [];
    for (let ty = Math.floor(cpy0 / TILE); ty <= Math.floor(cpy1 / TILE); ty++)
      for (let tx = Math.floor(cpx0 / TILE); tx <= Math.floor(cpx1 / TILE); tx++) keys.push(`${cz}/${tx}/${ty}`);
    await fetchList(keys, `грубая z${cz}`);
  }
  const coarse = await field(cz, cpx0, cpy0, CW, CH);
  let cmin = Infinity, cmax = -Infinity;
  for (const v of coarse) { if (v < cmin) cmin = v; if (v > cmax) cmax = v; }
  // Грубая сетка качается ЦЕЛИКОМ и до первого кадра, поэтому её вес — это
  // прямо время старта (4 МБ, около секунды через интернет). Int16 в
  // дециметрах вдвое легче, а при 54 метрах на пиксель дециметры — точность
  // с запасом на два порядка. Рантайм формат читает из индекса.
  const c16 = new Int16Array(coarse.length);
  for (let i = 0; i < coarse.length; i++)
    c16[i] = Math.max(-32768, Math.min(32767, Math.round(coarse[i] * 10)));
  writeFileSync(OUT + 'coarse.bin', Buffer.from(c16.buffer));
  console.log(`грубая сетка: ${CW}×${CH} (${(CW * CH * 2 / 1048576).toFixed(2)} МБ, int16), ${cmin.toFixed(1)} … ${cmax.toFixed(1)} м`);

  // ---- индекс
  writeFileSync(OUT + 'index.json', JSON.stringify({
    chunk: CHUNK,
    meta: {
      origin: ORIGIN,
      // mPerDegLon здесь справочный, по широте ORIGIN: рантайм считает масштаб
      // долготы по широте точки сам (источник истины — unproject в config.mjs).
      scale: { mPerDegLat: SCALE.mPerDegLat, mPerDegLon: SCALE.mPerDegLon },
      bbox: BBOX, bboxYalta: BBOX_YALTA,
      bounds: { minX: X0, maxX: X1, minZ: Z0, maxZ: Z1 },
    },
    detail: {
      zoom: z, tileSize: TILE,
      px0: 0, py0: 0,                 // px0/py0 чанков — глобальные пиксели z14
      type: 'int16', unit: 0.1,
      min: +gmin.toFixed(2), max: +gmax.toFixed(2),
    },
    coarse: {
      file: 'coarse.bin', zoom: cz, tileSize: TILE,
      px0: cpx0, py0: cpy0, width: CW, height: CH,
      type: 'int16', unit: 0.1,
      min: +cmin.toFixed(2), max: +cmax.toFixed(2),
    },
    tx0, tx1, tz0, tz1,
    chunks,
  }));
  console.log(`index.json: ${chunks.length} чанков, высоты ${gmin.toFixed(1)} … ${gmax.toFixed(1)} м`);

  if (has('--mono')) await buildMono();
}

// Запускаем только как скрипт: check-terrain.mjs импортирует отсюда rawHeight.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) main();
