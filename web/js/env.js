import * as THREE from 'three';

// Время суток, погода и времена года.
//
// Солнце идёт по настоящей траектории над Севастополем (44.6° с. ш., 33.5° в. д.,
// московское время): высота и азимут считаются по дате и часу, поэтому летом
// оно в полдень почти в зените и садится на северо-западе, а в декабре еле
// поднимается над Сапун-горой и уходит за горизонт к пяти вечера.
//
// От высоты солнца зависит всё остальное: три пояса неба (зенит, дымка, тёплый
// низ), закатное зарево в стороне солнца, цвет и сила солнечного света,
// заливка теней от неба, туман и экспозиция. Ночью направленный свет
// переезжает на луну (тени остаются — лунные, синие), загораются окна,
// фонари, фары; на небе звёзды.
//
// Погода — пресеты как в «Провинции»: ясно, малооблачно, облачно, пасмурно,
// туман. Облака рисует само небо (шум по плоскости над головой), их
// подсвечивает солнце: днём белые, на закате розово-оранжевые снизу.
//
// Времена года — общие uniform-ы (ENV.uSeason), их читают шейдеры деревьев,
// газонов и кровель: осенью платаны и каштаны желтеют и облетают, зимой
// голые кроны и тонкий снег на газонах и крышах, весной молодая листва.
// Кипарисы, сосны, туи и ели вечнозелёные в любой сезон.

// Общие uniform-ы для материалов: подключаются в onBeforeCompile.
export const ENV = {
  uNight:  { value: 0 },                              // 0 — день, 1 — ночь (свет в окнах, фонари)
  uSeason: { value: new THREE.Vector4(0, 0, 0, 0) },  // x — осенний цвет, y — облетело, z — снег, w — весна
  uTime:   { value: 0 },
  // погода на земле: x — снег на дорогах и газонах (копится в снегопад, тает
  // после), y — мокрый асфальт (дождь), z, w — запас
  uWet:    { value: new THREE.Vector4(0, 0, 0, 0) },
  // ближайшие фонари: xyz — плафон в мире, w — сила (0 — пусто)
  uLamps:  { value: Array.from({ length: 24 }, () => new THREE.Vector4(0, -1e4, 0, 0)) },
  // поздний час: 0 — вечер (до 22:30), 1 — глубокая ночь (2:30–5:00), к утру
  // обратно; по нему в окнах гаснет свет — к трём часам горит мало
  uLate:   { value: 0 },
  // фары машины (carlights.js) — для бликов на мокром асфальте: uHead — точка
  // прожектора и его сила, uHeadL / uHeadR — линзы фар в мире (w — 0..1
  // включены), uHeadDir — куда смотрит машина, uHeadMat / uHeadMap — матрица и маска луча самого прожектора
  uHead:     { value: new THREE.Vector4(0, -1e4, 0, 0) },
  uHeadL:    { value: new THREE.Vector4(0, -1e4, 0, 0) },
  uHeadR:    { value: new THREE.Vector4(0, -1e4, 0, 0) },
  uHeadDir:  { value: new THREE.Vector4(0, 0, 1, 0) },   // куда смотрит машина
  uHeadMat:  { value: new THREE.Matrix4() },
  uHeadMap:  { value: null },
};
export const LAMP_N = 24;

