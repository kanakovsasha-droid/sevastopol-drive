import * as THREE from 'three';
import { roadMaterial } from './materials.js?v=90d69937';

// Плитка от тротуара до фасадов вдоль улицы. Тротуар buildRoads кончается на
// кромке + 2.6 м, а дальше до стены дома — голая земля квадрата: бурая или
// серая «недоасфальт». Здесь от края тротуара по нормали к оси бьём луч до
// первой стены и кладём плитку тем же шейдером дорог (класс 5 — тротуар).
//
// Ось — ломаная x, z, … по ходу; сторона W справа по ходу, E слева (как в
// data/street-bm.json). Разрыв между домами (двор, проход, сквер без контура
// зелени) не оставляем дырой: тротуар продолжается полосой fill метров, как
// у соседних домов. Асфальт поперечной улицы, зелень OSM и площадки
// (world.__noPlant) плитка обходит.

// Ось: отрезки с накопленной станцией и точка на станции s со сдвигом d
// вправо по ходу. На изломе направление сглажено по ±3 м — иначе полоса на
// углу рвётся клином.
export function makeAxis(p) {
  const AX = [];
  let LEN = 0;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const dx = p[i + 2] - p[i], dz = p[i + 3] - p[i + 1], L = Math.hypot(dx, dz);
    if (L < 1e-3) continue;
    AX.push({ ax: p[i], az: p[i + 1], ux: dx / L, uz: dz / L, L, s: LEN });
    LEN += L;
  }
  const seg = s => { let j = 0; while (j < AX.length - 1 && s > AX[j].s + AX[j].L) j++; return AX[j]; };
  const at = (s, d) => {
    const g = seg(s), t = s - g.s;
    const x = g.ax + g.ux * t, z = g.az + g.uz * t;
    const a = seg(s - 3), b = seg(s + 3);
    let ux = a.ux + b.ux, uz = a.uz + b.uz;
    const l = Math.hypot(ux, uz); ux /= l; uz /= l;
    return { x: x - uz * d, z: z + ux * d, ux, uz, nx: -uz, nz: ux };
  };
  return { AX, LEN, at };
}

const s2l = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const TILE = [0.729, 0.710, 0.675].map(s2l).map(v => Math.round(v * 255));

// Буфер вершин под общую сетку: несколько осей в одном квадрате — один вызов.
export function pavingBuffer() {
  return { P: [], R: [], K: [], CC: [], I: [], quads: 0, filled: 0 };
}

// Полоса вдоль оси. env: inSq, asphalt, facade(x, z, nx, nz, max), skip(x, z)
// (зелень, площадки), H(x, z) — отметка полотна, G(x, z) — земля.
// o: axis (makeAxis), hw — полуширина полотна, sides, fill — ширина полосы в
// разрыве между домами, max — дальше этого фасад не ищем (площадь — не тротуар).
export function paveAxis(buf, env, o) {
  const { at, LEN } = o.axis;
  const IN = o.hw + 2.35;          // под край тротуара buildRoads (он кончается на кромке + 2.6)
  const MAX = o.max ?? 24, FILL = o.fill ?? 4;
  const s0 = o.s0 ?? 0, s1 = Math.min(o.s1 ?? LEN, LEN);
  const { P, R, K, CC, I } = buf;
  for (const side of o.sides || ['W', 'E']) {
    const sg = side === 'W' ? 1 : -1;
    let prev = null;
    for (let s = s0; s <= s1 + 1e-6; s += 2) {
      const p = at(s, sg * IN);
      const nx = p.nx * sg, nz = p.nz * sg;
      const f = env.facade(p.x, p.z, nx, nz, MAX);
      // стена у самого тротуара — плитке места нет; фасада нет — полоса fill
      const st = f < 0.5 ? null : { p, nx, nz, f: f >= MAX ? FILL : f + 0.15, fill: f >= MAX };
      if (prev && st) {
        // скачок фасада (уступ, угол двора): у обоих краёв — меньшая глубина,
        // иначе дальний край квада срезает угол дома
        const fa = Math.abs(prev.f - st.f) < 4 ? prev.f : Math.min(prev.f, st.f);
        const fb = Math.abs(prev.f - st.f) < 4 ? st.f : fa;
        const cx = (prev.p.x + st.p.x) / 2 + nx * (fa + fb) / 4, cz = (prev.p.z + st.p.z) / 2 + nz * (fa + fb) / 4;
        const corners = [[prev.p.x, prev.p.z], [st.p.x, st.p.z],
          [prev.p.x + prev.nx * fa, prev.p.z + prev.nz * fa], [st.p.x + st.nx * fb, st.p.z + st.nz * fb]];
        const bad = !env.inSq(cx, cz) || corners.some(([x, z]) => env.asphalt(x, z)) || env.asphalt(cx, cz)
          || env.skip(cx, cz);
        if (!bad) {
          // поперёк дробим по ~2 м, чтобы плитка шла по рельефу
          const n = Math.max(1, Math.ceil(Math.max(fa, fb) / 2));
          const base = P.length / 3;
          for (let i = 0; i <= n; i++) for (const [q, f] of [[prev, fa], [st, fb]]) {
            const t = f * i / n;
            const x = q.p.x + q.nx * t, z = q.p.z + q.nz * t;
            const y = i === 0 ? env.H(x, z) + 0.19 : Math.max(env.H(x, z), env.G(x, z)) + 0.19;
            P.push(x, y, z); R.push(x, z, 2, 0); K.push(4); CC.push(...TILE);
          }
          // лицом вверх: материал двусторонний, и изнанка освещалась бы
          // снизу, «землёй» неба — плитка правой стороны выходила бурой
          for (let i = 0; i < n; i++) {
            const a = base + i * 2, b = a + 2;
            if (sg > 0) I.push(a, b + 1, a + 1, a, b, b + 1);
            else I.push(a, a + 1, b + 1, a, b + 1, b);
          }
          buf.quads++;
          if (prev.fill || st.fill) buf.filled++;
        }
      }
      prev = st;
    }
  }
}

export function pavingMesh(buf, name = 'street:paving') {
  if (!buf.I.length) return null;
  const { P, R, K, CC, I } = buf;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Uint8BufferAttribute(CC, 3, true));
  g.setAttribute('aRoad', new THREE.Float32BufferAttribute(R, 4));
  g.setAttribute('aCls', new THREE.Float32BufferAttribute(K, 1));
  g.setAttribute('aSurf', new THREE.Float32BufferAttribute(new Float32Array(K.length), 1));
  g.setAttribute('aJn', new THREE.Float32BufferAttribute(new Float32Array(K.length).fill(60), 1));
  g.setIndex(I);
  // плитка почти плоская, а обход у сторон улицы разный: нормаль — вверх
  const NN = new Float32Array(P.length);
  for (let i = 1; i < NN.length; i += 3) NN[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(NN, 3));
  const m = new THREE.Mesh(g, roadMaterial());
  m.receiveShadow = true; m.name = name;
  return m;
}
