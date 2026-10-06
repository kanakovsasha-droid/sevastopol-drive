# ЦКБ «Черноморец», Большая Морская, 1 (1949–1954, арх. Л. Н. Павлов) —
# модель с нуля по текстовому описанию refs/center-models.json (w166764281):
# фото в облаке не открыть, что сделано наугад — NOTES.md.
#
#   blender -b --python models/tsk_chernomorets/build.py -- [glb]
#
# Контур OSM way 166764281: вытянутый прямоугольник 86.6 × 18 м вдоль
# Большой Морской (повёрнут на ~10° к осям мира) с клином на северном конце.
# Местная система:
#   a — вдоль уличного (западного) фасада с севера на юг, 0 — северо-западный
#       угол контура (−393, 512.9);
#   b — поперёк, наружу к улице (на запад); дворовая стена — b = −18.1.
# Контур в (a, b): (0, 0) — (86.6, 0) — (86.6, −18.1) — (6.6, −18.1) —
# (−6.25, −7.0) — клин. Портик — посередине уличного фасада (a 29…41),
# квадратная башня с ротондой — на южном конце (a 74.6…87.2).
#
# Ноль высоты — тротуар у a = 55. Улица идёт в гору к югу: у северного угла
# земля на 3.4 м ниже нуля, у портика — на 1 м, у башни — на 1.6 м выше
# (сетка рельефа игры, замер gridHeightAt). Этажи ровные, разницу берёт
# цоколь; двор с востока выше улицы на 2…7 м и закрывает низ дворовой стены.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# ------------------------------------------------------------------ местная система
_s = (-377.6 - -393.0, 598.1 - 512.9); _l = math.hypot(*_s)
SA = (_s[0] / _l, _s[1] / _l)                 # +a в мире (x, z): к югу
SB = (-SA[1], SA[0])                          # +b в мире: к улице, на запад
O = (-393.0, 512.9)

def LW(a, b):
    return (O[0] + a * SA[0] + b * SB[0], O[1] + a * SA[1] + b * SB[1])

X0, Z0 = [round(c, 2) for c in LW(55, 2)]
origin(X0, Z0)
VA = Vector((SA[0], -SA[1]))
VB = Vector((SB[0], -SB[1]))
DIRS = {'+a': VA, '-a': -VA, '+b': VB, '-b': -VB}

def P2(a, b):
    return W(*LW(a, b))

def FR(a, b, u, n):
    return Frame(P2(a, b), DIRS[u], DIRS[n])

def FRp(p0, p1, inside=(40, -9)):
    """Рамка стены от p0 к p1 (a, b); наружу — от точки inside."""
    o = P2(*p0); u = (P2(*p1) - o).normalized()
    n = Vector((-u.y, u.x))
    if n.dot(P2(*inside) - o) > 0: n = -n
    return Frame(o, u, n), (P2(*p1) - o).length

FW = FR(0, 0, '+a', '+b')                     # уличный фасад; d = b

# ------------------------------------------------------------------ цвета (из описания)
COL['wall'] = ((0.925, 0.910, 0.863), 0.88)   # инкерманский известняк #ece8dc
COL['wall2'] = ((0.863, 0.847, 0.800), 0.9)   # рустованный низ #dcd8cc
COL['trim'] = ((0.95, 0.945, 0.92), 0.85)     # карнизы, пилястры — белые
COL['stone'] = ((0.66, 0.64, 0.60), 0.9)      # цоколь, ступени, швы руста
COL['roof'] = ((0.545, 0.561, 0.569), 0.6)    # серый металл #8b8f91
COL['brick'] = ((0.604, 0.290, 0.220), 0.9)   # трубы #9a4a38
COL['glass'] = ((0.09, 0.11, 0.13), 0.15)
COL['metal'] = ((0.14, 0.15, 0.16), 0.5)

GROUND = -4.2     # низ цоколя (ниже самой низкой земли у северного угла)
Z_PL = 0.9        # верх цоколя
Z_R = 5.4         # верх рустованного этажа = пол лоджии портика, низ ордера
ENT = 15.9        # низ антаблемента (верх капителей)
EAVE = 17.2       # верх венчающего карниза
COR = EAVE - 0.6  # низ карниза
STEP = 3.0        # шаг осей уличного фасада (≈ 9–10 осей по сторонам портика)
T_TOP = 25.6      # верх квадратной башни
GND = {0: -3.4, 30: -1.2, 35: -0.95, 40: -0.7, 55: 0.0, 75: 0.85, 87: 1.6}   # земля у фасада