// ---------------------------------------------------------------- свет фонарей
// Настоящий источник света на каждый фонарь — это тысячи источников в каждом
// шейдере. Вместо этого шейдеры асфальта, тротуаров, фасадов и газонов сами
// прибавляют тёплое пятно от 24 ближайших плафонов (ENV.uLamps). Список
// пересобираем раз в треть секунды по положению игрока.
// registerLamps(mesh, heads): mesh — InstancedMesh фонарей, heads — где у
// модели плафоны, в её осях ([[x, y, z], …]).
const lampMeshes = new Set();
export function registerLamps(mesh, heads) { mesh.userData.lampHeads = heads; lampMeshes.add(mesh); }
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _c = new THREE.Vector3();
let lampT = 0;
const cand = [];
function updateLamps(dt, at, night) {
  if ((lampT -= dt) > 0) return;
  lampT = 0.33;
  const L = ENV.uLamps.value;
  if (night < 0.01) { for (const v of L) v.w = 0; return; }
  cand.length = 0;
  for (const mesh of lampMeshes) {
    // выгруженный квартал: меша больше нет в сцене — забываем
    let o = mesh; while (o.parent) o = o.parent;
    if (!o.isScene) { lampMeshes.delete(mesh); continue; }
    if (!mesh.boundingSphere) mesh.computeBoundingSphere();
    _c.copy(mesh.boundingSphere.center).applyMatrix4(mesh.matrixWorld);
    if (_c.distanceTo(at) > mesh.boundingSphere.radius + 120) continue;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, _m);
      _m.premultiply(mesh.matrixWorld);
      for (const h of mesh.userData.lampHeads) {
        _p.set(h[0], h[1], h[2]).applyMatrix4(_m);
        const d = _p.distanceToSquared(at);
        if (d < 120 * 120) cand.push(d, _p.x, _p.y, _p.z);
      }
    }
  }
  // 24 ближайших
  const n = cand.length / 4, idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => cand[a * 4] - cand[b * 4]);
  for (let k = 0; k < L.length; k++) {
    if (k < n) { const i = idx[k] * 4; L[k].set(cand[i + 1], cand[i + 2], cand[i + 3], 4.5); }
    else L[k].set(0, -1e4, 0, 0);
  }
}

const LAT = 44.6 * Math.PI / 180;
const LON = 33.52;                    // градусы, восток
const TZ = 3;                         // Москва, без перевода часов

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* приватное окно */ } },
};
const KEY = 'sev.env';

// Направление НА солнце в осях мира (x — восток, y — вверх, z — юг).
// doy — день года 1..365, hour — местное время в часах.
export function sunDirection(doy, hour, out = new THREE.Vector3()) {
  const decl = 23.44 * Math.PI / 180 * Math.sin(2 * Math.PI * (284 + doy) / 365);
  // уравнение времени — до четверти часа сдвига полдня за год
  const B = 2 * Math.PI * (doy - 81) / 364;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);   // минуты
  const solar = hour + (4 * (LON - 15 * TZ) + eot) / 60;
  const H = (solar - 12) * 15 * Math.PI / 180;
  const sinAlt = Math.sin(LAT) * Math.sin(decl) + Math.cos(LAT) * Math.cos(decl) * Math.cos(H);
  const alt = Math.asin(clamp(sinAlt, -1, 1));
  // азимут от севера по часовой
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(LAT) - Math.tan(decl) * Math.cos(LAT)) + Math.PI;
  const ca = Math.cos(alt);
  return out.set(Math.sin(az) * ca, Math.sin(alt), -Math.cos(az) * ca);
}

// Сколько дней в году прошло: 1 января — 1.
export function dayOfYear(d = new Date()) {
  const s = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - s) / 86400000);
}

// ---------------------------------------------------------------- пресеты
export const WEATHER = {
  clear:    { name: 'Ясно',         cloud: 0.00, sun: 1.00, sky: 1.00, fog: 1.0, grey: 0.00 },
  fair:     { name: 'Малооблачно',  cloud: 0.32, sun: 0.97, sky: 1.00, fog: 1.1, grey: 0.05 },
  cloudy:   { name: 'Облачно',      cloud: 0.58, sun: 0.75, sky: 1.08, fog: 1.3, grey: 0.22 },
  overcast: { name: 'Пасмурно',     cloud: 0.96, sun: 0.16, sky: 1.25, fog: 1.9, grey: 0.72 },
  fog:      { name: 'Туман',        cloud: 0.80, sun: 0.38, sky: 1.15, fog: 6.0, grey: 0.55 },
  rain:     { name: 'Дождь',        cloud: 0.98, sun: 0.10, sky: 1.20, fog: 2.6, grey: 0.80, precip: 'rain' },
  snow:     { name: 'Снегопад',     cloud: 0.98, sun: 0.14, sky: 1.30, fog: 3.2, grey: 0.78, precip: 'snow' },
};
// День года, которым изображается сезон, если он выбран вручную.
export const SEASONS = {
  auto:   { name: 'По календарю' },
  summer: { name: 'Лето',  doy: 196 },     // 15 июля
  autumn: { name: 'Осень', doy: 299 },     // 26 октября — каштаны и платаны в золоте
  winter: { name: 'Зима',  doy: 20 },      // 20 января
  spring: { name: 'Весна', doy: 112 },     // 22 апреля
};

