import * as THREE from 'three';
import { PolyGrid } from './worldgen.js?v=4920fe70';

// Настоящие объекты из OSM: остановки с их именами, скамейки, урны, светофоры,
// киоски, заборы и подпорные стены. Ничего не выдумано — координаты как в карте.

const s2l = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const rng = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

// ---------------------------------------------------------------- контуры домов
// buildFurniture получает только точки, рельеф, индекс дорог и растр асфальта —
// контуров зданий среди них нет. А без них павильон встаёт прямо в стену: в
// сырых данных OSM внутри домов лежат 9 остановок из 117, все 11 почтовых
// ящиков и 74 «киоска» (банкоматы отмечены узлом на стене банка). Поэтому
// контуры подтягиваем сами — один раз на модуль и заранее: импорт случается
// за десятки секунд до вызова buildFurniture, к нему ответ давно пришёл.
// Адрес пишем шаблонной строкой, чтобы tools/stamp.mjs не приклеил ?v=: тогда
// он совпадает с адресом из terrain.js, и на Pages (там ответ кешируемый)
// браузер отдаст мир из кеша вместо второй закачки. На локальном сервере
// заголовок no-store, так что там это честное второе чтение с 127.0.0.1.
let BUILDINGS = null;
fetch(`../data/world.json` + (document.querySelector('meta[name="build"]')?.content ? '?v=' + document.querySelector('meta[name="build"]').content : ''))
  .then(r => r.json())
  // держим ТОЛЬКО контуры: вторая копия всего мира в памяти нам не нужна
  .then(w => { BUILDINGS = new PolyGrid(w.buildings.map(b => ({ poly: b.poly, holes: b.holes })), 90); })
  .catch(() => { BUILDINGS = null; });   // не пришло — просто не проверяем дома

function merge(parts) {
  let nv = 0, ni = 0;
  for (const { geo } of parts) {
    nv += geo.attributes.position.count;
    ni += geo.index ? geo.index.count : geo.attributes.position.count;
  }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), C = new Uint8Array(nv * 3);
  const I = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const { geo, color } of parts) {
    P.set(geo.attributes.position.array, vo * 3);
    N.set(geo.attributes.normal.array, vo * 3);
    const n = geo.attributes.position.count;
    for (let i = 0; i < n; i++)
      for (let k = 0; k < 3; k++) C[(vo + i) * 3 + k] = Math.round(255 * s2l(color[k]));
    if (geo.index) for (let i = 0; i < geo.index.count; i++) I[io++] = geo.index.array[i] + vo;
    else for (let i = 0; i < n; i++) I[io++] = i + vo;
    vo += n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.BufferAttribute(C, 3, true));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  return g;
}

const STEEL = [0.29, 0.30, 0.31];
const DARK = [0.13, 0.14, 0.15];
const GLASSY = [0.42, 0.50, 0.54];

// павильон остановки: стойки, стенка, козырёк
function shelterGeo() {
  const parts = [];
  for (const x of [-1.85, -0.6, 0.6, 1.85]) {
    const p = new THREE.BoxGeometry(0.09, 2.45, 0.09); p.translate(x, 1.22, -1.05);
    parts.push({ geo: p, color: STEEL });
  }
  const back = new THREE.BoxGeometry(4.0, 1.95, 0.06); back.translate(0, 1.30, -1.12);
  parts.push({ geo: back, color: GLASSY });
  const roof = new THREE.BoxGeometry(4.3, 0.11, 1.55); roof.translate(0, 2.50, -0.55);
  parts.push({ geo: roof, color: STEEL });
  const seat = new THREE.BoxGeometry(3.4, 0.07, 0.42); seat.translate(0, 0.46, -0.88);
  parts.push({ geo: seat, color: [0.42, 0.30, 0.19] });
  return merge(parts);
}

function benchGeo() {
  const parts = [];
  const seat = new THREE.BoxGeometry(1.75, 0.07, 0.46); seat.translate(0, 0.44, 0);
  const back = new THREE.BoxGeometry(1.75, 0.34, 0.06); back.translate(0, 0.74, -0.21);
  parts.push({ geo: seat, color: [0.44, 0.31, 0.20] }, { geo: back, color: [0.44, 0.31, 0.20] });
  for (const x of [-0.72, 0.72]) {
    const l = new THREE.BoxGeometry(0.07, 0.44, 0.42); l.translate(x, 0.22, 0);
    parts.push({ geo: l, color: DARK });
  }
  return merge(parts);
}

function binGeo() {
  const b = new THREE.CylinderGeometry(0.24, 0.20, 0.72, 8); b.translate(0, 0.36, 0);
  const p = new THREE.CylinderGeometry(0.045, 0.045, 0.95, 5); p.translate(0, 0.47, -0.28);
  return merge([{ geo: b, color: [0.24, 0.28, 0.24] }, { geo: p, color: DARK }]);
}

