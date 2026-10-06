# Большая Морская, 27 — трёхэтажный жилой дом с магазинами внизу («Ваша оптика»,
# «Тальменка», «Люксоптика»), OSM way 90821896. Модель с нуля.
#
#   blender -b --python models/bmorskaya27/build.py -- [glb]
#   (или python3.13 с модулем bpy: python3.13 models/bmorskaya27/build.py -- glb)
#
# План — контур OSM как есть (семь углов, ступенька на дворовом фасаде).
# Улица — с ЗАПАДА: ось Б. Морской идёт в 14 м западнее ребра 46.7 м, вдоль
# него тротуар (в refs/center-models.json написано наоборот — проверено по
# дорогам world.json). Описание фасада — поле source там же: песчаник #d9ceae,
# светлый торговый низ #e3dcc6, витрины в порталах тёмно-вишнёвого камня,
# арочные окна второго этажа с балконами на кронштейнах и кованой решёткой,
# прямоугольные окна третьего, фигурный угловой аттик, плоская кровля с
# чёрной оградой и кирпичными трубами. Ноль высоты — земля у середины
# уличного фасада; улица падает к югу на 2.9 м, двор выше улицы на 1–3 м.
# Что наугад — NOTES.md.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

P = [(-224.6, 1265.5), (-211.7, 1262.0), (-201.5, 1299.0), (-197.3, 1297.8),
     (-194.0, 1309.5), (-207.0, 1313.1), (-212.1, 1310.5)]
# земля у углов относительно нуля модели (замер G.terrain.heightAt, ноль 40.46)
GH = [1.83, 3.15, 0.43, 0.82, 0.29, -0.99, -1.07]
X0, Z0 = -218.4, 1288.0                     # середина уличного фасада
origin(X0, Z0)

COL['wall'] = ((0.851, 0.808, 0.682), 0.9)  # #d9ceae песчаник этажей
COL['wall2'] = ((0.890, 0.863, 0.776), 0.9) # #e3dcc6 торговый низ
COL['wall3'] = ((0.36, 0.17, 0.15), 0.6)    # тёмно-вишнёвый камень порталов, кирпич труб
COL['roof'] = ((0.490, 0.498, 0.471), 0.9)  # #7d7f78
COL['trim'] = ((0.92, 0.90, 0.84), 0.85)    # рамы, тяги, карниз
COL['stone'] = ((0.62, 0.60, 0.55), 0.9)    # цоколь, плиты балконов
COL['glass'] = ((0.10, 0.13, 0.16), 0.15)
COL['metal'] = ((0.08, 0.08, 0.09), 0.5)    # чугунные решётки, ограда кровли

GROUND = -3.0
F2 = 4.6          # пол второго этажа (низ — торговый)
F3 = 8.4          # пол третьего
TOP = 11.6        # низ венчающего карниза
PAR = 12.4        # верх парапета

# обход контура в плоскости Blender: внешняя нормаль ребра
_area = 0
for i in range(len(P)):
    a, b = W(*P[i]), W(*P[(i + 1) % len(P)])
    _area += a.x * b.y - b.x * a.y
CCW = _area > 0

def edge(i):
    a, b = W(*P[i]), W(*P[(i + 1) % len(P)])
    u = (b - a).normalized()
    n = Vector((u.y, -u.x)) if CCW else Vector((-u.y, u.x))
    L = (b - a).length
    g0, g1 = GH[i], GH[(i + 1) % len(P)]
    return Frame(a, u, n), L, (lambda t: g0 + (g1 - g0) * t / L)

def quad(m, F, u0, u1, z0, z1, d):
    face(m, [F.p(u0, d, z0), F.p(u1, d, z0), F.p(u1, d, z1), F.p(u0, d, z1)], F.N())