// Сезонные коэффициенты по дню года — плавно, без скачков на границах.
export function seasonAt(doy, winterSnow = true) {
  // осенний цвет: с конца сентября, пик в конце октября, держится до облёта
  const autumn = smooth(262, 300, doy) * (1 - smooth(345, 365, doy));
  // облетело: с конца октября до конца ноября; весной обратно к 20 апреля
  const bare = Math.max(smooth(300, 332, doy), 1 - smooth(84, 112, doy));
  // молодая листва и цветение: апрель — май
  const spring = smooth(90, 108, doy) * (1 - smooth(130, 155, doy));
  // снег — в Севастополе редкий и тонкий: середина декабря — середина февраля
  const snow = winterSnow ? Math.max(smooth(350, 362, doy), 1 - smooth(35, 52, doy)) * 0.55 : 0;
  return { autumn, bare, snow, spring };
}

// ---------------------------------------------------------------- цвета неба
// Ключевые точки по высоте солнца в градусах. Между ними — линейно.
const KEYS = [
  //  высота  зенит      горизонт   дымка у земли
  [-18, 0x02040b, 0x060b17, 0x080c16],
  [-10, 0x050a1c, 0x0d1730, 0x121a2c],
  [-5,  0x142246, 0x37385c, 0x4e3a52],
  [-1.5, 0x26386a, 0x9b5a5a, 0xe0663e],
  [2,   0x34528c, 0xd98d63, 0xff8a4a],
  [7,   0x3a63a6, 0xe2b48a, 0xf4b480],
  [14,  0x2f64ad, 0xb9c6cf, 0xdecdb3],
  [25,  0x2a68b4, 0xa6c3d8, 0xd3d3c8],
  [90,  0x2a68b4, 0xa6c3d8, 0xd3d3c8],
].map(([e, z, h, d]) => [e, new THREE.Color(z), new THREE.Color(h), new THREE.Color(d)]);

function skyColors(elev, outZ, outH, outD) {
  let i = 0;
  while (i < KEYS.length - 2 && elev > KEYS[i + 1][0]) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = clamp((elev - a[0]) / (b[0] - a[0]), 0, 1);
  outZ.copy(a[1]).lerp(b[1], t);
  outH.copy(a[2]).lerp(b[2], t);
  outD.copy(a[3]).lerp(b[3], t);
}

