# Собор Покрова Пресвятой Богородицы (Покровский собор), Большая Морская, 36 — модель с нуля.
#
#   blender -b --python models/pokrovsky_sobor/build.py -- [glb]
#
# План — контур OSM way w166878773 (он состоит из прямоугольников, повёрнутых на ~16° от осей мира),
# фасады и силуэт — по фото с Викисклада (refs/) и панораме Яндекса. Подробности — в NOTES.md.
# Ноль высоты — тротуар у главного (восточного) портала на Большой Морской.
#
# Локальная система плана: u — «восток» (к улице), v — «юг» (z мира растёт на юг), начало (0,0) =
# (-264.9, 1262.2) мира. Все размеры ниже — в этих u, v и в метрах высоты.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# ---- материалы: стены — кремовый камень; roof — золото; wall2 — тёмная жесть крыш; wall3 — охристая жесть
COL['wall'] = ((0.90, 0.86, 0.72), 0.9)
COL['trim'] = ((0.97, 0.95, 0.89), 0.85)
COL['stone'] = ((0.74, 0.70, 0.60), 0.92)
COL['roof'] = ((0.90, 0.72, 0.27), 0.3)
COL['wall2'] = ((0.27, 0.29, 0.33), 0.7)
COL['wall3'] = ((0.78, 0.53, 0.09), 0.55)
COL['glass'] = ((0.10, 0.12, 0.17), 0.2)
COL['wood'] = ((0.22, 0.12, 0.08), 0.6)
COL['metal'] = ((0.70, 0.52, 0.14), 0.4)         # золочёные кресты

LOCW = (-264.9, 1262.2)                       # мировые координаты начала локальных (u, v)
_e = Vector((17.1, -4.8)).normalized()        # ось u в мире (вдоль длинной стороны контура)
_ox, _oz = 11.8, 0.8                          # портал на уровне земли, локально
# ось v в мире — (0.270, 0.963) = (-e.y, e.x)
_s = Vector((-_e.y, _e.x))
X0 = LOCW[0] + _e.x * _ox + _s.x * _oz
Z0 = LOCW[1] + _e.y * _ox + _s.y * _oz
origin(X0, Z0)

LO = W(*LOCW)
e_b = Vector((_e.x, -_e.y))                  # u в плоскости Blender
s_b = Vector((e_b.y, -e_b.x))                # v в плоскости Blender
PF = Frame(LO, e_b, s_b)

def P(u, v):
    return LO + e_b * u + s_b * v

def pt(u, v, z):
    p = P(u, v)
    return Vector((p.x, p.y, z))

def perp(n):
    return Vector((-n.y, n.x))

def blk(u0, u1, v0, v1, z0, z1, m='wall', bottom=False):
    box(m, PF, u0, u1, v0, v1, z0, z1, bottom)

GR = -3.0                 # стены уходят под землю
ZC = 16.4                 # карниз центрального куба
CU, CV = 0.2, -1.4        # центр куба и главы
HC = (CU, CV)

class Fc:
    """Фасад: сторона света, плоскость k, диапазон плана lo..hi вдоль фасада. a(x) — координата вдоль."""
    def __init__(s, side, k, lo, hi):
        s.side, s.k, s.lo, s.hi, s.L = side, k, lo, hi, hi - lo
        if side == 'E':
            s.F = Frame(P(k, hi), perp(e_b), e_b); s.A = lambda x: hi - x
        elif side == 'W':
            s.F = Frame(P(k, lo), perp(-e_b), -e_b); s.A = lambda x: x - lo
        elif side == 'S':
            s.F = Frame(P(lo, k), perp(s_b), s_b); s.A = lambda x: x - lo
        else:
            s.F = Frame(P(hi, k), perp(-s_b), -s_b); s.A = lambda x: hi - x

# ================================================================== мелкие формы
def arc_pts(a, zs, r, n=6):
    return [(a + r * math.cos(math.pi * k / n), zs + r * math.sin(math.pi * k / n)) for k in range(n + 1)]

