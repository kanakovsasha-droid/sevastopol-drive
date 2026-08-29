import * as THREE from 'three';

// Всё рисуется процедурно прямо в шейдере, без единой картинки.
// Причина простая: координаты в атрибутах — метры, поэтому окно всегда 1.4 м,
// этаж всегда 3.15 м, а разметка всегда 12 см, на каком бы доме или дороге ни оказались.

const NOISE = `
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int k = 0; k < 4; k++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}
`;

const HASH = `
float hash21(vec2 p){
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.56);
  return fract(p.x * p.y);
}
float band(float x, float c, float hw){
  return 1.0 - smoothstep(hw * 0.7, hw * 1.35, abs(x - c));
}
`;

// Цвет правим в <color_fragment>, а шероховатость — только после
// <roughnessmap_fragment>: раньше roughnessFactor ещё не объявлен.
// Значение проносим через переменную, объявленную вне блока.
function inject(mat, key, { vertHead, vertBody, fragHead, fragBody }) {
  // Three кеширует программы по свойствам материала, а onBeforeCompile в ключ НЕ входит.
  // Без своего ключа дороги и дома молча получают программу рельефа — и все вставки пропадают.
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + vertHead)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + vertBody);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + HASH + NOISE + fragHead)
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat procRough = 0.9;\n' + fragBody)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = procRough;');
  };
  return mat;
}

