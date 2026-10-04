import * as THREE from 'three';
import { GLTFLoader } from '../lib/GLTFLoader.js?v=68e005bd';
import { RoomEnvironment } from '../lib/RoomEnvironment.js?v=68e005bd';

// Физика машины. Третий заход.
//
// Прежняя модель была кинематическим велосипедом: руль напрямую задавал скорость
// поворота, занос жил отдельной затухающей добавкой. Замер стендом
// (tools/check-physics.mjs) показал, что это не машина: круг радиусом 5.5 м
// на 60 км/ч — это 5 g вбок, на 120 км/ч — 14 g; торможение 2.75 g; максималка
// 159 км/ч. Отсюда «рулится ужасно»: шин нет, машина едет как курсор.
// До неё была попытка считать силы на шинах через углы увода — по истории
// машину срывало во вращение на обычном повороте. Здесь от этого держат
// ограничение руля по скорости, самовозврат руля в занос и курсовая
// устойчивость (CAR.esp) — проверено стендом: змейка на 100 км/ч с рулём
// от упора до упора идёт с углом увода не больше 5°.
//
// Сейчас — твёрдое тело на четырёх колёсах:
//   • шаг физики фиксированный, 120 Гц, с аккумулятором; наружу отдаётся поза,
//     интерполированная между двумя последними шагами (иначе при 60 кадрах
//     шагов выходит то два, то один, и картинка мелко дёргается);
//   • подвеска: пружина + демпфер + стабилизатор на каждое колесо, луч вниз
//     по высоте полотна — отсюда крен, клевок и перенос веса сами собой;
//   • шины: угол увода и продольное проскальзывание, кривая с насыщением
//     (упрощённая Pacejka) и общий круг трения; скорость вращения колеса —
//     отдельная степень свободы, считается неявно (иначе на 120 Гц она жёсткая);
//   • двигатель с кривой момента, девять передач, автомат, полный привод
//     с уклоном назад, тормоза с распределением и АБС, ручник на задние;
//   • на стоянке шины держат машину «на якоре» — пружиной к точке, где встала:
//     формулы увода при нулевой скорости делят на ноль и дают дрожь.
//
// Интерфейс для main.js прежний: reset(x, z, yaw), update(dt, input), поля
// pos / yaw / pitch / roll / vLong / wheelDrop / wheelSpin / steerVis / crash.

// ---------------------------------------------------------------- параметры
// Mercedes-AMG E63 S (W213). Всё, что стоит крутить на вкус, собрано здесь.
// Оси кузова: +Z вперёд, +Y вверх, +X ВЛЕВО (так устроена модель в сцене).
export const CAR = {
  // габариты — для модели и для столкновений
  length: 4.99, width: 1.91, height: 1.46,
  // база, колея и радиус сняты с модели data/models/e63.glb (центры колёс
  // z = ±1.4695, x = ±0.805..0.827, шина 0.336) — по ним стоят и колёса в сцене
  wheelbase: 2.939,         // колёсная база, м
  track: 1.632,             // колея, м
  wheelRadius: 0.336,       // радиус колеса, м
  // массы
  mass: 1950,               // кг
  frontWeight: 0.55,        // доля веса на передней оси
  cgHeight: 0.50,           // высота центра масс над дорогой, м
  inertiaYaw: 3900,         // момент инерции вокруг вертикали, кг·м²
  inertiaPitch: 3300,       // вокруг поперечной оси (клевок)
  inertiaRoll: 780,         // вокруг продольной оси (крен)
  // подвеска
  rideFreqFront: 1.75,      // собственная частота, Гц: выше — жёстче
  rideFreqRear: 1.95,
  damping: 0.62,            // доля критического демпфирования
  antiRollFront: 21000,     // стабилизатор, Н/м разницы хода колёс
  antiRollRear: 11000,      // мягче сзади — машину тянет в недостаточную поворачиваемость
  bump: 0.085,              // ход сжатия до отбойника, м
  droop: 0.11,              // ход отбоя, м
  // шины
  muLong: 1.25,             // сцепление вдоль (шины уровня Pilot Sport 4S)
  muLat: 1.10,              // сцепление поперёк
  slipPeak: 0.095,          // проскальзывание на пике тяги
  alphaPeak: 0.135,         // tg угла увода на пике (~7.7°)
  loadSens: 0.14,           // падение сцепления с ростом нагрузки
  curveC: 1.42,             // форма кривой: больше — резче спад за пиком
  rearGrip: 1.06,           // задние шины шире передних
  // двигатель и трансмиссия: 4.0 V8 битурбо, 612 л.с., 850 Н·м
  torque: [[900, 380], [1500, 610], [2000, 780], [2500, 850], [4500, 850],
           [5750, 747], [6500, 661], [7000, 560], [7250, 0]],   // об/мин → Н·м
  idle: 900, redline: 7000,
  stall: 2600,              // обороты гидротрансформатора на старте с места
  gears: [5.35, 3.24, 2.25, 1.64, 1.21, 1.00, 0.87, 0.72, 0.60],
  reverse: 4.80,
  final: 3.06,
  efficiency: 0.88,         // КПД трансмиссии
  shiftTime: 0.18,          // разрыв тяги на переключении, с
  frontTorque: 0.31,        // доля момента на передней оси (4MATIC+: уклон назад)
  topSpeed: 302 / 3.6,      // электронный ограничитель, м/с (на деле выходит ровно 300)
  reverseSpeed: 50 / 3.6,   // потолок заднего хода
  engineInertia: 0.16,      // кг·м², приводится к колёсам через передачу
  wheelInertia: 1.5,        // кг·м² на колесо
  diffLock: 55,             // вязкая блокировка между колёсами оси, Н·м·с
  tcSlip: 0.20,             // противобуксовочная начинает душить отсюда…
  tcMin: 0.55,              // …но ниже этой доли момент не режет: занос газом остаётся
  tcBand: 0.22,             // за сколько проскальзывания сверх порога режет до минимума
  revInertia: 0.30,         // кг·м²: мотор с маховиком на нейтрали (перегазовка ~0.5 с до отсечки)
  // Задний привод — как режим Drift у настоящей E63: передний вал отключён,
  // противобуксовочной нет, курсовая устойчивость слабее (0 — выключена).
  espRwd: 0,
  tcRwd: false,
  // тормоза
  brakeTorque: 11500,       // суммарный момент всех четырёх, Н·м
  brakeFront: 0.64,         // доля на переднюю ось
  handbrakeTorque: 5200,    // на каждое заднее колесо, Н·м
  absEff: 0.99,             // АБС держит колесо у этой доли пика
  // аэродинамика и качение
  dragArea: 0.76,           // Cx·S, м²
  liftArea: 0.22,           // прижим, Cy·S
  // Прижим к полотну — допущение аркады, не аэродинамика. Профиль улиц в
  // данных местами ломается на 20–30% уклона за 20 м (гребень), и на 100 км/ч
  // по честной физике машина с такого гребня улетает на метр-два: центробежное
  // v²·κ там больше g. Настоящие улицы так не ломаются (профиль чинит поток
  // дорог), а машина должна держаться дороги. Поэтому, пока колёса рядом с
  // полотном, недостачу опоры добираем тягой вниз — до stick·g. Это гасит
  // «подлёты» на буграх; с настоящего трамплина или обрыва (опора дальше
  // 1.2 м) машина летит честно.
  stick: 1.6,
  rolling: 0.013,           // сопротивление качению
  // руль
  maxSteer: 0.66,           // угол колёс до упора на стоянке, рад
  steerTime: 0.17,          // время выкручивания до упора на малом ходу, с
  steerTimeFast: 0.9,       // на скорости от 110 км/ч — дольше на эту долю
  steerReturn: 0.12,        // возврат в ноль, с
  steerLatG: 1.30,          // на скорости упор руля — столько g бокового…
  steerSlip: 1.00,          // …плюс запас на увод передних шин, в долях пика
  // «Стабилизация» уровня Forza: машина вращается не быстрее, чем просит руль.
  // Гасит бросок рыскания на входе в поворот моментом без торможения; под
  // газом на заднем приводе слабеет (дрифт газом остаётся), ручник отключает.
  yawDamp: 90000,           // Н·м на рад/с лишнего рыскания
  yawDampMax: 12000,
  counterSteer: 0.70,       // самовозврат руля в занос (стабилизирующий момент шин)
  // курсовая устойчивость (ESP в спортивном режиме): 0 — выключена, 1 — строгая.
  // Подтормаживает колёса, когда кузов крутится быстрее, чем просит руль.
  esp: 0.45,
  espAngle: 0.07,           // угол увода кузова, с которого она просыпается, рад
  espGain: 22000,           // Н·м на рад/с ошибки рыскания
  espMax: 7000,             // потолок момента, Н·м
  throttleUp: 3.6,          // скорость нажатия газа с клавиатуры, 1/с
  throttleDown: 9,
  brakeUp: 14,
};

// Гараж: машины на выбор. CAR выше — это W213 (по умолчанию); у другой машины
// здесь только то, чем она отличается. Car.setModel(id) накладывает отличия
// на исходный набор и пересчитывает всё, что из него выведено.
const CAR_BASE = { ...CAR };
export const CARS = {
  w213: {
    title: 'E 63 S', code: 'W213', power: '612 л.с.', years: '2017–2023',
    glb: '../data/models/e63.glb', sound: 'w213', rwd: false,
    credit: '<a href="https://sketchfab.com/3d-models/mercedes-amg-e-63-s-w213-f61d8efb0b9b4c499fc66fcf35a4d09c" target="_blank" rel="noopener">Mercedes-AMG E 63 S — Mona x Supercars</a>',
    spec: {},
  },
  // E63 AMG W212 дорестайлинг (2011–2013): M157 5.5 V8 битурбо, 525 л.с. и
  // 700 Н·м с 1750 до 5000, 7-ступенчатая AMG SPEEDSHIFT MCT, задний привод
  // (4MATIC — с рестайлинга 2013-го, здесь переключателем), ~1845 кг.
  // Модель — обычный E-класс W212: база 2.874, колея и радиус колеса — по ней
  // (1.55 и 0.315; у настоящей E63 колея 1.60/1.59, шины 255/35 R19 и 285/30 R19).
  w212: {
    title: 'E 63', code: 'W212', power: '525 л.с.', years: '2011–2013',
    glb: '../data/models/w212.glb', sound: 'w212', rwd: true,
    credit: '<a href="https://sketchfab.com/3d-models/mercedes-benz-e-class-w212-9b70707fd2304f578175158564719c5d" target="_blank" rel="noopener">Mercedes-Benz E-Class (W212) — Savelliy 07</a>',
    spec: {
      length: 4.87, width: 1.87, height: 1.47,
      wheelbase: 2.874, track: 1.55, wheelRadius: 0.315,
      mass: 1845, frontWeight: 0.53, cgHeight: 0.52,
      inertiaYaw: 3600, inertiaPitch: 3050, inertiaRoll: 740,
      muLong: 1.25, muLat: 1.10, rearGrip: 1.15,           // задние 285 против 255
      torque: [[900, 330], [1500, 560], [1750, 700], [5000, 700], [5500, 670],
               [6000, 600], [6400, 540], [6600, 0]],
      redline: 6400, stall: 2400,
      gears: [4.38, 2.86, 1.92, 1.37, 1.00, 0.82, 0.73],
      reverse: 3.42, final: 2.82,
      frontTorque: 0.33,                                  // 4MATIC W212: 33/67
      // задний привод тут родной, а не режим Drift: противобуксовочная и ESP
      // работают (у W213 на заднем приводе они выключены)
      tcRwd: true, espRwd: 0.3, tcMin: 0.45, tcSlip: 0.06, tcBand: 0.12,   // на старте держит у пика, газом в повороте занести можно
      shiftTime: 0.16,
      brakeTorque: 10800,
      dragArea: 0.70, liftArea: 0.12,
    },
  },
};


