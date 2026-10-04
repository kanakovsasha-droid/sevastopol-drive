# Севастопольский морской вокзал (пл. Нахимова, 3-5) — модель с нуля.
#
#   blender -b --python models/morvokzal/build.py -- [glb]
#
# Это НЕ сталинский вокзал с башней: здание 1968 года, трёхэтажная плоская «доска»
# вдоль причала Южной бухты, ленточное остекление на два яруса, буквы
# «СЕВАСТОПОЛЬ» на кровле (см. NOTES.md — откуда это известно и что догадка).
# План — контур OSM way 166977372, выпрямленный до двух прямоугольников.
# Ноль высоты — земля у главного входа со стороны причала (восточный фасад).
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

COL['wall']  = ((0.87, 0.84, 0.78), 0.9)     # светлая штукатурка #ded7c6 (houses.json)
COL['wall2'] = ((0.74, 0.73, 0.69), 0.9)     # фризы под лентами, ребра-пилоны
COL['wall3'] = ((0.66, 0.66, 0.64), 0.9)     # кровельные надстройки
COL['roof']  = ((0.54, 0.37, 0.28), 0.85)    # рыжая плоская кровля #8a5f47
COL['stone'] = ((0.55, 0.54, 0.52), 0.9)
COL['glass'] = ((0.09, 0.15, 0.19), 0.12)

X0, Z0 = 63.7, 106.0                          # восточный фасад, середина главного корпуса
origin(X0, Z0)

# ---- план (мир x, z), восточная грань контура — одна прямая в 76 м
A, B, IN = (63.3, 79.5), (64.4, 155.7), (55.0, 100.0)
F, LEN = frame_from(A, B, IN)                 # u — на юг, n — наружу, на причал
LM = 55.15                                    # длина главного корпуса вдоль u
WM = 15.8                                     # его ширина
WW = 10.6                                     # ширина южного крыла
LW = LEN                                      # полная длина, 76.2

GROUND = -3.0
PL = 0.35                                     # цоколь: пол первого этажа над землёй
Z1, Z2, Z3 = 3.6, 6.9, 10.2                   # перекрытия: низ 2-го, низ 3-го, кровля
PAR = 10.8                                    # верх парапета

# ======================================================================= восточный фасад
def build_east():
    holes, wins = [], []
    # главный корпус: 9 осей, южное крыло: 3 оси
    bays = [(i * LM / 9, (i + 1) * LM / 9) for i in range(9)] + \
           [(LM + i * (LW - LM) / 3, LM + (i + 1) * (LW - LM) / 3) for i in range(3)]
    EN = 4                                    # ось главного входа (центр u ≈ 27.6)
    for i, (a, b) in enumerate(bays):
        cu = (a + b) / 2
        w = (b - a) - 0.75
        ua, ub = cu - w / 2, cu + w / 2
        wing = i >= 9
        if wing:
            holes.append((ua + 0.6, ub - 0.6, 1.5, 3.0)); wins.append(('g', ua + 0.6, ub - 0.6, 1.5, 3.0, 3))
        else:
            zb = 3.35 if i == EN else 3.1
            za = PL if i == EN else 0.8
            holes.append((ua, ub, za, zb)); wins.append(('g', ua, ub, za, zb, 4 if i != EN else 6))
        for za, zb in ((4.35, 6.35), (7.65, 9.65)):
            holes.append((ua, ub, za, zb)); wins.append(('r', ua, ub, za, zb, 5 if not wing else 6))
    wall(F, 0, LW, GROUND, Z3, 0, holes, reveal=0.30)
    for kind, ua, ub, za, zb, cols in wins:
        rows = (0.72,) if kind == 'g' and zb - za < 3 else ((0.80,) if kind == 'g' else ())
        glazing(F, ua, ub, za, zb, 0, cols=cols, rows=rows, reveal=0.30)
    # цоколь и ступень у входа
    box('stone', F, 0, LW, -0.3, 0.14, GROUND, PL + 0.05)
    box('stone', F, 21.8, 33.4, 0.14, 1.1, GROUND, 0.18)
    # междуэтажные пояса, фризы под лентами
    for z0 in (Z1 - 0.2, Z2 - 0.2):
        band(F, 0, LW, 0, z0, z0 + 0.5, 0.22)
    # пилоны-рёбра между осями (вертикаль, подчёркивающая ленты)
    for i, (a, b) in enumerate(bays):
        for u in (a, b):
            if (i == 0 and u == a): u += 0.1
            if (i == len(bays) - 1 and u == b): u -= 0.1
            box('wall2', F, u - 0.17, u + 0.17, 0, 0.30, PL, Z3)
    # парапет и карниз
    cornice_top(F, 0, LW, 0)
    # главный вход: козырёк на двух стойках и вывеска-фриз
    box('trim', F, 21.4, 33.8, 0.0, 5.4, 3.05, 3.40)
    box('trim', F, 21.4, 33.8, 5.2, 5.4, 3.40, 3.62)
    for u in (22.2, 33.0):
        beam('metal', F.p(u, 4.9, 0.18), F.p(u, 4.9, 3.05), 0.26)
    # пристань: швартовые тумбы — мелочь на кромке не нужна, это земля игры

