# Улица Воронина, 11 — трёхэтажный корпус на Черноморке (OSM way 195694375,
# building=government: ФМС Ленинского района, транспортная прокуратура,
# магазин «Ёжики»). Модель с нуля.
#
#   blender -b --python models/voronina11/build.py -- [glb]
#   (или python3 с модулем bpy: python3 models/voronina11/build.py -- glb)
#
# План — прямоугольник контура OSM 11.7 × 24.9 м, длинный фасад смотрит на
# запад, на ул. Воронина. Описание в refs/center-models.json скупое: три
# этажа, высота 11 м, стены #e0d6bd, кровля #7a7a7a, «всё кроме плана
# наугад». Фото нет — фасад сдержанный, в духе послевоенных соседей:
# штукатурка, карниз, межэтажный поясок, простые наличники, низкая вальмовая
# кровля. Что наугад — NOTES.md.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# углы контура: север, восток, юг, запад
P0, P1, P2_, P3 = (-320.0, 562.9), (-309.4, 567.8), (-319.9, 590.4), (-330.5, 585.5)
NB = (-313.8, 565.8)                          # отсюда к востоку северный торец глухой: вплотную w195694376
X0, Z0 = -325.25, 574.2                       # середина западного (уличного) фасада
origin(X0, Z0)
INSIDE = (-320.0, 576.6)

COL['wall'] = ((0.878, 0.839, 0.741), 0.9)    # #e0d6bd из описания
COL['wall2'] = ((0.80, 0.76, 0.66), 0.9)      # цоколь первого этажа чуть темнее
COL['trim'] = ((0.93, 0.91, 0.86), 0.85)      # карниз, пояс, наличники, рамы
COL['stone'] = ((0.56, 0.54, 0.51), 0.9)      # цоколь, крыльцо
COL['roof'] = ((0.478, 0.478, 0.478), 0.85)   # #7a7a7a из описания
COL['glass'] = ((0.10, 0.13, 0.16), 0.15)
COL['metal'] = ((0.20, 0.21, 0.22), 0.5)

GROUND = -3.0
PL = 0.5                      # цоколь
F1 = 3.6                      # первый этаж
FH = 3.3                      # второй и третий
TOP = PL + F1 + 2 * FH + 0.3  # низ карниза 11.0
RISE = 2.3                    # вальма

def floors():
    """(низ окна, высота окна) по этажам."""
    return [(PL + 0.9, 2.0), (PL + F1 + 0.85, 1.75), (PL + F1 + FH + 0.85, 1.75)]

def side(F, L, n_ax, axes=None, entrance=None, u_end=None):
    """Фасад: стена с окнами по осям, цоколь, пояс над первым этажом, карниз."""
    u_end = L if u_end is None else u_end
    step = u_end / n_ax
    axes = range(n_ax) if axes is None else axes
    holes = []
    for f, (za, h) in enumerate(floors()):
        for i in axes:
            cu = step * (i + 0.5)
            if f == 0 and i == entrance:
                continue
            w = 1.5 if f == 0 else 1.4
            holes.append(window(F, cu, za, w, h, 0.0, cols=2, rows=(0.72,)))
    if entrance is not None:
        cu = step * (entrance + 0.5)
        holes.append((cu - 0.85, cu + 0.85, PL, PL + 2.6))
        face('wood', [F.p(cu - 0.85, -0.2, PL), F.p(cu + 0.85, -0.2, PL), F.p(cu + 0.85, -0.2, PL + 2.6),
                      F.p(cu - 0.85, -0.2, PL + 2.6)], F.N())
        box('trim', F, cu - 1.05, cu - 0.85, 0, 0.06, PL, PL + 2.8)            # обрамление входа
        box('trim', F, cu + 0.85, cu + 1.05, 0, 0.06, PL, PL + 2.8)
        box('trim', F, cu - 1.05, cu + 1.05, 0, 0.06, PL + 2.6, PL + 2.8)
        box('stone', F, cu - 1.5, cu + 1.5, 0, 1.4, PL + 3.0, PL + 3.15)       # козырёк
        box('stone', F, cu - 1.3, cu + 1.3, 0, 1.4, GROUND, PL - 0.02)         # крыльцо
        box('stone', F, cu - 1.3, cu + 1.3, 1.4, 1.75, GROUND, PL * 0.5)
    wall(F, 0, L, PL + F1, TOP, 0, [h for h in holes if h[2] >= PL + F1], reveal=0.22)
    wall(F, 0, L, PL, PL + F1, 0, [h for h in holes if h[2] < PL + F1], m='wall2', reveal=0.22)
    box('stone', F, 0, L, -0.25, 0.08, GROUND, PL)                              # цоколь
    band(F, 0, L, 0.0, PL + F1 - 0.05, PL + F1 + 0.2, 0.12)                     # пояс над первым этажом
    band(F, 0, L, 0.0, PL - 0.02, PL + 0.08, 0.1)
    cornice(F, 0, L, 0.0, TOP, ext=0.45)

Fw, Lw = frame_from(P3, P0, INSIDE)     # западный, на ул. Воронина
Fe, Le = frame_from(P1, P2_, INSIDE)    # восточный, во двор
Fn, Ln = frame_from(P0, P1, INSIDE)     # северный торец
Fs, Ls = frame_from(P2_, P3, INSIDE)    # южный торец
free_n = (W(*NB) - W(*P0)).length        # свободная часть северного торца

side(Fw, Lw, 9, entrance=4)
side(Fe, Le, 9, entrance=6)
side(Fn, Ln, 3, axes=(0, 1), u_end=free_n * 1.5)   # две оси на свободной части, у соседа глухо
side(Fs, Ls, 3)

# кровля: низкая вальма по всему прямоугольнику
Fr, Lr = frame_from(P3, P0, INSIDE)
hip_roof(Fr, 0, Lr, 0.0, -Ln, TOP + 0.6, RISE, ov=0.45)
# два дымника-вентблока на скатах
chimney(Fr, Lr * 0.3, -Ln * 0.5 + 1.6, TOP + 1.0, TOP + RISE + 0.9, w=0.7)
chimney(Fr, Lr * 0.72, -Ln * 0.5 - 1.6, TOP + 1.0, TOP + RISE + 0.9, w=0.7)

finish('voronina11', __file__)
