import { E63Sound } from './engine-audio.js?v=88d8594b';
import { RoadSurface } from './roadsurf.js?v=88d8594b';
import { TireSmoke } from './smoke.js?v=88d8594b';
import { Garage } from './garage.js?v=88d8594b';
import { CARS } from './vehicle.js?v=88d8594b';

// Всё, что машина делает «вокруг» физики: коробка и привод с клавиатуры,
// звук мотора и шин, дым из-под колёс.
// Отдельным модулем, чтобы в main.js была одна врезка, а не десять.
//
//   B — привод: 4MATIC+ ↔ только задний (режим Drift)
//   P — паркинг ↔ D,  X — нейтраль ↔ D (N занята миникартой)
//   G — коробка: автомат ↔ ручная; в ручной Shift — передача вверх, Q — вниз
//   K — звук вкл/выкл, J — следующий звуковой пакет (локальные моды → открытый CC0)
//   W+S на месте — бёрнаут; из N в D на оборотах — старт с пробуксовкой
//
// Звук стартует по первому нажатию или щелчку: до жеста пользователя
// браузер AudioContext не запускает.

const KEY_SOUND = 'sev.sound';

// ---- звуковые пакеты из модов (ТОЛЬКО локальная игра). Лежат в
// data/audio-local/<машина>/<вариант>/Bank_NNN/sound_00N.wav — это чужие звуки,
// папка в .gitignore, на сайт не попадает. Ищем её только на локальном
// сервере и тихо: читаем листинг каталога data/ (python http.server его
// отдаёт), а не стучимся в файлы — так на сайте и без папки нет ни одного 404.
// Схема GTA: банк B sound_001 — петля мотора, банк A sound_002 — петля
// выхлопа, банк B sound_003 — сброс оборотов с треском, Bonus — выстрелы.
// Обороты записи — по спектру (автокорреляция, окна 0.2 с): в петле мотора
// периодичность плавно растёт 46→57 Гц у w213 и 39→53 Гц у w212, сильнейшая
// гармоника — третья (150–180 Гц), это частота вспышек V8 (4 на оборот):
// петля записана около 2300 (w213) и 2100 (w212) об/мин. Петля выхлопа
// повторяется на 39 Гц — её опорные обороты подобраны так, чтобы тон шёл
// вместе с мотором. На холостых (900) петля играет на 0.39 своей высоты —
// вспышки около 60 Гц, тот самый басовый «бубнёж».
const MOD_CARS = {
  w213: { a: 'Bank_096', b: 'Bank_097', ref: { load: [46, 57, 2300], exhaust: 1740 } },
  w212: { a: 'Bank_094', b: 'Bank_095', ref: { load: [41, 53, 2100], exhaust: 1590 } },
};
const MOD_VARIANTS = ['tuning', 'stock', 'gta'];
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|.*\.localhost|.*\.test)$/.test(location.hostname);

async function listing(url) {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    return r.ok ? await r.text() : '';
  } catch { return ''; }
}

// Какие пакеты есть: ['w213-tuning', …]. На сайте — пусто, без запросов.
export async function findModPacks(base = '../data/') {
  if (!LOCAL) return [];
  if (!(await listing(base)).includes('audio-local/')) return [];
  const out = [];
  const cars = await listing(base + 'audio-local/');
  for (const car of Object.keys(MOD_CARS)) {
    if (!cars.includes(car + '/')) continue;
    const vars = await listing(base + `audio-local/${car}/`);
    for (const v of MOD_VARIANTS) if (vars.includes(v.toUpperCase() + '/')) out.push(`${car}-${v}`);
  }
  return out;
}

export async function loadModPack(ctx, id, base = '../data/') {
  const [car, v] = id.split('-');
  const M = MOD_CARS[car], dir = `${base}audio-local/${car}/${v.toUpperCase()}/`;
  const files = { load: `${M.b}/sound_001.wav`, exhaust: `${M.a}/sound_002.wav`, decel: `${M.b}/sound_003.wav` };
  if ((await listing(dir)).includes('Bonus/')) files.bonus = `Bonus/${M.a}/sound_001.wav`;
  const bufs = {};
  await Promise.all(Object.entries(files).map(([k, f]) => fetch(dir + f).then(r => r.arrayBuffer())
    .then(ab => ctx.decodeAudioData(ab)).then(b => { bufs[k] = b; })));
  return { bufs, base: M.ref };
}

