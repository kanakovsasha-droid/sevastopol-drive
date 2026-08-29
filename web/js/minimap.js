// Карта города. Один раз рисуем весь Севастополь в закадровый canvas,
// дальше миникарта и полноэкранная карта — это просто вырезки из него
// с поворотом. Перерисовывать 4218 улиц каждый кадр было бы расточительно.

const PX_PER_M = 0.42;          // разрешение закадровой карты

const COL = {
  land:   '#cfc8b8',
  sea:    '#254b5c',
  green:  '#7f9463',
  build:  '#a09684',
  road0:  '#f6f2e8',
  road2:  '#ece6d8',
  road3:  '#ddd6c6',
  path:   '#c6bda9',
  rail:   '#8d8474',
};

export function buildMap(world, terrain) {
  const b = world.meta.bounds;
  const W = Math.round((b.maxX - b.minX) * PX_PER_M);
  const H = Math.round((b.maxZ - b.minZ) * PX_PER_M);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const X = x => (x - b.minX) * PX_PER_M;
  const Z = z => (z - b.minZ) * PX_PER_M;

  g.fillStyle = COL.land; g.fillRect(0, 0, W, H);

  // море: по высотам, шагом 12 м
  g.fillStyle = COL.sea;
  const STEP = 12, sp = STEP * PX_PER_M + 1;
  for (let z = b.minZ; z < b.maxZ; z += STEP)
    for (let x = b.minX; x < b.maxX; x += STEP)
      if (terrain.gridHeightAt(x, z) < 0.4) g.fillRect(X(x), Z(z), sp, sp);

  const poly = (p, holes) => {
    g.beginPath();
    g.moveTo(X(p[0]), Z(p[1]));
    for (let i = 2; i < p.length; i += 2) g.lineTo(X(p[i]), Z(p[i + 1]));
    g.closePath();
    for (const h of holes || []) {
      g.moveTo(X(h[0]), Z(h[1]));
      for (let i = h.length - 2; i >= 0; i -= 2) g.lineTo(X(h[i]), Z(h[i + 1]));
      g.closePath();
    }
    g.fill('evenodd');
  };

  g.fillStyle = COL.green;
  for (const o of world.green) poly(o.poly, o.holes);

  // улицы: сначала широкие подложкой, потом узкие
  const line = (p, w, col) => {
    g.strokeStyle = col; g.lineWidth = Math.max(0.7, w * PX_PER_M);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(X(p[0]), Z(p[1]));
    for (let i = 2; i < p.length; i += 2) g.lineTo(X(p[i]), Z(p[i + 1]));
    g.stroke();
  };
  for (const r of world.rail) line(r.pts, 3, COL.rail);
  for (const r of world.roads) if (r.c === 4) line(r.pts, r.w, COL.path);
  for (const r of world.roads) if (r.c === 3) line(r.pts, r.w, COL.road3);
  for (const r of world.roads) if (r.c === 2) line(r.pts, r.w, COL.road2);
  for (const r of world.roads) if (r.c <= 1) line(r.pts, r.w + 1.5, COL.road0);

  g.fillStyle = COL.build;
  for (const o of world.buildings) poly(o.poly, o.holes);

  return { canvas: cv, W, H, minX: b.minX, minZ: b.minZ, X, Z };
}

// круглая миникарта в углу, повёрнутая по направлению движения
export function drawMini(ctx, map, px, pz, yaw, size, scaleM) {
  const r = size / 2;
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  ctx.beginPath(); ctx.arc(r, r, r - 2, 0, Math.PI * 2); ctx.clip();
  ctx.translate(r, r);
  // Курс в мире — это +(sin, cos), то есть на холсте (sin, cos) при оси Y вниз.
  // Чтобы он смотрел ВВЕРХ, полотно надо повернуть на yaw + пол-оборота:
  // при простом rotate(yaw) курс уезжал ровно вниз, карта была задом наперёд.
  ctx.rotate(yaw + Math.PI);
  const k = size / (scaleM * PX_PER_M);
  ctx.scale(k, k);
  ctx.translate(-map.X(px), -map.Z(pz));
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(map.canvas, 0, 0);
  ctx.restore();

  // рамка и стрелка игрока
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(r, r, r - 2, 0, Math.PI * 2); ctx.stroke();
  ctx.translate(r, r);
  ctx.fillStyle = '#e8b451';
  ctx.beginPath();
  ctx.moveTo(0, -8); ctx.lineTo(5.5, 7); ctx.lineTo(0, 4); ctx.lineTo(-5.5, 7);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// вся карта на весь экран
export function drawFull(ctx, map, w, h, px, pz, yaw, marks) {
  ctx.clearRect(0, 0, w, h);
  const k = Math.min(w / map.W, h / map.H) * 0.94;
  const ox = (w - map.W * k) / 2, oy = (h - map.H * k) / 2;
  ctx.save();
  ctx.translate(ox, oy); ctx.scale(k, k);
  ctx.drawImage(map.canvas, 0, 0);
  ctx.restore();

  const toS = (x, z) => [ox + map.X(x) * k, oy + map.Z(z) * k];
  ctx.font = '600 12px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  for (const m of marks || []) {
    const [sx, sy] = toS(m.x, m.z);
    ctx.fillStyle = 'rgba(20,24,28,.78)';
    const tw = ctx.measureText(m.name).width;
    ctx.fillRect(sx - tw / 2 - 5, sy - 22, tw + 10, 16);
    ctx.fillStyle = '#f2ede2';
    ctx.fillText(m.name, sx, sy - 10);
    ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#e8b451'; ctx.fill();
  }
  const [sx, sy] = toS(px, pz);
  ctx.save();
  // Стрелка нарисована остриём вверх (0,-11); чтобы остриё легло на курс
  // (sin yaw, cos yaw) на карте «север вверху», поворот равен π - yaw.
  ctx.translate(sx, sy); ctx.rotate(Math.PI - yaw);
  ctx.fillStyle = '#d1573f';
  ctx.beginPath();
  ctx.moveTo(0, -11); ctx.lineTo(7, 9); ctx.lineTo(0, 5); ctx.lineTo(-7, 9);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
}
