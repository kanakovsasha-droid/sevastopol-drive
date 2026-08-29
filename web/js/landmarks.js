import * as THREE from 'three';

// Здания, которые нельзя оставлять коробкой. Массу берём из контура OSM,
// а сверху ставим то, что делает здание узнаваемым: колоннаду, портик,
// балюстраду и буквы на кровле — как на панораме проспекта Нахимова.

const s2l = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);

function merge(parts) {
  let nv = 0, ni = 0;
  for (const { geo } of parts) {
    nv += geo.attributes.position.count;
    ni += geo.index ? geo.index.count : geo.attributes.position.count;
  }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), C = new Uint8Array(nv * 3);
  const I = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const { geo, color } of parts) {
    P.set(geo.attributes.position.array, vo * 3);
    N.set(geo.attributes.normal.array, vo * 3);
    const n = geo.attributes.position.count;
    for (let i = 0; i < n; i++)
      for (let k = 0; k < 3; k++) C[(vo + i) * 3 + k] = Math.round(255 * s2l(color[k]));
    if (geo.index) for (let i = 0; i < geo.index.count; i++) I[io++] = geo.index.array[i] + vo;
    else for (let i = 0; i < n; i++) I[io++] = i + vo;
    vo += n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.BufferAttribute(C, 3, true));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  return g;
}

// минимальный охватывающий прямоугольник контура
function obb(poly) {
  const n = poly.length / 2;
  let best = null;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = poly[j * 2] - poly[i * 2], dz = poly[j * 2 + 1] - poly[i * 2 + 1];
    const l = Math.hypot(dx, dz);
    if (l < 0.4) continue;
    const ux = dx / l, uz = dz / l;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let k = 0; k < n; k++) {
      const x = poly[k * 2], z = poly[k * 2 + 1];
      const u = x * ux + z * uz, v = -x * uz + z * ux;
      if (u < u0) u0 = u; if (u > u1) u1 = u;
      if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    const a = (u1 - u0) * (v1 - v0);
    if (!best || a < best.area) best = { area: a, ux, uz, u0, u1, v0, v1 };
  }
  return best;
}

const GRANITE = [0.44, 0.42, 0.43];
const GRANITE_D = [0.33, 0.32, 0.33];
const BRONZE = [0.30, 0.24, 0.15];
const BRONZE_L = [0.38, 0.31, 0.19];
const GOLD = [0.98, 0.76, 0.08];
const RED = [0.72, 0.11, 0.11];
const STONE = [0.918, 0.898, 0.851];
const STONE_D = [0.831, 0.808, 0.757];

