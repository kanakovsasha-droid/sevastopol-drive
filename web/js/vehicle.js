import * as THREE from 'three';

// Модель машины. Была попытка считать силы на шинах через углы увода — она
// давала «честный» занос, но ездить стало нельзя: машину срывало в вращение
// на обычном повороте. Вернулись к первой модели — кинематический велосипед:
// угол руля напрямую задаёт скорость поворота, а занос живёт отдельной
// затухающей добавкой. Машина всегда едет туда, куда смотрит нос, срыв даёт
// только ручник. Всё, что нарабатывалось после (посадка на четыре колеса,
// подвеска, полёт, скольжение вдоль стены, высота полотна), оставлено.

const WHEELBASE = 2.65;
const MAX_STEER = 0.62;
// Тяга и сопротивление подобраны так, чтобы равновесие наступало около
// 58 м/с — это ~210 км/ч.
const ENGINE = 18.5;
const REVERSE = 7.0;
const BRAKE = 24;
const DRAG_AIR = 0.0019;
const DRAG_ROLL = 0.11;
const GRIP = 6.2;             // как быстро гаснет занос
const GRIP_HANDBRAKE = 1.1;   // с ручником задок живёт своей жизнью
// Полотно дороги рисуется на 0.14 м ВЫШЕ рельефа (ROAD_Y в worldgen), а колёса
// опрашивали голый рельеф — машина проваливалась в асфальт, а на переломах
// профиля кузов не совпадал с дорогой и повисал.
const ROAD_LIFT = 0.145;

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export class Car {
  constructor(terrain, collider) {
    this.terrain = terrain;
    this.collider = collider;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.vLong = 0;      // вдоль корпуса, м/с
    this.vLat = 0;       // влево от корпуса, м/с
    this.yawRate = 0;
    this.steer = 0;      // текущий угол руля
    this.pitch = 0;
    this.roll = 0;
    this.wheelSpin = 0;
    this.steerVis = 0;
    this.crash = 0;
    this.wheelDrop = [0, 0, 0, 0];   // ход подвески по каждому колесу
    this.vy = 0;         // вертикальная скорость: прыжки и съезды с бордюра
    this.airborne = false;
    this.inWater = false;
  }

  reset(x, z, yaw = 0) {
    this.pos.set(x, this.terrain.driveHeightAt(x, z) + ROAD_LIFT, z);
    this.yaw = yaw;
    this.vLong = 0; this.vLat = 0; this.yawRate = 0;
    this.steer = 0; this.crash = 0; this.vy = 0; this.airborne = false;
  }

  get speed() { return Math.hypot(this.vLong, this.vLat); }
  get kmh() { return this.vLong * 3.6; }
  get forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  update(dt, input) {
    dt = Math.min(dt, 1 / 25);
    const t = this.terrain;
    this.inWater = t.driveHeightAt(this.pos.x, this.pos.z) < 0.35;

    // уклон под колёсами: разница высот спереди и сзади
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const hF = t.driveHeightAt(this.pos.x + fx * 1.35, this.pos.z + fz * 1.35);
    const hR = t.driveHeightAt(this.pos.x - fx * 1.35, this.pos.z - fz * 1.35);
    const slopeAcc = -9.81 * clamp((hF - hR) / 2.7, -0.8, 0.8);

    // ---- продольная динамика
    let acc = 0;
    if (!this.airborne) {
      if (input.throttle > 0) acc += ENGINE * input.throttle * (1 - Math.min(0.72, Math.abs(this.vLong) / 82));
      if (input.throttle < 0) acc += this.vLong > 0.5 ? -BRAKE : REVERSE * input.throttle;
      if (input.handbrake) acc -= Math.sign(this.vLong) * BRAKE * 0.55;
    }
    acc += slopeAcc;
    acc -= DRAG_AIR * this.vLong * Math.abs(this.vLong) + DRAG_ROLL * this.vLong;
    if (this.inWater) acc -= this.vLong * 3.2;
    this._ax = acc;

    this.vLong += acc * dt;
    if (input.throttle === 0 && !input.handbrake && Math.abs(this.vLong) < 0.25) this.vLong = 0;
    if (this.inWater) this.vLong = clamp(this.vLong, -2.5, 2.5);

    // ---- руль: на скорости выкручивается меньше, иначе машина «ломается»
    const steerMax = MAX_STEER * (1 - 0.72 * Math.min(1, Math.abs(this.vLong) / 52));
    const steer = clamp(input.steer, -1, 1) * steerMax;
    this.steer = steer;
    this.steerVis += (steer - this.steerVis) * Math.min(1, dt * 11);

    // ---- поворот. Скорость рыскания задаёт РУЛЬ, а не момент сил на осях:
    // именно поэтому машина никогда не уходит в неуправляемое вращение.
    const yawRate = this.airborne ? this.yawRate * 0.98 : (this.vLong / WHEELBASE) * Math.tan(steer);
    this.yawRate = yawRate;
    this.yaw += yawRate * dt;

    // ---- занос: инерция тянет наружу поворота, шины сопротивляются
    const grip = input.handbrake ? GRIP_HANDBRAKE : GRIP;
    this.vLat += -yawRate * this.vLong * dt;
    this.vLat *= Math.exp(-grip * dt);
    this.vLat = clamp(this.vLat, -14, 14);

    const lx = Math.cos(this.yaw), lz = -Math.sin(this.yaw);      // влево
    this.pos.x += (fx * this.vLong + lx * this.vLat) * dt;
    this.pos.z += (fz * this.vLong + lz * this.vLat) * dt;

    this._collide(fx, fz, lx, lz);
    this._settle(fx, fz, lx, lz, dt);
    this.wheelSpin += this.vLong * dt / 0.33;
    this.crash *= Math.exp(-dt * 4);
  }

  // Столкновения. Раньше скорость просто множилась на коэффициент — машина
  // липла к стене и теряла ход вдоль неё. Теперь гасим только составляющую
  // ПО НОРМАЛИ, вдоль стены оставляем скольжение и добавляем момент отскока.
  _collide(fx, fz, lx, lz) {
    let impact = 0;
    for (const s of [1.55, 0, -1.55]) {
      const probe = new THREE.Vector3(this.pos.x + fx * s, 0, this.pos.z + fz * s);
      const hit = this.collider.resolve(probe, 0.98);
      if (!hit) continue;
      this.pos.x = probe.x - fx * s;
      this.pos.z = probe.z - fz * s;
      // мировая скорость -> нормаль
      const wx = fx * this.vLong + lx * this.vLat;
      const wz = fz * this.vLong + lz * this.vLat;
      const vn = wx * hit.nx + wz * hit.nz;
      if (vn < 0) {
        impact = Math.max(impact, -vn);
        const rest = 0.22;                       // немного отскока
        const nx2 = wx - vn * (1 + rest) * hit.nx;
        const nz2 = wz - vn * (1 + rest) * hit.nz;
        const slide = 0.86;                      // трение о стену вдоль неё
        this.vLong = (nx2 * fx + nz2 * fz) * slide;
        this.vLat = (nx2 * lx + nz2 * lz) * slide;
        // удар в угол разворачивает кузов
        this.yawRate = clamp(this.yawRate + (s > 0 ? -1 : s < 0 ? 1 : 0)
          * (hit.nx * lx + hit.nz * lz) * vn * 0.10, -2.6, 2.6);
      }
    }
    if (impact > 3) this.crash = Math.min(1, impact / 20);
  }

  // Посадка по четырём колёсам: одна точка давала провал кузова и рывки крена.
  _settle(fx, fz, lx, lz, dt) {
    const t = this.terrain;
    const WB = 1.32, TR = 0.86;
    let sum = 0; const wh = [];
    for (const [a, b] of [[WB, TR], [WB, -TR], [-WB, TR], [-WB, -TR]]) {
      const wx = this.pos.x + fx * a + lx * b, wz = this.pos.z + fz * a + lz * b;
      const hh = t.driveHeightAt(wx, wz) + ROAD_LIFT;
      wh.push(hh); sum += hh;
    }
    // Полёт. Раньше высота просто присваивалась по земле: сойдя с бордюра или
    // с обрыва, машина мгновенно телепортировалась вниз, а на трамплине
    // втыкалась в склон. Теперь есть вертикальная скорость: пока опора ниже
    // кузова, машина падает по тяжести; коснувшись — садится и гасит удар.
    const groundY = sum / 4;
    // Порог был 6 см — МЕНЬШЕ, чем отставание кузова от земли на спуске:
    // подвеска тянет тело к земле за конечное время, и на уклоне оно законно
    // висит выше на десяток сантиметров. Машина считала себя взлетевшей,
    // включала тяжесть и падала — отсюда 5.3% времени в воздухе и удары под
    // 276 g на спуске Котовского. Сорок сантиметров: столько отставание не
    // набирает, а настоящий трамплин набирает сразу.
    if (this.pos.y > groundY + 0.40) {
      this.airborne = true;
      this.vy -= 9.81 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= groundY) { this.pos.y = groundY; this.vy = 0; this.airborne = false; }
    } else {
      if (this.airborne && this.vy < -4) this.crash = Math.min(1, -this.vy / 16);
      // КУЗОВ НЕ ПРИКЛЕЕН К ЗЕМЛЕ. Раньше здесь стояло pos.y = groundY, и любая
      // ступенька профиля становилась телепортом: на спуске Котовского замер дал
      // 202 g вертикального удара и 23 удара сильнее 3 g на 330 метрах.
      // Тянемся к земле быстро, но за конечное время: ступенька в пять
      // сантиметров разбирается за четыре кадра — глазу мгновенно, а удар
      // размазывается. Отставание больше полуметра не копим: это уже не
      // ступенька, а обрыв, и туда надо падать.
      // Ни одного мгновенного скачка: даже большой разрыв закрывается за
      // несколько кадров. Раньше отставание больше полуметра закрывалось
      // ТЕЛЕПОРТОМ, и приземление после подскока давало удар в 280 g.
      const dy = groundY - this.pos.y;
      const step = Math.max(0.05, Math.abs(dy) * 0.30);
      this.pos.y += Math.sign(dy) * Math.min(Math.abs(dy), step);
      this.vy = 0; this.airborne = false;
    }
    // Знак: rotateX(+) в Three ОПУСКАЕТ нос (точка при z>0 уходит вниз на
    // -z*sin). Раньше сюда клали угол как есть, и на подъёме машина клевала
    // носом вниз, а на спуске задирала — колёса отрывались на любом уклоне.
    const tp = -Math.atan2((wh[0] + wh[1]) / 2 - (wh[2] + wh[3]) / 2, WB * 2);
    const tr = Math.atan2((wh[0] + wh[2]) / 2 - (wh[1] + wh[3]) / 2, TR * 2);
    // лёгкий клевок и крен от собственных ускорений, но так, чтобы кузов
    // не заваливало: ограничение в пару градусов
    const dyn = clamp((this._ax || 0) * 0.0035, -0.030, 0.030);
    const rollDyn = clamp(this.yawRate * this.vLong * 0.0022, -0.045, 0.045);
    // Наклон должен догонять землю почти мгновенно: при медленном сглаживании
    // кузов не успевал за переломом профиля, и колёса отрывались на треть метра.
    this.pitch += (clamp(tp, -0.45, 0.45) + dyn - this.pitch) * Math.min(1, dt * 26);
    this.roll += (clamp(tr, -0.35, 0.35) + rollDyn - this.roll) * Math.min(1, dt * 26);

    // НЕЗАВИСИМАЯ ПОДВЕСКА. Кузов — жёсткая плита, а земля под четырьмя точками
    // почти никогда не плоская: на седловине два колеса неизбежно повисают,
    // сколько ни подбирай высоту и наклон. Поэтому колёса ходят вертикально
    // сами: считаем, где оказалось колесо по плоскости кузова, и опускаем его
    // до земли. Ход ограничен, иначе на бордюре колесо уедет внутрь арки.
    const sp = Math.sin(this.pitch), sr = Math.sin(this.roll);
    for (let i = 0; i < 4; i++) {
      const a = i < 2 ? WB : -WB, b = (i % 2 === 0) ? TR : -TR;
      const planeY = this.pos.y - sp * a + sr * b;
      const want2 = wh[i] - planeY;                       // сколько не хватает до земли
      const tgt = clamp(want2, -0.40, 0.40);   // ход подвески
      this.wheelDrop[i] += (tgt - this.wheelDrop[i]) * Math.min(1, dt * 22);
    }
  }
}

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
  const R = 0.355, W = 0.275;
  for (const [x, z] of [[0.81, 1.47], [-0.81, 1.47], [0.81, -1.47], [-0.81, -1.47]]) {
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
