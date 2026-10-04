import * as THREE from 'three';

// АЗС: какая это сеть и чем подписать — по тегу OSM name/brand.
//
// В данных (world.fuel) имя пишут как попало: «Атан», «ATAN Россия №84»,
// «АТАН», «TES», «ТЭС», «Tes», «ТES» (латинская T + кириллица)… Сводим к сети
// по образцу и подписываем фриз навеса и стелу ЕЁ именем — тем, что сеть
// пишет на вывесках. Нет имени — стела с видами топлива без названия.
//
// Цвета сетей. Правило проекта — ничего не выдумывать; из облака сверить
// фирменные цвета не с чем (панорамы и Викисклад недоступны). Поэтому у
// каждой сети поле col = null — АЗС остаётся в прежних цветах. Заполнить по
// панорамам Яндекса: band — подзор навеса и верх колонок, board — щит стелы,
// text — надписи; всё в sRGB [r, g, b] от 0 до 1.
// Цен на стеле нет: они меняются и взять их неоткуда. Виды топлива — только
// из тегов OSM fuel:* (world.fuel[].fu) или из имени газовой заправки;
// не знаем — на стеле пустые строки табло, как было.

export const BRANDS = [
  { id: 'atan',  re: /^(атан|atan)/i,                    sign: 'АТАН',  col: null },
  { id: 'tes',   re: /^(t|т)(e|э|е)s$|^(т|t)(э|e|е)(с|s)$/i, sign: 'ТЭС', col: null },
  { id: 'snp',   re: /снп/i,                              sign: 'СНП',   col: null },
  { id: 'tnk',   re: /^тнк/i,                             sign: 'ТНК',   col: null },
  { id: 'wog',   re: /^wog$/i,                            sign: 'WOG',   col: null },
  { id: 'tatn',  re: /^татнефть/i,                        sign: 'Татнефть', col: null },
  { id: 'crs',   re: /^crs$/i,                            sign: 'CRS',   col: null },
  { id: 'barr',  re: /баррель/i,                          sign: 'Баррель', col: null },
  { id: 'form',  re: /^formula$/i,                        sign: 'Formula', col: null },
  { id: 'rs',    re: /^rs$/i,                             sign: 'RS',    col: null },
  { id: 'gas',   re: /пропан|метан|агзс|агнкс|газов/i,    sign: 'ГАЗ',   col: null },
];

// Прежние цвета АЗС (yards.js) — пока цвет сети не сверен.
export const DEFAULT_COL = { band: [0.16, 0.36, 0.24], board: [0.16, 0.36, 0.24], text: [0.95, 0.95, 0.92] };

// Сеть станции f (world.fuel): сначала по имени (оно свежее — тег brand
// нередко остался от прежнего хозяина: «Атан» с brand=ТНК), потом по brand.
export function brandOf(f) {
  for (const s of [f?.n, f?.b]) {
    const n = String(s || '').trim();
    if (n) for (const b of BRANDS) if (b.re.test(n)) return b;
  }
  return null;
}

// Подпись станции: имя сети, а если сеть не узнали — имя из OSM как есть
// (короткое), иначе ничего.
export function signOf(f) {
  const b = brandOf(f);
  if (b) return b.sign;
  const n = String(f?.n || '').trim();
  return n && n.length <= 14 ? n : '';
}

// Виды топлива для стелы: из тегов fuel:*, иначе по имени газовой заправки
// (АГНКС и «метан» — сжатый метан, АГЗС и «пропан» — пропан). Иначе пусто.
const FUEL_SIGN = { octane_92: 'АИ-92', octane_95: 'АИ-95', octane_98: 'АИ-98', octane_100: 'АИ-100', diesel: 'ДТ', lpg: 'ПРОПАН', cng: 'МЕТАН' };
export function fuelLines(f) {
  if (f?.fu?.length) return f.fu.map(k => FUEL_SIGN[k]).filter(Boolean).slice(0, 4);
  const n = String(f?.n || '');
  if (/метан|агнкс/i.test(n)) return ['МЕТАН'];
  if (/пропан|агзс/i.test(n)) return ['ПРОПАН'];
  return [];
}

