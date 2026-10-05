# СевГУ, ул. Гоголя, 23 — пятиэтажный учебный корпус за оградой напротив
# главного корпуса (OSM way 91979656, building=university). Модель с нуля.
#
#   blender -b --python models/sevgu_gogolya23/build.py -- [glb]
#
# План — прямоугольник контура OSM 15.1 × 35.2 м, длинный фасад смотрит на
# запад, на ул. Гоголя. Фасад — панорама Яндекса 15.11.2025 (refs/ya_2025_*):
# пять этажей, светло-бежевая штукатурка, ровная сетка окон в белых
# пластиковых рамах, плоская кровля с парапетом и решёткой по краю. Ноль
# высоты — земля у середины уличного фасада; участок поднимается к востоку
# на 1.7 м. Что наугад — NOTES.md.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

P0, P1, P2_, P3 = (-363.7, 2133.0), (-349.7, 2138.7), (-363.1, 2171.3), (-377.1, 2165.6)
X0, Z0 = -370.4, 2149.3                       # середина западного (уличного) фасада
origin(X0, Z0)
INSIDE = (-363.4, 2152.2)

COL['wall'] = ((0.84, 0.79, 0.66), 0.9)       # бежевая штукатурка (замер по панораме)
COL['trim'] = ((0.90, 0.88, 0.83), 0.85)      # откосы, отливы, белые рамы
COL['stone'] = ((0.55, 0.53, 0.50), 0.9)      # цоколь
COL['roof'] = ((0.30, 0.30, 0.31), 0.9)       # рулонная кровля
COL['glass'] = ((0.12, 0.15, 0.18), 0.15)
COL['metal'] = ((0.20, 0.21, 0.22), 0.5)

GROUND = -3.0
PL = 0.6          # цоколь
FH = 3.2          # этаж
NF = 5
TOP = PL + NF * FH + 0.4     # верх стены = низ парапета 17.0
PAR = TOP + 0.6              # верх парапета

def quad(m, F, u0, u1, z0, z1, d):
    face(m, [F.p(u0, d, z0), F.p(u1, d, z0), F.p(u1, d, z1), F.p(u0, d, z1)], F.N())

def side(F, L, n_ax, rear=False, entrance=None, blank=()):
    """Фасад: стена с проёмами, окна этажей, цоколь, парапет с решёткой."""
    step = L / n_ax
    holes, wins = [], []
    for f in range(NF):
        za = PL + f * FH + 0.95
        if f == 0 and rear:
            za += 0.9          # со двора земля выше на полтора метра
        h = 1.55 if not (f == 0 and rear) else 0.9
        for i in range(n_ax):
            if i in blank:
                continue
            cu = step * (i + 0.5)
            if entrance is not None and f == 0 and i == entrance:
                continue
            w = 1.8
            holes.append((cu - w / 2, cu + w / 2, za, za + h))
            wins.append((cu, w, za, h))
    if entrance is not None:
        cu = step * (entrance + 0.5)
        holes.append((cu - 1.0, cu + 1.0, PL, PL + 2.4))
    wall(F, 0, L, PL, TOP, 0, holes, reveal=0.18)
    box('stone', F, 0, L, -0.3, 0.06, GROUND, PL)
    for cu, w, za, h in wins:
        g = -0.16
        face('glass', [F.p(cu - w / 2, g, za), F.p(cu + w / 2, g, za), F.p(cu + w / 2, g, za + h), F.p(cu - w / 2, g, za + h)], F.N())
        t = 0.05
        for a, b in ((cu - w / 2, cu - w / 2 + t), (cu - t / 2, cu + t / 2), (cu + w / 2 - t, cu + w / 2)):
            quad('trim', F, a, b, za, za + h, g + 0.03)
        quad('trim', F, cu - w / 2, cu + w / 2, za + h - t, za + h, g + 0.03)
        quad('trim', F, cu - w / 2, cu + w / 2, za, za + t, g + 0.03)
        quad('trim', F, cu - w / 2 - 0.05, cu + w / 2 + 0.05, za - 0.06, za, 0.07)        # отлив
        face('trim', [F.p(cu - w / 2 - 0.05, -0.18, za), F.p(cu + w / 2 + 0.05, -0.18, za),
                      F.p(cu + w / 2 + 0.05, 0.07, za), F.p(cu - w / 2 - 0.05, 0.07, za)], UP)
    if entrance is not None:
        cu = step * (entrance + 0.5)
        face('metal', [F.p(cu - 1.0, -0.15, PL), F.p(cu + 1.0, -0.15, PL), F.p(cu + 1.0, -0.15, PL + 2.4),
                       F.p(cu - 1.0, -0.15, PL + 2.4)], F.N())
        quad('trim', F, cu - 0.03, cu + 0.03, PL, PL + 2.4, -0.13)
        box('stone', F, cu - 1.8, cu + 1.8, 0, 1.6, PL + 2.7, PL + 2.9)                  # козырёк
        box('stone', F, cu - 1.6, cu + 1.6, 0, 1.6, GROUND, PL - 0.02)                   # крыльцо
        box('stone', F, cu - 1.6, cu + 1.6, 1.6, 2.0, GROUND, PL * 0.5)
    # парапет: стенка, отлив-покрытие и решётка ограждения кровли
    quad('wall', F, -0.25, L + 0.25, TOP, PAR, 0.0)
    box('trim', F, -0.3, L + 0.3, -0.3, 0.08, PAR, PAR + 0.08)
    beam('metal', F.p(0, -0.15, PAR + 1.0), F.p(L, -0.15, PAR + 1.0), 0.04)
    k = 0.0
    while k <= L + 1e-6:
        beam('metal', F.p(k, -0.15, PAR + 0.08), F.p(k, -0.15, PAR + 1.0), 0.03)
        k += L / max(1, round(L / 1.5))
    band = lambda z: quad('trim', F, 0, L, z, z + 0.08, 0.02)
    band(PL + 0.02)

