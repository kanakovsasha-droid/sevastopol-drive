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
//        8 ворота гаража · 9 стена гаража из блоков · 10 витраж ТЦ
//        11 парадный ордер с арками · 12 школа · 13 храм
export function buildingMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.84, metalness: 0.0 });
  return inject(mat, 'sev-building', {
    vertHead: `attribute vec3 aWall; attribute float aKind;
               varying vec3 vWall; varying float vKind; varying float vSun;`,
    // vSun — с какой стороны стены светит солнце, в системе КООРДИНАТ СТЕНЫ.
    // Нужно для откосов: тень лежит на том откосе, что отвёрнут от солнца, и
    // без этого пришлось бы затемнять всегда один и тот же бок — на половине
    // города это выглядело бы вывернутым наизнанку.
    // worldgen строит стену так: нормаль n = (dz, -dx)/l, а метры вдоль стены
    // растут по ребру d = (dx, dz)/l. Отсюда касательная T = (-n.z, n.x).
    // Направление НА солнце берём из main.js (SUN = -0.48, 0.70, 0.53):
    // vSun = dot(T.xz, SUN.xz) = 0.53 * n.x + 0.48 * n.z.
    vertBody: `vWall = aWall; vKind = aKind;
               {
                 vec3 wn = mat3(modelMatrix) * objectNormal;
                 vSun = 0.53 * wn.x + 0.48 * wn.z;
               }`,
    fragHead: `varying vec3 vWall; varying float vKind; varying float vSun;
      // Линейная рампа вместо smoothstep. У откоса, подоконника и трубы край
      // ГЕОМЕТРИЧЕСКИЙ, кубическое сглаживание там не видно, а фасад — самый
      // горячий шейдер сцены: полтора десятка smoothstep стоили ~40% кадра
      // на виде, где стена занимает весь экран.
      float lr(float x, float k){ return clamp(x * k, 0.0, 1.0); }`,
    fragBody: `
      {
        vec3 c = diffuseColor.rgb;
        float rough = 0.84;

        if (vKind < 0.5 || (vKind > 6.5 && vKind < 7.5) || (vKind > 10.5 && vKind < 11.5)) {
          // ---- фасад ----
          // Севастопольский центр — послевоенный фонд 1950-х: 3–5 этажей,
          // высокие окна с белыми наличниками, межэтажные тяги, карниз поверху.
          // парадный ордер (kind 7): этаж 5.2 м вместо 3.3 — послевоенная
          // классика с высокими залами, иначе двухэтажный корпус режется на четыре
          float fh0 = vKind > 6.5 ? 5.20 : 3.30;
          float forceArch = step(10.5, vKind);          // 11 — окна заведомо арочные
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
          float upper = 1.0 - ground;
          // Последний этаж. Раньше все этажи были одинаковые, и дом читался
          // как решётка из одинаковых дырок — отсюда и «Роблокс». В жизни
          // низ, середина и верх разные: витрина, окно, окно поменьше.
          float topFloor = step(nf - 1.5, fi) * upper;

          // Стиль дома. Без него весь город в одну линейку: одинаковые проёмы,
          // одинаковый ритм, одинаковый низ. Стиль постоянен для здания —
          // берётся из его же высоты, поэтому не мерцает.
          float style = hash21(vec2(seed, 11.0));
          float arch = max(forceArch, step(0.70, style));   // полуциркульные завершения окон
          float hasBalc = step(style, 0.38);   // балконы на верхних этажах
          // часть домов получает полуциркульные окна ТОЛЬКО на последнем этаже —
          // так верх отличается от середины, как в послевоенной застройке.
          // Раскручиваем уже посчитанные style и r вместо новых hash21:
          // фасад — самый горячий шейдер, каждый лишний хеш здесь стоит кадров.
          float archTop = step(0.45, fract(style * 7.31));
          // примерно каждый пятый пролёт первого этажа — подъезд, а не витрина
          float door = ground * step(0.82, fract(r * 5.17));

          // окна вытянутые по вертикали; на первом этаже — витрины и подъезды
          float x0 = mix(0.27, 0.12, ground) + 0.050 * topFloor;
          float x1 = mix(0.73, 0.88, ground) - 0.050 * topFloor;
          float y0 = mix(0.20, 0.09, ground) + 0.030 * topFloor;
          float y1 = mix(0.84, 0.80, ground) - 0.085 * topFloor;
          x0 = mix(x0, 0.36, door); x1 = mix(x1, 0.64, door);
          y0 = mix(y0, 0.02, door); y1 = mix(y1, 0.70, door);

          float archAmt = max(arch * upper, archTop * topFloor) * (1.0 - door);
          float ax = clamp((fx - (x0 + x1) * 0.5) / max(0.001, (x1 - x0) * 0.5), -1.0, 1.0);
          float y1e = y1 - archAmt * 0.17 * (1.0 - sqrt(max(0.0, 1.0 - ax * ax)));

          float win = smoothstep(x0 - 0.03, x0, fx) * (1.0 - smoothstep(x1, x1 + 0.03, fx))
                    * smoothstep(y0 - 0.03, y0, fy) * (1.0 - smoothstep(y1e, y1e + 0.03, fy));
          // наличник: светлая рамка чуть шире проёма
          float o = 0.075;
          float outer = smoothstep(x0 - o, x0 - o * 0.5, fx) * (1.0 - smoothstep(x1 + o * 0.5, x1 + o, fx))
                      * smoothstep(y0 - o, y0 - o * 0.5, fy) * (1.0 - smoothstep(y1e + o * 0.5, y1e + o, fy));
          float frame = clamp(outer - win, 0.0, 1.0);

          float cornice = smoothstep(vWall.z - 0.95, vWall.z - 0.55, vWall.y);
          float low = smoothstep(0.30, 0.70, vWall.y);
          // winOn — «здесь вообще бывает окно»: не карниз и не закопанный низ.
          // Подоконник и потёки живут НИЖЕ проёма, где сам win уже ноль,
          // поэтому им нужна отдельная маска колонки.
          float winOn = (1.0 - cornice) * low;
          win *= winOn; frame *= winOn;

          // ---------- глубина проёма ----------
          // Главное, чего не хватало городу: окно было тёмным пятном В ПЛОСКОСТИ
          // стены. В жизни оно утоплено на 12–18 см, и с улицы видно три вещи —
          // тень под перемычкой, тень на откосе, отвёрнутом от солнца, и светлую
          // полку подоконника. Считаем в МЕТРАХ от краёв проёма: доли пролёта
          // у каждого дома свои, а откос везде одинаковый.
          float wx  = (fx - x0) * bay;          // метров от левого края проёма
          float wxr = (x1 - fx) * bay;          // от правого
          float wy  = (fy - y0) * fh;           // от низа
          float wyt = (y1e - fy) * fh;          // от верха
          float sunR = step(0.0, vSun);         // 1 — солнце со стороны +x стены
          float shJ = mix(wx, wxr, sunR);       // метры до ЗАТЕНЁННОГО откоса
          // откос ~12.5 см (1/8), теневой чуть у́же (1/9), подоконник 9 см (1/11)
          float revTop  = 1.0 - lr(wyt, 8.0);
          float revDark = 1.0 - lr(shJ, 9.0);
          float revSill = 1.0 - lr(wy, 11.0);

          // стекло: небо сверху, тёмная комната снизу; изредка занавеска или рама
          vec3 glass = mix(vec3(0.085, 0.105, 0.125), vec3(0.20, 0.245, 0.275), r);
          glass = mix(glass * 0.55, glass * 1.9, pow(1.0 - fy, 1.6));
          if (r > 0.86) glass = mix(glass, vec3(0.52, 0.49, 0.44), 0.75);
          if (ground > 0.5 && r > 0.5) glass = mix(glass, vec3(0.14, 0.135, 0.13), 0.6);
          // подъезд: тёмное полотно двери, над ним светлый фрамужный просвет
          glass = mix(glass, mix(vec3(0.112, 0.094, 0.078), glass * 1.25,
                                 1.0 - lr(wyt - 0.50, 4.5)), door);
          // переплёт
          float mullion = band(fract((fx - x0) / max(0.001, x1 - x0) * 2.0), 0.5, 0.045);
          glass = mix(glass, vec3(0.55, 0.53, 0.49), mullion * win * 0.65);
          // тень перемычки и откоса ЛОЖИТСЯ НА СТЕКЛО. Без неё утопленность
          // видна только по рамке, а само стекло остаётся плоской наклейкой.
          glass *= 1.0 - 0.42 * (1.0 - lr(wyt, 1.75));
          glass *= 1.0 - 0.26 * (1.0 - lr(shJ, 2.40));

          // Межэтажная тяга: тёмная линия под полкой и светлая полка над ней.
          // Одна тёмная линия читалась как нарисованная, пара «тень + свет»
          // сразу превращает её в выступающий поясок.
          float ledge  = 1.0 - 0.24 * (1.0 - lr(fy, 20.0));
          ledge *= 1.0 + 0.10 * lr(fy - 0.048, 70.0) * (1.0 - lr(fy - 0.078, 45.0));
          float plinth = mix(0.66, 1.0, smoothstep(0.0, 1.40, vWall.y));    // цоколь
          c *= ledge * plinth;
          c *= 1.0 - 0.22 * cornice;
          c = mix(c, c * 1.16 + 0.06, smoothstep(vWall.z - 0.55, vWall.z - 0.30, vWall.y)); // светлая полка карниза
          // карниз ВЫСТУПАЕТ над стеной, значит под ним всегда тень.
          // Без этой полосы он читался как нарисованная линия, а не как плита.
          float ty2 = vWall.z - vWall.y;                                    // метров ниже верха
          c *= 1.0 - 0.24 * (1.0 - lr(ty2 - 0.98, 2.1)) * (1.0 - cornice);
          // Разнотон штукатурки: пятна ремонта и выцветания. Масштаб КРУПНЫЙ
          // (около 10 м), иначе дом рассыпается на конфетти и перестаёт
          // читаться одним цветом. Одна октава: fbm тут был бы вчетверо дороже.
          float pat = vnoise(vWall.xy * 0.105);
          c *= 0.90 + 0.21 * pat;
          c = mix(c, c * vec3(1.05, 1.00, 0.92), lr(pat - 0.56, 3.1) * 0.6);
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

          // ---------- водосточная труба ----------
          // Одна на 12–18 м стены, от карниза до земли: длинный фасад без неё
          // выглядит бесконечной лентой окон. Ось СНАПИМ на простенок между
          // окнами — труба, режущая стекло, читается как ошибка рендера.
          float pipeN = max(1.0, floor((12.0 + 6.0 * fract(style * 13.7)) / bay + 0.5));
          float pdx = (bpos - floor(bpos / pipeN + 0.5) * pipeN) * bay;   // метров от оси
          float apx = abs(pdx);
          float pipe = lr(0.070 - apx, 90.0) * (1.0 - cornice);
          // тень падает на сторону, противоположную солнцу
          float pipeSh = lr(0.135 - abs(pdx + mix(-0.088, 0.088, sunR)), 12.5)
                       * (1.0 - pipe) * (1.0 - cornice);
          c *= 1.0 - 0.32 * pipeSh;
          float pround = clamp(pdx * 16.0 * mix(-1.0, 1.0, sunR), -1.0, 1.0);
          c = mix(c, c * (0.44 + 0.44 * (0.5 + 0.5 * pround)), pipe);

          // ---------- потёки и загрязнения ----------
          // Дождь сносит пыль с подоконников и из-под карниза узкими полосами,
          // а от тротуара летят брызги. Слабо: сильные потёки превращают
          // жилой центр в заброшку.
          float sx = hash21(vec2(floor(vWall.x / 0.17), 7.0));
          float drip = lr(sx - 0.62, 3.0);
          c *= 1.0 - 0.085 * drip * lr(ty2 - 0.95, 4.0) * (1.0 - lr(ty2 - 1.5, 0.48));
          c *= 1.0 - 0.15 * (1.0 - lr(vWall.y - 1.20, 1.33)) * (0.55 + 0.55 * sx);

          c = mix(c, vec3(0.90, 0.88, 0.84), frame * 0.85);

          // ---------- подоконник ----------
          // Светлая полка с выносом 7 см по бокам и тень под ней. Вторая по
          // силе подсказка объёма после откосов: она даёт фасаду горизонтали,
          // которых у плоской стены нет.
          float below = -wy;                                              // метров ниже проёма
          float sillX = lr(wx + 0.085, 40.0) * lr(wxr + 0.085, 40.0);     // вынос 8.5 см вбок
          float sillOn = sillX * winOn * (1.0 - door);
          float sillF = sillOn * lr(below + 0.012, 63.0) * (1.0 - lr(below - 0.065, 50.0));
          float sillS = sillOn * lr(below - 0.070, 40.0) * (1.0 - lr(below - 0.13, 3.7));
          c *= 1.0 - 0.40 * sillS;
          c = mix(c, min(vec3(1.0), c * 1.42 + 0.10), sillF * 0.9);
          // потёк из-под подоконника
          c *= 1.0 - 0.11 * drip * sillOn * lr(below - 0.07, 16.0) * (1.0 - lr(below - 0.18, 2.3));

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

          // Откос — та же штукатурка, что и стена, поэтому берём готовый c со
          // всем разнотоном и только подсвечиваем/затемняем грани проёма.
          vec3 revC = c * (1.0 - 0.60 * revTop) * (1.0 - 0.44 * revDark);
          revC = mix(revC, min(vec3(1.0), c * 1.34 + 0.06), revSill);     // полка подоконника
          float revMask = max(max(revTop, revDark), revSill);

          c = mix(c, mix(glass, revC, revMask), win);
          rough = mix(0.86, mix(0.12, 0.90, revMask), win);
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
        } else if (vKind > 11.5 && vKind < 12.5) {
          // ---- школа: широкие ленты окон, простенки, лестничный витраж ----
          // Типовая советская школа узнаётся по ритму: окна класса идут
          // тройками во всю ширину пролёта, между пролётами глухой простенок,
          // а лестничная клетка — сплошная вертикальная лента стекла.
          float fh = 3.90;
          float fpos = vWall.y / fh;
          float fi = floor(fpos), fy = fract(fpos);
          float seed = floor(vWall.z * 5.0);
          float BAY = 6.60;                              // пролёт класса
          float bp = vWall.x / BAY;
          float bi = floor(bp), fx = fract(bp);
          // лестничная клетка: каждый пятый пролёт — витраж во всю высоту
          float stair = step(0.80, fract(bi * 0.2 + hash21(vec2(seed, 3.0))));
          float ground = step(fpos, 1.0);

          // тройное окно класса
          float win3 = 0.0;
          for (int k = 0; k < 3; k++) {
            float c0 = 0.135 + float(k) * 0.265;
            win3 += smoothstep(c0 - 0.02, c0, fx) * (1.0 - smoothstep(c0 + 0.205, c0 + 0.225, fx));
          }
          float wy = smoothstep(0.16, 0.20, fy) * (1.0 - smoothstep(0.80, 0.84, fy));
          float win = win3 * wy * (1.0 - stair);
          // витраж лестницы: сплошной по вертикали, с ригелями по этажам
          float sv = smoothstep(0.16, 0.20, fx) * (1.0 - smoothstep(0.80, 0.84, fx))
                   * smoothstep(0.35, 0.55, vWall.y)
                   * (1.0 - smoothstep(vWall.z - 1.15, vWall.z - 0.85, vWall.y));
          float rig = 1.0 - smoothstep(0.02, 0.05, abs(fy - 0.06));
          win = max(win, stair * sv * (1.0 - rig * 0.85));

          vec3 glass = mix(vec3(0.085, 0.105, 0.120), vec3(0.235, 0.290, 0.315), 1.0 - fy);
          glass *= 0.88 + 0.26 * hash21(vec2(bi * 3.0 + floor(fx * 4.0), fi) + seed);
          float mull = 1.0 - smoothstep(0.010, 0.024, abs(fract(fx * 12.0) - 0.5) - 0.46);
          glass = mix(glass, vec3(0.80, 0.79, 0.76), mull * win * 0.5);

          c *= 0.95 + 0.09 * hash21(floor(vWall.xy * vec2(0.35, 0.30)));
          c *= mix(0.74, 1.0, smoothstep(0.0, 1.10, vWall.y));          // цоколь
          float ledge = 1.0 - 0.16 * (1.0 - smoothstep(0.0, 0.06, fy)); // межэтажная тяга
          c *= ledge;
          float cornice = smoothstep(vWall.z - 0.70, vWall.z - 0.40, vWall.y);
          c = mix(c, c * 1.14 + 0.05, cornice);
          win *= 1.0 - cornice;
          // светлый откос вокруг проёма
          float o = 0.03;
          float outer = win3 * smoothstep(0.13, 0.16, fy) * (1.0 - smoothstep(0.84, 0.87, fy));
          c = mix(c, vec3(0.93, 0.92, 0.89), clamp(outer - win, 0.0, 1.0) * 0.7 * (1.0 - stair));
          c = mix(c, glass, win);
          // тонкая полоса цоколя под первым этажом — плитка
          c *= 1.0 - 0.10 * ground * step(fy, 0.10);
          rough = mix(0.88, 0.12, win);
        } else if (vKind > 12.5) {
          // ---- храм: инкерманский камень, диоритовый цоколь, арочные окна ----
          float plinth = 1.0 - smoothstep(2.2, 2.6, vWall.y);
          vec3 diorite = vec3(0.145, 0.150, 0.140) * (0.85 + 0.30 * hash21(floor(vWall.xy * 1.1)));
          // квадры инкерманского камня 1.1 x 0.55 м
          vec2 blk = vec2(vWall.x / 1.10, vWall.y / 0.55);
          blk.x += step(0.5, fract(blk.y)) * 0.5;
          vec2 fb = abs(fract(blk) - 0.5);
          float seam = smoothstep(0.42, 0.49, max(fb.x, fb.y));
          c *= 0.94 + 0.10 * hash21(floor(blk));
          c *= 1.0 - 0.18 * seam;
          // серые тяги: пояс по низу стены и под карнизом — как на панораме
          float belt = (1.0 - smoothstep(0.10, 0.16, abs(vWall.y - 3.4)))
                     + (1.0 - smoothstep(0.10, 0.16, abs(vWall.y - vWall.z + 1.9)));
          c = mix(c, vec3(0.52, 0.53, 0.51), clamp(belt, 0.0, 1.0) * 0.75);
          // высокие полуциркульные окна через 4.4 м
          float bp2 = vWall.x / 4.40;
          float fx2 = fract(bp2);
          float y0 = 4.6, y1 = min(vWall.z - 2.6, 10.6);
          float ax = clamp((fx2 - 0.5) / 0.115, -1.0, 1.0);
          float top = y1 - 0.52 * (1.0 - sqrt(max(0.0, 1.0 - ax * ax)));
          float win = smoothstep(0.383, 0.392, fx2) * (1.0 - smoothstep(0.608, 0.617, fx2))
                    * smoothstep(y0 - 0.08, y0, vWall.y) * (1.0 - smoothstep(top, top + 0.08, vWall.y));
          float band = smoothstep(0.365, 0.376, fx2) * (1.0 - smoothstep(0.624, 0.635, fx2))
                     * smoothstep(y0 - 0.30, y0 - 0.22, vWall.y)
                     * (1.0 - smoothstep(top + 0.30, top + 0.38, vWall.y));
          c = mix(c, vec3(0.90, 0.88, 0.83), clamp(band - win, 0.0, 1.0) * 0.8);  // архивольт
          vec3 glass = mix(vec3(0.045, 0.055, 0.060), vec3(0.16, 0.19, 0.21), 1.0 - vWall.y / max(1.0, y1));
          c = mix(c, glass, win);
          // диоритовый цоколь и карниз
          c = mix(c, diorite, plinth * 0.92);
          float cor = smoothstep(vWall.z - 1.15, vWall.z - 0.75, vWall.y);
          c = mix(c, vec3(0.88, 0.86, 0.80), cor * 0.85);
          rough = mix(0.90, 0.20, win);
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
        } else if (vKind > 9.5) {
          // ---- витраж торгового центра или кинотеатра ----
          // Лента остекления на этаж 3.6 м, между лентами composite-панель,
          // импосты через 1.35 м, ригель посередине ленты.
          float band = 3.60;
          float fy = fract(vWall.y / band);
          float glassBand = smoothstep(0.09, 0.13, fy) * (1.0 - smoothstep(0.76, 0.80, fy));
          float fr = fract(vWall.x / 1.35);
          float dm = min(fr, 1.0 - fr);
          float mull = 1.0 - smoothstep(0.016, 0.038, dm);           // импост ~2 см
          float transom = 1.0 - smoothstep(0.014, 0.032, abs(fy - 0.45));
          // стекло тёмное с зеленцой: сверху небо, снизу нутро зала
          float sky = smoothstep(0.10, 0.78, fy);
          vec3 gl = mix(vec3(0.030, 0.048, 0.052), vec3(0.16, 0.29, 0.32), sky * sky);
          gl += vec3(0.10, 0.13, 0.14) * smoothstep(0.66, 0.78, fy);  // отблеск у ригеля
          gl *= 0.86 + 0.30 * hash21(floor(vec2(vWall.x / 1.35, vWall.y / band)));
          vec3 frame = vec3(0.255, 0.263, 0.271);
          vec3 pier = mix(c, vec3(0.44, 0.45, 0.46), 0.55)
                    * (0.90 + 0.14 * hash21(floor(vWall.xy * vec2(0.7, 1.4))));
          c = mix(pier, gl, glassBand);
          c = mix(c, frame, max(mull, transom * glassBand));
          c *= mix(0.66, 1.0, smoothstep(0.0, 1.3, vWall.y));         // цоколь
          float cor = smoothstep(vWall.z - 0.80, vWall.z - 0.40, vWall.y);
          c = mix(c, vec3(0.80, 0.80, 0.79), cor * 0.85);             // парапет
          rough = mix(0.84, 0.07, glassBand * (1.0 - max(mull, transom)));
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
    vertHead: `attribute vec4 aRoad; attribute float aCls; attribute float aSurf;
               varying vec4 vRoad; varying float vCls; varying float vSurf;`,
    vertBody: `vRoad = aRoad; vCls = aCls; vSurf = aSurf;`,
    fragHead: `varying vec4 vRoad; varying float vCls; varying float vSurf;`,
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
        } else if (vSurf > 0.5 && vSurf < 1.5) {
          // ---- брусчатка: тег surface=paving_stones/sett из OSM ----
          // Камень кладут ДУГАМИ поперёк проезда, а не сеткой: ряд смещается
          // тем сильнее, чем дальше от середины полотна.
          float row = v / 0.30;
          float bow = 0.55 * cos(clamp(m / max(2.0, halfW), -1.0, 1.0) * 1.5708);
          float rr = floor(row + bow);
          float col = m / 0.22 + 0.5 * mod(rr, 2.0);
          vec2 cell = vec2(floor(col), rr);
          float rnd = hash21(cell);
          // серо-бежевый инкерманский камень с разбросом по тону
          vec3 stone = mix(vec3(0.300, 0.286, 0.264), vec3(0.470, 0.446, 0.406), rnd);
          stone *= 0.90 + 0.16 * hash21(cell + 19.0);
          // шов между камнями
          vec2 f = abs(fract(vec2(col, row + bow)) - 0.5);
          float joint = smoothstep(0.34, 0.47, max(f.x, f.y));
          c = mix(stone, stone * 0.55, joint);
          // колея: по накатанному камень темнее и глаже
          float rut = band(am, halfW * 0.42, 0.9);
          c *= 1.0 - 0.10 * rut;
          rough = mix(0.88, 0.70, rut) - 0.10 * (1.0 - joint);
          diffuseColor.rgb = c; procRough = rough; 
        } else if (vSurf > 1.5 && vSurf < 2.5) {
          // ---- бетонные плиты: surface=concrete ----
          vec2 g2 = vec2(m / 2.9, v / 5.8);
          vec2 f2 = abs(fract(g2) - 0.5);
          float seam = smoothstep(0.43, 0.492, max(f2.x, f2.y));
          vec3 slab = vec3(0.412, 0.408, 0.396) * (0.93 + 0.12 * hash21(floor(g2)));
          slab *= 0.97 + 0.06 * fbm(vec2(m, v) * 0.7);
          c = mix(slab, slab * 0.72, seam);
          rough = 0.90;
          diffuseColor.rgb = c; procRough = rough;
        } else if (vSurf > 2.5) {
          // ---- грунт и щебень: surface=ground/gravel/unpaved ----
          vec3 soil = mix(vec3(0.263, 0.216, 0.161), vec3(0.400, 0.345, 0.263), fbm(vec2(m, v) * 1.3));
          soil *= 0.86 + 0.28 * hash21(floor(vec2(m * 6.0, v * 6.0)));
          // две колеи от колёс, между ними трава
          float rut2 = band(am, halfW * 0.45, 0.75);
          soil = mix(soil, soil * 0.78, rut2);
          soil = mix(soil, vec3(0.263, 0.290, 0.180), 0.35 * (1.0 - rut2) * step(am, halfW * 0.18));
          c = soil; rough = 0.98;
          diffuseColor.rgb = c; procRough = rough;
        } else {
          // ---- асфальт ----
          c *= 0.89 + 0.16 * hash21(floor(vec2(m * 1.6, v * 1.6)));
          c *= 0.96 + 0.07 * hash21(floor(vec2(m * 0.3, v * 0.22)));
          // накат от колёс
          c *= 1.0 - 0.10 * (band(am, halfW * 0.42, 0.55) + band(am, halfW * 0.42, 1.1) * 0.4);

          // vRoad.w: целая часть — число полос, десятая — флаги (1 автобусная,
          // 2 парковочная), знак минус — движение в обе стороны.
          // Раньше полосы считались по порогу ширины: всё уже 11 метров
          // получало одну осевую, и четырёхполосная улица читалась как обычная.
          float wAbs = abs(vRoad.w);
          float nLane = floor(wAbs + 0.001);
          float flags = floor((wAbs - nLane) * 10.0 + 0.5);
          bool hasBus  = flags == 1.0 || flags == 3.0;   // выделенная справа
          bool hasPark = flags == 2.0 || flags == 3.0;   // парковочная слева
          bool twoWay  = vRoad.w < 0.0;
          float nearJ  = step(0.2, fract(vCls));         // 14 м до перекрёстка
          if (nLane > 1.5 && vCls < 2.9) {
            float edge = halfW - 0.55;                   // краевые сплошные 1.2
            float lw = edge * 2.0 / nLane;               // ширина полосы
            float line = band(am, edge, 0.06);
            // ПДД 1.5: штрих 3 м, промежуток 9 м. Перед перекрёстком — 1.1.
            float dash = max(step(fract(v / 12.0), 0.25), nearJ);
            for (int k = 1; k < 8; k++) {
              if (float(k) > nLane - 1.0) break;
              float mid = -edge + float(k) * lw;
              bool axis = twoWay && abs(float(k) * 2.0 - nLane) < 0.01;
              // Правая кромка потока — сторона возрастающего m.
              bool busEdge  = hasBus  && float(k) == nLane - 1.0 && !twoWay;
              bool parkEdge = hasPark && float(k) == 1.0 && !twoWay;
              if (axis && nLane > 3.5) {
                line += band(m, mid - 0.09, 0.05) + band(m, mid + 0.09, 0.05);  // 1.3
              } else if (busEdge || parkEdge) {
                line += band(m, mid, 0.06);              // 1.1 сплошная
              } else {
                line += band(m, mid, 0.06) * dash;
              }
            }
            // Буква «А» посреди выделенной полосы — знак 5.14 на асфальте.
            // Считаем прямо в МЕТРАХ: в нормированных координатах буква
            // растянулась на девять метров и читалась как две длинные полосы.
            if (hasBus && !twoWay) {
              float cAx = -edge + (nLane - 0.5) * lw;      // ось правой полосы
              float sy = (fract(v / 34.0) - 0.5) * 34.0;   // метры от центра буквы
              float sx = m - cAx;
              if (abs(sy) < 2.05 && abs(sx) < 0.95) {
                float yn = sy / 2.0;                        // −1 низ, +1 верх
                float span = 0.30 + 0.21 * (1.0 - yn);      // ножки сходятся кверху
                float leg = 1.0 - smoothstep(0.07, 0.13, abs(abs(sx) - span));
                float bar = (1.0 - smoothstep(0.07, 0.13, abs(sy + 0.55)))
                          * step(abs(sx), 0.30 + 0.21 * 1.275);
                line += clamp(leg + bar, 0.0, 1.0);
              }
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

// ---------------------------------------------------------------- море
// Было: плоская плита одного цвета, спорившая за глубину с берегом.
// Стало: две бегущие волновые сетки правят нормаль, по ней ложится блик
// солнца, цвет уходит от бирюзы у берега к тёмному на глубине, а у самой
// кромки идёт пена. Время передаётся через uniform из главного цикла.
export function waterMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1d5468, roughness: 0.16, metalness: 0.30,
  });
  const uni = { uTime: { value: 0 } };
  mat.userData.uniforms = uni;
  mat.customProgramCacheKey = () => 'sev-water';
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = uni.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>',
               '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWPos;\n' + HASH + NOISE)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 p = vWPos.xz;
          float t = uTime;
          // три бегущие волны разного масштаба и направления
          vec2 g = vec2(0.0);
          g += vec2(cos(p.x * 0.085 + t * 0.62), cos(p.y * 0.075 - t * 0.51)) * 0.085;
          g += vec2(cos(p.x * 0.245 - t * 0.95), cos(p.y * 0.268 + t * 1.12)) * 0.040;
          g += vec2(fbm(p * 0.035 + t * 0.05) - 0.5, fbm(p * 0.035 - t * 0.04 + 7.3) - 0.5) * 0.12;
          normal = normalize(normal + vec3(g.x, 0.0, g.y));
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 p = vWPos.xz;
          float t = uTime;
          float ripple = fbm(p * 0.09 + vec2(t * 0.10, -t * 0.07));
          // у берега мельче и зеленее, вдали — глубокая синь
          float far = clamp(length(p - cameraPosition.xz) / 380.0, 0.0, 1.0);
          vec3 shallow = vec3(0.106, 0.310, 0.337);
          vec3 deep    = vec3(0.031, 0.098, 0.161);
          vec3 c = mix(shallow, deep, clamp(far * 0.92 + ripple * 0.18, 0.0, 1.0));
          // барашки на гребнях
          float crest = smoothstep(0.72, 0.93, ripple);
          c = mix(c, vec3(0.82, 0.88, 0.90), crest * 0.35);
          diffuseColor.rgb = c;
        }`)
      .replace('#include <roughnessmap_fragment>',
               '#include <roughnessmap_fragment>\nroughnessFactor = 0.06 + 0.12 * fbm(vWPos.xz * 0.05 + uTime * 0.03);');
  };
  return mat;
}

