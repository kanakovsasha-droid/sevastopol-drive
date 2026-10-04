// Голос мотора без повторов — в потоке звука (AudioWorklet), не в главном.
//
// Петля, даже ровная, на высоких оборотах повторяется раз в 2–3 с, и любая её
// особенность слышна как событие — «переключение», которого нет. Здесь звук
// идёт кусками случайной длины (0.18–0.32 с), каждый — из СЛУЧАЙНОГО места
// пула ровных записей, не ближе 0.5 с к прошлому; соседние куски сходятся
// коротким переходом 50 мс. Повторов нет, длины разные — у огибающей
// громкости нет ритма. Высота у всех кусков одна: rate = обороты / обороты
// пула (параметр rate, его ведёт engine-audio.js).
//
// Почему не мелкие зёрна с большим перекрытием (было в 25cb59d): там всё
// время звучат 3–4 копии одного тона, и низы (они совпадают по фазе)
// складывались громче верхов, а неровность вспышек V8 от цикла к циклу —
// то самое «бу-бу-бу» — усреднялась. Мотор звучал ровно и высоко, «как V12».
// Длинный кусок — это сама запись: 80% времени звучит ровно одна.
//
// Чтобы на переходе куски не гасили друг друга, новый ставится так, что фаза
// цикла мотора (2 оборота = 8 вспышек) продолжает прежний: в пуле по блокам
// размечен сдвиг цикла tau (tools/build-audio.mjs), а процессор ведёт свою
// «виртуальную» фазу.
//
// В потоке звука, а не таймерами главного потока: кадр игры иногда
// подвисает на сотни миллисекунд (подгрузка города) — куски, расставленные
// заранее, кончались, и в звуке были дыры.

class GrainVoice extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rate', defaultValue: 1, minValue: 0.05, maxValue: 8, automationRate: 'k-rate' },
      { name: 'on', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor(options) {
    super();
    const o = options.processorOptions;
    this.data = o.data;                       // Float32Array пула
    this.bsr = o.sampleRate;                  // частота пула
    this.pool = o.pool;                       // { P, block, segs: [{ s, e, tau: [] }] }
    this.lenMin = Math.round(o.lenMin * sampleRate);
    this.lenMax = Math.round(o.lenMax * sampleRate);
    this.fade = Math.round(o.fade * sampleRate);
    this.grains = [];                         // { pos, age, len }
    this.vpos = 0;                            // виртуальная фаза, секунды пула
    this.lastPos = -9;
    this.total = this.pool.segs.reduce((a, q) => a + (q.e - q.s), 0);
    // переход: между «в сумме 1 по амплитуде» (куски в фазе) и «по мощности»
    // (не в фазе) — показатель 1.25
    this.ramp = new Float32Array(this.fade);
    for (let i = 0; i < this.fade; i++) this.ramp[i] = Math.pow(Math.sin(Math.PI / 2 * i / this.fade), 1.25);
  }

  spawn(rate, ahead) {
    const pool = this.pool, P = pool.P;
    const len = this.lenMin + Math.floor(Math.random() * (this.lenMax - this.lenMin));
    const need = len / sampleRate * Math.max(rate, 0.3) * 1.4 + 0.02;
    let seg = pool.segs[0], pos = seg.s;
    for (let tries = 0; tries < 10; tries++) {
      let r = Math.random() * this.total;
      seg = pool.segs[0];
      for (const q of pool.segs) { if (r < q.e - q.s) { seg = q; break; } r -= q.e - q.s; }
      if (seg.e - seg.s < need + P) continue;
      pos = seg.s + Math.random() * (seg.e - seg.s - need - P);
      if (Math.abs(pos - this.lastPos) > 0.5) break;
    }
    // фаза цикла: (pos - tau) ≡ виртуальная фаза в момент старта (mod P)
    const theta = this.vpos + ahead;
    const bi = Math.min(seg.tau.length - 1, Math.max(0, Math.floor((pos - seg.s) / pool.block)));
    const tau = seg.tau[bi] || 0;
    let p = tau + theta + P * Math.round((pos - tau - theta) / P);
    while (p < seg.s) p += P;
    while (p > seg.e - need) p -= P;
    this.lastPos = p;
    this.grains.push({ pos: p * this.bsr, age: 0, len });
  }

  process(inputs, outputs, params) {
    const out = outputs[0][0];
    const rate = params.rate[0], on = params.on[0] > 0.5;
    const step = rate * this.bsr / sampleRate;          // отсчётов пула на отсчёт выхода
    const d = this.data, n = d.length - 2, F = this.fade, ramp = this.ramp;
    for (let i = 0; i < out.length; i++) {
      // новый кусок — когда последний дошёл до начала своего спада
      const last = this.grains[this.grains.length - 1];
      if (on && (!last || last.age >= last.len - F)) this.spawn(rate, i * step / this.bsr);
      let acc = 0;
      for (let k = 0; k < this.grains.length; k++) {
        const g = this.grains[k];
        const j = g.pos | 0, u = g.pos - j;
        const v = j >= 0 && j < n ? d[j] + (d[j + 1] - d[j]) * u : 0;
        const w = g.age < F ? ramp[g.age] : g.age >= g.len - F ? ramp[Math.max(0, g.len - 1 - g.age)] : 1;
        acc += v * w;
        g.pos += step; g.age++;
      }
      out[i] = acc;
      if (this.grains.length && this.grains[0].age >= this.grains[0].len) this.grains.shift();
    }
    this.vpos += step * out.length / this.bsr;
    return true;
  }
}

registerProcessor('grain-voice', GrainVoice);