Fw, Lw = frame_from(P3, P0, INSIDE)     # западный, на улицу
Fe, Le = frame_from(P1, P2_, INSIDE)    # восточный, во двор
Fn, Ln = frame_from(P0, P1, INSIDE)     # северный торец
Fs, Ls = frame_from(P2_, P3, INSIDE)    # южный торец
side(Fw, Lw, 11, entrance=5)
# наружные блоки кондиционеров под окнами — на панораме их десяток с лишним
for i, f in ((0, 3), (1, 1), (2, 4), (3, 2), (4, 3), (6, 1), (6, 4), (7, 2), (8, 3), (9, 1), (10, 2), (10, 4), (2, 2)):
    cu = Lw / 11 * (i + 0.5) + 1.05
    z = PL + f * FH + 0.15
    box('trim', Fw, cu - 0.4, cu + 0.4, 0, 0.32, z, z + 0.55)
    quad('metal', Fw, cu - 0.3, cu + 0.3, z + 0.08, z + 0.47, 0.33)
side(Fe, Le, 11, rear=True)
side(Fn, Ln, 4, blank=(1, 2))
side(Fs, Ls, 4, blank=(1, 2))
# кровля: плоская плита внутри парапета и будка выхода на крышу
Fp = Frame(W(*P3), (W(*P0) - W(*P3)).normalized(), Fw.n)
face('roof', [Vector((*W(*p), TOP)) for p in (P0, P1, P2_, P3)], UP)
Fr, _ = frame_from(P3, P0, INSIDE)
box('wall', Fr, Lw * 0.42, Lw * 0.58, -9.5, -5.5, TOP, TOP + 2.6)
box('trim', Fr, Lw * 0.42 - 0.1, Lw * 0.58 + 0.1, -9.6, -5.4, TOP + 2.6, TOP + 2.75)
box('metal', Fr, Lw * 0.25, Lw * 0.25 + 1.2, -4.0, -2.8, TOP, TOP + 0.9)                 # вентиляция
beam('metal', Fr.p(Lw * 0.6, -3.0, TOP), Fr.p(Lw * 0.6, -3.0, TOP + 2.2), 0.06)          # мачта с тарелкой

finish('sevgu_gogolya23', __file__)