def awin(F, a, za, w, h, d, mat='glass', frame=True, bars=True, n=6, halo=False):
    """Арочное окно (плоское): стекло, рамка-наличник, импост и крест решётки."""
    r = w / 2
    zs = za + h - r
    arc = arc_pts(a, zs, r, n)
    face(mat, [F.p(a - r, d + 0.02, za), F.p(a + r, d + 0.02, za)] + [F.p(u, d + 0.02, z) for u, z in arc], F.N())
    if halo:
        zc = zs - 0.1
        face('roof', [F.p(a + 0.55 * r * math.cos(2 * math.pi * k / 8), d + 0.03, zc + 0.55 * r * math.sin(2 * math.pi * k / 8)) for k in range(8)], F.N())
    if not frame:
        return
    t = 0.2
    q = d + 0.05
    face('trim', [F.p(a - r - t, q, za - 0.1), F.p(a - r, q, za - 0.1), F.p(a - r, q, zs), F.p(a - r - t, q, zs)], F.N())
    face('trim', [F.p(a + r, q, za - 0.1), F.p(a + r + t, q, za - 0.1), F.p(a + r + t, q, zs), F.p(a + r, q, zs)], F.N())
    ro = r + t
    for k in range(n):
        a0, a1 = math.pi * k / n, math.pi * (k + 1) / n
        face('trim', [F.p(a + r * math.cos(a0), q, zs + r * math.sin(a0)), F.p(a + ro * math.cos(a0), q, zs + ro * math.sin(a0)),
                      F.p(a + ro * math.cos(a1), q, zs + ro * math.sin(a1)), F.p(a + r * math.cos(a1), q, zs + r * math.sin(a1))], F.N())
    box('trim', F, a - r - t - 0.06, a + r + t + 0.06, d, d + 0.12, za - 0.2, za - 0.08)       # подоконник
    if bars:
        face('trim', [F.p(a - 0.03, q, za), F.p(a + 0.03, q, za), F.p(a + 0.03, q, zs + r), F.p(a - 0.03, q, zs + r)], F.N())
        zz = za + h * 0.45
        face('trim', [F.p(a - r, q, zz - 0.03), F.p(a + r, q, zz - 0.03), F.p(a + r, q, zz + 0.03), F.p(a - r, q, zz + 0.03)], F.N())

def kok(F, a, d, z, w, h, depth=0.32, m='trim'):
    """Кокошник: килевидная арка-накладка."""
    pts = [(a + w / 2 * math.cos(math.pi * (1 - k / 6)), z + h * math.sin(math.pi * (1 - k / 6)) ** 0.85) for k in range(7)]
    prism_uz(m, F, pts, d, d + depth)

def kok_ring(cx, cy, r, n, z, w, h, phase=0.5, depth=0.32, m='trim'):
    for k in range(n):
        ang = 2 * math.pi * (k + phase) / n
        nn = Vector((math.cos(ang), math.sin(ang)))
        F = Frame(Vector((cx, cy)) + nn * r, perp(nn), nn)
        kok(F, 0, -0.1, z, w, h, depth, m)

def zak(F, a, z0, rx, rz, d, back=0.5, ring=True):
    """Закомара: полуэллиптический щипец стены с лепным рамочным обрамлением."""
    n = 12
    pts = [(a - rx, z0 - 0.05), (a + rx, z0 - 0.05)] + [(a + rx * math.cos(math.pi * k / n), z0 + rz * math.sin(math.pi * k / n)) for k in range(n + 1)]
    prism_uz('wall', F, pts, d - back, d)
    if ring:
        for rr0, rr1, pr in ((0.0, 0.30, 0.16), (0.30, 0.55, 0.10)):
            for k in range(n):
                a0, a1 = math.pi * k / n, math.pi * (k + 1) / n
                P0 = lambda t, rr: (a + (rx + rr) * math.cos(t), z0 + (rz + rr) * math.sin(t))
                q = [P0(a0, rr0), P0(a1, rr0), P0(a1, rr1), P0(a0, rr1)]
                face('trim', [F.p(u, d + pr, z) for u, z in q], F.N())
                # торец рамки
                q2 = [P0(a0, rr1), P0(a1, rr1)]
                face('trim', [F.p(q2[0][0], d, q2[0][1]), F.p(q2[1][0], d, q2[1][1]), F.p(q2[1][0], d + pr, q2[1][1]), F.p(q2[0][0], d + pr, q2[0][1])],
                     F.p(P0((a0 + a1) / 2, 1.0)[0], d, P0((a0 + a1) / 2, 1.0)[1]) - F.p(a, d, z0))

def band_blocks(F, a0, a1, d, z0, z1, step=0.9, bw=0.45, pr=0.1):
    """Лепной фриз: полоса с рядом выступающих плиток."""
    box('trim', F, a0, a1, d, d + 0.05, z0, z1)
    a = a0 + step * 0.5
    while a + bw / 2 < a1:
        box('trim', F, a - bw / 2, a + bw / 2, d, d + pr, z0 + 0.12, z1 - 0.12)
        a += step