// Полотно дороги рисуется на 0.14 м ВЫШЕ рельефа (ROAD_Y в worldgen), а колёса
// опрашивали голый рельеф — машина проваливалась в асфальт, а на переломах
// профиля кузов не совпадал с дорогой и повисал.
const ROAD_LIFT = 0.145;
const STEP = 1 / 120;         // шаг физики, с
const MAX_STEPS = 14;         // не больше стольких шагов за кадр (≈0.12 с)
const GRAV = 9.81;
const RHO2 = 0.6125;          // половина плотности воздуха
const V_LOW = 3.0;            // ниже этой скорости увод считается по ней, м/с
const HOLD_V = 0.45;          // ниже — машина встаёт «на якорь»
const HOLD_K = 62000;         // жёсткость якоря, Н/м на колесо
const HOLD_C = 9500;          // его демпфер, Н·с/м
const BUMP_K = 240000;        // отбойник, Н/м

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrapPi = a => { a = (a + Math.PI) % (2 * Math.PI); return a < 0 ? a + Math.PI : a - Math.PI; };

// Кривая шины: линейный участок, пик в s = 1, плавный спад за ним. s — общее
// нормированное скольжение (увод и пробуксовка, сведённые к долям своих пиков).
function tyreCurve(s, C, B) { return Math.sin(C * Math.atan(B * s)); }

function torqueAt(rpm) {
  const T = CAR.torque;
  if (rpm <= T[0][0]) return T[0][1];
  for (let i = 1; i < T.length; i++) {
    if (rpm <= T[i][0]) {
      const a = T[i - 1], b = T[i];
      return a[1] + (b[1] - a[1]) * (rpm - a[0]) / (b[0] - a[0]);
    }
  }
  return 0;
}

export class Car {
  constructor(terrain, collider) {
    this.terrain = terrain;
    this.collider = collider;
    // ---- то, что читает main.js (поза ИНТЕРПОЛИРОВАНА между шагами физики)
    this.pos = new THREE.Vector3();   // точка на дороге под серединой базы
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.vLong = 0;      // вдоль корпуса, м/с
    this.vLat = 0;       // влево от корпуса, м/с
    this.yawRate = 0;
    this.steer = 0;      // текущий угол колёс
    this.steerVis = 0;
    this.wheelSpin = 0;  // угол проворота колёс (по передним)
    this.wheelAngle = [0, 0, 0, 0];   // то же по каждому колесу — для внешней модели
    this.wheelDrop = [0, 0, 0, 0];    // ход подвески по каждому колесу (+ сжатие)
    this.crash = 0;
    this.airborne = false;
    this.inWater = false;
    // ---- телеметрия: приборы, звук, следы шин
    this.rpm = CAR.idle;
    this.gear = 1;       // 1..9, −1 задний
    this.slip = [0, 0, 0, 0];         // насколько шина за пиком (>1 — скользит)
    this.gLong = 0; this.gLat = 0;
    this.espActive = 0;  // 0..1 — насколько сейчас вмешивается курсовая устойчивость
    // ---- коробка и привод
    this.mode = 'D';     // P — паркинг, N — нейтраль, D — езда (R включается сам: S с места)
    this.manual = false; // ручная коробка
    this._req = 0;       // просьба ручной коробке: +1 вверх, −1 вниз
    // всё, что нужно приборам, одним объектом (обновляется каждый кадр)
    this.telemetry = { speedKmh: 0, rpm: CAR.idle, rpmMax: 7500, redline: CAR.redline, gear: 1, gearMode: 'D',
                       drive: 'AWD', manual: false, slip: 0, onLimiter: false, throttle: 0, boost: 0 };
    this.rwd = false;    // true — только задний привод
    this.limiter = 0;    // 1 — отсечка прямо сейчас
    this.shiftCount = 0; // растёт на каждом переключении — для звука
    this.throttle = 0;   // педаль газа после сглаживания, 0..1
    this.boost = 0;      // наддув, 0..1 — для свиста турбин
    this.burnout = false;
    this.slipVel = [0, 0, 0, 0];      // скорость скольжения пятна, м/с — визг и дым
    this.contact = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];   // где пятно, в мире