# венчающий пояс + парапет (общий для всех фасадов)
def cornice_top(Fc, u0, u1, d):
    box('trim', Fc, u0 - 0.15, u1 + 0.15, d - 0.30, d + 0.40, Z3 - 0.05, Z3 + 0.22)
    box('trim', Fc, u0 - 0.15, u1 + 0.15, d - 0.30, d + 0.50, Z3 + 0.22, Z3 + 0.62)
    box('wall', Fc, u0, u1, d - 0.30, d, Z3 + 0.62, PAR)
    box('trim', Fc, u0 - 0.15, u1 + 0.15, d - 0.30, d + 0.50, PAR - 0.04, PAR + 0.08)

# ======================================================================= прочие фасады
def punched(Fc, L, nb, floors, wmin=1.6, h=1.7, ground=None, skip=()):
    """Глухой фасад с рядами одиночных окон. floors — [(za, ...)]"""
    holes, wins = [], []
    step = L / nb
    for i in range(nb):
        cu = step * (i + 0.5)
        for k, za in enumerate(floors):
            if (i, k) in skip: continue
            hh = h if za > 3.0 else 0.95
            w = wmin if za > 3.0 else 1.1
            holes.append((cu - w / 2, cu + w / 2, za, za + hh)); wins.append((cu, za, w, hh))
    return holes, wins

def facade_punched(Fc, L, nb, floors, skip=(), entrance=None):
    holes, wins = punched(Fc, L, nb, floors, skip=skip)
    ex = []
    if entrance: ex.append(entrance)
    wall(Fc, 0, L, GROUND, Z3, 0, holes + ex, reveal=0.26)
    for cu, za, w, hh in wins:
        surround(Fc, cu - w / 2, cu + w / 2, za, za + hh, 0, 'plain')
        glazing(Fc, cu - w / 2, cu + w / 2, za, za + hh, 0, cols=2, rows=(0.7,), reveal=0.26)
    band(Fc, 0, L, 0, Z1 - 0.2, Z1 + 0.08, 0.14)
    band(Fc, 0, L, 0, Z2 - 0.2, Z2 + 0.08, 0.14)
    box('stone', Fc, 0, L, -0.3, 0.12, GROUND, PL + 0.1)
    cornice_top(Fc, 0, L, 0)