def lesenes(F, L, d, z0, z1, w=0.5, pr=0.14, pitch=None):
    for a in ([w / 2, L - w / 2] if not pitch else [w / 2 + i * pitch for i in range(int(L / pitch) + 1)] + [L - w / 2]):
        box('trim', F, a - w / 2, a + w / 2, d, d + pr, z0, z1)
        box('trim', F, a - w / 2 - 0.05, a + w / 2 + 0.05, d, d + pr + 0.05, z1 - 0.25, z1)

def onion(cx, cy, z0, rmax, h, seg=12, m='roof'):
    T = [(0.30, 0), (0.62, 0.06), (0.92, 0.16), (1.0, 0.28), (0.95, 0.40), (0.78, 0.52), (0.55, 0.64), (0.32, 0.77), (0.14, 0.89), (0.025, 1.0)]
    lathe(m, Vector((cx, cy, 0)), [(r * rmax, z0 + t * h) for r, t in T], seg, cap=False)

def tent(cx, cy, z0, r0, h, seg=12, m='roof'):
    n = 6
    prof = [(r0 * (1 - (i / n)) ** 1.12 + 0.04 * (1 - i / n), z0 + h * i / n) for i in range(n)] + [(0.04, z0 + h)]
    lathe(m, Vector((cx, cy, 0)), prof, seg, cap=False)

def cross(cx, cy, z0, h=2.4):
    c = Vector((cx, cy, z0))
    beam('metal', c, c + UP * h, 0.11)
    beam('metal', c + UP * h * 0.62 - Vector((0.42, 0, 0)), c + UP * h * 0.62 + Vector((0.42, 0, 0)), 0.08)
    beam('metal', c + UP * h * 0.80 - Vector((0.28, 0, 0)), c + UP * h * 0.80 + Vector((0.28, 0, 0)), 0.07)

def cyl(m, cx, cy, r, z0, z1, seg=16):
    lathe(m, Vector((cx, cy, 0)), [(r, z0), (r, z1)], seg, cap=True)

def gable(u0, u1, v0, v1, z, rise, ridge, m='wall2', ov=(0.4, 0.4), ev=0.5, end_ov=0.0):
    """Двускатная кровля над прямоугольником плана; ridge 'u' или 'v'. Торцы закрыты стеной (m_end='wall')."""
    if ridge == 'u':
        half = (v1 - v0) / 2; vm = (v0 + v1) / 2; sl = rise / half; zl = z - sl * ev
        a, b = u0 - ov[0], u1 + ov[1]; c, e = v0 - ev, v1 + ev
        face(m, [pt(a, c, zl), pt(b, c, zl), pt(b, vm, z + rise), pt(a, vm, z + rise)], -Vector((s_b.x, s_b.y, 0)) + UP)
        face(m, [pt(a, e, zl), pt(b, e, zl), pt(b, vm, z + rise), pt(a, vm, z + rise)], Vector((s_b.x, s_b.y, 0)) + UP)
        for uu, sg in ((u0, -1), (u1, 1)):
            face('wall', [pt(uu, v0, z - 0.05), pt(uu, v1, z - 0.05), pt(uu, vm, z + rise)], Vector((e_b.x * sg, e_b.y * sg, 0)))
        beam('trim', pt(a, vm, z + rise + 0.03), pt(b, vm, z + rise + 0.03), 0.22, 0.12)
    else:
        half = (u1 - u0) / 2; um = (u0 + u1) / 2; sl = rise / half; zl = z - sl * ev
        a, b = v0 - ov[0], v1 + ov[1]; c, e = u0 - ev, u1 + ev
        face(m, [pt(c, a, zl), pt(c, b, zl), pt(um, b, z + rise), pt(um, a, z + rise)], -Vector((e_b.x, e_b.y, 0)) + UP)
        face(m, [pt(e, a, zl), pt(e, b, zl), pt(um, b, z + rise), pt(um, a, z + rise)], Vector((e_b.x, e_b.y, 0)) + UP)
        for vv, sg in ((v0, -1), (v1, 1)):
            face('wall', [pt(u0, vv, z - 0.05), pt(u1, vv, z - 0.05), pt(um, vv, z + rise)], Vector((s_b.x * sg, s_b.y * sg, 0)))
        beam('trim', pt(um, a, z + rise + 0.03), pt(um, b, z + rise + 0.03), 0.22, 0.12)

def plinth(fc, z=1.3):
    F = fc.F
    box('stone', F, -0.15, fc.L + 0.15, -0.28, 0.18, GR, z - 0.18)
    box('trim', F, -0.2, fc.L + 0.2, -0.28, 0.26, z - 0.18, z)

