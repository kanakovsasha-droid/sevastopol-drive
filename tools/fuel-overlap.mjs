// Проверка АЗС: не стоит ли модель сети (навес, павильон, стела) в доме OSM.
//   node tools/fuel-overlap.mjs [--all]
//
// Ставит все АЗС так же, как игра (prepFuel из web/js/fuel.js над данными
// каждого квартала data/chunks/*.json), и меряет площадь пересечения частей
// модели с домами, которые остались видимыми (не hide). Печатает станции с
// пересечением (--all — все) и итог. Станция у шва лежит в двух кварталах —
// берётся худший.
import { register } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';

register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(s, c, n) {
    return s === 'three' ? n(${JSON.stringify(new URL('../web/lib/three.module.js', import.meta.url).href)}, c) : n(s, c);
  }`));
const { prepFuel, modelParts, clipArea } = await import('../web/js/fuel.js');
const { prepSites } = await import('../web/js/canopy.js');

const ALL = process.argv.includes('--all');
const dir = new URL('../data/chunks/', import.meta.url);

const res = new Map();
for (const fn of readdirSync(dir)) {
  const d = JSON.parse(readFileSync(new URL(fn, dir)));
  if (!d.fuel?.length) continue;
  const w = { roads: d.roads || [], buildings: d.buildings || [], fuel: d.fuel };
  prepSites(w);
  prepFuel(w);
  for (const f of w.fuel) {
    const hits = [];
    for (const [part, poly] of modelParts(f)) {
      for (const b of w.buildings) {
        if (b.hide || !b.poly) continue;
        const a = clipArea(b.poly, poly);
        if (a > 0.5) hits.push({ part, id: b.id, roof: b.t === 'roof', a: +a.toFixed(1) });
      }
    }
    const tot = hits.filter(h => !h.roof).reduce((s, h) => s + h.a, 0);
    const old = res.get(f.id);
    if (!old || tot > old.tot) res.set(f.id, { f, tot, hits, P: f.__fuel.P, fit: f.__fuel.fit, chunk: fn });
  }
}
let bad = 0;
for (const r of [...res.values()].sort((a, b) => b.tot - a.tot)) {
  if (r.tot > 0) bad++;
  if (!ALL && !r.hits.length) continue;
  const { P } = r;
  console.log(`${r.f.id.padEnd(20)} ${String(r.f.n || '—').slice(0, 20).padEnd(20)} ${r.tot.toFixed(1).padStart(6)} м²  at=${P.cx.toFixed(0)},${P.cz.toFixed(0)}` +
    (r.fit ? `  [${r.fit}]` : '') + (r.hits.length ? '  ' + r.hits.map(h => `${h.part}∩${h.id}${h.roof ? '(навес)' : ''} ${h.a}`).join(', ') : ''));
}
console.log(`АЗС: ${res.size}, модель в доме: ${bad}`);
