# Пр. Нахимова, 19 — трёхэтажный дом с магазином «Окей» в первом этаже
# (Черноморка, OSM way 166764282). Модель с нуля.
#
#   blender -b --python models/nakhimova19/build.py -- [glb]
#
# Фото нет: описание в refs/center-models.json — «3 этажа, ширина до 18 м,
# ломаный план; на 1 этаже магазин «Окей»», стены кремовые #e0d6bd, кровля
# #7a7a7a. Поэтому план — ровно контур OSM (16 рёбер, вогнутый), а фасад
# сдержанный: ровная сетка окон, межэтажные тяги, карниз и парапет, плоская
# кровля. Главный фасад — ребро 14 (39.2 м), смотрит на СЗ, на пр. Нахимова
# (проезжая часть в 12 м): в первом этаже витрины и вход с козырьком.
# Рельеф (data/terrain): у главного фасада 20.5 м, к задним рёбрам земля
# поднимается до 24.5 м — первый этаж там уходит в склон, окна, которые
# оказались бы в земле, не ставим. Ноль высоты — тротуар у середины главного
# фасада. Что наугад — NOTES.md.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

POLY = [(-334.4, 465.5), (-345.1, 479.1), (-338.5, 484.2), (-325.1, 472.2), (-319.2, 478.8),
        (-330.0, 489.2), (-327.1, 492.2), (-332.5, 497.1), (-334.5, 495.0), (-343.4, 505.0),
        (-351.5, 497.0), (-342.6, 488.2), (-348.5, 483.7), (-358.6, 496.4), (-371.9, 486.0),
        (-347.8, 455.1)]
# высота земли в вершинах (terrain.heightAt), минус 20.5 у начала
GH = [1.49, 1.75, 2.61, 2.54, 3.60, 3.60, 4.03, 4.00, 3.70, 3.78, 2.60, 2.60, 1.84, 1.97, 0.22, -0.25]
MAIN = 14                                     # ребро 14 → 15: фасад на пр. Нахимова
PARTY = {13}                                  # ребро 13 — общая стена с w166764284
X0, Z0 = -359.85, 470.55                      # середина главного фасада
origin(X0, Z0)

COL['wall'] = ((0.88, 0.84, 0.74), 0.9)       # кремовая штукатурка #e0d6bd
COL['trim'] = ((0.94, 0.92, 0.87), 0.85)      # тяги, откосы, отливы, рамы
COL['stone'] = ((0.56, 0.54, 0.50), 0.9)      # цоколь
COL['roof'] = ((0.48, 0.48, 0.48), 0.9)       # кровля #7a7a7a
COL['glass'] = ((0.10, 0.13, 0.16), 0.15)
COL['metal'] = ((0.20, 0.21, 0.22), 0.5)
COL['wall2'] = ((0.80, 0.76, 0.66), 0.9)      # фриз под вывеской — тоном темнее

GROUND = -3.0
PL = 0.4                       # цоколь
F1 = 4.2                       # первый этаж (магазин)
FH = 3.4                       # жилые этажи
NF = 3
TOP = PL + F1 + (NF - 1) * FH  # верх стены 11.4
PAR = TOP + 0.6                # верх парапета 12.0
AX = 3.3                       # шаг осей окон

def inside(x, z):
    c = False
    n = len(POLY)
    for i in range(n):
        (x1, z1), (x2, z2) = POLY[i], POLY[(i + 1) % n]
        if (z1 > z) != (z2 > z) and x < x1 + (z - z1) * (x2 - x1) / (z2 - z1):
            c = not c
    return c

def edge_frame(i):
    a, b = POLY[i], POLY[(i + 1) % len(POLY)]
    mx, mz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    dx, dz = b[0] - a[0], b[1] - a[1]
    l = math.hypot(dx, dz)
    p = (mx - dz / l * 0.3, mz + dx / l * 0.3)
    if not inside(*p):
        p = (mx + dz / l * 0.3, mz - dx / l * 0.3)
    return frame_from(a, b, p)

def quad(m, F, u0, u1, z0, z1, d):
    face(m, [F.p(u0, d, z0), F.p(u1, d, z0), F.p(u1, d, z1), F.p(u0, d, z1)], F.N())

def pane(F, cu, w, za, h, mull=1):
    """Стекло в проёме, белая рама с импостами и отлив."""
    g = -0.18
    face('glass', [F.p(cu - w / 2, g, za), F.p(cu + w / 2, g, za), F.p(cu + w / 2, g, za + h), F.p(cu - w / 2, g, za + h)], F.N())
    t = 0.05
    us = [cu - w / 2 + t / 2] + [cu - w / 2 + w * k / (mull + 1) for k in range(1, mull + 1)] + [cu + w / 2 - t / 2]
    for u in us:
        quad('trim', F, u - t / 2, u + t / 2, za, za + h, g + 0.03)
    quad('trim', F, cu - w / 2, cu + w / 2, za + h - t, za + h, g + 0.03)
    quad('trim', F, cu - w / 2, cu + w / 2, za, za + t, g + 0.03)

