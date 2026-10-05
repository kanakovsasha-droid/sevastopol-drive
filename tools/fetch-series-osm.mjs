// Подсказки для серий типовых домов (tools/build-series.mjs) из OSM.
//
//   node tools/fetch-series-osm.mjs     → data/series-osm.json
//
// В чанках у дома остаются только высота, тип и пятно — этого мало, чтобы
// отличить хрущёвку от цеха или корпуса больницы такой же формы. Здесь —
// то, что в чанки не попало:
//  - участки: landuse (жилая застройка, промзона, торговля, военные, гаражи)
//    и территории больниц, школ, садиков, вузов — пятно внутри такого
//    участка хрущёвкой не делаем;
//  - теги самих домов: год постройки, материал, назначение (amenity, shop,
//    office, healthcare…).
// Формат: { v, land: [[вид, [x,z,…]], …], b: { w<id>: { y?, m?, u? } }, pass: [[x,z,…]] },
// pass — осевые проездов под домами (tunnel=building_passage);
// вид участка: res — жильё, ind — промзона, com — торговля и офисы,
// mil — военные, gar — гаражи, inst — больница/школа/сад/вуз/тюрьма.
import { writeFileSync } from 'node:fs';
import { BBOX, project } from './config.mjs';
const OUT = new URL('../data/series-osm.json', import.meta.url).pathname;
const bb = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
const Q = `[out:json][timeout:240];
(
  way["landuse"~"^(residential|industrial|commercial|retail|military|garages|railway|construction)$"](${bb});
  relation["landuse"~"^(residential|industrial|commercial|retail|military|garages|railway)$"](${bb});
  way["amenity"~"^(hospital|clinic|school|kindergarten|university|college|prison)$"](${bb});
  relation["amenity"~"^(hospital|clinic|school|kindergarten|university|college|prison)$"](${bb});
  way["military"](${bb});
  way["tunnel"="building_passage"](${bb});
);
out geom qt;
way["building"](${bb});
out tags qt;`;
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const HEADERS = { 'User-Agent': 'sevastopol-game/0.1 (personal hobby project)', Accept: 'application/json', 'Accept-Language': 'en' };
const R1 = v => Math.round(v * 10) / 10;
const LAND = { residential: 'res', industrial: 'ind', commercial: 'com', retail: 'com', military: 'mil',
               garages: 'gar', railway: 'ind', construction: 'ind' };
const INST = /^(hospital|clinic|school|kindergarten|university|college|prison)$/;
const geomPoly = g => {
  const p = [];
  for (const q of g || []) { const r = project(q.lat, q.lon); p.push(R1(r.x), R1(r.z)); }
  return p.length >= 6 ? p : null;
};
const year = s => { const m = /(1[89]\d\d|20\d\d)/.exec(s || ''); return m ? +m[1] : 0; };

for (const ep of ENDPOINTS) {
  process.stdout.write(ep + ' ... ');
  try {
    const res = await fetch(ep, { method: 'POST', body: new URLSearchParams({ data: Q }), headers: HEADERS });
    if (!res.ok) { console.log('HTTP ' + res.status); continue; }
    const text = await res.text();
    if (!text.trimStart().startsWith('{')) { console.log('не JSON'); continue; }
    const j = JSON.parse(text);
    const land = [], b = {}, pass = [], count = {};
    for (const e of j.elements) {
      const t = e.tags || {};
      if (t.building) {
        // дом: только то, что помогает серии
        const r = {};
        const y = year(t['building:start_date'] || t.start_date);
        if (y) r.y = y;
        if (t['building:material']) r.m = t['building:material'];
        const use = (INST.test(t.amenity || '') && t.amenity) || (t.amenity && 'amenity') || (t.shop && 'shop') ||
                    (t.office && 'office') || (t.healthcare && 'clinic') || (t.tourism && 'tourism') || null;
        if (use) r.u = use;
        if (Object.keys(r).length) { b['w' + e.id] = r; count.b = (count.b || 0) + 1; }
        if (e.type === 'way' && !t.landuse && !t.amenity) continue;
      }
      if (t.tunnel === 'building_passage' && e.type === 'way') {
        // проезд под домом: осевая (арка, build-series.mjs)
        const p = geomPoly(e.geometry) || (e.geometry && e.geometry.length === 2 ? e.geometry.flatMap(q => { const r = project(q.lat, q.lon); return [R1(r.x), R1(r.z)]; }) : null);
        if (p) { pass.push(p); count.pass = (count.pass || 0) + 1; }
        continue;
      }
      const kind = INST.test(t.amenity || '') ? 'inst' : t.military ? 'mil' : LAND[t.landuse];
      if (!kind) continue;
      const rings = e.type === 'way' ? [geomPoly(e.geometry)]
        : (e.members || []).filter(m => m.type === 'way' && m.role !== 'inner' && m.geometry && m.geometry.length > 3 &&
            m.geometry[0].lat === m.geometry[m.geometry.length - 1].lat && m.geometry[0].lon === m.geometry[m.geometry.length - 1].lon)
            .map(m => geomPoly(m.geometry));   // кольцо, собранное из кусков, пропускаем
      for (const p of rings) if (p) { land.push([kind, p]); count[kind] = (count[kind] || 0) + 1; }
    }
    writeFileSync(OUT, JSON.stringify({ v: 1, note: 'tools/fetch-series-osm.mjs: участки и теги домов для build-series.mjs', land, b, pass }));
    console.log('OK — ' + Object.entries(count).map(([k, v]) => k + ' ' + v).join(', '));
    process.exit(0);
  } catch (e) { console.log('ошибка: ' + e.message); }
}
throw new Error('Overpass недоступен');
