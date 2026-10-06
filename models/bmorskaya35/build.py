# Б. Морская, 35 / ул. Суворова — угловой дом с ионической лоджией (OSM w92705874).
#
#   blender -b --python models/bmorskaya35/build.py -- [glb]
#
# Описание — refs/center-models.json (id w92705874): восстановленный инкерманский
# дом начала 1950-х, три этажа; первый — гладкий светлый камень с арками витрин,
# выше — песчаная штукатурка с горизонтальным рустом; срезанный угол несёт
# лоджию на 2–3 этажах: четыре ионические колонны, балюстрада, сверху парапет-
# балюстрада с двумя шарами на тумбах. Что сделано наугад — NOTES.md.
#
# Ноль высоты — земля у угла Б. Морской и Суворова (P1 контура, самая низкая
# точка участка); улицы от угла поднимаются, отметки вершин — с рельефа игры.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# ================================================================== план
# Контур OSM (мир x, z): P0 — южный конец фасада на Б. Морскую, P1 — угол с
# Суворова, P2 — конец фасада на Суворова, P3…P5 — двор.
PW = [(-172.8, 1465.2), (-181.0, 1428.3), (-165.3, 1412.8), (-154.6, 1422.2),
      (-166.9, 1436.1), (-160.2, 1462.0)]
HW = [1.26, 0.0, 1.45, 3.07, 1.76, 2.53]          # земля у вершин над углом, м
origin(*PW[1])

def hexc(h):
    return tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))

COL['wall'] = (hexc('#d8cdaa'), 0.92)      # песчаная штукатурка верха
COL['wall2'] = (hexc('#e6dec8'), 0.85)     # светлый камень первого этажа
COL['stone'] = ((0.74, 0.71, 0.64), 0.9)   # цокольная полоса
COL['roof'] = (hexc('#7d7f78'), 0.85)
COL['trim'] = ((0.94, 0.93, 0.89), 0.8)    # балюстрады, карнизы, наличники
COL['wood'] = ((0.66, 0.62, 0.51), 0.95)   # швы руста (дерева в доме нет)

P = [W(*p) for p in PW]
CHAMF = 6.0          # срез угла: от P1 по обоим фасадам
FRONT = 2.7          # передняя грань лоджии: точки на рёбрах в 2.7 м от P1
d0 = (P[0] - P[1]).normalized(); d1 = (P[2] - P[1]).normalized()
A, B = P[1] + d0 * CHAMF, P[1] + d1 * CHAMF
F1, F2 = P[1] + d0 * FRONT, P[1] + d1 * FRONT
HA, HB = HW[0] * CHAMF / 37.8, HW[2] * CHAMF / 22.1

# Внешний контур массы: угол срезан по A–B
V = [P[0], A, B, P[2], P[3], P[4], P[5]]
HV = [HW[0], HA, HB, HW[2], HW[3], HW[4], HW[5]]
n = len(V)
area = sum(V[i].x * V[(i + 1) % n].y - V[(i + 1) % n].x * V[i].y for i in range(n))
CCW = area > 0

def frame(a, b):
    u = (b - a).normalized()
    nrm = Vector((u.y, -u.x)) if CCW else Vector((-u.y, u.x))     # наружу
    return Frame(a, u, nrm), (b - a).length

GROUND = -3.0
G1 = 4.6             # верх первого этажа, низ пояса
BELT = 4.95          # верх пояса = пол второго этажа
FL2, FL3 = BELT, 8.25
SILL = 0.9           # от пола до подоконника
WH, WW = 1.8, 1.2    # окно жилых этажей
COR = 11.55          # низ венчающего карниза
TOP = 12.15          # верх карниза
ROOF = 11.95

# ================================================================== примитивы
def bx(m, F, u0, u1, d0, d1, z0, z1):
    box(m, F, u0, u1, d0, d1, z0, z1, bottom=False)

