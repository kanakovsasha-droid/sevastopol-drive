import * as THREE from 'three';
import { ENV, LAMP_N } from './env.js?v=e53617c3';

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

// Время суток и сезон (env.js): uNight — свет в окнах, uSeason — осенняя
// и зимняя трава, снег на газонах и кровлях. procEmit — своё свечение
// материала, прибавляется к излучению после <emissivemap_fragment>.
const SEASON = `
uniform float uNight;
uniform vec4 uLamps[${LAMP_N}];
uniform vec4 uLampC;     // круг пятен фонарей: xz — центр, w — радиус (env.js)
varying vec3 vLampP;
uniform float uLate;      // поздний час (env.js): к глубокой ночи свет в окнах гаснет
uniform float uTime;      // часы игры — для мерцания телевизоров
uniform vec4 uSeason;     // x — осень, y — облетело/пожухло, z — снег, w — весна
uniform vec4 uWet;        // x — снег от снегопада, y — мокро после дождя
// насколько цвет — зелень: газон, трава, кустарник в цвете земли
float greenness(vec3 c){ return clamp((c.g - max(c.r, c.b) * 0.94) * 7.0, 0.0, 1.0); }
vec3 seasonGreen(vec3 c, float k, float n){
  float l = dot(c, vec3(0.30, 0.55, 0.15));
  vec3 straw = vec3(1.22, 1.00, 0.55) * l;        // осенью трава желтеет и выгорает
  vec3 dull  = vec3(0.98, 0.93, 0.74) * l;        // зимой — пожухлая, бурая
  c = mix(c, mix(c, straw, 0.45 + 0.35 * n), uSeason.x * k);
  c = mix(c, dull, uSeason.y * k * 0.55);
  c = mix(c, c * vec3(0.94, 1.14, 0.82), uSeason.w * k);   // весной — сочная, молодая
  return c;
}
// снег лежит только на том, что смотрит вверх, и пятнами — он тонкий
// (макрос, а не функция: vNormal объявляется ниже <common>, куда это вставлено)
float snowAmt(float up, float n){
  float z = max(uSeason.z, uWet.x);      // сезонный тонкий снег или нападавший
  return z * smoothstep(0.55, 0.85, up) * smoothstep(0.62, 0.32, n - z * 0.35);
}
#ifndef FLAT_SHADED
  #define snowCover(n) snowAmt(dot(normalize(vNormal), normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz)), n)
#else
  #define snowCover(n) snowAmt(1.0, n)
#endif

// Опавшие листья: пятнышки ~20 см по клеткам, гуще кучками. Сколько — от
// сезона: на пике золотой осени немного, больше всего — когда облетают
// (ноябрь), под снегом не видно.
float leafAmt(){ return uSeason.x * (0.45 + 0.55 * uSeason.y) * (1.0 - uSeason.z); }
vec3 leafLitter(vec3 c, vec2 p, float amt){
  if (amt < 0.01) return c;
  float heap = smoothstep(0.35, 0.75, fbm(p * 0.25));
  vec2 g = p * 5.0, ci = floor(g), f = fract(g) - 0.5;
  float h = hash21(ci);
  vec2 o = vec2(hash21(ci + 3.1), hash21(ci + 7.7)) - 0.5;
  float d = length((f - o * 0.5) * vec2(1.0, 1.6));
  float leaf = step(h, amt * (0.25 + 0.75 * heap)) * (1.0 - smoothstep(0.16, 0.22, d));
  vec3 lc = mix(vec3(0.62, 0.42, 0.08), vec3(0.55, 0.20, 0.05), hash21(ci + 11.0));
  lc = mix(lc, vec3(0.30, 0.20, 0.10), step(0.8, hash21(ci + 5.0)));
  return mix(c, lc, leaf);
}
`;

// Свет фонарей (env.js → ENV.uLamps): мягкий тёплый круг от 64 ближайших
// плафонов, ламбертом по нормали. Спад — гаусс по расстоянию, к ~24 м сходит
// на нет без ступени. Раньше оранжевый свет (1, .70, .40) множился на тёмный
// серый асфальт и давал бурые, как грязь, пятна. Теперь свет почти белый с
// тёплым оттенком, а цвет под ним наполовину обесцвечен и не темнее 0.16 —
// пятно светлее асфальта и без коричневого.
const LAMP_LIGHT = `
  if (uNight > 0.01) {
    float lampAcc = 0.0;
    for (int i = 0; i < ${LAMP_N}; i++) {
      vec4 L = uLamps[i];
      if (L.w <= 0.0) continue;
      vec3 d = L.xyz - vLampP;
      float r2 = dot(d, d);
      if (r2 > 600.0) continue;
      // к краю круга uLampC пятно плавно гаснет: в список фонарь попадает
      // заранее и уже без силы, «включения» при подъезде не видно
      float fade = 1.0 - smoothstep(uLampC.w * 0.6, uLampC.w, length(L.xz - uLampC.xz));
      if (fade <= 0.0) continue;
      vec3 ld = normalize((viewMatrix * vec4(d, 0.0)).xyz);
      float ndl = max(dot(normal, ld), 0.0);
      lampAcc += ndl * L.w * fade * exp(-r2 / 95.0) * (1.0 - smoothstep(320.0, 600.0, r2));
    }
    vec3 lampAlb = diffuseColor.rgb;
    lampAlb = max(mix(lampAlb, vec3(dot(lampAlb, vec3(0.30, 0.59, 0.11))), 0.5), vec3(0.16));
    reflectedLight.directDiffuse += lampAlb * vec3(1.0, 0.88, 0.70) * (lampAcc * 0.22 * uNight);
  }
`;

// Цвет правим в <color_fragment>, а шероховатость — только после
// <roughnessmap_fragment>: раньше roughnessFactor ещё не объявлен.
// Значение проносим через переменную, объявленную вне блока.
function inject(mat, key, { vertHead, vertBody, fragHead, fragBody, season = '' }) {
  // Three кеширует программы по свойствам материала, а onBeforeCompile в ключ НЕ входит.
  // Без своего ключа дороги и дома молча получают программу рельефа — и все вставки пропадают.
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = shader => {
    shader.uniforms.uNight = ENV.uNight;
    shader.uniforms.uSeason = ENV.uSeason;
    shader.uniforms.uLamps = ENV.uLamps;
    shader.uniforms.uLampC = ENV.uLampC;
    shader.uniforms.uWet = ENV.uWet;
    shader.uniforms.uLate = ENV.uLate;
    shader.uniforms.uTime = ENV.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLampP;\n' + vertHead)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLampP = (modelMatrix * vec4(transformed, 1.0)).xyz;\n' + vertBody);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + HASH + NOISE + SEASON + fragHead)
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat procRough = 0.9;\nvec3 procEmit = vec3(0.0);\n' + fragBody + season)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = procRough;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += procEmit;')
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + LAMP_LIGHT);
  };
  return mat;
}