def row_win(fc, xs, za, w, h, d=0.0, **kw):
    for x in xs:
        awin(fc.F, fc.A(x), za, w, h, d, **kw)

# ================================================================== ОСНОВНЫЕ ОБЪЁМЫ
UN, US = -8.9, 6.1                  # северная и южная стены трапезной/куба
UW, UE = -26.1, 8.4

# ---- западный объём (трапезная) и кровля
def nave():
    blk(UW, -6.0, UN, US, GR, 9.0)
    gable(UW, -6.0, UN, US, 9.0, 3.3, 'u', ov=(0.35, 0.0), ev=0.55)
    # южный фасад
    fs = Fc('S', US, UW, -13.0)
    plinth(fs)
    cornice(fs.F, 0, fs.L, 0, 8.4, ext=0.5)
    lesenes(fs.F, fs.L, 0, 1.3, 8.4)
    xs = [-23.7, -20.6, -17.5, -14.6]
    row_win(fs, xs, 1.9, 1.3, 3.2)
    row_win(fs, xs, 5.5, 1.0, 2.2)
    band(fs.F, 0, fs.L, 0, 4.85, 5.1, 0.1)
    # северный фасад
    fn = Fc('N', UN, UW, -8.3)
    plinth(fn)
    cornice(fn.F, 0, fn.L, 0, 8.4, ext=0.5)
    lesenes(fn.F, fn.L, 0, 1.3, 8.4)
    xs = [-23.7, -20.6, -17.5, -14.6, -11.3]
    row_win(fn, xs, 1.9, 1.3, 3.2)
    row_win(fn, xs, 5.5, 1.0, 2.2)
    band(fn.F, 0, fn.L, 0, 4.85, 5.1, 0.1)
    # западный фасад с закомарой
    fw = Fc('W', UW, UN, US)
    plinth(fw)
    cornice(fw.F, 0, fw.L, 0, 8.4, ext=0.5)
    lesenes(fw.F, fw.L, 0, 1.3, 8.4)
    for x in (-5.0, -1.4, 2.2):
        awin(fw.F, fw.A(x), 2.2, 1.5, 4.6, 0)
    row_win(fw, (-5.0, -1.4, 2.2), 7.0, 0.9, 1.5)
    zak(fw.F, fw.L / 2, 9.0, 6.6, 3.1, 0.0, back=0.4)
    awin(fw.F, fw.L / 2, 10.2, 1.0, 1.8, 0)

# ---- южный притвор (вход, фото r9_14)
def porch():
    u0, u1, v0, v1 = -12.9, -8.8, US, 13.2
    blk(u0, u1, v0, v1, GR, 5.7)
    gable(u0, u1, v0, v1, 5.7, 1.5, 'v', ov=(0.0, 0.5), ev=0.4)
    fs = Fc('S', v1, u0, u1)
    plinth(fs)
    cornice(fs.F, 0, fs.L, 0, 5.1, ext=0.4)
    # дверь с арочным входом
    cu = fs.L / 2
    awin(fs.F, cu, 1.3, 1.7, 3.1, 0, mat='wood', bars=False)
    box('trim', fs.F, cu - 1.45, cu + 1.45, 0, 0.3, 4.55, 4.75)
    kok(fs.F, cu, 0.0, 4.75, 3.0, 1.3, 0.36)
    # боковые окна
    for x, side in ((-10.9, 'W'), ):
        pass
    fw = Fc('W', u0, v0, v1)
    row_win(fw, [9.7], 1.9, 1.0, 2.6)
    fe = Fc('E', u1, v0, v1)
    row_win(fe, [9.7], 1.9, 1.0, 2.6)

