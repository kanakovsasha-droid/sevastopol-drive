# Большая Морская, 20 — трёхэтажный жилой дом с рустованным низом и магазинами.
#
#   python3.13 models/bm20/build.py -- [glb]      (bpy из pip, Blender 5.2)
#   blender -b --python models/bm20/build.py -- [glb]
#
# План — контур OSM w90821942: прямоугольник 40.1 × 13.3 м вдоль улицы и
# пристройка 13.3 × 3.5 м во двор у южного конца. Фасад — по описанию фото
# «Велика Морська 20» (refs/center-models.json): 3 этажа, высокий рустованный
# низ с магазинами, ступени с балюстрадой справа, парные арочные окна на
# двух осях, три балкона с решётками и эркер с балконом слева, карниз с
# дентикулами, ограждение крыши. Что сделано наугад — NOTES.md.
#
# Ноль высоты — тротуар посередине фасада. Улица под фасадом поднимается к
# югу на 0.8 м, двор ниже улицы на 1.5–2 м: стены уходят до −3 м.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

X0, Z0 = -313.3, 1042.0          # середина уличного фасада (ребро 0 контура)
origin(X0, Z0)

COL['wall'] = ((0.894, 0.871, 0.784), 0.9)     # #e4dec8, гладкая облицовка
COL['wall2'] = ((0.84, 0.80, 0.70), 0.9)       # рустованный низ, тон темнее
COL['roof'] = ((0.353, 0.322, 0.294), 0.85)    # #5a524b
COL['trim'] = ((0.94, 0.92, 0.86), 0.85)
COL['wood'] = ((0.80, 0.76, 0.66), 0.9)        # руст: камень, в дальний уровень не идёт
COL['metal'] = ((0.12, 0.12, 0.13), 0.5)       # решётки, двери, ограждение

A, B = (-318.0, 1022.5), (-308.6, 1061.5)       # северный и южный концы фасада
INSIDE = (-322.0, 1044.0)
F, L = frame_from(B, A, INSIDE)                 # u: слева направо с улицы (юг → север)
DEP = 13.3                                      # глубина корпуса
ANX_U, ANX_D = 13.25, 16.8                      # пристройка во двор: u 0…13.25

GROUND = -3.0
G1 = 4.2                 # верх рустованного низа
F2, F3 = 4.2, 7.8        # уровни 2 и 3 этажей
EAVE = 11.3              # низ карниза
COR = 12.0               # верх карниза = плоская кровля
TOP = 12.5               # верх парапета

BAYS = 9
STEP = L / BAYS
AX = [STEP * (i + 0.5) for i in range(BAYS)]
PAIR = (1, 7)            # оси с парными арочными окнами
BALC = (2, 3, 4)         # балконы с решётками, 2 этаж
ERK = 0                  # эркер с балконом наверху
ENTRY = 8                # вход по ступеням справа


# ------------------------------------------------------------------ свои примитивы
def rust(Fr, u0, u1, d, z0, z1, h=0.6, gap=0.05, pr=0.05):
    """Рустованная кладка: горизонтальные ряды с рустами-швами."""
    z = z0
    while z < z1 - 0.1:
        zt = min(z + h, z1)
        box('wood', Fr, u0, u1, d, d + pr, z + gap, zt, bottom=False)
        z = zt

