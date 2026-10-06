# Суворова, 2/7 (Черноморка) — пятиэтажный жилой дом «покоем» на углу
# ул. Суворова, OSM way 92717225 (building=apartments, building:levels=5).
# Модель с нуля; фото нет — всё, кроме плана и этажности, сдержанно в духе
# соседних сталинок (что наугад — NOTES.md).
#
#   blender -b --python models/suvorova27/build.py -- [glb]
#   (или python3.13 models/suvorova27/build.py -- glb с модулем bpy)
#
# План — контур OSM как есть: северный корпус вдоль 36.8 м, восточное крыло
# на ул. Суворова 36.9 м, западное крыло 23.8 м скошено вдоль ул. Дроздова;
# двор открыт на юго-запад. Рельеф игры поднимается с северо-запада на
# юго-восток на 10 м, поэтому дом разбит на три секции, каждая на этаж выше
# предыдущей: A — западное крыло и запад северного корпуса, B — восток
# северного корпуса и север восточного крыла (угол на Суворова), C — юг
# восточного крыла. У каждой секции своя вальмовая кровля; на стыках —
# глухой брандмауэр. Окна, которые ушли бы в землю, не прорезаются.
# Ноль высоты — земля у северо-восточного угла (Суворова), 40.23 м.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

PTS = [(-235.4, 531.2), (-253.7, 533.9), (-260.9, 549.6), (-272.6, 544.4),
       (-262.8, 522.7), (-226.4, 517.4), (-219.5, 553.6), (-230.8, 555.8)]
P0, P1, P2, P3, P4, P5, P6, P7 = PTS
X0, Z0 = P5                              # северо-восточный угол, на Суворова
H0 = 40.23                               # terrain.gridHeightAt(X0, Z0)
origin(X0, Z0)

COL['wall'] = ((0.878, 0.839, 0.741), 0.9)    # #e0d6bd, refs/center-models.json
COL['wall2'] = ((0.83, 0.79, 0.69), 0.9)      # первый этаж — тёсаный камень, чуть темнее
COL['wall3'] = ((0.64, 0.60, 0.52), 0.9)      # швы руста
COL['trim'] = ((0.93, 0.91, 0.86), 0.85)      # тяги, карниз, рамы
COL['stone'] = ((0.58, 0.56, 0.52), 0.9)      # цоколь
COL['roof'] = ((0.478, 0.478, 0.478), 0.8)    # #7a7a7a — крашеная жесть
COL['glass'] = ((0.10, 0.12, 0.15), 0.15)
COL['wood'] = ((0.30, 0.20, 0.13), 0.6)
COL['metal'] = ((0.20, 0.21, 0.22), 0.5)

# Земля игры (terrain.gridHeightAt) сеткой: строки z = 505 … 565 через 7.5 м,
# столбцы x = −285 … −205 через 8 м. Замер 06.10.2026.
GZ0, GDZ, GX0, GDX = 505.0, 7.5, -285.0, 8.0
GRID = [
    [34.6, 35.0, 35.5, 35.9, 36.3, 36.6, 36.9, 37.7, 38.7, 39.5, 39.4],
    [34.5, 35.2, 35.9, 36.3, 36.4, 36.5, 37.0, 38.3, 40.1, 40.8, 40.8],
    [34.6, 35.6, 36.3, 36.5, 36.5, 37.2, 38.8, 40.4, 41.5, 42.0, 42.1],
    [35.5, 36.5, 36.9, 36.8, 37.0, 40.0, 40.6, 41.5, 42.7, 43.2, 43.3],
    [36.5, 37.3, 37.3, 37.0, 38.6, 41.1, 42.1, 42.3, 43.4, 44.0, 44.5],
    [37.6, 37.8, 37.5, 37.7, 39.8, 43.4, 43.8, 43.5, 44.0, 45.1, 45.6],
    [38.1, 38.1, 37.9, 39.0, 42.8, 46.6, 45.9, 45.0, 45.3, 46.1, 46.6],
    [38.5, 38.3, 38.1, 39.9, 44.2, 47.8, 47.5, 46.3, 46.3, 47.0, 47.4],
    [38.8, 38.6, 39.2, 42.2, 46.3, 48.7, 47.8, 46.8, 47.0, 47.7, 48.0],
]