const SKY_VERT = `
  varying vec3 vDir;
  void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

const SKY_FRAG = `
  uniform vec3 zenith, horizon, haze, sunDir, moonDir, sunCol, glowCol, cloudLit, cloudDark;
  uniform float uTime, uCloud, uStars, uSunVis, uMoonVis, uGlow, uGrey;
  varying vec3 vDir;
  float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float h31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float n2(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm2(vec2 p){
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
    return s;
  }
  void main(){
    vec3 d = normalize(vDir);
    float h = clamp(d.y, 0.0, 1.0);
    // Показатель < 1 растягивает синеву вниз: над улицей не висит серый лист.
    vec3 col = mix(horizon, zenith, pow(h, 0.40));
    // тёплая полоса дымки в нижних ~8°
    col = mix(haze, col, smoothstep(-0.015, 0.145, d.y));

    // Закатное зарево: по горизонту в сторону солнца, к противоположной
    // стороне сходит на нет (там — синяя «тень Земли»).
    vec2 dh = normalize(d.xz + 1e-5), sh = normalize(sunDir.xz + 1e-5);
    float toward = dot(dh, sh) * 0.5 + 0.5;
    float band = exp(-max(d.y, 0.0) * 7.0) * smoothstep(-0.12, 0.0, d.y);
    col += glowCol * uGlow * pow(toward, 3.0) * band;
    col = mix(col, col * vec3(0.78, 0.82, 1.0), uGlow * (1.0 - toward) * band * 0.6);

    // Звёзды: случайные ячейки на сфере, мерцание — по времени.
    if (uStars > 0.01 && d.y > -0.02) {
      vec3 p = d * 260.0;
      vec3 ci = floor(p);
      float r = h31(ci);
      if (r > 0.9965) {
        vec3 o = vec3(h31(ci + 7.1), h31(ci + 3.3), h31(ci + 5.7)) * 0.6 + 0.2;
        float dd = length(fract(p) - o);
        float tw = 0.65 + 0.35 * sin(uTime * (1.5 + r * 30.0) + r * 100.0);
        float m = (1.0 - smoothstep(0.03, 0.11, dd)) * (r - 0.9965) / 0.0035;
        col += vec3(0.85, 0.9, 1.0) * m * tw * uStars * 1.6 * smoothstep(-0.02, 0.12, d.y);
      }
      // Млечный Путь — едва заметная полоса
      // Шум — в осях самой полосы (угол вдоль и отступ поперёк), а не по
      // проекции d.xz: та тянулась штрихами вдоль полосы, как «сияние».
      vec3 mwN = normalize(vec3(0.35, 0.25, -0.9));
      vec3 mwA = normalize(cross(mwN, vec3(0.0, 1.0, 0.0)));
      float mw = exp(-pow(dot(d, mwN) * 5.5, 2.0));
      // координаты на полосе: угол вдоль неё и отступ поперёк
      vec2 mp = vec2(atan(dot(d, cross(mwN, mwA)), dot(d, mwA)) * 9.0, dot(d, mwN) * 30.0);
      col += vec3(0.035, 0.038, 0.05) * mw * smoothstep(0.35, 0.8, fbm2(mp + 3.0)) * uStars * smoothstep(0.0, 0.3, d.y);
    }

    // Солнце: диск и широкий ореол. Ореол сажаем на яркость неба.
    float c = max(dot(d, sunDir), 0.0);
    col += sunCol * (pow(c, 380.0) * 8.0 + pow(c, 6.0) * 0.26) * uSunVis * smoothstep(-0.02, 0.10, d.y + 0.06);
    // Луна: ровный диск со светлой дымкой вокруг
    float cm = max(dot(d, moonDir), 0.0);
    float disc = smoothstep(0.99955, 0.99975, cm);
    float maria = 0.82 + 0.18 * n2(d.xz * 900.0);
    col = mix(col, vec3(0.92, 0.93, 0.88) * maria, disc * uMoonVis);
    col += vec3(0.30, 0.36, 0.48) * pow(cm, 60.0) * 0.5 * uMoonVis;

    // Облака: шум по плоскости над головой. Чем ниже взгляд, тем дальше
    // по плоскости и тем мельче облака — сами собой собираются к горизонту.
    if (uCloud > 0.01 && d.y > 0.0) {
      vec2 uv = d.xz / (d.y + 0.07) * 1.35 + vec2(uTime * 0.0035, uTime * 0.0012);
      float n = fbm2(uv);
      float n2v = fbm2(uv * 2.7 + 5.0);
      float cov = smoothstep(1.02 - uCloud * 0.62, 1.30 - uCloud * 0.62, n + n2v * 0.35);
      // освещённость облака: верх светлый со стороны солнца, плотные — темнее
      float lit = clamp(0.55 + (n2v - 0.5) * 0.9 + dot(dh, sh) * 0.25 * (1.0 - h), 0.0, 1.0);
      vec3 cc = mix(cloudDark, cloudLit, lit);
      // у солнца края облаков горят
      cc += sunCol * pow(c, 10.0) * 0.6 * uSunVis;
      cov *= smoothstep(0.0, 0.10, d.y);
      col = mix(col, cc, cov * 0.94);
    }
    // пасмурно — небо серое и ровное
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(lum) * vec3(0.97, 0.99, 1.03), uGrey);
    // ниже горизонта (видно с высоких точек) — та же дымка, но глуше
    col = mix(haze * 0.86, col, smoothstep(-0.09, 0.0, d.y));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, haze: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, moonDir: { value: new THREE.Vector3(0, -1, 0) },
      sunCol: { value: new THREE.Color(1, 0.92, 0.76) }, glowCol: { value: new THREE.Color(1.0, 0.42, 0.16) },
      cloudLit: { value: new THREE.Color(1, 1, 1) }, cloudDark: { value: new THREE.Color(0.6, 0.65, 0.72) },
      uTime: ENV.uTime, uCloud: { value: 0 }, uStars: { value: 0 }, uSunVis: { value: 1 }, uMoonVis: { value: 0 },
      uGlow: { value: 0 }, uGrey: { value: 0 },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
  });
}

