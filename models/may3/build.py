# Улица Маяковского, 3 (Черноморка) — трёхэтажный жилой корпус, OSM way 91092537. Модель с нуля.
#
#   blender -b --python models/may3/build.py -- [glb]
#
# План — прямоугольник контура OSM 34.0 × 13.4 м; длинный фасад (ребро 0) смотрит на северо-восток,
# на ул. Маяковского. Фото нет: в refs/center-models.json только «узкий корпус 34x13 м», три этажа,
# 12 м, кремовая штукатурка #e0d6bd, серая кровля #7a7a7a. Всё остальное — сдержанно, в духе
# послевоенных соседей Черноморки: ровная сетка окон, тяга над первым этажом, карниз, вальмовая
# крыша, подъезды со двора. Что наугад — NOTES.md. Ноль высоты — земля у середины уличного фасада.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

P0, P1, P2_, P3 = (-499.5, 494.9), (-471.1, 513.6), (-478.5, 524.8), (-506.9, 506.0)
X0, Z0 = -485.3, 504.25                       # середина уличного фасада
origin(X0, Z0)
INSIDE = (-489.0, 509.8)

COL['wall'] = ((0.878, 0.839, 0.741), 0.9)    # #e0d6bd — из описания
COL['roof'] = ((0.478, 0.478, 0.478), 0.85)   # #7a7a7a — из описания
COL['trim'] = ((0.93, 0.91, 0.86), 0.85)      # тяги, наличники, рамы — светлее стены
COL['stone'] = ((0.56, 0.54, 0.50), 0.9)      # цоколь, крыльца
COL['glass'] = ((0.10, 0.13, 0.16), 0.15)
COL['wood'] = ((0.30, 0.20, 0.13), 0.6)       # двери подъездов

GROUND = -3.0     # стены уходят под землю: участок на склоне
PL = 0.6          # верх цоколя = пол первого этажа
FH = 3.1          # этаж
NF = 3
TOP = PL + NF * FH + 0.3     # низ карниза, 10.2
WW, WH = 1.4, 1.75           # окно

def quad(m, F, u0, u1, z0, z1, d):
    face(m, [F.p(u0, d, z0), F.p(u1, d, z0), F.p(u1, d, z1), F.p(u0, d, z1)], F.N())

def win(F, cu, za, w, h):
    """Окно: стекло в глубине, рама с импостом и фрамугой, плоский наличник и отлив."""
    g = -0.18
    face('glass', [F.p(cu - w / 2, g, za), F.p(cu + w / 2, g, za), F.p(cu + w / 2, g, za + h), F.p(cu - w / 2, g, za + h)], F.N())
    t = 0.06
    for a, b in ((cu - w / 2, cu - w / 2 + t), (cu - t / 2, cu + t / 2), (cu + w / 2 - t, cu + w / 2)):
        quad('trim', F, a, b, za, za + h, g + 0.03)
    for z in (za, za + h * 0.72, za + h - t):
        quad('trim', F, cu - w / 2, cu + w / 2, z, z + t, g + 0.03)
    s = 0.14                                                    # наличник — накладная рамка
    quad('trim', F, cu - w / 2 - s, cu - w / 2, za, za + h + s, 0.03)
    quad('trim', F, cu + w / 2, cu + w / 2 + s, za, za + h + s, 0.03)
    quad('trim', F, cu - w / 2, cu + w / 2, za + h, za + h + s, 0.03)
    box('trim', F, cu - w / 2 - 0.2, cu + w / 2 + 0.2, -0.05, 0.12, za - 0.1, za, bottom=False)   # отлив

def side(F, L, n_ax, doors=(), blank=()):
    """Фасад: стена с проёмами, окна этажей, двери подъездов, цоколь, тяга, карниз."""
    step = L / n_ax
    holes, wins = [], []
    for f in range(NF):
        za = PL + f * FH + 0.85
        for i in range(n_ax):
            if i in blank: continue
            cu = step * (i + 0.5)
            if f == 0 and i in doors: continue
            holes.append((cu - WW / 2, cu + WW / 2, za, za + WH))
            wins.append((cu, za))
    for i in doors:
        cu = step * (i + 0.5)
        holes.append((cu - 0.75, cu + 0.75, PL, PL + 2.3))
    wall(F, 0, L, PL, TOP, 0, holes, reveal=0.18)
    box('stone', F, 0, L, -0.25, 0.08, GROUND, PL, bottom=False)
    for cu, za in wins:
        win(F, cu, za, WW, WH)
    for i in doors:
        cu = step * (i + 0.5)
        quad('wood', F, cu - 0.75, cu + 0.75, PL, PL + 2.3, -0.16)
        quad('trim', F, cu - 0.03, cu + 0.03, PL, PL + 2.3, -0.14)
        box('stone', F, cu - 1.3, cu + 1.3, 0, 1.3, PL + 2.55, PL + 2.7)          # козырёк
        box('stone', F, cu - 1.2, cu + 1.2, 0, 1.4, GROUND, PL - 0.02)            # крыльцо
        box('stone', F, cu - 1.2, cu + 1.2, 1.4, 1.8, GROUND, PL * 0.5)
    band(F, -0.1, L + 0.1, 0, PL + FH - 0.05, PL + FH + 0.15, 0.08)              # тяга над первым этажом
    cornice(F, 0, L, 0, TOP, ext=0.45)

Fs, Ls = frame_from(P0, P1, INSIDE)     # уличный фасад, на СВ
Fy, Ly = frame_from(P2_, P3, INSIDE)    # дворовый
Fe, Le = frame_from(P1, P2_, INSIDE)    # юго-восточный торец
Fw, Lw = frame_from(P3, P0, INSIDE)     # северо-западный торец
side(Fs, Ls, 11)
side(Fy, Ly, 11, doors=(2, 8))
side(Fe, Le, 4, blank=(1, 2))
side(Fw, Lw, 4, blank=(1, 2))

# вальмовая кровля над карнизом и дымоходы
hip_roof(Fs, 0, Ls, 0, -Le, TOP + 0.6, 2.0, ov=0.45)
for u, d in ((Ls * 0.2, -4.5), (Ls * 0.5, -8.8), (Ls * 0.8, -4.5)):
    chimney(Fs, u, d, TOP, TOP + 2.9, w=0.7)

finish('may3', __file__, tri_budget=10000)
