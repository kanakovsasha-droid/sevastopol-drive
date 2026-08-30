// Светофоры, переходы и дорожные знаки отдельным файлом: в osm-raw.json узлы
// лежат без тегов (out skel), и вытащить их оттуда нельзя.
import { writeFileSync } from 'node:fs';
import { BBOX } from './config.mjs';
const OUT = new URL('../data/signals.json', import.meta.url).pathname;
const bb = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
const QUERY = `[out:json][timeout:180];
(
  node["highway"="traffic_signals"](${bb});
  node["highway"="crossing"](${bb});
  node["highway"="stop"](${bb});
  node["highway"="give_way"](${bb});
  node["highway"="speed_camera"](${bb});
  node["traffic_calming"](${bb});
  node["traffic_sign"](${bb});
);
out body;`;
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const HEADERS = { 'User-Agent': 'sevastopol-game/0.1 (personal hobby project)', 'Accept': 'application/json', 'Accept-Language': 'en' };
for (const ep of ENDPOINTS) {
  process.stdout.write(ep + ' ... ');
  try {
    const res = await fetch(ep, { method: 'POST', body: new URLSearchParams({ data: QUERY }), headers: HEADERS });
    if (!res.ok) { console.log('HTTP ' + res.status); continue; }
    const text = await res.text();
    if (!text.trimStart().startsWith('{')) { console.log('не JSON'); continue; }
    const j = JSON.parse(text);
    writeFileSync(OUT, text);
    const c = {};
    for (const e of j.elements) { const t = e.tags || {}; const k = t.highway || t.traffic_calming || t.traffic_sign || '?'; c[k] = (c[k] || 0) + 1; }
    console.log('OK — узлов ' + j.elements.length + ': ' + Object.entries(c).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+' '+v).join(', '));
    process.exit(0);
  } catch (e) { console.log('ошибка: ' + e.message); }
}
throw new Error('Overpass недоступен');