def pane(F, ua, ub, za, zb, cols=2, sill=True):
    """Лёгкое окно: стекло в глубине проёма, рама, отлив."""
    g = -0.20
    quad('glass', F, ua, ub, za, zb, g)
    t = 0.06
    quad('trim', F, ua, ua + t, za, zb, g + 0.02); quad('trim', F, ub - t, ub, za, zb, g + 0.02)
    quad('trim', F, ua, ub, zb - t, zb, g + 0.02); quad('trim', F, ua, ub, za, za + t, g + 0.02)
    for c in range(1, cols):
        u = ua + (ub - ua) * c / cols
        quad('trim', F, u - t / 2, u + t / 2, za, zb, g + 0.02)
    if sill:
        face('trim', [F.p(ua - 0.06, -0.22, za), F.p(ub + 0.06, -0.22, za), F.p(ub + 0.06, 0.08, za), F.p(ua - 0.06, 0.08, za)], UP)
        quad('trim', F, ua - 0.06, ub + 0.06, za - 0.07, za, 0.08)

def arch_top(F, ua, ub, zs, m='wall', n=4):
    """Заполнить углы прямоугольного проёма над полуциркульной аркой (пяты на zs)."""
    r = (ub - ua) / 2; cu = (ua + ub) / 2; zt = zs + r
    for s in (-1, 1):
        arc = [(cu + s * r * math.cos(math.pi / 2 * k / n), zs + r * math.sin(math.pi / 2 * k / n)) for k in range(n + 1)]
        poly = arc + [(cu + s * r, zt)] if s > 0 else list(reversed(arc)) + [(cu - r, zt)]
        prism_uz(m, F, poly, -0.24, 0.0)
    # архивольт тягой и замковый камень
    for k in range(4):
        a0, a1 = math.pi * k / 4, math.pi * (k + 1) / 4
        p0 = (cu + (r + 0.07) * math.cos(a0), zs + (r + 0.07) * math.sin(a0))
        p1 = (cu + (r + 0.07) * math.cos(a1), zs + (r + 0.07) * math.sin(a1))
        beam('trim', F.p(p0[0], 0.04, p0[1]), F.p(p1[0], 0.04, p1[1]), 0.14, 0.08)
    prism_uz('trim', F, [(cu - 0.13, zt - 0.05), (cu + 0.13, zt - 0.05), (cu + 0.18, zt + 0.32), (cu - 0.18, zt + 0.32)], 0.0, 0.10)

def balcony(F, cu, z, w=2.0, dep=0.85):
    """Балкон: плита на двух кронштейнах, кованая решётка (стойки и поручни)."""
    box('stone', F, cu - w / 2, cu + w / 2, 0.0, dep, z - 0.16, z)
    for s in (-1, 1):
        uc = cu + s * (w / 2 - 0.25)
        prism_uz('trim', F, [(uc - 0.1, z - 0.16), (uc + 0.1, z - 0.16), (uc + 0.1, z - 0.75)], 0.0, dep - 0.1)
    H = 0.95; d = dep - 0.05
    beam('metal', F.p(cu - w / 2 + 0.05, d, z + H), F.p(cu + w / 2 - 0.05, d, z + H), 0.05)
    for s in (-1, 1):
        u = cu + s * (w / 2 - 0.05)
        beam('metal', F.p(u, 0.02, z + H), F.p(u, d, z + H), 0.05)
        beam('metal', F.p(u, d, z), F.p(u, d, z + H), 0.04)
    nb = 4
    for k in range(1, nb):
        u = cu - w / 2 + w * k / nb
        beam('metal', F.p(u, d, z), F.p(u, d, z + H), 0.025)
    # завиток посередине — ромб из прутка (кованый рисунок упрощённо)
    c = F.p(cu, d, z + 0.55)
    U = F.U() * 0.28; Z = UP * 0.3
    for a, b in ((c - U, c + Z), (c + Z, c + U), (c + U, c - Z), (c - Z, c - U)):
        beam('metal', a, b, 0.025)

def parapet(F, L, fence=True):
    quad('wall', F, -0.05, L + 0.05, TOP + 0.6, PAR, 0.0)
    box('trim', F, -0.1, L + 0.1, -0.35, 0.10, PAR, PAR + 0.08)
    if fence:
        h = PAR + 0.9
        beam('metal', F.p(0, -0.2, h), F.p(L, -0.2, h), 0.04)
        k = 0.0; step = L / max(1, round(L / 3.0))
        while k <= L + 1e-6:
            beam('metal', F.p(k, -0.2, PAR + 0.08), F.p(k, -0.2, h), 0.03)
            k += step

