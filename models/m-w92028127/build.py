# Маяковского, 5 (магазин «Угол») — П-образный жилой дом на Черноморке
# (OSM way 92028127, building=retail, на нём точка магазина «Угол»).
#
#   blender -b --python models/m-w92028127/build.py -- [glb]
#
# План — контур OSM, он почти точно прямоугольный: основное крыло 51.9 × 17.7 м
# вдоль ребра C→D (на северо-запад, вдоль проезда) и два крыла во двор —
# у угла D (13.3 м шириной, фасад D→E 38.2 м на северо-восток, на ул. Маяковского)
# и у угла C (10.4 м). Двор открыт на юго-восток. Фото нет: в описании
# (refs/center-models.json) только план, «этажность наугад 3–4», цвет стен
# #e0d6bd и кровли #7a7a7a. Сделано сдержанно, в духе послевоенных соседей:
# четыре этажа, ровная сетка окон, магазин с витринами на углу D (отсюда и
# «Угол»), подъезды со двора, вальмовая кровля. Что наугад — NOTES.md.
import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# контур OSM, обход против часовой стрелки в (x, z) мира
A, B, C, D = (-525.9, 528.7), (-531.4, 537.5), (-562.5, 518.2), (-535.1, 474.1)
E, F_, G, H = (-502.6, 494.2), (-509.6, 505.4), (-527.0, 494.7), (-542.0, 518.8)
POLY = [A, B, C, D, E, F_, G, H]
X0, Z0 = -533.6, 475.0                         # вход в магазин у угла D, на ул. Маяковского
origin(X0, Z0)

COL['wall'] = ((0.878, 0.839, 0.741), 0.9)     # #e0d6bd из описания
COL['roof'] = ((0.478, 0.478, 0.478), 0.85)    # #7a7a7a — шифер
COL['trim'] = ((0.93, 0.91, 0.86), 0.85)       # откосы, отливы, рамы, карниз
COL['stone'] = ((0.58, 0.56, 0.52), 0.9)       # цоколь
COL['glass'] = ((0.10, 0.13, 0.16), 0.15)
COL['metal'] = ((0.20, 0.21, 0.22), 0.5)
COL['wood'] = ((0.30, 0.20, 0.13), 0.6)        # двери подъездов

GROUND = -3.0
PL = 0.5                 # верх цоколя
G1 = 3.4                 # первый этаж (магазин)
FH = 3.0                 # жилые этажи
NF = 4
TOP = PL + G1 + (NF - 1) * FH      # 12.9 — низ карниза и свеса кровли
STEP = 3.25              # шаг осей окон

def floor_z(f):
    return PL if f == 0 else PL + G1 + (f - 1) * FH

def quad(m, F, u0, u1, z0, z1, d):
    face(m, [F.p(u0, d, z0), F.p(u1, d, z0), F.p(u1, d, z1), F.p(u0, d, z1)], F.N())

def frame(a, b):
    """Рамка ребра контура: обход против часовой — дом слева от ребра."""
    dx, dz = b[0] - a[0], b[1] - a[1]
    l = math.hypot(dx, dz)
    inside = ((a[0] + b[0]) / 2 - dz / l * 2, (a[1] + b[1]) / 2 + dx / l * 2)
    return frame_from(a, b, inside)

def pane(F, ua, ub, za, zb, mull=True):
    """Окно без наличника: стекло в глубине, рама, импост, отлив."""
    g = -0.18
    quad('glass', F, ua, ub, za, zb, g)
    t = 0.06
    quad('trim', F, ua, ub, zb - t, zb, g + 0.03)
    quad('trim', F, ua, ub, za, za + t, g + 0.03)
    if mull:
        cu = (ua + ub) / 2
        quad('trim', F, cu - t / 2, cu + t / 2, za, zb, g + 0.03)
        quad('trim', F, ua, cu, za + (zb - za) * 0.7 - t / 2, za + (zb - za) * 0.7 + t / 2, g + 0.03)
    face('trim', [F.p(ua - 0.06, -0.18, za), F.p(ub + 0.06, -0.18, za),        # отлив: верх и торец
                  F.p(ub + 0.06, 0.08, za), F.p(ua - 0.06, 0.08, za)], UP)
    quad('trim', F, ua - 0.06, ub + 0.06, za - 0.07, za, 0.08)