// Вывески одного квартала: все надписи — в один атлас, все щиты — одна сетка.
// items: { text, lines?, x, y, z, ang, w, h, col } — щит лицом в направлении ang
// (как BoxGeometry.rotateY(ang): лицо — локальный +z).
export function buildFuelSigns(items) {
  if (!items.length) return null;
  // Ячейка атласа — в пропорциях щита (иначе надпись на почти квадратной
  // стеле сплющена, а на длинном фризе растянута). Одинаковые щиты (две
  // стороны навеса, две стороны стелы) делят одну ячейку.
  const CW = 384, cells = new Map();
  let H = 0;
  for (const it of items) {
    const key = JSON.stringify([it.text, it.lines, it.col, it.w, it.h]);
    let c = cells.get(key);
    if (!c) {
      c = { it, h: Math.max(24, Math.min(512, Math.round(CW * it.h / it.w))) };
      c.y = H; H += c.h; cells.set(key, c);
    }
    it.cell = c;
  }
  // Высота холста не больше 8192: если щитов много — всё мельче
  const k = Math.min(1, 8192 / H);
  const cv = document.createElement('canvas');
  cv.width = Math.round(CW * k); cv.height = Math.ceil(H * k);
  const g = cv.getContext('2d');
  g.scale(k, k);
  const css = a => `rgb(${a.map(v => Math.round(v * 255)).join(',')})`;
  const fit = (text, size, maxW, w8 = 800) => {
    do { g.font = `${w8} ${size}px -apple-system, Arial`; size -= 2; } while (g.measureText(text).width > maxW && size > 8);
  };
  for (const { it, y: y0, h: CH } of cells.values()) {
    const c = it.col || DEFAULT_COL;
    g.fillStyle = css(c.board); g.fillRect(0, y0, CW, CH);
    g.fillStyle = css(c.text);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (it.lines) {
      // стела: имя сети, под ним виды топлива столбиком; видов не знаем —
      // три пустые строки табло
      const L = it.lines.length ? it.lines : [null, null, null], h = CH / (L.length + (it.text ? 1.4 : 0));
      let y = y0;
      if (it.text) { fit(it.text, Math.round(h * 0.95), CW * 0.9); g.fillText(it.text, CW / 2, y + h * 0.7); y += h * 1.4; }
      for (const l of L) {
        if (l) { fit(l, Math.round(h * 0.6), CW * 0.85, 700); g.fillText(l, CW / 2, y + h / 2); }
        else g.fillRect(CW * 0.1, y + h * 0.22, CW * 0.8, h * 0.56);
        y += h;
      }
    } else {
      fit(it.text, Math.round(CH * 0.78), CW * 0.9);
      g.fillText(it.text, CW / 2, y0 + CH / 2 + CH * 0.04);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const P = [], N = [], U = [], I = [];
  for (const it of items) {
    const ux = Math.cos(it.ang), uz = -Math.sin(it.ang);     // локальный +x после rotateY(ang)
    const fx = Math.sin(it.ang), fz = Math.cos(it.ang);      // лицо — локальный +z
    const hw = it.w / 2, hh = it.h / 2, v0 = 1 - (it.cell.y + it.cell.h) / H, v1 = 1 - it.cell.y / H;
    const b = P.length / 3;
    for (const [sx, sy, u, v] of [[-1, -1, 0, v0], [1, -1, 1, v0], [1, 1, 1, v1], [-1, 1, 0, v1]]) {
      P.push(it.x + ux * hw * sx, it.y + hh * sy, it.z + uz * hw * sx);
      N.push(fx, 0, fz); U.push(u, v);
    }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    delete it.cell;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  geo.setIndex(I);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12 }));
  mesh.name = 'АЗС: вывески';
  return mesh;
}