def ground(x, z):
    """Высота земли игры в точке мира, относительно нуля модели."""
    fx = min(max((x - GX0) / GDX, 0), len(GRID[0]) - 1.001)
    fz = min(max((z - GZ0) / GDZ, 0), len(GRID) - 1.001)
    i, k = int(fz), int(fx)
    a, b = fz - i, fx - k
    h = (GRID[i][k] * (1 - a) * (1 - b) + GRID[i][k + 1] * (1 - a) * b +
         GRID[i + 1][k] * a * (1 - b) + GRID[i + 1][k + 1] * a * b)
    return h - H0

# ------------------------------------------------------------------ план
def V2(p): return Vector(p)
def unit(a, b): return (V2(b) - V2(a)).normalized()
def inward(a, b, inside):
    u = unit(a, b); n = Vector((-u.y, u.x))
    return n if n.dot(V2(inside) - V2(a)) > 0 else -n
def T(v): return (v.x, v.y)

u4 = unit(P4, P5); s4 = inward(P4, P5, P0)
D = (V2(P0) - V2(P4)).dot(s4)                 # глубина северного корпуса, 13.3 м
C = T(V2(P4) + u4 * 20.0)                     # стык секций A | B на северном фасаде
Ci = T(V2(C) + s4 * D)
u5 = unit(P5, P6); s5 = inward(P5, P6, P7)
WE = (V2(P7) - V2(P5)).dot(s5)                # ширина восточного крыла, 11.5 м
Vc = T(V2(P5) + u5 * 15.0)                    # стык секций B | C на Суворова
Vi = T(V2(Vc) + s5 * WE)
s3 = inward(P3, P4, P2)
WW = (V2(P2) - V2(P3)).dot(s3)                # ширина западного крыла, 12.8 м

STEP = 3.1                                    # секции стоят на этаж одна выше другой
BASE = {'A': -2.93, 'B': -2.93 + STEP, 'C': -2.93 + 2 * STEP}   # пол первого этажа минус цоколь
PL = 0.6                                      # цоколь над отметкой секции
G1 = 3.5                                      # первый этаж
FH = 3.1                                      # жилой этаж
NF = 5
TOPR = PL + G1 + (NF - 1) * FH                # 16.5 — верх стены над отметкой
CORN = 0.6                                    # высота венчающего карниза
PITCH = 0.55                                  # уклон всех скатов один — вальмы стыкуются

# Секции: прямоугольник вдоль наружного ребра (a → b) на глубину.
BLOCKS = [
    ('A', P3, P4, WW),     # западное крыло
    ('A', P4, C, D),       # северный корпус, запад
    ('B', C, P5, D),       # северный корпус, восток — угол на Суворова
    ('B', P5, Vc, WE),     # восточное крыло, север
    ('C', Vc, P6, WE),     # восточное крыло, юг
]

def block_inside(a, b, depth):
    s = inward(a, b, P0) if (a, b) != (P3, P4) else s3
    if (a, b) in ((P5, Vc), (Vc, P6)): s = s5
    m = (V2(a) + V2(b)) / 2 + s * depth / 2
    return T(m)

# ------------------------------------------------------------------ фасады
def quad(m, F, u0, u1, z0, z1, d):
    face(m, [F.p(u0, d, z0), F.p(u1, d, z0), F.p(u1, d, z1), F.p(u0, d, z1)], F.N())

def at(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)