# ---- южный и северный рукава с закомарами
def arms():
    # южный рукав
    u0, u1, v0, v1 = -8.8, 9.6, 5.0, 14.8
    blk(u0, u1, v0, v1, GR, 9.5)
    gable(u0, u1, v0, v1 - 0.5, 9.5, 3.0, 'v', ov=(0.0, 0.0), ev=0.6)
    fs = Fc('S', v1, u0, u1)
    plinth(fs)
    cornice(fs.F, 0, fs.L, 0, 8.9, ext=0.5)
    lesenes(fs.F, fs.L, 0, 1.3, 8.9, pitch=4.6)
    zak(fs.F, fs.L / 2, 9.5, 8.4, 3.5, 0.0, back=0.5)
    for dx in (-3.0, 0, 3.0):
        awin(fs.F, fs.L / 2 + dx, 5.2, 1.5, 3.8, 0)
    for dx in (-5.6, -3.0, 0, 3.0, 5.6):
        awin(fs.F, fs.L / 2 + dx, 1.9, 1.3, 2.4, 0)
    awin(fs.F, fs.L / 2, 10.5, 1.0, 1.9, 0)
    band(fs.F, 0, fs.L, 0, 4.6, 4.85, 0.1)
    fe = Fc('E', u1, 7.0, v1)
    plinth(fe)
    cornice(fe.F, 0, fe.L, 0, 8.9, ext=0.5)
    row_win(fe, [9.6, 12.8], 2.0, 1.3, 3.0)
    row_win(fe, [9.6, 12.8], 5.8, 1.0, 2.2)
    fw = Fc('W', u0, 13.2, v1)
    plinth(fw)
    cornice(fw.F, 0, fw.L, 0, 8.9, ext=0.5)
    row_win(fw, [14.0], 2.0, 1.0, 3.0)
    # северный рукав
    u0, u1, v0, v1 = -8.3, 5.3, -14.6, -7.0
    blk(u0, u1, v0, v1, GR, 9.5)
    gable(u0, u1, v0 + 0.5, v1, 9.5, 2.8, 'v', ov=(0.0, 0.0), ev=0.6)
    fn = Fc('N', v0, u0, u1)
    plinth(fn)
    cornice(fn.F, 0, fn.L, 0, 8.9, ext=0.5)
    lesenes(fn.F, fn.L, 0, 1.3, 8.9, pitch=4.5)
    zak(fn.F, fn.L / 2, 9.5, 6.2, 3.2, 0.0, back=0.5)
    for dx in (-2.4, 0, 2.4):
        awin(fn.F, fn.L / 2 + dx, 5.0, 1.4, 3.6, 0)
    for dx in (-4.2, -1.4, 1.4, 4.2):
        awin(fn.F, fn.L / 2 + dx, 1.9, 1.3, 2.4, 0)
    awin(fn.F, fn.L / 2, 10.4, 0.9, 1.8, 0)
    fw = Fc('W', u0, v0, v1)
    plinth(fw)
    cornice(fw.F, 0, fw.L, 0, 8.9, ext=0.5)
    row_win(fw, [-12.3, -10.2], 2.0, 1.2, 3.0)
    row_win(fw, [-12.3, -10.2], 5.8, 1.0, 2.2)
    fe = Fc('E', u1, v0, v1)
    plinth(fe)
    cornice(fe.F, 0, fe.L, 0, 8.9, ext=0.5)
    row_win(fe, [-12.3, -10.2], 2.0, 1.2, 3.0)
    # северо-восточный выступ (многогранный)
    poly = [(5.3, -14.6), (6.6, -14.3), (7.4, -13.6), (8.2, -12.6), (8.4, -9.6), (5.3, -9.6)]
    prism_plan('wall', PF, poly, GR, 8.2, top=False)
    c = (6.9, -12.4)
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        face('wall2', [pt(a[0] + (c[0] - a[0]) * -0.06, a[1], 8.1), pt(b[0], b[1], 8.1), pt(c[0], c[1], 10.6)], UP)
    for x, y in poly[1:4]:
        pass

