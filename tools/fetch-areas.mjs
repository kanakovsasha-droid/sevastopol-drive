// Парковки, беговые дорожки и спортплощадки отдельным файлом: в основном
// запросе их нет, а перекачивать osm-raw.json целиком ради них незачем.
import { writeFileSync } from 'node:fs';
import { BBOX, project } from './config.mjs';
const OUT = new URL('../data/areas.json', import.meta.url).pathname;
const bb = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
const Q = `[out:json][timeout:180];
(
  way["amenity"="parking"](${bb});
  way["leisure"~"^(track|pitch|sports_centre|stadium|playground)$"](${bb});
  way["landuse"="cemetery"](${bb});
  way["amenity"="grave_yard"](${bb});
  way["amenity"="fuel"](${bb});
  node["amenity"="fuel"](${bb});
);
out body;
>;
out skel qt;`;
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const HEADERS = { 'User-Agent': 'sevastopol-game/0.1 (personal hobby project)', Accept: 'application/json', 'Accept-Language': 'en' };
const R1 = v => Math.round(v * 10) / 10;
for (const ep of ENDPOINTS) {
  process.stdout.write(ep + ' ... ');
  try {
    const res = await fetch(ep, { method: 'POST', body: new URLSearchParams({ data: Q }), headers: HEADERS });
    if (!res.ok) { console.log('HTTP ' + res.status); continue; }
    const text = await res.text();
    if (!text.trimStart().startsWith('{')) { console.log('не JSON'); continue; }
    const j = JSON.parse(text);
    const nodes = new Map();
    for (const e of j.elements) if (e.type === 'node') nodes.set(e.id, e);
    const out = { parking: [], sport: [], cemetery: [], fuel: [] };
    const count = {};
    // АЗС часто отмечена одним узлом, а не контуром — берём и такие
    for (const e of j.elements) {
      if (e.type === 'node' && e.tags?.amenity === 'fuel') {
        const p = project(e.lat, e.lon);
        out.fuel.push({ x: R1(p.x), z: R1(p.z), n: e.tags['name:ru'] || e.tags.name || e.tags.brand || null });
        count.fuel = (count.fuel || 0) + 1;
      }
      if (e.type !== 'way' || !e.tags) continue;
      const t = e.tags;
      const pts = [];
      for (const id of e.nodes || []) {
        const n = nodes.get(id);
        if (!n) { pts.length = 0; break; }
        const p = project(n.lat, n.lon);
        pts.push(R1(p.x), R1(p.z));
      }
      if (pts.length < 8) continue;
      const nm = t['name:ru'] || t.name;
      const rec = { poly: pts, ...(nm ? { n: nm } : {}) };
      if (t.amenity === 'fuel') {
        let cx = 0, cz = 0; const nn = pts.length / 2;
        for (let k = 0; k < nn; k++) { cx += pts[k * 2]; cz += pts[k * 2 + 1]; }
        out.fuel.push({ x: R1(cx / nn), z: R1(cz / nn), poly: pts, ...(nm ? { n: nm } : {}), brand: t.brand || null });
        count.fuel = (count.fuel || 0) + 1;
      } else if (t.amenity === 'parking') {
        rec.surface = t.surface || null;
        rec.capacity = t.capacity ? parseInt(t.capacity, 10) : null;
        out.parking.push(rec); count.parking = (count.parking || 0) + 1;
      } else if (t.landuse === 'cemetery' || t.amenity === 'grave_yard') {
        out.cemetery.push(rec); count.cemetery = (count.cemetery || 0) + 1;
      } else {
        rec.k = t.leisure;
        rec.sport = t.sport || null;
        rec.surface = t.surface || null;
        out.sport.push(rec); count[t.leisure] = (count[t.leisure] || 0) + 1;
      }
    }
    writeFileSync(OUT, JSON.stringify(out));
    console.log('OK — ' + Object.entries(count).map(([k, v]) => k + ' ' + v).join(', '));
    process.exit(0);
  } catch (e) { console.log('ошибка: ' + e.message); }
}
throw new Error('Overpass недоступен');
