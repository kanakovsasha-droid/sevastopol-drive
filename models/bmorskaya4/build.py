# Большая Морская, 4 — угловой трёхэтажный дом (~1952–54) на углу пл. Лазарева
# и Большой Морской, внизу «Столовая №1» (OSM way 95119638). Модель с нуля.
#
#   blender -b --python models/bmorskaya4/build.py -- [glb]
#
# Фото в облаке не открыть — работа по описанию refs/center-models.json (поле
# source) и контуру OSM. На северном углу к площади — многогранный эркер
# во всю высоту: 2-й этаж остеклён арочными окнами с балюстрадой, над крышей
# ступенчатая надстройка-шатёр с тёмной кровлей. Вдоль северо-западной
# стороны к площади — низкая аркада глубиной 3 м, над ней терраса с белой
# балюстрадой. Главный фасад — 34 м вдоль Большой Морской. Низ белёный,
# верх кремовый, кровля скатная серая. Что наугад — NOTES.md.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# контур OSM, точки 0–9 (мир x, z)
P = [(-413.5, 665.5), (-408.0, 664.4), (-410.3, 652.5), (-415.4, 647.6), (-407.6, 638.1),
     (-399.4, 645.3), (-393.2, 679.1), (-404.3, 681.4), (-404.8, 679.0), (-410.9, 679.9)]
X0, Z0 = -396.3, 662.2                      # середина фасада на Большую Морскую
origin(X0, Z0)
INSIDE = (-403.0, 662.0)

COL['wall'] = ((0.86, 0.81, 0.68), 0.9)     # кремовый верх #dccfae
COL['wall2'] = ((0.95, 0.93, 0.89), 0.9)    # белёный первый этаж #f1ede2
COL['wall3'] = ((0.22, 0.22, 0.23), 0.7)    # тёмная кровля шатра эркера
COL['roof'] = ((0.43, 0.43, 0.43), 0.6)     # металл #6e6e6e
COL['trim'] = ((0.93, 0.92, 0.88), 0.85)    # наличники, балюстрады
COL['stone'] = ((0.62, 0.61, 0.58), 0.9)    # цоколь, плита террасы
COL['wood'] = ((0.33, 0.21, 0.13), 0.6)     # коричневые рамы эркера

GROUND = -3.0
Z1 = 4.2                  # верх первого этажа (низ второго)
FH = 3.5
EAVE = Z1 + 2 * FH        # 11.2 — низ карниза
ROOFZ = EAVE + 0.6        # верх карниза, начало кровли
SLOPE = 0.42              # уклон скатов (~23°)
TER = 3.0                 # глубина аркады и террасы

# угловая система северного крыла: s — вдоль ребра 3 (от угла 4 к точке 3),
# t — вдоль ребра 4 (от угла 4 к точке 5); дом лежит при s > 0, t > 0
_c = Vector(P[4])
_e3 = (Vector(P[3]) - _c).normalized()
_e4 = (Vector(P[5]) - _c).normalized()
def ST(s, t):
    v = _c + _e3 * s + _e4 * t
    return (v.x, v.y)

# рамка угла: u = s, d = наружу к площади (≈ −t)
F3, _ = frame_from(P[4], P[3], INSIDE)
# эркер — правильный восьмигранник, грани по осям рамки, к контуру вровень
BC, BA = (1.9, -1.9), 2.0
BR = BA / math.cos(math.pi / 8)
def bay_pt(k, r=BR, c=BC):
    a = math.pi / 8 + k * math.pi / 4
    return (c[0] + r * math.cos(a), c[1] + r * math.sin(a))

def quad(m, F, u0, u1, z0, z1, d):
    face(m, [F.p(u0, d, z0), F.p(u1, d, z0), F.p(u1, d, z1), F.p(u0, d, z1)], F.N())

def edge_frame(a, b):
    """Рамка ребра контура: обход такой, что дом справа по ходу (x — восток, z — юг)."""
    dx, dz = b[0] - a[0], b[1] - a[1]
    k = 0.5 / math.hypot(dx, dz)
    return frame_from(a, b, ((a[0] + b[0]) / 2 - dz * k, (a[1] + b[1]) / 2 + dx * k))