# ================================================================== ВОСТОЧНАЯ ГАЛЕРЕЯ С ПОРТАЛОМ
def gallery():
    u0, u1, v0, v1 = UE, 11.8, -9.6, 7.0
    blk(u0, u1, v0, v1, GR, 5.7)
    # охристая односкатная кровля
    sl = Vector((e_b.x, e_b.y, 0))
    zlo, zhi = 5.5, 8.7
    ue = u1 + 0.55
    face('wall3', [pt(ue, v0 - 0.3, zlo), pt(ue, v1 + 0.3, zlo), pt(u0, v1 + 0.3, zhi), pt(u0, v0 - 0.3, zhi)], sl + UP)
    for vv, sg in ((v0 - 0.3, -1), (v1 + 0.3, 1)):
        face('wall', [pt(ue, vv, zlo), pt(u0, vv, zhi), pt(u0, vv, 5.7)], Vector((s_b.x * sg, s_b.y * sg, 0)))
        face('wall', [pt(ue, vv, zlo), pt(ue, vv, 5.7), pt(u0, vv, 5.7)], Vector((s_b.x * sg, s_b.y * sg, 0)))
    fe = Fc('E', u1, v0, v1)
    plinth(fe, 1.4)
    F = fe.F
    cornice(F, 0, fe.L, 0, 5.15, ext=0.45)
    # пилястры и арки-ниши с иконами (шаг ~2.2 м)
    for x in (-9.5, -7.5, -5.3, -3.1, -0.9, 2.5, 4.7, 6.8):
        a = fe.A(x)
        box('trim', F, a - 0.25, a + 0.25, 0, 0.18, 1.3, 5.15)
        box('trim', F, a - 0.31, a + 0.31, 0, 0.24, 4.7, 4.95)
    for x in (-8.5, -6.4, -4.2, -2.0, 3.6, 5.75):
        awin(F, fe.A(x), 1.7, 1.45, 3.2, 0, mat='wood', bars=False, halo=True)
    # портал: выступ с фронтончиком и мозаичной иконой
    pa = fe.A(0.8)
    box('stone', F, pa - 1.9, pa + 1.9, 0, 1.1, GR, 0.25)
    box('stone', F, pa - 1.7, pa + 1.7, 1.1, 1.5, GR, 0.12)
    box('wall', F, pa - 1.65, pa + 1.65, 0, 0.9, 0.25, 5.4)
    box('trim', F, pa - 1.8, pa - 1.55, 0, 1.0, 0.25, 5.4)
    box('trim', F, pa + 1.55, pa + 1.8, 0, 1.0, 0.25, 5.4)
    box('trim', F, pa - 1.9, pa + 1.9, 0, 1.05, 5.4, 5.7)
    awin(F, pa, 0.3, 1.9, 3.5, 0.92, mat='wood', frame=True, bars=False)
    face('roof', [F.p(pa + 0.8 * math.cos(2 * math.pi * k / 10), 0.93, 4.45 + 0.8 * math.sin(2 * math.pi * k / 10)) for k in range(10)], F.N())
    prism_uz('trim', F, [(pa - 2.0, 5.7), (pa + 2.0, 5.7), (pa, 7.3)], 0.0, 1.1)
    prism_uz('wall', F, [(pa - 1.7, 5.75), (pa + 1.7, 5.75), (pa, 6.95)], 0.0, 1.14)
    face('wall3', [F.p(pa - 2.1, 1.25, 5.62), F.p(pa, 1.25, 7.42), F.p(pa, -0.2, 7.42), F.p(pa - 2.1, -0.2, 5.62)], F.N() + UP)
    face('wall3', [F.p(pa + 2.1, 1.25, 5.62), F.p(pa, 1.25, 7.42), F.p(pa, -0.2, 7.42), F.p(pa + 2.1, -0.2, 5.62)], F.N() + UP)
    for x in range(3):                                                        # ступени
        box('stone', F, pa - 1.5, pa + 1.5, 1.1 + x * 0.3, 1.4 + x * 0.3, GR, 0.2 - x * 0.07)
    # торцы галереи
    for side, k, lo, hi in (('S', 7.0, UE, u1), ('N', -9.6, UE, u1)):
        fc = Fc(side, k, lo, hi)
        plinth(fc, 1.4)
        cornice(fc.F, 0, fc.L, 0, 5.15, ext=0.4)
        awin(fc.F, fc.L / 2, 1.7, 1.2, 3.0, 0, mat='wood', bars=False)

