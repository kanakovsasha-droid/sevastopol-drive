# Пр. Нахимова, 19 — трёхэтажный дом с магазином «Окей» в первом этаже
# (Черноморка, OSM way 166764282). Модель с нуля.
#
#   blender -b --python models/nakhimova19/build.py -- [glb]
#
# Главный фасад переделан по описанию панорам владельца (docs/CLOUD.md,
# п. 38): белый П-портал на два этажа со сплошным витражом и вывеской O'KEY —
# см. portal().
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
import sys, os, math, bpy
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
# шторы и рама портала — материалами wall2 / wall3: они остаются в дальнем
# уровне (LOD_KEEP в kit.py), иначе издали в портале была бы дыра
COL['wall2'] = ((0.86, 0.83, 0.76), 0.6)      # светлые шторы за витражом
COL['wall3'] = ((0.95, 0.94, 0.91), 0.85)     # белая рама портала
COL['sign'] = ((0.27, 0.12, 0.36), 0.5)       # фон вывески O'KEY — тёмно-фиолетовый
COL['signtxt'] = ((0.97, 0.97, 0.97), 0.4)

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

# ------------------------------------------------------------------ портал «О'КЕЙ»
# По панорамам владельца (docs/CLOUD.md, п. 38): белая П-образная рама-портал
# на два этажа, внутри сплошной стеклянный витраж с тонкой сеткой рам и
# светлыми шторами, слева в витраже большая вывеска O'KEY — тёмно-фиолетовый
# фон, белые буквы. Третий этаж над порталом — прежняя стена с окнами.
PIER = 1.1                     # ширина опор рамы
ZT = PL + F1 + FH              # верх витража = низ ригеля рамы, 8.0
GD = -0.35                     # глубина витража от лица фасада
# u рамки идёт справа налево, если смотреть с проспекта: «слева» — у конца
LM = math.dist(POLY[MAIN], POLY[(MAIN + 1) % len(POLY)])   # длина главного фасада, 39.2
SIGN = (LM - PIER - 0.9 - 8.4, LM - PIER - 0.9, PL + F1 + 0.35, PL + F1 + 2.75)   # u0, u1, z0, z1

def letters(F, text, u0, u1, z0, z1, d, m='signtxt'):
    """Буквы вывески: шрифт Blender в сетку, по центру прямоугольника."""
    cu = bpy.data.curves.new('t', 'FONT'); cu.body = text; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
    ob = bpy.data.objects.new('t', cu); bpy.context.scene.collection.objects.link(ob)
    me = ob.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]
    k = min((u1 - u0) * 0.86 / (max(xs) - min(xs)), (z1 - z0) * 0.62 / (max(ys) - min(ys)))
    mx, my = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    for poly in me.polygons:
        pts = [F.p((u0 + u1) / 2 - (me.vertices[j].co.x - mx) * k, d,      # u — справа налево
                   (z0 + z1) / 2 + (me.vertices[j].co.y - my) * k) for j in poly.vertices]
        face(m, pts, F.N())
    bpy.data.objects.remove(ob)

def portal(F, L):
    # рама: две опоры и ригель с вылетом 0.45 м, белые
    box('wall3', F, 0, PIER, 0, 0.45, GROUND, ZT + 0.9)
    box('wall3', F, L - PIER, L, 0, 0.45, GROUND, ZT + 0.9)
    box('wall3', F, PIER, L - PIER, 0, 0.45, ZT, ZT + 0.9)
    # витраж: нижний ярус — стекло, верхний — светлые шторы за стеклом
    u0, u1 = PIER, L - PIER
    z1 = PL + F1                                   # межэтажная плита
    face('glass', [F.p(u0, GD, PL + 0.1), F.p(u1, GD, PL + 0.1), F.p(u1, GD, z1), F.p(u0, GD, z1)], F.N())
    face('wall2', [F.p(u0, GD, z1), F.p(u1, GD, z1), F.p(u1, GD, ZT), F.p(u0, GD, ZT)], F.N())
    # тонкая сетка рам: стойки через ~1.3 м, ригели по ярусам, плита — шире
    n = round((u1 - u0) / 1.3)
    for k in range(n + 1):
        u = u0 + (u1 - u0) * k / n
        box('metal', F, u - 0.03, u + 0.03, GD, GD + 0.08, PL + 0.1, ZT, bottom=False)
    for z in (PL + 0.1, PL + 2.9, PL + F1 + 1.7):
        box('metal', F, u0, u1, GD, GD + 0.08, z - 0.03, z + 0.03, bottom=False)
    box('trim', F, u0, u1, GD, GD + 0.1, z1 - 0.15, z1 + 0.15, bottom=False)
    box('stone', F, u0, u1, GD - 0.05, GD + 0.12, GROUND, PL + 0.1)     # цоколь витража
    # вывеска слева в витраже
    box('sign', F, SIGN[0], SIGN[1], GD, GD + 0.18, SIGN[2], SIGN[3])
    letters(F, "O'KEY", SIGN[0], SIGN[1], SIGN[2], SIGN[3], GD + 0.19)
    # вход по середине: двери в тёмной раме, козырёк, крыльцо
    cu, w = L / 2, 2.6
    box('metal', F, cu - w / 2, cu + w / 2, GD, GD + 0.12, PL + 2.7, PL + 2.9, bottom=False)
    for uu in (cu - w / 2, cu, cu + w / 2):
        box('metal', F, uu - 0.06, uu + 0.06, GD, GD + 0.12, PL + 0.1, PL + 2.7, bottom=False)
    box('metal', F, cu - w / 2 - 0.6, cu + w / 2 + 0.6, 0, 1.5, PL + 3.45, PL + 3.6)        # козырёк
    box('stone', F, cu - w / 2 - 0.4, cu + w / 2 + 0.4, 0, 1.2, GROUND, PL)                # крыльцо

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
                if i == MAIN and f < 2:
                    continue                      # 1–2 этажи главного фасада — витраж портала
                if f == 0:
                    za, h, w = PL + 1.2, 1.7, 1.5
                else:
                    za, h, w = PL + F1 + (f - 1) * FH + 0.9, 1.5, 1.5
                if za < gat(cu) + 0.7:
                    continue                      # окно ушло бы в склон
                holes.append((cu - w / 2, cu + w / 2, za, za + h))
                wins.append((cu, w, za, h))
    if i == MAIN:
        holes.append((PIER, L - PIER, PL + 0.1, ZT))
    wall(F, 0, L, GROUND, TOP, 0, holes, reveal=0.2)
    for cu, w, za, h in wins:
        pane(F, cu, w, za, h)
        sill(F, cu, w, za)
    if i == MAIN:
        portal(F, L)
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