def bxf(m, F, u0, u1, d0, d1, z0, z1):
    """Накладка на стену: без задней и нижней граней (их не видно)."""
    P = lambda u, d, z: F.p(u, d, z)
    face(m, [P(u0, d1, z0), P(u1, d1, z0), P(u1, d1, z1), P(u0, d1, z1)], F.N())
    face(m, [P(u0, d0, z0), P(u0, d1, z0), P(u0, d1, z1), P(u0, d0, z1)], -F.U())
    face(m, [P(u1, d0, z0), P(u1, d1, z0), P(u1, d1, z1), P(u1, d0, z1)], F.U())
    face(m, [P(u0, d0, z1), P(u1, d0, z1), P(u1, d1, z1), P(u0, d1, z1)], UP)

def arc_pts(cu, zs, r, a0, a1, k=8):
    return [(cu + r * math.cos(a0 + (a1 - a0) * i / k), zs + r * math.sin(a0 + (a1 - a0) * i / k))
            for i in range(k + 1)]

def win(F, cu, za, d=0.0, w=WW, h=WH, rm='wall'):
    """Окно жилого этажа: простой профилированный наличник, подоконный
    карнизик, переплёт крестом. Возвращает проём для wall()."""
    ua, ub, zb = cu - w / 2, cu + w / 2, za + h
    t = 0.15
    bxf('trim', F, ua - t, ua, d, d + 0.05, za, zb + t)
    bxf('trim', F, ub, ub + t, d, d + 0.05, za, zb + t)
    bxf('trim', F, ua - t, ub + t, d, d + 0.07, zb, zb + t)
    bxf('trim', F, ua - t - 0.06, ub + t + 0.06, d, d + 0.14, za - 0.12, za)
    g = d - 0.2
    face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
    mullions(F, ua, ub, za, zb, g, 0.7)
    return (ua, ub, za, zb)

def mullions(F, ua, ub, za, zb, g, tr):
    """Переплёт плоскими планками перед стеклом: стойка и фрамуга."""
    g += 0.03
    t = 0.035
    cu, zt = (ua + ub) / 2, za + (zb - za) * tr
    face('trim', [F.p(cu - t, g, za), F.p(cu + t, g, za), F.p(cu + t, g, zb), F.p(cu - t, g, zb)], F.N())
    face('trim', [F.p(ua, g, zt - t), F.p(ub, g, zt - t), F.p(ub, g, zt + t), F.p(ua, g, zt + t)], F.N())

def arch(F, cu, za, w, zt, d=0.0, m='wall2', archivolt=True):
    """Арочный проём: прямоугольная дыра для wall() и заполнение пазух над
    полуциркулем, кривой откос, стекло с переплётом, архивольт и замок."""
    r = w / 2; ua, ub = cu - r, cu + r; zs = zt - r
    a = arc_pts(cu, zs, r, math.pi, 0)                 # слева направо по верху
    left = [p for p in a if p[0] <= cu + 1e-6]
    right = [p for p in a if p[0] >= cu - 1e-6]
    face(m, [F.p(u, d, z) for u, z in [(ua, zt)] + left], F.N())
    face(m, [F.p(u, d, z) for u, z in right + [(ub, zt)]], F.N())
    for (u0, z0), (u1, z1) in zip(a, a[1:]):            # откос свода
        face('trim', [F.p(u0, d, z0), F.p(u1, d, z1), F.p(u1, d - 0.24, z1), F.p(u0, d - 0.24, z0)], -UP)
    g = d - 0.22
    face('glass', [F.p(u, g, z) for u, z in [(ua, za), (ub, za)] + list(reversed(a))], F.N())
    mullions(F, ua, ub, za, zt, g, (zs - za) / (zt - za))
    if archivolt:
        o = arc_pts(cu, zs, r + 0.18, math.pi, 0)
        for i in range(len(a) - 1):
            face('trim', [F.p(a[i][0], d + 0.05, a[i][1]), F.p(a[i + 1][0], d + 0.05, a[i + 1][1]),
                          F.p(o[i + 1][0], d + 0.05, o[i + 1][1]), F.p(o[i][0], d + 0.05, o[i][1])], F.N())
            face('trim', [F.p(o[i][0], d, o[i][1]), F.p(o[i + 1][0], d, o[i + 1][1]),
                          F.p(o[i + 1][0], d + 0.05, o[i + 1][1]), F.p(o[i][0], d + 0.05, o[i][1])], UP)
        bx('trim', F, cu - 0.13, cu + 0.13, d, d + 0.09, zt - 0.08, zt + 0.22)    # замок
    return (ua, ub, za, zt)

