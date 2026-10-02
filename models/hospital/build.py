# Городская больница №1 им. Пирогова на площади Восставших — модель с нуля.
#
#   blender -b --python models/hospital/build.py -- [glb]
#
# План снят с контура OSM way 91744608 и спутника (tools/sat.html), фасады — с
# панорам Яндекса 2020 года. Ноль высоты — тротуар у подножия лестницы портика.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

X0, Z0 = -761.3, 1638.7          # середина фасада портика (точка P15 контура)
origin(X0, Z0)

# ================================================================== ЗДАНИЕ
# Опорные точки контура OSM (мир x, z)
P = {0: (-752.6, 1632.0), 1: (-710.6, 1619.0), 12: (-798.7, 1671.0), 13: (-760.2, 1646.6),
     14: (-764.4, 1644.4), 15: (-761.3, 1638.7), 16: (-758.2, 1633.1), 17: (-755.3, 1634.6)}

t = (W(*P[16]) - W(*P[14])).normalized()                 # вдоль фасада портика, на север
nrm = Vector((-t.y, t.x))                                 # наружу
if nrm.dot(W(-738, 1637.5) - W(*P[15])) > 0:
    nrm = -nrm
FP = Frame(W(*P[15]), t, nrm)

GROUND = -3.0            # стены уходят под землю: участок с уклоном
ST = 1.5                 # высота стилобата
COLH, COLD = 9.6, 1.1
EAVE = 10.3              # верх карниза крыльев
ENT0 = ST + COLH         # низ антаблемента 11.1
ENT1 = ENT0 + 1.3        # верх фриза 12.4
COR1 = ENT1 + 0.7        # верх карниза 13.1
HALF = 6.07              # полуширина антаблемента по архитраву
BACK = -3.7              # стена за колоннами
DC = -0.82               # ось колонн
REAR = -17.0