# ================================================================== ЦЕНТРАЛЬНЫЙ КУБ И ГЛАВА
def central():
    blk(-8.0, UE, UN, US, GR, 9.5)                  # нижний объём креста под кровлями
    u0, u1, v0, v1 = -6.3, 6.7, -7.9, 5.1
    blk(u0, u1, v0, v1, GR, ZC)
    faces = [Fc('E', u1, v0, v1), Fc('N', v0, u0, u1), Fc('S', v1, u0, u1), Fc('W', u0, v0, v1)]
    for fc in faces:
        F, L = fc.F, fc.L
        band_blocks(F, 0, L, 0, 14.7, 15.7)
        cornice(F, 0, L, 0, ZC - 0.6, ext=0.55)
        lesenes(F, L, 0, 9.0, 14.7, w=0.7)
        n = 3 if fc.side in 'EW' else 4
        for i in range(n):
            a = L * (i + 0.5) / n
            awin(F, a, 11.6, 1.3, 2.8, 0)
        m = int((L - 5.4) / 2.4)
        for i in range(m + 1):
            kok(F, 2.7 + (L - 5.4) * i / max(m, 1), 0.05, ZC, 2.2, 1.5, 0.45)
    fe = faces[0]
    for i in range(3):                                          # восточный фасад выше кровли галереи — второй ряд
        a = fe.L * (i + 0.5) / 3
        awin(fe.F, a, 9.0, 1.3, 2.3, 0, bars=False)
    # переход от куба к барабану: два яруса кокошников
    cx, cy = P(*HC).x, P(*HC).y
    cyl('wall', cx, cy, 6.5, ZC, ZC + 1.3)
    cyl('trim', cx, cy, 6.78, ZC + 1.15, ZC + 1.35)
    kok_ring(cx, cy, 6.5 * math.cos(math.pi / 16), 16, ZC + 0.2, 2.3, 1.7)
    cyl('wall', cx, cy, 5.6, ZC + 1.35, ZC + 2.7)
    kok_ring(cx, cy, 5.6 * math.cos(math.pi / 16), 16, ZC + 1.5, 2.0, 1.5, phase=0.0)
    cyl('trim', cx, cy, 5.85, ZC + 2.55, ZC + 2.75)
    # барабан с восемью арочными окнами
    zb = ZC + 2.75
    zt = ZC + 6.5
    cyl('wall', cx, cy, 4.9, zb, zt)
    for k in range(8):
        ang = 2 * math.pi * (k + 0.5) / 8
        nn = Vector((math.cos(ang), math.sin(ang)))
        F = Frame(Vector((cx, cy)) + nn * 4.9 * math.cos(math.pi / 16) * 0.995, perp(nn), nn)
        awin(F, 0, zb + 0.7, 1.5, 2.9, 0, n=6)
        box('trim', F, -1.0, -0.8, 0, 0.14, zb + 0.2, zt - 0.6)
        box('trim', F, 0.8, 1.0, 0, 0.14, zb + 0.2, zt - 0.6)
    cyl('trim', cx, cy, 5.3, zt, zt + 0.5)
    kok_ring(cx, cy, 5.1 * math.cos(math.pi / 16), 16, zt + 0.5, 1.9, 1.3)
    # главный купол — высокий стрельчатый шлем
    zh = zt + 0.55
    H = 8.4
    prof = []
    N = 16
    for i in range(N + 1):
        t = i / N
        prof.append((0.9 + 3.75 * math.cos(math.pi / 2 * t ** 0.9) ** 1.2, zh + H * t))
    lathe('roof', Vector((cx, cy, 0)), prof, 16, cap=False)
    zn = zh + H
    lathe('trim', Vector((cx, cy, 0)), [(0.8, zn - 0.05), (0.8, zn + 0.4), (1.0, zn + 0.45), (1.0, zn + 0.6), (0.78, zn + 0.65), (0.78, zn + 1.4),
                                       (0.95, zn + 1.45), (0.95, zn + 1.7)], 12, cap=True)
    onion(cx, cy, zn + 1.7, 1.55, 3.2, 14)
    cross(cx, cy, zn + 4.8, 2.7)
    # четыре двенадцатигранные башенки по углам куба
    for du, dv in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
        p = P(CU + du * 5.0, CV + dv * 5.0)
        tx, ty = p.x, p.y
        z0 = ZC
        cyl('trim', tx, ty, 1.75, z0, z0 + 0.6, 12)
        cyl('wall', tx, ty, 1.32, z0 + 0.6, z0 + 4.6, 12)
        cyl('trim', tx, ty, 1.62, z0 + 4.4, z0 + 4.85, 12)
        for k in range(12):
            ang = 2 * math.pi * (k + 0.5) / 12
            nn = Vector((math.cos(ang), math.sin(ang)))
            F = Frame(Vector((tx, ty)) + nn * 1.32 * math.cos(math.pi / 12) * 0.995, perp(nn), nn)
            awin(F, 0, z0 + 1.7, 0.6, 2.2, 0, n=4, bars=False)
        kok_ring(tx, ty, 1.62 * math.cos(math.pi / 12), 12, z0 + 4.85, 0.95, 0.8, depth=0.2)
        tent(tx, ty, z0 + 4.85, 1.35, 5.4, 12)
        zt2 = z0 + 4.85 + 5.4
        onion(tx, ty, zt2 - 0.15, 0.62, 1.6, 8)
        cross(tx, ty, zt2 + 1.35, 1.6)

