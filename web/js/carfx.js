import { E63Sound } from './engine-audio.js?v=68ffa255';
import { TireSmoke } from './smoke.js?v=68ffa255';

// Всё, что машина делает «вокруг» физики: коробка и привод с клавиатуры,
// звук мотора и шин, дым из-под колёс.
// Отдельным модулем, чтобы в main.js была одна врезка, а не десять.
//
//   B — привод: 4MATIC+ ↔ только задний (режим Drift)
//   P — паркинг ↔ D,  X — нейтраль ↔ D (N занята миникартой)
//   G — коробка: автомат ↔ ручная; в ручной Shift — передача вверх, Q — вниз
//   K — звук вкл/выкл
//   W+S на месте — бёрнаут; из N в D на оборотах — старт с пробуксовкой
//
// Звук стартует по первому нажатию или щелчку: до жеста пользователя
// браузер AudioContext не запускает.

const KEY_SOUND = 'sev.sound';

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
  constructor({ scene, camera, car, driving, inside }) {
    CarFX.last = this;                    // для отладки из консоли и стенда
    this.camera = camera;
    this.getCar = car; this.driving = driving; this.inside = inside;
    this.smoke = new TireSmoke(scene);
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
      loadCarSounds(this.ctx).then(r => r && this.audio.useSamples(r.bufs, r.meta))
        .catch(e => console.warn('записи звука не загрузились, остаётся синтез:', e.message));
    } catch (e) { console.warn('звук не запустился:', e.message); this.ctx = null; this.audio = null; }
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