// ---------------------------------------------------------------- дома
// aWall: x — метры вдоль стены, y — метры от основания, z — полная высота дома
// aKind: 0 фасад · 1 черепичная кровля · 2 глухая стена · 3 плоская кровля
//        4 рыночный ряд (ролеты) · 5 профнастил кровли · 6 тент · 7 фасад с парадным ордером
//        8 ворота гаража · 9 стена гаража из блоков
export function buildingMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.84, metalness: 0.0 });
  return inject(mat, 'sev-building', {
    vertHead: `attribute vec3 aWall; attribute float aKind;
               varying vec3 vWall; varying float vKind;`,
    vertBody: `vWall = aWall; vKind = aKind;`,
    fragHead: `varying vec3 vWall; varying float vKind;`,
    fragBody: `
      {
        vec3 c = diffuseColor.rgb;
        float rough = 0.84;

        if (vKind < 0.5 || (vKind > 6.5 && vKind < 7.5)) {
          // ---- фасад ----
          // Севастопольский центр — послевоенный фонд 1950-х: 3–5 этажей,
          // высокие окна с белыми наличниками, межэтажные тяги, карниз поверху.
          // парадный ордер (kind 7): этаж 5.2 м вместо 3.3 — послевоенная
          // классика с высокими залами, иначе двухэтажный корпус режется на четыре
          float fh0 = vKind > 6.5 ? 5.20 : 3.30;
          float nf = max(1.0, floor(vWall.z / fh0 + 0.35));
          float fh = vWall.z / nf;
          float fpos = vWall.y / fh;
          float fi = floor(fpos), fy = fract(fpos);

          // шаг простенков свой у каждого дома, иначе весь город в одну линейку
          float seed = floor(vWall.z * 7.0);
          float bay = 2.65 + 0.95 * hash21(vec2(seed, 3.0));
          float bpos = vWall.x / bay;
          float bi = floor(bpos), fx = fract(bpos);
          float r = hash21(vec2(bi, fi) + seed * 0.37);

          float ground = step(fpos, 1.0);
          // окна вытянутые по вертикали; на первом этаже — витрины и подъезды
          float x0 = mix(0.27, 0.12, ground), x1 = mix(0.73, 0.88, ground);
          float y0 = mix(0.20, 0.09, ground), y1 = mix(0.84, 0.80, ground);

          // Стиль дома. Без него весь город в одну линейку: одинаковые проёмы,
          // одинаковый ритм, одинаковый низ. Стиль постоянен для здания —
          // берётся из его же высоты, поэтому не мерцает.
          float style = hash21(vec2(seed, 11.0));
          float arch = step(0.70, style);      // полуциркульные завершения окон
          float hasBalc = step(style, 0.38);   // балконы на верхних этажах

          float ax = clamp((fx - (x0 + x1) * 0.5) / max(0.001, (x1 - x0) * 0.5), -1.0, 1.0);
          float y1e = y1 - arch * 0.17 * (1.0 - sqrt(max(0.0, 1.0 - ax * ax))) * (1.0 - ground);

          float win = smoothstep(x0 - 0.03, x0, fx) * (1.0 - smoothstep(x1, x1 + 0.03, fx))
                    * smoothstep(y0 - 0.03, y0, fy) * (1.0 - smoothstep(y1e, y1e + 0.03, fy));
          // наличник: светлая рамка чуть шире проёма
          float o = 0.075;
          float outer = smoothstep(x0 - o, x0 - o * 0.5, fx) * (1.0 - smoothstep(x1 + o * 0.5, x1 + o, fx))
                      * smoothstep(y0 - o, y0 - o * 0.5, fy) * (1.0 - smoothstep(y1e + o * 0.5, y1e + o, fy));
          float frame = clamp(outer - win, 0.0, 1.0);

          float cornice = smoothstep(vWall.z - 0.95, vWall.z - 0.55, vWall.y);
          win *= 1.0 - cornice; frame *= 1.0 - cornice;
          float low = smoothstep(0.30, 0.70, vWall.y);
          win *= low; frame *= low;

          // стекло: небо сверху, тёмная комната снизу; изредка занавеска или рама
          vec3 glass = mix(vec3(0.085, 0.105, 0.125), vec3(0.20, 0.245, 0.275), r);
          glass = mix(glass * 0.55, glass * 1.9, pow(1.0 - fy, 1.6));
          if (r > 0.86) glass = mix(glass, vec3(0.52, 0.49, 0.44), 0.75);
          if (ground > 0.5 && r > 0.5) glass = mix(glass, vec3(0.14, 0.135, 0.13), 0.6);
          // переплёт
          float mullion = band(fract((fx - x0) / max(0.001, x1 - x0) * 2.0), 0.5, 0.045);
          glass = mix(glass, vec3(0.55, 0.53, 0.49), mullion * win * 0.65);

          float ledge  = 1.0 - 0.24 * (1.0 - smoothstep(0.0, 0.05, fy));    // межэтажная тяга
          float plinth = mix(0.66, 1.0, smoothstep(0.0, 1.40, vWall.y));    // цоколь
          c *= ledge * plinth;
          c *= 1.0 - 0.22 * cornice;
          c = mix(c, c * 1.16 + 0.06, smoothstep(vWall.z - 0.55, vWall.z - 0.30, vWall.y)); // светлая полка карниза
          c *= 0.95 + 0.09 * hash21(floor(vWall.xy * vec2(0.5, 0.28)));     // разнотон штукатурки
          // рустованный цоколь: инкерманский известняк уложен блоками ~0.9 x 0.45 м,
          // на первом этаже швы видно, выше идёт гладкая штукатурка
          float rust = 1.0 - smoothstep(fh * 0.85, fh * 1.15, vWall.y);
          if (rust > 0.01) {
            vec2 blk = vec2(vWall.x / 0.92, vWall.y / 0.46);
            blk.x += step(0.5, fract(blk.y * 0.5)) * 0.5;          // перевязка вразбежку
            vec2 fb = abs(fract(blk) - 0.5);
            float seam = smoothstep(0.40, 0.485, max(fb.x, fb.y));
            c *= 1.0 - 0.30 * seam * rust;
            c *= 1.0 + 0.10 * rust * (hash21(floor(blk)) - 0.5);
          }
          c = mix(c, vec3(0.90, 0.88, 0.84), frame * 0.85);

          // балкон: плита под окном и решётка перил
          float balcBay = step(0.42, hash21(vec2(bi, floor(fi * 0.5)) + seed * 0.13));
          float balc = hasBalc * balcBay * step(1.0, fi)
                     * step(0.03, fy) * (1.0 - step(0.27, fy))
                     * step(x0 - 0.11, fx) * (1.0 - step(x1 + 0.11, fx))
                     * (1.0 - cornice);
          float rail = step(fract((fx - x0) * 15.0), 0.42) * step(0.10, fy);
          vec3 balcC = mix(c * 0.52, vec3(0.74, 0.72, 0.68), rail * 0.60);
          win *= 1.0 - balc;
          c = mix(c, balcC, balc);

          c = mix(c, glass, win);
          rough = mix(0.86, 0.12, win);
        } else if (vKind < 1.5) {
          // ---- черепица: ряды по мировым координатам ----
          float row = fract(vWall.y * 3.2);
          float col = fract(vWall.x * 2.1);
          c *= 0.85 + 0.22 * step(0.5, row);
          c *= 0.95 + 0.09 * step(0.5, col);
          c *= 0.90 + 0.17 * hash21(floor(vWall.xy * 0.75));
          rough = 0.90;
        } else if (vKind < 2.5) {
          // ---- глухая стена: штукатурка ----
          c *= 0.91 + 0.14 * hash21(floor(vWall.xy * 0.55));
        } else if (vKind < 3.5) {
          // ---- плоская кровля: рубероид с гравием ----
          c *= 0.84 + 0.28 * hash21(floor(vWall.xy * 1.7));
          c *= 0.95 + 0.09 * hash21(floor(vWall.xy * 0.35));
          rough = 0.95;
        } else if (vKind < 4.5) {
          // ---- рыночный ряд: ролетные ставни и вывески ----
          // Всё меряем ВНИЗ ОТ КАРНИЗА: низ стены уходит в грунт на метр с
          // лишним (иначе на склоне под домом щель), и от основания отсчитывать
          // нечего — ставни оказались бы под землёй.
          float ty = vWall.z - vWall.y;             // метров ниже карниза
          float bay = 3.2;
          float bi = floor(vWall.x / bay), fx = fract(vWall.x / bay);
          float r = hash21(vec2(bi, floor(vWall.z * 13.0)));
          float inBay = smoothstep(0.13, 0.16, fx) * (1.0 - smoothstep(0.84, 0.87, fx));

          // профлист: вертикальная гофра, потёки, тёмный низ
          float corr = abs(fract(vWall.x / 0.11) - 0.5) * 2.0;
          c *= 0.90 + 0.15 * corr;
          c *= 0.93 + 0.11 * hash21(floor(vWall.xy * 0.4));
          c *= 1.0 - 0.16 * smoothstep(3.3, 4.4, ty);
          c *= 1.0 - 0.09 * smoothstep(3.4, 2.6, ty) * hash21(floor(vWall.xy * 1.3));

          // ролета: горизонтальные ламели 7 см
          float shut = inBay * smoothstep(3.55, 3.48, ty) * smoothstep(1.28, 1.34, ty);
          float slat = abs(fract(vWall.y / 0.07) - 0.5) * 2.0;
          vec3 shutC = mix(vec3(0.72, 0.72, 0.71), vec3(0.55, 0.56, 0.57), r);
          shutC *= 0.88 + 0.20 * slat;
          // открытая лавка: сумрак внутри, светлый прилавок и товар на нём
          if (r > 0.84) {
            float depth = smoothstep(3.5, 1.5, ty);
            shutC = mix(vec3(0.185, 0.170, 0.155), vec3(0.085, 0.080, 0.078), depth);
            float counter = smoothstep(3.32, 3.26, ty) * smoothstep(3.02, 3.08, ty);
            shutC = mix(shutC, vec3(0.60, 0.57, 0.52), counter * 0.85);
            float goods = step(0.55, hash21(vec2(floor(vWall.x / 0.34), 9.0)))
                        * smoothstep(3.02, 2.96, ty) * smoothstep(2.72, 2.78, ty);
            vec3 gc = 0.30 + 0.55 * vec3(hash21(vec2(floor(vWall.x / 0.34), 2.0)),
                                         hash21(vec2(floor(vWall.x / 0.34), 4.0)),
                                         hash21(vec2(floor(vWall.x / 0.34), 6.0)));
            shutC = mix(shutC, gc, goods * 0.8);
          }
          c = mix(c, shutC, shut);

          // вывеска: полоса 0.8 м под карнизом и не у каждой секции
          float hasBoard = step(0.40, hash21(vec2(bi, 5.0)));
          float board = hasBoard * inBay
                      * smoothstep(1.05, 1.00, ty) * smoothstep(0.25, 0.30, ty);
          float hb = hash21(vec2(bi, 17.0));
          vec3 sc = hb < 0.34 ? vec3(0.62, 0.09, 0.08)
                  : hb < 0.58 ? vec3(0.78, 0.42, 0.05)
                  : hb < 0.76 ? vec3(0.07, 0.24, 0.46)
                  : hb < 0.90 ? vec3(0.09, 0.30, 0.18)
                              : vec3(0.85, 0.83, 0.80);
          // буквы: рваная строка по середине вывески, а не сплошная полоса
          float lw = 0.16 + 0.10 * hash21(vec2(bi, 23.0));
          float letters = step(0.38, hash21(vec2(floor(vWall.x / lw), floor(hb * 20.0))))
                        * step(0.48, ty) * (1.0 - step(0.86, ty));
          sc = mix(sc, vec3(0.96, 0.95, 0.92), letters * 0.88);
          c = mix(c, sc, board);
          rough = mix(0.88, 0.45, max(shut, board));
        } else if (vKind < 5.5) {
          // ---- профнастил кровли: гофра поперёк ската ----
          float corrR = abs(fract(vWall.x / 0.26) - 0.5) * 2.0;
          c *= 0.84 + 0.26 * corrR;
          c *= 0.93 + 0.12 * hash21(floor(vWall.xy * vec2(0.3, 0.8)));   // подтёки и ржавь
          c = mix(c, c * vec3(1.05, 0.94, 0.84), 0.35 * hash21(floor(vWall.xy * 0.22)));
          rough = 0.55;
        } else if (vKind < 6.5) {
          // ---- тент над проходом: полосы поперёк ----
          float st = step(0.5, fract(vWall.x / 0.55));
          c = mix(vec3(0.94, 0.93, 0.90), c, st);
          c *= 0.93 + 0.10 * hash21(floor(vWall.xy * 3.0));
          rough = 0.80;
        } else if (vKind < 8.5) {
          // ---- ворота гаражного бокса: две крашеные створки ----
          // x здесь — доля поперёк бокса, y — метры от подошвы (она в грунте).
          float fx = vWall.x;
          float ty = vWall.z - vWall.y;                 // метров ниже верха
          float hi = 0.52, lo = vWall.z - 0.95;         // проём по вертикали
          float leaf = smoothstep(0.10, 0.13, fx) * (1.0 - smoothstep(0.87, 0.90, fx))
                     * smoothstep(hi, hi + 0.05, ty) * (1.0 - smoothstep(lo - 0.06, lo, ty));
          // стена вокруг проёма — блоки, как у боковых стен
          vec2 blk = vec2(vWall.x * 3.4 / 0.39, vWall.y / 0.19);
          blk.x += step(0.5, fract(blk.y)) * 0.5;
          vec2 fb = abs(fract(blk) - 0.5);
          float seam = smoothstep(0.39, 0.48, max(fb.x, fb.y));
          vec3 wallC = vec3(0.78, 0.76, 0.72) * (0.93 + 0.12 * hash21(floor(blk)));
          wallC *= 1.0 - 0.26 * seam;
          // створки: горизонтальные пояса жёсткости и шов посередине
          vec3 dc = c;
          float rib = 1.0 - smoothstep(0.03, 0.07, abs(fract(vWall.y / 0.34) - 0.5));
          dc *= 0.88 + 0.20 * rib;
          float split = 1.0 - smoothstep(0.010, 0.022, abs(fx - 0.5));
          dc = mix(dc, dc * 0.35, split);
          // ржавчина понизу и по краям
          float rust = fbm(vec2(vWall.x * 9.0, vWall.y * 2.2)) * smoothstep(0.9, 2.1, ty);
          dc = mix(dc, vec3(0.42, 0.24, 0.13), clamp(rust - 0.42, 0.0, 1.0) * 0.9);
          // засов и петли
          float hasp = (1.0 - smoothstep(0.03, 0.05, abs(fx - 0.5)))
                     * (1.0 - smoothstep(0.10, 0.16, abs(ty - (lo - 0.85))));
          dc = mix(dc, vec3(0.20, 0.19, 0.18), hasp);
          // притолока и откосы чуть темнее — проём утоплен
          float reveal = (1.0 - leaf) * (smoothstep(0.06, 0.10, fx) * (1.0 - smoothstep(0.90, 0.94, fx)))
                       * smoothstep(hi - 0.10, hi, ty);
          c = mix(wallC, dc, leaf);
          c *= 1.0 - 0.22 * reveal;
          rough = mix(0.92, 0.48, leaf);
        } else {
          // ---- глухая стена бокса: бетонные блоки под побелкой ----
          vec2 blk = vec2(vWall.x / 0.39, vWall.y / 0.19);
          blk.x += step(0.5, fract(blk.y)) * 0.5;
          vec2 fb = abs(fract(blk) - 0.5);
          float seam = smoothstep(0.39, 0.48, max(fb.x, fb.y));
          c *= 0.92 + 0.14 * hash21(floor(blk));
          c *= 1.0 - 0.24 * seam;
          c *= 1.0 - 0.12 * smoothstep(1.2, 0.2, vWall.y);
          rough = 0.94;
        }
        diffuseColor.rgb = c;
        procRough = rough;
      }`,
  });
}