# ================================================================== ВОСТОЧНЫЙ ОБЪЁМ С ПОЛОЙ ГЛАВКОЙ
def east_apse():
    u0, u1, v0, v1 = 2.0, 9.9, -5.4, 2.6
    blk(u0, u1, v0, v1, 5.0, 11.0)
    fe = Fc('E', u1, v0, v1)
    F = fe.F
    cornice(F, 0, fe.L, 0, 10.4, ext=0.5)
    lesenes(F, fe.L, 0, 7.0, 10.4, w=0.6)
    for x in (-3.8, -1.4, 1.0):
        awin(F, fe.A(x), 7.9, 1.3, 2.3, 0)
    for side, k, lo, hi in (('S', v1, u0, u1), ('N', v0, u0, u1)):
        fc = Fc(side, k, lo, hi)
        cornice(fc.F, 0, fc.L, 0, 10.4, ext=0.5)
    cx, cy = P(5.95, -1.4).x, P(5.95, -1.4).y
    z0 = 11.0
    cyl('trim', cx, cy, 4.1, z0, z0 + 0.35, 16)
    prof = [(4.0, z0 + 0.35), (3.98, z0 + 0.6), (3.7, z0 + 1.2), (3.1, z0 + 1.75), (2.2, z0 + 2.15), (1.2, z0 + 2.4), (0.82, z0 + 2.45)]
    lathe('roof', Vector((cx, cy, 0)), prof, 16, cap=False)
    zn = z0 + 2.45
    lathe('trim', Vector((cx, cy, 0)), [(0.8, zn), (0.8, zn + 0.9), (0.95, zn + 0.95), (0.95, zn + 1.1)], 12, cap=True)
    onion(cx, cy, zn + 1.1, 1.35, 2.9, 12)
    cross(cx, cy, zn + 3.9, 2.3)

# ================================================================== КОЛОКОЛЬНЯ
def belltower():
    u0, u1 = -23.3, -15.7
    v0, v1 = -5.2, 2.4
    cu, cv = (u0 + u1) / 2, (v0 + v1) / 2
    z1 = 13.6
    blk(u0, u1, v0, v1, GR, z1)
    for fc in (Fc('E', u1, v0, v1), Fc('N', v0, u0, u1), Fc('S', v1, u0, u1), Fc('W', u0, v0, v1)):
        F, L = fc.F, fc.L
        lesenes(F, L, 0, 6.0, z1 - 0.7, w=0.75, pr=0.2)
        band_blocks(F, 0, L, 0, z1 - 1.0, z1 - 0.3)
        cornice(F, 0, L, 0, z1 - 0.3, ext=0.5)
        awin(F, L / 2, 10.2, 1.4, 3.0, 0)
        if fc.side in 'NSW':
            awin(F, L / 2, 6.6, 1.1, 2.0, 0, bars=False)
    # звон: уступ внутрь, угловые столбики, по три арки на сторону
    bz0, bz1 = z1 + 0.35, z1 + 3.9
    inset = 0.45
    blk(u0 + inset, u1 - inset, v0 + inset, v1 - inset, z1, bz1, 'wall')
    for fc in (Fc('E', u1 - inset, v0 + inset, v1 - inset), Fc('N', v0 + inset, u0 + inset, u1 - inset),
               Fc('S', v1 - inset, u0 + inset, u1 - inset), Fc('W', u0 + inset, v0 + inset, v1 - inset)):
        F, L = fc.F, fc.L
        for dx in (-1.95, 0, 1.95):
            awin(F, L / 2 + dx, bz0 + 0.1, 1.3, 3.1, 0, n=6, bars=False)
        for dx in (-3.25, -0.97, 0.97, 3.25):
            box('trim', F, L / 2 + dx - 0.2, L / 2 + dx + 0.2, 0, 0.22, bz0 - 0.1, bz1 - 0.1)
        cornice(F, 0, L, 0, bz1 - 0.1, ext=0.45)
        # кокошники над звоном
        for dx in (-2.4, 0, 2.4):
            kok(F, L / 2 + dx, -0.05, bz1 + 0.5, 2.0, 1.2, 0.3)
    zt = bz1 + 0.5
    pc = P(cu, cv)
    cx, cy = pc.x, pc.y
    cyl('wall', cx, cy, 2.55, zt, zt + 0.5, 8)
    tent(cx, cy, zt + 0.5, 2.95, 6.2, 8)
    zn = zt + 6.5
    lathe('trim', Vector((cx, cy, 0)), [(0.5, zn - 0.2), (0.5, zn + 0.6), (0.65, zn + 0.65), (0.65, zn + 0.8)], 10, cap=True)
    onion(cx, cy, zn + 0.8, 1.0, 2.2, 12)
    cross(cx, cy, zn + 2.9, 2.0)

nave()
porch()
arms()
gallery()
central()
east_apse()
belltower()

finish('pokrovsky_sobor', __file__)