def side_wall(F, L, g, axes, pad=1.2, street=False, plain_top=True):
    """Боковой и дворовый фасад: три этажа окон без витрин, первый этаж по земле."""
    holes, wins = [], []
    if axes:
        step = (L - 2 * pad) / axes
        for i in range(axes):
            cu = pad + step * (i + 0.5)
            w = min(1.4, step - 0.9)
            gz = max(g(cu - w / 2), g(cu + w / 2))
            za = max(1.0, gz + 0.9)
            if 3.7 - za >= 0.8:
                holes.append((cu - w / 2, cu + w / 2, za, 3.7)); wins.append((cu - w / 2, cu + w / 2, za, 3.7))
            for z0, h in ((F2 + 0.9, 1.9), (F3 + 0.85, 1.75)):
                holes.append((cu - w / 2, cu + w / 2, z0, z0 + h)); wins.append((cu - w / 2, cu + w / 2, z0, z0 + h))
    wall(F, 0, L, GROUND, TOP + 0.6, 0, holes, reveal=0.22)
    for ua, ub, za, zb in wins:
        pane(F, ua, ub, za, zb)
    band(F, 0, L, 0, F2 - 0.05, F2 + 0.15, 0.10)        # междуэтажная тяга
    band(F, 0, L, 0, TOP, TOP + 0.3, 0.18)              # скромный карниз во двор
    parapet(F, L)

# ------------------------------------------------------------------ уличный фасад
Fs, Ls, gs = edge(6)          # с юга на север, на Б. Морскую
AX = 14                       # осей по фасаду (наугад: ритм ~3.3 м, простенок ~1.2 м)
PAD = 1.1
ST = (Ls - 2 * PAD) / AX
DOORS = {2: 'Люксоптика', 6: 'Тальменка', 11: 'Ваша оптика'}   # порядок вдоль улицы наугад
holes_lo, holes_hi = [], []
for i in range(AX):
    cu = PAD + ST * (i + 0.5)
    w = ST - 1.2
    g = max(gs(cu - w / 2), gs(cu + w / 2))
    if i in DOORS:
        za = g + 0.15
    else:
        za = g + 0.55
    holes_lo.append((cu - w / 2, cu + w / 2, za, 3.9))
    holes_hi.append((cu - 0.75, cu + 0.75, F2 + 0.05, F2 + 2.25 + 0.75))   # арочная дверь на балкон
    holes_hi.append((cu - 0.7, cu + 0.7, F3 + 0.85, F3 + 0.85 + 1.75))
wall(Fs, 0, Ls, GROUND, F2, 0, holes_lo, m='wall2', reveal=0.30)
wall(Fs, 0, Ls, F2, TOP + 0.6, 0, holes_hi, reveal=0.24)
for i in range(AX):
    cu = PAD + ST * (i + 0.5)
    ua, ub, za, zb = holes_lo[i]
    # витрина без арки: большое стекло с фрамугой; у дверей — портал вишнёвого камня
    quad('glass', Fs, ua, ub, za, zb, -0.26)
    quad('metal', Fs, ua, ub, zb - 0.55, zb - 0.5, -0.24)
    for u in (ua, ub - 0.06):
        quad('metal', Fs, u, u + 0.06, za, zb, -0.24)
    if i in DOORS:
        box('wall3', Fs, ua - 0.35, ua, 0, 0.12, za - 0.15, zb + 0.35)
        box('wall3', Fs, ub, ub + 0.35, 0, 0.12, za - 0.15, zb + 0.35)
        box('wall3', Fs, ua - 0.35, ub + 0.35, 0, 0.14, zb, zb + 0.35)
        quad('metal', Fs, cu - 0.03, cu + 0.03, za, zb - 0.55, -0.22)
        box('stone', Fs, ua - 0.1, ub + 0.1, 0, 0.6, za - 0.6, za)               # ступень
    else:
        box('stone', Fs, ua - 0.02, ub + 0.02, -0.30, 0.06, za - 0.08, za)        # подоконник витрины
    # второй этаж: арочная дверь, балкон; третий — прямоугольное окно в наличнике
    pane(Fs, cu - 0.75, cu + 0.75, F2 + 0.05, F2 + 2.25 + 0.75, cols=2, sill=False)
    arch_top(Fs, cu - 0.75, cu + 0.75, F2 + 2.25)
    balcony(Fs, cu, F2 + 0.05)
    pane(Fs, cu - 0.7, cu + 0.7, F3 + 0.85, F3 + 2.6)
    surround(Fs, cu - 0.7, cu + 0.7, F3 + 0.85, F3 + 2.6, 0.0, 'plain')