// ---------------------------------------------------------------- дороги
// aRoad: x — поперёк [-1..1], y — метры вдоль, z — ширина в метрах
// aCls: 0 магистраль · 1 главная · 2 улица · 3 проезд · 4 пешеходная · 5 тротуар · 6 бордюр
export function roadMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.90, metalness: 0.0,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -6,
  });
  return inject(mat, 'sev-road', {
    vertHead: `attribute vec3 aRoad; attribute float aCls;
               varying vec3 vRoad; varying float vCls;`,
    vertBody: `vRoad = aRoad; vCls = aCls;`,
    fragHead: `varying vec3 vRoad; varying float vCls;`,
    fragBody: `
      {
        vec3 c = diffuseColor.rgb;
        float m = vRoad.x * vRoad.z * 0.5;    // метры от осевой
        float v = vRoad.y;                    // метры вдоль
        float halfW = vRoad.z * 0.5;
        float am = abs(m);
        float rough = 0.90;

        if (vCls > 3.5 && vCls < 5.5) {
          // ---- тротуар и пешеходная зона: плитка ----
          vec2 g = vec2(m, v) / 0.52;
          vec2 f = abs(fract(g + vec2(0.0, step(0.5, fract(g.x * 0.5)) * 0.5)) - 0.5);
          float grout = smoothstep(0.40, 0.48, max(f.x, f.y));
          c *= 1.0 - 0.13 * grout;
          c *= 0.95 + 0.09 * hash21(floor(g));
        } else if (vCls > 6.5) {
          // ---- зебра: полосы вдоль движения, белая и жёлтая вперемешку ----
          float k = floor(m / 0.88);
          float on = step(fract(m / 0.88), 0.52);
          float wear = 0.58 + 0.42 * hash21(floor(vec2(m * 1.3, v * 2.2)));
          vec3 stripe = (mod(abs(k), 2.0) < 0.5 ? vec3(0.64, 0.62, 0.58) : vec3(0.62, 0.49, 0.16)) * wear;
          vec3 asph = vec3(0.030, 0.030, 0.033) * (0.88 + 0.24 * hash21(floor(vec2(m * 2.0, v * 2.0))));
          c = mix(asph, stripe, on);
          rough = mix(0.92, 0.66, on);
        } else if (vCls > 5.5) {
          // ---- бордюрный камень ----
          c *= 0.90 + 0.13 * hash21(vec2(floor(v / 0.95), 0.0));
          c *= 1.0 - 0.35 * band(fract(v / 0.95), 0.0, 0.05);
        } else {
          // ---- асфальт ----
          c *= 0.89 + 0.16 * hash21(floor(vec2(m * 1.6, v * 1.6)));
          c *= 0.96 + 0.07 * hash21(floor(vec2(m * 0.3, v * 0.22)));
          // накат от колёс
          c *= 1.0 - 0.10 * (band(am, halfW * 0.42, 0.55) + band(am, halfW * 0.42, 1.1) * 0.4);

          if (vRoad.z > 5.2 && vCls < 2.5) {
            float line = 0.0;
            line += band(am, halfW - 0.55, 0.06);                       // краевая сплошная
            line += band(am, 0.0, 0.07) * step(fract(v / 9.0), 0.46);  // осевая прерывистая
            if (vRoad.z > 11.0) {                                       // разделение полос
              line += band(am, halfW * 0.5, 0.06) * step(fract(v / 9.0 + 0.5), 0.40);
            }
            float wear = 0.55 + 0.45 * hash21(floor(vec2(v * 0.7, m * 2.5)));
            vec3 paint = vec3(0.66, 0.645, 0.60) * wear;
            float k = clamp(line, 0.0, 1.0) * 0.92;
            c = mix(c, paint, k);
            rough = mix(rough, 0.62, k);
          }
        }
        diffuseColor.rgb = c;
        procRough = rough;
      }`,
  });
}