def shop(F, cu, za, w, zt, d=0.0):
    """Прямоугольная витрина первого этажа."""
    g = d - 0.24
    face('glass', [F.p(cu - w / 2, g, za), F.p(cu + w / 2, g, za), F.p(cu + w / 2, g, zt), F.p(cu - w / 2, g, zt)], F.N())
    mullions(F, cu - w / 2, cu + w / 2, za, zt, g, 0.78)
    return (cu - w / 2, cu + w / 2, za, zt)

def rust(F, u0, u1, z0, z1, holes, step=0.7):
    """Горизонтальные швы инкерманского камня по простенкам."""
    z = z0 + step
    while z < z1 - 0.1:
        cuts = sorted((h[0] - 0.22, h[1] + 0.22) for h in holes if h[2] - 0.2 < z < h[3] + 0.2)
        a = u0
        for c0, c1 in cuts + [(u1, u1)]:
            if c0 - a > 0.25:
                bxf('wood', F, a, min(c0, u1), 0, 0.012, z - 0.02, z + 0.02)
            a = max(a, c1)
        z += step

def axes(L, k, margin=1.0):
    p = (L - 2 * margin) / k
    return [margin + p * (i + 0.5) for i in range(k)]

def baluster(p, z0, h):
    prof = [(0.075, 0), (0.045, 0.12), (0.085, h * 0.45), (0.045, h - 0.1), (0.065, h)]
    lathe('trim', Vector((p.x, p.y, z0)), prof, seg=4, cap=False)

def balustrade(p0, p1, z0, h=0.95, step=0.4):
    """Каменная балюстрада между двумя точками плана (Vector 2D)."""
    a, b = Vector((p0.x, p0.y, z0)), Vector((p1.x, p1.y, z0))
    beam('trim', a + UP * 0.07, b + UP * 0.07, 0.26, 0.14)
    beam('trim', a + UP * (h - 0.07), b + UP * (h - 0.07), 0.3, 0.14)
    L = (p1 - p0).length
    k = max(1, int(L / step))
    for i in range(k):
        q = p0 + (p1 - p0) * ((i + 0.5) / k)
        baluster(q, z0 + 0.14, h - 0.28)

def cyl(m, p0, p1, r, seg=8):
    bm = bm_of(m)
    ax = (p1 - p0).normalized()
    s = ax.cross(UP); s = s.normalized() if s.length > 1e-4 else Vector((1, 0, 0))
    t = s.cross(ax).normalized()
    ra = [bm.verts.new(p0 + (s * math.cos(2 * math.pi * i / seg) + t * math.sin(2 * math.pi * i / seg)) * r) for i in range(seg)]
    rb = [bm.verts.new(p1 + (s * math.cos(2 * math.pi * i / seg) + t * math.sin(2 * math.pi * i / seg)) * r) for i in range(seg)]
    for i in range(seg):
        j = (i + 1) % seg
        bm.faces.new([ra[i], ra[j], rb[j], rb[i]]).smooth = True
    bm.faces.new(ra); bm.faces.new(rb)

def ionic(c, z0, H, D, out):
    """Ионическая колонна: база, ствол с утонением, эхин, абака, две волюты
    по бокам (валики смотрят по направлению out — наружу лоджии)."""
    R = D / 2
    side = Vector((-out.y, out.x))
    F0 = Frame(c, side, out)
    bx('trim', F0, -0.66 * D, 0.66 * D, -0.66 * D, 0.66 * D, z0, z0 + 0.1)
    prof = [(0.62 * D, 0.1), (0.62 * D, 0.17), (0.54 * D, 0.21), (0.57 * D, 0.26), (R, 0.3)]
    for i in range(2):
        t = (i + 1) / 2
        prof.append((R - 0.07 * D * t ** 1.5, 0.3 + (H - 0.62 - 0.3) * t))
    prof += [(R * 0.95, H - 0.56), (R * 1.18, H - 0.38), (R * 1.18, H - 0.3)]
    lathe('trim_s', Vector((c.x, c.y, z0)), prof, seg=8, cap=False)
    bx('trim', F0, -0.66 * D, 0.66 * D, -0.5 * D, 0.5 * D, z0 + H - 0.32, z0 + H - 0.14)    # валик-канал
    bx('trim', F0, -0.68 * D, 0.68 * D, -0.68 * D, 0.68 * D, z0 + H - 0.14, z0 + H)          # абака
    for s in (-1, 1):
        q = F0.p(s * 0.66 * D, 0, z0 + H - 0.33)
        cyl('trim', q - Vector((out.x, out.y, 0)) * 0.5 * D, q + Vector((out.x, out.y, 0)) * 0.5 * D, 0.2 * D)