// Светофор Т.1 на консоли: стойка, вынос над полотном и головка из трёх линз.
// Раньше это была палка с коробочкой — над дорогой ничего не висело, и на
// перекрёстке светофор было не видно из машины.
function trafficGeo() {
  const parts = [];
  const BODY = [0.10, 0.11, 0.12];
  const pole = new THREE.CylinderGeometry(0.075, 0.10, 5.4, 8); pole.translate(0, 2.7, 0);
  parts.push({ geo: pole, color: DARK });
  // консоль загибается над проезжей частью — в сторону, куда светит головка
  const arm = new THREE.CylinderGeometry(0.055, 0.065, 2.6, 6);
  arm.rotateZ(Math.PI / 2); arm.translate(1.25, 5.28, 0);
  const knee = new THREE.SphereGeometry(0.075, 6, 5); knee.translate(0, 5.28, 0);
  parts.push({ geo: arm, color: DARK }, { geo: knee, color: DARK });

  // основная головка — на конце консоли, линзами навстречу потоку
  const head = new THREE.BoxGeometry(0.34, 0.98, 0.28); head.translate(2.4, 4.72, 0);
  const visorTop = new THREE.BoxGeometry(0.40, 0.04, 0.12); visorTop.translate(2.4, 5.22, 0.09);
  parts.push({ geo: head, color: BODY }, { geo: visorTop, color: BODY });
  const cols = [[0.78, 0.12, 0.09], [0.80, 0.62, 0.10], [0.14, 0.60, 0.24]];
  cols.forEach((c, i) => {
    const l = new THREE.CylinderGeometry(0.098, 0.098, 0.06, 10);
    l.rotateX(Math.PI / 2); l.translate(2.4, 5.05 - i * 0.29, 0.16);
    parts.push({ geo: l, color: c });
    // козырёк над линзой — по нему светофор и узнаётся с любого расстояния
    const v = new THREE.BoxGeometry(0.26, 0.03, 0.10);
    v.translate(2.4, 5.05 - i * 0.29 + 0.115, 0.20);
    parts.push({ geo: v, color: BODY });
  });

  // пешеходная головка П.1 на самой стойке, ниже и на 90° к основной
  const ped = new THREE.BoxGeometry(0.30, 0.62, 0.26); ped.translate(0, 2.95, 0.20);
  parts.push({ geo: ped, color: BODY });
  [[0.78, 0.12, 0.09], [0.14, 0.60, 0.24]].forEach((c, i) => {
    const l = new THREE.BoxGeometry(0.19, 0.19, 0.04);
    l.translate(0, 3.10 - i * 0.28, 0.34);
    parts.push({ geo: l, color: c });
  });
  return merge(parts);
}

