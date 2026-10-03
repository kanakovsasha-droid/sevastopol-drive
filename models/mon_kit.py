# Набор для памятников: фигуры людей из труб и эллипсоидов, постаменты, надписи.
# Надстройка над models/kit.py (kit.py не правится). Использование в build.py:
#     import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
#     from mon_kit import *
#     origin(X0, Z0); set_rot(угол)      # локальная ось +X памятника → компас-угол в градусах
#     ... геометрия в ЛОКАЛЬНЫХ координатах (x вперёд, y влево, z вверх, метры) ...
#     done('имя', __file__, X0, Z0, 'название')
#
# Локальная система: поворот вокруг вертикали на set_rot(a): локальная +X идёт в
# направлении a градусов от оси Blender X (мир: +x на восток, −z мира = север).
# Угол в мировых терминах: направление (dx, dz мира) → set_rot(deg(atan2(-dz, dx))).
import sys, os, math, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *
import kit

_A = [0.0]

def set_rot(deg):
    _A[0] = math.radians(deg)

def world_rot(dx, dz):
    """Угол set_rot для мирового направления (dx, dz): x — восток, z — юг."""
    return math.degrees(math.atan2(-dz, dx))

def P(x, y=0.0, z=0.0):
    """Локальная точка → Blender."""
    if isinstance(x, Vector) and y == 0.0 and z == 0.0:
        x, y, z = x.x, x.y, x.z
    c, s = math.cos(_A[0]), math.sin(_A[0])
    return Vector((x * c - y * s, x * s + y * c, z))

def Dv(x, y=0.0, z=0.0):
    """Локальное направление → Blender (без сдвига; то же, что P без начала)."""
    return P(x, y, z)

def FR(ox=0.0, oy=0.0, rot=0.0):
    """Рамка kit.Frame в локальных координатах: u — локальный +X, n — локальный +Y."""
    a = _A[0] + math.radians(rot)
    o = P(ox, oy)
    return Frame(Vector((o.x, o.y)), Vector((math.cos(a), math.sin(a))), Vector((-math.sin(a), math.cos(a))))

V = lambda x, y=0.0, z=0.0: Vector((x, y, z))

# ------------------------------------------------------------------ общие фигуры
def _loft_faces(m, rings, closed=True, cap0=True, cap1=True, smooth=True):
    bm = bm_of(m)
    vr = [[bm.verts.new(p) for p in ring] for ring in rings]
    cs = [sum(rg, Vector()) / len(rg) for rg in rings]
    n = len(rings[0])
    def mk(vs, hint):
        try:
            f = bm.faces.new(vs)
        except ValueError:
            return
        f.normal_update()
        if f.normal.dot(hint) < 0:
            f.normal_flip()
        f.smooth = smooth
    for i in range(len(rings) - 1):
        for k in range(n if closed else n - 1):
            j = (k + 1) % n
            vs = [vr[i][k], vr[i][j], vr[i + 1][j], vr[i + 1][k]]
            fc = sum((v.co for v in vs), Vector()) / 4
            c = (cs[i] + cs[i + 1]) / 2
            h = fc - c
            if len({tuple(round(x, 5) for x in v.co) for v in vs}) < 3:
                continue
            # вырожденные квадраты (полюс): оставим треугольник
            uniq = []
            for v in vs:
                if v not in uniq and all((v.co - u.co).length > 1e-6 for u in uniq):
                    uniq.append(v)
            mk(uniq, h)
    if closed:
        if cap0 and n >= 3:
            mk(vr[0], cs[0] - cs[1] if len(rings) > 1 else -UP)
        if cap1 and n >= 3:
            mk(vr[-1], cs[-1] - cs[-2] if len(rings) > 1 else UP)

def loft(m, rings, closed=True, cap0=True, cap1=True, smooth=True):
    """Оболочка по кольцам точек (локальные координаты)."""
    _loft_faces(m, [[P(p) for p in ring] for ring in rings], closed, cap0, cap1, smooth)