# ------------------------------------------------------------------ фасады
def win(F, cu, za, w, h, d=0.0, cols=2, rows=(0.7,)):
    """Лёгкое окно: узкий наличник и переплёт плоскими полосами, стекло в глубине."""
    ua, ub, zb = cu - w / 2, cu + w / 2, za + h
    nw = 0.14
    for a, b, z0, z1 in ((ua - nw, ua, za, zb + nw), (ub, ub + nw, za, zb + nw), (ua, ub, zb, zb + nw)):
        quad('trim', F, a, b, z0, z1, d + 0.04)
    box('trim', F, ua - nw - 0.04, ub + nw + 0.04, d, d + 0.12, za - 0.09, za, bottom=False)
    g = d - 0.2
    quad('glass', F, ua, ub, za, zb, g)
    t = 0.06
    for a, b in [(ua, ua + t), (ub - t, ub)] + [(ua + (ub - ua) * c / cols - t / 2, ua + (ub - ua) * c / cols + t / 2) for c in range(1, cols)]:
        quad('trim', F, a, b, za, zb, g + 0.03)
    for z0, z1 in [(za, za + t), (zb - t, zb)] + [(za + h * r - t / 2, za + h * r + t / 2) for r in rows]:
        quad('trim', F, ua, ub, z0, z1, g + 0.03)
    return (ua, ub, za, zb)

def balcony(F, u0, u1, z, dep=0.75):
    """Балкончик: плита на консолях и серо-белые балясины."""
    box('stone', F, u0, u1, 0, dep, z - 0.16, z)
    for u in (u0 + 0.15, u1 - 0.15):
        box('trim', F, u - 0.08, u + 0.08, 0, dep - 0.1, z - 0.45, z - 0.16)
    balustrade(F, u0, u1, dep - 0.08, z, ends=True, back=0.0)

def balustrade(F, u0, u1, d, z, h=0.95, ends=False, back=None):
    """Балюстрада: плинт, балясины через 0.32 м, поручень."""
    box('trim', F, u0, u1, d - 0.14, d + 0.02, z, z + 0.12)
    box('trim', F, u0 - 0.03, u1 + 0.03, d - 0.17, d + 0.05, z + h - 0.1, z + h)
    n = max(2, round((u1 - u0) / 0.32))
    for i in range(n):
        u = u0 + (u1 - u0) * (i + 0.5) / n
        for a, b in ((F.U(), F.N()), (F.N(), F.U())):     # балясина — крест из двух полос
            c = F.p(u, d - 0.06, 0)
            face('trim', [c - a * 0.06 + UP * (z + 0.12), c + a * 0.06 + UP * (z + 0.12),
                          c + a * 0.06 + UP * (z + h - 0.1), c - a * 0.06 + UP * (z + h - 0.1)], b)
    if ends and back is not None:
        for u in (u0, u1):
            box('trim', F, u - 0.04, u + 0.04, back, d, z + h - 0.1, z + h)