def slab(poly, z0, z1, m='trim'):
    F0 = Frame(Vector((0, 0)), Vector((1, 0)), Vector((0, 1)))
    prism_plan(m, F0, [(p.x, p.y) for p in poly], z0, z1)
    face(m, [Vector((p.x, p.y, z0)) for p in poly], -UP)

def grade(i, u, L):
    return HV[i] + (HV[(i + 1) % n] - HV[i]) * u / L

# ================================================================== фасады
def street_facade(i, k, special=None, rusted=True):
    """Уличный фасад: первый этаж — гладкий камень с витринами, пояс,
    два жилых этажа в штукатурке с рустом, венчающий карниз."""
    F, L = frame(V[i], V[(i + 1) % n])
    cs = axes(L, k)
    special = special or {}
    # первый этаж
    hs = []
    for j, cu in enumerate(cs):
        g = grade(i, cu, L)
        za = g + 0.25
        if special.get(j) == 'arch':
            if za < 0.6:
                hs.append(arch(F, cu, max(0.25, za), 2.4, 3.75))
        elif 3.75 - za > 1.4:
            hs.append(shop(F, cu, za, 2.1, 3.75))
    wall(F, 0, L, GROUND, G1, 0, hs, m='wall2', rm='wall2')
    prism_uz('stone', F, [(0, GROUND), (L, GROUND), (L, HV[(i + 1) % n] + 0.3), (0, HV[i] + 0.3)], 0, 0.04)
    # пояс между первым и вторым этажом
    band(F, -0.05, L + 0.05, 0, G1, BELT - 0.12, 0.16)
    band(F, -0.12, L + 0.12, 0, BELT - 0.12, BELT, 0.26)
    # жилые этажи
    hs = []
    for j, cu in enumerate(cs):
        for fl in (FL2, FL3):
            sp = special.get((j, fl))
            if sp == 'arched':           # окно с полуциркулем и балкончиком над аркой витрины
                hs.append(arch(F, cu, fl + SILL, 1.3, fl + SILL + 2.1, m='wall', archivolt=False))
                balconette(F, cu, fl + SILL - 0.05)
            else:
                hs.append(win(F, cu, fl + SILL))
                if sp == 'balcony':
                    balcony(F, cu, fl)
    wall(F, 0, L, BELT, TOP + 0.3, 0, hs, rm='wall')
    if rusted:
        rust(F, 0, L, BELT, COR, hs)
    cornice(F, 0, L, 0, COR, ext=0.42)
    return F, L

def balconette(F, cu, z):
    """Балкончик-«французский»: плита на двух кронштейнах и кованая решётка."""
    w, dp = 1.7, 0.45
    bx('trim', F, cu - w / 2, cu + w / 2, 0, dp, z - 0.1, z)
    face('trim', [F.p(cu - w / 2, 0, z - 0.1), F.p(cu + w / 2, 0, z - 0.1), F.p(cu + w / 2, dp, z - 0.1), F.p(cu - w / 2, dp, z - 0.1)], -UP)
    for s in (-1, 1):
        prism_uz('trim', Frame(F.o + F.u * (cu + s * 0.6), F.n, -F.u), [(0, z - 0.5), (0, z - 0.1), (dp - 0.05, z - 0.1)], -0.05, 0.05)
    a, b = F.p(cu - w / 2 + 0.05, dp - 0.04, z), F.p(cu + w / 2 - 0.05, dp - 0.04, z)
    beam('metal', a + UP * 0.9, b + UP * 0.9, 0.04)
    beam('metal', a + UP * 0.1, b + UP * 0.1, 0.03)
    for t in range(9):
        q = a + (b - a) * (t / 8)
        beam('metal', q, q + UP * 0.9, 0.025)
    for s in (-1, 1):
        q0 = F.p(cu + s * (w / 2 - 0.05), 0, z); q1 = F.p(cu + s * (w / 2 - 0.05), dp - 0.04, z)
        beam('metal', q0 + UP * 0.9, q1 + UP * 0.9, 0.04)