def sill(F, cu, w, za):
    quad('trim', F, cu - w / 2 - 0.05, cu + w / 2 + 0.05, za - 0.06, za, 0.07)
    face('trim', [F.p(cu - w / 2 - 0.05, -0.2, za), F.p(cu + w / 2 + 0.05, -0.2, za),
                  F.p(cu + w / 2 + 0.05, 0.07, za), F.p(cu - w / 2 - 0.05, 0.07, za)], UP)

def side(i):
    F, L = edge_frame(i)
    g0, g1 = GH[i], GH[(i + 1) % len(POLY)]
    gat = lambda u: g0 + (g1 - g0) * u / L
    holes, wins = [], []
    if i not in PARTY:
        n = int(L // AX)
        step = L / n if n else 0
        for k in range(n):
            cu = step * (k + 0.5)
            for f in range(NF):
                if f == 0:
                    if i == MAIN:
                        continue                  # витрины — отдельно
                    za, h, w = PL + 1.2, 1.7, 1.5
                else:
                    za, h, w = PL + F1 + (f - 1) * FH + 0.9, 1.5, 1.5
                if za < gat(cu) + 0.7:
                    continue                      # окно ушло бы в склон
                holes.append((cu - w / 2, cu + w / 2, za, za + h))
                wins.append((cu, w, za, h))
    shop = []
    if i == MAIN:
        n = 10
        step = L / n
        for k in range(n):
            cu = step * (k + 0.5)
            w = step - 0.7
            holes.append((cu - w / 2, cu + w / 2, PL + 0.45, PL + 3.3))
            shop.append((cu, w, k == n // 2))
    wall(F, 0, L, GROUND, TOP, 0, holes, reveal=0.2)
    for cu, w, za, h in wins:
        pane(F, cu, w, za, h)
        sill(F, cu, w, za)
    for cu, w, door in shop:
        za, h = PL + 0.45, 2.85
        if door:                                  # двери магазина: стекло в тёмной раме
            pane(F, cu, w, za, h, mull=1)
            box('metal', F, cu - w / 2 - 0.4, cu + w / 2 + 0.4, 0, 1.4, PL + 3.45, PL + 3.6)  # козырёк
            for s in (-1, 1):
                beam('metal', F.p(cu + s * (w / 2 + 0.2), 0, PL + 4.1), F.p(cu + s * (w / 2 + 0.2), 1.35, PL + 3.6), 0.04)
            box('stone', F, cu - w / 2 - 0.3, cu + w / 2 + 0.3, 0, 1.2, GROUND, PL)        # крыльцо
        else:
            pane(F, cu, w, za, h, mull=2)
            quad('stone', F, cu - w / 2, cu + w / 2, PL, za, -0.1)
    if i == MAIN:                                 # фриз над витринами под вывеску
        box('wall2', F, 0, L, -0.02, 0.12, PL + 3.45, PL + 4.0)
    # цоколь по своему краю земли
    gm = max(g0, g1)
    box('stone', F, 0, L, -0.05, 0.08, GROUND, max(PL, gm + 0.35))
    # межэтажные тяги, карниз и парапет
    for f in range(1, NF):
        z = PL + F1 + (f - 1) * FH
        if z > gm + 0.3:
            quad('trim', F, 0, L, z, z + 0.14, 0.05)
    box('trim', F, -0.1, L + 0.1, -0.05, 0.25, TOP - 0.2, TOP)
    quad('wall', F, 0, L, TOP, PAR, 0.0)
    quad('wall', F, 0, L, TOP, PAR, -0.25)
    box('trim', F, -0.05, L + 0.05, -0.3, 0.08, PAR, PAR + 0.08)

for i in range(len(POLY)):
    side(i)

# плоская кровля внутри парапета
face('roof', [Vector((*W(x, z), TOP + 0.05)) for x, z in POLY], UP)
# выходы на кровлю и вентиляция — по одному на крыло (наугад); ставим только
# то, что целиком помещается внутри парапета с запасом в метр
def on_roof(F, u0, u1, d0, d1):
    for u in (u0 - 1, u1 + 1):
        for d in (d0 - 1, d1 + 1):
            v = F.p(u, d, 0)
            if not inside(X0 + v.x, Z0 - v.y):
                return False
    return True

for (x, z) in ((-352.0, 474.0), (-332.0, 476.0), (-340.0, 494.0)):
    Fr = Frame(W(x, z), Vector((0.62, 0.79)), Vector((0.79, -0.62)))
    if on_roof(Fr, -1.4, 1.4, -1.7, 1.7):
        box('wall', Fr, -1.3, 1.3, -1.6, 1.6, TOP, TOP + 2.4)
        box('trim', Fr, -1.4, 1.4, -1.7, 1.7, TOP + 2.4, TOP + 2.5)
    for u in (2.5, -3.3):
        if on_roof(Fr, u, u + 0.8, -0.4, 0.4):
            box('metal', Fr, u, u + 0.8, -0.4, 0.4, TOP, TOP + 0.8)
            break

finish('nakhimova19', __file__)