def facade(a, b, sec, inside, yard=False, door=False):
    """Фасад секции по ребру a → b: цоколь, рустованный первый этаж,
    четыре жилых этажа, тяга и венчающий карниз."""
    F, L = frame_from(a, b, inside)
    base = BASE[sec]
    gl = lambda u: ground(*at(a, b, u / L))
    zlow = min(gl(L * k / 6) for k in range(7)) - 1.0
    n_ax = max(1, round(L / 3.3))
    step = L / n_ax
    door_ax = None
    if door:                                   # подъезд — на оси, где земля ближе к отметке
        best = min(range(n_ax), key=lambda i: abs(gl(step * (i + 0.5)) - base))
        if -1.6 < gl(step * (best + 0.5)) - base < 0.5:
            door_ax = best
    h1, h2, wins = [], [], []
    for i in range(n_ax):
        cu = step * (i + 0.5)
        g = gl(cu)
        for f in range(NF):
            if f == 0:
                if i == door_ax:
                    continue
                w, za, h = 1.5, base + PL + 0.8, 2.0
            else:
                w, za, h = 1.4, base + PL + G1 + (f - 1) * FH + 0.9, 1.75
            if za < g + 0.2:                   # окно ушло бы в склон
                continue
            hole = (cu - w / 2, cu + w / 2, za, za + h)
            (h1 if f == 0 else h2).append(hole)
            wins.append((cu, w, za, h, f))
    if door_ax is not None:
        cu = step * (door_ax + 0.5)
        h1.append((cu - 0.8, cu + 0.8, base + PL, base + PL + 2.4))
    z1 = base + PL + G1
    wall(F, 0, L, base + PL, z1, 0, h1, m='wall2', reveal=0.22)
    wall(F, 0, L, z1, base + TOPR, 0, h2, reveal=0.22)
    box('stone', F, -0.08, L + 0.08, -0.6, 0.08, zlow, base + PL)
    # руст первого этажа: горизонтальные швы в простенках
    for k in range(1, 6):
        z = base + PL + k * G1 / 6
        if z < min(gl(0), gl(L)) - 0.5:
            continue
        cuts = sorted((ha, hb) for ha, hb, za, zb in h1 if za - 0.03 < z < zb + 0.03)
        u = 0.0
        for ha, hb in cuts + [(L, L)]:
            if ha - u > 0.05:
                quad('wall3', F, u, ha, z - 0.025, z + 0.025, 0.012)
            u = max(u, hb)
    band(F, 0, L, 0, z1, z1 + 0.22, 0.12)                       # тяга над первым этажом
    band(F, 0, L, 0, z1 + FH - 0.02, z1 + FH + 0.08, 0.05)       # поясок под вторым жилым
    cornice(F, 0, L, 0, base + TOPR, ext=0.5)
    for cu, w, za, h, f in wins:
        g = -0.20
        face('glass', [F.p(cu - w / 2, g, za), F.p(cu + w / 2, g, za), F.p(cu + w / 2, g, za + h),
                       F.p(cu - w / 2, g, za + h)], F.N())
        t = 0.06
        quad('trim', F, cu - t / 2, cu + t / 2, za, za + h, g + 0.03)              # импост
        zt = za + h * 0.7
        quad('trim', F, cu - w / 2, cu + w / 2, zt - t / 2, zt + t / 2, g + 0.03)  # фрамуга
        # подоконный отлив: верх и лицо
        face('trim', [F.p(cu - w / 2 - 0.06, -0.22, za), F.p(cu + w / 2 + 0.06, -0.22, za),
                      F.p(cu + w / 2 + 0.06, 0.08, za), F.p(cu - w / 2 - 0.06, 0.08, za)], UP)
        quad('trim', F, cu - w / 2 - 0.06, cu + w / 2 + 0.06, za - 0.07, za, 0.08)
        if f >= 1:                                                                 # сандрик-полочка
            zs = za + h + 0.30
            quad('trim', F, cu - w / 2 - 0.12, cu + w / 2 + 0.12, zs - 0.12, zs, 0.10)
            face('trim', [F.p(cu - w / 2 - 0.12, 0, zs), F.p(cu + w / 2 + 0.12, 0, zs),
                          F.p(cu + w / 2 + 0.12, 0.10, zs), F.p(cu - w / 2 - 0.12, 0.10, zs)], UP)
    if door_ax is not None:
        cu = step * (door_ax + 0.5)
        g = gl(cu)
        quad('wood', F, cu - 0.8, cu + 0.8, base + PL, base + PL + 2.4, -0.2)
        quad('trim', F, cu - 0.03, cu + 0.03, base + PL, base + PL + 2.4, -0.18)
        box('trim', F, cu - 1.3, cu + 1.3, 0, 1.3, base + PL + 2.7, base + PL + 2.85)   # козырёк
        if g < base + PL - 0.1:                                                     # крыльцо
            box('stone', F, cu - 1.2, cu + 1.2, 0, 1.4, g - 0.5, base + PL)
            box('stone', F, cu - 1.2, cu + 1.2, 1.4, 1.8, g - 0.5, (g + base + PL) / 2)