// ---------------------------------------------------------------- дома
// aWall: x — метры вдоль стены, y — метры от основания, z — полная высота дома
// aKind: 0 фасад · 1 черепичная кровля · 2 глухая стена · 3 плоская кровля
//        4 рыночный ряд (ролеты) · 5 профнастил кровли · 6 тент · 7 фасад с парадным ордером
//        8 ворота гаража · 9 стена гаража из блоков · 10 витраж ТЦ
//        11 парадный ордер с арками · 12 школа · 13 храм
//        14 хрущёвка · 15 сталинка · 16 девятиэтажка (типовые дома, series.js);
//        у 14 и 16 дробная часть — S/16 на стене подъездов (S пролётов на
//        секцию), 0.875 — глухой торец
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

        if (vKind < 0.5 || (vKind > 6.5 && vKind < 7.5) || (vKind > 10.5 && vKind < 11.5)
            || (vKind > 14.5 && vKind < 15.5)) {
          // ---- фасад ----
          // Севастопольский центр — послевоенный фонд 1950-х: 3–5 этажей,
          // высокие окна с белыми наличниками, межэтажные тяги, карниз поверху.
          // парадный ордер (kind 7): этаж 5.2 м вместо 3.3 — послевоенная
          // классика с высокими залами, иначе двухэтажный корпус режется на четыре
          float fh0 = vKind > 6.5 ? 5.20 : 3.30;
          float stal = step(14.5, vKind);               // 15 — сталинка Центрального холма
          float forceArch = step(10.5, vKind) * (1.0 - stal);   // 11 — окна заведомо арочные
          float nf = max(1.0, floor(vWall.z / fh0 + 0.35));
          float fh = vWall.z / nf;
          float fpos = vWall.y / fh;
          float fi = floor(fpos), fy = fract(fpos);

          // шаг простенков свой у каждого дома, иначе весь город в одну линейку
          float seed = floor(vWall.z * 7.0);
          // у сталинки сетка ровная: 3.1 м, целое число пролётов на стену (series.js)
          float bay = mix(2.65 + 0.95 * hash21(vec2(seed, 3.0)), 3.10, stal);
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
          float arch = max(forceArch, step(0.70, style)) * (1.0 - stal);   // полуциркульные завершения окон
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

          archTop *= 1.0 - stal;
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

          // ---------- сталинка: лопатки и сухарики карниза ----------
          // Послевоенный центр узнаётся по вертикалям: плоские лопатки через
          // два пролёта от второго этажа до карниза, и по тяжёлому карнизу
          // с поясом сухариков. Лопатка — светлая полоса 0.5 м с тенью сбоку.
          if (stal > 0.5) {
            float pm = (fract(bpos * 0.5 + 0.5) - 0.5) * bay * 2.0;    // метров от оси лопатки (простенок)
            float pil = lr(0.26 - abs(pm), 60.0) * upper * (1.0 - cornice);
            float pilS = lr(0.34 - abs(pm + mix(0.26, -0.26, sunR)), 40.0) * (1.0 - pil) * upper * (1.0 - cornice);
            c = mix(c, c * 1.07 + 0.03, pil);
            c *= 1.0 - 0.18 * pilS;
            float dent = step(0.5, fract(vWall.x / 0.36)) * lr(ty2 - 0.62, 30.0) * (1.0 - lr(ty2 - 0.80, 30.0));
            c *= 1.0 - 0.30 * dent;
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

          // Ночью окна загораются: чем темнее, тем больше. Свет комнат тёплый,
          // изредка холодный (телевизор, люминесцентная лампа); витрины первого
          // этажа горят почти все. Свет гаснет к краю рамы и под занавеской.
          if (uNight > 0.01) {
            // Дом — по цвету стен: worldgen красит стены дома одним цветом со
            // своим случайным оттенком, так что цвет вершины и есть номер дома.
            // У каждого дома своё: когда зажигается (в сумерках или уже
            // затемно), какая доля окон горит (есть почти тёмные — конторы,
            // пустые квартиры), каким светом (тёплая лампа, нейтральный,
            // холодный светодиод). Окна горят квартирами — по два-три пролёта
            // подряд на этаже, а к глубокой ночи (uLate) гаснут.
            vec3 vc = diffuseColor.rgb;
            float house = hash21(floor(vc.rg * 1021.0) + floor(vc.b * 613.0) + seed * 0.37);
            float on0 = 0.05 + 0.55 * fract(house * 7.13);                // с какого uNight дом «просыпается»
            float share = mix(0.08, 0.75, fract(house * 3.71)) * step(0.1, fract(house * 11.9) + 0.02);
            share *= 1.0 - 0.72 * uLate * (0.6 + 0.4 * fract(house * 5.3));
            float apt = floor(bi / (2.0 + floor(fract(house * 2.9) * 2.0)));   // квартира: 2–3 пролёта
            float wr = hash21(vec2(apt * 1.31 + 7.0, fi * 2.17) + seed * 0.71 + house * 13.0);
            float lit = step(wr, share) * smoothstep(on0, on0 + 0.15, uNight);
            // свет дома и разброс по квартирам
            float tone = fract(house * 17.3);
            vec3 lc = tone < 0.55 ? vec3(1.0, 0.68, 0.34) : tone < 0.85 ? vec3(1.0, 0.86, 0.66) : vec3(0.78, 0.88, 1.0);
            lc *= 0.7 + 0.6 * fract(wr * 31.3);
            // изредка — синий отсвет телевизора, мерцает
            float tv = step(0.93, fract(wr * 53.1)) * (0.6 + 0.4 * sin(uTime * (3.0 + 7.0 * fract(wr * 9.7)) + wr * 40.0));
            lc = mix(lc, vec3(0.45, 0.6, 1.0) * (0.6 + 0.6 * tv), step(0.93, fract(wr * 53.1)));
            // витрины первого этажа: горят почти все, гаснут после закрытия
            float shop = ground * (1.0 - door) * step(0.35, r) * (1.0 - 0.8 * uLate);
            float glow = max(lit * (0.75 + 0.45 * fy), shop * 1.5) * uNight;
            procEmit = lc * glow * win * (1.0 - revMask) * (1.0 - 0.55 * mullion);
          }
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
          // Гофра мельче пикселя рябит муаром — издали гасим её до среднего.
          float corr = abs(fract(vWall.x / 0.11) - 0.5) * 2.0;
          corr = mix(0.5, corr, clamp(1.6 - fwidth(vWall.x / 0.11) * 2.0, 0.0, 1.0));
          c *= 0.90 + 0.15 * corr;
          c *= 0.93 + 0.11 * hash21(floor(vWall.xy * 0.4));
          c *= 1.0 - 0.16 * smoothstep(3.3, 4.4, ty);
          c *= 1.0 - 0.09 * smoothstep(3.4, 2.6, ty) * hash21(floor(vWall.xy * 1.3));

          // ролета: горизонтальные ламели 7 см
          float shut = inBay * smoothstep(3.55, 3.48, ty) * smoothstep(1.28, 1.34, ty);
          float slat = abs(fract(vWall.y / 0.07) - 0.5) * 2.0;
          slat = mix(0.5, slat, clamp(1.6 - fwidth(vWall.y / 0.07) * 2.0, 0.0, 1.0));
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
          // гофра крупнее пикселя — рисуем, мельче — гасим до среднего тона:
          // иначе вся кровля рынка шла частым муаром и мерцала полосами
          float corrR = abs(fract(vWall.x / 0.26) - 0.5) * 2.0;
          corrR = mix(0.5, corrR, clamp(1.6 - fwidth(vWall.x / 0.26) * 2.0, 0.0, 1.0));
          c *= 0.84 + 0.26 * corrR;
          c *= 0.93 + 0.12 * hash21(floor(vWall.xy * vec2(0.3, 0.8)));   // подтёки и ржавь
          c = mix(c, c * vec3(1.05, 0.94, 0.84), 0.35 * hash21(floor(vWall.xy * 0.22)));
          rough = 0.55;
        } else if (vKind < 6.5) {
          // ---- тент над проходом: полосы поперёк ----
          float st = step(0.5, fract(vWall.x / 0.55));
          st = mix(0.5, st, clamp(1.6 - fwidth(vWall.x / 0.55) * 2.0, 0.0, 1.0));
          c = mix(vec3(0.94, 0.93, 0.90), c, st);
          c *= 0.93 + 0.10 * hash21(floor(vWall.xy * 3.0));
          rough = 0.80;
        } else if (vKind > 13.5) {
          // ---- типовой дом: хрущёвка (14) и девятиэтажка (16) ----
          // Ритм массового жилья: ровная сетка одинаковых окон, стояки
          // балконов или лоджий, лестничная клетка с окнами в полэтажа над
          // дверью подъезда. Сетка пролётов целая на каждой стене (series.js).
          float p9 = step(15.5, vKind);
          float fk = fract(vKind);
          float blank = step(0.8, fk);                         // глухой торец
          float S = (1.0 - blank) * floor(fk * 16.0 + 0.5);    // пролётов на секцию
          float B = mix(3.2, 3.0, p9);
          float top = vWall.z - 1.2;                           // верх последнего этажа
          float nf = max(1.0, floor(top / 3.2 + 0.5));
          float fh = top / nf;
          float fpos = vWall.y / fh;
          float fi = floor(fpos), fy = fract(fpos);
          float bpos = vWall.x / B;
          float bi = floor(bpos), fx = fract(bpos);
          // Зерно дома — от его цвета: у всех пятиэтажек высота одна и та же.
          // Округляем, а не отбрасываем дробь: цвет вершины приходит в
          // интерполяции с ошибкой в последнем знаке, и floor мигал бы по
          // пикселям — фасад шёл сыпью из разных балконов и стёкол.
          float bs = hash21(floor(c.rg * 255.0 + 0.5));
          float r = hash21(vec2(bi, fi) + bs * 31.0);
          float rc = hash21(vec2(bi, 4.0) + bs * 17.0);        // свойство стояка
          float roofZone = step(top, vWall.y);
          float ground = step(fpos, 1.0) * (1.0 - roofZone);
          float panel = max(p9, step(0.55, bs));               // 1-464 панель или 1-447 кирпич

          // лестничная клетка: середина каждой секции на стене подъездов
          float stair = step(0.5, S) * (1.0 - step(0.5, abs(mod(bi, max(S, 1.0)) - floor(S * 0.5))));
          float wide = step(0.5, mod(bi, 2.0));                // комната / кухня
          float x0 = mix(0.30, 0.22, wide), x1 = mix(0.70, 0.78, wide);
          float y0 = 0.32, y1 = 0.80;
          float sy = fy;
          float door = stair * ground;
          if (stair > 0.5) {
            // окно площадки — в полэтажа выше, узкое
            x0 = 0.34; x1 = 0.66; sy = fract(fpos - 0.5); y0 = 0.30; y1 = 0.70;
            if (door > 0.5) { x0 = 0.31; x1 = 0.69; sy = fy; y0 = 0.0; y1 = 2.15 / fh; }
          }
          float wx = (fx - x0) * B, wxr = (x1 - fx) * B, wy = (sy - y0) * fh, wyt = (y1 - sy) * fh;
          float win = lr(wx, 60.0) * lr(wxr, 60.0) * lr(wy, 60.0) * lr(wyt, 60.0);
          // лестничное окно на уровне земли и над кровлей не рисуем
          win *= (1.0 - roofZone) * (1.0 - blank) * step(0.4, vWall.y);
          win *= 1.0 - stair * (1.0 - door) * step(fpos, 0.75);

          // стояк балконов (хрущёвка) или лоджий (девятиэтажка)
          float balc = (1.0 - stair) * (1.0 - blank) * step(0.55, rc) * step(1.0, fi) * (1.0 - roofZone);
          float loggia = balc * p9;
          balc *= 1.0 - p9;

          // ---- стена ----
          float sw = max(0.018, fwidth(vWall.x) * 0.9);
          if (panel > 0.5) {
            // панели на комнату и этаж: тёмный шов, светлая фаска над ним
            float dv = abs(fx - 0.5) * B;                         // метров от оси пролёта
            float sv = 1.0 - smoothstep(sw, sw * 2.0, B * 0.5 - dv);
            float dh = fy * fh;
            float sh = 1.0 - smoothstep(sw, sw * 2.0, min(dh, fh - dh));
            c *= 1.0 - 0.20 * max(sv, sh) * (1.0 - roofZone * 0.5);
            c *= 0.96 + 0.07 * hash21(vec2(bi, fi) + 3.1);
          } else {
            // силикатный кирпич: ряды 7.7 см, гаснут дальше пикселя. Без
            // разнотона по кирпичам — издали он рассыпается в сыпь точек.
            float kr = fract(vWall.y / 0.077);
            float fade = clamp(1.6 - fwidth(vWall.y / 0.077) * 2.0, 0.0, 1.0);
            c *= 1.0 - 0.08 * fade * (1.0 - lr(kr - 0.10, 12.0));
          }
          c *= 0.93 + 0.12 * vnoise(vWall.xy * 0.09);             // выцветание пятнами
          // парапет: слив и тень под ним, у кирпичного — напуск рядов
          float ty2 = vWall.z - vWall.y;
          c = mix(c, c * 1.12 + 0.04, lr(0.16 - ty2, 60.0));
          c *= 1.0 - 0.20 * lr(ty2 - 0.16, 30.0) * (1.0 - lr(ty2 - 0.34, 30.0));
          c *= 1.0 - 0.16 * (1.0 - panel) * step(0.5, fract(ty2 / 0.23)) * lr(ty2 - 0.34, 30.0) * (1.0 - lr(ty2 - 1.05, 30.0));
          // потёки под парапетом и брызги у земли
          float sx = hash21(vec2(floor(vWall.x / 0.21), 7.0));
          c *= 1.0 - 0.09 * lr(sx - 0.6, 3.0) * lr(ty2 - 0.4, 4.0) * (1.0 - lr(ty2 - 1.6, 0.5));
          c *= 1.0 - 0.14 * (1.0 - lr(vWall.y - 1.0, 1.4));

          // ---- проём ----
          vec3 glass = mix(vec3(0.085, 0.100, 0.118), vec3(0.205, 0.245, 0.27), r);
          glass = mix(glass * 0.55, glass * 1.8, pow(1.0 - sy, 1.6));
          if (r > 0.84) glass = mix(glass, vec3(0.55, 0.51, 0.45), 0.7);     // занавеска
          // рамы: старые деревянные или белый пластик — вперемешку, по квартирам
          vec3 frameC = r < 0.55 ? vec3(0.90, 0.90, 0.88) : vec3(0.42, 0.33, 0.25);
          float mull = 1.0 - lr(abs(fx - (x0 + x1) * 0.5) * B - 0.03, 50.0);
          float rim = 1.0 - lr(min(min(wx, wxr), min(wy, wyt)) - 0.05, 40.0);
          glass = mix(glass, frameC, max(mull * (1.0 - door), rim) * 0.85);
          glass *= 1.0 - 0.38 * (1.0 - lr(wyt, 2.2));                // тень перемычки
          // дверь подъезда: металлическое полотно, фрамуга над ним
          glass = mix(glass, mix(vec3(0.20, 0.17, 0.15), vec3(0.32, 0.26, 0.20), bs), door * step(0.45, wyt));
          // откос: светлый слив снизу
          float sill = (1.0 - door) * lr(wx + 0.06, 40.0) * lr(wxr + 0.06, 40.0)
                     * lr(-wy + 0.07, 40.0) * lr(wy + 0.01, 60.0) * (1.0 - roofZone) * (1.0 - blank);
          c = mix(c, vec3(0.82, 0.81, 0.79), sill * 0.8);

          // ---- балкон: плита и ограждение ----
          float bxw = lr(fx - 0.10, 60.0) * lr(0.90 - fx, 60.0);
          float bfront = balc * bxw * lr(fy - 0.02, 80.0) * (1.0 - lr(fy - 0.33, 80.0));
          float slab = balc * lr(fx - 0.08, 60.0) * lr(0.92 - fx, 60.0) * (1.0 - lr(fy - 0.02, 80.0)) * lr(fy + 0.04, 80.0);
          // ограждение у каждого своё: решётка, профлист, остеклённая рама.
          // Прутья и гофра мельче пикселя гаснут до среднего тона, иначе муар.
          vec3 railC;
          float rk = hash21(vec2(bi, fi) + bs * 5.0);
          float fine = clamp(1.6 - fwidth(fx * B / 0.12) * 2.0, 0.0, 1.0);
          float bars = mix(0.45, lr(abs(fract(fx * B / 0.12) - 0.5) - 0.22, 12.0), fine);
          if (rk < 0.4) railC = mix(vec3(0.70, 0.70, 0.68), c * 0.45, bars);
          else if (rk < 0.75) railC = mix(vec3(0.62, 0.64, 0.62), vec3(0.55, 0.40, 0.30), step(0.6, fract(rk * 7.3)))
                                    * (0.94 + 0.10 * fine * (abs(fract(fx * B / 0.10) - 0.5) * 2.0 - 0.5));
          else railC = vec3(0.86, 0.86, 0.84);
          // застеклённый балкон: рама на всю высоту этажа
          float glazed = balc * step(0.6, fract(rk * 3.7)) * bxw * lr(fy - 0.33, 80.0) * (1.0 - lr(fy - 0.86, 80.0));

          // ---- лоджия: проём во всю ширину, глубокая тень, экран внизу ----
          float lgArea = loggia * lr(fx - 0.06, 60.0) * lr(0.94 - fx, 60.0) * (1.0 - lr(fy - 0.97, 80.0));
          float lgFront = lgArea * (1.0 - lr(fy - 0.36, 80.0));
          float lgGlaz = lgArea * step(0.62, fract(rk * 5.1)) * (1.0 - lgFront);

          c = mix(c, glass, win);
          float gl = win;
          if (lgArea > 0.0) {
            // в глубине лоджии — тень, окно и балконная дверь
            vec3 deep = c * 0.42;
            float inWin = lr(fx - 0.30, 60.0) * lr(0.72 - fx, 60.0) * lr(fy - 0.40, 60.0) * lr(0.92 - fy, 60.0);
            deep = mix(deep, glass * 0.8, inWin);
            c = mix(c, deep, lgArea * (1.0 - lgFront));
            // экран ограждения: гладкая панель, светлее стены, тень под поручнем
            vec3 scr = c * mix(1.00, 1.10, rk) * (1.0 - 0.25 * (1.0 - lr(0.36 - fy, 25.0)));
            c = mix(c, scr, lgFront);
            float lmul = 1.0 - lr(abs(fract(fx * 4.0) - 0.5) * 2.0 - 0.9, 20.0) * clamp(1.6 - fwidth(fx * 4.0) * 2.0, 0.0, 1.0);
            c = mix(c, mix(glass, frameC, 1.0 - lmul), lgGlaz * 0.85);
            gl = max(gl, lgGlaz);
          }
          c = mix(c, c * 0.62, slab);
          c = mix(c, railC, bfront);
          float gmul = 1.0 - lr(abs(fract(fx * 3.0) - 0.5) * 2.0 - 0.88, 16.0) * clamp(1.6 - fwidth(fx * 3.0) * 2.0, 0.0, 1.0);
          c = mix(c, mix(glass * 1.2, frameC, 1.0 - gmul), glazed);
          gl = max(gl, glazed);
          rough = mix(0.88, 0.14, gl);

          if (uNight > 0.01) {
            float lit = step(hash21(vec2(bi * 1.31 + 7.0, fi * 2.17) + bs * 9.1), uNight * 0.6);
            lit = max(lit, stair * (1.0 - door));                      // в подъезде свет всю ночь
            vec3 lc = mix(vec3(1.0, 0.72, 0.38), vec3(0.74, 0.85, 1.0), step(0.85, fract(r * 13.7)));
            lc *= 0.75 + 0.5 * fract(r * 31.3);
            procEmit = lc * lit * uNight * gl * (1.0 - door) * (0.75 + 0.45 * sy);
            procEmit += vec3(1.0, 0.86, 0.6) * 0.6 * uNight * door * (1.0 - lr(wyt - 0.45, 4.0));   // фонарь над дверью
          }
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
        // ---- цоколь: всё, что ниже отметки первого этажа (y < 0) ----
        // Дом на склоне: этажи считаются от самой высокой точки земли у стен,
        // а с нижней стороны остаётся каменное основание. Без него низ дома
        // либо висел над грунтом, либо окна первого этажа уходили в землю.
        // Кровли (1, 3, 5, 6) и гаражи (8, 9) сюда не попадают: у кровли в y
        // лежит мировая координата, у бокса подошвы ниже нуля нет.
        if (vWall.y < 0.0 && !(vKind > 0.5 && vKind < 1.5) && !(vKind > 2.5 && vKind < 3.5)
            && !(vKind > 4.5 && vKind < 6.5) && !(vKind > 7.5 && vKind < 9.5)) {
          float d = -vWall.y;                                   // метров ниже первого этажа
          vec3 base = diffuseColor.rgb;
          // инкерманский камень блоками ~0.9 x 0.45 м, вразбежку
          vec3 stone = mix(vec3(0.60, 0.57, 0.51), base, 0.25) * 0.86;
          vec2 blk = vec2(vWall.x / 0.92, d / 0.46);
          blk.x += step(0.5, fract(blk.y * 0.5)) * 0.5;
          vec2 fb = abs(fract(blk) - 0.5);
          stone *= (1.0 - 0.28 * smoothstep(0.40, 0.485, max(fb.x, fb.y)))
                 * (0.92 + 0.14 * hash21(floor(blk)));
          // слив поверх цоколя и тень под ним
          float capb = 1.0 - lr(d - 0.16, 40.0);
          stone *= 1.0 - 0.22 * (1.0 - lr(d - 0.16, 7.0)) * (1.0 - capb);
          stone = mix(stone, base * 1.05 + 0.05, capb * 0.85);
          float r2 = 0.93;
          // окна полуподвала у жилого фасада: где цоколь высокий, он читается
          // как этаж, а не как глухая стена. Где мелко — их прячет грунт.
          if (vKind < 0.5 || (vKind > 6.5 && vKind < 7.5) || (vKind > 10.5 && vKind < 12.5) || vKind > 13.5) {
            float fyb = fract(d / 3.3), bxw = fract(vWall.x / 3.0);
            float bw = step(0.30, bxw) * step(bxw, 0.70) * step(0.36, fyb) * step(fyb, 0.70) * step(1.0, d);
            stone = mix(stone, vec3(0.06, 0.07, 0.075), bw);
            r2 = mix(r2, 0.2, bw);
          }
          c = stone;
          rough = r2;
        }
        diffuseColor.rgb = c;
        procRough = rough;
      }`,
    // снег на кровлях: черепица, плоские крыши, профнастил
    season: `
      if (max(uSeason.z, uWet.x) > 0.01 && (abs(vKind - 1.0) < 0.5 || abs(vKind - 3.0) < 0.5 || abs(vKind - 5.0) < 0.5)) {
        float n = fbm(vWall.xy * 0.18);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.90, 0.94), snowCover(n) * 0.9);
      }`,
  });
}

// ---------------------------------------------------------------- дороги
// aRoad: x — поперёк [-1..1], y — метры вдоль, z — ширина в метрах
// aCls: 0 магистраль · 1 главная · 2 улица · 3 проезд · 4 пешеходная · 5 тротуар · 6 бордюр
//       7 зебра · 8 сплошная краска (стоп-линия) · 9 газон островка
//       10 «уступи дорогу» зубцами (1.13)
// aJn ≥ 500 — вершина кольца: aJn − 1000 метров до съезда
// aJn: метры до пятна ближайшего перекрёстка — ближе порога разметки нет
//
// ФАКТУРА АСФАЛЬТА СЧИТАЕТСЯ ПО МИРОВЫМ КООРДИНАТАМ. Раньше зерно бралось по
// (метры поперёк, метры вдоль) своей улицы, а вдоль оси ещё шли тёмные полосы
// наката. У каждого полотна координаты свои, и на перекрёстке, где полотна
// ложатся друг на друга, рисунок и яркость менялись ровно по кромке ленты —
// перекрёсток читался сшитым из лоскутов. Мировая фактура одна на всё, что
// называется асфальтом: полотно, подложка узла, основа под зеброй.
export function roadMaterial() {
  // Двусторонний: полотно с поуровневой обрезкой полуширин на крутом изломе
  // иногда перекручивает пролёт «бабочкой», и вывернутый треугольник
  // отбрасывался как задняя грань — посреди перекрёстка зияла треугольная
  // дыра до земли. Снизу дорогу никто не видит, цена — ноль.
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.90, metalness: 0.0, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -6,
  });
  return inject(mat, 'sev-road', {
    vertHead: `attribute vec4 aRoad; attribute float aCls; attribute float aSurf; attribute float aJn;
               varying vec4 vRoad; varying float vCls; varying float vSurf; varying float vJn; varying vec2 vXZ;`,
    vertBody: `vRoad = aRoad; vCls = aCls; vSurf = aSurf; vJn = aJn;
               vXZ = (modelMatrix * vec4(position, 1.0)).xz;`,
    fragHead: `varying vec4 vRoad; varying float vCls; varying float vSurf; varying float vJn; varying vec2 vXZ;
      float asphaltTone(vec2 p) {
        // зерно ~40 см и крупные пятна ~10 м: выгоревшие и подлатанные места
        return (0.86 + 0.22 * fbm(p * 2.7)) * (0.93 + 0.13 * fbm(p * 0.105));
      }`,
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
          // У тротуара первые 22 см от проезжей части — бордюрный камень:
          // светлая полоса с поперечными швами и тёмным стыком с плиткой.
          if (vCls > 4.5 && m < 0.27) {
            vec3 stone = diffuseColor.rgb * 1.10;
            stone *= 0.93 + 0.10 * hash21(vec2(floor(v / 0.95), 3.0));
            stone *= 1.0 - 0.30 * band(fract(v / 0.95), 0.0, 0.04);
            c = mix(stone, stone * 0.62, smoothstep(0.215, 0.235, m));
          }
        } else if (vCls > 9.5) {
          // ---- 1.13: треугольники вершиной к подъезжающему ----
          float tu = fract(m / 0.9) - 0.5;
          float tt = clamp((v + 0.3) / 0.6, 0.0, 1.0);    // 0 — сторона водителя
          float on = 1.0 - smoothstep(0.40 * tt - 0.02, 0.40 * tt + 0.02, abs(tu));
          float wear = 0.84 + 0.16 * hash21(floor(vXZ * 2.2));
          c = mix(c * asphaltTone(vXZ), vec3(0.66, 0.645, 0.60) * wear, on * 0.92);
          rough = mix(0.92, 0.64, on);
        } else if (vCls > 8.5) {
          // ---- газон островка ----
          float g1 = fbm(vXZ * 0.95), g2 = fbm(vXZ * 0.14);
          c *= 0.72 + 0.52 * g1;
          c = mix(c, c * vec3(1.20, 1.08, 0.76), smoothstep(0.50, 0.82, g2));
          c *= 0.94 + 0.10 * hash21(floor(vXZ * 5.0));
          rough = 0.97;
        } else if (vCls > 7.5) {
          // ---- сплошная краска: стоп-линия ----
          float wear = 0.84 + 0.16 * hash21(floor(vXZ * 2.2));
          c = mix(c * asphaltTone(vXZ), vec3(0.66, 0.645, 0.60) * wear, 0.92);
          rough = 0.64;
        } else if (vCls > 6.5) {
          // ---- зебра: полосы вдоль движения, белая и жёлтая вперемешку ----
          float k = floor(m / 0.88);
          float on = step(fract(m / 0.88), 0.52);
          float wear = 0.58 + 0.42 * hash21(floor(vec2(m * 1.3, v * 2.2)));
          vec3 stripe = (mod(abs(k), 2.0) < 0.5 ? vec3(0.64, 0.62, 0.58) : vec3(0.62, 0.49, 0.16)) * wear;
          // основа — тот же асфальт, что вокруг: раньше под зеброй был свой,
          // почти чёрный, и переход лежал на улице тёмной заплатой
          vec3 asph = c * asphaltTone(vXZ);
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
          // ---- асфальт, а при surface=concrete — бетонные плиты ----
          // Бетон раньше был отдельной веткой и уходил из-под разметки: спуск
          // Котовского оставался без единой линии и не отличался от тротуара.
          if (vSurf > 1.5 && vSurf < 2.5) {
            vec2 g2 = vec2(m / 2.9, v / 5.8);
            vec2 f2 = abs(fract(g2) - 0.5);
            float seam = smoothstep(0.43, 0.492, max(f2.x, f2.y));
            vec3 slab = vec3(0.372, 0.369, 0.357) * (0.94 + 0.11 * hash21(floor(g2)));
            c = mix(slab, slab * 0.74, seam);
          }
          c *= asphaltTone(vXZ);

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
          if (nLane > 1.5 && vCls < 2.9) {
            float edge = halfW - 0.55;                   // краевые сплошные 1.2
            float lw = edge * 2.0 / nLane;               // ширина полосы
            // кольцо: aJn сдвинут на 1000, обрывается только наружная кромка
            bool onRing = vJn > 500.0;
            float jd = onRing ? vJn - 1000.0 : vJn;
            float line = onRing ? band(m, -edge, 0.06) + band(m, edge, 0.06) * smoothstep(0.4, 0.6, jd)
                                : band(am, edge, 0.06);
            // ПДД 1.5: штрих 3 м, промежуток 9 м. Перед перекрёстком — 1.1.
            // ПДД 1.5: штрих 3 м, промежуток 9 м
            float dash = step(fract(v / 12.0), 0.25);
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
            // У перекрёстка разметка кончается: 7.4 м до пятна узла — это
            // место стоп-линии (зебра 3.4 м, отступ, сама линия).
            float k = clamp(line, 0.0, 1.0) * 0.92 * (onRing ? 1.0 : smoothstep(7.3, 7.5, jd));
            c = mix(c, paint, k);
            rough = mix(rough, 0.62, k);
          }
        }
        diffuseColor.rgb = c;
        procRough = rough;
      }`,
    // Снег на дорогах: после снегопада полотно белое, по полосам — тёмные
    // мокрые колеи от колёс; тротуары — сплошняком, с протоптанной серединой.
    // После дождя асфальт темнее и блестит, в низинах — лужи.
    season: `
      {
        float m = vRoad.x * vRoad.z * 0.5, halfW = vRoad.z * 0.5;
        // осенью — листья на тротуарах и у бордюра проезжей части
        float la = leafAmt();
        if (la > 0.01) {
          float k = (vCls > 3.5 && vCls < 5.5) ? 1.0
                  : vCls < 3.5 ? 0.6 * (1.0 - smoothstep(0.5, 1.4, halfW - abs(m))) : 0.0;
          diffuseColor.rgb = leafLitter(diffuseColor.rgb, vXZ, la * k);
        }
        float sn = uWet.x;
        if (sn > 0.01) {
          float n = fbm(vXZ * 0.55);
          float rut = 0.0;
          if (vCls < 3.5) {
            float lanes = max(1.0, floor(abs(vRoad.w)));
            float laneW = vRoad.z / lanes;
            float lp = fract((m + halfW) / laneW) * laneW - laneW * 0.5;
            rut = 1.0 - smoothstep(0.12, 0.42, abs(abs(lp) - 0.82) - 0.05 * n);
            rut *= smoothstep(0.25, 0.6, sn);          // колеи появляются, когда снега уже много
          } else if (vCls > 3.5 && vCls < 5.5) {
            rut = 0.5 * (1.0 - smoothstep(0.3, 0.9, abs(m - halfW) / max(halfW, 0.5))) * smoothstep(0.4, 0.8, n);
          }
          float cover = clamp(sn * 1.4 * smoothstep(0.1, 0.45, n + sn * 0.7), 0.0, 1.0) * (1.0 - rut * 0.85);
          vec3 snowC = vec3(0.84, 0.87, 0.92) * (0.92 + 0.1 * fbm(vXZ * 3.1));
          diffuseColor.rgb = mix(diffuseColor.rgb, snowC, cover);
          diffuseColor.rgb *= 1.0 - rut * sn * 0.3;          // колея — мокрая каша
          procRough = mix(procRough, 0.55, cover);
          procRough = mix(procRough, 0.3, rut * sn);
        }
        if (uWet.y > 0.01) {
          float puddle = smoothstep(0.58, 0.72, fbm(vXZ * 0.33));
          float w = uWet.y * (0.65 + 0.35 * puddle);
          diffuseColor.rgb *= 1.0 - 0.42 * w;
          procRough = mix(procRough, 0.06, w * (0.55 + 0.45 * puddle));
        }
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
    // осенью и зимой трава желтеет и жухнет, снег — на природной земле
    season: `
      {
        float n = fbm(vXZ * 0.07);
        float k = greenness(diffuseColor.rgb) * (1.0 - vTer.x * 0.4);
        diffuseColor.rgb = seasonGreen(diffuseColor.rgb, max(k, (1.0 - vTer.x) * 0.6), n);
        diffuseColor.rgb = leafLitter(diffuseColor.rgb, vXZ, leafAmt() * (0.2 + 0.4 * vTer.x) * (1.0 - vTer.y));
        float sn = snowCover(n + fbm(vXZ * 0.9) * 0.25) * (1.0 - vTer.x * 0.7 * (1.0 - uWet.x)) * (1.0 - vTer.y * 0.6 * (1.0 - uWet.x));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.89, 0.93), sn);
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
  // Виды (aAKind) и покрытия (aASurf) — см. buildAreas в worldgen.js.
  // Размеры разметки — по правилам: футбол 105 × 68 (штрафная 16.5 × 40.32,
  // вратарская 5.5 × 18.32, круг 9.15, точка 11 м), теннис 23.77 × 10.97,
  // баскетбол 28 × 15, волейбол 18 × 9, мини-футбол 40 × 20. Поле меньше
  // нормы — разметка ужимается пропорционально. Те же формулы у ворот и сеток
  // в sport.js.
  return inject(mat, 'sev-area-2', {
    vertHead: `attribute vec4 aArea; attribute float aAKind; attribute float aASurf;
               varying vec4 vArea; varying float vAK; varying float vAS;`,
    vertBody: `vArea = aArea; vAK = aAKind; vAS = aASurf;`,
    fragHead: `varying vec4 vArea; varying float vAK; varying float vAS;
      // линия ширины w по полю расстояний d; тоньше пикселя — гаснет, а не рябит
      float lineW(float d, float w){
        float aa = max(fwidth(d), 1e-4);
        float k = clamp(w / (aa * 1.6), 0.0, 1.0);
        return k * (1.0 - smoothstep(0.5 * w, 0.5 * w + aa, d));
      }
      float rectEdge(vec2 p, vec2 a, vec2 b){
        vec2 c = (a + b) * 0.5, h = (b - a) * 0.5;
        vec2 q = abs(p - c) - h;
        return abs(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0));
      }
      float inRect(vec2 p, vec2 a, vec2 b){
        return step(a.x, p.x) * step(p.x, b.x) * step(a.y, p.y) * step(p.y, b.y);
      }`,
    fragBody: `
      {
        vec3 c = diffuseColor.rgb;
        float u = vArea.x, v = vArea.y, W = vArea.z, L = vArea.w;
        float rough = 0.92;
        float paint = 0.0;
        vec3 pcol = vec3(0.86, 0.86, 0.83);
        // поле: x — вдоль длинной стороны, y — поперёк, от угла рамки
        bool lu = W >= L;
        float FL = max(W, L), FW = min(W, L);
        float x = lu ? u : v, y = lu ? v : u;
        vec2 q = vec2(x - FL * 0.5, y - FW * 0.5);       // от центра
        float surf = vAS;

        if (vAK < 0.5) {
          // ---- парковка: асфальт; разметка мест — геометрией (вид 15) ----
          c *= 0.90 + 0.16 * hash21(floor(vec2(u * 1.5, v * 1.5)));
          c *= 0.96 + 0.07 * fbm(vec2(u, v) * 0.25);
          rough = 0.90;
        } else if (vAK < 1.5) {
          // ---- футбольное поле ----
          float m = FL >= 80.0 ? 1.5 : 0.8;
          float s = clamp((FL - 2.0 * m) / 105.0, 0.35, 1.0);
          float lw = FL >= 80.0 ? 0.12 : 0.09;
          float pw = FW - 2.0 * m;
          if (surf > 6.5 && surf < 7.5) {            // грунт
            c *= 0.84 + 0.26 * fbm(vec2(x, y) * 0.7);
          } else if (surf > 1.5 && surf < 2.5) {     // искусственный газон
            c *= 0.95 + 0.06 * step(0.5, fract(x / max(4.0, (FL - 2.0 * m) / 14.0)));
            c *= 0.97 + 0.05 * fbm(vec2(x, y) * 3.0);
          } else if (surf < 0.5 || (surf > 0.5 && surf < 1.5)) {   // трава: полосы стрижки
            c *= 0.90 + 0.14 * step(0.5, fract(x / max(4.0, (FL - 2.0 * m) / 18.0)));
            c *= 0.93 + 0.12 * fbm(vec2(x, y) * 0.9);
          } else {
            c *= 0.92 + 0.12 * fbm(vec2(x, y) * 1.2);
          }
          float xe = min(x - m, FL - m - x);         // от ближней лицевой внутрь
          float yc = q.y;
          float d = rectEdge(vec2(x, y), vec2(m), vec2(FL - m, FW - m));
          d = min(d, abs(q.x));
          d = min(d, abs(length(q) - 9.15 * s));
          float PA = 16.5 * s, PW = min(20.16 * s, pw * 0.42);
          d = min(d, rectEdge(vec2(xe, yc), vec2(-6.0, -PW), vec2(PA, PW)));
          float GA = 5.5 * s, GW = min(9.16 * s, pw * 0.2);
          d = min(d, rectEdge(vec2(xe, yc), vec2(-6.0, -GW), vec2(GA, GW)));
          if (xe > PA) d = min(d, abs(length(vec2(xe - 11.0 * s, yc)) - 9.15 * s));
          float cy = min(y - m, FW - m - y);
          if (xe < 1.6 && cy < 1.6) d = min(d, abs(length(vec2(xe, cy)) - 1.0));
          paint = lineW(d, lw) * inRect(vec2(x, y), vec2(m - lw), vec2(FL - m + lw, FW - m + lw));
          paint = max(paint, 1.0 - smoothstep(0.16, 0.24, length(q)));
          paint = max(paint, 1.0 - smoothstep(0.14, 0.22, length(vec2(xe - 11.0 * s, yc))));
          if (surf > 6.5 && surf < 7.5) paint *= 0.6;
          rough = 0.95;
        } else if (vAK < 2.5) {
          c *= 0.88 + 0.22 * hash21(floor(vec2(u * 4.0, v * 4.0)));
          c *= 0.94 + 0.12 * fbm(vec2(u, v) * 1.6);
        } else if (vAK < 3.5) {
          // ---- беговая дорожка: тартан (или гарь), линии между дорожками ----
          // v — расстояние от внутренней кромки (внутри овала — меньше нуля).
          float cinder = step(7.5, surf) * step(surf, 8.5);
          c *= 0.95 + 0.09 * fbm(vec2(u, v) * 2.2);
          c *= 0.96 + 0.07 * hash21(floor(vec2(u * 3.0, v * 3.0)));
          if (cinder > 0.5) c *= 0.88 + 0.22 * fbm(vec2(u, v) * 0.6);
          float lane = abs(fract(v / 1.22 + 0.5) - 0.5) * 1.22;
          paint = lineW(lane, 0.05) * step(-0.03, v) * step(v, 8.0 * 1.22 + 0.03) * (cinder > 0.5 ? 0.45 : 0.85);
          pcol = vec3(0.90, 0.90, 0.88);
          rough = 0.86;
        } else if (vAK < 4.5) {
          // ---- детская площадка: резиновое покрытие плитами ----
          vec2 g2 = vec2(u, v) / 1.0;
          vec2 f2 = abs(fract(g2) - 0.5);
          float seam = smoothstep(0.44, 0.495, max(f2.x, f2.y));
          float tone = hash21(floor(g2));
          vec3 rub = tone > 0.72 ? vec3(0.180, 0.263, 0.400) : vec3(0.494, 0.243, 0.180);
          rub *= 0.92 + 0.14 * hash21(floor(g2) + 7.0);
          c = mix(rub, rub * 0.72, seam);
          rough = 0.80;
        } else if (vAK < 5.5) {
          c *= 0.92 + 0.14 * fbm(vec2(u, v) * 1.1);
        } else if (vAK < 6.5) {
          // ---- кладбище: трава с проплешинами и дорожками ----
          c *= 0.90 + 0.16 * fbm(vec2(u, v) * 0.8);
          float path = 1.0 - smoothstep(0.9, 1.5, abs(fract(v / 9.0) - 0.5) * 9.0);
          c = mix(c, vec3(0.435, 0.416, 0.376), path * 0.75);
        } else if (vAK < 7.5) {
          // ---- аллея парка: плитка со швом, к кромке темнее ----
          vec2 g3 = vec2(u / 0.52, v / 0.52);
          vec2 f3 = abs(fract(g3 + vec2(0.0, step(0.5, fract(g3.x * 0.5)) * 0.5)) - 0.5);
          float grout = smoothstep(0.38, 0.47, max(f3.x, f3.y));
          c *= 1.0 - 0.14 * grout;
          c *= 0.94 + 0.11 * hash21(floor(g3));
          c *= 1.0 - 0.16 * smoothstep(0.55, 0.98, abs(v) / max(0.5, W * 0.5));
          rough = 0.88;
        } else if (vAK < 8.5) {
          // ---- площадка АЗС ----
          c *= 0.90 + 0.16 * hash21(floor(vec2(u * 1.5, v * 1.5)));
          c *= 0.96 + 0.07 * fbm(vec2(u, v) * 0.25);
        } else if (vAK < 9.5) {
          // ---- теннисный корт ----
          float sc = clamp(min((FL - 1.0) / 23.77, (FW - 1.0) / 10.97), 0.4, 1.0);
          float hl = 11.885 * sc, hwD = 5.485 * sc, hwS = 4.115 * sc, sl = 6.40 * sc;
          float inC = inRect(q, -vec2(hl, hwD), vec2(hl, hwD));
          // хард: синий корт в зелёной зоне; грунт и газон — одним цветом
          if (surf < 0.5 || (surf > 2.5 && surf < 4.5)) c = mix(c, vec3(0.165, 0.300, 0.470), inC);
          c *= 0.95 + 0.08 * fbm(vec2(u, v) * 2.0);
          float d = rectEdge(q, -vec2(hl, hwD), vec2(hl, hwD));
          if (abs(q.x) <= hl) d = min(d, abs(abs(q.y) - hwS));
          if (abs(q.y) <= hwS) d = min(d, abs(abs(q.x) - sl));
          if (abs(q.x) <= sl) d = min(d, abs(q.y));
          if (abs(q.x) > hl - 0.15 && abs(q.x) <= hl) d = min(d, abs(q.y));
          paint = lineW(d, 0.06) * inRect(q, -vec2(hl + 0.05, hwD + 0.05), vec2(hl + 0.05, hwD + 0.05));
          rough = 0.80;
        } else if (vAK < 10.5) {
          // ---- баскетбол ----
          float sc = clamp(min((FL - 1.0) / 28.0, (FW - 1.0) / 15.0), 0.4, 1.0);
          float hl = 14.0 * sc, hw = 7.5 * sc;
          float inC = inRect(q, -vec2(hl, hw), vec2(hl, hw));
          float xe = hl - abs(q.x);
          float key = inRect(vec2(xe, q.y), vec2(0.0, -2.45 * sc), vec2(5.8 * sc, 2.45 * sc));
          if (surf < 0.5 || (surf > 2.5 && surf < 3.5)) {
            c = mix(vec3(0.200, 0.400, 0.300), c, inC);          // резина: красная площадка в зелёной зоне
            c = mix(c, vec3(0.180, 0.330, 0.520), key * inC);
          } else {
            c = mix(c, c * 0.88, key * inC);
          }
          c *= 0.94 + 0.10 * fbm(vec2(u, v) * 2.0);
          float d = rectEdge(q, -vec2(hl, hw), vec2(hl, hw));
          if (abs(q.y) <= hw) d = min(d, abs(q.x));
          d = min(d, abs(length(q) - 1.8 * sc));
          d = min(d, rectEdge(vec2(xe, q.y), vec2(-2.0, -2.45 * sc), vec2(5.8 * sc, 2.45 * sc)));
          if (xe > 5.8 * sc) d = min(d, abs(length(vec2(xe - 5.8 * sc, q.y)) - 1.8 * sc));
          float bx = 1.575 * sc, r3 = 6.75 * sc;
          if (xe > bx) d = min(d, abs(length(vec2(xe - bx, q.y)) - r3));
          else if (r3 < hw) d = min(d, abs(abs(q.y) - r3));
          paint = lineW(d, 0.06) * inRect(q, -vec2(hl + 0.05, hw + 0.05), vec2(hl + 0.05, hw + 0.05));
          rough = 0.82;
        } else if (vAK < 11.5 || (vAK > 12.5 && vAK < 13.5)) {
          // ---- волейбол (и пляжный) ----
          float sc = clamp(min((FL - 1.0) / 18.0, (FW - 1.0) / 9.0), 0.4, 1.0);
          float hl = 9.0 * sc, hw = 4.5 * sc;
          bool beach = vAK > 12.5;
          if (beach) {
            c *= 0.88 + 0.20 * fbm(vec2(u, v) * 1.4);
            pcol = vec3(0.16, 0.30, 0.62);
          } else c *= 0.94 + 0.10 * fbm(vec2(u, v) * 2.0);
          float d = rectEdge(q, -vec2(hl, hw), vec2(hl, hw));
          if (abs(q.y) <= hw) d = min(d, min(abs(q.x), abs(abs(q.x) - 3.0 * sc)));
          paint = lineW(d, beach ? 0.05 : 0.05) * inRect(q, -vec2(hl + 0.05, hw + 0.05), vec2(hl + 0.05, hw + 0.05));
          rough = beach ? 0.98 : 0.82;
        } else if (vAK < 12.5) {
          // ---- мини-футбол и универсальная площадка ----
          float m = 0.5;
          float s = clamp((FL - 2.0 * m) / 40.0, 0.4, 1.0);
          if (surf < 0.5 || (surf > 1.5 && surf < 2.5)) {
            c *= 0.95 + 0.06 * step(0.5, fract(x / max(2.5, FL / 12.0)));
            c *= 0.96 + 0.06 * fbm(vec2(x, y) * 3.0);
          } else c *= 0.93 + 0.10 * fbm(vec2(x, y) * 1.5);
          float xe = min(x - m, FL - m - x);
          float d = rectEdge(vec2(x, y), vec2(m), vec2(FL - m, FW - m));
          d = min(d, abs(q.x));
          d = min(d, abs(length(q) - 3.0 * s));
          d = min(d, abs(length(vec2(xe, q.y)) - min(6.0 * s, (FW - 2.0 * m) * 0.4)));
          paint = lineW(d, 0.08) * inRect(vec2(x, y), vec2(m - 0.05), vec2(FL - m + 0.05, FW - m + 0.05));
          paint = max(paint, 1.0 - smoothstep(0.12, 0.2, length(vec2(xe - 6.0 * s, q.y))) );
          rough = 0.86;
        } else if (vAK < 14.5) {
          // ---- бетон: скейт-парк, шахматные столы — плиты со швами ----
          vec2 f4 = abs(fract(vec2(u, v) / 3.0) - 0.5);
          c *= 1.0 - 0.16 * smoothstep(0.47, 0.495, max(f4.x, f4.y));
          c *= 0.93 + 0.12 * fbm(vec2(u, v) * 0.8);
          rough = 0.85;
        } else {
          // ---- краска разметки: цвет из вершин, местами стёрта ----
          c *= 0.80 + 0.22 * hash21(floor(vec2(u, v) * 2.5));
          rough = 0.66;
        }

        if (paint > 0.001) {
          float wear = 0.70 + 0.30 * hash21(floor(vec2(u * 0.8, v * 0.8)));
          c = mix(c, pcol * wear, clamp(paint, 0.0, 1.0) * 0.9);
          rough = mix(rough, 0.66, clamp(paint, 0.0, 1.0));
        }
        diffuseColor.rgb = c;
        procRough = rough;
      }`,
    // газон: осенью желтеет, зимой жухнет и местами под снегом; разметка — нет
    season: `
      if (vAK > 0.5) {
        float n = fbm(vec2(vArea.x, vArea.y) * 0.12);
        float k = greenness(diffuseColor.rgb);
        diffuseColor.rgb = seasonGreen(diffuseColor.rgb, k, n);
        diffuseColor.rgb = leafLitter(diffuseColor.rgb, vec2(vArea.x, vArea.y), leafAmt() * 0.6 * k);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.89, 0.93), snowCover(n) * k);
      }`,
  });
}