// Записи мотора, хлопков и шин: data/audio/sounds.json перечисляет файлы.
export async function loadCarSounds(ctx, base = '../data/audio/') {
  const v = document.querySelector('meta[name="build"]')?.content || '';
  const q = v ? '?v=' + v : '';
  const meta = await fetch(base + 'sounds.json' + q).then(r => r.json());
  const names = [...Object.keys(meta.loops), ...meta.shots];
  const bufs = {};
  await Promise.all(names.map(n => fetch(base + n + '.wav' + q).then(r => r.arrayBuffer())
    .then(ab => ctx.decodeAudioData(ab)).then(b => { bufs[n] = b; })));
  return { bufs, meta };
}

export class CarFX {
  // opts: scene, camera, car() — текущая машина, driving() — сейчас за рулём
  // и меню закрыто, inside() — камера в салоне
  // swapModel() — main.js грузит в сцену модель той машины, что сейчас car.model
  constructor({ scene, camera, car, driving, inside, swapModel }) {
    CarFX.last = this;                    // для отладки из консоли и стенда
    this.camera = camera;
    this.getCar = car; this.driving = driving; this.inside = inside;
    this.swapModel = swapModel || (() => {});
    // гараж: какая машина была в прошлый раз — на той и стартуем
    const first = Garage.saved();
    if (first !== car().model) car().setModel(first);
    this._credit();
    this.swapModel();
    this.garage = new Garage({ car, choose: id => this.chooseCar(id) });
    this.smoke = new TireSmoke(scene);
    // колёса опираются на нарисованный асфальт, а не на профиль коридора
    this.surface = new RoadSurface(scene);
    this.audio = null; this.ctx = null;
    let on = true;
    try { on = localStorage.getItem(KEY_SOUND) !== '0'; } catch { /* приватное окно */ }
    this.soundOn = on;

    // Передача и привод теперь в самом приборе (hud.js), отдельной строки нет.

    const unlock = () => this._start();
    addEventListener('keydown', e => {
      unlock();
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.code === 'KeyK') this.toggleSound();
      if (e.code === 'KeyJ' && !e.repeat) this.nextPack();
      if (!this.driving() || e.repeat) return;     // зажатая клавиша не листает передачи
      const c = this.getCar();
      if (e.code === 'KeyB') c.toggleDrive();
      if (e.code === 'KeyP') c.setMode(c.mode === 'P' ? 'D' : 'P');
      if (e.code === 'KeyX') c.setMode(c.mode === 'N' ? 'D' : 'N');
      // ручная коробка: G — автомат/ручная, Shift — вверх, Q — вниз
      // (Ctrl не берём: Ctrl+W закрывает вкладку)
      if (e.code === 'KeyG') c.toggleManual();
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') c.shiftUp();
      if (e.code === 'KeyQ') c.shiftDown();
    });
    addEventListener('pointerdown', unlock);
    // фоновая вкладка: кадров нет — звук замирает, а не гудит последней нотой
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend(); else if (this.soundOn) this.ctx.resume();
    });
  }

  _start() {
    if (this.ctx || !this.soundOn) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.audio = new E63Sound(this.ctx);
      this.ctx.resume();
      this._packs();
    } catch (e) { console.warn('звук не запустился:', e.message); this.ctx = null; this.audio = null; }
  }

  // Открытый набор CC0 грузится всегда (из него и визг шин); пакет мода —
  // поверх, если он есть. ?snd=w213-stock | w212-gta | open … выбирает пакет.
  async _packs() {
    const ctx = this.ctx;
    try { this.open = await loadCarSounds(ctx); } catch (e) { console.warn('записи звука не загрузились, остаётся синтез:', e.message); }
    this.packs = ['open'];
    try { this.packs = [...await findModPacks(), 'open']; } catch { /* нет — значит нет */ }
    const want = new URLSearchParams(location.search).get('snd');
    // По умолчанию — открытый набор (основа звука и на сайте), а хлопки на
    // сбросе — из w212-tuning, если он лежит локально. Ключ хранилища новый:
    // прежний выбор (пакет мода целиком) больше не навязываем.
    let saved = null;
    try { saved = localStorage.getItem('sev.snd2'); } catch { /* нет хранилища */ }
    if (this.packs.includes('w212-tuning')) {
      try { this.audio.usePops((await loadModPack(ctx, 'w212-tuning')).bufs); } catch { /* без них — открытые хлопки */ }
    }
    const pick = [want, saved, 'open'].find(p => p && this.packs.includes(p)) || 'open';
    await this.usePack(pick);
  }

  async usePack(id) {
    if (!this.audio) return;
    this.pack = id;
    try { localStorage.setItem('sev.snd2', id); } catch { /* нет хранилища */ }
    if (id === 'open') { if (this.open) this.audio.useSamples(this.open.bufs, this.open.meta); return; }
    try {
      const m = await loadModPack(this.ctx, id);
      if (this.pack !== id) return;                 // пока грузилось, выбрали другой
      m.bufs.squeal = this.open?.bufs.tyre_squeal;
      this.audio.useModPack(m.bufs, m.base, id);
    } catch (e) {
      console.warn('пакет звука не загрузился, остаётся открытый:', e.message);
      if (this.open) this.audio.useSamples(this.open.bufs, this.open.meta);
    }
  }

  // Пересесть в другую машину: параметры физики, модель, звук своей машины,
  // подпись автора модели.
  chooseCar(id) {
    const car = this.getCar();
    if (!car.setModel(id)) return;
    this._credit();
    this.swapModel();
    // звук не меняем: основа — открытый набор (с хлопками w212, если они есть),
    // пакеты модов целиком — по J
  }

  // В подписи внизу — автор модели той машины, что сейчас в игре
  _credit() {
    const a = [...document.querySelectorAll('#credit a')].find(x => x.href.includes('sketchfab.com'));
    const M = CARS[this.getCar().model];
    if (a && M) a.outerHTML = M.credit;
  }

  // J — следующий звуковой пакет (если их больше одного)
  nextPack() {
    if (!this.packs || this.packs.length < 2) return;
    const i = this.packs.indexOf(this.pack);
    this.usePack(this.packs[(i + 1) % this.packs.length]);
  }

  toggleSound() {
    this.soundOn = !this.soundOn;
    try { localStorage.setItem(KEY_SOUND, this.soundOn ? '1' : '0'); } catch { /* нет хранилища */ }
    if (this.soundOn) { this._start(); this.ctx?.resume(); }
    else this.ctx?.suspend();
  }

  update(dt) {
    const car = this.getCar();
    if (!car) return;
    const driving = this.driving();
    this.smoke.update(dt, driving ? car : null);
    if (car.surface !== this.surface) car.surface = this.surface;
    if (car.telemetry) car.telemetry.soundPack = this.pack || null;    // для приборов: какой звук играет
    this.surface.update(dt, car.pos.x, car.pos.z);
    if (this.audio && this.ctx.state === 'running') {
      const cp = this.camera.position;
      const dist = Math.hypot(cp.x - car.pos.x, cp.y - car.pos.y, cp.z - car.pos.z);
      let skid = 0;
      if (driving) for (let i = 0; i < 4; i++) if (car._fz[i] > 0) skid = Math.max(skid, car.slipVel[i]);
      // вышли из машины — мотор остаётся на холостых
      this.audio.set({
        rpm: driving ? car.rpm : 900, throttle: driving ? car.throttle : 0, limiter: driving ? car.limiter : 0,
        shiftCount: car.shiftCount, boost: driving ? car.boost : 0, skid, burnout: driving && car.burnout,
        inside: driving && this.inside(), dist,
      }, this.ctx.currentTime);
    }
  }
}