def build_west():
    # западная сторона (к скверу и пл. Нахимова): земля игры тут выше ноля на ~2 м,
    # поэтому нижний ярус — высокие узкие окна, а вход — на уровне 2-го этажа.
    Fw = Frame(F.p(0, -WM, 0).xy, F.u, -F.n)
    holes, wins = punched(Fw, LM, 18, (2.35, 4.35, 7.65), skip={(8, 1), (9, 1)})
    door = (25.7, 29.5, Z1 + 0.35, Z1 + 2.95)
    wall(Fw, 0, LM, GROUND, Z3, 0, holes + [door], reveal=0.26)
    for cu, za, w, hh in wins:
        surround(Fw, cu - w / 2, cu + w / 2, za, za + hh, 0, 'plain')
        glazing(Fw, cu - w / 2, cu + w / 2, za, za + hh, 0, cols=2, rows=(0.7,), reveal=0.26)
    # портал входа на уровне 2-го этажа: двустворчатая дверь, козырёк, лестница к земле
    g = -0.26
    face('glass', [Fw.p(door[0], g, door[2]), Fw.p(door[1], g, door[2]), Fw.p(door[1], g, door[3]), Fw.p(door[0], g, door[3])], Fw.N())
    for u in (door[0], (door[0] + door[1]) / 2, door[1]):
        box('trim', Fw, u - 0.05, u + 0.05, g, g + 0.07, door[2], door[3])
    box('trim', Fw, door[0], door[1], g, g + 0.07, door[3] - 0.06, door[3])
    box('trim', Fw, door[0] - 0.3, door[0], 0, 0.18, door[2], door[3] + 0.3)
    box('trim', Fw, door[1], door[1] + 0.3, 0, 0.18, door[2], door[3] + 0.3)
    box('trim', Fw, 23.8, 31.4, 0, 3.4, Z1 + 3.45, Z1 + 3.78)
    for u in (24.4, 30.8):
        beam('metal', Fw.p(u, 3.0, Z1), Fw.p(u, 3.0, Z1 + 3.45), 0.2)
    box('stone', Fw, 24.4, 30.8, 0, 2.3, GROUND, Z1 - 0.02)
    for i in range(8):                                       # лестница вниз, к земле игры
        top = Z1 - 0.18 * (i + 1)
        box('stone', Fw, 24.4, 30.8, 2.3, 2.6 + 0.3 * i, GROUND, top)
    for u in (24.3, 30.9):
        beam('metal', Fw.p(u, 0.3, Z1 + 1.0), Fw.p(u, 4.6, Z1 - 0.18 * 8 + 1.0), 0.06)
    band(Fw, 0, LM, 0, Z1 - 0.2, Z1 + 0.08, 0.14)
    band(Fw, 0, LM, 0, Z2 - 0.2, Z2 + 0.08, 0.14)
    box('stone', Fw, 0, LM, -0.3, 0.12, GROUND, 1.0)
    cornice_top(Fw, 0, LM, 0)
    # крыло
    Fx = Frame(F.p(LM, -WW, 0).xy, F.u, -F.n)
    Lx = LW - LM
    facade_punched(Fx, Lx, 7, (2.35, 4.35, 7.65))

def build_ends():
    # северный торец: от восточного угла к западному
    Fn = Frame(F.p(0, 0, 0).xy, -F.n, -F.u)
    facade_punched(Fn, WM, 5, (2.35, 4.35, 7.65))
    # южный торец крыла
    Fs = Frame(F.p(LW, -WW, 0).xy, F.n, F.u)
    facade_punched(Fs, WW, 3, (2.35, 4.35, 7.65))
    # уступ между корпусом и крылом (смотрит на юг)
    Fu = Frame(F.p(LM, -WM, 0).xy, F.n, F.u)
    facade_punched(Fu, WM - WW, 1, (2.35, 4.35, 7.65))