// ---------------------------------------------------------------- знаки ПДД
// Щиток рисуем на холсте: круг, треугольник, восьмиугольник и цифры не собрать
// из коробок так, чтобы знак читался с двадцати метров. Один атлас 512×512,
// восемь клеток по 128 — весь набор.
const SIGN_CELL = 256, SIGN_COLS = 4, SIGN_ROWS = 3;
const CELL_GREY = 8;      // ровная серая клетка: изнанка щитка и сама стойка
function signAtlas() {
  const cv = document.createElement('canvas');
  cv.width = SIGN_CELL * SIGN_COLS; cv.height = SIGN_CELL * SIGN_ROWS;
  const g = cv.getContext('2d');
  const cell = (i, draw) => {
    g.save();
    g.translate((i % SIGN_COLS) * SIGN_CELL, Math.floor(i / SIGN_COLS) * SIGN_CELL);
    g.beginPath(); g.rect(0, 0, SIGN_CELL, SIGN_CELL); g.clip();
    g.fillStyle = '#6d7075'; g.fillRect(0, 0, SIGN_CELL, SIGN_CELL);   // поле вокруг щитка
    draw(g, SIGN_CELL);
    g.restore();
  };
  // Цвета по ГОСТ Р 52290: синий, красный и белый дорожных знаков.
  const BLUE = '#1f4e9c', RED = '#c1272d', WHITE = '#f0eee7', BLACK = '#14161a';

  // равносторонний треугольник, вписанный в поле; up=true — вершиной вверх
  const tri = (g, S, up, fill, edge, pad) => {
    const cx = S / 2, R = S * (0.5 - pad);
    const pts = [];
    for (let i = 0; i < 3; i++) {
      const a = (up ? -Math.PI / 2 : Math.PI / 2) + i * 2.0944;
      pts.push([cx + Math.cos(a) * R, S * 0.52 + Math.sin(a) * R]);
    }
    const round = (r) => {
      g.beginPath();
      for (let i = 0; i < 3; i++) {
        const p0 = pts[i], p1 = pts[(i + 1) % 3];
        i ? g.lineTo(p0[0], p0[1]) : g.moveTo(p0[0], p0[1]);
        g.lineTo(p1[0], p1[1]);
      }
      g.closePath();
      g.lineJoin = 'round'; g.lineWidth = r;
    };
    round(S * 0.06); g.fillStyle = edge; g.strokeStyle = edge; g.fill(); g.stroke();
    g.save(); g.translate(cx, S * 0.52); g.scale(0.74, 0.74); g.translate(-cx, -S * 0.52);
    round(S * 0.06); g.fillStyle = fill; g.strokeStyle = fill; g.fill(); g.stroke();
    g.restore();
  };
  // силуэт идущего человека — как на знаке 5.19: шаг, рука отведена назад
  const walker = (g, S, cx, cy, h, col) => {
    const u = h / 100;                       // человек высотой h пикселей
    g.fillStyle = col; g.strokeStyle = col;
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.arc(cx + 2 * u, cy - 40 * u, 10 * u, 0, 7); g.fill();   // голова
    g.lineWidth = 15 * u;                                                    // корпус
    g.beginPath(); g.moveTo(cx + 2 * u, cy - 28 * u); g.lineTo(cx - 2 * u, cy - 2 * u); g.stroke();
    g.lineWidth = 9 * u;                                                     // руки
    g.beginPath(); g.moveTo(cx + 1 * u, cy - 24 * u); g.lineTo(cx + 20 * u, cy - 8 * u); g.stroke();
    g.beginPath(); g.moveTo(cx + 1 * u, cy - 22 * u); g.lineTo(cx - 17 * u, cy - 30 * u); g.stroke();
    g.lineWidth = 11 * u;                                                    // ноги в шаге
    g.beginPath(); g.moveTo(cx - 1 * u, cy - 4 * u); g.lineTo(cx + 16 * u, cy + 34 * u); g.stroke();
    g.beginPath(); g.moveTo(cx - 1 * u, cy - 4 * u); g.lineTo(cx - 18 * u, cy + 12 * u);
    g.lineTo(cx - 20 * u, cy + 34 * u); g.stroke();
  };

  // 5.19.1 — пешеходный переход: синий квадрат, белый треугольник,
  // внутри человек, идущий по зебре. Полоски обязательны, без них знак
  // читается как что угодно.
  cell(0, (g, S) => {
    g.fillStyle = BLUE; g.fillRect(S * 0.03, S * 0.03, S * 0.94, S * 0.94);
    g.fillStyle = WHITE;
    g.beginPath(); g.moveTo(S / 2, S * 0.12); g.lineTo(S * 0.90, S * 0.88);
    g.lineTo(S * 0.10, S * 0.88); g.closePath(); g.fill();
    g.save();
    g.beginPath(); g.moveTo(S / 2, S * 0.12); g.lineTo(S * 0.90, S * 0.88);
    g.lineTo(S * 0.10, S * 0.88); g.closePath(); g.clip();
    g.fillStyle = BLACK;                                   // зебра под ногами
    for (let i = 0; i < 4; i++) g.fillRect(S * (0.16 + i * 0.19), S * 0.74, S * 0.10, S * 0.16);
    walker(g, S, S * 0.50, S * 0.60, 88, BLACK);
    g.restore();
  });
  // 2.4 — уступите дорогу
  cell(1, (g, S) => tri(g, S, false, WHITE, RED, 0.04));
  // 2.5 — STOP: красный восьмиугольник с белой каймой
  cell(2, (g, S) => {
    const oct = (R, col) => {
      g.fillStyle = col; g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i + 0.5) * Math.PI / 4;
        const x = S / 2 + Math.cos(a) * R, y = S / 2 + Math.sin(a) * R;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath(); g.fill();
    };
    oct(S * 0.48, WHITE); oct(S * 0.435, RED);
    g.fillStyle = WHITE; g.font = 'bold ' + (S * 0.26) + 'px "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('STOP', S / 2, S * 0.52);
  });
  // 1.17 — искусственная неровность
  cell(3, (g, S) => {
    tri(g, S, true, WHITE, RED, 0.04);
    g.fillStyle = BLACK;
    g.beginPath();
    g.moveTo(S * 0.30, S * 0.70);
    g.quadraticCurveTo(S * 0.50, S * 0.40, S * 0.70, S * 0.70);
    g.lineTo(S * 0.70, S * 0.745); g.lineTo(S * 0.30, S * 0.745); g.closePath(); g.fill();
    g.fillRect(S * 0.24, S * 0.745, S * 0.52, S * 0.035);
  });
  // 8.23 — фотовидеофиксация: белая табличка с чёрной камерой
  cell(4, (g, S) => {
    g.fillStyle = WHITE; g.fillRect(S * 0.04, S * 0.20, S * 0.92, S * 0.60);
    g.strokeStyle = BLACK; g.lineWidth = S * 0.035;
    g.strokeRect(S * 0.075, S * 0.235, S * 0.85, S * 0.53);
    g.fillStyle = BLACK;
    g.fillRect(S * 0.22, S * 0.42, S * 0.36, S * 0.22);
    g.fillRect(S * 0.30, S * 0.355, S * 0.14, S * 0.07);
    g.beginPath(); g.moveTo(S * 0.58, S * 0.465); g.lineTo(S * 0.74, S * 0.385);
    g.lineTo(S * 0.74, S * 0.675); g.lineTo(S * 0.58, S * 0.595); g.closePath(); g.fill();
    g.beginPath(); g.arc(S * 0.34, S * 0.53, S * 0.055, 0, 7); g.fillStyle = WHITE; g.fill();
  });
  // 3.24 — ограничение скорости, три номинала
  [40, 5, 60].forEach((v, i) => cell(5 + i, (g, S) => {
    g.fillStyle = RED; g.beginPath(); g.arc(S / 2, S / 2, S * 0.47, 0, 7); g.fill();
    g.fillStyle = WHITE; g.beginPath(); g.arc(S / 2, S / 2, S * 0.355, 0, 7); g.fill();
    g.fillStyle = BLACK; g.font = 'bold ' + (S * 0.40) + 'px "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(v), S / 2, S * 0.53);
  }));
  // серая клетка под стойку и изнанку щитка
  cell(CELL_GREY, (g, S) => { g.fillStyle = '#6d7075'; g.fillRect(0, 0, S, S); });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Щиток на стойке одной геометрией: и труба, и обе стороны таблички берут
