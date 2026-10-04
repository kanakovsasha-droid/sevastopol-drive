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
// Цен на стеле нет: они меняются и взять их неоткуда — только виды топлива.

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
  { id: 'gas',   re: /пропан|метан|агзс|агнкс|газов/i,    sign: 'ГАЗ',   col: null, gas: true },
];

// Прежние цвета АЗС (yards.js) — пока цвет сети не сверен.
export const DEFAULT_COL = { band: [0.16, 0.36, 0.24], board: [0.16, 0.36, 0.24], text: [0.95, 0.95, 0.92] };

export function brandOf(name = '') {
  const n = String(name).trim();
  for (const b of BRANDS) if (b.re.test(n)) return b;
  return null;
}

// Подпись станции: имя сети, а если сеть не узнали — имя из OSM как есть
// (короткое), иначе ничего.
export function signOf(name = '') {
  const b = brandOf(name);
  if (b) return b.sign;
  const n = String(name).trim();
  return n && n.length <= 14 ? n : '';
}

// Вывески одного квартала: все надписи — в один атлас, все щиты — одна сетка.
// items: { text, lines?, x, y, z, ang, w, h, col } — щит лицом в направлении ang
// (как BoxGeometry.rotateY(ang): лицо — локальный +z).
export function buildFuelSigns(items) {
  if (!items.length) return null;
  const CW = 512, CH = 128;
  const cv = document.createElement('canvas');
  cv.width = CW; cv.height = CH * items.length;
  const g = cv.getContext('2d');
  items.forEach((it, i) => {
    const c = it.col || DEFAULT_COL;
    const css = a => `rgb(${a.map(v => Math.round(v * 255)).join(',')})`;
    g.fillStyle = css(c.board); g.fillRect(0, i * CH, CW, CH);
    g.fillStyle = css(c.text);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (it.lines) {
      // стела: виды топлива столбиком
      const L = it.lines, h = CH / (L.length + (it.text ? 1 : 0));
      let y = i * CH + h / 2;
      if (it.text) { g.font = `800 ${Math.round(h * 0.8)}px -apple-system, Arial`; g.fillText(it.text, CW / 2, y); y += h; }
      g.font = `700 ${Math.round(h * 0.62)}px -apple-system, Arial`;
      for (const l of L) { g.fillText(l, CW / 2, y); y += h; }
    } else {
      let size = 92;
      do { g.font = `800 ${size}px -apple-system, Arial`; size -= 4; } while (g.measureText(it.text).width > CW - 40 && size > 24);
      g.fillText(it.text, CW / 2, i * CH + CH / 2 + 4);
    }
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const P = [], N = [], U = [], I = [];
  items.forEach((it, i) => {
    const ux = Math.cos(it.ang), uz = -Math.sin(it.ang);     // локальный +x после rotateY(ang)
    const fx = Math.sin(it.ang), fz = Math.cos(it.ang);      // лицо — локальный +z
    const hw = it.w / 2, hh = it.h / 2, v0 = 1 - (i + 1) / items.length, v1 = 1 - i / items.length;
    const b = P.length / 3;
    for (const [sx, sy, u, v] of [[-1, -1, 0, v0], [1, -1, 1, v0], [1, 1, 1, v1], [-1, 1, 0, v1]]) {
      P.push(it.x + ux * hw * sx, it.y + hh * sy, it.z + uz * hw * sx);
      N.push(fx, 0, fz); U.push(u, v);
    }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  geo.setIndex(I);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12 }));
  mesh.name = 'АЗС: вывески';
  return mesh;
}