// ---------------------------------------------------------------- земля
// Вершинного цвета мало: треугольник рельефа — 9 метров, и без мелкой структуры
// земля читается как крашеный пластик. Шум по мировым координатам даёт
// траву, выгоревшие пятна, асфальтовую крошку и заплаты — без единой текстуры.
// aTer: x — застроенность (0 склон, 1 город), y — крутизна (камень)
export function terrainMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  return inject(mat, 'sev-terrain', {
    vertHead: `attribute vec2 aTer; varying vec2 vTer; varying vec2 vXZ;`,
    vertBody: `vTer = aTer; vXZ = (modelMatrix * vec4(position, 1.0)).xz;`,
    fragHead: `varying vec2 vTer; varying vec2 vXZ;`,
    fragBody: `
      {
        vec3 c = diffuseColor.rgb;
        float fine = fbm(vXZ * 0.85);      // ~1 м
        float mid  = fbm(vXZ * 0.115);     // ~9 м
        float big  = fbm(vXZ * 0.019);     // ~50 м
        float urban = vTer.x, rock = vTer.y;

        // природная земля: крупные выгоревшие пятна, мелкая трава
        vec3 nat = c * (0.78 + 0.46 * mid);
        nat = mix(nat, nat * vec3(1.22, 1.09, 0.74), smoothstep(0.52, 0.86, big));
        nat *= 0.88 + 0.24 * fine;

        // город: крошка, заплаты, разнотон
        vec3 urb = c * (0.82 + 0.36 * fine);
        urb *= 0.90 + 0.20 * smoothstep(0.58, 0.66, mid);
        urb = mix(urb, urb * 0.86, smoothstep(0.70, 0.78, big));

        c = mix(nat, urb, urban);
        // на крутизне известняк выходит слоями
        c = mix(c, c * (0.80 + 0.44 * fbm(vXZ * vec2(0.30, 0.9))), rock * 0.85);

        diffuseColor.rgb = c;
        procRough = mix(0.97, 0.90, urban);
      }`,
  });
}