def _frames(pts):
    n = len(pts)
    ts = []
    for i in range(n):
        a = pts[max(i - 1, 0)]; b = pts[min(i + 1, n - 1)]
        t = (b - a)
        ts.append(t.normalized() if t.length > 1e-9 else UP)
    ref = UP if abs(ts[0].dot(UP)) < 0.95 else Vector((1, 0, 0))
    nrm = (ref - ts[0] * ref.dot(ts[0])).normalized()
    out = []
    for i in range(n):
        nn = nrm - ts[i] * nrm.dot(ts[i])
        nrm = nn.normalized() if nn.length > 1e-6 else nrm
        out.append((ts[i], nrm, ts[i].cross(nrm)))
    return out

def tube(m, pts, radii, seg=8, caps=(True, True), smooth=True, squash=1.0):
    """Труба вдоль ломаной с переменным радиусом (число или (rx, ry)). Локальные точки."""
    pts = [Vector(p) for p in pts]
    fr = _frames(pts)
    rings = []
    for p, (t, nn, bb), r in zip(pts, fr, radii):
        rx, ry = (r, r) if not isinstance(r, tuple) else r
        rings.append([p + nn * (rx * math.cos(2 * math.pi * k / seg)) + bb * (ry * squash * math.sin(2 * math.pi * k / seg))
                      for k in range(seg)])
    loft(m, rings, True, caps[0], caps[1], smooth)

def limb(m, a, b, r0, r1=None, seg=8, caps=(True, True)):
    """Конус/цилиндр между двумя точками."""
    r1 = r0 if r1 is None else r1
    tube(m, [Vector(a), Vector(b)], [r0, r1], seg, caps)

def blob(m, c, rx, ry, rz, axis=None, seg=10, rings=6, smooth=True, top=1.0, bot=1.0):
    """Эллипсоид; rz — полуось вдоль axis (по умолчанию вверх), rx — вдоль «вперёд» оси."""
    c = Vector(c)
    ax = (Vector(axis) if axis is not None else UP).normalized()
    ref = Vector((1, 0, 0)) if abs(ax.dot(Vector((1, 0, 0)))) < 0.95 else Vector((0, 1, 0))
    # «вперёд»: проекция локального +X, чтобы rx смотрел вперёд
    fw = Vector((1, 0, 0)) - ax * ax.x
    if fw.length < 1e-4:
        fw = Vector((0, 1, 0)) - ax * ax.y
    fw = fw.normalized(); lf = ax.cross(fw).normalized()
    rs = []
    for i in range(1, rings):
        a = math.pi * i / rings
        z = math.cos(a) * rz * (top if math.cos(a) > 0 else bot)
        rr = math.sin(a)
        rs.append([c + fw * (rx * rr * math.cos(2 * math.pi * k / seg)) + lf * (ry * rr * math.sin(2 * math.pi * k / seg)) + ax * z
                   for k in range(seg)])
    bm_rings = [[c + ax * (rz * top)]] + rs + [[c - ax * (rz * bot)]]
    # полюса — вырожденные кольца, соберём вручную
    bm = bm_of(m)
    top_v = bm.verts.new(P(c + ax * (rz * top))); bot_v = bm.verts.new(P(c - ax * (rz * bot)))
    vr = [[bm.verts.new(P(p)) for p in ring] for ring in rs]
    cc = P(c)
    def mk(vs):
        try:
            f = bm.faces.new(vs)
        except ValueError:
            return
        f.normal_update()
        fc = sum((v.co for v in vs), Vector()) / len(vs)
        if f.normal.dot(fc - cc) < 0: f.normal_flip()
        f.smooth = smooth
    for k in range(seg):
        j = (k + 1) % seg
        mk([top_v, vr[0][j], vr[0][k]])
        mk([bot_v, vr[-1][k], vr[-1][j]])
        for i in range(len(vr) - 1):
            mk([vr[i][k], vr[i][j], vr[i + 1][j], vr[i + 1][k]])