def side(a, b, shop=None, doors=(), blank=()):
    """Фасад по ребру a→b. shop = (i0, i1) — оси с витринами в первом этаже,
    doors — оси подъездов, blank — глухие оси."""
    F, L = frame(a, b)
    n = max(1, round(L / STEP))
    step = L / n
    holes, wins, vit = [], [], []
    for i in range(n):
        if i in blank:
            continue
        cu = step * (i + 0.5)
        for f in range(NF):
            if f == 0 and shop and shop[0] <= i <= shop[1]:
                w = step - 0.7
                hz = (cu - w / 2, cu + w / 2, PL + 0.25, PL + 3.0)
                holes.append(hz); vit.append(hz)
                continue
            if f == 0 and i in doors:
                hz = (cu - 0.65, cu + 0.65, PL, PL + 2.3)
                holes.append(hz)
                continue
            za = floor_z(f) + (1.15 if f == 0 else 0.85)
            hz = (cu - 0.7, cu + 0.7, za, za + 1.55)
            holes.append(hz); wins.append(hz)
    wall(F, 0, L, PL, TOP, 0, holes, reveal=0.18)
    box('stone', F, 0, L, -0.25, 0.08, GROUND, PL)
    for hz in wins:
        pane(F, *hz)
    for ua, ub, za, zb in vit:               # витрина: стекло в тонкой раме, без импостов
        quad('glass', F, ua, ub, za, zb, -0.12)
        quad('metal', F, ua, ub, za, za + 0.08, -0.10)
        quad('metal', F, ua, ub, zb - 0.08, zb, -0.10)
        cu = (ua + ub) / 2
        quad('metal', F, cu - 0.03, cu + 0.03, za, zb, -0.10)
    if shop:                                 # полоса под вывеску над витринами
        u0, u1 = step * shop[0] + 0.2, step * (shop[1] + 1) - 0.2
        box('metal', F, u0, u1, 0, 0.12, PL + 3.1, PL + 3.35 + 0.0)
    for i in doors:
        cu = step * (i + 0.5)
        quad('wood', F, cu - 0.65, cu + 0.65, PL, PL + 2.3, -0.15)
        quad('trim', F, cu - 0.03, cu + 0.03, PL, PL + 2.3, -0.13)
        box('stone', F, cu - 1.3, cu + 1.3, 0, 1.3, PL + 2.6, PL + 2.75)          # козырёк
        box('stone', F, cu - 1.1, cu + 1.1, 0, 1.4, GROUND, PL - 0.02)            # крыльцо
    # тяги: над первым этажом и венчающий карниз
    box('trim', F, -0.05, L + 0.05, -0.02, 0.1, PL + G1 - 0.05, PL + G1 + 0.12)
    box('trim', F, -0.15, L + 0.15, -0.02, 0.18, TOP - 0.35, TOP - 0.15)
    box('trim', F, -0.30, L + 0.30, -0.02, 0.35, TOP - 0.15, TOP)
    return F, L

# фасады: CD — на проезд, DE — ул. Маяковского; магазин у угла D на обоих
side(B, C)
side(C, D, shop=(13, 15))
side(D, E, shop=(0, 2))
side(E, F_, blank=(1, 2))
side(F_, G, doors=(3,))
side(G, H, doors=(2, 6))
side(H, A, doors=(3,))
side(A, B, blank=(1,))

# кровля: три вальмовые, крылья заходят коньком под конёк основного объёма
TAN = math.tan(math.radians(22))
Fcd, Lcd = frame(C, D)
hip_roof(Fcd, 0, Lcd, 0, -17.7, TOP, 17.7 / 2 * TAN)
Fde, Lde = frame(D, E)
hip_roof(Fde, 17.7 / 2, Lde, 0, -13.3, TOP, (13.3 / 2 + 0.6) * math.tan(math.radians(25)) - 0.6 * TAN,
         ov=0.6, hip0=False)
Fbc, Lbc = frame(B, C)
hip_roof(Fbc, 0, Lbc - 17.7 / 2, 0, -10.4, TOP, (10.4 / 2 + 0.6) * math.tan(math.radians(25)) - 0.6 * TAN,
         ov=0.6, hip1=False)
# печные/вентиляционные трубы над основным крылом
for u in (12.0, 26.0, 40.0):
    chimney(Fcd, u, -12.5, TOP + 1.2, TOP + 4.6, w=0.7)

finish('m-w92028127', __file__)