// ---------------------------------------------------------------- управление
const C_SUN_DAY = new THREE.Color(0xffeccd), C_SUN_GOLD = new THREE.Color(0xffb26a), C_SUN_LOW = new THREE.Color(0xff6a35);
const C_MOON = new THREE.Color(0x8fa8de);
const C_HEMI_DAY = new THREE.Color(0x8fb9e6), C_HEMI_DUSK = new THREE.Color(0x8a90b4), C_HEMI_NIGHT = new THREE.Color(0x3a4c80);
const C_GND_DAY = new THREE.Color(0x6d6450), C_GND_NIGHT = new THREE.Color(0x15140f);
const C_GLOW = new THREE.Color(0xff5a1e);
const tmp = new THREE.Color(), tmp2 = new THREE.Color();

export class Environment {
  // sun — DirectionalLight (ночью им же светит луна), hemi — HemisphereLight,
  // sky — купол (материал подменяем своим), renderer — для экспозиции.
  constructor({ scene, sun, hemi, sky, renderer, fogDensity = 0.00031 }) {
    this.scene = scene; this.sun = sun; this.hemi = hemi; this.sky = sky; this.renderer = renderer;
    this.fogBase = fogDensity;
    sky.material.dispose?.();
    sky.material = skyMaterial();
    this.U = sky.material.uniforms;

    const s = JSON.parse(ls.get(KEY) || '{}');
    const q = new URLSearchParams(location.search);
    this.cfg = {
      hour: +q.get('hour') || (s.hour ?? 16.5),     // где остановились в прошлый раз
      speed: s.speed ?? 30,          // во сколько раз игровые сутки быстрее: 30 — сутки за 48 минут
      real: !!s.real,                // часы = настоящее время
      frozen: !!s.frozen,            // время стоит
      weather: q.get('weather') || s.weather || 'clear',
      season: q.get('season') || s.season || 'auto',
      snow: s.snow ?? true,
    };
    if (!WEATHER[this.cfg.weather]) this.cfg.weather = 'clear';
    if (!SEASONS[this.cfg.season]) this.cfg.season = 'auto';
    this.w = { ...WEATHER[this.cfg.weather] };   // текущая погода, плавно идёт к выбранной
    this.precip = 0;                       // сила осадков сейчас, 0..1
    // Снег и лужи копятся со временем. Заданные в адресе (?weather=snow) или
    // сохранённые с прошлого раза — сразу, чтобы не ждать пару минут.
    const wet = ENV.uWet.value, P = WEATHER[this.cfg.weather].precip;
    wet.set(P === 'snow' ? 1 : s.snowCover ?? 0, P === 'rain' ? 1 : s.wet ?? 0, 0, 0);
    this.precip = P ? 1 : 0;
    this.dir = new THREE.Vector3();        // на солнце
    this.moon = new THREE.Vector3();
    this.light = new THREE.Vector3();      // откуда сейчас светит направленный свет
    this.elev = 30;                        // высота солнца, градусы
    this.night = 0;
    this.saveT = 0;
    this.listeners = new Set();
    this._season();
    this.update(0);
  }

  save() { ls.set(KEY, JSON.stringify({ ...this.cfg, snowCover: ENV.uWet.value.x, wet: ENV.uWet.value.y })); }
  get precipKind() { return WEATHER[this.cfg.weather].precip || this._lastPrecip || null; }
  onChange(fn) { this.listeners.add(fn); }
  _emit() { for (const f of this.listeners) f(this); }