# цоколь по уклону улицы, тяги, венчающий карниз
for k in range(AX + 1):
    u = PAD + ST * k
    box('wall2', Fs, u - 0.6, u + 0.6, 0, 0.06, GROUND, F2)                   # лопатки между витринами
band(Fs, 0, Ls, 0, 3.9, 4.0, 0.08)
band(Fs, 0, Ls, 0, F2 - 0.1, F2 + 0.2, 0.22)
band(Fs, 0, Ls, 0, F3 + 0.6, F3 + 0.72, 0.08)
cornice(Fs, 0, Ls, 0, TOP, ext=0.55)
parapet(Fs, Ls)
# фигурный аттик на северном углу (к переулку и перекрёстку)
ATT = [(Ls - 6.0, PAR), (Ls + 0.1, PAR), (Ls + 0.1, PAR + 1.3), (Ls - 1.2, PAR + 1.3), (Ls - 1.6, PAR + 2.0),
       (Ls - 2.4, PAR + 2.35), (Ls - 3.2, PAR + 2.0), (Ls - 3.6, PAR + 1.3), (Ls - 5.0, PAR + 1.3), (Ls - 5.3, PAR + 0.8), (Ls - 6.0, PAR + 0.6)]
prism_uz('wall', Fs, ATT, -0.4, 0.05)
box('trim', Fs, Ls - 3.7, Ls - 1.1, 0.05, 0.15, PAR + 1.2, PAR + 1.35)
box('trim', Fs, Ls - 2.7, Ls - 2.1, 0.05, 0.12, PAR + 0.35, PAR + 1.05)          # филёнка
Fn, Ln, gn = edge(0)
prism_uz('wall', Fn, [(-0.1, PAR), (4.5, PAR), (4.5, PAR + 0.6), (3.8, PAR + 0.9), (0.4, PAR + 1.3), (-0.1, PAR + 1.3)], -0.4, 0.05)

# ------------------------------------------------------------------ остальные фасады
side_wall(Fn, Ln, gn, 3, pad=1.4)                      # северный торец, к переулку
for i, axes in ((1, 12), (2, 0), (3, 4), (4, 4), (5, 1)):
    F, L, g = edge(i)
    side_wall(F, L, g, axes, pad=0.9 if axes else 0)
# угловой карниз уличного фасада заходит на торцы
for i, u0, u1 in ((0, 0, 2.5), (5, 3.2, None)):
    F, L, g = edge(i)
    cornice(F, u0, u1 if u1 is not None else L, 0, TOP, ext=0.55)

# ------------------------------------------------------------------ кровля
face('roof', [Vector((*W(*p), TOP + 0.6)) for p in P], UP)
def chim(F, u, d, h=1.6):
    box('wall3', F, u - 0.4, u + 0.4, d - 0.35, d + 0.35, TOP + 0.6, TOP + 0.6 + h)
    box('stone', F, u - 0.5, u + 0.5, d - 0.45, d + 0.45, TOP + 0.6 + h, TOP + 0.75 + h)
chim(Fs, Ls * 0.30, -6.0)
chim(Fs, Ls * 0.68, -7.0, 1.4)
box('stone', Fs, Ls * 0.48, Ls * 0.48 + 2.2, -9.5, -7.4, TOP + 0.6, TOP + 2.8)   # выход на кровлю

finish('bmorskaya27', __file__)