def firewall(a, b, lo, hi, inside):
    """Глухой торец высокой секции над кровлей низкой."""
    F, L = frame_from(a, b, inside)
    quad('wall', F, 0, L, BASE[lo] + TOPR, BASE[hi] + TOPR, 0)
    cornice(F, 0, L, 0, BASE[hi] + TOPR, ext=0.5)

IN = {k: block_inside(a, b, d) for k, a, b, d in [('W', P3, P4, WW), ('NW', P4, C, D), ('NE', C, P5, D),
                                                  ('E1', P5, Vc, WE), ('E2', Vc, P6, WE)]}
# наружные
facade(P3, P4, 'A', IN['W'])           # на ул. Дроздова
facade(P2, P3, 'A', IN['W'])           # торец западного крыла
facade(P4, C, 'A', IN['NW'])           # северный фасад, запад
facade(C, P5, 'B', IN['NE'])           # северный фасад, восток
facade(P5, Vc, 'B', IN['E1'])          # на ул. Суворова, север
facade(Vc, P6, 'C', IN['E2'])          # на ул. Суворова, юг
facade(P6, P7, 'C', IN['E2'])          # торец восточного крыла
# дворовые, с подъездами
facade(P7, Vi, 'C', IN['E2'], door=True)
facade(Vi, P0, 'B', IN['E1'], door=True)
facade(P0, Ci, 'B', IN['NE'])
facade(Ci, P1, 'A', IN['NW'], door=True)
facade(P1, P2, 'A', IN['W'], door=True)
# брандмауэры на стыках секций
firewall(C, Ci, 'A', 'B', IN['NE'])
firewall(Vc, Vi, 'B', 'C', IN['E2'])

# ------------------------------------------------------------------ кровли
# Вальма над каждой секцией с одним уклоном: где секции одной высоты
# перекрываются, видна верхняя огибающая — как у настоящей кровли «покоем».
for sec, a, b, depth in BLOCKS:
    F, L = frame_from(a, b, block_inside(a, b, depth))
    ov = 0.55
    z = BASE[sec] + TOPR + CORN
    hip_roof(F, 0, L, 0, -depth, z, PITCH * (depth / 2 + ov), ov=ov)
    # слой подшивки внутри стен — потолок, чтобы через окна не просвечивало небо
    face('wall', [F.p(0, 0, BASE[sec] + TOPR), F.p(L, 0, BASE[sec] + TOPR),
                  F.p(L, -depth, BASE[sec] + TOPR), F.p(0, -depth, BASE[sec] + TOPR)], -UP)

# дымники на коньках (по одному на секцию — наугад)
for sec, a, b, depth, t in (('A', P3, P4, WW, 0.45), ('B', C, P5, D, 0.55), ('C', Vc, P6, WE, 0.5)):
    F, L = frame_from(a, b, block_inside(a, b, depth))
    z = BASE[sec] + TOPR + CORN
    chimney(F, L * t, -depth / 2 + 1.2, z + 0.5, z + PITCH * (depth / 2 + 0.55) + 0.9, w=0.7)

finish('suvorova27', __file__)
