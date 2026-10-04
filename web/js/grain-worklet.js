// Гранулярный голос мотора — в потоке звука (AudioWorklet), не в главном.
//
// Петля, даже ровная, на высоких оборотах повторяется раз в 2–3 с, и любая её
// особенность слышна как событие — «переключение», которого нет. Здесь звук
// собирается из зёрен (окно Ханна, перекрытие 75%), каждое — из СЛУЧАЙНОГО
// места пула ровных записей, не ближе 0.5 с к прошлому зерну: повторов нет,
// у огибающей громкости нет ритма. Высота у всех зёрен одна: rate = обороты /
// обороты пула (параметр rate, его ведёт engine-audio.js).
//
// Чтобы соседние зёрна не «фазили» (две копии одного тона со сдвигом гасят
// друг друга), каждое ставится так, что фаза цикла мотора (2 оборота = 8
// вспышек) продолжает предыдущее: в пуле по блокам размечен сдвиг цикла tau
// (tools/build-audio.mjs), а процессор ведёт свою «виртуальную» фазу.
//
// В потоке звука, а не таймерами главного потока: там кадр игры иногда
// подвисает на сотни миллисекунд (подгрузка города), и зёрна, расставленные
// заранее, кончались — в звуке были дыры.

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
    this.dur = Math.max(64, Math.round(o.dur * sampleRate));   // зерно, отсчётов выхода
    this.hop = Math.max(32, Math.round(o.hop * sampleRate));
    this.grains = [];
    this.untilNext = 0;
    this.vpos = 0;                            // виртуальная фаза, секунды пула
    this.lastPos = -9;
    this.total = this.pool.segs.reduce((a, q) => a + (q.e - q.s), 0);
    // окно Ханна заранее
    this.win = new Float32Array(this.dur);
    for (let i = 0; i < this.dur; i++) this.win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (this.dur - 1));
    this.count = 0;
    // уровень: при перекрытии 75% окна Ханна в сумме дают 2 (зёрна в фазе) и
    // √1.5 по мощности (не в фазе) — делим на их среднее геометрическое, чтобы
    // громкость была как у одной записи
    const r = this.dur / this.hop;
    this.norm = 1 / Math.sqrt(r / 2 * Math.sqrt(0.375 * r));
    this.port.onmessage = e => { if (e.data === 'count') this.port.postMessage(this.count); };
  }

  spawn(rate, ahead) {
    const pool = this.pool, P = pool.P;
    const need = this.dur / sampleRate * Math.max(rate, 0.3) * 1.6 + 0.01;
    let seg = pool.segs[0], pos = seg.s;
    for (let tries = 0; tries < 8; tries++) {
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
    this.grains.push({ pos: p * this.bsr, age: 0 });
    this.count++;
  }

  process(inputs, outputs, params) {
    const out = outputs[0][0];
    const rate = params.rate[0], on = params.on[0] > 0.5;
    const step = rate * this.bsr / sampleRate;          // отсчётов пула на отсчёт выхода
    const d = this.data, n = d.length - 2, dur = this.dur, win = this.win;
    for (let i = 0; i < out.length; i++) {
      if (this.untilNext <= 0) {
        if (on) this.spawn(rate, i * step / this.bsr);
        this.untilNext += this.hop;
      }
      this.untilNext--;
      let acc = 0;
      for (let k = 0; k < this.grains.length; k++) {
        const g = this.grains[k];
        const j = g.pos | 0, u = g.pos - j;
        const v = j >= 0 && j < n ? d[j] + (d[j + 1] - d[j]) * u : 0;
        acc += v * win[g.age];
        g.pos += step; g.age++;
      }
      out[i] = acc * this.norm;
      if (this.grains.length && this.grains[0].age >= dur) this.grains = this.grains.filter(g => g.age < dur);
    }
    this.vpos += step * out.length / this.bsr;
    return true;
  }
}

registerProcessor('grain-voice', GrainVoice);
