import { writeFileSync } from 'node:fs';
import { BBOX, project } from './config.mjs';

const bb = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
const Q = `[out:json][timeout:200];
(
  node["highway"="bus_stop"](${bb});
  node["public_transport"="platform"](${bb});
  node["highway"="traffic_signals"](${bb});
  node["highway"="street_lamp"](${bb});
  node["natural"="tree"](${bb});
  node["amenity"~"^(bench|waste_basket|drinking_water|fountain|shelter|telephone|post_box|atm|vending_machine)$"](${bb});
  node["man_made"~"^(flagpole|monument|obelisk|utility_pole|street_cabinet)$"](${bb});
  node["highway"="crossing"](${bb});
  node["highway"~"^(stop|give_way|speed_camera)$"](${bb});
  node["traffic_calming"](${bb});
  node["traffic_sign"](${bb});
  node["tourism"="artwork"](${bb});
  way["barrier"~"^(fence|wall|hedge|handrail|guard_rail|city_wall|retaining_wall)$"](${bb});
);
out body;
>;
out skel qt;`;

const res = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST', body: new URLSearchParams({ data: Q }),
  headers: { 'User-Agent': 'sevastopol-game/0.1', Accept: 'application/json', 'Accept-Language': 'en' },
});
const j = await res.json();

const nodes = new Map();
for (const e of j.elements) if (e.type === 'node') nodes.set(e.id, e);

const R1 = v => Math.round(v * 10) / 10;
const out = { points: [], barriers: [] };
const count = {};

for (const e of j.elements) {
  const t = e.tags || {};
  if (e.type === 'node') {
    let kind = null;
    if (t.highway === 'bus_stop' || t.public_transport === 'platform') kind = 'bus_stop';
    else if (t.highway === 'traffic_signals') kind = 'traffic_light';
    else if (t.highway === 'street_lamp') kind = 'lamp';
    else if (t.natural === 'tree') kind = 'tree';
    else if (t.amenity === 'bench') kind = 'bench';
    else if (t.amenity === 'waste_basket') kind = 'bin';
    else if (t.amenity === 'shelter') kind = 'shelter';
    else if (t.amenity === 'fountain') kind = 'fountain';
    else if (t.amenity === 'post_box') kind = 'postbox';
    else if (t.amenity === 'vending_machine' || t.amenity === 'atm' || t.amenity === 'telephone') kind = 'kiosk';
    else if (t.man_made === 'flagpole') kind = 'flagpole';
    else if (t.man_made === 'monument' || t.man_made === 'obelisk' || t.tourism === 'artwork') kind = 'monument';
    else if (t.man_made === 'utility_pole' || t.man_made === 'street_cabinet') kind = 'pole';
    // Дорожные знаки. Пешеходный переход берём с узлов crossing: их 368, и
    // раньше они просто выбрасывались.
    else if (t.highway === 'stop') kind = 'sign_stop';
    else if (t.highway === 'give_way') kind = 'sign_yield';
    else if (t.highway === 'speed_camera') kind = 'sign_camera';
    else if (t.traffic_calming) kind = 'sign_bump';
    else if (t.highway === 'crossing') kind = 'sign_crossing';
    else if (t.maxspeed || /3\.24/.test(t.traffic_sign || '')) kind = 'sign_speed';
    if (!kind) continue;
    const p = project(e.lat, e.lon);
    const o = { k: kind, x: R1(p.x), z: R1(p.z) };
    const name = t['name:ru'] || t.name;
    if (name && (kind === 'bus_stop' || kind === 'monument' || kind === 'fountain')) o.n = name;
    if (t['tree:diameter'] || t.height) o.h = parseFloat(t.height) || undefined;
    // предел скорости пишем цифрой на щиток
    if (kind === 'sign_speed') {
      const v = parseInt(t.maxspeed || (t.traffic_sign || '').split('-').pop(), 10);
      o.v = (v >= 5 && v <= 130) ? v : 40;
    }
    out.points.push(o);
    count[kind] = (count[kind] || 0) + 1;
  } else if (e.type === 'way' && e.tags?.barrier) {
    const pts = [];
    for (const id of e.nodes || []) {
      const n = nodes.get(id);
      if (!n) { pts.length = 0; break; }
      const p = project(n.lat, n.lon);
      pts.push(R1(p.x), R1(p.z));
    }
    if (pts.length >= 4) {
      out.barriers.push({ k: e.tags.barrier, pts });
      count['barrier:' + e.tags.barrier] = (count['barrier:' + e.tags.barrier] || 0) + 1;
    }
  }
}

writeFileSync(new URL('../data/furniture.json', import.meta.url).pathname, JSON.stringify(out));
console.log('Реальные объекты из OSM:');
for (const [k, v] of Object.entries(count).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(20)} ${v}`);
console.log(`\nточек ${out.points.length}, ограждений ${out.barriers.length}`);