def arch_win(Fr, cu, sill, r, zs, d, seg=8, m='wall'):
    """Арочное окно: проём под wall() — (cu±r, sill…zs+r), углы над дугой — стена."""
    arc = [(cu + r * math.cos(math.pi * k / seg), zs + r * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
    hs = seg // 2
    face(m, [Fr.p(cu + r, d, zs + r)] + [Fr.p(u, d, z) for u, z in arc[:hs + 1]], Fr.N())
    face(m, [Fr.p(cu - r, d, zs + r)] + [Fr.p(u, d, z) for u, z in arc[hs:]], Fr.N())
    g = d - 0.2
    face('glass', [Fr.p(cu - r, g, sill), Fr.p(cu + r, g, sill)] + [Fr.p(u, g, z) for u, z in arc], Fr.N())
    for k in range(seg):                                   # архивольт
        (ua, za), (ub, zb) = arc[k], arc[k + 1]
        ro = r + 0.16
        oa = (cu + ro * math.cos(math.pi * k / seg), zs + ro * math.sin(math.pi * k / seg))
        ob = (cu + ro * math.cos(math.pi * (k + 1) / seg), zs + ro * math.sin(math.pi * (k + 1) / seg))
        face('trim', [Fr.p(ua, d + 0.05, za), Fr.p(ub, d + 0.05, zb), Fr.p(ob[0], d + 0.05, ob[1]),
                      Fr.p(oa[0], d + 0.05, oa[1])], Fr.N())
    box('trim', Fr, cu - 0.03, cu + 0.03, g, g + 0.05, sill, zs + r - 0.02)
    box('trim', Fr, cu - r, cu + r, g, g + 0.05, zs - 0.03, zs + 0.03)
    box('trim', Fr, cu - r - 0.16, cu - r, d, d + 0.05, sill, zs)
    box('trim', Fr, cu + r, cu + r + 0.16, d, d + 0.05, sill, zs)

def railing(Fr, u0, u1, d0, d1, z, h=1.0, sp=0.24):
    """Кованая решётка балкона: поручень, нижняя тяга, прутья."""
    pts = [(u0, d0), (u0, d1), (u1, d1), (u1, d0)]
    for (ua, da), (ub, db) in zip(pts, pts[1:]):
        p0, p1 = Fr.p(ua, da, z), Fr.p(ub, db, z)
        beam('metal', p0 + UP * h, p1 + UP * h, 0.06, 0.05)
        beam('metal', p0 + UP * 0.12, p1 + UP * 0.12, 0.04)
        n = max(1, int((p1 - p0).length / sp))
        for k in range(1, n):
            q = p0 + (p1 - p0) * (k / n)
            box('metal', Frame(q.xy, Fr.u, Fr.n), -0.012, 0.012, -0.012, 0.012, z + 0.12, z + h, bottom=False)

def slab(Fr, u0, u1, d1, z, t=0.18):
    """Плита балкона на двух консолях."""
    box('trim', Fr, u0, u1, 0, d1, z - t, z)
    for u in (u0 + 0.2, u1 - 0.32):
        Fs = Frame(Fr.p(u, 0, 0).xy, Fr.n, Fr.u)
        prism_uz('trim', Fs, [(0, z - t), (d1 - 0.1, z - t), (0, z - t - 0.55)], 0, 0.12)

def plain_win(Fr, cu, za, w, h, d):
    """Дешёвое окно для двора и торцов: проём (через wall), стекло, подоконник."""
    g = d - 0.18
    face('glass', [Fr.p(cu - w / 2, g, za), Fr.p(cu + w / 2, g, za), Fr.p(cu + w / 2, g, za + h),
                   Fr.p(cu - w / 2, g, za + h)], Fr.N())
    box('trim', Fr, cu - w / 2 - 0.08, cu + w / 2 + 0.08, d, d + 0.1, za - 0.08, za, bottom=False)
    box('trim', Fr, cu - 0.03, cu + 0.03, g, g + 0.05, za, za + h, bottom=False)


# ------------------------------------------------------------------ уличный фасад
def street_facade():
    holes = []
    # низ: витрины по осям, у входа справа — дверь над ступенями
    shop = []
    for i, cu in enumerate(AX):
        if i == ENTRY:
            continue
        door = i in (1, 4, 6)                      # двери магазинов — наугад
        za = 0.15 if door else 0.75
        shop.append((cu, za, 2.5 if not door else 2.2, 3.25 - za))
    for cu, za, w, h in shop:
        holes.append((cu - w / 2, cu + w / 2, za, za + h))
    ec = AX[ENTRY]
    holes.append((ec - 0.8, ec + 0.8, 0.75, 3.55))
    # верх
    up = []
    for i, cu in enumerate(AX):
        for z0 in (F2, F3):
            if i in PAIR:
                continue
            door = (z0 == F2 and i in BALC) or (z0 == F3 and i == ERK)
            za = z0 + (0.08 if door else 0.9)
            up.append((cu, za, 1.3, z0 + 3.0 - za, door))
    for cu, za, w, h, _ in up:
        holes.append((cu - w / 2, cu + w / 2, za, za + h))
    arches = []
    for i in PAIR:
        for z0 in (F2, F3):
            for s in (-1, 1):
                arches.append((AX[i] + s * 0.48, z0 + 0.9, 0.36, z0 + 2.62))
    for cu, sill, r, zs in arches:
        holes.append((cu - r, cu + r, sill, zs + r))
    # стены: низ — wall2 с рустом, верх — гладкий wall
    low = [h for h in holes if h[3] <= G1 + 0.01]
    high = [h for h in holes if h[2] >= G1 - 0.01]
    wall(F, 0, L, 0.45, G1, 0, low, m='wall2')
    wall(F, 0, L, G1, EAVE, 0, high)
    box('stone', F, -0.1, L + 0.1, -0.3, 0.1, GROUND, 0.45)
    piers = sorted({0, L, *[x for h in low for x in h[:2]]})
    for a, b in zip(piers[::2], piers[1::2]):
        rust(F, a, b, 0, 0.45, G1 - 0.35)
    band(F, 0, L, 0, G1 - 0.35, G1, 0.16)                        # пояс над рустом
    band(F, 0, L, 0, F3 - 0.12, F3 + 0.02, 0.06)                   # междуэтажная тяга
    for cu, za, w, h in shop:
        glazing(F, cu - w / 2, cu + w / 2, za, za + h, 0, cols=2, rows=(0.78,))
        box('trim', F, cu - w / 2 - 0.1, cu + w / 2 + 0.1, 0, 0.12, za + h, za + h + 0.12)
    for cu, za, w, h, door in up:
        window(F, cu, za, w, h, 0, cols=2, rows=(0.72,) if not door else (0.45, 0.78))
        if not door:
            box('trim', F, cu - w / 2 - 0.25, cu + w / 2 + 0.25, 0, 0.18, za + h + 0.16, za + h + 0.3)   # сандрик-полка
    for a in arches:
        arch_win(F, a[0], a[1], a[2], a[3], 0)
    for i in PAIR:                                                # общий подоконник пары
        for z0 in (F2, F3):
            box('trim', F, AX[i] - 1.05, AX[i] + 1.05, 0, 0.14, z0 + 0.78, z0 + 0.9)
    # вход: дверь, ступени с лёгкой балюстрадой (справа, улица здесь ниже)
    g = -0.22
    face('metal', [F.p(ec - 0.8, g, 0.75), F.p(ec + 0.8, g, 0.75), F.p(ec + 0.8, g, 3.0), F.p(ec - 0.8, g, 3.0)], F.N())
    face('glass', [F.p(ec - 0.8, g, 3.0), F.p(ec + 0.8, g, 3.0), F.p(ec + 0.8, g, 3.55), F.p(ec - 0.8, g, 3.55)], F.N())
    box('trim', F, ec - 1.05, ec + 1.05, 0, 0.12, 3.55, 3.75)
    n, rise, run = 5, 0.15, 0.32
    for k in range(n):
        top = 0.75 - rise * k
        box('stone', F, ec - 1.5, ec + 1.5, 0, 0.6 + run * k, -1.0, top)
    for s in (-1, 1):
        u = ec + s * 1.6
        box('stone', F, u - 0.12, u + 0.12, 0, 0.6 + run * (n - 1), -1.0, 0.2)
        a, b = F.p(u, 0.15, 1.65), F.p(u, 0.6 + run * (n - 1), 1.05)
        beam('trim', a, b, 0.16, 0.1)
        for k in range(1, 7):
            q = a + (b - a) * (k / 7)
            beam('trim', q, Vector((q.x, q.y, 0.75 - rise * int(k * n / 7) if k < 7 else 0.2)), 0.07)
    # балконы 2 этажа с решётками
    for i in BALC:
        cu = AX[i]
        slab(F, cu - 1.15, cu + 1.15, 0.8, F2 + 0.08)
        railing(F, cu - 1.15, cu + 1.15, 0, 0.8, F2 + 0.08)
    # эркер на консолях во 2 этаже, наверху — большой балкон 3 этажа
    cu = AX[ERK]
    e0, e1, ed = cu - 1.7, cu + 1.7, 0.9
    box('trim', F, e0 - 0.1, e1 + 0.1, 0, ed + 0.1, F2 - 0.05, F2 + 0.15)
    for u in (e0 + 0.25, cu, e1 - 0.25):
        Fs = Frame(F.p(u, 0, 0).xy, F.n, F.u)
        prism_uz('trim', Fs, [(0, F2 - 0.05), (ed, F2 - 0.05), (0, F2 - 0.9)], -0.12, 0.12)
    Fe = Frame(F.p(0, ed, 0).xy, F.u, F.n)
    eh = [(cu - 1.15, cu - 0.2, F2 + 0.95, F2 + 2.85), (cu + 0.2, cu + 1.15, F2 + 0.95, F2 + 2.85)]
    wall(Fe, e0, e1, F2 + 0.15, F3 - 0.15, 0, eh)
    for ua, ub, za, zb in eh:
        glazing(Fe, ua, ub, za, zb, 0, cols=1, rows=(0.7,))
    for s, uu in ((-1, e0), (1, e1)):
        Fs = Frame(F.p(uu, 0, 0).xy, F.n, F.u * s)
        wall(Fs, 0, ed, F2 + 0.15, F3 - 0.15, 0, [])
    box('trim', F, e0 - 0.12, e1 + 0.12, 0, ed + 0.14, F3 - 0.15, F3 + 0.05)
    railing(F, e0 - 0.05, e1 + 0.05, 0, ed + 0.08, F3 + 0.05)
    # венчание: карниз с дентикулами и парапет-ограждение
    cornice(F, 0, L, 0, EAVE, ext=0.7)
    u = 0.15
    while u < L - 0.1:
        box('trim', F, u, u + 0.16, 0.08, 0.26, EAVE - 0.2, EAVE, bottom=False)
        u += 0.42
    band(F, 0, L, 0, EAVE - 0.32, EAVE - 0.2, 0.12)


# ------------------------------------------------------------------ торцы и двор
def plain_side(Fr, u0, u1, bays, rust_low=True, z_top=EAVE, cor=True):
    holes, wins = [], []
    step = (u1 - u0) / bays
    for i in range(bays):
        cu = u0 + step * (i + 0.5)
        for z0, h in ((0.9, 2.3), (F2 + 0.9, 2.1), (F3 + 0.9, 2.1)):
            wins.append((cu, z0, 1.2, h))
            holes.append((cu - 0.6, cu + 0.6, z0, z0 + h))
    low = [h for h in holes if h[3] <= G1]
    wall(Fr, u0, u1, GROUND, G1, 0, low, m='wall2', reveal=0.18)
    wall(Fr, u0, u1, G1, z_top, 0, [h for h in holes if h[2] >= G1], reveal=0.18)
    for w in wins:
        plain_win(Fr, *w, 0)
    if rust_low:
        piers = sorted({u0, u1, *[x for h in low for x in h[:2]]})
        for a, b in zip(piers[::2], piers[1::2]):
            rust(Fr, a, b, 0, 0.45, G1 - 0.35)
    band(Fr, u0, u1, 0, G1 - 0.35, G1, 0.12)
    if cor:
        cornice(Fr, u0, u1, 0, EAVE, ext=0.5)

def sides():
    # северный торец (к Таврической лестнице): u = L, d 0 … −DEP
    Fn = Frame(F.p(L, 0, 0).xy, -F.n, F.u)
    plain_side(Fn, 0, DEP, 3)
    # южный торец: u = 0, d 0 … −ANX_D
    Fs = Frame(F.p(0, -ANX_D, 0).xy, F.n, -F.u)
    plain_side(Fs, 0, ANX_D, 4)
    # двор: корпус за пристройкой и сама пристройка
    Fy = Frame(F.p(L, -DEP, 0).xy, -F.u, -F.n)
    plain_side(Fy, 0, L - ANX_U, 6, rust_low=False)
    Fa = Frame(F.p(ANX_U, -ANX_D, 0).xy, -F.u, -F.n)
    plain_side(Fa, 0, ANX_U, 3, rust_low=False)
    Fk = Frame(F.p(ANX_U, -DEP, 0).xy, -F.n, F.u)                 # уступ пристройки
    wall(Fk, 0, ANX_D - DEP, GROUND, EAVE, 0, [])
    cornice(Fk, 0, ANX_D - DEP, 0, EAVE, ext=0.5)


# ------------------------------------------------------------------ кровля
def roof():
    poly = [(0, 0), (L, 0), (L, -DEP), (ANX_U, -DEP), (ANX_U, -ANX_D), (0, -ANX_D)]
    face('roof', [F.p(u, d, COR - 0.1) for u, d in poly], UP)
    # парапет по периметру: невысокая стенка с полкой
    n = len(poly)
    for i in range(n):
        (ua, da), (ub, db) = poly[i], poly[(i + 1) % n]
        p0, p1 = F.p(ua, da, 0).xy, F.p(ub, db, 0).xy
        uu = (p1 - p0).normalized()
        nn = Vector((-uu.y, uu.x))
        if nn.dot(F.p(L / 2, -DEP / 2, 0).xy - p0) > 0: nn = -nn
        Fr = Frame(p0, uu, nn)
        ln = (p1 - p0).length
        box('wall', Fr, 0, ln, -0.3, 0.0, COR - 0.1, TOP - 0.08)
        box('trim', Fr, -0.05, ln + 0.05, -0.35, 0.06, TOP - 0.08, TOP)
    # трубы и выход на кровлю
    chimney(F, 9.0, -9.5, COR - 0.1, COR + 1.6)
    chimney(F, 30.5, -9.0, COR - 0.1, COR + 1.5)
    box('wall', F, 20.0, 22.4, -8.0, -5.6, COR - 0.1, COR + 2.1)
    box('trim', F, 19.9, 22.5, -8.1, -5.5, COR + 2.1, COR + 2.25)


street_facade()
sides()
roof()
finish('bm20', __file__, tri_budget=10000)