// цвет из атласа, поэтому на весь тип знака уходит один вызов отрисовки.
// Стойка и изнанка смотрят в серую клетку.
function signGeo(cellIndex) {
  const P = [], N = [], U = [];
  const uvOf = (c, u, v) => [
    ((c % SIGN_COLS) + u) / SIGN_COLS,
    1 - (Math.floor(c / SIGN_COLS) + 1 - v) / SIGN_ROWS,
  ];
  // произвольная геометрия Three -> наши массивы, все UV в одну клетку
  const pushGeo = (geo, cell) => {
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    const idx = geo.index ? geo.index.array : null;
    const n = idx ? idx.length : pos.count;
    const [cu, cv] = uvOf(cell, 0.5, 0.5);
    for (let i = 0; i < n; i++) {
      const k = idx ? idx[i] : i;
      P.push(pos.getX(k), pos.getY(k), pos.getZ(k));
      N.push(nor.getX(k), nor.getY(k), nor.getZ(k));
      U.push(cu, cv);
    }
  };
  // Стойка кончается ТАМ, где начинается щиток, а щиток вынесен вперёд на
  // 7.5 см: раньше труба радиусом 4.5 см стояла перед табличкой, вынесенной
  // всего на 2.5 см, и загораживала знак.
  const pole = new THREE.CylinderGeometry(0.045, 0.058, 2.22, 8);
  pole.translate(0, 1.11, 0);
  pushGeo(pole.toNonIndexed(), CELL_GREY);

  // щиток 0.7 м — малый типоразмер; лицо смотрит в локальный +z
  const S = 0.45, Y = 2.62, T = 0.075;
  const quad = [[-S, -S], [S, -S], [S, S], [-S, -S], [S, S], [-S, S]];
  const uvs = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
  for (let i = 0; i < 6; i++) {                 // лицо
    P.push(quad[i][0], Y + quad[i][1], T); N.push(0, 0, 1);
    const [u, v] = uvOf(cellIndex, uvs[i][0], uvs[i][1]); U.push(u, v);
  }
  for (let i = 5; i >= 0; i--) {                // изнанка: обратный обход
    P.push(quad[i][0], Y + quad[i][1], -T); N.push(0, 0, -1);
    const [u, v] = uvOf(CELL_GREY, 0.5, 0.5); U.push(u, v);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  return g;
}

function kioskGeo() {
  const parts = [];
  const body = new THREE.BoxGeometry(2.3, 2.5, 1.9); body.translate(0, 1.25, 0);
  const roof = new THREE.BoxGeometry(2.55, 0.12, 2.15); roof.translate(0, 2.56, 0);
  const win = new THREE.BoxGeometry(1.7, 0.95, 0.05); win.translate(0, 1.65, 0.96);
  parts.push({ geo: body, color: [0.70, 0.67, 0.60] },
              { geo: roof, color: [0.36, 0.24, 0.20] },
              { geo: win, color: [0.16, 0.22, 0.25] });
  return merge(parts);
}

function poleGeo(h, r, color) {
  const p = new THREE.CylinderGeometry(r, r * 1.25, h, 6); p.translate(0, h / 2, 0);
  return merge([{ geo: p, color }]);
}

// ---------------------------------------------------------------- вывески
// Имена остановок пишем в один атлас и раздаём строки табличкам:
// 117 отдельных текстур — это 117 лишних вызовов отрисовки.
function nameAtlas(names) {
  const COLS = 2, ROWS = Math.ceil(names.length / COLS);
  const CW = 1024, CH = 48;
  const cv = document.createElement('canvas');
  cv.width = CW * COLS; cv.height = CH * ROWS;
  const g = cv.getContext('2d');
  g.fillStyle = '#12325e'; g.fillRect(0, 0, cv.width, cv.height);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  names.forEach((n, i) => {
    const cx = (i % COLS) * CW, cy = Math.floor(i / COLS) * CH;
    g.fillStyle = '#12325e'; g.fillRect(cx, cy, CW, CH);
    g.fillStyle = '#ffffff';
    let size = 30;
    do { g.font = `600 ${size}px -apple-system, "Helvetica Neue", Arial`; size -= 2; }
    while (g.measureText(n).width > CW - 36 && size > 12);
    g.fillText(n, cx + CW / 2, cy + CH / 2 + 1);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, COLS, ROWS };
}

export function buildFurniture(furniture, terrain, roadIndex, onRoad, clearZones = []) {
  const group = new THREE.Group();
  group.name = 'furniture';
  const rand = rng(31337);
  const H = (x, z) => terrain.driveHeightAt(x, z);
  const stats = {};

  const byKind = {};
  for (const p of furniture.points) (byKind[p.k] ||= []).push(p);

  const mat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.1 });

  // ---------------- где можно стоять ----------------
  const asphalt = (x, z) => !!(onRoad && onRoad(x, z));
  const inHouse = (x, z) => !!(BUILDINGS && BUILDINGS.find(x, z));
  // Остановка привязывается только к ПРОЕЗЖЕЙ улице: тропинка в сквере и
  // лестница — не маршрут автобуса, а nearest() без фильтра цепляет именно их.
  const DRIVE = r => r.c <= 3 && r.w >= 4;

  // Габариты корпусов в локальных осях объекта: +z смотрит «лицом».
  // Проверять одну точку мало — павильон 4 м в длину: центр на тротуаре,
  // а угол уже на полосе.
  const FP = {
    shelter: [[0, 0], [-2.0, -1.2], [2.0, -1.2], [-2.0, 0.2], [2.0, 0.2], [0, -0.5]],
    kiosk:   [[0, 0], [-1.25, -1.05], [1.25, -1.05], [-1.25, 1.05], [1.25, 1.05]],
    bench:   [[0, 0], [-0.9, -0.3], [0.9, -0.3], [-0.9, 0.25], [0.9, 0.25]],
    pole:    [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]],
  };
  // поворот на a вокруг Y: локальный +z уходит в (sin a, cos a) — как у props.js
  const probe = (x, z, a, fp, f) => {
    const ca = Math.cos(a), sa = Math.sin(a);
    for (const [lx, lz] of fp)
      if (f(x + lx * ca + lz * sa, z - lx * sa + lz * ca)) return true;
    return false;
  };
  const clear = (x, z, a, fp) =>
    !probe(x, z, a, fp, (px, pz) => asphalt(px, pz) || inHouse(px, pz));

  const faceRoad = (x, z, R = 40, filter = null) => {
    const hit = roadIndex.nearest(x, z, R, filter);
    return hit ? Math.atan2(hit.x - x, hit.z - z) : null;
  };

  // Пробы сдвига вдоль улицы: сначала на месте, потом всё дальше в обе стороны.
  const ALONG = [0];
  for (let t = 4; t <= 32; t += 4) ALONG.push(t, -t);

  // Остановка в OSM — это узел платформы у дороги, и стоит он как попало:
  // 30 из 117 попадают на проезжую часть, 9 — внутрь дома. Привязываем каждую
  // к ближайшей ПРОЕЗЖЕЙ улице и ставим на её тротуар: отступ от осевой =
  // полширины полотна плюс бордюр, лицом к дороге. Если корпус не влезает —
  // отодвигаем дальше от бордюра, потом едем вдоль улицы и лишь в крайнем
  // случае переходим на другую обочину: остановка обязана остаться у дороги.
  const snapToKerb = (p, fp, base, along = false) => {
    const hit = roadIndex.nearest(p.x, p.z, 45, DRIVE) || roadIndex.nearest(p.x, p.z, 120, DRIVE);
    if (!hit) return null;
    const road = hit.road;
    // сторону берём ту, где точка лежала в данных: это единственное, что OSM
    // сообщает о платформе — на какой обочине она была
    const side0 = Math.sign((p.x - hit.x) * -hit.dirZ + (p.z - hit.z) * hit.dirX) || 1;
    // Порядок проб не случаен: своя обочина важнее всего — на ней автобус и
    // останавливается. Поэтому сперва вычерпываем её целиком (отступ от
    // бордюра, затем сдвиг вдоль улицы) и только потом идём на противоположную.
    for (const s of [side0, -side0])
      for (const t of ALONG) {
        // на сдвиге вдоль улицы заново садимся на ЕЁ ЖЕ осевую: на повороте
        // направление сегмента меняется, и отступ по старой нормали уводит в дом
        const h = t === 0 ? hit
          : (roadIndex.nearest(hit.x + hit.dirX * t, hit.z + hit.dirZ * t, 25, r => r === road) || hit);
        const nx = -h.dirZ, nz = h.dirX;
        for (let extra = 0; extra <= 3.2; extra += 0.8) {
          const d = road.w / 2 + base + extra;
          const x = h.x + nx * s * d, z = h.z + nz * s * d;
          // поперёк — лицом на осевую; вдоль — навстречу потоку своей стороны
          const a = along ? Math.atan2(-s * h.dirX, -s * h.dirZ)
                          : Math.atan2(-s * nx, -s * nz);
          if (clear(x, z, a, fp)) return { x, z, a };
        }
      }
    return null;
  };

  // Скамейку, урну и банкомат к дороге не тащим: они законно стоят в парке и во
  // дворе. Прежний offRoad искал выход только если точка лежала на асфальте, и
  // искал его вслепую — координата уезжала в стену дома. Теперь условие полное
  // (весь корпус вне асфальта И вне дома), а спираль проверяет то же, что ставит.
  const offRoad = (p, fp, angleAt) => {
    const a0 = angleAt(p.x, p.z, null);
    if (clear(p.x, p.z, a0, fp)) return { x: p.x, z: p.z, a: a0 };
    for (let r = 1; r <= 14; r++)
      for (let k = 0; k < 16; k++) {
        const t = k / 16 * Math.PI * 2;
        const x = p.x + Math.cos(t) * r, z = p.z + Math.sin(t) * r;
        // угол считаем для КАЖДОГО кандидата и проверяем вместе с ним: повернуть
        // корпус после проверки — значит проверить не то, что поставили
        const a = angleAt(x, z, Math.atan2(x - p.x, z - p.z));
        if (clear(x, z, a, fp)) return { x, z, a };
      }
    // выхода нет — оставляем на месте: утонуть в стене лучше, чем улететь за квартал
    return { x: p.x, z: p.z, a: a0 };
  };

  let movedTotal = 0, movedMax = 0;
  // place(p) → {x, z, a}. Возвращаем расставленный список: таблички остановок
  // должны сесть на ИТОГОВЫЕ места, раньше они висели по исходным точкам OSM
  // и разъезжались с павильонами.
  const put = (kind, geo, list, place) => {
    if (!list?.length) return [];
    const m = new THREE.InstancedMesh(geo, mat(), list.length);
    m.castShadow = true;
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(),
          up = new THREE.Vector3(0, 1, 0), pv = new THREE.Vector3(), sv = new THREE.Vector3(1, 1, 1);
    const out = [];
    list.forEach((p0, i) => {
      const r = place(p0) || { x: p0.x, z: p0.z, a: rand() * 6.283 };
      const dm = Math.hypot(r.x - p0.x, r.z - p0.z);
      if (dm > 0.05) { movedTotal++; if (dm > movedMax) movedMax = dm; }
      pv.set(r.x, H(r.x, r.z), r.z);
      q.setFromAxisAngle(up, r.a);
      m.setMatrixAt(i, mx.compose(pv, q, sv));
      out.push({ ...p0, x: r.x, z: r.z, a: r.a });
    });
    m.instanceMatrix.needsUpdate = true;
    group.add(m);
    stats[kind] = list.length;
    return out;
  };

  const anyAngle = () => rand() * 6.283;

  const stops = put('остановки', shelterGeo(), byKind.bus_stop,
    p => snapToKerb(p, FP.shelter, 1.2)
      || offRoad(p, FP.shelter, (x, z) => faceRoad(x, z, 60) ?? anyAngle()));
  // скамейка садится лицом к ближайшей дороге ИЛИ дорожке — в сквере это аллея
  put('скамейки', benchGeo(), byKind.bench,
    p => offRoad(p, FP.bench, (x, z) => faceRoad(x, z, 30) ?? anyAngle()));
  put('урны', binGeo(), byKind.bin, p => offRoad(p, FP.pole, anyAngle));
  // Светофор в OSM отмечен узлом на пересечении осевых, ровно посреди
  // перекрёстка — там на асфальте стоят все 14. Выносим на бордюр и
  // разворачиваем ВДОЛЬ улицы, навстречу потоку: линзами поперёк дороги,
  // как было раньше, светофор смотреть не может.
  put('светофоры', trafficGeo(), byKind.traffic_light,
    p => snapToKerb(p, FP.pole, 0.9, true) || offRoad(p, FP.pole, anyAngle));

  // ---------------- знаки ПДД ----------------
  // Ставим так же, как светофор: на бордюр своей стороны, щитком навстречу
  // потоку. Знак вне обочины бессмыслен, поэтому если бордюра не нашлось —
  // объект просто не рисуем, а не бросаем его посреди газона.
  {
    const atlas = signAtlas();
    const signMat = () => new THREE.MeshStandardMaterial({
      map: atlas, roughness: 0.55, metalness: 0.05, side: THREE.FrontSide,
    });
    // знак → клетка атласа. У ограничения скорости клетка зависит от номинала.
    const CELL = { sign_crossing: 0, sign_yield: 1, sign_stop: 2, sign_bump: 3, sign_camera: 4 };
    const speedCell = v => v <= 20 ? 6 : v >= 60 ? 7 : 5;
    const groups = new Map();          // клетка → список мест
    let skipped = 0;
    for (const kind of ['sign_crossing', 'sign_yield', 'sign_stop', 'sign_bump', 'sign_camera', 'sign_speed']) {
      for (const p of byKind[kind] || []) {
        const r = snapToKerb(p, FP.pole, 0.75, true);
        if (!r) { skipped++; continue; }
        const c = kind === 'sign_speed' ? speedCell(p.v || 40) : CELL[kind];
        (groups.get(c) || groups.set(c, []).get(c)).push(r);
      }
    }
    let total = 0;
    for (const [c, list] of groups) {
      const m = new THREE.InstancedMesh(signGeo(c), signMat(), list.length);
      m.castShadow = true;
      const mx = new THREE.Matrix4(), q = new THREE.Quaternion(),
            up = new THREE.Vector3(0, 1, 0), pv = new THREE.Vector3(), sv = new THREE.Vector3(1, 1, 1);
      list.forEach((r, i) => {
        pv.set(r.x, H(r.x, r.z), r.z);
        q.setFromAxisAngle(up, r.a);
        m.setMatrixAt(i, mx.compose(pv, q, sv));
      });
      m.instanceMatrix.needsUpdate = true;
      group.add(m);
      total += list.length;
    }
    stats['знаки'] = total;
    if (skipped) stats['знаки без обочины'] = skipped;
  }
  // «Киоск» — это банкомат, автомат или таксофон, а OSM вешает их узлом на
  // стену: 74 из 94 лежат внутри контура дома, где коробка просто тонет.
  // Выталкиваем наружу и разворачиваем ОТ стены, лицом на улицу.
  put('киоски', kioskGeo(), byKind.kiosk,
    p => offRoad(p, FP.kiosk, (x, z, out) => out ?? faceRoad(x, z, 45) ?? anyAngle()));
  put('павильоны', shelterGeo(), byKind.shelter,
    p => offRoad(p, FP.shelter, (x, z) => faceRoad(x, z, 40) ?? anyAngle()));
  put('почта', binGeo(), byKind.postbox, p => offRoad(p, FP.pole, anyAngle));
  put('флагштоки', poleGeo(8.5, 0.09, [0.78, 0.78, 0.76]), byKind.flagpole,
    p => offRoad(p, FP.pole, anyAngle));
  put('фонари OSM', poleGeo(7.5, 0.10, STEEL), byKind.lamp, p => offRoad(p, FP.pole, anyAngle));

  // ---------------- замер: остановки на асфальте до и после ----------------
  // Растр тот же самый, что у дорог, деревьев и аудита (world.__coverage →
  // onRoad), иначе «было» и «стало» меряются разными линейками.
  {
    const raw = byKind.bus_stop || [];
    const ang = p => p.a ?? (faceRoad(p.x, p.z, 40) ?? 0);
    const pt = (list, f) => list.filter(p => f(p.x, p.z)).length;
    const body = (list, f) => list.filter(p => probe(p.x, p.z, ang(p), FP.shelter, f)).length;
    stats['остановки на асфальте'] = `${pt(raw, asphalt)} → ${pt(stops, asphalt)}`;
    stats['остановки в доме'] = `${pt(raw, inHouse)} → ${pt(stops, inHouse)}`;
    stats['павильон задевает асфальт или дом'] =
      `${body(raw, (x, z) => asphalt(x, z) || inHouse(x, z))} → `
      + `${body(stops, (x, z) => asphalt(x, z) || inHouse(x, z))}`;
    stats['переставлено объектов'] = `${movedTotal} (макс сдвиг ${movedMax.toFixed(1)} м)`;
    if (!BUILDINGS) stats['контуры домов'] = 'не загрузились — проверка по домам пропущена';
  }

  // ---------------- таблички с именами остановок ----------------
  const named = stops.filter(p => p.n);
  if (named.length) {
    const { tex, COLS, ROWS } = nameAtlas(named.map(p => p.n));
    const P = [], N = [], U = [], I = [];
    const W = 2.6, Hh = 0.42, Y = 2.85;
    named.forEach((p, i) => {
      const a = p.a;                                   // тот же угол, что у павильона
      const ux = Math.cos(a), uz = -Math.sin(a);       // вдоль таблички
      const y = H(p.x, p.z) + Y;
      const base = P.length / 3;
      const cu = (i % COLS) / COLS, cv = 1 - Math.floor(i / COLS) / ROWS;
      for (const [sx, sy] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) {
        P.push(p.x + ux * W / 2 * sx, y + Hh * sy, p.z + uz * W / 2 * sx);
        N.push(Math.sin(a), 0, Math.cos(a));
        U.push(cu + (sx > 0 ? 1 / COLS : 0), cv - (sy ? 0 : 1 / ROWS));
      }
      I.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I);
    const signs = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide,
    }));
    signs.name = 'stop-names';
    group.add(signs);
    stats['таблички'] = named.length;
  }

  // ---------------- заборы и подпорные стены ----------------
  const SPEC = {
    fence:          { h: 1.55, t: 0.06, c: [0.30, 0.33, 0.31] },
    wall:           { h: 2.05, t: 0.30, c: [0.71, 0.67, 0.59] },
    city_wall:      { h: 3.20, t: 0.55, c: [0.68, 0.64, 0.56] },
    retaining_wall: { h: 2.35, t: 0.45, c: [0.66, 0.62, 0.55] },
    hedge:          { h: 1.25, t: 0.55, c: [0.24, 0.35, 0.19] },
    handrail:       { h: 1.00, t: 0.05, c: [0.38, 0.40, 0.40] },
    guard_rail:     { h: 0.78, t: 0.08, c: [0.62, 0.62, 0.60] },
  };
  const BP = [], BN = [], BC = [], BI = [];
  let bn = 0;
  // Подпорные стены OSM идут и там, где мы поставили лестницу собора: забор
  // перерезал марш поперёк. Вокруг таких мест их не строим.
  const inClear = (x, z) => clearZones.some(c => (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r);
  for (const b of furniture.barriers) {
    const sp = SPEC[b.k];
    if (!sp) continue;
    const p = b.pts;
    for (let i = 0; i < p.length / 2 - 1; i++) {
      const ax = p[i * 2], az = p[i * 2 + 1], bx = p[i * 2 + 2], bz = p[i * 2 + 3];
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      if (L < 0.4 || L > 120) continue;
      // дробим длинные пролёты, иначе стена уезжает от земли посреди участка
      const steps = Math.max(1, Math.ceil(L / 5));
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps, t1 = (s + 1) / steps;
        const x0 = ax + dx * t0, z0 = az + dz * t0, x1 = ax + dx * t1, z1 = az + dz * t1;
        if (inClear((x0 + x1) / 2, (z0 + z1) / 2)) continue;
        const nx = -dz / L * sp.t / 2, nz = dx / L * sp.t / 2;
        const g0 = terrain.gridHeightAt(x0, z0), g1 = terrain.gridHeightAt(x1, z1);
        const q = [
          [x0 + nx, g0, z0 + nz], [x1 + nx, g1, z1 + nz],
          [x1 - nx, g1, z1 - nz], [x0 - nx, g0, z0 - nz],
        ];
        const base = bn;
        for (const [vx, vy, vz] of q) { BP.push(vx, vy - 0.25, vz); BN.push(0, 1, 0); BC.push(...sp.c); bn++; }
        for (const [vx, vy, vz] of q) { BP.push(vx, vy + sp.h, vz); BN.push(0, 1, 0); BC.push(...sp.c); bn++; }
        for (let e = 0; e < 4; e++) {
          const a0 = base + e, a1 = base + (e + 1) % 4;
          BI.push(a0, a1, a1 + 4, a0, a1 + 4, a0 + 4);
        }
        BI.push(base + 4, base + 5, base + 6, base + 4, base + 6, base + 7);
      }
    }
  }
  if (BI.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(BP, 3));
    g.setAttribute('color', new THREE.Uint8BufferAttribute(BC.map(v => Math.round(255 * s2l(v))), 3, true));
    g.setIndex(BI);
    g.computeVertexNormals();
    const walls = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94 }));
    walls.castShadow = true; walls.receiveShadow = true; walls.name = 'barriers';
    group.add(walls);
    stats['заборы и стены'] = furniture.barriers.length;
  }

  group.userData.stats = stats;
  return group;
}