    // ---- геометрия, выведенная из параметров
    this.model = 'w213';
    this._derive();
    this._initState();
  }

  // Всё, что выведено из CAR: геометрия колёс, статические нагрузки, пружины.
  _derive() {
    const a = CAR.wheelbase * (1 - CAR.frontWeight);    // ЦМ → передняя ось
    const b = CAR.wheelbase * CAR.frontWeight;          // ЦМ → задняя ось
    this._cgZ = CAR.wheelbase / 2 - a;                  // ЦМ впереди середины базы
    const ht = CAR.track / 2;
    // порядок колёс как в модели: ПЛ, ПП, ЗЛ, ЗП
    this._wx = [ht, -ht, ht, -ht];
    this._wz = [a, a, -b, -b];
    const wF = CAR.mass * GRAV * b / CAR.wheelbase / 2;
    const wR = CAR.mass * GRAV * a / CAR.wheelbase / 2;
    this._w0 = [wF, wF, wR, wR];                        // статическая нагрузка
    const kOf = (w, f) => w / GRAV * (2 * Math.PI * f) ** 2;
    const kF = kOf(wF, CAR.rideFreqFront), kR = kOf(wR, CAR.rideFreqRear);
    this._k = [kF, kF, kR, kR];
    const cOf = (k, w) => 2 * CAR.damping * Math.sqrt(k * w / GRAV);
    this._c = [cOf(kF, wF), cOf(kF, wF), cOf(kR, wR), cOf(kR, wR)];
    this._B = Math.tan(Math.PI / (2 * CAR.curveC));     // пик кривой шины в s = 1
    if (this.telemetry) { this.telemetry.redline = CAR.redline; this.telemetry.rpmMax = CAR.redline > 6800 ? 8000 : 7000; }
  }

  // Сменить машину на ходу: параметры, привод по умолчанию; ставим её туда же,
  // где стояла прежняя (стоя). Модель в сцене меняет main.js.
  setModel(id) {
    const M = CARS[id];
    if (!M) return false;
    for (const k of Object.keys(CAR)) delete CAR[k];
    Object.assign(CAR, CAR_BASE, M.spec);
    this.model = id;
    this.rwd = M.rwd;
    if (this.gear > CAR.gears.length) this.gear = CAR.gears.length;
    this._derive();
    this.reset(this.pos.x, this.pos.z, this.yaw);
    return true;
  }

  _initState() {
    // ---- состояние твёрдого тела (ЦМ, мировые координаты)
    this._p = [0, 0, 0]; this._v = [0, 0, 0];
    this._q = [0, 0, 0, 1]; this._w = [0, 0, 0];
    this._R = new Float64Array(9);
    this._om = [0, 0, 0, 0];           // угловая скорость колёс
    this._comp = [0, 0, 0, 0];         // сжатие подвески относительно стоянки
    this._sAcc = 0; this._sW = 0; this._sOff = 0;
    this._ge = [0, 0, 0, 0];           // опора под колесом после ограничителя подъёма
    this._gr = [0, 0, 0, 0];           // сырая опора прошлого шага
    this._rf = [0, 0, 0, 0];           // сглаженная скорость её подъёма, м/с
    this._fz = [0, 0, 0, 0];
    this._kap = [0, 0, 0, 0];
    this._anchor = [null, null, null, null];
    this._hold = false;
    this._gas = 0; this._brake = 0; this._shiftT = 0; this._shiftLock = 0;
    this._acc = 0; this._flipT = 0; this._yawOut = 0; this._fresh = true; this._ceil = Infinity;
    this._rpmE = CAR.idle; this._dump = false; this._cutT = 0;
    this._prev = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, d: [0, 0, 0, 0] };
    this._cur = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, d: [0, 0, 0, 0] };
    this._tmp = new THREE.Vector3();
  }

  // Режим коробки. В паркинг — только почти стоя (как у настоящей: рычаг не
  // пустит), в нейтраль — на любом ходу. Из N/P в D на высоких оборотах
  // маховик сбрасывает энергию в колёса — так стартуют с пробуксовкой.
  setMode(m) {
    if (m === this.mode) return true;
    if (m === 'P' && Math.abs(this.vLong) > 1.5) return false;
    if (m === 'D' && (this.mode === 'N' || this.mode === 'P')) {
      this._dump = this._rpmE > 2500;
      this.gear = Math.abs(this.vLong) < 3 ? 1 : this.gear;
    }
    this.mode = m;
    return true;
  }
  toggleDrive() { this.rwd = !this.rwd; return this.rwd; }
  // Ручная коробка: передачи только по просьбе (shiftUp / shiftDown), на
  // отсечке мотор упирается в 7000, переключение вверх — без сброса газа
  // (как подрулевыми у AMG: момент рвётся на 0.1 с). Вниз — с перегазовкой,
  // и коробка не даст включить передачу, на которой мотор уйдёт за отсечку.
  toggleManual() { this.manual = !this.manual; this._req = 0; return this.manual; }
  shiftUp() { if (this.manual) this._req = 1; }
  shiftDown() { if (this.manual) this._req = -1; }
  get gearLabel() {
    if (this.mode !== 'D') return this.mode;
    return this.gear < 0 ? 'R' : (this.manual ? 'M' : 'D') + this.gear;
  }
  get driveLabel() { return this.rwd ? 'задний' : '4MATIC+'; }

  get speed() { return Math.hypot(this.vLong, this.vLat); }
  get kmh() { return this.vLong * 3.6; }
  get forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  // Высота опоры под точкой. Мост над головой — не опора: полотно путепровода
  // берёт верх в driveHeightAt, и машина, едущая ПОД ним, оказывалась бы на
  // три метра «под землёй». Всё, что выше крыши, — не наше, берём грунт.
  _hAt(x, z) {
    const t = this.terrain;
    let h = t.driveHeightAt(x, z);
    if (h > this._ceil && t.groundDriveHeightAt) {
      const g = t.groundDriveHeightAt(x, z);
      if (g < h) h = g;
    }
    h += ROAD_LIFT;
    // Нарисованный асфальт (roadsurf.js): полотно в сцене выше профиля — на
    // ширину улицы и на поправку провисания, до 40 см. Колесо обязано стоять
    // на нём. Верим ему, только если он рядом с профилем: мост над головой
    // или полотно соседнего уровня — не опора.
    // Наружу — профиль, а поправка до асфальта копится в this._sAcc с весом
    // this._sW (её сглаживает _step по ходу колеса).
    if (this.surface) {
      const s = this.surface.heightAt(x, z);
      if (s !== null && s > h - 0.3 && s < h + 0.6) this._sAcc += (s - h) * this._sW;
    }
    return h;
  }

  // Высота под колесом — НЕ в точке, а по пятну. Профиль полотна кусочно-
  // линейный (сетка коридора 5 м, сетка рельефа 9 м, диагонали треугольников):
  // на стыках ячеек уклон ломается скачком, местами есть ступеньки в 2–3 см.
  // Настоящая шина такие мелочи обкатывает; точечный луч — передаёт в кузов
  // ударом. Берём симметричный крест из пяти выборок: на ровном уклоне он
  // точен (запаздывания нет), а перелом и ступеньку размазывает на длину L.
  // С ростом скорости пятно длиннее — время наезда на ступеньку не сжимается.
  // Поправка до нарисованного асфальта (та же сумма весов) — в this._sOff.
  _ground(x, z, fx, fz, L) {
    const W = 0.22;
    this._sAcc = 0;
    this._sW = 0.36; let g = this._hAt(x, z) * 0.36;
    this._sW = 0.22; g += (this._hAt(x + fx * L, z + fz * L) + this._hAt(x - fx * L, z - fz * L)) * 0.22;
    this._sW = 0.10; g += (this._hAt(x + fz * W, z - fx * W) + this._hAt(x - fz * W, z + fx * W)) * 0.10;
    this._sOff = this._sAcc;
    return g;
  }

  // speed — поставить уже на ходу (м/с, вдоль курса): стенду так не нужен
  // полукилометровый разгон перед каждым гребнем
  reset(x, z, yaw = 0, speed = 0) {
    this._ceil = Infinity;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), lx = Math.cos(yaw), lz = -Math.sin(yaw);
    // ставим сразу по уклону: четыре высоты под колёсами → плоскость
    const h = [];
    for (let i = 0; i < 4; i++) {
      const a = this._wz[i] + this._cgZ, b = this._wx[i];
      h.push(this._ground(x + fx * a + lx * b, z + fz * a + lz * b, fx, fz, 0.25) + (this._sOff || 0));
    }
    const dF = (h[0] + h[1] - h[2] - h[3]) / 2, dS = (h[0] + h[2] - h[1] - h[3]) / 2;
    // вперёд и влево по плоскости, вверх — их векторное произведение
    let f = [fx * CAR.wheelbase, dF, fz * CAR.wheelbase], l = [lx * CAR.track, dS, lz * CAR.track];
    const nf = Math.hypot(f[0], f[1], f[2]); f = f.map(v => v / nf);
    let u = [f[1] * l[2] - f[2] * l[1], f[2] * l[0] - f[0] * l[2], f[0] * l[1] - f[1] * l[0]];
    const nu = Math.hypot(u[0], u[1], u[2]); u = u.map(v => v / nu);
    l = [u[1] * f[2] - u[2] * f[1], u[2] * f[0] - u[0] * f[2], u[0] * f[1] - u[1] * f[0]];
    this._setBasis(l, u, f);
    const y0 = (h[0] + h[1] + h[2] + h[3]) / 4;
    // ЦМ: над точкой привязки на высоту cgHeight и вперёд на cgZ
    this._p[0] = x + u[0] * CAR.cgHeight + f[0] * this._cgZ;
    this._p[1] = y0 + u[1] * CAR.cgHeight + f[1] * this._cgZ;
    this._p[2] = z + u[2] * CAR.cgHeight + f[2] * this._cgZ;
    this._v = [0, 0, 0]; this._w = [0, 0, 0];
    this._om = [0, 0, 0, 0]; this._comp = [0, 0, 0, 0]; this._kap = [0, 0, 0, 0];
    this._anchor = [null, null, null, null]; this._hold = false;
    this._gas = 0; this._brake = 0; this._shiftT = 0; this._shiftLock = 0;
    this._acc = 0; this._flipT = 0; this._fresh = true;
    this.gear = 1; this.rpm = CAR.idle; this._rpmE = CAR.idle; this._dump = false; this._cutT = 0;
    if (this.mode === 'R') this.mode = 'D';
    this.vLong = 0; this.vLat = 0; this.yawRate = 0;
    this.steer = 0; this.steerVis = 0; this.crash = 0; this.airborne = false;
    this._yawOut = yaw;
    if (speed > 0) {
      this._v = [f[0] * speed, f[1] * speed, f[2] * speed];
      this._om = [1, 1, 1, 1].map(() => speed / CAR.wheelRadius);
      const k = speed / CAR.wheelRadius * CAR.final * 9.5493;
      this.gear = 1;
      while (this.gear < CAR.gears.length && k * CAR.gears[this.gear - 1] > 5200) this.gear++;
      this._rpmE = this.rpm = k * CAR.gears[this.gear - 1];
      this.vLong = speed;
    }
    this._pose(this._cur); this._copyPose(this._prev, this._cur);
    this._publish(1);
  }

  _setBasis(l, u, f) {
    // матрица со столбцами (влево, вверх, вперёд) → кватернион
    const m00 = l[0], m10 = l[1], m20 = l[2], m01 = u[0], m11 = u[1], m21 = u[2], m02 = f[0], m12 = f[1], m22 = f[2];
    const tr = m00 + m11 + m22, q = this._q;
    if (tr > 0) {
      const s = 0.5 / Math.sqrt(tr + 1);
      q[3] = 0.25 / s; q[0] = (m21 - m12) * s; q[1] = (m02 - m20) * s; q[2] = (m10 - m01) * s;
    } else if (m00 > m11 && m00 > m22) {
      const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
      q[3] = (m21 - m12) / s; q[0] = 0.25 * s; q[1] = (m01 + m10) / s; q[2] = (m02 + m20) / s;
    } else if (m11 > m22) {
      const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
      q[3] = (m02 - m20) / s; q[0] = (m01 + m10) / s; q[1] = 0.25 * s; q[2] = (m12 + m21) / s;
    } else {
      const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
      q[3] = (m10 - m01) / s; q[0] = (m02 + m20) / s; q[1] = (m12 + m21) / s; q[2] = 0.25 * s;
    }
    this._matrix();
  }

  _matrix() {
    const q = this._q, R = this._R;
    const x = q[0], y = q[1], z = q[2], w = q[3];
    R[0] = 1 - 2 * (y * y + z * z); R[1] = 2 * (x * y - z * w);     R[2] = 2 * (x * z + y * w);
    R[3] = 2 * (x * y + z * w);     R[4] = 1 - 2 * (x * x + z * z); R[5] = 2 * (y * z - x * w);
    R[6] = 2 * (x * z - y * w);     R[7] = 2 * (y * z + x * w);     R[8] = 1 - 2 * (x * x + y * y);
  }

  // Поза для сцены: точка привязки модели и углы в том порядке, в каком main.js
  // их применяет (rotateY → rotateX → rotateZ, то есть порядок Эйлера YXZ).
  _pose(o) {
    const R = this._R, p = this._p;
    const ly = -CAR.cgHeight, lz = -this._cgZ;
    o.x = p[0] + R[1] * ly + R[2] * lz;
    o.y = p[1] + R[4] * ly + R[5] * lz;
    o.z = p[2] + R[7] * ly + R[8] * lz;
    o.pitch = Math.asin(clamp(-R[5], -1, 1));
    o.yaw = Math.atan2(R[2], R[8]);
    o.roll = Math.atan2(R[3], R[4]);
    for (let i = 0; i < 4; i++) o.d[i] = clamp(this._comp[i], -CAR.droop, CAR.bump + 0.03);
  }
  _copyPose(a, b) {
    a.x = b.x; a.y = b.y; a.z = b.z; a.yaw = b.yaw; a.pitch = b.pitch; a.roll = b.roll;
    for (let i = 0; i < 4; i++) a.d[i] = b.d[i];
  }
  _publish(k) {
    const a = this._prev, b = this._cur;
    this.pos.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
    // курс наружу — НЕПРЕРЫВНЫЙ, без скачка через ±π: камера и карта берут разности
    const yaw = a.yaw + wrapPi(b.yaw - a.yaw) * k;
    this._yawOut += wrapPi(yaw - this._yawOut);
    this.yaw = this._yawOut;
    this.pitch = a.pitch + (b.pitch - a.pitch) * k;
    this.roll = a.roll + wrapPi(b.roll - a.roll) * k;
    for (let i = 0; i < 4; i++) this.wheelDrop[i] = a.d[i] + (b.d[i] - a.d[i]) * k;
  }

  update(dt, input) {
    this._acc = Math.min(this._acc + Math.max(0, dt), STEP * MAX_STEPS);
    while (this._acc >= STEP - 1e-9) {
      this._copyPose(this._prev, this._cur);
      this._step(STEP, input);
      this._pose(this._cur);
      this._acc -= STEP;
    }
    this._publish(clamp(this._acc / STEP, 0, 1));
    this.steerVis += (this.steer - this.steerVis) * Math.min(1, dt * 18);
    const T = this.telemetry;
    T.speedKmh = Math.abs(this.vLong) * 3.6; T.rpm = this.rpm;
    // передача для прибора: число вперёд, 'R' задняя, 'P' / 'N' — режим коробки
    T.gear = this.mode !== 'D' ? this.mode : this.gear < 0 ? 'R' : this.gear;
    T.gearMode = this.mode !== 'D' ? this.mode : this.gear < 0 ? 'R' : this.manual ? 'M' : 'D';
    T.drive = this.rwd ? 'RWD' : 'AWD'; T.manual = this.manual;
    T.slip = Math.max(this.slipVel[0], this.slipVel[1], this.slipVel[2], this.slipVel[3]);
    T.onLimiter = this.limiter > 0; T.throttle = this.throttle; T.boost = this.boost;
    this.crash *= Math.exp(-dt * 4);
  }

  // ------------------------------------------------------------ один шаг
  _step(h, input) {
    const R = this._R, p = this._p, v = this._v, w = this._w;
    const lX = R[0], lY = R[3], lZ = R[6];      // влево
    const uX = R[1], uY = R[4], uZ = R[7];      // вверх
    const fX = R[2], fY = R[5], fZ = R[8];      // вперёд
    const vLong = v[0] * fX + v[1] * fY + v[2] * fZ;
    const vLat = v[0] * lX + v[1] * lY + v[2] * lZ;
    const speed = Math.hypot(v[0], v[1], v[2]);

    // ---- ввод: W — газ, S — тормоз, а с места — задний ход. Если main.js
    // передаёт педали отдельно (gas / brake), газ с тормозом вместе на месте —
    // бёрнаут: передние держит тормоз, задние буксуют.
    const thr = clamp(input.throttle || 0, -1, 1);
    const drive = this.mode === 'D';
    let gasT = 0, brakeT = 0, wantRev = this.gear < 0;
    const both = !!(input.gas && input.brake);
    const burn = both && drive && speed < 4;           // стоя на заднем — сперва включится D
    this.burnout = burn;
    if (burn) { gasT = 1; brakeT = 1; wantRev = false; }
    else if (both) brakeT = 1;
    else if (!drive) {
      // P и N: газ только крутит мотор, S — тормоз
      if (thr > 0) gasT = thr; else if (thr < 0) brakeT = -thr;
    } else if (this.manual) {
      // ручная: W — газ на включённой передаче (и на задней тоже), S — тормоз
      if (thr > 0) gasT = thr; else if (thr < 0) brakeT = -thr;
      wantRev = this.gear < 0;
    } else if (thr > 0) {
      if (vLong < -1.0) brakeT = thr; else { gasT = thr; wantRev = false; }
    } else if (thr < 0) {
      if (vLong > 1.0) brakeT = -thr; else { gasT = -thr; wantRev = true; }
    }
    this._gas += clamp(gasT - this._gas, -CAR.throttleDown * h, CAR.throttleUp * h);
    this._brake += clamp(brakeT - this._brake, -12 * h, CAR.brakeUp * h);
    const gas = this._gas;
    // Без газа на малом ходу автомат сам придерживает машину: иначе после
    // тычка по газу она катится ещё полминуты, а встать можно только тормозом.
    const brake = Math.max(this._brake, gas < 0.02 ? 0.10 * clamp(1 - speed / 3, 0, 1) : 0);
    const hand = !!input.handbrake;

    // ---- руль. Упор зависит от скорости: до угла, который даёт steerLatG
    // бокового, плюс запас на увод шин. Иначе клавиша «до упора» на трассе
    // ставит колёса поперёк и шины просто срывает.
    const vs = Math.max(Math.abs(vLong), 1);
    const lim = Math.min(CAR.maxSteer,
      Math.atan(CAR.wheelbase * CAR.steerLatG * GRAV / (vs * vs)) + CAR.alphaPeak * CAR.steerSlip);
    let want = clamp(input.steer || 0, -1, 1) * lim;
    // Самовозврат в занос: стабилизирующий момент шин сам доворачивает руль в
    // сторону движения — отпусти баранку, и колёса встанут по ходу. С клавиатуры
    // это единственный способ поймать занос: руки рулём по градусу не работают.
    let assist = 0;
    if (vLong > 4 && !this.airborne) {
      const beta = Math.atan2(vLat, vLong);
      const dead = 0.035;
      const b = Math.abs(beta) > dead ? beta - Math.sign(beta) * dead : 0;
      assist = CAR.counterSteer * clamp(b, -0.6, 0.6) * clamp((vLong - 4) / 6, 0, 1);
    }
    want = clamp(want + assist, -CAR.maxSteer, CAR.maxSteer);
    const toZero = Math.abs(want) < Math.abs(this.steer) || want * this.steer < 0;
    // К нулю и в занос руль идёт быстро. От нуля — за steerTime до упора на
    // малом ходу и вдвое дольше на трассе: клавиша — это рывок руля, и на 100
    // км/ч он давал бросок рыскания в полтора раза выше установившегося.
    const tSteer = CAR.steerTime * (1 + clamp((Math.abs(vLong) - 8) / 22, 0, 1) * CAR.steerTimeFast);
    const steerRate = (toZero || Math.abs(assist) > 0.02 ? CAR.maxSteer / CAR.steerReturn * 0.5 : lim / tSteer) * h;
    this.steer += clamp(want - this.steer, -steerRate, steerRate);
    const cs = Math.cos(this.steer), sn = Math.sin(this.steer);

    // ---- коробка и мотор
    const gearBefore = this.gear;
    if (drive) this._shift(h, vLong, gas, wantRev);
    if (this.gear !== gearBefore) this.shiftCount++;
    const ratio = (this.gear < 0 ? -CAR.reverse : CAR.gears[this.gear - 1]) * CAR.final;
    const om = this._om;
    const fs = this.rwd ? 0 : CAR.frontTorque;          // доля момента на передний вал
    const omDrive = fs * (om[0] + om[1]) / 2 + (1 - fs) * (om[2] + om[3]) / 2;
    const rpmWheels = Math.abs(omDrive * ratio) * 9.5493;
    // Обороты мотора — своё состояние. На нейтрали и в паркинге мотор крутится
    // сам по себе: газ разгоняет маховик до отсечки. В D он сцеплен с колёсами
    // через гидротрансформатор: на низшей передаче не падает ниже «стопа».
    let rpm = this._rpmE, dumpT = 0;
    this._cutT -= h;
    const cut = this._cutT > 0 ? 0 : 1;                  // отсечка: момент пропадает рывками
    if (!drive) {
      const t = torqueAt(rpm) * gas * cut - (30 + rpm * 0.022);
      rpm = Math.max(CAR.idle * (1 + 0.1 * gas), rpm + t / CAR.revInertia * 9.5493 * h);
      this._dump = false;
    } else {
      const low = this.gear === 1 || this.gear < 0;
      const target = Math.max(rpmWheels, CAR.idle + (low ? gas * (CAR.stall - CAR.idle) : 0));
      if (rpm > target + 60 && this._dump) {
        // сброс маховика в трансмиссию: мотор тормозится колёсами, колёса
        // получают его момент — старт «с оборотов» с пробуксовкой
        const tau = 0.22;
        dumpT = CAR.revInertia * (rpm - target) / 9.5493 / tau;
        rpm += (target - rpm) * Math.min(1, h / tau);
      } else {
        this._dump = false;
        rpm += (target - rpm) * Math.min(1, h * 14);
      }
    }
    // колёса на буксе могут убежать выше отсечки — мотор за ними не идёт
    rpm = Math.min(rpm, CAR.redline + 180);
    if (rpm > CAR.redline && this._cutT <= -0.02) this._cutT = 0.045;
    this.limiter = this._cutT > 0 ? 1 : 0;
    this._rpmE = rpm;
    this.rpm = rpm;
    let engT = 0;
    if (drive && this._shiftT <= 0) {
      engT = torqueAt(rpm) * gas * cut + dumpT;
      // ограничитель скорости и вода
      engT *= clamp(((this.gear < 0 ? CAR.reverseSpeed : CAR.topSpeed) - Math.abs(vLong)) / 1.5, 0, 1);
      if (this.gear < 0) engT *= 0.55;
      // торможение двигателем: только когда муфта замкнута
      if (gas < 0.05 && rpmWheels > 1300) engT -= (25 + rpmWheels * 0.009) * (1 - gas * 20);
    }
    if (this.inWater) engT *= 0.25;
    this.throttle = gas;
    // наддув: набирается за полсекунды, от 1800 об/мин
    this.boost += (gas * clamp((rpm - 1800) / 1800, 0, 1) - this.boost) * Math.min(1, h / (gas > this.boost ? 0.45 : 0.12));
    const axleT = engT * ratio * CAR.efficiency;         // на все колёса, со знаком
    const iDrive = CAR.wheelInertia + CAR.engineInertia * ratio * ratio / 4;

    // ---- стоянка: без газа и почти без хода — на якорь
    let grounded = 0;
    for (let i = 0; i < 4; i++) if (this._fz[i] > 0) grounded++;
    const slow = speed < HOLD_V && Math.abs(w[1]) < 0.4;
    if ((gas > 0.02 && drive) || grounded < 3) this._hold = false;
    else if (slow || (this.mode === 'P' && speed < 1.5)) this._hold = true;
    else if (speed > HOLD_V * 3) this._hold = false;
    const hold = this._hold;

    // ---- опора: высоты под четырьмя колёсами и общая плоскость
    this._ceil = p[1] - CAR.cgHeight + 1.9;
    const fl = Math.hypot(fX, fZ) || 1, gfx = fX / fl, gfz = fZ / fl;
    const L = clamp(0.26 + 0.013 * speed, 0.26, 0.95);
    const bx = [0, 0, 0, 0], by = [0, 0, 0, 0], bz = [0, 0, 0, 0], gh = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      // точка касания колеса на стоянке, в мире
      const x = this._wx[i], y = -CAR.cgHeight, z = this._wz[i];
      bx[i] = p[0] + lX * x + uX * y + fX * z;
      by[i] = p[1] + lY * x + uY * y + fY * z;
      bz[i] = p[2] + lZ * x + uZ * y + fZ * z;
      let g = this._ground(bx[i], bz[i], gfx, gfz, L);
      // Поправка до асфальта — ступенчатая: пролёты полотна плоские, углы
      // приподняты провисанием на разную высоту, на стыках улиц — уступы. Колесо
      // идёт за ней с уклоном не круче 8% по ходу (и 15 см/с на месте) — иначе
      // каждый стык пролётов отдаётся в кузов ударом (замер: тряска ×2.3).
      // Потолок поправки — 12 см. На перекрёстках провисание поднимает полотно
      // горбом до 45 см на 10 м (замер у Большой Морской, −410, 517): колесо,
      // честно идущее по такому горбу, на 80 км/ч отрывалось, руль переставал
      // работать, а при посадке машину рвало в занос. Там колесо немного уходит
      // в асфальт — это видно, но ехать можно; сам горб — дело сборки дорог.
      {
        const so = this._so || (this._so = [0, 0, 0, 0]);
        const lim = (0.08 * speed + 0.15) * h;
        // и только вверх: где нарисованное полотно НИЖЕ профиля (узкий проезд
        // поперёк широкой улицы — до 20 см), колесо за ним не ныряет
        const want = clamp(this._sOff, 0, 0.12);
        so[i] = this._fresh ? want : so[i] + clamp(want - so[i], -lim, lim);
        g += so[i];
      }
      // Ступенька в данных: край дорожного коридора стоит над голой сеткой
      // рельефа на 0.5–0.8 м (выемка/насыпь коридора обрывается, где его вес
      // падает ниже половины). Пятно шины такое не размажет, и машину с него
      // подкидывало на полтора метра. Поэтому опора под колесом поднимается не
      // быстрее, чем поднималась только что (сглаженная скорость подъёма), плюс
      // запас в 12% уклона: настоящий подъём, хоть 28% на Котовского, колесо
      // отслеживает без отставания, а ступенька превращается во въезд.
      // Вниз ограничения нет: с обрыва падаем честно.
      if (this._fresh) { this._ge[i] = this._gr[i] = g; this._rf[i] = 0; }
      const rr = Math.min((g - this._gr[i]) / h, 0.4 * speed + 0.5);
      this._gr[i] = g;
      this._rf[i] += (rr - this._rf[i]) * Math.min(1, h / 0.12);
      const rise = (Math.max(this._rf[i], 0) + 0.12 * speed + 0.4) * h;
      if (g > this._ge[i] + rise) g = this._ge[i] + rise;
      this._ge[i] = gh[i] = g;
    }
    // нормаль: (перед − зад) × (лево − право)
    let ax = bx[0] + bx[1] - bx[2] - bx[3], ay = gh[0] + gh[1] - gh[2] - gh[3], az = bz[0] + bz[1] - bz[2] - bz[3];
    let cx = bx[0] + bx[2] - bx[1] - bx[3], cy = gh[0] + gh[2] - gh[1] - gh[3], cz = bz[0] + bz[2] - bz[1] - bz[3];
    let nX = ay * cz - az * cy, nY = az * cx - ax * cz, nZ = ax * cy - ay * cx;
    let nl = Math.hypot(nX, nY, nZ) || 1;
    if (nY < 0) nl = -nl;
    nX /= nl; nY /= nl; nZ /= nl;
    if (nY < 0.5) { nX = 0; nY = 1; nZ = 0; }             // стена, а не дорога
    const un = Math.max(0.5, uX * nX + uY * nY + uZ * nZ);

    // ---- силы на кузов
    let Fx = 0, Fy = -CAR.mass * GRAV, Fz = 0, Tx = 0, Ty = 0, Tz = 0;
    // воздух: сопротивление против скорости, прижим вдоль «низа» кузова
    const drag = RHO2 * CAR.dragArea * speed;
    Fx -= drag * v[0]; Fy -= drag * v[1]; Fz -= drag * v[2];
    const down = RHO2 * CAR.liftArea * vLong * vLong;
    Fx -= uX * down; Fy -= uY * down; Fz -= uZ * down;
    if (this.inWater) { Fx -= v[0] * CAR.mass * 3.2; Fz -= v[2] * CAR.mass * 3.2; }

    const comp = this._comp;
    let deep = 0, contacts = 0;
    const fzNew = [0, 0, 0, 0], rate = [0, 0, 0, 0], c = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      // сжатие: насколько точка касания «на стоянке» ушла под плоскость дороги
      c[i] = (gh[i] - by[i]) * nY / un;
      rate[i] = this._fresh ? 0 : clamp((c[i] - comp[i]) / h, -4, 4);
    }
    for (let i = 0; i < 4; i++) {
      let f = 0;
      if (c[i] > -CAR.droop) {
        // демпфер дегрессивный: на резком ходу (ступенька) он не должен бить
        const r = rate[i], ar = Math.abs(r);
        // Отбой (r < 0) — линейный и жёстче сжатия: дегрессивный отбой на
        // гребне отпускал пружину, и она подбрасывала кузов.
        const dv = r < 0 ? r : ar < 0.35 ? r : 0.35 + (ar - 0.35) * 0.32;
        const j = i ^ 1;                                   // колесо той же оси
        const arb = (i < 2 ? CAR.antiRollFront : CAR.antiRollRear)
          * (clamp(c[i], -CAR.droop, CAR.bump) - clamp(c[j], -CAR.droop, CAR.bump));
        f = this._w0[i] + this._k[i] * c[i] + this._c[i] * dv * (r > 0 ? 0.85 : 1.5) + arb;
        if (c[i] > CAR.bump) f += BUMP_K * (c[i] - CAR.bump) + (r > 0 ? 6000 * r : 0);
        f = clamp(f, 0, this._w0[i] * 4.5);
      }
      fzNew[i] = f;
      if (f > 0) contacts++;
      if (c[i] > deep) deep = c[i];
      comp[i] = c[i];
    }
    this._fresh = false;

    // ---- прижим к полотну (см. CAR.stick): недостача опоры против веса,
    // только на ходу и пока колёса не дальше 0.8 м от дороги
    let sumFz = 0, gapMin = 9;
    for (let i = 0; i < 4; i++) { sumFz += fzNew[i]; gapMin = Math.min(gapMin, -c[i]); }
    if (CAR.stick > 0 && speed > 8) {
      const near = clamp((1.2 - gapMin) / 0.6, 0, 1);
      const need = CAR.mass * GRAV * nY * 0.92 - sumFz;
      if (near > 0 && need > 0) {
        const f = Math.min(need, CAR.stick * CAR.mass * GRAV) * near * clamp((speed - 8) / 8, 0, 1);
        Fx -= nX * f; Fy -= nY * f; Fz -= nZ * f;
      }
    }

    const om0 = [om[0], om[1], om[2], om[3]];   // снимок: обход по порядку не должен давать перекос влево-вправо
    for (let i = 0; i < 4; i++) {
      const fz = fzNew[i];
      this._fz[i] = fz;
      const front = i < 2;
      // привод и тормоз этого колеса
      let driveT = axleT * (front ? fs : 1 - fs) / 2;
      if (hand && !front) driveT = 0;
      // противобуксовочная: душит, но не до нуля. На заднем приводе и в
      // бёрнауте её нет — это и есть просьба покрутить колёса.
      const kPrev = this._kap[i] * Math.sign(ratio);
      const tc = !burn && (!this.rwd || CAR.tcRwd);
      if (tc && kPrev > CAR.tcSlip && driveT * ratio > 0) driveT *= clamp(1 - (kPrev - CAR.tcSlip) / CAR.tcBand, CAR.tcMin, 1);
      // вязкая блокировка: колесо, убежавшее от соседа по оси, подтормаживается
      driveT += CAR.diffLock * (om0[i ^ 1] - om0[i]);
      // в бёрнауте тормоз только на передней оси (как «line lock»)
      let brakeTq = burn ? (front ? CAR.brakeTorque * 0.5 : 0)
        : brake * CAR.brakeTorque * (front ? CAR.brakeFront : 1 - CAR.brakeFront) / 2;
      const inertia = iDrive;

      if (fz <= 0) {
        // колесо в воздухе: крутится свободно
        this._kap[i] = 0; this.slip[i] = 0; this._anchor[i] = null; this.slipVel[i] = 0;
        if (hand && !front) brakeTq += CAR.handbrakeTorque;
        om[i] = this._spin(om[i], driveT, brakeTq, 0, 0, inertia, h);
        continue;
      }
      // точка контакта и её скорость
      const px = bx[i] + uX * c[i], py = by[i] + uY * c[i], pz = bz[i] + uZ * c[i];
      const rx = px - p[0], ry = py - p[1], rz = pz - p[2];
      const vx = v[0] + w[1] * rz - w[2] * ry;
      const vy = v[1] + w[2] * rx - w[0] * rz;
      const vz = v[2] + w[0] * ry - w[1] * rx;
      // оси колеса в плоскости дороги
      let hx = front ? fX * cs + lX * sn : fX, hy = front ? fY * cs + lY * sn : fY, hz = front ? fZ * cs + lZ * sn : fZ;
      const hn = hx * nX + hy * nY + hz * nZ;
      hx -= nX * hn; hy -= nY * hn; hz -= nZ * hn;
      const hl = Math.hypot(hx, hy, hz) || 1; hx /= hl; hy /= hl; hz /= hl;
      const sx = nY * hz - nZ * hy, sy = nZ * hx - nX * hz, sz = nX * hy - nY * hx;   // влево от колеса
      const vl = vx * hx + vy * hy + vz * hz;      // вдоль колеса
      const vt = vx * sx + vy * sy + vz * sz;      // поперёк
      const grip = (front ? 1 : CAR.rearGrip) * clamp(1 - CAR.loadSens * (fz / this._w0[i] - 1), 0.72, 1.12);
      const muX = CAR.muLong * grip, muY = CAR.muLat * grip;

      const cp = this.contact[i]; cp[0] = px; cp[1] = py; cp[2] = pz;
      let fLong, fLat;
      if (hold || (burn && front)) {
        // ЯКОРЬ. Шина стоит на месте и держит кузов как пружина — в пределах
        // сцепления. Сверх него якорь ползёт: это обычное трение скольжения.
        let an = this._anchor[i];
        if (!an) an = this._anchor[i] = [px, pz];
        const dx = px - an[0], dz = pz - an[1];
        let fl2 = -HOLD_K * (dx * hx + dz * hz) - HOLD_C * vl;
        let ft2 = -HOLD_K * (dx * sx + dz * sz) - HOLD_C * vt;
        const cap = muY * fz, mag = Math.hypot(fl2, ft2);
        if (mag > cap) {
          fl2 *= cap / mag; ft2 *= cap / mag;
          an[0] += dx * 0.2; an[1] += dz * 0.2;
        }
        fLong = fl2; fLat = ft2;
        om[i] = 0; this._kap[i] = 0; this.slip[i] = 0; this.slipVel[i] = 0;
      } else {
        this._anchor[i] = null;
        // АБС: момент не выше того, что шина способна передать, и сброс, если
        // колесо всё-таки пошло в блокировку (торможение в повороте)
        if (brakeTq > 0 && Math.abs(vl) > 2) {
          brakeTq = Math.min(brakeTq, CAR.wheelRadius * muX * fz * CAR.absEff);
          const k = this._kap[i] * Math.sign(vl);
          if (k < -CAR.slipPeak * 1.3) brakeTq *= clamp(1 + (k + CAR.slipPeak * 1.3) / 0.08, 0.2, 1);
        }
        if (hand && !front) brakeTq += CAR.handbrakeTorque;
        const den = Math.max(Math.abs(vl), V_LOW);
        const tanA = vt / den;
        const sY = tanA / CAR.alphaPeak;
        const C = CAR.curveC, B = this._B, R0 = CAR.wheelRadius;
        // продольная сила как функция скорости вращения колеса
        const force = (omega) => {
          const kap = (omega * R0 - vl) / den;
          const sX = kap / CAR.slipPeak;
          const s = Math.hypot(sX, sY);
          if (s < 1e-6) return [0, 0, kap, 0];
          const g = tyreCurve(s, C, B) / s;
          return [muX * fz * g * sX, -muY * fz * g * sY, kap, s];
        };
        const f0 = force(om[i]);
        const eps = 0.01 * den / R0;
        const f1 = force(om[i] + eps);
        const D = Math.max(0, (f1[0] - f0[0]) / eps);
        // качение сопротивляется вращению
        const roll = -CAR.rolling * fz * R0 * Math.tanh(om[i] * 2);
        om[i] = this._spin(om[i], driveT + roll, brakeTq, f0[0] * R0, D * R0, inertia, h);
        const f = force(om[i]);
        fLong = f[0]; fLat = f[1];
        this._kap[i] = f[2]; this.slip[i] = f[3];
        this.slipVel[i] = Math.hypot(om[i] * R0 - vl, vt);
      }
      // сила на кузов: опора по нормали + шина в плоскости
      const tx = nX * fz + hx * fLong + sx * fLat;
      const ty = nY * fz + hy * fLong + sy * fLat;
      const tz = nZ * fz + hz * fLong + sz * fLat;
      Fx += tx; Fy += ty; Fz += tz;
      Tx += ry * tz - rz * ty; Ty += rz * tx - rx * tz; Tz += rx * ty - ry * tx;
      this.wheelAngle[i] += om[i] * h;
    }
    this.wheelSpin += (om[0] + om[1]) / 2 * h;
    this.airborne = contacts === 0;

    // ---- курсовая устойчивость. Эталон — рыскание, которого просит руль при
    // нынешней скорости (с потолком по сцеплению). Крутимся быстрее и кузов уже
    // идёт боком — подтормаживаем колёса одной стороны: это момент против
    // вращения и немного потери хода. Ручник её отключает: он и есть просьба
    // о заносе. Под полным газом она слабее — занос газом остаётся.
    this.espActive = 0;
    const esp = this.rwd ? CAR.espRwd : CAR.esp;
    if (esp > 0 && !hand && vLong > 6 && contacts >= 3) {
      const beta = Math.abs(Math.atan2(vLat, vLong));
      const rMax = 0.95 * CAR.muLat * GRAV / vLong;
      const rRef = clamp(vLong * Math.tan(this.steer) / (CAR.wheelbase * (1 + (vLong / 32) ** 2)), -rMax, rMax);
      const err = w[1] - rRef;
      // два признака: кузов уже идёт боком (угол увода) или рыскание заметно
      // выше того, что шины способны удержать, — второй срабатывает раньше
      const act = Math.max(clamp((beta - CAR.espAngle) / CAR.espAngle, 0, 1),
                           clamp((Math.abs(w[1]) - rMax * 1.15) / (rMax * 0.5), 0, 1))
        * esp * (1 - 0.45 * gas);
      // только ГАСИМ лишнее вращение; докручивать машину в поворот — не её дело
      if (act > 0 && err * w[1] > 0) {
        const M = clamp(-CAR.espGain * err, -CAR.espMax, CAR.espMax) * act;
        Tx += uX * M; Ty += uY * M; Tz += uZ * M;
        const dragF = Math.abs(M) / CAR.track;            // цена момента: тормозная сила
        Fx -= fX * dragF; Fy -= fY * dragF; Fz -= fZ * dragF;
        this.espActive = act;
      }
    }

    // ---- стабилизация вращения (см. CAR.yawDamp). Эталон — рыскание, которое
    // просит руль (с потолком по сцеплению). Машина ведётся к нему в обе
    // стороны, как подруливание тормозами у современных систем: и бросок на
    // входе в поворот гасится, и «провал» после него, когда передок на миг
    // срывает, добирается — машина едет туда, куда смотрит руль. Зазор 8%
    // эталона — в нём не вмешиваемся. Газ (просьба о заносе) и уже идущий
    // занос (кузов боком больше 12°) её отпускают, ручник — выключает.
    if (CAR.yawDamp > 0 && !hand && vLong > 5 && contacts >= 3) {
      const rMax = 0.95 * CAR.muLat * GRAV / vLong;
      const rRef = clamp(vLong * Math.tan(this.steer) / (CAR.wheelbase * (1 + (vLong / 32) ** 2)), -rMax, rMax);
      const err = w[1] - rRef;
      const band = 0.08 * Math.abs(rRef) + 0.015;
      const beta = Math.abs(Math.atan2(vLat, vLong));
      if (Math.abs(err) > band && beta < 0.21) {
        const soft = (1 - 0.85 * gas) * clamp((vLong - 5) / 5, 0, 1) * clamp(1 - (beta - 0.12) / 0.09, 0, 1);
        const M = -Math.sign(err) * Math.min(CAR.yawDamp * (Math.abs(err) - band), CAR.yawDampMax) * soft;
        Tx += uX * M; Ty += uY * M; Tz += uZ * M;
      }
    }

    // ---- в воздухе и на боку: кузов мягко возвращается колёсами вниз.
    // Это не физика, а уважение к игроку: лежать на крыше неинтересно.
    if (contacts < 2) {
      const k = contacts === 0 ? 5200 : 2600;
      Tx -= uZ * k; Tz += uX * k;                    // момент вдоль (up × Y) тянет «верх» кузова к вертикали
      Tx -= w[0] * 900; Ty -= w[1] * 500; Tz -= w[2] * 900;
    }

    // ---- интегрирование: скорость, потом положение (полунеявный Эйлер)
    const im = 1 / CAR.mass;
    const axW = Fx * im, ayW = Fy * im, azW = Fz * im;
    v[0] += axW * h; v[1] += ayW * h; v[2] += azW * h;
    // момент → оси кузова, там тензор инерции диагонален
    const tbx = Tx * lX + Ty * lY + Tz * lZ, tby = Tx * uX + Ty * uY + Tz * uZ, tbz = Tx * fX + Ty * fY + Tz * fZ;
    let wbx = w[0] * lX + w[1] * lY + w[2] * lZ, wby = w[0] * uX + w[1] * uY + w[2] * uZ, wbz = w[0] * fX + w[1] * fY + w[2] * fZ;
    const Ix = CAR.inertiaPitch, Iy = CAR.inertiaYaw, Iz = CAR.inertiaRoll;
    const dwx = (tbx - wby * wbz * (Iz - Iy)) / Ix;
    const dwy = (tby - wbz * wbx * (Ix - Iz)) / Iy;
    const dwz = (tbz - wbx * wby * (Iy - Ix)) / Iz;
    wbx += dwx * h; wby += dwy * h; wbz += dwz * h;
    w[0] = lX * wbx + uX * wby + fX * wbz;
    w[1] = lY * wbx + uY * wby + fY * wbz;
    w[2] = lZ * wbx + uZ * wby + fZ * wbz;

    // Глубокий провал под опору (подгрузился детальный рельеф, выезд на
    // подпорную стенку): силой отбойника тут машину выстрелит в небо.
    // Поднимаем положением, за конечное время, и гасим скорость внутрь.
    if (deep > CAR.bump + 0.10) {
      p[1] += Math.min(deep - CAR.bump - 0.10, 0.06);
      const vn = v[0] * nX + v[1] * nY + v[2] * nZ;
      if (vn < 0) { v[0] -= nX * vn; v[1] -= nY * vn; v[2] -= nZ * vn; }
      if (vn < -5) this.crash = Math.max(this.crash, Math.min(1, -vn / 16));
    }

    p[0] += v[0] * h; p[1] += v[1] * h; p[2] += v[2] * h;
    const q = this._q, hh = 0.5 * h;
    const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
    q[0] += hh * (w[0] * qw + w[1] * qz - w[2] * qy);
    q[1] += hh * (w[1] * qw + w[2] * qx - w[0] * qz);
    q[2] += hh * (w[2] * qw + w[0] * qy - w[1] * qx);
    q[3] -= hh * (w[0] * qx + w[1] * qy + w[2] * qz);
    const ql = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    q[0] /= ql; q[1] /= ql; q[2] /= ql; q[3] /= ql;
    this._matrix();

    this._collide();

    // ---- перевернулись и лежим: поставить на колёса на том же месте
    if (R[4] < 0.25) this._flipT += h; else this._flipT = 0;
    if (this._flipT > 2.2) {
      const o = {}; o.d = [0, 0, 0, 0]; this._pose(o);
      const acc = this._acc, yawOut = this._yawOut;
      this.reset(o.x, o.z, o.yaw);
      this._acc = acc; this._yawOut = yawOut + wrapPi(o.yaw - yawOut);
      return;
    }

    // ---- предохранитель: число сломалось — ставим машину туда, где она была цела
    if (!(isFinite(p[0] + p[1] + p[2] + v[0] + v[1] + v[2] + w[0] + w[1] + w[2] + q[0] + q[3]))) {
      const g = this._good || { x: 0, z: 0, yaw: 0 };
      const acc = this._acc;
      this.reset(g.x, g.z, g.yaw);
      this._acc = acc;
      return;
    }
    if (contacts >= 3) (this._good ||= {}).x = p[0], this._good.z = p[2], this._good.yaw = Math.atan2(R[2], R[8]);

    // ---- наружу
    const R2 = this._R;
    this.vLong = v[0] * R2[2] + v[1] * R2[5] + v[2] * R2[8];
    this.vLat = v[0] * R2[0] + v[1] * R2[3] + v[2] * R2[6];
    this.yawRate = w[1];
    this.gLong = (axW * fX + ayW * fY + azW * fZ + GRAV * fY) / GRAV;
    this.gLat = (axW * lX + ayW * lY + azW * lZ + GRAV * lY) / GRAV;
    this.inWater = this.terrain.driveHeightAt(p[0], p[2]) < 0.35 && p[1] < 2.5;
  }

  // Вращение колеса за шаг. Сила шины жёстко зависит от скорости вращения —
  // явный шаг на 120 Гц тут расходится, поэтому по шине шаг неявный
  // (линеаризация: dF/dω = D). Тормоз — трение: он останавливает колесо, но
  // назад его не раскручивает.
  _spin(om, driveT, brakeT, tyreT, D, inertia, h) {
    const den = inertia + h * D;
    let o = om + h * (driveT - tyreT) / den;
    if (brakeT > 0) {
      const d = h * brakeT / den;
      o = Math.abs(o) <= d ? 0 : o - Math.sign(o) * d;
    }
    return o;
  }

  // Автомат. Решение — по скорости МАШИНЫ, а не колёс: на пробуксовке колёса
  // раскручены, и коробка перебирала бы передачи вверх на ровном месте.
  _shift(h, vLong, gas, wantRev) {
    this._shiftT -= h; this._shiftLock -= h;
    if (this.manual) {
      const req = this._req; this._req = 0;
      if (!req || this._shiftLock > 0) return;
      const k = Math.abs(vLong) / CAR.wheelRadius * CAR.final * 9.5493;
      const g = CAR.gears, n = this.gear;
      if (req > 0) {
        if (n < 0) { if (Math.abs(vLong) < 1.5) { this.gear = 1; this._shiftLock = 0.2; } return; }
        if (n < g.length) { this.gear = n + 1; this._shiftT = 0.10; this._shiftLock = 0.15; }
      } else {
        if (n === 1) { if (Math.abs(vLong) < 1.5) { this.gear = -1; this._shiftLock = 0.2; } return; }
        if (n > 1 && k * g[n - 2] < CAR.redline + 250) {
          this.gear = n - 1; this._shiftT = 0.08; this._shiftLock = 0.15;
          this._rpmE = Math.max(this._rpmE, k * g[n - 2]);          // перегазовка
        }
      }
      return;
    }
    if (wantRev !== (this.gear < 0)) {
      if (Math.abs(vLong) < 1.5) { this.gear = wantRev ? -1 : 1; this._shiftLock = 0.2; }
      return;
    }
    // Полный газ копится отдельно: кикдаун только если газ в пол держат
    // четверть секунды, а не от каждого тычка клавиши.
    this._wot = gas > 0.85 ? (this._wot || 0) + h : 0;
    if (this.gear < 0 || this._shiftLock > 0) return;
    const k = Math.abs(vLong) / CAR.wheelRadius * CAR.final * 9.5493;   // об/мин на единицу передаточного
    const g = CAR.gears, n = this.gear;
    const rpm = k * g[n - 1];
    // Вверх: чем больше газ, тем позже (чуть газа — 3000, в пол — 6700); газ
    // совсем бросили — передачу держим (торможение двигателем). Вниз накатом — только когда низшая передача дала бы меньше
    // 2200: между порогами вверх и вниз зазор в полторы тысячи оборотов и
    // больше, на ровном ходу коробка не «охотится».
    // пороги — от отсечки этой машины (7000 у M177, 6400 у M157)
    const up = Math.min(gas < 0.03 ? CAR.redline - 1100 : 2600 + 4100 * gas, CAR.redline - 150);
    // После любого переключения коробка 0.8 с ничего не решает.
    const LOCK = 0.8;
    if (n < g.length && rpm > up) {
      this.gear = n + 1; this._shiftT = CAR.shiftTime; this._shiftLock = LOCK;
      return;
    }
    // Кикдаун: газ в пол дольше 0.25 с и мотор ниже 4200 — вниз на столько
    // ступеней, чтобы обороты не перевалили за 5800.
    if (this._wot > 0.25 && rpm < 4200 && n > 1) {
      let m = n;
      while (m > 1 && k * g[m - 2] < CAR.redline - 1200) m--;
      if (m < n) { this.gear = m; this._shiftT = CAR.shiftTime * 0.7; this._shiftLock = LOCK; return; }
    }
    if (n > 1 && k * g[n - 2] < 2200) {
      this.gear = n - 1; this._shiftT = CAR.shiftTime * 0.7; this._shiftLock = LOCK;
    }
  }

  // Столкновения со стенами: три круга вдоль кузова. Удар — импульсом в точке
  // касания: гасится составляющая по нормали, вдоль стены машина скользит,
  // а удар в угол разворачивает кузов.
  _collide() {
    if (!this.collider) return;
    const R = this._R, p = this._p, v = this._v, w = this._w;
    const fl = Math.hypot(R[2], R[8]) || 1, fx = R[2] / fl, fz = R[8] / fl;
    const probe = this._tmp;
    let impact = 0;
    for (const s of [1.55, 0, -1.55]) {
      const rx = fx * (s - this._cgZ), rz = fz * (s - this._cgZ);
      probe.set(p[0] + rx, 0, p[2] + rz);
      const hit = this.collider.resolve(probe, 0.98);
      if (!hit) continue;
      p[0] = probe.x - rx; p[2] = probe.z - rz;
      const vx = v[0] + w[1] * rz, vz = v[2] - w[1] * rx;
      const vn = vx * hit.nx + vz * hit.nz;
      if (vn >= 0) continue;
      impact = Math.max(impact, -vn);
      const rn = rz * hit.nx - rx * hit.nz;
      const den = 1 / CAR.mass + rn * rn / CAR.inertiaYaw;
      const j = -(1 + 0.18) * vn / den;
      // трение о стену вдоль неё
      const tx = -hit.nz, tz = hit.nx;
      const vt = vx * tx + vz * tz, rt = rz * tx - rx * tz;
      const jt = clamp(-vt / (1 / CAR.mass + rt * rt / CAR.inertiaYaw), -0.25 * j, 0.25 * j);
      v[0] += (j * hit.nx + jt * tx) / CAR.mass; v[2] += (j * hit.nz + jt * tz) / CAR.mass;
      w[1] = clamp(w[1] + (j * rn + jt * rt) / CAR.inertiaYaw, -3.2, 3.2);
      this._hold = false;
    }
    if (impact > 3) this.crash = Math.max(this.crash, Math.min(1, impact / 20));
  }
}