def balcony(F, cu, fl):
    """Небольшой балкон верхнего этажа с балюстрадой на консолях."""
    w, dp = 2.4, 0.9
    z = fl + 0.05
    bx('trim', F, cu - w / 2, cu + w / 2, 0, dp, z - 0.16, z)
    face('trim', [F.p(cu - w / 2, 0, z - 0.16), F.p(cu + w / 2, 0, z - 0.16), F.p(cu + w / 2, dp, z - 0.16), F.p(cu - w / 2, dp, z - 0.16)], -UP)
    for s in (-1, 1):
        prism_uz('trim', Frame(F.o + F.u * (cu + s * 0.9), F.n, -F.u), [(0, z - 0.75), (0, z - 0.16), (dp - 0.1, z - 0.16)], -0.08, 0.08)
    q = lambda u, d: Vector(F.p(u, d, 0)[:2])
    c0, c1 = q(cu - w / 2 + 0.12, 0.05), q(cu - w / 2 + 0.12, dp - 0.13)
    c2, c3 = q(cu + w / 2 - 0.12, dp - 0.13), q(cu + w / 2 - 0.12, 0.05)
    balustrade(c0, c1, z, 0.9); balustrade(c1, c2, z, 0.9); balustrade(c2, c3, z, 0.9)

def yard_facade(i, k):
    """Двор: описания нет — гладкая штукатурка, окна без наличников."""
    F, L = frame(V[i], V[(i + 1) % n])
    hs = []
    for cu in axes(L, k, 1.2):
        g = grade(i, cu, L)
        for za in (g + 1.0, FL2 + SILL, FL3 + SILL):
            if za > G1 - 1.0 and za < FL2:
                continue
            ua, ub, zb = cu - 0.6, cu + 0.6, za + 1.7
            face('glass', [F.p(ua, -0.18, za), F.p(ub, -0.18, za), F.p(ub, -0.18, zb), F.p(ua, -0.18, zb)], F.N())
            hs.append((ua, ub, za, zb))
    wall(F, 0, L, GROUND, TOP + 0.3, 0, hs, rm='wall', reveal=0.18)
    band(F, -0.05, L + 0.05, 0, COR + 0.2, TOP, 0.18)

# Б. Морская: восемь осей, у угла — арка витрины и над ней окно с балкончиком,
# в середине верхнего этажа — балкон с балюстрадой
street_facade(0, 8, {7: 'arch', (7, FL2): 'arched', (3, FL3): 'balcony'})
# Суворова: четыре оси; торцы и двор — проще
street_facade(2, 4)
street_facade(3, 3, rusted=False)
street_facade(6, 3, rusted=False)
yard_facade(4, 4)
yard_facade(5, 6)

# ================================================================== угол и лоджия
FC, LC = frame(A, B)
# первый этаж по срезу: две арки витрин
hs = [arch(FC, LC / 2 - 1.55, 0.25, 2.4, 3.75), arch(FC, LC / 2 + 1.55, 0.25, 2.4, 3.75)]
wall(FC, 0, LC, GROUND, G1, 0, hs, m='wall2', rm='wall2')
bx('stone', FC, 0, LC, 0, 0.04, GROUND, 0.55)
# внутренняя стена лоджии: в каждом этаже — арочное окно-дверь
hs = [arch(FC, LC / 2, fl + 0.05, 1.5, fl + 2.75, m='wall') for fl in (FL2, FL3)]
wall(FC, 0, LC, G1, TOP + 0.3, 0, hs, rm='wall')
rust(FC, 0, LC, BELT, COR, hs)