  get doy() { const s = SEASONS[this.cfg.season]; return s.doy ?? dayOfYear(); }
  // quiet — не перерисовывать настройки (ползунок тянут прямо сейчас)
  setHour(h, quiet = false) { this.cfg.hour = ((h % 24) + 24) % 24; this.cfg.real = false; this.save(); if (!quiet) this._emit(); }
  addHours(dh) { this.setHour(this.cfg.hour + dh); }
  setWeather(k) { if (WEATHER[k]) { this.cfg.weather = k; this.save(); this._emit(); } }
  setSeason(k) { if (SEASONS[k]) { this.cfg.season = k; this._season(); this.save(); this._emit(); } }
  set(k, v) { this.cfg[k] = v; if (k === 'snow') this._season(); this.save(); this._emit(); }
  get clock() {
    const h = Math.floor(this.cfg.hour), m = Math.floor((this.cfg.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  _season() {
    const s = seasonAt(this.doy, this.cfg.snow);
    ENV.uSeason.value.set(s.autumn, s.bare, s.snow, s.spring);
    this.season = s;
  }

  // Каждый кадр. target — точка, вокруг которой кладётся тень (игрок).
  update(dt, target = null) {
    const c = this.cfg;
    if (c.real) {
      const d = new Date();
      c.hour = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    } else if (!c.frozen) {
      c.hour = (c.hour + dt * c.speed / 3600) % 24;
    }
    ENV.uTime.value += dt;
    // запоминаем час раз в несколько секунд — после перезагрузки тот же вечер
    if ((this.saveT += dt) > 5) { this.saveT = 0; this.save(); }
    // календарь по сезону «авто» сменился (игра открыта за полночь) — раз в минуту
    if ((this._seasonT = (this._seasonT || 0) + dt) > 60) { this._seasonT = 0; this._season(); }

    // погода меняется плавно, за пару секунд
    const W = WEATHER[c.weather], k = dt ? 1 - Math.exp(-dt * 0.8) : 1;
    for (const key of ['cloud', 'sun', 'sky', 'fog', 'grey']) this.w[key] += (W[key] - this.w[key]) * k;
    const w = this.w;

    // осадки: нарастают и стихают за несколько секунд; снег на земле копится
    // минуты две и тает минут пять, лужи — быстрее
    const P = W.precip;
    if (P) this._lastPrecip = P;
    this.precip += ((P ? 1 : 0) - this.precip) * (dt ? 1 - Math.exp(-dt * 0.5) : 1);
    const wet = ENV.uWet.value;
    if (dt) {
      wet.x = clamp(wet.x + (P === 'snow' ? dt / 120 : -dt / 300), 0, 1);
      wet.y = clamp(wet.y + (P === 'rain' ? dt / 40 : -dt / 150) - (P === 'snow' ? dt / 60 : 0), 0, 1);
    }

    const doy = this.doy;
    sunDirection(doy, c.hour, this.dir);
    sunDirection(doy, c.hour + 12.4, this.moon);    // луна — грубо: напротив солнца, чуть отстаёт
    if (this.moon.y < 0.25) this.moon.y = 0.25 + this.moon.y * 0.2;   // ночью луна всегда на небе
    this.moon.normalize();
    const e = Math.asin(this.dir.y) * 180 / Math.PI;
    this.elev = e;

    // ---- небо
    const U = this.U;
    skyColors(e, U.zenith.value, U.horizon.value, U.haze.value);
    U.sunDir.value.copy(this.dir);
    U.moonDir.value.copy(this.moon);
    const glow = Math.exp(-Math.pow((e - 0.5) / 5.5, 2)) * (1 - w.grey * 0.85);
    U.uGlow.value = glow;
    U.glowCol.value.copy(C_GLOW);
    U.uSunVis.value = smooth(-2, 1, e) * (1 - w.grey * 0.95);
    const nightK = smooth(-2, -12, e);
    U.uStars.value = nightK * (1 - w.cloud * 0.9);
    U.uMoonVis.value = smooth(-1, -8, e) * (1 - w.grey);
    U.uCloud.value = w.cloud;
    U.uGrey.value = w.grey * smooth(-8, 2, e);
    // цвет солнца: белёсо-тёплый днём, золотой к вечеру, красный у горизонта
    const sc = U.sunCol.value;
    if (e > 12) sc.copy(C_SUN_GOLD).lerp(C_SUN_DAY, smooth(12, 28, e));
    else sc.copy(C_SUN_LOW).lerp(C_SUN_GOLD, smooth(0, 12, e));
    // облака: днём белые, на закате снизу розовые, ночью — тёмно-синие силуэты
    const day = smooth(-4, 8, e);
    U.cloudLit.value.copy(tmp.set(0.16, 0.18, 0.26)).lerp(tmp2.copy(sc).multiplyScalar(1.05), day)
      .lerp(tmp.set(1, 1, 1), smooth(10, 30, e) * 0.85);
    U.cloudDark.value.copy(U.zenith.value).multiplyScalar(0.7).lerp(tmp.set(0.55, 0.58, 0.64), smooth(2, 20, e) * 0.9)
      .lerp(tmp.set(0.48, 0.5, 0.54), w.grey * smooth(-4, 6, e));
    if (w.grey > 0.01) {
      // пасмурное небо светлее сини у горизонта: серый лист, а не сумерки
      const g = w.grey * smooth(-6, 4, e);
      U.horizon.value.lerp(tmp.set(0.62, 0.64, 0.66), g * 0.8);
      U.zenith.value.lerp(tmp.set(0.48, 0.52, 0.58), g * 0.8);
      U.haze.value.lerp(tmp.set(0.66, 0.67, 0.66), g * 0.8);
    }

    // ---- свет. Ночью направленный свет — луна: тени остаются, синие.
    const sunI = 3.15 * smooth(-1.5, 12, e) * w.sun;
    const moonI = 0.34 * smooth(-4, -10, e) * (1 - w.grey * 0.8);
    const useMoon = e < -4;
    this.light.copy(useMoon ? this.moon : this.dir);
    if (this.light.y < 0.06) { this.light.y = 0.06; this.light.normalize(); }   // свет из-под земли не нужен
    this.sun.intensity = useMoon ? moonI : sunI;
    this.sun.color.copy(useMoon ? C_MOON : sc);
    if (target) {
      this.sun.target.position.copy(target);
      this.sun.position.copy(target).addScaledVector(this.light, 420);
    }
    // Пасмурно — тени почти пропадают: свет рассеян. Карту теней при этом
    // не выключаем (это пересборка всех шейдеров), просто солнце слабое.

    // заливка от неба
    const h = this.hemi;
    if (e > 0) h.color.copy(C_HEMI_DUSK).lerp(C_HEMI_DAY, smooth(0, 20, e));
    else h.color.copy(C_HEMI_NIGHT).lerp(C_HEMI_DUSK, smooth(-10, 0, e));
    h.groundColor.copy(C_GND_NIGHT).lerp(C_GND_DAY, smooth(-8, 15, e));
    h.intensity = (0.26 + 0.34 * smooth(-8, 0, e) + 0.25 * smooth(0, 16, e)) * w.sky;
    if (w.grey > 0.01) h.color.lerp(tmp.set(0.72, 0.75, 0.80), w.grey * day * 0.7);

    // ---- туман: то, во что упирается взгляд у горизонта
    const fog = this.scene.fog;
    if (fog) {
      fog.color.copy(U.horizon.value).lerp(U.haze.value, 0.45);
      fog.density = this.fogBase * w.fog * (1 + 0.25 * nightK);
    }
    // экспозиция: ночью глаз привыкает — поднимаем, иначе всё в черноту
    this.renderer.toneMappingExposure = 1.0 + 0.55 * nightK + 0.15 * smooth(5, -3, e) * (1 - nightK);

    // ---- ночь для окон и фонарей: зажигаются в сумерках постепенно
    this.night = smooth(4, -7, e) * (0.75 + 0.25 * (1 - w.sun)) + w.grey * 0.12 * smooth(30, 5, e);
    ENV.uNight.value = clamp(this.night, 0, 1);
    if (target) updateLamps(dt || 1, target, ENV.uNight.value);
    {
      const h = c.hour;
      ENV.uLate.value = h >= 12 ? smooth(22.5, 26.5, h) : h < 5 ? smooth(-1.5, 2.5, h) : 1 - smooth(5, 7, h);
    }
    // сколько дневного света: отражения на кузове и прочее, что светит небом
    this.day = smooth(-6, 12, e) * (0.4 + 0.6 * w.sun);
  }
}

// ---------------------------------------------------------------- фонари
// Стекло плафонов уже есть в моделях фонарей (props.js, street.js), отдельно
// расставлять светильники не нужно: ночью материал сам зажигает те вершины,
// чей цвет — цвет этого стекла. srgb — цвет стекла, как он задан в модели.
const s2l = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
export function lampGlow(mat, srgb, key, glow = [1.0, 0.80, 0.52], power = 3.2) {
  const lin = srgb.map(s2l).map(v => Math.round(v * 255) / 255);
  const prev = mat.onBeforeCompile;
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uNight = ENV.uNight;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
        {
          vec3 dc = vColor.rgb - vec3(${lin.map(v => v.toFixed(4)).join(', ')});
          if (dot(dc, dc) < 0.0006) totalEmissiveRadiance += vec3(${glow.join(', ')}) * ${power.toFixed(2)} * uNight;
        }
        #endif`);
  };
  return mat;
}