// ------------------------------------------------------------------ модель
// КОНТРАКТ МОДЕЛИ (его ждут main.js и физика):
//   • начало координат группы — на дороге, под серединой колёсной базы;
//   • +Z — вперёд, +Y — вверх, +X — влево; единицы — метры;
//   • userData.wheels — четыре узла в порядке ПЛ, ПП, ЗЛ, ЗП, каждый стоит в
//     центре своего колеса: (±CAR.track/2, CAR.wheelRadius, ±CAR.wheelbase/2).
//     main.js каждый кадр ставит им высоту (ход подвески car.wheelDrop[i]),
//     поворот руля вокруг Y (car.steerVis) и прокрутку вокруг X (car.wheelSpin;
//     по каждому колесу отдельно есть car.wheelAngle[i]).
//
// Внешняя модель (E63 из GLB) подставляется через loadCarModel() ниже; другую
// модель — так же: кузов — любой Object3D,
// выставленный по контракту выше; колёса — четыре Object3D с осью вращения
// вдоль X и центром в нуле. В main.js достаточно заменить createCarMesh() на
// mountCarModel(body, [fl, fr, rl, rr]). Если у модели другие база, колея или
// радиус колеса — править CAR.wheelbase / track / wheelRadius: по ним же
// считается физика, и колёса встанут туда, где они касаются дороги.
export function mountCarModel(body, wheels) {
  const g = new THREE.Group();
  g.add(body);
  const hw = CAR.track / 2, hb = CAR.wheelbase / 2;
  const at = [[hw, hb], [-hw, hb], [hw, -hb], [-hw, -hb]];
  g.userData.wheels = at.map(([x, z], i) => {
    const node = new THREE.Group();
    node.add(wheels[i]);
    node.position.set(x, CAR.wheelRadius, z);
    g.add(node);
    return node;
  });
  return g;
}