# ======================================================================= кровля
def build_roof():
    Fi = Frame(Vector((0, 0)), Vector((1, 0)), Vector((0, 1)))
    k = 0.12                                      # кровля чуть внутри стен, чтобы не мерцала на их плоскости
    poly = [(k, -k), (LW - k, -k), (LW - k, -WW + k), (LM + k, -WW + k), (LM + k, -WM + k), (k, -WM + k)]
    pts = [F.p(u, d, 0).xy for u, d in poly]
    prism_plan('roof', Fi, [(p.x, p.y) for p in pts], Z3 - 0.25, Z3 + 0.02)
    # лестничная клетка и машинное помещение
    box('wall3', F, 9.0, 15.0, -9.0, -4.0, Z3, Z3 + 3.0)
    box('trim', F, 8.8, 15.2, -9.2, -3.8, Z3 + 3.0, Z3 + 3.2)
    box('wall3', F, 34.0, 38.5, -12.5, -8.0, Z3, Z3 + 2.4)
    box('trim', F, 33.8, 38.7, -12.7, -7.8, Z3 + 2.4, Z3 + 2.55)
    box('wall3', F, 62.0, 66.0, -7.0, -3.0, Z3, Z3 + 2.2)
    box('trim', F, 61.8, 66.2, -7.2, -2.8, Z3 + 2.2, Z3 + 2.35)
    for u, d in ((44.0, -6.0), (47.5, -6.0), (20.0, -12.0)):   # вентблоки
        box('metal', F, u, u + 1.6, d, d + 1.2, Z3, Z3 + 1.0)
    # мачта связи на лестничной клетке
    beam('metal', F.p(12.0, -6.5, Z3 + 3.2), F.p(12.0, -6.5, Z3 + 9.0), 0.14)
    beam('metal', F.p(12.0, -6.5, Z3 + 7.0), F.p(13.4, -6.5, Z3 + 7.0), 0.06)
    # парапеты вокруг кровли строятся с фасадами (cornice_top)

# ======================================================================= буквы на кровле
GLYPH = {
    'С': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
    'Е': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    'В': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    'А': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'Т': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    'О': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    'П': ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#'],
    'Л': ['..###', '.#..#', '.#..#', '#...#', '#...#', '#...#', '#...#'],
    'Ь': ['#....', '#....', '#....', '####.', '#...#', '#...#', '####.'],
}

def build_letters():
    word = 'СЕВАСТОПОЛЬ'
    cell, gap = 0.30, 0.55
    wl = 5 * cell
    total = len(word) * wl + (len(word) - 1) * gap
    uc = 27.6                                  # над главным входом
    z0 = PAR + 0.65
    d = -1.0                                   # отступ от парапета вглубь
    # зритель смотрит с воды (на запад): слева — юг. u растёт на юг, поэтому буквы идут по убыванию u
    ustart = uc + total / 2
    for k, ch in enumerate(word):
        ul = ustart - k * (wl + gap)           # левый край буквы (юг)
        for r, row in enumerate(GLYPH[ch]):
            zt = z0 + (6 - r) * cell
            c = 0
            while c < 5:
                if row[c] == '#':
                    c2 = c
                    while c2 + 1 < 5 and row[c2 + 1] == '#': c2 += 1
                    ua, ub = ul - (c2 + 1) * cell, ul - c * cell
                    box('trim', F, ua, ub, d - 0.18, d + 0.18, zt, zt + cell, bottom=False)
                    c = c2 + 1
                else:
                    c += 1
    # каркас-подставка: два поясных бруса и стойки
    ua, ub = uc - total / 2 - 0.4, uc + total / 2 + 0.4
    beam('metal', F.p(ua, d, PAR + 0.35), F.p(ub, d, PAR + 0.35), 0.12)
    beam('metal', F.p(ua, d, PAR + 0.65), F.p(ub, d, PAR + 0.65), 0.12)
    u = ua
    while u <= ub + 0.01:
        beam('metal', F.p(u, d, PAR), F.p(u, d, PAR + 0.65), 0.1)
        u += (ub - ua) / 10

build_east()
build_west()
build_ends()
build_roof()
build_letters()

finish('morvokzal', __file__, 25000)
