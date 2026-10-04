// Цоколь под готовой моделью здания (стиль 'model' в landmarks.json).
//
// Ноль модели — тротуар у её точки (ox, oz), ниже нуля у модели свой цоколь
// метра на три. На улице, которая уходит под уклон вдоль дома, земля у
// нижнего угла оказывается ниже этого цоколя — и дом висел над склоном
// (гостиница «Севастополь» на Айвазовского — до 7.7 м). У рядовых домов
// цоколь строится до земли сам (buildBuildings); моделям достраиваем его
// здесь: каменная стенка по контуру дома из OSM (тот, что модель заменяет,
// поле skip), от нижней кромки модели до земли.
import * as THREE from 'three';

const TOP = -0.5;        // верх стенки — под нулём модели (дальше её собственный цоколь)
const INSET = 0.4;       // контур OSM чуть внутрь: стенка не выступает из-под фасада
const STONE = [0.56, 0.54, 0.50];

export function buildModelPlinths(defs, buildings, terrain) {
  const group = new THREE.Group();
  group.name = 'цоколи моделей';
  const P = [], C = [], I = [];
  let made = 0;
  for (const d of defs || []) {
    if (d.style !== 'model' || !d.skip || d.ox === undefined) continue;
    const y0 = d.y ?? terrain.gridHeightAt(d.ox, d.oz);
    for (const b of buildings || []) {
      if (!d.skip.includes(b.id) || !b.poly || b.poly.length < 6) continue;
      const p = b.poly, n = p.length / 2;
      let cx = 0, cz = 0; for (let i = 0; i < n; i++) { cx += p[i * 2]; cz += p[i * 2 + 1]; } cx /= n; cz /= n;
      const pt = i => { const x = p[i * 2], z = p[i * 2 + 1], dx = cx - x, dz = cz - z, l = Math.hypot(dx, dz) || 1;
        return [x + dx / l * INSET, z + dz / l * INSET]; };
      for (let i = 0; i < n; i++) {
        const [ax, az] = pt(i), [bx, bz] = pt((i + 1) % n);
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 0.2) continue;
        const k = Math.max(1, Math.ceil(L / 2));
        let prev = null;
        for (let s = 0; s <= k; s++) {
          const x = ax + (bx - ax) * s / k, z = az + (bz - az) * s / k;
          const top = y0 + TOP, bot = Math.min(top, terrain.gridHeightAt(x, z) - 0.5);
          const v = P.length / 3;
          P.push(x, top, z, x, bot, z);
          for (let q = 0; q < 2; q++) C.push(STONE[0], STONE[1], STONE[2]);
          // стенку рисуем, только где под моделью и правда пусто
          if (prev !== null && (bot < top - 0.1 || prev.low)) I.push(prev.v, prev.v + 1, v, v, prev.v + 1, v + 1);
          prev = { v, low: bot < top - 0.1 };
        }
        made++;
      }
    }
  }
  if (!I.length) return group;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.setIndex(I);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
  // тень стенка не отбрасывает: двусторонняя, она затеняла сама себя полосами
  m.receiveShadow = true;
  group.add(m);
  group.userData.edges = made;
  return group;
}
