# Б. Морская, 33 / ул. Суворова — угловой дом с лоджией-эркером (восстановлен
# в 1950-х из инкерманского камня) — модель с нуля.
#
#   blender -b --python models/bmorskaya33/build.py -- [glb]
#
# План — контур OSM way 92707334 (data/world.json), фасады — по описанию
# refs/center-models.json (фото в облаке не открыть). Что видно и что наугад —
# NOTES.md. Ноль высоты — земля у середины углового среза (ребро 8 контура).
#
# Контур (мир x, z): длинный корпус вдоль ул. Суворова (ребро 7, 47.5 м, на ЮВ),
# срезанный угол на перекрёсток (ребро 8, 13.6 м, на юг), короткая сторона на
# Б. Морскую (ребро 0, 12.2 м, на запад) и дворовое крыло у восточного торца
# (рёбра 4–6). Улица Суворова поднимается от Б. Морской на ~3 м — корпус
# поставлен тремя уступами (A, B, C), этажи в каждом ровные.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

P = [(-189.6, 1400.5), (-193.2, 1388.8), (-181.6, 1385.3), (-180.3, 1389.5), (-157.8, 1364.9),
     (-161.9, 1349.9), (-149.3, 1346.5), (-143.0, 1370.1), (-176.4, 1403.9)]
X0, Z0 = -183.0, 1402.2                       # середина углового среза
origin(X0, Z0)

# ------------------------------------------------------------------ цвета
COL['wall'] = ((0.835, 0.788, 0.651), 0.9)    # песчаник верхних этажей #d5c9a6
COL['wall2'] = ((0.898, 0.863, 0.776), 0.85)  # гладкая облицовка низа #e5dcc6
COL['trim'] = ((0.91, 0.89, 0.82), 0.85)      # карнизы, наличники, архивольты
COL['stone'] = ((0.60, 0.58, 0.54), 0.9)      # цоколь, дымники
COL['roof'] = ((0.47, 0.50, 0.48), 0.6)       # серый металл кровли #77807a
COL['glass'] = ((0.08, 0.10, 0.12), 0.15)
COL['wood'] = ((0.835, 0.788, 0.651), 0.9)    # = стена: балясины «в тон стены» (не в дальнем уровне)
COL['metal'] = ((0.20, 0.21, 0.22), 0.5)      # рамы витрин

GROUND = -3.0
# Уступы по ул. Суворова: (u от угла по ребру 7, отметка пола 1 этажа).
# Земля у стены по рельефу игры: +0.6 у угла … +3.5 у восточного торца.
SECT = [(0.0, 17.8, 0.8), (17.8, 35.6, 1.9), (35.6, 47.5, 2.9)]
BA, BB, BC = (s[2] for s in SECT)
TOP = 12.1          # верх стен над полом 1 этажа (низ карниза 11.5)
GF = 4.75           # граница облицовки низа и песчаника
F2, F3 = 5.6, 8.95  # подоконники 2 и 3 этажей
WH = 1.7            # высота окна

# ------------------------------------------------------------------ местная система
def V2(p): return Vector((p[0], p[1]))
_t = V2(P[7]) - V2(P[8]); EL7 = _t.length; _t.normalize()
_n = Vector((-_t.y, _t.x))                    # наружу (на ЮВ), мир (x, z)

def L(u, d):
    """Мир (x, z) по местной системе: u — от угла вдоль ул. Суворова, d — наружу."""
    v = V2(P[8]) + _t * u + _n * d
    return (v.x, v.y)

def loc(p):
    v = V2(p) - V2(P[8])
    return v.dot(_t), v.dot(_n)

def on_e3(u):
    """Точка ребра 3 (двор, P3→P4) с местной координатой u."""
    (ua, _), (ub, _) = loc(P[3]), loc(P[4])
    s = (u - ua) / (ub - ua)
    return (P[3][0] + (P[4][0] - P[3][0]) * s, P[3][1] + (P[4][1] - P[3][1]) * s)