def ring_pts(c, ax_a, ax_b, ra, rb, seg=12, mod=None):
    """Эллиптическое кольцо; mod(θ) — множитель радиуса (складки)."""
    out = []
    for k in range(seg):
        th = 2 * math.pi * k / seg
        f = mod(th) if mod else 1.0
        out.append(Vector(c) + ax_a * (ra * f * math.cos(th)) + ax_b * (rb * f * math.sin(th)))
    return out

def skirt(m, rings, seg=12, smooth=True, caps=(False, False)):
    """Складчатая оболочка: rings = [(центр, радиус_x, радиус_y, mod), ...] в локальных координатах."""
    rs = []
    for c, ra, rb, mod in rings:
        rs.append(ring_pts(c, Vector((1, 0, 0)), Vector((0, 1, 0)), ra, rb, seg, mod))
    loft(m, rs, True, caps[0], caps[1], smooth)

# ------------------------------------------------------------------ человек
def ik2(a, b, l1, l2, pole):
    """Средний сустав (локоть/колено) двузвенной цепи от a до b; pole — куда гнётся."""
    a, b, pole = Vector(a), Vector(b), Vector(pole)
    d = b - a
    L = d.length
    L = min(L, l1 + l2 - 1e-4)
    d = d.normalized() * L
    x = (l1 * l1 - l2 * l2 + L * L) / (2 * L) if L > 1e-6 else 0
    h = math.sqrt(max(l1 * l1 - x * x, 0))
    dn = d.normalized()
    pp = pole - dn * pole.dot(dn)
    pp = pp.normalized() if pp.length > 1e-6 else Vector((0, 0, 1))
    return a + dn * x + pp * h

class Fig:
    """Фигура человека по скелету. H — рост стоя (ноги+голова), bulk — «толщина» одежды."""
    def __init__(self, H, face=(1, 0, 0), bulk=1.0, seg=8):
        self.H = H; self.face = Vector(face).normalized(); self.bulk = bulk; self.seg = seg
        self.U = H / 8.0                 # голова ≈ H/8 (монументальная пропорция ~1/7.5)