// ---------------------------------------------------------------- площадки
// aArea: x — метры вдоль главной оси площадки, y — поперёк, z — её ширина,
//        w — длина. aAKind: 0 парковка · 1 футбол · 2 площадка · 3 беговая
//        дорожка · 4 детская · 5 спортядро · 6 кладбище
export function areaMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.92, metalness: 0.0,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -4,
  });
  return inject(mat, 'sev-area', {
    vertHead: `attribute vec4 aArea; attribute float aAKind;
               varying vec4 vArea; varying float vAK;`,
    vertBody: `vArea = aArea; vAK = aAKind;`,
    fragHead: `varying vec4 vArea; varying float vAK;`,
    fragBody: `
      {
        vec3 c = diffuseColor.rgb;
        float u = vArea.x, v = vArea.y, W = vArea.z, L = vArea.w;
        float rough = 0.92;
        float paint = 0.0;
        vec3 pcol = vec3(0.70, 0.69, 0.66);

        if (vAK < 0.5) {
          // ---- парковка: асфальт и разметка машиномест 2.5 x 5.3 м ----
          c *= 0.90 + 0.16 * hash21(floor(vec2(u * 1.5, v * 1.5)));
          c *= 0.96 + 0.07 * fbm(vec2(u, v) * 0.25);
          // Ряды ставим вдоль КОРОТКОЙ стороны: 5.3 м место плюс 6 м проезд.
          float band = mod(v, 16.6);
          float inRow = step(band, 5.3) + step(10.6, band) * step(band, 15.9);
          // поперечные штрихи между местами
          float tick = 1.0 - smoothstep(0.05, 0.11, abs(fract(u / 2.5) - 0.5) * 2.5);
          paint = inRow * tick;
          // и продольная линия по головам мест
          paint = max(paint, (1.0 - smoothstep(0.06, 0.12, abs(band - 5.3)))
                           * step(1.0, W) * step(6.0, L));
          rough = 0.90;
        } else if (vAK < 1.5) {
          // ---- футбольное поле: газон в полосы, белая разметка ----
          float mow = step(0.5, fract(v / 6.0));
          c *= 0.93 + 0.13 * mow;
          c *= 0.95 + 0.10 * fbm(vec2(u, v) * 0.9);
          float mU = 3.0, mV = 3.0;               // поле от кромки
          float lineU = (1.0 - smoothstep(0.06, 0.13, abs(u - mU)))
                      + (1.0 - smoothstep(0.06, 0.13, abs(u - (W - mU))));
          float lineV = (1.0 - smoothstep(0.06, 0.13, abs(v - mV)))
                      + (1.0 - smoothstep(0.06, 0.13, abs(v - (L - mV))));
          float mid   = 1.0 - smoothstep(0.06, 0.13, abs(v - L * 0.5));
          float circ  = 1.0 - smoothstep(0.07, 0.15,
                        abs(length(vec2(u - W * 0.5, v - L * 0.5)) - min(9.15, W * 0.22)));
          paint = clamp(lineU + lineV + mid + circ, 0.0, 1.0)
                * step(mU - 0.4, u) * step(u, W - mU + 0.4)
                * step(mV - 0.4, v) * step(v, L - mV + 0.4);
          pcol = vec3(0.82, 0.82, 0.79);
          rough = 0.95;
        } else if (vAK < 2.5) {
          // ---- спортплощадка: щебень с крошкой ----
          c *= 0.88 + 0.22 * hash21(floor(vec2(u * 4.0, v * 4.0)));
          c *= 0.94 + 0.12 * fbm(vec2(u, v) * 1.6);
        } else if (vAK < 3.5) {
          // ---- беговая дорожка: рыжее покрытие, белые линии дорожек ----
          c *= 0.94 + 0.10 * fbm(vec2(u, v) * 2.2);
          float lane = 1.0 - smoothstep(0.04, 0.09, abs(fract(v / 1.22) - 0.5) * 1.22);
          paint = lane;
          pcol = vec3(0.86, 0.86, 0.84);
          rough = 0.86;
        } else if (vAK < 4.5) {
          // ---- детская площадка: резиновое покрытие плитами ----
          vec2 g2 = vec2(u, v) / 1.0;
          vec2 f2 = abs(fract(g2) - 0.5);
          float seam = smoothstep(0.44, 0.495, max(f2.x, f2.y));
          float tone = hash21(floor(g2));
          // тёплая плитка вперемешку с синей — как на настоящих площадках
          vec3 rub = tone > 0.72 ? vec3(0.180, 0.263, 0.400) : vec3(0.494, 0.243, 0.180);
          rub *= 0.92 + 0.14 * hash21(floor(g2) + 7.0);
          c = mix(rub, rub * 0.72, seam);
          rough = 0.80;
        } else if (vAK < 5.5) {
          c *= 0.92 + 0.14 * fbm(vec2(u, v) * 1.1);
        } else {
          // ---- кладбище: трава с проплешинами и дорожками ----
          c *= 0.90 + 0.16 * fbm(vec2(u, v) * 0.8);
          float path = 1.0 - smoothstep(0.9, 1.5, abs(fract(v / 9.0) - 0.5) * 9.0);
          c = mix(c, vec3(0.435, 0.416, 0.376), path * 0.75);
        }

        if (paint > 0.001) {
          float wear = 0.62 + 0.38 * hash21(floor(vec2(u * 0.8, v * 0.8)));
          c = mix(c, pcol * wear, clamp(paint, 0.0, 1.0) * 0.88);
          rough = mix(rough, 0.66, clamp(paint, 0.0, 1.0));
        }
        diffuseColor.rgb = c;
        procRough = rough;
      }`,
  });
}
