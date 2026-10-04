// Пауза: Esc (и Options / Menu на геймпаде) — мир, физика, время суток и
// звук замирают, поверх — меню: продолжить, гараж, места, настройки, клавиши.
//
// Как замирает: main.js в цикле видит paused и не двигает ничего — только
// рисует кадр (картинка остаётся живой под меню и не гаснет). Звук — через
// master gain движка (CarFX.audio.master), сам звук не трогаем: пока стоит
// пауза, carfx.update не зовётся и гейн никто не перезапишет; после паузы
// первый же кадр carfx вернёт громкость сам.
// Вкладка ушла в фон — тоже пауза: вернулся — машина стоит, где стояла.
//
// Esc закрывает сначала то, что открыто (карта, меню мест, гараж,
// настройки), и только если ничего не открыто — ставит паузу. Для этого
// слушаем клавиши в фазе перехвата, раньше остальных модулей.

const CSS = `
#pause{position:fixed;inset:0;z-index:21;display:none;align-items:center;justify-content:center;
  background:rgba(8,10,12,.55);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
#pause.on{display:flex}
#pausebox{width:min(360px,90vw);padding:22px 22px 16px;font-family:var(--ui)}
#pausebox h2{font-family:var(--hud);font-weight:800;font-size:34px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:14px}
#pausebox button{display:flex;justify-content:space-between;align-items:baseline;width:100%;font:inherit;font-size:15px;
  color:var(--ink);background:rgba(255,255,255,.05);border:1px solid var(--line);border-radius:9px;padding:11px 14px;
  margin-bottom:7px;cursor:pointer;text-align:left}
#pausebox button:hover,#pausebox button.padsel{background:rgba(255,255,255,.13)}
#pausebox button small{color:var(--dim);font-family:var(--mono);font-size:11px}
#pausebox .sub{color:var(--dim);font-size:12px;margin-top:6px}
`;

export class Pause {
  // open* — что делают пункты меню; isBusy — открыто ли что-то своё
  // (тогда Esc закрывает его, а паузу не трогает); audio — () => CarFX
  constructor({ openGarage, openPlaces, openSettings, toggleHelp, isBusy, audio }) {
    this.paused = false;
    this.isBusy = isBusy; this.audio = audio;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = document.createElement('div');
    el.id = 'pause';
    el.innerHTML = `<div id="pausebox" class="panel">
      <h2>Пауза</h2>
      <button data-a="resume"><span>Продолжить</span><small>Esc</small></button>
      <button data-a="garage"><span>Гараж</span><small>O</small></button>
      <button data-a="places"><span>Места</span><small>M</small></button>
      <button data-a="settings"><span>Настройки</span><small>T</small></button>
      <button data-a="keys"><span>Клавиши</span><small>?</small></button>
      <div class="sub">Мир, время суток и звук стоят, пока открыто это меню.</div>
    </div>`;
    document.body.appendChild(el);
    this.el = el;
    const act = {
      resume: () => this.set(false),
      garage: () => { this.set(false); openGarage(); },
      places: () => { this.set(false); openPlaces(); },
      settings: () => { this.set(false); openSettings(); },
      keys: () => { this.set(false); toggleHelp(); },
    };
    el.querySelectorAll('button').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); act[b.dataset.a](); }));
    el.addEventListener('click', e => { if (e.target === el) this.set(false); });

    // перехват: раньше main.js, settings.js и гаража
    addEventListener('keydown', e => {
      if (e.code !== 'Escape' || e.repeat) return;
      if (this.paused) { this.set(false); e.stopImmediatePropagation(); return; }
      if (this.isBusy()) return;              // Esc закроет открытое — это делают его хозяева
      this.set(true);
      e.stopImmediatePropagation();
    }, true);
    document.addEventListener('visibilitychange', () => { if (document.hidden && !this.isBusy()) this.set(true); });
  }

  set(on) {
    if (on === this.paused) return;
    this.paused = on;
    this.el.classList.toggle('on', on);
    if (on) document.exitPointerLock?.();
    const fx = this.audio?.();
    const g = fx?.audio?.master?.gain;
    if (g && fx.ctx) {
      // пауза — тишина за 0.08 с; снятие — громкость вернёт сам carfx в первом кадре
      if (on) { g.cancelScheduledValues(fx.ctx.currentTime); g.setTargetAtTime(0, fx.ctx.currentTime, 0.03); }
    }
  }
}