def person(m, fg, pel, neck, head, shL, shR, haL, haR, hipL, hipR, anL, anR, polesA=(None, None),
           polesL=(None, None), toe=(None, None), cloth=None, mt='wall3', mc=None, lean_face=None,
           head_kind='bare', torso_w=1.0, arm_r=1.0, leg_r=1.0, coat=None, shoes='shoe', head_r=1.0,
           neck_r=1.0, belly=1.0, leg_scale=1.0, arm_scale=1.0):
    """Строит человека. Все точки локальные. face — направление груди (горизонтальное)."""
    H = fg.H; s = fg.bulk
    pel, neck, head = Vector(pel), Vector(neck), Vector(head)
    shL, shR, haL, haR = Vector(shL), Vector(shR), Vector(haL), Vector(haR)
    hipL, hipR, anL, anR = Vector(hipL), Vector(hipR), Vector(anL), Vector(anR)
    sp = (neck - pel); spd = sp.normalized()
    f = fg.face - spd * fg.face.dot(spd); f.normalize()
    lat = spd.cross(f).normalized()     # влево от фигуры
    # торс: кольца от таза к плечам
    def rr(t, wx, wy):
        c = pel + sp * t
        return ring_pts(c, lat, f, wx * H * s * torso_w, wy * H * s * belly, fg.seg + 2)
    tor = [rr(0.0, 0.098, 0.062), rr(0.30, 0.090, 0.060), rr(0.62, 0.108, 0.072), rr(0.88, 0.128, 0.072), rr(1.0, 0.060, 0.050)]
    loft(m, tor, True, True, True, True)
    # шея и голова
    limb(m, neck - spd * 0.01 * H, head - spd * 0.03 * H, 0.030 * H * neck_r, 0.028 * H * neck_r, 8)
    _head(m, fg, head, f, lat, head_kind, head_r, mt, mc)
    J = {}
    # руки
    for sh, ha, pole, sgn in ((shL, haL, polesA[0], 1), (shR, haR, polesA[1], -1)):
        pole = Vector(pole) if pole is not None else (-f * 0.3 - UP * 0.6 + lat * sgn * 0.6)
        sh2 = sh
        el = ik2(sh2, ha, 0.168 * H * arm_scale, 0.150 * H * arm_scale, sh2 + pole * 10)
        tube(m, [sh2, el, ha], [0.040 * H * arm_r * s, 0.034 * H * arm_r * s, 0.024 * H * arm_r * s], fg.seg)
        blob(m, ha + (ha - el).normalized() * 0.02 * H, 0.032 * H, 0.026 * H, 0.04 * H, axis=(ha - el), seg=6, rings=3)
        J['el%d' % sgn] = el
        blob(m, sh2, 0.050 * H * s, 0.050 * H * s, 0.050 * H * s, seg=6, rings=3)
    # ноги
    for hp, an, pole, tp, sgn in ((hipL, anL, polesL[0], toe[0], 1), (hipR, anR, polesL[1], toe[1], -1)):
        pole = Vector(pole) if pole is not None else f
        kn = ik2(hp, an, 0.245 * H * leg_scale, 0.246 * H * leg_scale, hp + pole * 10)
        tube(m, [hp, kn, an], [0.062 * H * leg_r * s, 0.050 * H * leg_r * s, 0.034 * H * leg_r * s], fg.seg)
        tp = Vector(tp) if tp is not None else (an + f * 0.10 * H - UP * 0.0)
        _foot(m, an, tp, H, shoes)
        J['kn%d' % sgn] = kn
    J['f'] = f; J['lat'] = lat
    return J

def _head(m, fg, c, f, lat, kind, hr, mt, mc):
    H = fg.H
    mc = mc or mt
    ax = UP
    r = 0.062 * H * hr
    blob(m, c, 0.074 * H * hr, 0.060 * H * hr, 0.082 * H * hr, axis=(0, 0, 1), seg=8, rings=5)
    # лицо смотрит вдоль f: развернём эллипсоид — blob смотрит вдоль локальной X, поэтому для f≠X добавим нос
    nose = c + f * (0.070 * H * hr) - UP * 0.004 * H
    blob(m, nose, 0.012 * H, 0.010 * H, 0.016 * H, seg=5, rings=2)
    if kind == 'helmet':      # каска: купол + козырёк
        blob(m, c + UP * 0.012 * H, 0.090 * H * hr, 0.083 * H * hr, 0.082 * H * hr, seg=12, rings=6, bot=0.35)
        limb(m, c + UP * 0.002 * H + f * 0.02 * H, c + UP * 0.002 * H + f * 0.095 * H, 0.0, 0.0, 4)
    elif kind == 'cap':       # бескозырка
        blob(m, c + UP * 0.040 * H, 0.100 * H * hr, 0.095 * H * hr, 0.040 * H, seg=12, rings=4, bot=0.5)
        tube(m, [c + UP * 0.030 * H, c + UP * 0.040 * H], [0.088 * H * hr, 0.094 * H * hr], 12)
    elif kind == 'hair':
        blob(m, c + UP * 0.012 * H - f * 0.012 * H, 0.080 * H * hr, 0.068 * H * hr, 0.082 * H * hr, seg=10, rings=5, bot=0.3)

def _foot(m, an, tp, H, kind):
    d = Vector(tp) - an
    d.z = 0
    if d.length < 1e-4: d = Vector((1, 0, 0))
    d.normalize()
    c = an + d * 0.045 * H - UP * 0.030 * H
    blob(m, c, 0.040 * H, 0.036 * H, 0.100 * H, axis=d, seg=6, rings=3)
    blob(m, an - UP * 0.005 * H - d * 0.004 * H, 0.040 * H, 0.040 * H, 0.050 * H, seg=6, rings=2)

