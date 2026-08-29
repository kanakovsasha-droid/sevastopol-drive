import { writeFileSync } from 'node:fs';
import { BBOX, project } from './config.mjs';
const bb = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
const Q = `[out:json][timeout:120];
(
  node["historic"~"^(monument|memorial|castle|fort|ruins)$"](${bb});
  node["tourism"~"^(attraction|viewpoint|museum)$"](${bb});
  node["amenity"~"^(townhall|theatre|university|hospital)$"](${bb});
  node["railway"="station"](${bb});
  node["amenity"="ferry_terminal"](${bb});
  node["place"~"^(square|suburb|neighbourhood)$"](${bb});
  way["historic"~"^(monument|memorial|fort)$"](${bb});
  way["tourism"~"^(attraction|museum)$"](${bb});
  way["leisure"="park"]["name"](${bb});
  way["place"="square"](${bb});
);
out center tags;`;
const res = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST', body: new URLSearchParams({ data: Q }),
  headers: { 'User-Agent': 'sevastopol-game/0.1', 'Accept': 'application/json', 'Accept-Language': 'en' },
});
const j = await res.json();
const pois = [];
for (const e of j.elements) {
  const t = e.tags || {};
  const name = t['name:ru'] || t.name;
  if (!name) continue;
  const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
  if (lat == null) continue;
  const p = project(lat, lon);
  const kind = t.railway === 'station' ? 'station' : t.place === 'square' ? 'square'
    : t.historic ? 'historic' : t.tourism === 'viewpoint' ? 'viewpoint'
    : t.leisure === 'park' ? 'park' : t.tourism || t.amenity || 'poi';
  pois.push({ name, kind, x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 });
}
pois.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
writeFileSync(new URL('../data/poi.json', import.meta.url).pathname, JSON.stringify(pois));
console.log(`POI: ${pois.length}`);
console.log(pois.filter(p => ['square','historic','station','viewpoint'].includes(p.kind)).slice(0, 30).map(p => `  ${p.kind.padEnd(10)} ${p.name}`).join('\n'));