// Настоящая модель: Mercedes-AMG E 63 S (W213), Mona x Supercars, CC BY 4.0
// (models/e63/ATTRIBUTION.md; подпись в HUD обязательна). В файле узлы body и
// wheel_FL/FR/RL/RR, метры, нос в +Z, ноль на земле под серединой базы; у
// колёс начало в центре. Центры колёс в файле стоят не на одной высоте
// (передние приподняты на 4 см — так была выставлена подвеска у автора), а
// мы их ставим туда, где колесо касается дороги, — по CAR.
// Лак без отражений. У сцены нет карты окружения, и лакированный кузов под
// одним солнцем выходит матово-бурым — так красят пластилин, а не машину.
// Даём отражения только машине: студийное окружение, свёрнутое в PMREM один
// раз. Городу его не даём — у домов своё освещение, и оно подобрано.
let carEnv = null;
function envFor(renderer) {
  if (!carEnv && renderer) {
    const pm = new THREE.PMREMGenerator(renderer);
    carEnv = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
  }
  return carEnv;
}

export function loadCarModel(url = '../data/models/e63.glb', renderer = null) {
  const v = document.querySelector('meta[name="build"]')?.content || '';
  return new GLTFLoader().loadAsync(url + (v ? '?v=' + v : '')).then(g => {
    const root = g.scene;
    const wheels = ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR'].map(n => root.getObjectByName(n));
    const body = root.getObjectByName('body');
    if (!body || wheels.some(w => !w)) throw new Error(url + ': нет узлов body / wheel_*');
    for (const w of wheels) { w.removeFromParent(); w.position.set(0, 0, 0); }
    body.removeFromParent();
    const car = mountCarModel(body, wheels);
    const env = envFor(renderer);
    car.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        if (!m.isMeshStandardMaterial) continue;
        if (env) { m.envMap = env; m.envMapIntensity = 0.9; }
        // кузов, двери и бамперы в файле — матовые (шероховатость 0.5–1):
        // лаку нужна гладкость, иначе отражения размазываются в серость
        if (/chassis|door|bump|hood|trunk|body_color/i.test(m.name)) { m.roughness = 0.22; m.metalness = 0.35; }
      }
    });
    return car;
  });
}