# ------------------------------------------------------------------ постаменты и надписи
def plate(m, F, u0, u1, d, z0, z1, lines=4, pitch=None, seed=1, mat='metal', pr=0.015, margin=0.12):
    """Плита с надписью: гладкое поле и ряды выступающих «строк»."""
    import random
    rnd = random.Random(seed)
    box(mat, F, u0, u1, d, d + pr, z0, z1)
    hh = (z1 - z0)
    row = hh * (1 - 2 * margin) / lines
    for i in range(lines):
        zc = z1 - hh * margin - row * (i + 0.5)
        ww = (u1 - u0) * (1 - 2 * margin) * (rnd.uniform(0.55, 1.0) if i else 0.7)
        uc = (u0 + u1) / 2
        box(mat, F, uc - ww / 2, uc + ww / 2, d + pr, d + pr * 2.2, zc - row * 0.2, zc + row * 0.2, bottom=False)

def steps(m, F, u0, u1, d0, z0, n, rise, run, mat='stone', down=3.0):
    """Лестница вниз от верхней отметки z0 в сторону +d (от d0)."""
    for i in range(n):
        top = z0 - rise * i
        box(mat, F, u0, u1, d0 + run * i, d0 + run * (i + 1), top - rise - (down if i == n - 1 else 0), top)

def octa(m, F, cu, cd, r, z0, z1, taper=1.0, rot=22.5, mat='stone'):
    """Восьмигранный (или n-гранный) усечённый столб: r — радиус внизу, taper — доля радиуса вверху."""
    n = 8
    def ring(rad, z): return [F.p(cu + rad * math.cos(math.radians(rot) + 2 * math.pi * k / n),
                                  cd + rad * math.sin(math.radians(rot) + 2 * math.pi * k / n), z) for k in range(n)]
    bm = bm_of(mat)
    a, b = ring(r, z0), ring(r * taper, z1)
    c = F.p(cu, cd, (z0 + z1) / 2)
    for k in range(n):
        j = (k + 1) % n
        q = [a[k], a[j], b[j], b[k]]
        face(mat, q, sum(q, Vector()) / 4 - c)
    face(mat, b, UP)
    face(mat, a, -UP)

def frustum(m, F, bot, top, z0, z1, cap=True, base=False):
    """Усечённая пирамида: bot/top = (u0, u1, d0, d1) в рамке F на отметках z0 и z1."""
    def rect(r, z): return [F.p(r[0], r[2], z), F.p(r[1], r[2], z), F.p(r[1], r[3], z), F.p(r[0], r[3], z)]
    a, b = rect(bot, z0), rect(top, z1)
    c = sum(a + b, Vector()) / 8
    for i in range(4):
        j = (i + 1) % 4
        q = [a[i], a[j], b[j], b[i]]
        face(m, q, sum(q, Vector()) / 4 - c)
    if cap: face(m, b, UP)
    if base: face(m, a, -UP)

def slab_poly(m, F, pts, z0, z1, top=True, bottom=True):
    """Призма по многоугольнику в плане (u, d)."""
    prism_plan(m, F, pts, z0, z1, top)
    if bottom:
        face(m, [F.p(u, d, z0) for u, d in pts], -UP)

def star(m, F, cu, cd, R, r, z0, z1):
    pts = []
    for k in range(10):
        a = math.pi / 2 + k * math.pi / 5
        rr = R if k % 2 == 0 else r
        pts.append((cu + rr * math.cos(a), cd + rr * math.sin(a)))
    prism_plan(m, F, pts, z0, z1, True)