# плиты: над первым этажом (с поясом), междуэтажная, потолок с антаблементом
TRAP = [A, F1, F2, B]
slab(TRAP, G1, BELT)
slab(TRAP, FL3 - 0.4, FL3)
slab(TRAP, COR, TOP)
cen = sum(TRAP, Vector((0, 0))) / 4
out = (F1 + F2) / 2 - (A + B) / 2; out.normalize()
seg = list(zip(TRAP, TRAP[1:]))
for a, b in seg:                      # карниз по краю потолка лоджии
    Fs, Ls = frame(a, b)
    band(Fs, 0, Ls, 0, COR - 0.02, COR + 0.2, 0.12)
    band(Fs, 0, Ls, 0, TOP - 0.25, TOP, 0.32)
    band(Fs, 0, Ls, 0, G1 - 0.02, BELT - 0.12, 0.16)
    band(Fs, 0, Ls, 0, BELT - 0.12, BELT, 0.26)

# колонны: по четыре на этаж, чуть внутрь от края плиты
COLS = [p + (cen - p).normalized() * 0.42 for p in TRAP]
for fl, top in ((BELT, FL3 - 0.4), (FL3, COR)):
    for c in COLS:
        ionic(c, fl, top - fl, 0.42, out)
    for a, b in zip(COLS, COLS[1:]):
        u = (b - a).normalized()
        balustrade(a + u * 0.3, b - u * 0.3, fl, 0.95)

# парапет-балюстрада над лоджией, тумбы с шарами на передних углах
EDGE = [p + (cen - p).normalized() * 0.2 for p in TRAP]
for a, b in zip(EDGE, EDGE[1:]):
    u = (b - a).normalized()
    balustrade(a + u * 0.35, b - u * 0.35, TOP, 0.85)
for p in (EDGE[1], EDGE[2]):
    Fp = Frame(p, Vector((1, 0)), Vector((0, 1)))
    bx('trim', Fp, -0.32, 0.32, -0.32, 0.32, TOP, TOP + 1.0)
    bx('trim', Fp, -0.38, 0.38, -0.38, 0.38, TOP + 1.0, TOP + 1.1)
    lathe('trim', Vector((p.x, p.y, TOP + 1.1)),
          [(0.08, 0), (0.12, 0.08)] + [(0.36 * math.sin(math.pi * t / 6), 0.45 - 0.36 * math.cos(math.pi * t / 6)) for t in range(1, 7)], seg=8)
for p in (EDGE[0], EDGE[3]):          # тумбы у стен — без шаров
    Fp = Frame(p, Vector((1, 0)), Vector((0, 1)))
    bx('trim', Fp, -0.28, 0.28, -0.28, 0.28, TOP, TOP + 0.95)

# ================================================================== кровля
face('roof', [Vector((p.x, p.y, ROOF)) for p in V], UP)
# решётка по краю кровли (кроме парапета лоджии) и трубы
for i in range(n):
    a, b = V[i], V[(i + 1) % n]
    u = (b - a).normalized()
    inn = -(Vector((u.y, -u.x)) if CCW else Vector((-u.y, u.x)))
    a3 = Vector((*(a + inn * 0.3 + u * 0.3), TOP + 0.3)); b3 = Vector((*(b + inn * 0.3 - u * 0.3), TOP + 0.3))
    beam('metal', a3 + UP * 0.8, b3 + UP * 0.8, 0.05)
    L = (b - a).length
    k = max(1, int(L / 5.0))
    for t in range(k + 1):
        q = a3 + (b3 - a3) * (t / k)
        beam('metal', q, q + UP * 0.8, 0.04)
FR, _ = frame(V[0], V[1])
for u, dd in ((8.0, -6.0), (20.0, -7.0)):
    chimney(FR, u, dd, ROOF, ROOF + 1.6, 0.8)
FS, _ = frame(V[2], V[3])
chimney(FS, 9.0, -6.5, ROOF, ROOF + 1.6, 0.8)

finish('bmorskaya35', __file__)
