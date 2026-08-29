import { writeFileSync, existsSync, statSync } from 'node:fs';
import { BBOX } from './config.mjs';

const OUT = new URL('../data/osm-raw.json', import.meta.url).pathname;
const bb = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;

const QUERY = `[out:json][timeout:300];
(
  way["highway"](${bb});
  way["building"](${bb});
  way["building:part"](${bb});
  way["natural"="water"](${bb});
  way["natural"="coastline"](${bb});
  way["waterway"="riverbank"](${bb});
  way["landuse"~"^(grass|forest|meadow|cemetery|recreation_ground|village_green|allotments)$"](${bb});
  way["leisure"~"^(park|garden|pitch|playground|stadium)$"](${bb});
  way["natural"~"^(wood|scrub|beach|sand|cliff)$"](${bb});
  way["railway"~"^(rail|tram|light_rail)$"](${bb});
  relation["natural"="water"](${bb});
  relation["building"](${bb});
  relation["leisure"="park"](${bb});
);
out body;
>;
out skel qt;`;

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
];

// undici по умолчанию шлёт `Accept-Language: *`, Apache перед Overpass отвечает на это 406.
const HEADERS = {
  'User-Agent': 'sevastopol-game/0.1 (personal hobby project)',
  'Accept': 'application/json',
  'Accept-Language': 'en',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  if (existsSync(OUT) && statSync(OUT).size > 1_000_000) {
    console.log('osm-raw.json уже есть, пропускаю. Удали файл чтобы перекачать.');
    return;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const ep of ENDPOINTS) {
      process.stdout.write(`попытка ${attempt + 1}: ${ep} ... `);
      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 300_000);
        const res = await fetch(ep, {
          method: 'POST',
          body: new URLSearchParams({ data: QUERY }),
          headers: HEADERS,
          signal: ac.signal,
        });
        clearTimeout(t);
        if (!res.ok) { console.log(`HTTP ${res.status}`); continue; }
        const text = await res.text();
        if (!text.trimStart().startsWith('{')) {
          console.log('не JSON (сервер занят)');
          continue;
        }
        const json = JSON.parse(text);
        if (!json.elements?.length) { console.log('пусто'); continue; }
        writeFileSync(OUT, text);
        const n = json.elements.length;
        const nodes = json.elements.filter(e => e.type === 'node').length;
        const ways = json.elements.filter(e => e.type === 'way').length;
        const rels = json.elements.filter(e => e.type === 'relation').length;
        console.log(`OK — ${(text.length / 1e6).toFixed(1)} МБ, элементов ${n} (nodes ${nodes}, ways ${ways}, relations ${rels})`);
        return;
      } catch (e) {
        console.log(`ошибка: ${e.message}`);
      }
    }
    await sleep(10_000);
  }
  throw new Error('Все зеркала Overpass недоступны');
}
main();