def bust(m, z, k=1.0, hat=None, hair=True, epaulets=True, cx=0.0, cy=0.0):
    """Бюст (грудь, голова) на отметке z, лицо в локальный +X; k — масштаб (k=1 ≈ 1,1 м высотой)."""
    rings = [(0.0, 0.46, 0.26), (0.14, 0.52, 0.27), (0.30, 0.50, 0.24), (0.40, 0.32, 0.18), (0.50, 0.14, 0.13), (0.58, 0.12, 0.12)]
    rs = [ring_pts(Vector((cx, cy, z + dz * k)), Vector((1, 0, 0)), Vector((0, 1, 0)), rx * k, ry * k, 14) for dz, ry, rx in rings]
    loft(m, rs, True, True, True, True)
    blob(m, Vector((cx + 0.04 * k, cy, z + 0.78 * k)), 0.17 * k, 0.14 * k, 0.22 * k, seg=10, rings=6)
    blob(m, Vector((cx + 0.19 * k, cy, z + 0.74 * k)), 0.04 * k, 0.035 * k, 0.06 * k, seg=6, rings=3)
    if hair:
        blob(m, Vector((cx - 0.04 * k, cy, z + 0.84 * k)), 0.17 * k, 0.16 * k, 0.17 * k, seg=8, rings=4, bot=0.3)
    if hat == 'cap':
        blob(m, Vector((cx, cy, z + 0.95 * k)), 0.22 * k, 0.21 * k, 0.1 * k, seg=10, rings=4, bot=0.6)
        tube(m, [Vector((cx, cy, z + 0.93 * k)), Vector((cx, cy, z + 0.97 * k))], [0.21 * k, 0.215 * k], 10)
    if epaulets:
        for s_ in (-1, 1):
            blob(m, Vector((cx, cy + s_ * 0.44 * k, z + 0.36 * k)), 0.14 * k, 0.07 * k, 0.03 * k, seg=8, rings=3)

def anchor(m, base, h=1.6, rot=0.0, lean=0.0):
    """Адмиралтейский якорь: веретено, шток, лапы. base — нижняя точка веретена; rot — поворот вокруг вертикали (рад)."""
    c, s = math.cos(rot), math.sin(rot)
    def T(x, y, z):
        xr = x * math.cos(lean) - z * math.sin(lean)
        zr = x * math.sin(lean) + z * math.cos(lean)
        return Vector((base[0] + xr * c - y * s, base[1] + xr * s + y * c, base[2] + zr))
    tube(m, [T(0, 0, 0), T(0, 0, h)], [0.07, 0.06], 6)
    tube(m, [T(0, -h * 0.35, h * 0.9), T(0, h * 0.35, h * 0.9)], [0.045, 0.045], 6)
    for sg in (-1, 1):
        tube(m, [T(0, 0, 0.02), T(0, sg * h * 0.22, 0.04 * h), T(0, sg * h * 0.38, h * 0.2)], [0.06, 0.05, 0.05], 6)
    tube(m, [T(0, 0, h), T(0, 0, h + 0.12)], [0.09, 0.09], 6)

# ------------------------------------------------------------------ сдача
def _count(bm):
    return sum(len(f.verts) - 2 for f in bm.faces)

def done(name, script, x, z, title, skip=None, tri_budget=25000):
    tris = sum(_count(bm) for bm in BM.values())
    lod = sum(_count(bm) for k, bm in BM.items() if k in kit.LOD_KEEP)
    here = os.path.dirname(os.path.abspath(script))
    finish(name, script, tri_budget)
    if lod > 5000:
        print('ПРЕВЫШЕН БЮДЖЕТ ДАЛЬНЕГО УРОВНЯ', lod)
    pl = {'name': title, 'file': name + '.glb', 'ox': kit._O[0], 'oz': kit._O[1], 'x': x, 'z': z,
          'skip': skip or [], 'tris': tris, 'trisLod': lod}
    with open(os.path.join(here, 'placement.json'), 'w') as fh:
        fh.write(json.dumps(pl, ensure_ascii=False, indent=1))
    print('PLACEMENT', json.dumps(pl, ensure_ascii=False))