function signTexture(text) {
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = 256;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 190;
  do { g.font = `700 ${size}px "Helvetica Neue", Arial`; size -= 4; }
  while (g.measureText(text).width > cv.width - 90 && size > 40);
  g.fillStyle = '#ffffff';
  g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 10; g.shadowOffsetY = 4;
  g.fillText(text, cv.width / 2, cv.height / 2 + 4);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildLandmarks(world, terrain, defs, roadIndex) {
  const group = new THREE.Group();
  group.name = 'landmarks';
  const skip = new Set();
  const stats = [];

  for (const d of defs) {
    // Памятник: ступенчатый стилобат, гранитный пьедестал с барельефами
    // и бронзовая фигура. Лицом к бухте — на север.
    if (d.style === 'monument') {
      const parts = [];
      const y0 = terrain.gridHeightAt(d.x, d.z);
      const a = d.facing ?? 0;
      const put = (geo, col) => { geo.rotateY(a); geo.translate(d.x, 0, d.z); parts.push({ geo, color: col }); };
      const at = (geo, col, y) => { geo.translate(0, y, 0); put(geo, col); };

      // стилобат: три гранитные ступени
      const steps = [[9.4, 0.42], [8.0, 0.42], [6.8, 0.42]];
      let yy = y0;
      for (const [w, h] of steps) {
        const g = new THREE.BoxGeometry(w, h, w);
        at(g, w > 8 ? GRANITE_D : GRANITE, yy + h / 2);
        yy += h;
      }

      // цоколь и пьедестал с лёгким сужением кверху
      const baseH = 1.15, pedH = 6.6, capH = 0.55;
      at(new THREE.BoxGeometry(5.4, baseH, 5.4), GRANITE_D, yy + baseH / 2);
      yy += baseH;
      const ped = new THREE.CylinderGeometry(2.05, 2.35, pedH, 4);
      ped.rotateY(Math.PI / 4);
      at(ped, GRANITE, yy + pedH / 2);

      // бронзовые барельефы на трёх гранях
      for (let k = 0; k < 3; k++) {
        const t = k / 4 * Math.PI * 2;
        const rel = new THREE.BoxGeometry(2.5, 3.0, 0.16);
        rel.rotateY(t);
        rel.translate(Math.sin(t) * 2.16, yy + pedH * 0.46, Math.cos(t) * 2.16);
        put(rel, BRONZE);
        const frm = new THREE.BoxGeometry(2.9, 3.4, 0.09);
        frm.rotateY(t);
        frm.translate(Math.sin(t) * 2.12, yy + pedH * 0.46, Math.cos(t) * 2.12);
        put(frm, BRONZE_L);
      }
      yy += pedH;
      at(new THREE.BoxGeometry(5.0, capH, 5.0), GRANITE_D, yy + capH / 2);
      yy += capH;

      // фигура адмирала: шинель, торс, плечи, голова, вытянутая рука
      const figH = 6.0;
      const coat = new THREE.CylinderGeometry(0.72, 1.05, figH * 0.56, 10);
      at(coat, BRONZE, yy + figH * 0.28);
      const torso = new THREE.CylinderGeometry(0.62, 0.74, figH * 0.26, 10);
      at(torso, BRONZE, yy + figH * 0.56 + figH * 0.13);
      const shoulders = new THREE.BoxGeometry(1.62, 0.34, 0.78);
      at(shoulders, BRONZE_L, yy + figH * 0.83);
      const neck = new THREE.CylinderGeometry(0.2, 0.24, 0.24, 8);
      at(neck, BRONZE, yy + figH * 0.88);
      const head = new THREE.SphereGeometry(0.36, 12, 10);
      at(head, BRONZE_L, yy + figH * 0.955);
      // рука с подзорной трубой, отведена вперёд
      const arm = new THREE.CylinderGeometry(0.16, 0.19, 1.5, 8);
      arm.rotateX(Math.PI / 2.6);
      arm.translate(0.62, yy + figH * 0.70, 0.52);
      put(arm, BRONZE);
      // плащ за спиной
      const cape = new THREE.BoxGeometry(1.5, figH * 0.62, 0.28);
      cape.translate(0, yy + figH * 0.44, -0.62);
      put(cape, BRONZE);

      // бронзовые венки по углам стилобата
      for (const [sx, sz] of [[-3.4, -3.4], [3.4, -3.4], [-3.4, 3.4], [3.4, 3.4]]) {
        const w = new THREE.TorusGeometry(0.42, 0.11, 6, 12);
        w.rotateX(Math.PI / 2);
        w.translate(sx, y0 + 1.32, sz);
        put(w, BRONZE_L);
      }

      const mm = new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.62, metalness: 0.32,
      }));
      mm.castShadow = true; mm.receiveShadow = true;
      group.add(mm);
      stats.push({ name: d.name, ok: true, vysota: +(yy - y0 + figH).toFixed(1) + ' м' });
      continue;
    }

    // Рынок: длинные ряды павильонов со светлой волнистой кровлей.
    // В OSM их нет вовсе, вписаны по спутниковому снимку.
    // Приподнятая клумба: низкий каменный борт по контуру газона, земля внутри,
    // кусты и несколько деревьев. Голый газон с одним деревом смотрелся пусто.
    if (d.style === 'island') {
      let g = null, bd = Infinity;
      for (const o of world.green) {
        const p = o.poly, n = p.length / 2;
        let cx = 0, cz = 0;
        for (let k = 0; k < n; k++) { cx += p[k * 2]; cz += p[k * 2 + 1]; }
        const dist = Math.hypot(cx / n - d.x, cz / n - d.z);
        if (dist < bd) { bd = dist; g = o; }
      }
      if (!g || bd > 40) { stats.push({ name: d.name, ok: false, dist: +bd.toFixed(0) }); continue; }

      const poly = g.poly, n = poly.length / 2;
      const rim = d.rim ?? 0.55;
      const parts = [];
      let cx = 0, cz = 0;
      for (let k = 0; k < n; k++) { cx += poly[k * 2]; cz += poly[k * 2 + 1]; }
      cx /= n; cz /= n;
      const y0 = terrain.gridHeightAt(cx, cz);

      // борт по контуру
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = poly[i * 2], az = poly[i * 2 + 1];
        const bx = poly[j * 2], bz = poly[j * 2 + 1];
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 0.2) continue;
        // высота своя у каждого сегмента, основание уводим ниже грунта:
        // от общей отметки центра борт на уклоне повисал в воздухе
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        const gm = terrain.gridHeightAt(mx, mz);
        const Hs = rim + 1.4;
        const seg = new THREE.BoxGeometry(0.42, Hs, L + 0.25);
        seg.rotateY(Math.atan2(bx - ax, bz - az));
        seg.translate(mx, gm + rim - Hs / 2, mz);
        parts.push({ geo: seg, color: [0.76, 0.73, 0.67] });
      }
      // земля внутри, чуть выше борта основания
      {
        const c = [];
        for (let i = 0; i < n; i++) c.push(new THREE.Vector2(poly[i * 2], poly[i * 2 + 1]));
        let faces = [];
        try { faces = THREE.ShapeUtils.triangulateShape(c, []); } catch { faces = []; }
        const P = [], N = [];
        for (const f of faces) {
          const t = [c[f[0]], c[f[1]], c[f[2]]];
          const cr = (t[1].x - t[0].x) * (t[2].y - t[0].y) - (t[1].y - t[0].y) * (t[2].x - t[0].x);
          const o = cr > 0 ? [t[0], t[2], t[1]] : t;
          // земля внутри тоже идёт по рельефу, иначе на уклоне отрывается от борта
          for (const q of o) { P.push(q.x, terrain.gridHeightAt(q.x, q.y) + rim - 0.12, q.y); N.push(0, 1, 0); }
        }
        if (P.length) {
          const gg = new THREE.BufferGeometry();
          gg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
          gg.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
          parts.push({ geo: gg, color: [0.32, 0.26, 0.19] });
        }
      }
      // кусты и деревца внутри
      const inside = (px, pz) => {
        let ins = false;
        for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
          const xi = poly[i], zi = poly[i + 1], xj = poly[j], zj = poly[j + 1];
          if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) ins = !ins;
        }
        return ins;
      };
      let seed = 991;
      const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
      let placed = 0, tries = 0;
      const wantS = d.shrubs ?? 26, wantT = d.trees ?? 4;
      let trees = 0;
      while ((placed < wantS || trees < wantT) && tries++ < 900) {
        const px = cx + (rnd() - 0.5) * 22, pz = cz + (rnd() - 0.5) * 22;
        if (!inside(px, pz)) continue;
        if (Math.hypot(px - d.x, pz - d.z) < 3.5) continue;   // не лезем в кедр
        if (trees < wantT && rnd() < 0.22) {
          const h = 5 + rnd() * 3;
          const gp = terrain.gridHeightAt(px, pz) + rim - 0.1;
          const tr = new THREE.CylinderGeometry(0.13, 0.20, h * 0.5, 5);
          tr.translate(px, gp + h * 0.25, pz);
          const cr = new THREE.IcosahedronGeometry(1.5 + rnd() * 0.6, 1);
          cr.translate(px, gp + h * 0.78, pz);
          parts.push({ geo: tr, color: [0.33, 0.27, 0.20] }, { geo: cr, color: [0.24, 0.36, 0.19] });
          trees++;
        } else if (placed < wantS) {
          const r = 0.45 + rnd() * 0.45;
          const sh = new THREE.IcosahedronGeometry(r, 0);
          sh.scale(1.3, 0.85, 1.3);
          sh.translate(px, terrain.gridHeightAt(px, pz) + rim - 0.1 + r * 0.45, pz);
          parts.push({ geo: sh, color: [0.21 + rnd() * 0.06, 0.33 + rnd() * 0.07, 0.17] });
          placed++;
        }
      }
      const m = new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.93, flatShading: true,
      }));
      m.castShadow = true; m.receiveShadow = true;
      group.add(m);
      stats.push({ name: d.name, ok: true, kusty: placed, derevca: trees, bort: +rim.toFixed(2) });
      continue;
    }

    // Ливанский кедр: приземистый ствол и несколько плоских ярусов кроны.
    // Именно этот силуэт делает площадь Лазарева узнаваемой.
    if (d.style === 'cedar') {
      const y = terrain.gridHeightAt(d.x, d.z);
      const H = d.h ?? 15, S = d.spread ?? 13;
      const parts = [];
      const trunk = new THREE.CylinderGeometry(0.42, 0.78, H * 0.42, 8);
      trunk.translate(d.x, y + H * 0.21, d.z);
      parts.push({ geo: trunk, color: [0.33, 0.27, 0.21] });
      // расходящиеся сучья
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2 + 0.4;
        const r = S * 0.26;
        const br = new THREE.CylinderGeometry(0.16, 0.30, H * 0.30, 6);
        br.rotateZ(0.55); br.rotateY(-a);
        br.translate(d.x + Math.cos(a) * r, y + H * 0.46, d.z + Math.sin(a) * r);
        parts.push({ geo: br, color: [0.31, 0.25, 0.19] });
      }
      // плоские ярусы хвои — снизу шире, кверху уже
      const tiers = [
        [0.52, 1.00, 0.16], [0.66, 0.86, 0.14], [0.78, 0.66, 0.12], [0.90, 0.40, 0.10],
      ];
      for (const [hf, wf, tf] of tiers) {
        const g = new THREE.IcosahedronGeometry(1, 1);
        g.scale(S * 0.5 * wf, H * tf, S * 0.5 * wf);
        g.translate(d.x, y + H * hf, d.z);
        parts.push({ geo: g, color: [0.180 + tf, 0.300 + tf * 0.6, 0.170 + tf * 0.4] });
      }
      const m = new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.94, flatShading: true,
      }));
      m.castShadow = true;
      group.add(m);
      stats.push({ name: d.name, ok: true, style: 'cedar' });
      continue;
    }

    // Прожекторная мачта стадиона «Чайка»: решётчатая ферма из четырёх
    // поясов с раскосами и рама с прожекторами наверху. Поле давно застроено
    // рынком, а мачты стоят.
    if (d.style === 'floodlight') {
      const parts = [];
      const y0 = terrain.gridHeightAt(d.x, d.z);
      const H = d.height ?? 33;
      const wBot = d.base ?? 3.2, wTop = 1.5;
      const STEEL = [0.365, 0.302, 0.259];      // сурик по стали
      const STEEL_D = [0.290, 0.243, 0.212];
      const at = (u, y) => {                    // угол фермы на высоте y
        const t = y / H, w = (wBot + (wTop - wBot) * t) / 2;
        return [d.x + u[0] * w, y0 + y, d.z + u[1] * w];
      };
      const CORN = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const bar = (A, B, r, col) => {
        const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2];
        const L = Math.hypot(dx, dy, dz);
        if (L < 0.05) return;
        const g = new THREE.CylinderGeometry(r, r, L, 5);
        g.rotateX(Math.PI / 2);
        const q = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 0, 1), new THREE.Vector3(dx / L, dy / L, dz / L));
        g.applyQuaternion(q);
        g.translate((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2);
        parts.push({ geo: g, color: col });
      };
      // пояса
      for (const u of CORN) bar(at(u, 0), at(u, H), 0.11, STEEL);
      // панели раскосов и горизонтали
      const PAN = 2.6, np = Math.round(H / PAN);
      for (let k = 0; k < np; k++) {
        const ya = k * H / np, yb = (k + 1) * H / np;
        for (let e = 0; e < 4; e++) {
          const u1 = CORN[e], u2 = CORN[(e + 1) % 4];
          bar(at(u1, yb), at(u2, yb), 0.055, STEEL_D);                 // горизонталь
          bar(at(k % 2 ? u1 : u2, ya), at(k % 2 ? u2 : u1, yb), 0.05, STEEL_D);  // раскос
        }
      }
      // рама с прожекторами
      const RW = wTop * 2.6, RH = 3.4;
      const top = y0 + H;
      for (let r2 = 0; r2 < 3; r2++) {
        const yy = top + 0.7 + r2 * 1.15;
        const beam = new THREE.BoxGeometry(RW, 0.12, 0.28);
        beam.translate(d.x, yy, d.z + 0.55);
        parts.push({ geo: beam, color: STEEL_D });
        const nL = 6;
        for (let k = 0; k < nL; k++) {
          const xx = d.x - RW / 2 + RW * (k + 0.5) / nL;
          const lamp = new THREE.BoxGeometry(0.52, 0.62, 0.34);
          lamp.rotateX(-0.32);
          lamp.translate(xx, yy + 0.30, d.z + 0.72);
          parts.push({ geo: lamp, color: [0.62, 0.61, 0.58] });
          const gl = new THREE.BoxGeometry(0.44, 0.50, 0.05);
          gl.rotateX(-0.32);
          gl.translate(xx, yy + 0.36, d.z + 0.90);
          parts.push({ geo: gl, color: [0.86, 0.88, 0.84] });
        }
      }
      // стойки рамы и лесенка сбоку
      for (const sx of [-1, 1]) {
        const st = new THREE.BoxGeometry(0.14, RH + 1.2, 0.14);
        st.translate(d.x + sx * RW / 2, top + RH / 2 + 0.4, d.z + 0.55);
        parts.push({ geo: st, color: STEEL_D });
      }
      const m = new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.72, metalness: 0.35,
      }));
      m.castShadow = true;
      group.add(m);
      stats.push({ name: d.name, ok: true, style: 'floodlight', vysota: H });
      continue;
    }

    // ближайший контур к заданной точке
    let bi = -1, bd = Infinity;
    world.buildings.forEach((b, i) => {
      const p = b.poly, n = p.length / 2;
      let cx = 0, cz = 0;
      for (let k = 0; k < n; k++) { cx += p[k * 2]; cz += p[k * 2 + 1]; }
      cx /= n; cz /= n;
      const dist = Math.hypot(cx - d.x, cz - d.z);
      if (dist < bd) { bd = dist; bi = i; }
    });
    if (bi < 0 || bd > 60) { stats.push({ name: d.name, ok: false, dist: +bd.toFixed(0) }); continue; }

    const b = world.buildings[bi];
    const box = obb(b.poly);
    if (!box) continue;

    let gmin = Infinity, gmax = -Infinity;
    for (let i = 0; i < b.poly.length / 2; i++) {
      const h = terrain.gridHeightAt(b.poly[i * 2], b.poly[i * 2 + 1]);
      if (h < gmin) gmin = h; if (h > gmax) gmax = h;
    }
    const yTop = gmax + b.h;

    // Главный фасад. Раньше я перебирал только две длинные стороны и брал
    // ближайшую к ЛЮБОЙ дороге — у П-образного корпуса колоннада уезжала
    // во внутренний двор. Теперь перебираем все четыре и выбираем ту,
    // у которой ближе всего проезжая улица, а не дорожка.
    const { ux, uz } = box;
    const toXZ = (u, v) => [u * ux - v * uz, u * uz + v * ux];
    const sides = [
      { fixed: box.v0, out: -1, a0: box.u0, a1: box.u1, axis: 'u' },
      { fixed: box.v1, out: +1, a0: box.u0, a1: box.u1, axis: 'u' },
      { fixed: box.u0, out: -1, a0: box.v0, a1: box.v1, axis: 'v' },
      { fixed: box.u1, out: +1, a0: box.v0, a1: box.v1, axis: 'v' },
    ];
    for (const sd of sides) {
      // Q(t, o): t — доля вдоль стороны, o — вынос наружу в метрах
      sd.Q = (t, o) => {
        const a = sd.a0 + (sd.a1 - sd.a0) * t;
        const f = sd.fixed + sd.out * o;
        return sd.axis === 'u' ? toXZ(a, f) : toXZ(f, a);
      };
      sd.len = sd.a1 - sd.a0;
      let best = Infinity, bestName = null, named = Infinity;
      for (const t of [0.2, 0.4, 0.6, 0.8]) {
        const [qx, qz] = sd.Q(t, 9);
        const hit = roadIndex.nearest(qx, qz, 90, r => r.c <= 3);
        if (!hit) continue;
        if (hit.dist < best) { best = hit.dist; bestName = hit.road.n || null; }
        // если фасад задан по имени улицы — меряем расстояние именно до неё
        if (d.facade) {
          const h2 = roadIndex.nearest(qx, qz, 120, r => r.n === d.facade);
          if (h2 && h2.dist < named) named = h2.dist;
        }
      }
      sd.roadDist = best;
      sd.roadName = bestName;
      sd.facadeDist = named;
    }
    // Явно заданная улица важнее близости: у отеля вплотную проходит боковая
    // Айвазовского, а парадный фасад с колоннадой смотрит на Нахимова.
    // Явная точка фасада — последний довод, когда на улицу смотрят сразу две
    // стены корпуса: у больницы фасад ломается посередине, и «ближайшая к
    // дороге» стена оказывается не та, на которой стоит портик.
    if (d.facadeAt) {
      for (const sd of sides) {
        const [mx, mz] = sd.Q(0.5, 0);
        sd.pickDist = Math.hypot(mx - d.facadeAt[0], mz - d.facadeAt[1]);
      }
      sides.sort((p1, p2) => p1.pickDist - p2.pickDist);
    }
    else if (d.facade && sides.some(o => isFinite(o.facadeDist)))
      sides.sort((p1, p2) => (p1.facadeDist - p2.facadeDist) || (p2.len - p1.len));
    else
      sides.sort((p1, p2) => (p1.roadDist - p2.roadDist) || (p2.len - p1.len));
    let S = sides[0];

    // Ближайшая точка НА КОНТУРЕ здания. Габаритный прямоугольник у П-образного
    // корпуса отстоит от стены на десятки метров — портик, отмеренный от него,
    // повисал в воздухе рядом с домом.
    const onWall = (px, pz) => {
      const p = b.poly, n = p.length / 2;
      let bx = px, bz = pz, bd = Infinity;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = p[i * 2], az = p[i * 2 + 1];
        const ux = p[j * 2] - ax, uz = p[j * 2 + 1] - az;
        const l2 = ux * ux + uz * uz || 1;
        let t = ((px - ax) * ux + (pz - az) * uz) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + ux * t, qz = az + uz * t;
        const dd = (px - qx) ** 2 + (pz - qz) ** 2;
        if (dd < bd) { bd = dd; bx = qx; bz = qz; }
      }
      return [bx, bz, Math.sqrt(bd)];
    };
    // точка на стене + вынос наружу вдоль нормали от стены к габаритной рамке
    let atWall = (t, out) => {
      const [qx, qz] = S.Q(t, 0);
      const [wx, wz, dist] = onWall(qx, qz);
      if (dist < 0.05) return [qx, qz];
      return [wx + (qx - wx) / dist * out, wz + (qz - wz) / dist * out];
    };

    // ---- храм: барабан, купол, крест и порталы с диоритовыми колоннами ----
    // Владимирский собор — неовизантийский крестово-купольный, 32.5 м с крестом.
    // Корпус даёт контур OSM (он крестообразный), сверху ставим четверик,
    // барабан с арочными окнами, приплюснутый купол и восьмиконечный крест.
    if (d.style === 'cathedral') {
      const parts = [];
      const STONE_W = [0.871, 0.824, 0.722];     // инкерманский камень
      const DIORITE = [0.255, 0.263, 0.247];   // полированный диорит, а не чёрная дыра
      const LEAD = [0.639, 0.655, 0.639];        // светлый купол, как на панораме
      const GOLD2 = [0.94, 0.74, 0.16];

      const dx = d.dome ? d.dome[0] : d.x, dz = d.dome ? d.dome[1] : d.z;
      let gmaxL = -Infinity;
      for (let i = 0; i < b.poly.length / 2; i++)
        gmaxL = Math.max(gmaxL, terrain.gridHeightAt(b.poly[i * 2], b.poly[i * 2 + 1]));
      const yBody = gmaxL + b.h;                 // верх стен корпуса

      // карниз по контуру: плита с небольшим выносом
      {
        const p = b.poly, n = p.length / 2;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
          const l = Math.hypot(bx - ax, bz - az);
          if (l < 0.3) continue;
          const cor = new THREE.BoxGeometry(0.9, 0.45, l + 0.5);
          cor.rotateY(Math.atan2(bx - ax, bz - az));
          cor.translate((ax + bx) / 2, yBody + 0.22, (az + bz) / 2);
          parts.push({ geo: cor, color: STONE_D });
        }
      }

      // подкупольный четверик
      const SQ = d.pedestal ?? 15.0, sqH = 1.6;
      const ped = new THREE.BoxGeometry(SQ, sqH, SQ);
      ped.rotateY(d.facing ?? 0);
      ped.translate(dx, yBody + 0.45 + sqH / 2, dz);
      parts.push({ geo: ped, color: STONE });
      const pedCor = new THREE.BoxGeometry(SQ + 1.0, 0.4, SQ + 1.0);
      pedCor.rotateY(d.facing ?? 0);
      pedCor.translate(dx, yBody + 0.45 + sqH + 0.2, dz);
      parts.push({ geo: pedCor, color: STONE_D });

      // барабан с лопатками и арочными окнами
      const drumR = d.drumR ?? 5.6, drumH = d.drumH ?? 6.2;
      const yDrum = yBody + 0.45 + sqH + 0.4;
      const drum = new THREE.CylinderGeometry(drumR, drumR, drumH, 24);
      drum.translate(dx, yDrum + drumH / 2, dz);
      parts.push({ geo: drum, color: STONE });
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2 + Math.PI / 8;
        const px = dx + Math.cos(a) * drumR, pz = dz + Math.sin(a) * drumR;
        const pil = new THREE.BoxGeometry(0.55, drumH, 0.75);
        pil.rotateY(-a);
        pil.translate(px, yDrum + drumH / 2, pz);
        parts.push({ geo: pil, color: STONE_D });
        // окно между лопатками
        const aw = a + Math.PI / 8;
        const wx = dx + Math.cos(aw) * (drumR - 0.12), wz = dz + Math.sin(aw) * (drumR - 0.12);
        const win = new THREE.BoxGeometry(0.3, 3.1, 1.15);
        win.rotateY(-aw);
        win.translate(wx, yDrum + drumH * 0.52, wz);
        parts.push({ geo: win, color: [0.075, 0.085, 0.095] });
        const arc = new THREE.CylinderGeometry(0.58, 0.58, 0.3, 12, 1, false, 0, Math.PI);
        arc.rotateZ(Math.PI / 2); arc.rotateY(-aw + Math.PI / 2);
        arc.translate(wx, yDrum + drumH * 0.52 + 1.55, wz);
        parts.push({ geo: arc, color: [0.075, 0.085, 0.095] });
      }
      // карниз барабана
      const dc = new THREE.CylinderGeometry(drumR + 0.55, drumR + 0.35, 0.5, 24);
      dc.translate(dx, yDrum + drumH + 0.25, dz);
      parts.push({ geo: dc, color: STONE_D });

      // приплюснутый купол
      const yDome = yDrum + drumH + 0.5;
      const dome = new THREE.SphereGeometry(drumR + 0.7, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
      dome.scale(1, 0.64, 1);
      dome.translate(dx, yDome, dz);
      parts.push({ geo: dome, color: LEAD });
      const domeH = (drumR + 0.7) * 0.64;

      // яблоко и восьмиконечный крест
      const orbY = yDome + domeH;
      const orb = new THREE.SphereGeometry(0.42, 12, 8);
      orb.translate(dx, orbY + 0.3, dz);
      parts.push({ geo: orb, color: GOLD2 });
      const crossH = d.crossH ?? 2.6;
      const stem = new THREE.BoxGeometry(0.16, crossH, 0.16);
      stem.translate(dx, orbY + 0.6 + crossH / 2, dz);
      parts.push({ geo: stem, color: GOLD2 });
      const barY = [orbY + 0.6 + crossH * 0.82, orbY + 0.6 + crossH * 0.55, orbY + 0.6 + crossH * 0.22];
      const barW = [0.62, 1.30, 0.86];
      for (let i = 0; i < 3; i++) {
        const bar = new THREE.BoxGeometry(barW[i], 0.14, 0.14);
        if (i === 2) bar.rotateZ(0.32);                 // косая нижняя перекладина
        bar.translate(dx, barY[i], dz);
        parts.push({ geo: bar, color: GOLD2 });
      }

      // звонница над западным входом: три арочных проёма с колоколами
      if (d.belfry) {
        const [bx0, bz0, bx1, bz1] = d.belfry;
        const bl = Math.hypot(bx1 - bx0, bz1 - bz0) || 1;
        const bux = (bx1 - bx0) / bl, buz = (bz1 - bz0) / bl;
        let bnX = -buz, bnZ = bux;
        const pp = b.poly, pn = pp.length / 2;
        let pcx = 0, pcz = 0;
        for (let k = 0; k < pn; k++) { pcx += pp[k * 2]; pcz += pp[k * 2 + 1]; }
        pcx /= pn; pcz /= pn;
        const bmx = (bx0 + bx1) / 2, bmz = (bz0 + bz1) / 2;
        if (bnX * (pcx - bmx) + bnZ * (pcz - bmz) > 0) { bnX = -bnX; bnZ = -bnZ; }
        const cx2 = bmx - bnX * 1.4, cz2 = bmz - bnZ * 1.4;     // чуть вглубь корпуса
        const ang = Math.atan2(bx1 - bx0, bz1 - bz0);
        const BW = Math.max(5.2, bl + 0.6), BH = 4.4;
        const box2 = new THREE.BoxGeometry(3.0, BH, BW);
        box2.rotateY(ang); box2.translate(cx2, yBody + BH / 2, cz2);
        parts.push({ geo: box2, color: STONE });
        const cor2 = new THREE.BoxGeometry(3.6, 0.45, BW + 0.7);
        cor2.rotateY(ang); cor2.translate(cx2, yBody + BH + 0.22, cz2);
        parts.push({ geo: cor2, color: STONE_D });
        for (let k = -1; k <= 1; k++) {
          const ox = cx2 + bux * k * (BW / 3.3), oz = cz2 + buz * k * (BW / 3.3);
          const op = new THREE.BoxGeometry(3.2, 2.0, 1.15);
          op.rotateY(ang); op.translate(ox, yBody + 2.35, oz);
          parts.push({ geo: op, color: [0.09, 0.10, 0.10] });
          const ar = new THREE.CylinderGeometry(0.58, 0.58, 3.2, 14, 1, false, 0, Math.PI);
          ar.rotateZ(Math.PI / 2); ar.rotateY(ang + Math.PI / 2);
          ar.translate(ox, yBody + 3.35, oz);
          parts.push({ geo: ar, color: [0.09, 0.10, 0.10] });
          const bell = new THREE.CylinderGeometry(0.30, 0.42, 0.62, 10);
          bell.translate(ox, yBody + 3.05, oz);
          parts.push({ geo: bell, color: [0.42, 0.34, 0.18] });
        }
      }

      // порталы: две диоритовые колонны и арка над входом
      for (const w of (d.portals || [])) {
        const [x0, z0, x1, z1] = w;
        const l = Math.hypot(x1 - x0, z1 - z0) || 1;
        const ux = (x1 - x0) / l, uz = (z1 - z0) / l;
        let nX = -uz, nZ = ux;
        const p = b.poly, np = p.length / 2;
        let cx = 0, cz = 0;
        for (let k = 0; k < np; k++) { cx += p[k * 2]; cz += p[k * 2 + 1]; }
        cx /= np; cz /= np;
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        if (nX * (cx - mx) + nZ * (cz - mz) > 0) { nX = -nX; nZ = -nZ; }
        const at = (t, o) => [x0 + (x1 - x0) * t + nX * o, z0 + (z1 - z0) * t + nZ * o];

        // Подиум и лестница: на панораме вход подняли на полтора метра,
        // к нему широкий марш с парапетами, решётками и фонарями по углам.
        const LH = w === (d.portals || [])[0] ? (d.stairH ?? 1.55) : (d.sideStairH ?? 0.85);
        const [lx, lz] = at(0.5, 0.9);
        const gL = terrain.gridHeightAt(lx, lz);
        const yL = gL + LH;                      // отметка площадки
        {
          const angL = Math.atan2(x1 - x0, z1 - z0);
          const pad = new THREE.BoxGeometry(3.4, LH, l + 1.4);
          pad.rotateY(angL); pad.translate(lx, gL + LH / 2, lz);
          parts.push({ geo: pad, color: STONE_D });
          const RISE = 0.175, TREAD = 0.34;
          const nStep = Math.max(3, Math.round(LH / RISE));
          const SW = l + 2.2;                    // марш шире портала
          for (let k = 0; k < nStep; k++) {
            const out = 1.7 + k * TREAD;
            const [sx, sz] = at(0.5, out);
            const gS = terrain.gridHeightAt(sx, sz);
            const hS = Math.max(0.12, yL - k * RISE - gS);
            const st = new THREE.BoxGeometry(TREAD + 0.06, hS, SW);
            st.rotateY(angL); st.translate(sx, yL - k * RISE - hS / 2, sz);
            parts.push({ geo: st, color: k % 2 ? STONE : STONE_D });
          }
          // парапеты по бокам марша: сплошной скат, без решёток —
          // прежние стойки торчали из ступеней подпорками и мешали смотреть
          const runOut = 1.7 + nStep * TREAD;
          for (const sgn of [-1, 1]) {
            const tSide = 0.5 + sgn * (SW / 2) / l;
            for (let k = 0; k < nStep; k++) {
              const [cx3, cz3] = at(tSide, 1.8 + k * TREAD);
              const gC = terrain.gridHeightAt(cx3, cz3);
              const yTopC = yL - k * RISE + 0.62;
              const ch2 = new THREE.BoxGeometry(TREAD + 0.05, Math.max(0.3, yTopC - gC), 0.46);
              ch2.rotateY(angL); ch2.translate(cx3, (yTopC + gC) / 2, cz3);
              parts.push({ geo: ch2, color: STONE });
            }
            // столб внизу марша с пирамидкой
            const [bx2, bz2] = at(tSide, runOut + 0.2);
            const gB = terrain.gridHeightAt(bx2, bz2);
            const pil2 = new THREE.BoxGeometry(0.68, 1.35, 0.68);
            pil2.rotateY(angL); pil2.translate(bx2, gB + 0.68, bz2);
            const cap2 = new THREE.ConeGeometry(0.46, 0.38, 4);
            cap2.rotateY(Math.PI / 4 + angL); cap2.translate(bx2, gB + 1.55, bz2);
            parts.push({ geo: pil2, color: STONE }, { geo: cap2, color: STONE_D });
            // фонарь сбоку от марша, не на ступенях
            const [fx2, fz2] = at(tSide + sgn * 0.34, runOut + 1.3);
            const gF = terrain.gridHeightAt(fx2, fz2);
            const post = new THREE.CylinderGeometry(0.09, 0.14, 3.1, 8);
            post.translate(fx2, gF + 1.55, fz2);
            const lamp = new THREE.SphereGeometry(0.26, 10, 8);
            lamp.translate(fx2, gF + 3.32, fz2);
            parts.push({ geo: post, color: [0.20, 0.20, 0.19] }, { geo: lamp, color: [0.92, 0.90, 0.80] });
          }
        }

        const colH = 5.4;
        for (const t of [0.16, 0.84]) {
          const [px, pz] = at(t, 1.75);
          const g0 = yL;
          const base = new THREE.BoxGeometry(1.0, 0.35, 1.0); base.translate(px, g0 + 0.175, pz);
          const sh = new THREE.CylinderGeometry(0.36, 0.42, colH, 14);
          sh.translate(px, g0 + 0.35 + colH / 2, pz);
          const cap = new THREE.BoxGeometry(0.95, 0.42, 0.95);
          cap.translate(px, g0 + 0.35 + colH + 0.21, pz);
          parts.push({ geo: base, color: DIORITE }, { geo: sh, color: DIORITE },
                      { geo: cap, color: STONE_D });
        }
        const [ex, ez] = at(0.5, 1.75);
        const ge = yL;
        const ang = Math.atan2(x1 - x0, z1 - z0);
        const ent = new THREE.BoxGeometry(2.4, 0.85, l + 0.8);
        ent.rotateY(ang); ent.translate(ex, ge + 0.35 + colH + 0.42 + 0.42, ez);
        parts.push({ geo: ent, color: STONE });
        // проём с полуциркульным завершением
        const [dxp, dzp] = at(0.5, 0.18);
        const gd = yL;
        const door = new THREE.BoxGeometry(0.4, 3.5, 2.3);
        door.rotateY(ang); door.translate(dxp, gd + 1.75, dzp);
        parts.push({ geo: door, color: [0.16, 0.11, 0.08] });
        const arch = new THREE.CylinderGeometry(1.15, 1.15, 0.4, 16, 1, false, 0, Math.PI);
        arch.rotateZ(Math.PI / 2); arch.rotateY(ang + Math.PI / 2);
        arch.translate(dxp, gd + 3.5, dzp);
        parts.push({ geo: arch, color: [0.16, 0.11, 0.08] });
      }

      // мемориальные плиты адмиралов на северном и южном фасадах
      for (const pl of (d.plaques || [])) {
        const [px, pz, pa] = pl;
        const g0 = terrain.gridHeightAt(px, pz);
        const sl = new THREE.BoxGeometry(0.16, 1.35, 0.95);
        sl.rotateY(pa); sl.translate(px, g0 + 3.2, pz);
        parts.push({ geo: sl, color: [0.105, 0.110, 0.105] });
        const fr = new THREE.BoxGeometry(0.10, 1.55, 1.15);
        fr.rotateY(pa); fr.translate(px, g0 + 3.2, pz);
        parts.push({ geo: fr, color: STONE_D });
      }

      const mm = new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.80, metalness: 0.06,
      }));
      mm.castShadow = true; mm.receiveShadow = true;
      group.add(mm);
      stats.push({ name: d.name, ok: true, kontur: bi, vysota: +(b.h + 0.45 + sqH + 6.2 + 0.5
        + (drumR + 0.7) * 0.64 + 0.6 + (d.crossH ?? 2.6)).toFixed(1) + ' м' });
      continue;
    }

    // ---- пристенный ордер: колонны В ПЛОСКОСТИ фасада, без выноса ----
    // Так сделана гимназия №1: четыре трёхчетвертные колонны с капителями
    // стоят на рустованном первом этаже, поверху антаблемент и глухой парапет.
    // Фронтона нет. Выносной портик со стилобатом здесь был бы другим зданием.
    if (d.style === 'order') {
      const parts = [];
      const [wx0, wz0, wx1, wz1] = d.wall;
      const wdx = wx1 - wx0, wdz = wz1 - wz0;
      const wl = Math.hypot(wdx, wdz) || 1;
      const ux = wdx / wl, uz = wdz / wl;
      let nX = -uz, nZ = ux;
      const pp = b.poly, pn = pp.length / 2;
      let pcx = 0, pcz = 0;
      for (let k = 0; k < pn; k++) { pcx += pp[k * 2]; pcz += pp[k * 2 + 1]; }
      pcx /= pn; pcz /= pn;
      const mx = (wx0 + wx1) / 2, mz = (wz0 + wz1) / 2;
      if (nX * (pcx - mx) + nZ * (pcz - mz) > 0) { nX = -nX; nZ = -nZ; }   // наружу
      const at = (t, o) => [wx0 + wdx * t + nX * o, wz0 + wdz * t + nZ * o];
      const ang = Math.atan2(wx1 - wx0, wz1 - wz0);

      let gmn = Infinity, gmx = -Infinity;
      for (let i = 0; i < pn; i++) {
        const h = terrain.gridHeightAt(pp[i * 2], pp[i * 2 + 1]);
        if (h < gmn) gmn = h; if (h > gmx) gmx = h;
      }
      const yTopB = gmx + b.h;
      // Ордер садится на линию первого этажа, которую РИСУЕТ ШЕЙДЕР, а не на
      // «землю плюс 4.2 м». Шейдер делит стену от gmin-1.2 до gmax+h на этажи,
      // и на склоне низ колонн уезжал выше межэтажной тяги — они висели.
      const yBaseB = gmn - 1.2;
      const HbB = yTopB - yBaseB;
      const fh0 = (b.go || b.arch) ? 5.20 : 3.30;
      const nfB = Math.max(1, Math.floor(HbB / fh0 + 0.35));
      // Линия этажей считается от gmin по всему пятну; у длинного корпуса на
      // склоне она может оказаться ниже земли у самой стены — тогда колонны
      // уходят вниз. Держим их в разумных пределах над своим тротуаром.
      const [wgx, wgz] = at(0.5, 0.6);
      const gWall = terrain.gridHeightAt(wgx, wgz);
      const yOrder = Math.min(Math.max(yBaseB + HbB / nfB, gWall + 2.9), gWall + 4.1);
      const entH = 1.35;
      const entBot = yTopB - 1.90;            // низ антаблемента, под карнизом
      const R = d.colR ?? 0.62;
      const OUT = d.proj ?? 0.46;             // вынос из плоскости стены

      const colN = d.columns ?? 4;
      for (let i = 0; i < colN; i++) {
        const t = 0.09 + (0.82) * (i / (colN - 1));
        const [x, z] = at(t, OUT);
        const yb = yOrder;
        const shaftH = Math.max(3.0, entBot - yb - 0.62);
        const plinth = new THREE.BoxGeometry(1.55, 0.34, 1.55);
        plinth.rotateY(ang); plinth.translate(x, yb + 0.17, z);
        const shaft = new THREE.CylinderGeometry(R * 0.90, R, shaftH, 16);
        shaft.translate(x, yb + 0.34 + shaftH / 2, z);
        // капитель: шейка, кольцо и абака
        const neck = new THREE.CylinderGeometry(R * 0.98, R * 0.90, 0.20, 16);
        neck.translate(x, yb + 0.34 + shaftH + 0.10, z);
        const bell = new THREE.CylinderGeometry(R * 1.24, R * 0.98, 0.34, 16);
        bell.translate(x, yb + 0.34 + shaftH + 0.37, z);
        const abac = new THREE.BoxGeometry(1.62, 0.18, 1.62);
        abac.rotateY(ang); abac.translate(x, yb + 0.34 + shaftH + 0.63, z);
        parts.push({ geo: plinth, color: STONE_D }, { geo: shaft, color: STONE },
                    { geo: neck, color: STONE }, { geo: bell, color: STONE },
                    { geo: abac, color: STONE_D });
      }

      // антаблемент и карниз по ширине ордера, поверху — глухой парапет
      const [ex0, ez0] = at(0.02, OUT), [ex1, ez1] = at(0.98, OUT);
      const eLen = Math.hypot(ex1 - ex0, ez1 - ez0);
      const emx = (ex0 + ex1) / 2, emz = (ez0 + ez1) / 2;
      {
        const ent = new THREE.BoxGeometry(OUT * 2 + 0.5, entH, eLen);
        ent.rotateY(ang); ent.translate(emx, entBot + entH / 2, emz);
        parts.push({ geo: ent, color: STONE });
        const cor = new THREE.BoxGeometry(OUT * 2 + 0.9, 0.30, eLen + 0.5);
        cor.rotateY(ang); cor.translate(emx, entBot + entH + 0.17, emz);
        parts.push({ geo: cor, color: STONE_D });
        const par = new THREE.BoxGeometry(OUT * 1.6, 0.62, eLen + 0.2);
        par.rotateY(ang); par.translate(emx, yTopB + 0.31, emz);
        parts.push({ geo: par, color: STONE });
      }
      // вход по центру ордера: крыльцо со ступенями и коричневая дверь
      {
        const t = d.doorAt ?? 0.5;
        const LH = d.porchH ?? 0.95;                 // высота крыльца
        const [px2, pz2] = at(t, 0.9);
        const gP = terrain.gridHeightAt(px2, pz2);
        const yP = gP + LH;
        const DW = d.doorW ?? 3.2;                   // ширина крыльца
        const pad = new THREE.BoxGeometry(1.9, LH, DW);
        pad.rotateY(ang); pad.translate(px2, gP + LH / 2, pz2);
        parts.push({ geo: pad, color: STONE_D });
        const RISE = 0.16, TREAD = 0.32;
        const nStep = Math.max(3, Math.round(LH / RISE));
        for (let k = 0; k < nStep; k++) {
          const [sx, sz] = at(t, 1.85 + k * TREAD);
          const gS = terrain.gridHeightAt(sx, sz);
          const hS = Math.max(0.10, yP - k * RISE - gS);
          const st = new THREE.BoxGeometry(TREAD + 0.05, hS, DW - 0.2);
          st.rotateY(ang); st.translate(sx, yP - k * RISE - hS / 2, sz);
          parts.push({ geo: st, color: k % 2 ? STONE : STONE_D });
        }
        // перила по бокам марша
        for (const sgn of [-1, 1]) {
          const tS = t + sgn * (DW / 2 - 0.12) / wl;
          for (let k = 0; k < nStep; k += 2) {
            const [rx2, rz2] = at(tS, 1.9 + k * TREAD);
            const gR = terrain.gridHeightAt(rx2, rz2);
            const yTopR = yP - k * RISE + 0.92;
            const bar = new THREE.BoxGeometry(0.07, yTopR - gR, 0.07);
            bar.rotateY(ang); bar.translate(rx2, (yTopR + gR) / 2, rz2);
            const rail = new THREE.BoxGeometry(TREAD * 2.1, 0.06, 0.06);
            rail.rotateY(ang); rail.translate(rx2, yTopR, rz2);
            parts.push({ geo: bar, color: [0.24, 0.24, 0.23] }, { geo: rail, color: [0.24, 0.24, 0.23] });
          }
        }
        // коричневая двустворчатая дверь и наличник
        const [dx2, dz2] = at(t, 0.06);
        const fr = new THREE.BoxGeometry(0.26, 4.05, 3.45);
        fr.rotateY(ang); fr.translate(dx2, yP + 2.0, dz2);
        parts.push({ geo: fr, color: STONE });
        const frIn = new THREE.BoxGeometry(0.30, 3.45, 2.55);
        frIn.rotateY(ang); frIn.translate(dx2, yP + 1.72, dz2);
        parts.push({ geo: frIn, color: STONE_D });
        for (const sgn of [-1, 1]) {
          const tD = t + sgn * 0.55 / wl;
          const [ddx, ddz] = at(tD, 0.16);
          const leaf = new THREE.BoxGeometry(0.18, 3.15, 1.10);
          leaf.rotateY(ang); leaf.translate(ddx, yP + 1.58, ddz);
          parts.push({ geo: leaf, color: [0.435, 0.243, 0.145] });   // коричневая створка
          const pan = new THREE.BoxGeometry(0.06, 1.25, 0.72);       // филёнка
          pan.rotateY(ang); pan.translate(ddx + 0, yP + 1.05, ddz);
          parts.push({ geo: pan, color: [0.353, 0.196, 0.118] });
        }
        const lint = new THREE.BoxGeometry(0.42, 0.28, 3.0);
        lint.rotateY(ang); lint.translate(dx2, yP + 3.5, dz2);
        parts.push({ geo: lint, color: STONE_D });
      }
      // герб между колоннами
      {
        const [hx, hz] = at(d.emblemAt ?? 0.37, 0.20);
        const gh = terrain.gridHeightAt(hx, hz);
        const med = new THREE.CylinderGeometry(0.62, 0.62, 0.16, 16);
        med.rotateZ(Math.PI / 2); med.rotateY(ang + Math.PI / 2);
        med.translate(hx, yOrder + 2.4, hz);
        parts.push({ geo: med, color: STONE_D });
      }

      group.add(new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.80, metalness: 0.02,
      })));
      skip.add(bi);
      stats.push({ name: d.name, ok: true, kontur: bi, colonn: colN, stil: 'пристенный ордер' });
      continue;
    }

    // ---- портик с фронтоном: послевоенная классика (больница им. Пирогова) ----
    if (d.style === 'portico') {
      const parts = [];
      // Явный отрезок стены. Габаритная рамка у Г-образного корпуса лежит
      // поперёк обоих крыльев, и «сторона рамки» — не стена: портик от неё
      // уезжал во двор. Отрезок берётся из контура OSM, наружу — от центра дома.
      if (d.wall) {
        const [wx0, wz0, wx1, wz1] = d.wall;
        const wdx = wx1 - wx0, wdz = wz1 - wz0;
        const wl = Math.hypot(wdx, wdz) || 1;
        let nX = -wdz / wl, nZ = wdx / wl;
        const p = b.poly, np = p.length / 2;
        let cx = 0, cz = 0;
        for (let k = 0; k < np; k++) { cx += p[k * 2]; cz += p[k * 2 + 1]; }
        cx /= np; cz /= np;
        const mx = (wx0 + wx1) / 2, mz = (wz0 + wz1) / 2;
        if (nX * (cx - mx) + nZ * (cz - mz) > 0) { nX = -nX; nZ = -nZ; }   // наружу
        S = { a0: 0, a1: wl, len: wl, roadName: d.facade || null,
              Q: (t, o) => [wx0 + wdx * t + nX * o, wz0 + wdz * t + nZ * o] };
        atWall = (t, out) => S.Q(t, out);
      }
      const colN = d.columns ?? 6;
      const R = d.colR ?? 0.55;
      const step = d.colStep ?? 3.4;
      const spanM = (colN - 1) * step;
      const half = Math.min(0.46, spanM / (2 * (S.a1 - S.a0)));
      const t0 = 0.5 - half, t1 = 0.5 + half;
      const OUT = d.depth ?? 3.0;            // вынос портика от стены

      const entTop = yTop - 0.30;            // верх антаблемента
      const entH = 1.45;
      const entBot = entTop - entH;

      // стилобат: три ступени во всю ширину портика
      const [px0, pz0] = atWall(t0 - 0.05, OUT + 0.9), [px1, pz1] = atWall(t1 + 0.05, OUT + 0.9);
      const pAng = Math.atan2(px1 - px0, pz1 - pz0);
      const pLen = Math.hypot(px1 - px0, pz1 - pz0);
      const gStep = terrain.gridHeightAt((px0 + px1) / 2, (pz0 + pz1) / 2);
      for (let k = 0; k < 3; k++) {
        const [sx0, sz0] = atWall(0.5, OUT + 0.9 - k * 0.34);
        const st = new THREE.BoxGeometry(OUT * 2 + 1.8 - k * 0.68, 0.19, pLen - k * 0.7);
        st.rotateY(pAng); st.translate(sx0, gStep + 0.095 + k * 0.19, sz0);
        parts.push({ geo: st, color: k === 2 ? STONE : STONE_D });
      }
      const plat = gStep + 0.57;

      // колонны: ствол с лёгким сужением, база и капитель
      for (let i = 0; i < colN; i++) {
        const t = t0 + (t1 - t0) * (i / (colN - 1));
        const [x, z] = atWall(t, OUT);
        const capH = 0.50, baseH = 0.38;
        const shaftH = Math.max(3.0, entBot - plat - baseH - capH);
        const base = new THREE.BoxGeometry(1.42, baseH, 1.42); base.translate(x, plat + baseH / 2, z);
        const shaft = new THREE.CylinderGeometry(R * 0.86, R, shaftH, 16);
        shaft.translate(x, plat + baseH + shaftH / 2, z);
        const neck = new THREE.CylinderGeometry(R * 0.94, R * 0.86, 0.16, 16);
        neck.translate(x, plat + baseH + shaftH + 0.08, z);
        const cap = new THREE.BoxGeometry(1.36, capH - 0.16, 1.36);
        cap.translate(x, plat + baseH + shaftH + 0.16 + (capH - 0.16) / 2, z);
        parts.push({ geo: base, color: STONE_D }, { geo: shaft, color: STONE },
                    { geo: neck, color: STONE }, { geo: cap, color: STONE });
      }

      // антаблемент и карниз над колоннадой
      const [ex0, ez0] = atWall(t0 - 0.045, OUT), [ex1, ez1] = atWall(t1 + 0.045, OUT);
      const eAng = Math.atan2(ex1 - ex0, ez1 - ez0);
      const eLen = Math.hypot(ex1 - ex0, ez1 - ez0);
      const eMidX = (ex0 + ex1) / 2, eMidZ = (ez0 + ez1) / 2;
      {
        const ent = new THREE.BoxGeometry(OUT + 1.3, entH, eLen);
        ent.rotateY(eAng); ent.translate(eMidX, entBot + entH / 2, eMidZ);
        parts.push({ geo: ent, color: STONE });
        const cor = new THREE.BoxGeometry(OUT + 2.1, 0.36, eLen + 0.9);
        cor.rotateY(eAng); cor.translate(eMidX, entTop + 0.18, eMidZ);
        parts.push({ geo: cor, color: STONE_D });
      }

      // фронтон: треугольник над карнизом, тимпан и скаты
      {
        const fH = eLen * 0.135;
        const A = [ex0, ez0], B = [ex1, ez1];
        const y0f = entTop + 0.36;
        const depth = OUT + 1.5;
        const ox = (eMidX - atWall(0.5, 0)[0]), oz = (eMidZ - atWall(0.5, 0)[1]);
        const ol = Math.hypot(ox, oz) || 1;
        const back = [-ox / ol * depth, -oz / ol * depth];
        const tri3 = (P1, y1, P2, y2, P3, y3, col) => {
          const u1 = [P2[0] - P1[0], y2 - y1, P2[1] - P1[1]];
          const u2 = [P3[0] - P1[0], y3 - y1, P3[1] - P1[1]];
          let a = u1[1] * u2[2] - u1[2] * u2[1];
          let bq = u1[2] * u2[0] - u1[0] * u2[2];
          let cq = u1[0] * u2[1] - u1[1] * u2[0];
          const ln = Math.hypot(a, bq, cq) || 1;
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
            P1[0], y1, P1[1], P2[0], y2, P2[1], P3[0], y3, P3[1]]), 3));
          g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([
            a / ln, bq / ln, cq / ln, a / ln, bq / ln, cq / ln, a / ln, bq / ln, cq / ln]), 3));
          parts.push({ geo: g, color: col });
        };
        const T = [eMidX, eMidZ];
        // лицевой тимпан (две грани, чтобы был виден с обеих сторон)
        tri3(A, y0f, B, y0f, T, y0f + fH, STONE);
        tri3(B, y0f, A, y0f, T, y0f + fH, STONE);
        // скаты фронтона в глубину
        const A2 = [A[0] + back[0], A[1] + back[1]];
        const B2 = [B[0] + back[0], B[1] + back[1]];
        const T2 = [T[0] + back[0], T[1] + back[1]];
        for (const [P, Q, P2q, Q2q] of [[A, T, A2, T2], [T, B, T2, B2]]) {
          const yP = P === T ? y0f + fH : y0f, yQ = Q === T ? y0f + fH : y0f;
          tri3(P, yP, Q, yQ, Q2q, yQ, STONE_D);
          tri3(P, yP, Q2q, yQ, P2q, yP, STONE_D);
        }
      }

      group.add(new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.80, metalness: 0.02,
      })));
      skip.add(bi);
      stats.push({ name: d.name, ok: true, dist: +bd.toFixed(0), kontur: bi,
                   colonn: colN, fasadNa: S.roadName });
      continue;
    }

    // ---- фастфуд: навес над входом, золотые арки на стойке, летняя терраса ----
    if (d.style === 'fastfood') {
      const parts = [];
      const [fx0, fz0] = atWall(0.5, 0.2);
      const g0 = terrain.gridHeightAt(fx0, fz0);

      // навес над входом
      const [cx0, cz0] = atWall(0.32, 3.2), [cx1, cz1] = atWall(0.68, 3.2);
      const cLen = Math.hypot(cx1 - cx0, cz1 - cz0);
      const cAng = Math.atan2(cx1 - cx0, cz1 - cz0);
      const can = new THREE.BoxGeometry(4.4, 0.42, cLen);
      can.rotateY(cAng); can.translate((cx0 + cx1) / 2, g0 + 4.3, (cz0 + cz1) / 2);
      parts.push({ geo: can, color: RED });
      for (const t of [0.34, 0.5, 0.66]) {
        const [px, pz] = atWall(t, 5.2);
        const gp = terrain.gridHeightAt(px, pz);
        const col = new THREE.CylinderGeometry(0.13, 0.13, 4.3, 8);
        col.translate(px, gp + 2.15, pz);
        parts.push({ geo: col, color: [0.30, 0.30, 0.31] });
      }

      // стойка с золотыми арками
      const [sx, sz] = atWall(0.16, 6.5);
      const gs = terrain.gridHeightAt(sx, sz);
      const pole = new THREE.CylinderGeometry(0.19, 0.24, 7.2, 10);
      pole.translate(sx, gs + 3.6, sz);
      parts.push({ geo: pole, color: [0.28, 0.28, 0.29] });
      // буква M: две стойки-ноги и две полукруглые арки над ними
      const mAng = cAng + Math.PI / 2;
      const put = (geo, ox, oy) => {
        geo.rotateY(mAng);
        geo.translate(sx + Math.cos(mAng) * ox, gs + 7.2 + oy, sz - Math.sin(mAng) * ox);
        parts.push({ geo, color: GOLD });
      };
      for (const sgn of [-1, 1]) {
        put(new THREE.BoxGeometry(0.26, 1.55, 0.26), sgn * 0.86, 0.775);
        put(new THREE.BoxGeometry(0.26, 1.10, 0.26), sgn * 0.30, 0.55);
        const arc = new THREE.TorusGeometry(0.28, 0.13, 8, 14, Math.PI);
        arc.rotateY(Math.PI / 2);
        put(arc, sgn * 0.58, 1.55);
      }

      // летняя терраса: круглые столики, стулья и зонтики
      const UMB = [[0.85, 0.20, 0.16], [0.93, 0.72, 0.12], [0.20, 0.36, 0.55], [0.16, 0.45, 0.30]];
      let sd2 = 4242;
      const rr = () => (sd2 = (sd2 * 1664525 + 1013904223) >>> 0) / 4294967296;
      const nT = d.tables ?? 8;
      for (let i = 0; i < nT; i++) {
        const t = 0.12 + 0.76 * (i / Math.max(1, nT - 1));
        const [tx, tz] = atWall(t, 8.5 + (i % 2) * 3.2);
        const gt = terrain.gridHeightAt(tx, tz);
        const top = new THREE.CylinderGeometry(0.62, 0.62, 0.07, 14);
        top.translate(tx, gt + 0.74, tz);
        const leg = new THREE.CylinderGeometry(0.07, 0.14, 0.74, 8);
        leg.translate(tx, gt + 0.37, tz);
        parts.push({ geo: top, color: [0.80, 0.78, 0.74] }, { geo: leg, color: [0.28, 0.28, 0.29] });
        for (let k = 0; k < 4; k++) {
          const a = k / 4 * Math.PI * 2 + rr();
          const cxx = tx + Math.cos(a) * 1.05, czz = tz + Math.sin(a) * 1.05;
          const st = new THREE.BoxGeometry(0.42, 0.06, 0.42);
          st.translate(cxx, gt + 0.46, czz);
          const lg = new THREE.BoxGeometry(0.36, 0.46, 0.36);
          lg.translate(cxx, gt + 0.23, czz);
          parts.push({ geo: st, color: [0.36, 0.24, 0.16] }, { geo: lg, color: [0.24, 0.24, 0.25] });
        }
        // зонт
        const mast = new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6);
        mast.translate(tx, gt + 1.25, tz);
        const cone = new THREE.ConeGeometry(1.55, 0.55, 8);
        cone.translate(tx, gt + 2.62, tz);
        const col = UMB[(rr() * UMB.length) | 0];
        parts.push({ geo: mast, color: [0.55, 0.54, 0.52] }, { geo: cone, color: col });
      }

      const mm = new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.72, metalness: 0.06, flatShading: false,
      }));
      mm.castShadow = true; mm.receiveShadow = true;
      group.add(mm);
      stats.push({ name: d.name, ok: true, kontur: bi, fasadNa: S.roadName, stolikov: nT });
      continue;
    }

    const parts = [];
    const colN = d.columns ?? 8;
    const colH = d.colH ?? 9.2;
    const R = 0.62;
    const yBase = gmin;
    // Портик компактный и по центру: шаг колонн ~3.3 м, а не «во всю стену».
    // Раньше колоннада растягивалась на 62% фасада и восемь колонн стояли
    // в девяти метрах друг от друга — получался навес, а не портик.
    const spanM = (colN - 1) * 3.3;
    const half = Math.min(0.44, spanM / (2 * (S.a1 - S.a0)));
    const t0 = 0.5 - half, t1 = 0.5 + half;

    // Каждая колонна стоит на СВОЕЙ земле и доходит до карниза. Раньше все
    // отсчитывались от самой низкой точки участка, а земля у фасада выше —
    // колонны наполовину уходили в грунт и торчали обрубками.
    const entTop = yTop - 0.45;          // низ карниза
    const entBot = entTop - 1.35;
    for (let i = 0; i < colN; i++) {
      const t = t0 + (t1 - t0) * (i / (colN - 1));
      const [x, z] = atWall(t, 3.6);
      const g0 = terrain.gridHeightAt(x, z);
      const capH = 0.55, baseH = 0.45;
      const shaftH = Math.max(2.5, entBot - g0 - baseH - capH);
      const base = new THREE.BoxGeometry(1.55, baseH, 1.55); base.translate(x, g0 + baseH / 2, z);
      const shaft = new THREE.CylinderGeometry(R * 0.87, R, shaftH, 14);
      shaft.translate(x, g0 + baseH + shaftH / 2, z);
      const cap = new THREE.BoxGeometry(1.5, capH, 1.5);
      cap.translate(x, g0 + baseH + shaftH + capH / 2, z);
      parts.push({ geo: base, color: STONE_D }, { geo: shaft, color: STONE }, { geo: cap, color: STONE });
    }

    // антаблемент над колоннадой
    const [ex0, ez0] = atWall(t0 - 0.035, 3.6), [ex1, ez1] = atWall(t1 + 0.035, 3.6);
    const eAng = Math.atan2(ex1 - ex0, ez1 - ez0);
    const eLen = Math.hypot(ex1 - ex0, ez1 - ez0);
    {
      const ent = new THREE.BoxGeometry(5.4, 1.35, eLen);
      ent.rotateY(eAng); ent.translate((ex0 + ex1) / 2, entBot + 0.675, (ez0 + ez1) / 2);
      parts.push({ geo: ent, color: STONE });
      const cor = new THREE.BoxGeometry(6.2, 0.42, eLen + 1.0);
      cor.rotateY(eAng); cor.translate((ex0 + ex1) / 2, entTop + 0.21, (ez0 + ez1) / 2);
      parts.push({ geo: cor, color: STONE_D });
    }

    // балюстрада по всему периметру кровли
    for (const sd of sides) {
      const n = Math.max(2, Math.round(sd.len / 1.7));
      for (let i = 0; i <= n; i++) {
        const [qx0, qz0] = sd.Q(i / n, 0);
        const [x, z] = onWall(qx0, qz0);
        const post = new THREE.BoxGeometry(0.22, 0.85, 0.22);
        post.translate(x, yTop + 0.42, z);
        parts.push({ geo: post, color: STONE });
      }
      const [rx0, rz0] = onWall(...sd.Q(0, 0)), [rx1, rz1] = onWall(...sd.Q(1, 0));
      const rail = new THREE.BoxGeometry(0.45, 0.20, Math.hypot(rx1 - rx0, rz1 - rz0));
      rail.rotateY(Math.atan2(rx1 - rx0, rz1 - rz0));
      rail.translate((rx0 + rx1) / 2, yTop + 0.95, (rz0 + rz1) / 2);
      parts.push({ geo: rail, color: STONE_D });
    }

    // аттик под буквы, на главном фасаде
    const attW = Math.min(20, spanM * 1.05);
    const [aX, aZ] = atWall(0.5, -1.0);
    {
      const att = new THREE.BoxGeometry(2.2, 2.6, attW);
      att.rotateY(eAng); att.translate(aX, yTop + 1.3, aZ);
      parts.push({ geo: att, color: STONE });
    }
    group.add(new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.78, metalness: 0.02,
    })));

    // Буквы на кровле. Две плоскости спина к спине: односторонняя показывала
    // текст зеркально с обратной стороны, а DoubleSide — тем более.
    {
      const [sx, sz] = atWall(0.5, 0.4);
      const w = attW * 0.95, hgt = w / 9;
      const tex = signTexture(d.sign || d.name);
      const mat = () => new THREE.MeshStandardMaterial({
        map: tex, transparent: true, side: THREE.FrontSide, roughness: 0.45, metalness: 0.05,
      });
      for (const flip of [0, Math.PI]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), mat());
        m.position.set(sx, yTop + 3.6 + hgt / 2, sz);
        m.rotation.y = eAng + Math.PI / 2 + flip;
        group.add(m);
      }
      const frame = [];
      for (let i = 0; i < 5; i++) {
        const t = 0.5 + (i / 4 - 0.5) * (w / S.len) * 0.95;
        const [fx2, fz2] = atWall(t, 0.4);
        const leg = new THREE.BoxGeometry(0.14, 3.6, 0.14);
        leg.translate(fx2, yTop + 1.8, fz2);
        frame.push({ geo: leg, color: [0.35, 0.35, 0.34] });
      }
      group.add(new THREE.Mesh(merge(frame),
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));
    }

    skip.add(bi);
    stats.push({ name: d.name, ok: true, dist: +bd.toFixed(0), kontur: bi, colonn: colN,
                 fasadNa: S.roadName, doFasada: isFinite(S.facadeDist) ? +S.facadeDist.toFixed(0) : null });
  }

  group.userData.stats = stats;
  group.userData.skip = skip;
  return group;
}
