// refs/mesta.json и refs/vokzaly.json -> data/places.json: аллеи, деревья,
// фонтаны, лестницы, стадион, парковка, кладбища, мост, платформы, поезда.
// Здания из этих отчётов уходят обычным путём через merge-refs.
import { readFileSync, writeFileSync } from 'node:fs';
const DIR = new URL('../data/', import.meta.url).pathname;
const REF = new URL('../refs/', import.meta.url).pathname;
const R1 = v => Math.round(v * 10) / 10;
const rd = n => { try { return JSON.parse(readFileSync(REF + n, 'utf8')); } catch { return null; } };

const M = rd('mesta.json') || {};
const V = rd('vokzaly.json') || {};
const out = { paths: [], trees: [], features: [], areas: [], fences: [], structures: [], trains: [] };

// ---- парки: аллеи, деревья, фонтаны, лестницы
for (const p of M.parks || []) {
  for (const pts of p.paths || []) {
    if (!pts || pts.length < 4) continue;
    out.paths.push({ pts: pts.map(R1), w: p.pathWidth || 3.0, s: p.pathSurface || 'asphalt' });
  }
  for (const t of p.trees || [])
    out.trees.push({ x: R1(t.x), z: R1(t.z), sp: t.species || null, h: R1(t.h || 9), r: R1(t.crownR || 3.5) });
  for (const f of p.features || []) {
    if (f.x === undefined) continue;
    out.features.push({ k: f.kind, x: R1(f.x), z: R1(f.z), ...(f.r ? { r: R1(f.r) } : {}),
      ...(f.radius ? { r: R1(f.radius) } : {}), ...(f.d ? { d: R1(f.d) } : {}),
      ...(f.name ? { n: f.name } : {}) });
  }
  if (p.fence && p.fence.kind && p.fence.kind !== 'none' && p.poly)
    out.fences.push({ poly: p.poly.map(R1), h: p.fence.h || 1.0, kind: p.fence.kind });
}

// ---- стадион: беговой овал кольцом и футбольное поле
for (const s of M.sport || []) {
  if (s.kind === 'track' && s.poly && s.innerPoly) {
    out.areas.push({ k: 'track', poly: s.poly.map(R1), hole: s.innerPoly.map(R1), n: s.name });
  } else if (s.poly) {
    out.areas.push({ k: s.kind === 'pitch' ? 'football' : s.kind, poly: s.poly.map(R1), n: s.name });
  }
  if (s.standsPoly) out.structures.push({ k: 'stands', poly: s.standsPoly.map(R1), n: s.name });
}
// ---- парковка у Терм Наутико
for (const q of M.parking || [])
  if (q.poly) out.areas.push({ k: 'parking', poly: q.poly.map(R1), n: q.name });

// ---- кладбища: ограда, ворота, часовня, деревья
for (const key of ['cemetery', 'cemeteryKaraim']) {
  const c = M[key];
  if (!c || !c.poly) continue;
  out.areas.push({ k: 'cemetery', poly: c.poly.map(R1), n: c.name });
  if (c.fence && c.fence.kind && c.fence.kind !== 'none')
    out.fences.push({ poly: c.poly.map(R1), h: c.fence.h || 1.8, kind: c.fence.kind });
  for (const t of c.trees || [])
    out.trees.push({ x: R1(t.x), z: R1(t.z), sp: t.species || null, h: R1(t.h || 8), r: R1(t.crownR || 3) });
  if (c.chapel && c.chapel.x !== undefined)
    out.structures.push({ k: 'chapel', x: R1(c.chapel.x), z: R1(c.chapel.z),
                          w: c.chapel.w || 6.5, d: c.chapel.d || 6.5, h: c.chapel.h || 5.5 });
  if (Array.isArray(c.graves))
    out.structures.push({ k: 'graves', pts: c.graves.flatMap(g => [R1(g.x), R1(g.z)]) });
}

// ---- вокзал: мост, платформы с навесами, составы
// Мост больше не строится вручную: полотно поднимает worldgen по всем
// участкам с тегом bridge, а опоры и перила ставятся под ним автоматически.
if (false && V.bridge && V.bridge.from && V.bridge.to) {
  const b = V.bridge;
  out.structures.push({ k: 'bridge', from: b.from.map(R1), to: b.to.map(R1),
    w: b.width || 20, deck: b.deckHeight || 8, spans: b.spans || 2,
    pier: b.pierWidth || 1.5, railing: b.railing || 'parapet', railH: b.railingH || 1.1,
    color: b.color || '#b9b6ae', n: b.name });
}
for (const pl of V.platforms || []) {
  if (!pl.from || !pl.to) continue;
  out.structures.push({ k: 'platform', from: pl.from.map(R1), to: pl.to.map(R1),
    w: pl.width || 7, h: pl.height || 0.35, canopy: !!pl.canopy, canopyH: pl.canopyH || 5.0, n: pl.name });
}
for (const t of V.trains || []) {
  if (!t.from || !t.to) continue;
  out.trains.push({ from: t.from.map(R1), to: t.to.map(R1), cars: t.cars || 1,
    len: t.carLen || 24, w: t.carW || 3.1, h: t.carH || 4.2,
    body: t.bodyColor || '#8a8f96', roof: t.roofColor || '#6a6a66', n: t.type });
}

// ---- перрон автовокзала: буферная площадка и автобусы на местах
// Навеса над перронами нет (проверено по панораме), автобусы стоят веером
// на открытой площадке к западу от здания — координаты из отчёта агента.
// Перрон площадкой не рисуем: обведённый от руки прямоугольник ложился
// на газон, и на газоне вставали машины. Оставляем только автобусы.
for (let i = 0; i < 6; i++) {
  const z = 2447 + i * 8;
  out.trains.push({ from: [438, z], to: [456, z], cars: 1, len: 12, w: 2.55, h: 3.2,
    body: i % 3 === 0 ? '#c8452c' : i % 3 === 1 ? '#2f5f9e' : '#e2e3df',
    roof: '#d8d8d4', n: 'автобус на перроне' });
}

writeFileSync(DIR + 'places.json', JSON.stringify(out));
const c = {};
for (const s of out.structures) c[s.k] = (c[s.k] || 0) + 1;
console.log(`аллей ${out.paths.length}, деревьев ${out.trees.length}, объектов парка ${out.features.length}, `
  + `площадок ${out.areas.length}, оград ${out.fences.length}, составов ${out.trains.length}, `
  + `сооружений ${Object.entries(c).map(([k, v]) => k + ' ' + v).join(', ')}`);