# обход контура в плане Blender: знак площади даёт сторону «наружу»
_pl = [W(*p) for p in P]
_area = sum(_pl[i].x * _pl[(i + 1) % 9].y - _pl[(i + 1) % 9].x * _pl[i].y for i in range(9))

def efr(a, b):
    """Рамка фасада по отрезку a→b, идущему в порядке обхода контура."""
    o = W(*a); u = (W(*b) - o).normalized()
    n = Vector((u.y, -u.x)) if _area > 0 else Vector((-u.y, u.x))
    return Frame(o, u, n), (W(*b) - o).length

FA, _ = efr(P[7], P[8])                       # ребро 7 в обходе идёт от P7 к P8,
FA = Frame(W(*P[8]), -FA.u, FA.n)             # а рамку ведём от угла: u = 0 у P8

# ------------------------------------------------------------------ примитивы дома
def arch(F, cu, za, zs, r, m='wall2', d=0.0):
    """Арочная витрина: проём (cu±r, za…zs+r) уже вырезан в стене wall()."""
    seg = 8
    arc = [(cu + r * math.cos(math.pi * k / seg), zs + r * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
    hs = seg // 2
    face(m, [F.p(cu + r, d, zs + r)] + [F.p(u, d, z) for u, z in arc[:hs + 1]], F.N())
    face(m, [F.p(cu - r, d, zs + r)] + [F.p(u, d, z) for u, z in arc[hs:]], F.N())
    g = d - 0.22
    ro = r + 0.26
    for k in range(seg):
        (ua, za_), (ub, zb_) = arc[k], arc[k + 1]
        face('trim', [F.p(ua, d, za_), F.p(ub, d, zb_), F.p(ub, d - 0.24, zb_), F.p(ua, d - 0.24, za_)],
             F.p(cu, d, zs) - F.p((ua + ub) / 2, d, (za_ + zb_) / 2))
        # архивольт: лицо и внешний торец
        c0, s0 = math.cos(math.pi * k / seg), math.sin(math.pi * k / seg)
        c1, s1 = math.cos(math.pi * (k + 1) / seg), math.sin(math.pi * (k + 1) / seg)
        A = (cu + r * c0, zs + r * s0); B = (cu + r * c1, zs + r * s1)
        C = (cu + ro * c1, zs + ro * s1); D = (cu + ro * c0, zs + ro * s0)
        face('trim', [F.p(u, d + 0.07, z) for u, z in (A, B, C, D)], F.N())
        face('trim', [F.p(D[0], d, D[1]), F.p(C[0], d, C[1]), F.p(C[0], d + 0.07, C[1]), F.p(D[0], d + 0.07, D[1])],
             F.p(D[0], d, D[1]) - F.p(cu, d, zs))
    box('trim', F, cu - 0.2, cu + 0.2, d, d + 0.12, zs + r - 0.05, zs + ro + 0.12)     # замковый камень
    for s in (-1, 1):                                                                  # обрамление по бокам
        u0, u1 = sorted((cu + s * r, cu + s * ro))
        box('trim', F, u0, u1, d, d + 0.07, za, zs, bottom=False)
    # стекло и рама витрины
    face('glass', [F.p(cu - r, g, za), F.p(cu + r, g, za), F.p(cu + r, g, zs), F.p(cu - r, g, zs)], F.N())
    face('glass', [F.p(u, g, z) for u, z in arc], F.N())
    t = 0.07
    for u in (cu - r + t / 2, cu, cu + r - t / 2):
        box('metal', F, u - t / 2, u + t / 2, g, g + 0.06, za, zs, bottom=False)
    box('metal', F, cu - r, cu + r, g, g + 0.06, zs - t, zs, bottom=False)
    box('metal', F, cu - r, cu + r, g, g + 0.06, za, za + 0.35, bottom=False)          # подоконная доска витрины
    return (cu - r, cu + r, za, zs + r)

def cheap_window(F, cu, za, w=1.2, h=1.6):
    """Дворовое окно: стекло в откосе и импост — без наличника."""
    g = -0.22
    face('glass', [F.p(cu - w / 2, g, za), F.p(cu + w / 2, g, za), F.p(cu + w / 2, g, za + h), F.p(cu - w / 2, g, za + h)], F.N())
    box('trim', F, cu - 0.035, cu + 0.035, g, g + 0.06, za, za + h, bottom=False)
    return (cu - w / 2, cu + w / 2, za, za + h)

def axes(u0, u1, n):
    return [u0 + (k + 0.5) * (u1 - u0) / n for k in range(n)]

def quoins(F, u, s, z0, z1):
    """Лёгкий руст на углу: камни поочерёдно 0.6 и 0.4 м, s = +1 — внутрь фасада вправо."""
    z, k = z0, 0
    while z < z1 - 0.1:
        h = min(0.42, z1 - z)
        ww = 0.62 if k % 2 == 0 else 0.42
        a, b = sorted((u, u + s * ww))
        box('trim', F, a, b, 0, 0.05, z + 0.03, z + h - 0.03, bottom=False)
        z += h; k += 1

def balustrade(F, u0, u1, d0, d1, z0, H=0.85):
    """Балюстрада: плинтус, балясины, поручень. Балясины — в цвет стены."""
    box('trim', F, u0, u1, d0, d1, z0, z0 + 0.12)
    box('trim', F, u0 - 0.04, u1 + 0.04, d0, d1 + 0.04, z0 + H - 0.1, z0 + H)
    n = max(2, int((u1 - u0) / 0.32))
    dm = (d0 + d1) / 2
    prof = [(0.06, 0.0), (0.05, 0.1), (0.09, 0.3), (0.045, 0.56), (0.06, H - 0.22)]
    for k in range(n):
        u = u0 + (k + 0.5) * (u1 - u0) / n
        lathe('wood', F.p(u, dm, z0 + 0.12), prof, seg=6, cap=False)

def ionic(F, cu, d, z0, H, w=0.5):
    """Ионическая пилястра: база, ствол, эхин, две волюты, абака."""
    box('trim', F, cu - w / 2 - 0.08, cu + w / 2 + 0.08, d, d + 0.2, z0, z0 + 0.3)
    box('trim', F, cu - w / 2, cu + w / 2, d, d + 0.14, z0 + 0.3, z0 + H - 0.42, bottom=False)
    box('trim', F, cu - w / 2 - 0.03, cu + w / 2 + 0.03, d, d + 0.18, z0 + H - 0.42, z0 + H - 0.28)
    for s in (-1, 1):
        c, r = cu + s * (w / 2 + 0.02), 0.13
        poly = [(c + r * math.cos(2 * math.pi * k / 8), z0 + H - 0.3 + r * math.sin(2 * math.pi * k / 8)) for k in range(8)]
        prism_uz('trim', F, poly, d, d + 0.22)
    box('trim', F, cu - w / 2 - 0.17, cu + w / 2 + 0.17, d, d + 0.22, z0 + H - 0.16, z0 + H)

def plinth(F, u0, u1, z1):
    box('stone', F, u0, u1, -0.02, 0.06, GROUND, z1, bottom=False)

# ------------------------------------------------------------------ уличный фасад
def street(F, u0, u1, base, us, r=1.5, balcony=None, edge_end=None):
    """Фасад на улицу: низ — светлая облицовка с арками витрин, выше — песчаник."""
    plinth(F, u0, u1, base + 0.3)
    gh = [arch(F, cu, base + 0.3, base + 2.5, r) for cu in us]
    wall(F, u0, u1, GROUND, base + GF, 0.0, gh, m='wall2')
    band(F, u0, u1, 0.0, base + 4.55, base + 4.85, 0.14)
    up = []
    for cu in us:
        if balcony is not None and abs(cu - balcony) < 0.1:
            # балкон 2 этажа: дверь вместо окна, плита на консолях, балюстрада
            za = base + 5.05
            surround(F, cu - 0.6, cu + 0.6, za, za + 2.3, 0.0)
            glazing(F, cu - 0.6, cu + 0.6, za, za + 2.3, 0.0, rows=(0.75,))
            up.append((cu - 0.6, cu + 0.6, za, za + 2.3))
            box('trim', F, cu - 1.5, cu + 1.5, 0.0, 1.0, za - 0.2, za)
            for s in (-1, 1):
                prism_uz('trim', F, [(cu + s * 1.1 - 0.12, za - 0.2), (cu + s * 1.1 + 0.12, za - 0.2),
                                     (cu + s * 1.1 + 0.12, za - 0.85)], 0.0, 0.85)
            balustrade(F, cu - 1.45, cu + 1.45, 0.82, 0.96, za)
            for s in (-1, 1):
                balustrade(F, cu + s * 1.45 - 0.07, cu + s * 1.45 + 0.07, 0.05, 0.82, za)
        else:
            up.append(window(F, cu, base + F2, 1.2, WH, 0.0))
        up.append(window(F, cu, base + F3, 1.2, WH, 0.0))
    wall(F, u0, u1, base + GF, base + TOP, 0.0, up)
    for z in (F2, F3):                                                     # подоконные пояса
        band(F, u0, u1, 0.0, base + z - 0.22, base + z - 0.12, 0.06)
    cornice(F, u0, u1, 0.0, base + 11.5)

def yard(F, u0, u1, base, n, ground_floor=True):
    """Дворовый фасад: ровная стена, окна без наличников, простой карниз."""
    plinth(F, u0, u1, base + 0.3)
    hs = []
    for cu in axes(u0, u1, n):
        if ground_floor:
            hs.append(cheap_window(F, cu, base + 1.1, 1.2, 1.6))
        hs.append(cheap_window(F, cu, base + F2, 1.2, WH))
        hs.append(cheap_window(F, cu, base + F3, 1.2, WH))
    wall(F, u0, u1, GROUND, base + TOP, 0.0, hs)
    band(F, u0 - 0.1, u1 + 0.1, 0.0, base + 11.5, base + 11.9, 0.22)

# ================================================================== ФАСАДЫ
# --- ул. Суворова (ребро 7): 8 осей поровну на 47.5 м, три уступа
AX7 = axes(0.0, EL7, 8)
for (u0, u1, base) in SECT:
    street(FA, u0, u1, base, [u for u in AX7 if u0 < u < u1], balcony=AX7[1])
quoins(FA, EL7, -1, BC + GF, BC + 11.5)

# --- угловой срез (ребро 8): внизу широкая арка и дверь, на 2 этаже
#     застеклённый эркер — три больших окна между ионическими пилястрами
#     (крайние сдвоены) над балюстрадой, на 3 этаже небольшие окна
F8, L8 = efr(P[8], P[0])
b = BA
plinth(F8, 0, L8, b + 0.3)
gh = [arch(F8, 5.0, b + 0.3, b + 2.1, 2.0)]
door = (9.5, 10.9, b + 0.3, b + 3.2)
g = -0.22
face('glass', [F8.p(door[0], g, door[2]), F8.p(door[1], g, door[2]), F8.p(door[1], g, door[3]), F8.p(door[0], g, door[3])], F8.N())
box('metal', F8, 10.17, 10.23, g, g + 0.06, door[2], door[3] - 0.7, bottom=False)
box('metal', F8, door[0], door[1], g, g + 0.06, door[3] - 0.75, door[3] - 0.68, bottom=False)
surround(F8, *door, 0.0)
gh.append(door)
wall(F8, 0, L8, GROUND, b + GF, 0.0, gh, m='wall2')
band(F8, 0, L8, 0.0, b + 4.55, b + 4.85, 0.14)
up = []
for cu in (3.4, 6.8, 10.2):
    up.append((cu - 1.2, cu + 1.2, b + 5.75, b + 7.55))
    glazing(F8, cu - 1.2, cu + 1.2, b + 5.75, b + 7.55, 0.0, cols=3, rows=(0.7,))
    balustrade(F8, cu - 1.15, cu + 1.15, 0.0, 0.3, b + 4.88)
    up.append(window(F8, cu, b + 9.3, 1.0, 1.15, 0.0))
wall(F8, 0, L8, b + GF, b + TOP, 0.0, up)
for cu, w in ((0.95, 0.42), (1.55, 0.42), (5.1, 0.55), (8.5, 0.55), (12.05, 0.42), (12.65, 0.42)):
    ionic(F8, cu, 0.0, b + 4.85, 3.2, w)
band(F8, 0, L8, 0.0, b + 8.05, b + 8.35, 0.2)                          # антаблемент над пилястрами
band(F8, 0, L8, 0.0, b + 9.08, b + 9.18, 0.06)
cornice(F8, 0, L8, 0.0, b + 11.5)

# --- Б. Морская (ребро 0): две оси
F0, L0 = efr(P[0], P[1])
street(F0, 0, L0, BA, axes(0, L0, 2), r=1.4)
quoins(F0, L0, -1, BA + GF, BA + 11.5)

# --- двор
F1, L1 = efr(P[1], P[2]); yard(F1, 0, L1, BA, 3)
F2r, L2 = efr(P[2], P[3]); yard(F2r, 0, L2, BA, 1)
F3r, L3 = efr(P[3], P[4])
cut = [0.0] + [(V2(on_e3(u)) - V2(P[3])).length for u in (SECT[1][0], SECT[2][0])] + [L3]
for i, base in enumerate((BA, BB, BC)):
    yard(F3r, cut[i], cut[i + 1], base, max(1, round((cut[i + 1] - cut[i]) / 3.9)))
F4, L4 = efr(P[4], P[5]); yard(F4, 0, L4, BC, 4)
F5, L5 = efr(P[5], P[6]); yard(F5, 0, L5, BC, 3)
F6, L6 = efr(P[6], P[7]); yard(F6, 0, L6, BC, 6)

# --- стенки уступов над нижним корпусом
for ul, bl, bh in ((SECT[0][1], BA, BB), (SECT[1][1], BB, BC)):
    o = W(*L(ul, 0)); u = W(*on_e3(ul)) - o
    FX = Frame(o, u, -FA.u)                   # лицом к нижнему уступу
    wall(FX, 0, u.length, bl + TOP - 0.02, bh + TOP, 0.0, [])
    cornice(FX, 0, u.length, 0.0, bh + 11.5)

# ================================================================== КРОВЛЯ
def cap(pts, z):
    face('roof', [Vector((W(*p).x, W(*p).y, z)) for p in pts], UP)

U1, U2 = SECT[0][1], SECT[1][1]
cap([P[8], P[0], P[1], P[2], P[3], on_e3(U1), L(U1, 0)], BA + TOP)
cap([L(U1, 0), on_e3(U1), on_e3(U2), L(U2, 0)], BB + TOP)
cap([L(U2, 0), on_e3(U2), P[4], P[5], P[6], P[7]], BC + TOP)
# над корпусом вдоль Суворова — низкие скаты, со стороны улицы их прячет карниз
RISE = 0.9
hip_roof(FA, 0.4, U1 - 0.05, -0.35, -12.6, BA + TOP + 0.02, RISE, ov=0, hip0=True, hip1=False)
hip_roof(FA, U1, U2 - 0.05, -0.35, -13.0, BB + TOP + 0.02, RISE, ov=0, hip0=True, hip1=False)
hip_roof(FA, U2, EL7 - 0.4, -0.35, -13.5, BC + TOP + 0.02, RISE, ov=0, hip0=True, hip1=True)
for u, d, base in ((6.0, -9.0, BA), (13.5, -4.0, BA), (24.0, -9.5, BB), (31.0, -4.5, BB), (41.0, -10.0, BC)):
    z0 = base + TOP
    box('stone', FA, u - 0.4, u + 0.4, d - 0.3, d + 0.3, z0, z0 + 1.8)
    box('trim', FA, u - 0.48, u + 0.48, d - 0.38, d + 0.38, z0 + 1.8, z0 + 1.92)

finish('bmorskaya33', __file__)