def arch_holes(F, u0, u1, d0, d1, z0, z1, arches, m='wall2'):
    """Стена от d1 (лицо) до d0 вглубь с арочными проёмами (cu, w, пята)."""
    rects = [(cu - w / 2, cu + w / 2, z0, zs) for cu, w, zs in arches]
    wall(F, u0, u1, z0, z1, d1, [(a, b, c, e + w / 2) for (a, b, c, e), (_, w, _) in zip(rects, arches)],
         m=m, reveal=d1 - d0, rm=m)
    n = 8
    for cu, w, zs in arches:
        r = w / 2
        arc = [(cu + r * math.cos(math.pi * k / n), zs + r * math.sin(math.pi * k / n)) for k in range(n + 1)]
        for s in (-1, 1):       # пазухи над полукругом — заполнить до прямоугольника
            half = arc[:n // 2 + 1] if s > 0 else arc[n // 2:]
            corner = (cu + s * r, zs + r)
            for dd, nn in ((d1, F.N()), (d0, -F.N())):
                face(m, [F.p(u, dd, z) for u, z in half] + [F.p(*corner[:1], dd, corner[1])], nn)
        for k in range(n):      # свод: полосы по толщине
            (ua, za), (ub, zb) = arc[k], arc[k + 1]
            q = [F.p(ua, d1, za), F.p(ub, d1, zb), F.p(ub, d0, zb), F.p(ua, d0, za)]
            face('trim', q, F.p(cu, (d0 + d1) / 2, zs) - sum(q, Vector()) / 4)
        # архивольт
        for k in range(n):
            (ua, za), (ub, zb) = arc[k], arc[k + 1]
            ra, rb = r + 0.16, r + 0.16
            pa = (cu + ra * math.cos(math.pi * k / n), zs + ra * math.sin(math.pi * k / n))
            pb = (cu + rb * math.cos(math.pi * (k + 1) / n), zs + rb * math.sin(math.pi * (k + 1) / n))
            face('trim', [F.p(ua, d1 + 0.04, za), F.p(ub, d1 + 0.04, zb), F.p(pb[0], d1 + 0.04, pb[1]),
                          F.p(pa[0], d1 + 0.04, pa[1])], F.N())

def facade(F, u0, u1, n_ax, ground='shop', upper=True, balc=(), doors=(), zt=EAVE, cor=True):
    """Обычная стена дома: белёный низ, кремовый верх, окна по осям."""
    L = u1 - u0
    step = L / max(1, n_ax)
    gh, uh = [], []
    for i in range(n_ax):
        cu = u0 + step * (i + 0.5)
        if ground == 'shop':
            if i in doors:
                gh.append(win(F, cu, 0.15, 1.5, 2.6, cols=2, rows=(0.78,)))
            else:
                gh.append(win(F, cu, 0.7, min(2.2, step - 0.8), 2.3, cols=3, rows=(0.75,)))
        elif ground == 'win':
            gh.append(win(F, cu, 1.0, 1.3, 1.9))
        if upper:
            for f in range(2):
                zf = Z1 + f * FH
                if i in balc:
                    uh.append(win(F, cu, zf + 0.12, 1.2, 2.45, rows=(0.72,)))
                    balcony(F, cu - 1.1, cu + 1.1, zf + 0.12)
                else:
                    uh.append(win(F, cu, zf + 0.85, 1.3, 1.85))
    wall(F, u0, u1, GROUND, Z1, 0, gh, m='wall2')
    if upper:
        wall(F, u0, u1, Z1, zt, 0, uh, m='wall')
    box('stone', F, u0, u1, -0.04, 0.07, GROUND, 0.45)
    band(F, u0, u1, 0, Z1 - 0.12, Z1 + 0.14, 0.13)                    # тяга над первым этажом
    if upper and cor:
        cornice(F, u0, u1, 0, EAVE, ext=0.45)

# ------------------------------------------------------------------ стены по контуру
Fe, Le = edge_frame(P[5], P[6])          # Большая Морская
facade(Fe, 0, Le, 11, doors=(3, 8), balc=(2, 5, 8))
F6, L6 = edge_frame(P[6], P[7])          # южный торец
facade(F6, 0, L6, 3, ground='win')
F7, L7 = edge_frame(P[7], P[8])
facade(F7, 0, L7, 0, ground='none')
F8, L8 = edge_frame(P[8], P[9])
facade(F8, 0, L8, 2, ground='win')
F9, L9 = edge_frame(P[9], P[0])          # к площади, южная часть
facade(F9, 0, L9, 4, ground='shop', doors=(1,))
F0, L0 = edge_frame(P[0], P[1])
facade(F0, 0, L0, 1, ground='win')
F1, L1 = edge_frame(P[1], P[2])
facade(F1, 0, L1, 3, ground='shop', doors=(2,))
# ребро 2: низ у аркады — торец с проёмом, верх — стена за террасой
X2 = tuple(Vector(P[2]) + (Vector(P[3]) - Vector(P[2])) * ((7.05 - TER) / 7.05))
F2, L2 = edge_frame(P[2], X2)
facade(F2, 0, L2, 1, ground='win')
F2b, L2b = edge_frame(X2, P[3])
arch_holes(F2b, 0, L2b, -0.5, 0.0, GROUND, Z1, [(L2b / 2, 1.8, 2.5)])
box('stone', F2b, 0, L2b, -0.04, 0.07, GROUND, 0.3)
band(F2b, 0, L2b, 0, Z1 - 0.12, Z1 + 0.14, 0.13)

# ребро 4: от эркера до угла 5, вровень с контуром во всю высоту
A4 = ST(0, -bay_pt(4)[1])
F4, L4 = edge_frame(A4, P[5])
facade(F4, 0, L4, 2, ground='shop', doors=(0,))

# ------------------------------------------------------------------ аркада и терраса
UA, UB = 3.3, 12.3       # от эркера до точки 3
na = 3
step = (UB - UA) / na
arches = [(UA + step * (i + 0.5), step - 0.75, 2.4) for i in range(na)]
arch_holes(F3, UA, UB, -0.5, 0.0, GROUND, Z1, arches)
box('stone', F3, UA, UB, -0.04, 0.07, GROUND, 0.3)
band(F3, UA, UB, 0, Z1 - 0.12, Z1 + 0.14, 0.13)
box('stone', F3, UA, UB + 0.2, -TER, 0.0, Z1 - 0.3, Z1)                 # плита террасы
face('trim', [F3.p(UA, 0, Z1 - 0.32), F3.p(UB, 0, Z1 - 0.32), F3.p(UB, -TER, Z1 - 0.32), F3.p(UA, -TER, Z1 - 0.32)], -UP)
balustrade(F3, UA + 0.1, UB, 0.0, Z1, ends=False)
balustrade(F2b, 0.1, L2b - 0.2, 0.0, Z1)
# задняя стена под аркадой: вход в столовую и витрины
_a, _b = bay_pt(6), bay_pt(7)
UW = _a[0] + (-TER - _a[1]) / (_b[1] - _a[1]) * (_b[0] - _a[0])
UE = 12.3 + 0.3 * TER / 7.05
Fs = Frame(F3.p(0, -TER, 0).xy, F3.u, F3.n)
hs = [win(Fs, UW + (UE - UW) * k, 0.15 if k == 0.5 else 0.6, 1.6 if k == 0.5 else 2.0, 2.6 if k == 0.5 else 2.2,
          cols=2, rows=(0.8,)) for k in (0.18, 0.5, 0.82)]
wall(Fs, UW, UE, GROUND, Z1, 0, hs, m='wall2')
# верхние этажи за террасой: двери на террасу на втором, окна на третьем
uh = []
for k in (0.18, 0.5, 0.82):
    cu = UW + (UE - UW) * k
    uh.append(win(Fs, cu, Z1 + 0.12, 1.2, 2.45, rows=(0.72,)))
    uh.append(win(Fs, cu, Z1 + FH + 0.85, 1.3, 1.85))
wall(Fs, UW, UE, Z1, EAVE, 0, uh, m='wall')
cornice(Fs, UW, UE, 0, EAVE, ext=0.45)

# ------------------------------------------------------------------ эркер
def bay_face(k):
    a, b = bay_pt(k), bay_pt(k + 1)
    o = F3.p(a[0], a[1], 0).xy
    u = (F3.p(b[0], b[1], 0).xy - o)
    n = Vector((-u.y, u.x))
    cen = F3.p(BC[0], BC[1], 0).xy
    if n.dot(o - cen) < 0: n = -n
    return Frame(o, u, n), u.length

VIS = (7, 0, 1, 2, 3)            # грани, видные снаружи: к террасе, к площади, угол, к ребру 4
for k in range(8):
    F, L = bay_face(k)
    if k not in VIS:
        quad('wall', F, 0, L, GROUND, EAVE, 0)
        continue
    cu = L / 2
    gh = [win(F, cu, 0.6, 1.0, 2.3, cols=1)] if k in (1, 2, 3) else []
    if k == 2:
        gh = [win(F, cu, 0.15, 1.1, 2.7, cols=1)]       # вход с угла
    wall(F, 0, L, GROUND, Z1, 0, gh, m='wall2')
    # второй этаж: арочное окно в коричневой раме и балюстрада
    za, w, zs = Z1 + 0.85, 1.05, Z1 + 2.35
    holes = [(cu - w / 2, cu + w / 2, za, zs + w / 2)]
    zt = Z1 + FH + 0.85
    holes.append((cu - 0.55, cu + 0.55, zt, zt + 1.8))
    wall(F, 0, L, Z1, EAVE, 0, holes, m='wall', reveal=0.2)
    n = 6
    arc = [(cu + w / 2 * math.cos(math.pi * i / n), zs + w / 2 * math.sin(math.pi * i / n)) for i in range(n + 1)]
    face('glass', [F.p(cu - w / 2, -0.17, za), F.p(cu + w / 2, -0.17, za)] +
         [F.p(u, -0.17, z) for u, z in arc], F.N())
    for s in (-1, 1):
        half = arc[:n // 2 + 1] if s > 0 else arc[n // 2:]
        face('wall', [F.p(u, 0, z) for u, z in half] + [F.p(cu + s * w / 2, 0, zs + w / 2)], F.N())
    box('wood', F, cu - w / 2, cu - w / 2 + 0.07, -0.17, -0.1, za, zs)
    box('wood', F, cu + w / 2 - 0.07, cu + w / 2, -0.17, -0.1, za, zs)
    box('wood', F, cu - 0.035, cu + 0.035, -0.17, -0.1, za, zs + w / 2)
    box('wood', F, cu - w / 2, cu + w / 2, -0.17, -0.1, zs - 0.04, zs + 0.03)
    for i in range(n):
        (ua, zza), (ub, zzb) = arc[i], arc[i + 1]
        face('trim', [F.p(ua, 0, zza), F.p(ub, 0, zzb), F.p(ub, -0.2, zzb), F.p(ua, -0.2, zza)],
             F.p(cu, -0.1, zs) - F.p((ua + ub) / 2, -0.1, (zza + zzb) / 2))
        face('trim', [F.p(ua, 0.04, zza), F.p(ub, 0.04, zzb),
                      F.p(cu + (ub - cu) * 1.25, 0.04, zs + (zzb - zs) * 1.25),
                      F.p(cu + (ua - cu) * 1.25, 0.04, zs + (zza - zs) * 1.25)], F.N())
    balustrade(F, 0.08, L - 0.08, 0.32, Z1 + 0.05, h=0.85)
    box('trim', F, 0, L, 0, 0.36, Z1 - 0.12, Z1 + 0.05)                # полка под балюстрадой
    # третий этаж
    glazing(F, cu - 0.55, cu + 0.55, zt, zt + 1.8, 0, cols=1, reveal=0.2)
    box('trim', F, cu - 0.7, cu + 0.7, 0, 0.1, zt - 0.12, zt)
    box('stone', F, 0, L, -0.04, 0.07, GROUND, 0.45)
    band(F, 0, L, 0, Z1 - 0.12, Z1 + 0.14, 0.13)
    band(F, -0.02, L + 0.02, 0, EAVE, EAVE + 0.25, 0.14)
    band(F, -0.12, L + 0.12, 0, EAVE + 0.25, EAVE + 0.6, 0.38)

# ступенчатая надстройка-шатёр над эркером
def oct_ring(a, z0, z1, m, top=False):
    r = a / math.cos(math.pi / 8)
    prism_plan(m, F3, [bay_pt(k, r) for k in range(8)], z0, z1, top=top)
oct_ring(BA + 0.3, ROOFZ - 0.01, ROOFZ + 0.12, 'trim', top=True)       # полка карниза
oct_ring(BA - 0.25, ROOFZ, ROOFZ + 1.3, 'wall')
oct_ring(BA - 0.05, ROOFZ + 1.3, ROOFZ + 1.6, 'trim', top=True)
oct_ring(BA - 0.65, ROOFZ + 1.6, ROOFZ + 2.4, 'wall')
oct_ring(BA - 0.45, ROOFZ + 2.4, ROOFZ + 2.65, 'trim', top=True)
# тёмный шатёр
rb = (BA - 0.45) / math.cos(math.pi / 8)
apex = F3.p(BC[0], BC[1], ROOFZ + 4.6)
for k in range(8):
    a, b = bay_pt(k, rb), bay_pt(k + 1, rb)
    pa, pb = F3.p(a[0], a[1], ROOFZ + 2.65), F3.p(b[0], b[1], ROOFZ + 2.65)
    face('wall3', [pa, pb, apex], (pa + pb) / 2 - F3.p(BC[0], BC[1], ROOFZ + 2.0))
lathe('metal', F3.p(BC[0], BC[1], ROOFZ + 4.5), [(0.08, 0), (0.14, 0.25), (0.06, 0.45), (0.03, 1.3)], seg=8)

# ------------------------------------------------------------------ кровля
# три вальмовые кровли поверх крыльев одной высоты карниза
hip_roof(Fe, 1.5, Le, 0, -12.6, ROOFZ, 12.6 / 2 * SLOPE, ov=0.5)
Fsr = Frame(W(*P[6]), (W(*P[9]) - W(*P[6])).normalized(), F6.n)
Ls = (W(*P[9]) - W(*P[6])).length
hip_roof(Fsr, 0, Ls, 0, -14.0, ROOFZ, 14.0 / 2 * SLOPE, ov=0.5)
dN = 10.9 - TER
hip_roof(F3, 0, 12.45, -TER, -10.9, ROOFZ, dN / 2 * SLOPE, ov=0.5)
# двор-крыша вровень под стыком крыльев (закрыть щели между скатами)
face('roof', [Vector((*W(*p), ROOFZ - 0.02)) for p in P], UP)
chimney(Fe, 9.0, -4.5, ROOFZ, ROOFZ + 3.6, w=0.9)
chimney(Fe, 24.0, -4.5, ROOFZ, ROOFZ + 3.6, w=0.9)

finish('bmorskaya4', __file__, tri_budget=10000)