// Поза модели по состоянию машины: кузов — по крену и клевку, колёса — ход
// подвески, руль у передних, прокрутка у каждого своя (под ручником задние
// стоят). Годится и для модели из примитивов, и для GLB.
export function placeCarMesh(mesh, car) {
  mesh.position.copy(car.pos);
  mesh.rotation.set(0, 0, 0);
  mesh.rotateY(car.yaw);
  mesh.rotateX(car.pitch);
  mesh.rotateZ(car.roll);
  const ws = mesh.userData.wheels;
  if (!ws) return;
  for (let i = 0; i < ws.length && i < 4; i++) {
    ws[i].position.y = CAR.wheelRadius + car.wheelDrop[i];
    ws[i].rotation.set(0, i < 2 ? car.steerVis : 0, 0);
    ws[i].rotateX(car.wheelAngle[i]);
  }
}

// Модель из примитивов — запасная, пока грузится GLB.
export function createCarMesh() {
  // Кузов седана в пропорциях W213: длина 4.99, ширина 1.91, высота 1.46,
  // колёсная база 2.94, колея 1.62. Коробками такой силуэт не собрать —
  // строим ЛОФТОМ: задаём поперечные сечения по длине (полуширина низа,
  // полуширина плечей, низ и верх борта) и сшиваем соседние сечения. Отсюда
  // сами собой берутся сужение к бамперам, завал бортов и подрез порогов.
  const g = new THREE.Group();
  // Селенитовый серый: чёрная машина в тени сливается с асфальтом и
  // силуэт не читается — а он тут на экране всё время.
  const PAINT = 0x4b5058, DARK = 0x16181c, GLASS = 0x28323c;
  const paint = new THREE.MeshStandardMaterial({ color: PAINT, roughness: 0.28, metalness: 0.55 });
  const dark  = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.72, metalness: 0.15 });
  const glass = new THREE.MeshStandardMaterial({ color: GLASS, roughness: 0.08, metalness: 0.75 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.22, metalness: 0.9 });
  const lampW = new THREE.MeshStandardMaterial({ color: 0xdfe8f2, emissive: 0x9fb6d8, emissiveIntensity: 0.55, roughness: 0.25 });
  const lampR = new THREE.MeshStandardMaterial({ color: 0x8e1616, emissive: 0x6a0d0d, emissiveIntensity: 0.5, roughness: 0.3 });

  // Замкнутую оболочку легко сшить изнанкой наружу — тогда кузов виден
  // насквозь. Считаем ЗНАКОВЫЙ ОБЪЁМ: если он отрицательный, обход вывернут,
  // и все треугольники разворачиваются. Проверка не на глаз, а по числу.
  const finish = (P, I) => {
    let vol = 0;
    for (let i = 0; i < I.length; i += 3) {
      const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
      vol += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1])
            - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c])
            + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
    }
    if (vol < 0) for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setIndex(I);
    geo.computeVertexNormals();
    return geo;
  };

  // ---- сечения кузова: [z, полуширина порога, полуширина плеча, низ, верх]
  // z: +2.50 нос, −2.49 корма. Низ борта поднят у бамперов — там подрез.
  const S = [
    [ 2.50, 0.62, 0.80, 0.44, 0.86],
    [ 2.34, 0.74, 0.90, 0.32, 0.94],
    [ 2.05, 0.83, 0.955, 0.27, 1.00],
    [ 1.55, 0.86, 0.955, 0.24, 1.03],
    [ 0.95, 0.88, 0.955, 0.23, 1.05],
    [ 0.20, 0.88, 0.955, 0.23, 1.06],
    [-0.60, 0.88, 0.955, 0.23, 1.06],
    [-1.35, 0.86, 0.95, 0.24, 1.05],
    [-1.95, 0.82, 0.93, 0.27, 1.02],
    [-2.25, 0.74, 0.88, 0.33, 0.97],
    [-2.49, 0.60, 0.78, 0.45, 0.90],
  ];
  const bodyGeo = () => {
    const P = [], I = [];
    const ring = (sec) => {
      const [z, wl, ws, y0, y1] = sec;
      const ym = y0 + (y1 - y0) * 0.62;              // линия плеча
      // восемь точек по кругу сечения: низ, порог, плечо, верх — слева и справа
      return [
        [0, y0, z], [-wl, y0 + 0.05, z], [-ws, ym, z], [-ws * 0.93, y1, z],
        [0, y1 + 0.02, z], [ws * 0.93, y1, z], [ws, ym, z], [wl, y0 + 0.05, z],
      ];
    };
    const rings = S.map(ring);
    for (const r of rings) for (const v of r) P.push(v[0], v[1], v[2]);
    const N = 8;
    for (let i = 0; i < rings.length - 1; i++) {
      const a = i * N, b = (i + 1) * N;
      for (let k = 0; k < N; k++) {
        const k2 = (k + 1) % N;
        I.push(a + k, b + k, a + k2, a + k2, b + k, b + k2);
      }
    }
    // торцы: веером от центра сечения
    const cap = (idx, flip) => {
      const o = idx * N;
      for (let k = 1; k < N - 1; k++) {
        if (flip) I.push(o, o + k + 1, o + k); else I.push(o, o + k, o + k + 1);
      }
    };
    cap(0, false); cap(rings.length - 1, true);
    return finish(P, I);
  };
  const body = new THREE.Mesh(bodyGeo(), paint);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  // ---- теплица: лобовое, крыша, заднее. Крыша уходит назад покато, как у
  // купеобразного седана, и она уже кузова — отсюда «плечи».
  const C = [
    [ 1.10, 0.60, 1.06],   // низ лобового
    [ 0.55, 0.76, 1.38],
    [ 0.05, 0.80, 1.455],
    [-0.85, 0.80, 1.455],
    [-1.35, 0.75, 1.40],
    [-1.85, 0.62, 1.14],   // низ заднего стекла
  ];
  const cabinGeo = () => {
    const P = [], I = [];
    for (const [z, w, y] of C) {
      P.push(-w, 1.02, z, -w * 0.97, y, z, w * 0.97, y, z, w, 1.02, z);
    }
    for (let i = 0; i < C.length - 1; i++) {
      const a = i * 4, b = (i + 1) * 4;
      for (let k = 0; k < 3; k++) I.push(a + k, b + k, a + k + 1, a + k + 1, b + k, b + k + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setIndex(I);
    geo.computeVertexNormals();
    return geo;
  };
  // теплица — не замкнутая оболочка, знаковый объём тут не работает: рисуем
  // её с обеих сторон, иначе половина стёкол пропадает
  glass.side = THREE.DoubleSide;
  const cabin = new THREE.Mesh(cabinGeo(), glass);
  cabin.castShadow = true;
  g.add(cabin);
  // крыша поверх стекла — чтобы теплица не выглядела аквариумом
  const roof = new THREE.BoxGeometry(1.44, 0.06, 1.55);
  roof.translate(0, 1.47, -0.42);
  const roofM = new THREE.Mesh(roof, paint);
  roofM.castShadow = true; g.add(roofM);
  for (const sx of [-1, 1]) {                       // стойки крыши
    const a = new THREE.BoxGeometry(0.09, 0.55, 0.10);
    a.rotateX(-0.62); a.translate(sx * 0.74, 1.24, 0.86);
    g.add(new THREE.Mesh(a, dark));
    const c2 = new THREE.BoxGeometry(0.10, 0.50, 0.10);
    c2.rotateX(0.55); c2.translate(sx * 0.72, 1.26, -1.52);
    g.add(new THREE.Mesh(c2, dark));
  }

  // ---- расширенные арки и пороги
  for (const [z, r] of [[1.47, 0.44], [-1.47, 0.46]]) {
    for (const sx of [-1, 1]) {
      const arch = new THREE.TorusGeometry(r, 0.075, 6, 14, Math.PI);
      arch.rotateY(Math.PI / 2);
      arch.translate(sx * 0.905, 0.42, z);
      g.add(new THREE.Mesh(arch, dark));
    }
  }
  for (const sx of [-1, 1]) {
    const sill = new THREE.BoxGeometry(0.10, 0.16, 2.05);
    sill.translate(sx * 0.90, 0.24, 0);
    g.add(new THREE.Mesh(sill, dark));
  }

  // ---- решётка радиатора с вертикальными планками, фары, воздухозаборники
  const grille = new THREE.BoxGeometry(1.24, 0.42, 0.10);
  grille.translate(0, 0.66, 2.46);
  g.add(new THREE.Mesh(grille, dark));
  for (let i = 0; i < 11; i++) {
    const sl = new THREE.BoxGeometry(0.035, 0.36, 0.06);
    sl.translate(-0.55 + i * 0.11, 0.66, 2.50);
    g.add(new THREE.Mesh(sl, chrome));
  }
  const star = new THREE.CylinderGeometry(0.13, 0.13, 0.05, 12);
  star.rotateX(Math.PI / 2); star.translate(0, 0.66, 2.53);
  g.add(new THREE.Mesh(star, chrome));
  for (const sx of [-1, 1]) {
    const hl = new THREE.BoxGeometry(0.46, 0.15, 0.10);
    hl.rotateY(sx * 0.12); hl.translate(sx * 0.60, 0.80, 2.40);
    g.add(new THREE.Mesh(hl, lampW));
    const intake = new THREE.BoxGeometry(0.40, 0.16, 0.08);
    intake.translate(sx * 0.55, 0.36, 2.44);
    g.add(new THREE.Mesh(intake, dark));
    // задние фонари узкой полосой
    const tl = new THREE.BoxGeometry(0.50, 0.13, 0.09);
    tl.rotateY(-sx * 0.10); tl.translate(sx * 0.56, 0.86, -2.44);
    g.add(new THREE.Mesh(tl, lampR));
  }
  // диффузор и четыре круглых патрубка
  const diff = new THREE.BoxGeometry(1.35, 0.20, 0.12);
  diff.translate(0, 0.33, -2.42);
  g.add(new THREE.Mesh(diff, dark));
  for (const x of [-0.62, -0.44, 0.44, 0.62]) {
    const ex = new THREE.CylinderGeometry(0.065, 0.065, 0.16, 10);
    ex.rotateX(Math.PI / 2); ex.translate(x, 0.34, -2.47);
    g.add(new THREE.Mesh(ex, chrome));
  }
  // зеркала на ножке
  for (const sx of [-1, 1]) {
    const arm = new THREE.BoxGeometry(0.13, 0.05, 0.07);
    arm.translate(sx * 0.99, 1.06, 0.72);
    g.add(new THREE.Mesh(arm, dark));
    const cap2 = new THREE.BoxGeometry(0.22, 0.11, 0.12);
    cap2.rotateY(-sx * 0.22); cap2.translate(sx * 1.10, 1.07, 0.70);
    g.add(new THREE.Mesh(cap2, paint));
  }

  // ---- колёса: покрышка, обод и пятиспицевый диск
  const wheels = [];
  // места колёс — из тех же параметров, по которым считает физика
  const R = CAR.wheelRadius, W = 0.275;
  const hw = CAR.track / 2, hb = CAR.wheelbase / 2;
  for (const [x, z] of [[hw, hb], [-hw, hb], [hw, -hb], [-hw, -hb]]) {
    const w = new THREE.Group();
    const tyre = new THREE.CylinderGeometry(R, R, W, 18);
    tyre.rotateZ(Math.PI / 2);
    w.add(new THREE.Mesh(tyre, new THREE.MeshStandardMaterial({ color: 0x0e0f11, roughness: 0.92 })));
    const rim = new THREE.CylinderGeometry(R * 0.68, R * 0.68, W + 0.012, 16);
    rim.rotateZ(Math.PI / 2);
    w.add(new THREE.Mesh(rim, new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.35, metalness: 0.7 })));
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.BoxGeometry(W + 0.02, R * 1.15, 0.055);
      sp.rotateX(i / 5 * Math.PI);
      sp.translate(x > 0 ? 0.005 : -0.005, 0, 0);
      w.add(new THREE.Mesh(sp, new THREE.MeshStandardMaterial({ color: 0x3d4147, roughness: 0.3, metalness: 0.8 })));
    }
    const disc = new THREE.CylinderGeometry(R * 0.55, R * 0.55, W * 0.35, 14);
    disc.rotateZ(Math.PI / 2);
    w.add(new THREE.Mesh(disc, new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.5, metalness: 0.6 })));
    w.position.set(x, R, z);
    w.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.add(w); wheels.push(w);
  }
  g.userData.wheels = wheels;
  return g;
}