def gnd(a):
    ks = sorted(GND)
    for k0, k1 in zip(ks, ks[1:]):
        if k0 <= a <= k1:
            return GND[k0] + (GND[k1] - GND[k0]) * (a - k0) / (k1 - k0)
    return GND[ks[0]] if a < ks[0] else GND[ks[-1]]

# окна (низ, верх) по этажам
R1 = (1.9, 3.9)           # рустованный этаж — небольшие прямоугольные
F2 = (6.1, 8.6)
F3 = (9.7, 12.1)
F4 = (13.2, 15.1)
WW = 1.35                 # ширина окна

# ------------------------------------------------------------------ примитивы
def quad(m, F, u0, u1, z0, z1, d, hint=None):
    face(m, [F.p(u0, d, z0), F.p(u1, d, z0), F.p(u1, d, z1), F.p(u0, d, z1)], hint if hint is not None else F.N())

def arc_pts(cu, zs, r, n):
    return [(cu + r * math.cos(math.pi * k / n), zs + r * math.sin(math.pi * k / n)) for k in range(n + 1)]

def wall_h(F, u0, u1, z0, z1, d, holes, m='wall', reveal=0.22, rm='trim', flat=False):
    """Стена с проёмами (ua, ub, za, zb, r); r > 0 — арка с пятой на zb − r.
    Проёмы одного ряда одной высоты: стена режется на полосы между рядами."""
    rows = sorted({(h[2], h[3]) for h in holes})
    z = z0
    for za, zb in rows:
        if za > z + 1e-6:
            quad(m, F, u0, u1, z, za, d)
        u = u0
        for h in sorted(h for h in holes if (h[2], h[3]) == (za, zb)):
            if h[0] > u + 1e-6:
                quad(m, F, u, h[0], za, zb, d)
            u = h[1]
        if u1 > u + 1e-6:
            quad(m, F, u, u1, za, zb, d)
        z = zb
    if z1 > z + 1e-6:
        quad(m, F, u0, u1, z, z1, d)
    r_ = d - reveal
    for ua, ub, za, zb, ar in holes:
        if flat:                    # без откосов: стекло вровень со стеной (дворы)
            continue
        top = zb - ar if ar else zb
        face(rm, [F.p(ua, d, za), F.p(ua, r_, za), F.p(ua, r_, top), F.p(ua, d, top)], F.U())
        face(rm, [F.p(ub, d, za), F.p(ub, r_, za), F.p(ub, r_, top), F.p(ub, d, top)], -F.U())
        face(rm, [F.p(ua, d, za), F.p(ub, d, za), F.p(ub, r_, za), F.p(ua, r_, za)], UP)
        if not ar:
            face(rm, [F.p(ua, d, zb), F.p(ub, d, zb), F.p(ub, r_, zb), F.p(ua, r_, zb)], -UP)
            continue
        cu, n = (ua + ub) / 2, 6
        arc = arc_pts(cu, top, ar, n)
        face(m, [F.p(ub, d, zb)] + [F.p(u, d, z) for u, z in arc[:n // 2 + 1]], F.N())
        face(m, [F.p(ua, d, zb)] + [F.p(u, d, z) for u, z in arc[n // 2:]], F.N())
        for k in range(n):
            (pa, za_), (pb, zb_) = arc[k], arc[k + 1]
            face(rm, [F.p(pa, d, za_), F.p(pb, d, zb_), F.p(pb, r_, zb_), F.p(pa, r_, za_)],
                 F.p(cu, d, top) - F.p((pa + pb) / 2, d, (za_ + zb_) / 2))
        glass_win(F, cu, za, ub - ua, top - za, r_ + 0.02, ar, cross=False)

def glass_win(F, cu, za, w, h, d, ar=0.0, cross=True):
    ua, ub = cu - w / 2, cu + w / 2
    pts = [(ua, za), (ub, za), (ub, za + h)]
    if ar:
        pts += arc_pts(cu, za + h, ar, 6)[1:-1]
    pts += [(ua, za + h)]
    face('glass', [F.p(u, d, z) for u, z in pts], F.N())
    if not cross:
        return
    t = 0.035
    quad('trim', F, cu - t, cu + t, za, za + h - 0.02, d + 0.03)
    zt = za + h * 0.70
    quad('trim', F, ua, ub, zt - t, zt + t, d + 0.03)

def frame_band(F, ua, ub, za, zb, d, w=0.13, pr=0.05):
    quad('trim', F, ua - w, ua, za, zb + w, d + pr)
    quad('trim', F, ub, ub + w, za, zb + w, d + pr)
    quad('trim', F, ua, ub, zb, zb + w, d + pr)

def sill(F, ua, ub, z, d, pr=0.13):
    a, b = ua - 0.12, ub + 0.12
    quad('trim', F, a, b, z - 0.11, z, d + pr)
    face('trim', [F.p(a, d, z), F.p(b, d, z), F.p(b, d + pr, z), F.p(a, d + pr, z)], UP)

def band(F, u0, u1, d, z0, z1, pr, m='trim'):
    box(m, F, u0, u1, d - 0.02, d + pr, z0, z1, bottom=False)

def rust_lines(F, u0, u1, d, z0, z1, holes, step=0.56):
    """Горизонтальные швы крупных блоков руста — тёмные полоски на стене."""
    z = z0 + step
    while z < z1 - 0.1:
        segs = [(u0, u1)]
        for ua, ub, za, zb, ar in holes:
            if za - 0.03 < z < zb + 0.03:
                nxt = []
                for s0, s1 in segs:
                    if ub <= s0 or ua >= s1: nxt.append((s0, s1)); continue
                    if ua > s0: nxt.append((s0, ua))
                    if ub < s1: nxt.append((ub, s1))
                segs = nxt
        for s0, s1 in segs:
            if s1 - s0 > 0.1:
                quad('stone', F, s0, s1, z - 0.035, z + 0.035, d + 0.012)
        z += step

def cyl(m, c, axis, r, L, seg=6):
    """Короткий цилиндр (волюта) по оси axis, центр c."""
    bm = bm_of(m)
    ax = axis.normalized()
    s1 = ax.cross(UP)
    if s1.length < 1e-3: s1 = Vector((1, 0, 0))
    s1.normalize(); s2 = ax.cross(s1).normalized()
    ra = [bm.verts.new(c - ax * L / 2 + (s1 * math.cos(2 * math.pi * k / seg) + s2 * math.sin(2 * math.pi * k / seg)) * r) for k in range(seg)]
    rb = [bm.verts.new(c + ax * L / 2 + (s1 * math.cos(2 * math.pi * k / seg) + s2 * math.sin(2 * math.pi * k / seg)) * r) for k in range(seg)]
    for k in range(seg):
        j = (k + 1) % seg
        bm.faces.new([ra[k], ra[j], rb[j], rb[k]]).smooth = True
    bm.faces.new(ra); bm.faces.new(rb)

def ionic(base, H, D, U, seg=12, volutes=True):
    """Ионическая колонна: база, гладкий ствол с утонением, эхин, абака, волюты
    по сторонам вдоль U (U — вдоль фасада)."""
    R = D / 2
    F0 = Frame(Vector((base.x, base.y)), Vector((U.x, U.y)), Vector((-U.y, U.x)))
    box('trim', F0, -0.66 * D, 0.66 * D, -0.66 * D, 0.66 * D, base.z, base.z + 0.12 * D)   # плинт
    ztop = H - 0.30 * D
    prof = [(0.62 * D, 0.12 * D), (0.56 * D, 0.26 * D), (R, 0.36 * D), (0.85 * R, ztop - 0.12 * D),
            (0.9 * R, ztop - 0.04 * D), (0.62 * D, ztop), (0.62 * D, ztop + 0.10 * D)]
    lathe('trim_s', base, prof, seg, cap=True)
    zA = base.z + ztop + 0.10 * D
    box('trim', F0, -0.72 * D, 0.72 * D, -0.62 * D, 0.62 * D, zA, base.z + H)          # абака
    if volutes:
        N = Vector((-U.y, U.x, 0))
        for s in (-1, 1):
            cyl('trim', base + Vector((U.x, U.y, 0)) * s * 0.58 * D + UP * (ztop - 0.02 * D), N, 0.20 * D, 1.0 * D)

def post(m, q, z0, z1, w):
    """Балясина/стойка: четыре боковые грани без торцов."""
    c = [Vector((q.x + sx * w / 2, q.y + sy * w / 2)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for i in range(4):
        a, b = c[i], c[(i + 1) % 4]
        face(m, [a.to_3d() + UP * z0, b.to_3d() + UP * z0, b.to_3d() + UP * z1, a.to_3d() + UP * z1],
             ((a + b) / 2 - q.to_2d()).to_3d())

def baluster_run(p0, p1, z0, h=0.95, sp=0.42, m='trim'):
    """Балюстрада по прямой (точки плана Blender): плита, поручень, балясины."""
    L = (p1 - p0).length
    a0, a1 = Vector((p0.x, p0.y, z0)), Vector((p1.x, p1.y, z0))
    beam(m, a0 + UP * 0.07, a1 + UP * 0.07, 0.30, 0.14)
    beam(m, a0 + UP * (h - 0.07), a1 + UP * (h - 0.07), 0.30, 0.14)
    n = max(1, int(L / sp))
    for i in range(n):
        t = (i + 0.5) / n
        q = a0.lerp(a1, t)
        post(m, q, z0 + 0.14, z0 + h - 0.14, 0.13)

def chimney(u, d, z0, z1, w=0.9):
    box('brick', FW, u - w / 2, u + w / 2, d - w / 2, d + w / 2, z0, z1)
    box('stone', FW, u - w / 2 - 0.08, u + w / 2 + 0.08, d - w / 2 - 0.08, d + w / 2 + 0.08, z1, z1 + 0.14)

# ------------------------------------------------------------------ цоколь
POLY = [(-6.25, -7.03), (0, 0), (29, 0), (29, -0.6), (41, -0.6), (41, 0), (74.6, 0), (74.6, 0.6), (87.2, 0.6), (87.2, -12), (86.6, -12),
        (86.6, -18.1), (6.63, -18.11)]
prism_plan('stone', FW, [(u + (0.12 if u > 80 else -0.0), d) for u, d in POLY], GROUND, Z_PL - 0.02, top=False)

# ------------------------------------------------------------------ уличный фасад
def bay_centres(u0, n):
    return [u0 + STEP / 2 + STEP * i for i in range(n)]

LEFT = bay_centres(1.2, 9)       # a 1.2…28.2: десять пилястр, девять осей
RIGHT = bay_centres(41.8, 10)    # a 41.8…71.8: одиннадцать пилястр, десять осей
WEST_END = 72.2                  # дальше — раскреповка и башня

def order_wall(F, u0, u1, cs, d=0.0):
    """Кусок ордерного фасада: три верхних этажа над рустом, окна по осям cs."""
    holes = []
    for c in cs:
        for za, zb in (F2, F3, F4):
            holes.append((c - WW / 2, c + WW / 2, za, zb, 0))
    wall_h(F, u0, u1, Z_R, COR, d, holes)
    for c in cs:
        for za, zb in (F2, F3, F4):
            ua, ub = c - WW / 2, c + WW / 2
            glass_win(F, c, za, WW, zb - za, d - 0.20)
            frame_band(F, ua, ub, za, zb, d)
            sill(F, ua, ub, za, d)
            if za > F2[0]:                                   # подоконные филёнки
                quad('trim', F, ua + 0.05, ub - 0.05, za - 0.95, za - 0.25, d + 0.03)

def rust_wall(F, u0, u1, cs, d=0.0, holes=None, z0=Z_PL):
    holes = holes if holes is not None else [(c - WW / 2 - 0.05, c + WW / 2 + 0.05, R1[0], R1[1], 0) for c in cs]
    wall_h(F, u0, u1, z0, Z_R - 0.4, d, holes, m='wall2')
    for h in holes:
        if not h[4]:
            glass_win(F, (h[0] + h[1]) / 2, h[2], h[1] - h[0], h[3] - h[2], d - 0.20)
    rust_lines(F, u0, u1, d, z0, Z_R - 0.4, holes)

def pilasters(F, us, d=0.0, w=0.78, pr=0.16):
    for u in us:
        box('trim', F, u - w / 2 - 0.07, u + w / 2 + 0.07, d - 0.02, d + pr + 0.05, Z_R, Z_R + 0.4, bottom=False)
        box('trim', F, u - w / 2, u + w / 2, d - 0.02, d + pr, Z_R + 0.4, ENT - 0.55, bottom=False)
        quad('trim', F, u - w / 2 - 0.08, u + w / 2 + 0.08, ENT - 0.5, ENT - 0.12, d + pr + 0.04)   # капитель
        box('trim', F, u - w / 2 - 0.16, u + w / 2 + 0.16, d - 0.02, d + pr + 0.08, ENT - 0.12, ENT, bottom=False)

order_wall(FW, 0, 29, LEFT)
order_wall(FW, 41, WEST_END, RIGHT)
rust_wall(FW, 0, 29, LEFT)
rust_wall(FW, 41, WEST_END, RIGHT)
pilasters(FW, [1.2 + STEP * i for i in range(10)] + [41.8 + STEP * i for i in range(11)])
band(FW, -0.1, WEST_END, 0, Z_R - 0.4, Z_R, 0.2)                           # пояс над рустом
band(FW, -0.1, WEST_END, 0, ENT, ENT + 0.32, 0.12)                          # архитрав
band(FW, -0.1, WEST_END, 0, ENT + 0.32, ENT + 0.4, 0.17)
cornice(FW, -0.1, WEST_END + 0.1, 0, COR, 0.55)
# угловая лопатка у северного угла
box('trim', FW, 0, 0.55, -0.02, 0.12, Z_R, COR, bottom=False)

# ------------------------------------------------------------------ портик-лоджия
PA, PB = 29.0, 41.0
LD = -5.4                                    # тыльная стена лоджии
# руст под портиком: аркада из трёх проёмов, средний — главный вход. Цоколь
# здесь утоплен (контур POLY): руст спускается до тротуара, пороги — на нуле.
g = gnd(35)
arc_h = [(c - 1.1, c + 1.1, 0.0, 4.55, 1.1) for c in (31.5, 35.0, 38.5)]
rust_wall(FW, PA, PB, [], holes=arc_h, z0=g - 0.2)
for c in (31.5, 35.0, 38.5):                 # архивольты и замковые камни
    for k in range(6):
        a1, a2 = arc_pts(c, 3.45, 1.1, 6), arc_pts(c, 3.45, 1.3, 6)
        face('trim', [FW.p(a1[k][0], 0.06, a1[k][1]), FW.p(a1[k + 1][0], 0.06, a1[k + 1][1]),
                      FW.p(a2[k + 1][0], 0.06, a2[k + 1][1]), FW.p(a2[k][0], 0.06, a2[k][1])], FW.N())
    quad('trim', FW, c - 0.16, c + 0.16, 4.45, 4.85, 0.1)
# лестница к главному входу: от тротуара до верха цоколя
n_st = max(1, round(-g / 0.16))
for i in range(n_st):
    z1 = -i * -g / n_st
    box('stone', FW, 29.6 - i * 0.1, 40.4 + i * 0.1, -0.3, 0.28 * (i + 1), g - 0.2, z1, bottom=False)
# пол лоджии и стены
face('stone', [FW.p(PA, 0.25, Z_R), FW.p(PB, 0.25, Z_R), FW.p(PB, LD, Z_R), FW.p(PA, LD, Z_R)], UP)
quad('trim', FW, PA - 0.2, PB + 0.2, Z_R - 0.4, Z_R, 0.25)                  # кромка пола (пояс)
back = []
for c in (31.5, 35.0, 38.5):
    back.append((c - 0.85, c + 0.85, Z_R + 0.1, 9.0, 0.85))                # арочные двери на лоджию
    back += [(c - 0.65, c + 0.65, za, zb, 0) for za, zb in (F3, F4)]
FL = FR(0, LD, '+a', '+b')
wall_h(FL, PA, PB, Z_R, ENT, 0, back)
for c in (31.5, 35.0, 38.5):
    for za, zb in (F3, F4):
        glass_win(FL, c, za, 1.3, zb - za, -0.20)
        frame_band(FL, c - 0.65, c + 0.65, za, zb, 0)
for u, nn in ((PA, '+a'), (PB, '-a')):       # боковые стены лоджии
    Fs = FR(u, 0, '-b', nn)
    quad('wall', Fs, 0, -LD, Z_R, ENT, 0)
face('wall', [FW.p(PA, 0, ENT), FW.p(PA, LD, ENT), FW.p(PB, LD, ENT), FW.p(PB, 0, ENT)], -UP)   # потолок
quad('wall', FW, PA, PB, ENT, COR, 0)        # фриз над портиком
for i in range(4):                           # передний ряд — четыре колонны
    u = 30.4 + i * (39.6 - 30.4) / 3
    ionic(FW.p(u, -0.75, Z_R), ENT - Z_R, 0.95, FW.U(), seg=8)
for u in (30.4, 39.6):                       # по бокам в глубину — ещё по две
    for d in (-2.35, -3.95):
        ionic(FW.p(u, d, Z_R), ENT - Z_R, 0.95, FW.U(), seg=8)
# фронтон-аттик над портиком
box('wall', FW, PA + 0.3, PB - 0.3, -1.0, 0.05, EAVE, EAVE + 1.3, bottom=False)
band(FW, PA + 0.15, PB - 0.15, 0.05, EAVE + 1.3, EAVE + 1.5, 0.15)
prism_uz('wall', FW, [(PA + 0.6, EAVE + 1.5), (PB - 0.6, EAVE + 1.5), (35, EAVE + 2.6)], -0.9, 0.0)
for s in (-1, 1):
    prism_uz('trim', FW, [(35 + s * 6.0, EAVE + 1.5), (35 + s * 6.0, EAVE + 1.68),
                          (35, EAVE + 2.8), (35, EAVE + 2.62)], -0.95, 0.15)

# ------------------------------------------------------------------ раскреповка перед башней
FK = FR(0, 0.3, '+a', '+b')
order_wall(FK, WEST_END, 74.6, [73.4], d=0)
rust_wall(FK, WEST_END, 74.6, [73.4], d=0)
band(FK, WEST_END, 74.6, 0, Z_R - 0.4, Z_R, 0.2)
band(FK, WEST_END, 74.6, 0, ENT, ENT + 0.4, 0.14)
cornice(FK, WEST_END, 74.6, 0, COR, 0.55)
quad('wall', FR(WEST_END, 0, '+b', '-a'), 0, 0.3, Z_PL, COR, 0)

# ------------------------------------------------------------------ дворовая и торцевые стены
def plain_wall(F, L, cs, m_low='wall2', d=0.0):
    holes_r = [(c - WW / 2, c + WW / 2, R1[0], R1[1], 0) for c in cs]
    holes_u = [(c - WW / 2, c + WW / 2, za, zb, 0) for c in cs for za, zb in (F2, F3, F4)]
    wall_h(F, 0, L, Z_PL, Z_R - 0.4, d, holes_r, m=m_low, flat=True)
    quad('wall', F, 0, L, Z_R - 0.4, Z_R, d)
    wall_h(F, 0, L, Z_R, COR, d, holes_u, flat=True)
    for h in holes_r + holes_u:
        glass_win(F, (h[0] + h[1]) / 2, h[2], h[1] - h[0], h[3] - h[2], d - 0.02, cross=False)
    band(F, -0.05, L + 0.05, d, Z_R - 0.4, Z_R, 0.12)
    cornice(F, 0, L, d, COR, 0.5)

FE = FR(86.6, -18.1, '-a', '-b')             # двор: с юга на север
plain_wall(FE, 86.6 - 6.63, [1.5 + STEP * i for i in range(int((86.6 - 6.63 - 1.5) / STEP))])
FS, Ls = FR(86.6, -18.1, '+b', '+a'), 6.1     # южный торец рядом с башней
plain_wall(FS, Ls, [3.0])
for p0, p1, k in (((6.63, -18.11), (-6.25, -7.03), 4), ((-6.25, -7.03), (0, 0), 2)):   # клин на севере
    Fn, Ln = FRp(p0, p1)
    s = Ln / k
    plain_wall(Fn, Ln, [s / 2 + s * i for i in range(k)])

# ------------------------------------------------------------------ кровля
face('roof', [FW.p(u, d, EAVE - 0.01) for u, d in reversed(POLY[:3] + [(74.6, -18.1)] + POLY[-1:])], UP)
hip_roof(FW, 3.0, 74.6, -0.5, -17.6, EAVE, 2.3, ov=0.0, hip1=False)
face('roof', [FW.p(u, d, EAVE - 0.01) for u, d in ((74.6, -12), (86.6, -12), (86.6, -18.1), (74.6, -18.1))], UP)
for u in (14, 52, 64):
    chimney(u, -9.0, EAVE, EAVE + 3.4)
for u in (32.5, 37.5):                        # трубы за портиком
    chimney(u, -8.0, EAVE, EAVE + 3.8)
# низкая решётка по краю крыши над уличным фасадом
for u0, u1 in ((0.3, PA), (PB, WEST_END)):
    a0, a1 = FW.p(u0, 0.15, EAVE), FW.p(u1, 0.15, EAVE)
    beam('metal', a0 + UP * 0.85, a1 + UP * 0.85, 0.05)
    n = int((u1 - u0) / 3.0)
    for i in range(n + 1):
        q = FW.p(u0 + (u1 - u0) * i / n, 0.15, EAVE)
        post('metal', q, EAVE, EAVE + 0.88, 0.05)

# ------------------------------------------------------------------ башня
TA0, TA1, TB0, TB1 = 74.6, 87.2, -12.0, 0.6
TL = TA1 - TA0
T_FACES = {     # рамка, видна ли грань ниже крыши корпуса
    'w': (FR(TA0, TB1, '+a', '+b'), True),
    's': (FR(TA1, TB1, '-b', '+a'), True),
    'e': (FR(TA1, TB0, '-a', '-b'), False),
    'n': (FR(TA0, TB0, '+b', '-a'), False),
}
TIERS = [(Z_R, 10.8, 3, 6.0, 8.6), (10.8, COR, 3, 11.6, 14.6), (EAVE, 21.6, 3, 18.0, 20.2), (21.6, T_TOP - 0.6, 2, 22.3, 23.9)]

def arch_row(F, z0, z1, n, za, zs, w=1.1, d=0.0, m='wall'):
    cs = [TL / 2 + (i - (n - 1) / 2) * (TL / (n + 0.6)) for i in range(n)]
    holes = [(c - w / 2, c + w / 2, za, zs + w / 2, w / 2) for c in cs]
    wall_h(F, 0, TL, z0, z1, d, holes, m=m)
    for c in cs:
        a1, a2 = arc_pts(c, zs, w / 2, 6), arc_pts(c, zs, w / 2 + 0.16, 6)
        for k in range(6):
            face('trim', [F.p(a1[k][0], d + 0.05, a1[k][1]), F.p(a1[k + 1][0], d + 0.05, a1[k + 1][1]),
                          F.p(a2[k + 1][0], d + 0.05, a2[k + 1][1]), F.p(a2[k][0], d + 0.05, a2[k][1])], F.N())

for key, (F, low) in T_FACES.items():
    if low:
        if key == 'w':
            # вход в юго-западном углу под башней: арка с кованым козырьком
            ga = max(gnd(TA1 - 3.5), Z_PL)
            hole = [(TL - 5.0, TL - 2.4, ga, 4.6, 1.3)]
            rust_wall(F, 0, TL, [], holes=hole + [(2.0, 3.4, R1[0], R1[1], 0)])
            box('metal', F, TL - 5.4, TL - 2.0, 0, 1.1, 4.75, 4.85)
            for u in (TL - 5.2, TL - 2.2):
                beam('metal', F.p(u, 1.05, 4.8), F.p(u, 0.02, 5.6), 0.05)
        else:
            rust_wall(F, 0, TL, [], holes=[(c - 0.7, c + 0.7, R1[0], R1[1], 0) for c in (3.6, 9.0)])
        band(F, -0.05, TL + 0.05, 0, Z_R - 0.4, Z_R, 0.22)
        for t in TIERS[:2]:
            arch_row(F, *t)
        band(F, -0.05, TL + 0.05, 0, 10.8, 11.1, 0.16)
        cornice(F, 0, TL, 0, COR, 0.55)
        for u in (0.5, TL - 0.5):                                         # угловые лопатки
            box('trim', F, u - 0.5, u + 0.5, -0.02, 0.14, Z_R, COR, bottom=False)
    for t in TIERS[2:]:
        arch_row(F, *t)
    band(F, -0.05, TL + 0.05, 0, 21.6, 21.9, 0.16)
    cornice(F, 0, TL, 0, T_TOP - 0.6, 0.4)
face('roof', [P2(a, b).to_3d() + UP * T_TOP for a, b in ((TA0, TB0), (TA1, TB0), (TA1, TB1), (TA0, TB1))], UP)
# угловые пилоны с карнизами
for a, b in ((TA0 + 0.8, TB0 + 0.8), (TA1 - 0.8, TB0 + 0.8), (TA1 - 0.8, TB1 - 0.8), (TA0 + 0.8, TB1 - 0.8)):
    Fp = FR(a, b, '+a', '+b')
    box('wall', Fp, -0.7, 0.7, -0.7, 0.7, T_TOP, T_TOP + 2.2)
    box('trim', Fp, -0.85, 0.85, -0.85, 0.85, T_TOP + 2.2, T_TOP + 2.45)
# балкончик-балюстрада у основания ротонды — по краю башни между пилонами
corners = [P2(a, b) for a, b in ((TA0 + 0.5, TB0 + 0.5), (TA1 - 0.5, TB0 + 0.5), (TA1 - 0.5, TB1 - 0.5), (TA0 + 0.5, TB1 - 0.5))]
for i in range(4):
    p0, p1 = corners[i], corners[(i + 1) % 4]
    dv = (p1 - p0).normalized()
    baluster_run(p0 + dv * 1.0, p1 - dv * 1.0, T_TOP, 0.95, 0.75)

# ------------------------------------------------------------------ ротонда
CR = P2((TA0 + TA1) / 2, (TB0 + TB1) / 2).to_3d()
RD = 4.75                                     # радиус барабана (диаметр ≈ 9.5 м)
Z_D = T_TOP + 2.6                             # верх глухого барабана
Z_C = Z_D + 5.2                               # верх колонн
lathe('wall', CR, [(RD, T_TOP - 0.1), (RD, Z_D - 0.35)], 24, cap=False)
lathe('trim', CR, [(RD + 0.05, T_TOP + 1.2), (RD + 0.18, T_TOP + 1.25), (RD + 0.18, T_TOP + 1.45), (RD + 0.05, T_TOP + 1.5)], 24, cap=False)
lathe('trim', CR, [(RD + 0.05, Z_D - 0.35), (RD + 0.3, Z_D - 0.2), (RD + 0.3, Z_D)], 24, cap=True)
NC = 12                                        # колонн по кругу (наугад: 10–12)
RC = RD - 0.55
RK = 3.1                                       # глухое ядро за колоннами
lathe('wall', CR + UP * Z_D, [(RK, 0), (RK, Z_C - Z_D)], 16, cap=False)
for k in range(NC):
    ang = 2 * math.pi * (k + 0.5) / NC
    rad = Vector((math.cos(ang), math.sin(ang), 0))
    tan = Vector((-rad.y, rad.x, 0))
    ionic(CR + rad * RC + UP * Z_D, Z_C - Z_D, 0.55, tan, seg=6, volutes=False)
    # арочное окошко в ядре между колоннами
    a2 = ang + math.pi / NC
    r2 = Vector((math.cos(a2), math.sin(a2), 0))
    Fk = Frame((CR + r2 * (RK + 0.03)).to_2d(), Vector((-r2.y, r2.x)), r2.to_2d())
    if k % 2 == 0:
        glass_win(Fk, 0, Z_D + 1.2, 0.8, 1.9, 0, ar=0.4, cross=False)
# антаблемент, карниз, круговая балюстрада, кровля
lathe('wall', CR + UP * Z_C, [(RD - 0.15, 0), (RD - 0.15, 0.75), (RD + 0.25, 0.85), (RD + 0.25, 1.1)], 24, cap=True)
ring = [CR.to_2d() + Vector((math.cos(2 * math.pi * k / 12), math.sin(2 * math.pi * k / 12))) * (RD - 0.05) for k in range(13)]
for k in range(12):
    baluster_run(ring[k], ring[k + 1], Z_C + 1.1, 0.9, 0.55)
lathe('roof', CR + UP * (Z_C + 1.1), [(RK, 0), (RK - 0.3, 0.6), (0.6, 1.5)], 16, cap=True)
for dx, h in ((0.0, 3.4), (1.2, 2.2)):        # антенны
    beam('metal', CR + Vector((dx, 0.3, Z_C + 2.5)), CR + Vector((dx, 0.3, Z_C + 2.5 + h)), 0.07)

finish('tsk_chernomorets', __file__)
