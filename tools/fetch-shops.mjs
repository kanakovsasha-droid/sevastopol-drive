import { writeFileSync } from 'node:fs';
import { BBOX, project } from './config.mjs';

// Вывески на домах. Названия не выдумываем: всё, что висит на фасадах в игре,
// стоит в OSM — магазины, кафе, кинотеатры, ТЦ, банки, аптеки, гостиницы.
const bb = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
const AMEN = 'cafe|restaurant|fast_food|bar|pub|biergarten|ice_cream|food_court|bank|bureau_de_change'
  + '|pharmacy|cinema|theatre|nightclub|casino|fuel|marketplace|post_office|clinic|doctors|dentist'
  + '|veterinary|library|car_rental|car_wash|car_repair|driving_school|internet_cafe|studio|atm';
const Q = `[out:json][timeout:180];
(
  nwr["shop"]["name"](${bb});
  nwr["amenity"~"^(${AMEN})$"]["name"](${bb});
  nwr["office"]["name"](${bb});
  nwr["tourism"~"^(hotel|hostel|guest_house|apartment|museum)$"]["name"](${bb});
  nwr["leisure"~"^(fitness_centre|sports_centre|bowling_alley)$"]["name"](${bb});
  nwr["healthcare"]["name"](${bb});
  nwr["craft"]["name"](${bb});
);
out center tags;`;

const res = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST', body: new URLSearchParams({ data: Q }),
  headers: { 'User-Agent': 'sevastopol-game/0.1 (personal hobby project)',
             'Accept': 'application/json', 'Accept-Language': 'en' },
});
if (!res.ok) { console.error('Overpass', res.status, await res.text()); process.exit(1); }
const j = await res.json();

// Категория задаёт цвет вывески и подпись под ней. Список короткий нарочно:
// на фасаде с двадцати метров различимы шесть-семь типов, не сорок.
function categorize(t) {
  const s = t.shop, a = t.amenity;
  if (a === 'cinema') return 'cinema';
  if (s === 'mall' || s === 'department_store') return 'mall';
  if (a === 'theatre') return 'theatre';
  if (a === 'pharmacy' || t.healthcare === 'pharmacy') return 'pharmacy';
  if (a === 'bank' || a === 'bureau_de_change' || a === 'atm') return 'bank';
  if (a === 'cafe' || a === 'restaurant' || a === 'fast_food' || a === 'bar'
      || a === 'pub' || a === 'ice_cream' || a === 'food_court' || a === 'biergarten') return 'food';
  if (a === 'fuel') return 'fuel';
  if (t.tourism === 'hotel' || t.tourism === 'hostel' || t.tourism === 'guest_house') return 'hotel';
  if (t.tourism === 'museum') return 'museum';
  if (s === 'supermarket' || s === 'convenience' || s === 'greengrocer'
      || s === 'butcher' || s === 'bakery' || s === 'alcohol') return 'food_shop';
  if (t.healthcare || a === 'clinic' || a === 'doctors' || a === 'dentist' || a === 'veterinary') return 'health';
  if (t.leisure) return 'sport';
  if (t.office) return 'office';
  if (s) return 'shop';
  return 'shop';
}

const seen = new Set();
const out = [];
for (const e of j.elements) {
  const t = e.tags || {};
  const name = (t['name:ru'] || t.name || '').trim();
  if (!name || name.length > 42) continue;
  const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
  if (lat == null) continue;
  const p = project(lat, lon);
  const x = Math.round(p.x * 10) / 10, z = Math.round(p.z * 10) / 10;
  // одна и та же сеть на одном пятачке — вывеска одна
  const key = name.toLowerCase() + '@' + Math.round(x / 8) + ',' + Math.round(z / 8);
  if (seen.has(key)) continue;
  seen.add(key);
  out.push({ n: name, c: categorize(t), x, z });
}
out.sort((a, b) => a.z - b.z || a.x - b.x);
writeFileSync(new URL('../data/shops.json', import.meta.url).pathname, JSON.stringify(out));

const by = {};
for (const o of out) by[o.c] = (by[o.c] || 0) + 1;
console.log(`вывесок ${out.length}`);
console.log(Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k.padEnd(10)} ${v}`).join('\n'));