def build_portico():
    F = FP
    # стилобат и лестница
    box('stone', F, -6.5, 6.5, BACK, 0.12, GROUND, ST - 0.06)
    box('trim', F, -6.55, 6.55, BACK, 0.17, ST - 0.06, ST)
    n, rise, run = 9, ST / 9, 0.34
    for i in range(n):
        top = ST - rise * (i + 1)
        box('stone', F, -4.75, 4.75, 0.12, 0.12 + run * (i + 1) + 0.02, top - rise - (0 if i < n - 1 else 3), top)
    for s in (-1, 1):       # тумбы по сторонам лестницы
        u0, u1 = sorted((s * 4.75, s * 6.5))
        box('stone', F, u0, u1, 0.12, 1.9, GROUND, ST - 0.12)
        box('trim', F, u0 - 0.05, u1 + 0.05, 0.12, 1.96, ST - 0.12, ST)
        box('stone', F, u0, u1, 1.9, 3.3, GROUND, 0.75)
        box('trim', F, u0 - 0.05, u1 + 0.05, 1.9, 3.36, 0.75, 0.87)
    for s in (-1.6, 1.6):   # перила
        a, b = F.p(s, 0.3, ST + 0.9), F.p(s, 0.12 + run * n, 0.9)
        beam('metal', a, b, 0.05)
        beam('metal', a + UP * -0.45, b + UP * -0.45, 0.03)
        for k in range(4):
            q = a + (b - a) * (k / 3)
            beam('metal', q, q - UP * 0.9, 0.04)
    # колонны и пилястры
    axes = (-5.5, -1.95, 1.95, 5.5)
    for u in axes:
        corinthian(F.p(u, DC, ST), COLH, COLD)
        pilaster(F, u, BACK, ST, COLH)
    # стена за колоннами
    door = (-0.95, 0.95, ST, ST + 3.1)
    holes = [door, (-4.4, -3.1, ST + 0.95, ST + 3.0), (3.1, 4.4, ST + 0.95, ST + 3.0)]
    zs, r, sill = 8.55, 0.98, 5.55           # пята арки, радиус, подоконник
    arches = [-3.72, 0.0, 3.72]
    for cu in arches:
        holes.append((cu - r, cu + r, sill, zs + r))
    wall(F, -6.0, 6.0, ST, ENT1, BACK, holes)
    # дверь
    g = BACK - 0.22
    face('wood', [F.p(-0.95, g, ST), F.p(0.95, g, ST), F.p(0.95, g, ST + 2.35), F.p(-0.95, g, ST + 2.35)], F.N())
    face('glass', [F.p(-0.95, g, ST + 2.35), F.p(0.95, g, ST + 2.35), F.p(0.95, g, ST + 3.1), F.p(-0.95, g, ST + 3.1)], F.N())
    box('trim', F, -0.03, 0.03, g, g + 0.05, ST, ST + 3.1)
    box('trim', F, -0.95, 0.95, g, g + 0.07, ST + 2.32, ST + 2.40)
    box('trim', F, -1.25, -0.95, BACK, BACK + 0.14, ST, ST + 3.3)
    box('trim', F, 0.95, 1.25, BACK, BACK + 0.14, ST, ST + 3.3)
    box('trim', F, -1.25, 1.25, BACK, BACK + 0.14, ST + 3.1, ST + 3.5)
    box('trim', F, -1.5, 1.5, BACK, BACK + 0.32, ST + 3.5, ST + 3.68)
    for cu in (-3.75, 3.75):
        surround(F, cu - 0.65, cu + 0.65, ST + 0.95, ST + 3.0, BACK)
        glazing(F, cu - 0.65, cu + 0.65, ST + 0.95, ST + 3.0, BACK)
    band(F, -6.0, 6.0, BACK, ST + 3.95, ST + 4.15, 0.08)          # междуэтажный пояс
    # арочные окна: заполнение углов, архивольт, стекло
    seg = 14
    for cu in arches:
        arc = [(cu + r * math.cos(math.pi * k / seg), zs + r * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
        hs = seg // 2
        face('wall', [F.p(cu + r, BACK, zs + r)] + [F.p(u, BACK, z) for u, z in arc[:hs + 1]], F.N())
        face('wall', [F.p(cu - r, BACK, zs + r)] + [F.p(u, BACK, z) for u, z in arc[hs:]], F.N())
        for k in range(seg):
            (ua, za), (ub, zb) = arc[k], arc[k + 1]
            face('trim', [F.p(ua, BACK, za), F.p(ub, BACK, zb), F.p(ub, BACK - 0.24, zb), F.p(ua, BACK - 0.24, za)],
                 F.p(cu, BACK, zs) - F.p((ua + ub) / 2, BACK, (za + zb) / 2))
            ro = r + 0.26                                         # архивольт
            oa = (cu + ro * math.cos(math.pi * k / seg), zs + ro * math.sin(math.pi * k / seg))
            ob = (cu + ro * math.cos(math.pi * (k + 1) / seg), zs + ro * math.sin(math.pi * (k + 1) / seg))
            face('trim', [F.p(ua, BACK + 0.07, za), F.p(ub, BACK + 0.07, zb), F.p(ob[0], BACK + 0.07, ob[1]), F.p(oa[0], BACK + 0.07, oa[1])], F.N())
            face('trim', [F.p(oa[0], BACK, oa[1]), F.p(ob[0], BACK, ob[1]), F.p(ob[0], BACK + 0.07, ob[1]), F.p(oa[0], BACK + 0.07, oa[1])],
                 F.p((oa[0] + ob[0]) / 2, BACK, (oa[1] + ob[1]) / 2) - F.p(cu, BACK, zs))
        box('trim', F, cu - r - 0.26, cu - r, BACK, BACK + 0.07, sill, zs)       # наличник по бокам
        box('trim', F, cu + r, cu + r + 0.26, BACK, BACK + 0.07, sill, zs)
        box('trim', F, cu - r - 0.4, cu + r + 0.4, BACK, BACK + 0.16, sill - 0.14, sill)
        gd = BACK - 0.22
        face('glass', [F.p(cu - r, gd, sill), F.p(cu + r, gd, sill)] + [F.p(u, gd, z) for u, z in arc], F.N())
        for dx in (-r / 3, r / 3):                                 # переплёт
            top = zs + math.sqrt(r * r - dx * dx)
            box('trim', F, cu + dx - 0.03, cu + dx + 0.03, gd, gd + 0.06, sill, top)
        for z in (sill + 0.03, sill + 0.75, sill + 1.5, sill + 2.25, zs):
            box('trim', F, cu - r, cu + r, gd, gd + 0.06, z - 0.03, z + 0.03)
    for a, b in ((-6.0, -4.9), (-2.54, -1.18), (1.18, 2.54), (4.9, 6.0)):   # импост в уровне пят арок
        band(F, a, b, BACK, zs - 0.12, zs + 0.06, 0.07)
    # центральный объём за портиком
    for s in (-1, 1):
        Fs = Frame(F.o + F.u * (s * 6.0), F.n, F.u * s)
        wall(Fs, REAR, BACK, GROUND, ENT1, 0, [])
        band(Fs, REAR, BACK, 0, ENT0, ENT0 + 0.6, 0.07)
        box('trim', Fs, BACK - 1.0, BACK, 0, 0.16, ST, ENT0)       # угловая лопатка
    box('wall', F, -6.0, 6.0, REAR, REAR + 0.3, GROUND, ENT1 + 2)
    box('trim', F, -5.6, 5.6, BACK, DC + 0.5, ENT0 + 0.55, ENT0 + 0.62)      # потолок портика
    # антаблемент: архитрав (белый), фриз (охра), карниз с модульонами
    def ring(z0, z1, off, m):
        h = HALF + off
        box(m, F, -h, h, DC - 0.47, DC + 0.47 + off, z0, z1)
        for s in (-1, 1):
            u0, u1 = sorted((s * (HALF - 0.94), s * h))
            box(m, F, u0, u1, REAR, DC + 0.47 + off, z0, z1)
    ring(ENT0, ENT0 + 0.32, 0.0, 'trim')
    ring(ENT0 + 0.32, ENT0 + 0.6, 0.04, 'trim')
    ring(ENT0 + 0.6, ENT1, 0.0, 'wall')
    ring(ENT1, ENT1 + 0.16, 0.10, 'trim')
    ring(ENT1 + 0.42, ENT1 + 0.58, 0.58, 'trim')
    ring(ENT1 + 0.58, COR1, 0.70, 'trim')
    ring(ENT1 + 0.16, ENT1 + 0.42, 0.06, 'trim')
    fr = DC + 0.47
    for i in range(-11, 12):                                       # модульоны по фасаду
        u = i * 0.56
        box('trim', F, u - 0.11, u + 0.11, fr, fr + 0.5, ENT1 + 0.18, ENT1 + 0.42)
    for s in (-1, 1):                                              # и по бокам
        Fs = Frame(F.o + F.u * (s * HALF), F.n, F.u * s)
        dd = fr - 0.56
        while dd > REAR + 4:
            box('trim', Fs, dd - 0.11, dd + 0.11, 0, 0.5, ENT1 + 0.18, ENT1 + 0.42)
            dd -= 0.56
    # фронтон
    ov = HALF + 0.70
    sl = math.tan(math.radians(21.5))
    apex = COR1 + ov * sl
    prism_uz('wall', F, [(-HALF, COR1), (HALF, COR1), (0, COR1 + HALF * sl)], fr - 0.4, fr)
    bt = 0.44
    for s in (-1, 1):
        prism_uz('trim', F, [(s * ov, COR1), (0, apex), (0, apex - bt), (s * (ov - bt / sl), COR1)], fr - 0.2, fr + 0.70)
        prism_uz('trim', F, [(s * ov, COR1 - 0.02), (0, apex + 0.1), (0, apex), (s * ov, COR1 - 0.12)], fr - 0.2, fr + 0.78)
        k = 1
        while k * 0.56 < ov - 1.4:                                 # модульоны по скатам
            u = s * k * 0.56
            zt = apex - abs(u) * sl - bt
            box('trim', F, u - 0.11, u + 0.11, fr, fr + 0.46, zt - 0.24, zt + 0.02)
            k += 1
    # двускатная кровля центрального объёма
    for s in (-1, 1):
        face('roof', [F.p(s * (ov + 0.06), fr + 0.74, COR1 + 0.04), F.p(0, fr + 0.74, apex + 0.14),
                      F.p(0, REAR, apex + 0.14), F.p(s * (ov + 0.06), REAR, COR1 + 0.04)], F.U() * s + UP)
    prism_uz('wall', F, [(-HALF, COR1), (HALF, COR1), (0, apex)], REAR, REAR + 0.3)

def facade_rows(F, u0, u1, d, bays, kinds=True, z_cor=EAVE - 0.6):
    """Двухэтажный фасад крыла: цоколь, окна в два ряда, пояс, карниз."""
    L = u1 - u0
    step = L / bays
    holes, wins = [], []
    for i in range(bays):
        cu = u0 + step * (i + 0.5)
        pedim = kinds and i % 3 == 1
        wins.append((cu, 2.25, 1.3, 2.15, 'rust' if pedim else 'plain'))
        wins.append((cu, 6.35, 1.3, 2.25, 'plain'))
    for cu, za, w, h, kind in wins:
        holes.append((cu - w / 2, cu + w / 2, za, za + h))
    wall(F, u0, u1, 0.95, z_cor, d, holes)
    box('stone', F, u0, u1, d - 0.3, d + 0.08, GROUND, 0.95)
    band(F, u0, u1, d, 0.95, 1.07, 0.11)
    for cu, za, w, h, kind in wins:
        window(F, cu, za, w, h, d, kind)
    band(F, u0, u1, d, 5.25, 5.47, 0.09)
    cornice(F, u0, u1, d, z_cor)

def build_south():
    o = W(*P[13]); u = (W(*P[12]) - o).normalized()
    n = Vector((-u.y, u.x))
    if n.dot(W(-738, 1637.5) - o) > 0: n = -n
    F = Frame(o, u, n)
    L, Wd = 45.6, 13.8
    facade_rows(F, 0, L, 0, 13)
    for a, b in ((L - 1.25, L), (0.0, 0.0)):                       # рустованный угол
        z = 1.07
        while a < b and z < EAVE - 0.9:
            box('trim', F, a, b + 0.06, 0, 0.09, z, z + 0.42)
            z += 0.5
    Fy = Frame(F.p(L, -Wd, 0).xy, -F.u, -F.n)                      # дворовый фасад
    facade_rows(Fy, 0, L + 6, 0, 14, kinds=False)
    Fe = Frame(F.p(L, 0, 0).xy, -F.n, F.u)                         # торец
    facade_rows(Fe, 0, Wd, 0, 3, kinds=False)
    z = 1.07
    while z < EAVE - 0.9:
        box('trim', Fe, -0.06, 1.25, 0, 0.09, z, z + 0.42)
        box('trim', Fe, Wd - 1.25, Wd + 0.06, 0, 0.09, z, z + 0.42)
        z += 0.5
    hip_roof(F, -9, L, 0, -Wd, EAVE, 3.1, hip0=False)
    zr = lambda d: EAVE + 3.1 * (0.55 - d) / (Wd / 2 + 0.55)
    for cu in (8.5, 22.8, 37.0):
        dormer(F, cu, -2.4, zr(-2.4) - 0.05)
    for cu, d in ((14.0, -5.0), (30.5, -5.2), (41.0, -8.6)):
        chimney(F, cu, d, EAVE, zr(d if d > -Wd / 2 else -Wd - d) + 1.0)
    return F

def build_north():
    o = W(*P[0]); u = (W(*P[1]) - o).normalized()
    n = Vector((-u.y, u.x))
    if n.dot(W(-738, 1637.5) - o) > 0: n = -n
    F = Frame(o, u, n)
    L, Wd = 43.8, 13.6
    facade_rows(F, 0, L, 0, 12)
    Fy = Frame(F.p(L, -Wd, 0).xy, -F.u, -F.n)
    facade_rows(Fy, 0, L + 8, 0, 14, kinds=False)
    hip_roof(F, 0.4, L + 1, 0, -Wd, EAVE, 3.05, hip0=True, hip1=False)
    zr = lambda d: EAVE + 3.05 * (0.55 - d) / (Wd / 2 + 0.55)
    for cu in (7.5, 21.5, 35.5):
        dormer(F, cu, -2.4, zr(-2.4) - 0.05)
    for cu, d in ((13.0, -5.0), (28.0, -5.2)):
        chimney(F, cu, d, EAVE, zr(d) + 1.0)
    # переходная стенка от угла портика к крылу (ребро P17 → P0 контура)
    a = W(*P[17]); b = W(*P[0])
    uu = (b - a).normalized(); nn = Vector((-uu.y, uu.x))
    if nn.dot(W(-738, 1637.5) - a) > 0: nn = -nn
    Fc = Frame(a, uu, nn)
    Lc = (b - a).length
    wall(Fc, -0.3, Lc, 0.95, EAVE - 0.6, 0, [])
    box('stone', Fc, -0.3, Lc, -0.3, 0.08, GROUND, 0.95)
    band(Fc, -0.3, Lc, 0, 5.25, 5.47, 0.09)
    cornice(Fc, -0.3, Lc, 0, EAVE - 0.6, ext=0.4)
    # клин между портиком и крылом, под общей кровлей
    c1 = FP.p(4.0, -14.0, 0).xy
    tri = [a, b, F.p(0, -Wd, 0).xy, c1]
    Fi = Frame(Vector((0, 0)), Vector((1, 0)), Vector((0, 1)))
    prism_plan('wall', Fi, [(p.x, p.y) for p in tri], GROUND, EAVE - 0.1, top=False)
    cen = sum(tri, Vector((0, 0))) / 4
    apex = Vector((cen.x, cen.y, EAVE + 2.4))
    rim = [Vector((p.x, p.y, EAVE)) for p in (a + nn * 0.4, b + nn * 0.4, tri[2], tri[3])]
    for i in range(4):
        q = [rim[i], rim[(i + 1) % 4], apex]
        face('roof', q, UP)
    # ---- башня с бельведером
    T0, T1, TD0, TD1 = 43.8, 51.3, 2.3, -5.2
    TH = 17.2
    sides = [(Frame(F.p(T0, TD0, 0).xy, F.u, F.n), T1 - T0),
             (Frame(F.p(T1, TD0, 0).xy, -F.n, F.u), TD0 - TD1),
             (Frame(F.p(T1, TD1, 0).xy, -F.u, -F.n), T1 - T0),
             (Frame(F.p(T0, TD1, 0).xy, F.n, -F.u), TD0 - TD1)]
    for Ft, Lt in sides:
        holes = []
        for za, h in ((2.25, 2.15), (6.35, 2.25), (10.2, 2.0), (13.6, 2.0)):
            for cu in (Lt * 0.29, Lt * 0.71):
                holes.append(window(Ft, cu, za, 1.1, h, 0))
        wall(Ft, 0, Lt, 0.95, TH, 0, holes)
        box('stone', Ft, 0, Lt, -0.3, 0.08, GROUND, 0.95)
        band(Ft, 0, Lt, 0, 5.25, 5.47, 0.09)
        band(Ft, 0, Lt, 0, 9.5, 9.72, 0.09)
        band(Ft, -0.1, Lt + 0.1, 0, TH, TH + 0.25, 0.12)
        k = 0.3
        while k < Lt:
            box('trim', Ft, k - 0.1, k + 0.1, 0, 0.42, TH + 0.25, TH + 0.5)
            k += 0.52
        band(Ft, -0.55, Lt + 0.55, 0, TH + 0.5, TH + 0.72, 0.58)
        band(Ft, -0.68, Lt + 0.68, 0, TH + 0.72, TH + 0.85, 0.70)
    BZ = TH + 0.85
    box('trim', F, T0 - 0.1, T1 + 0.1, TD1 - 0.1, TD0 + 0.1, BZ - 0.3, BZ + 0.35)      # площадка
    box('wall', F, T0 + 1.7, T1 - 1.7, TD1 + 1.7, TD0 - 1.7, BZ, BZ + 4.3)              # ядро бельведера
    BH = 3.7
    cu, cd = (T0 + T1) / 2, (TD0 + TD1) / 2
    hw = (T1 - T0) / 2 - 0.45
    for i in range(4):
        for j in range(4):
            if 0 < i < 3 and 0 < j < 3: continue
            base = F.p(cu - hw + 2 * hw * i / 3, cd - hw + 2 * hw * j / 3, BZ + 0.35)
            prof = [(0.27, 0), (0.27, 0.12), (0.22, 0.16)]
            prof += [(0.22 - 0.035 * (k / 5) ** 1.8, 0.16 + (BH - 0.5) * k / 5) for k in range(1, 6)]
            prof += [(0.21, BH - 0.32), (0.27, BH - 0.12), (0.29, BH - 0.1), (0.29, BH)]
            lathe('trim_s', base, prof, 12)
    z0 = BZ + 0.35 + BH
    box('trim', F, T0 + 0.15, T1 - 0.15, TD1 + 0.15, TD0 - 0.15, z0, z0 + 0.45)
    box('wall', F, T0 + 0.18, T1 - 0.18, TD1 + 0.18, TD0 - 0.18, z0 + 0.45, z0 + 0.8)
    box('trim', F, T0 - 0.25, T1 + 0.25, TD1 - 0.25, TD0 + 0.25, z0 + 0.8, z0 + 1.0)
    Ft = Frame(F.p(T0 - 0.25, 0, 0).xy, F.u, F.n)
    hip_roof(Ft, 0, T1 - T0 + 0.5, TD0 + 0.25, TD1 - 0.25, z0 + 1.0, 0.9, ov=0.05)
    # ---- восточный трёхэтажный корпус с плоской кровлей
    E0, E1, ED0, ED1 = 41.9, 54.2, -1.6, -24.8
    EH = 12.9
    es = [(Frame(F.p(E0, ED0, 0).xy, F.u, F.n), E1 - E0, 3),
          (Frame(F.p(E1, ED0, 0).xy, -F.n, F.u), ED0 - ED1, 6),
          (Frame(F.p(E1, ED1, 0).xy, -F.u, -F.n), E1 - E0, 3),
          (Frame(F.p(E0, ED1, 0).xy, F.n, -F.u), ED0 - ED1, 6)]
    for Fe, Le, bays in es:
        holes = []
        for za in (2.1, 5.7, 9.3):
            for i in range(bays):
                holes.append(window(Fe, Le * (i + 0.5) / bays, za, 1.3, 2.0, 0))
        wall(Fe, 0, Le, 0.95, EH, 0, holes)
        box('stone', Fe, 0, Le, -0.3, 0.08, GROUND, 0.95)
        cornice(Fe, 0, Le, 0, EH, ext=0.42)
        za = EH + 0.6
        beam('metal', Fe.p(0, 0.1, za + 0.95), Fe.p(Le, 0.1, za + 0.95), 0.05)
        beam('metal', Fe.p(0, 0.1, za + 0.5), Fe.p(Le, 0.1, za + 0.5), 0.03)
        k = 0.0
        while k <= Le + 0.01:
            beam('metal', Fe.p(k, 0.1, za), Fe.p(k, 0.1, za + 0.95), 0.04)
            k += Le / round(Le / 1.3)
    box('stone', F, E0, E1, ED1, ED0, EH + 0.3, EH + 0.6)
    return F

build_portico()
build_south()
build_north()


finish('hospital', __file__)
