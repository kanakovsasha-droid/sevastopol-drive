# Катерная, 28 — белая вилла у Карантинной бухты (район ТБК), OSM way 462931900.
#
#   blender -b --python models/kat28/build.py -- [glb]
#
# План — шестиугольный контур OSM (248 м²): короткое ребро на северо-запад, к
# Катерной улице, — центральный ризалит с фронтоном; два скошенных ребра по
# сторонам (на запад и на северо-восток) — крылья с широкими окнами, как на
# скриншоте владельца (refs/places/katernaya-villas/01_*). Задние три ребра на
# фото не видны — окна там сдержанно, в той же сетке.
#
# С фото: два этажа над высоким цоколем (низ окон первого этажа — на уровне
# верха уличного забора), белые стены, на ризалите четыре плоские пилястры и
# три оси окон, над ними треугольный фронтон с круглым окошком и лепной
# гирляндой; крылья — широкие окна, под окнами второго этажа выступающая полка;
# красная черепичная вальма с «фонариком»-башенкой и пирамидкой на коньке;
# окна в деревянных коричневых рамах, на ризалите внизу — деревянная дверь.
# Забор и калитка — не здесь (п. 41, cloud/kat-fence). Что наугад — NOTES.md.
import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# контур OSM (мир x, z), обход по часовой на карте «север вверх»
POLY = [(-1755.0, 581.5), (-1749.5, 576.7), (-1739.5, 585.1),
        (-1739.3, 590.7), (-1750.1, 599.5), (-1756.1, 593.4)]
FRONT, WING_W, WING_E = 0, 5, 1            # ребро i: POLY[i] → POLY[i+1]
CX = sum(p[0] for p in POLY) / len(POLY)
CZ = sum(p[1] for p in POLY) / len(POLY)
X0, Z0 = -1752.25, 579.1                   # середина фасада ризалита, у двери
origin(X0, Z0)

COL['wall'] = ((0.94, 0.94, 0.92), 0.9)    # белая штукатурка
COL['trim'] = ((0.98, 0.97, 0.95), 0.85)   # пилястры, карнизы, тяги — тоже белые
COL['stone'] = ((0.80, 0.80, 0.78), 0.9)   # цоколь (за забором не виден — наугад светлый)
COL['roof'] = ((0.74, 0.27, 0.15), 0.75)   # красная черепица
COL['wood'] = ((0.47, 0.25, 0.12), 0.6)    # деревянные рамы и дверь
COL['glass'] = ((0.08, 0.10, 0.12), 0.15)
COL['metal'] = ((0.18, 0.18, 0.19), 0.5)

GROUND = -3.0
PL = 1.2                 # верх цоколя: дом стоит выше улицы
FH = 3.4                 # высота этажа
F2 = PL + FH             # пол второго этажа 4.6
TOP = PL + 2 * FH + 0.4  # низ свеса кровли 8.2
RISE = 3.6               # подъём вальмы до площадки фонарика
TOPK = 0.30              # площадка под фонариком — контур, сжатый к центру

def quad(m, F, u0, u1, z0, z1, d):
    face(m, [F.p(u0, d, z0), F.p(u1, d, z0), F.p(u1, d, z1), F.p(u0, d, z1)], F.N())

def edge(i):
    a, b = POLY[i], POLY[(i + 1) % len(POLY)]
    return frame_from(a, b, (CX, CZ))

def pane(F, ua, ub, za, zb, cols=2, transom=0.72):
    """Окно в деревянной раме: стекло в глубине, рама, импосты, фрамуга, отлив."""
    g = -0.2
    quad('glass', F, ua, ub, za, zb, g)
    t = 0.08
    for u0, u1 in ((ua, ua + t), (ub - t, ub)):
        quad('wood', F, u0, u1, za, zb, g + 0.04)
    quad('wood', F, ua, ub, za, za + t, g + 0.04)
    quad('wood', F, ua, ub, zb - t, zb, g + 0.04)
    for c in range(1, cols):
        u = ua + (ub - ua) * c / cols
        quad('wood', F, u - t / 2, u + t / 2, za, zb, g + 0.04)
    z = za + (zb - za) * transom
    quad('wood', F, ua, ub, z - t / 2, z + t / 2, g + 0.04)
    box('trim', F, ua - 0.1, ub + 0.1, -0.2, 0.1, za - 0.08, za)          # подоконник

def door(F, ua, ub, za, zb):
    """Двустворчатая деревянная дверь со стеклянной фрамугой."""
    g = -0.22
    zt = zb - 0.55
    quad('wood', F, ua, ub, za, zt, g)
    quad('glass', F, ua, ub, zt, zb, g)
    cu = (ua + ub) / 2
    quad('trim', F, cu - 0.03, cu + 0.03, za, zt, g + 0.03)
    quad('wood', F, ua, ub, zt - 0.05, zt + 0.05, g + 0.04)
    for k in (1, 2, 3):                                                   # филёнки створок
        z = za + (zt - za) * k / 4
        quad('trim', F, ua + 0.12, ub - 0.12, z - 0.02, z + 0.02, g + 0.02)

def lesene(F, u, z0, z1, w=0.5, pr=0.1):
    """Плоская лопатка на углу или между осями, с базой и капителью-полкой."""
    box('trim', F, u - w / 2, u + w / 2, -0.02, pr, z0, z1)
    box('trim', F, u - w / 2 - 0.06, u + w / 2 + 0.06, -0.02, pr + 0.06, z0, z0 + 0.3)
    box('trim', F, u - w / 2 - 0.08, u + w / 2 + 0.08, -0.02, pr + 0.1, z1 - 0.45, z1 - 0.3)
    box('trim', F, u - w / 2 - 0.12, u + w / 2 + 0.12, -0.02, pr + 0.14, z1 - 0.3, z1)

def facade(i, wins, doors=(), shelf=False):
    """Фасад ребра i. wins — список (центр по u, ширина, колонок) на оба этажа,
    doors — (центр, ширина) вместо окна первого этажа."""
    F, L = edge(i)
    holes = []
    dset = {round(c, 2): w for c, w in doors}
    for cu, w, cols in wins:
        for f in range(2):
            fz = PL + f * FH
            if f == 0 and round(cu, 2) in dset:
                dw = dset[round(cu, 2)]
                holes.append((cu - dw / 2, cu + dw / 2, fz, fz + 2.75, 'door', 2))
                continue
            holes.append((cu - w / 2, cu + w / 2, fz + 0.9, fz + 2.85, 'win', cols))
    wall(F, 0, L, PL, TOP, 0, [h[:4] for h in holes], reveal=0.2)
    box('stone', F, -0.05, L + 0.05, -0.08, 0.1, GROUND, PL)               # цоколь
    box('trim', F, -0.08, L + 0.08, -0.08, 0.16, PL - 0.12, PL)
    for ua, ub, za, zb, kind, cols in holes:
        if kind == 'door':
            door(F, ua, ub, za, zb)
        else:
            pane(F, ua, ub, za, zb, cols)
        # простой наличник с замковым камнем
        box('trim', F, ua - 0.14, ua, -0.02, 0.06, za, zb + 0.14)
        box('trim', F, ub, ub + 0.14, -0.02, 0.06, za, zb + 0.14)
        box('trim', F, ua - 0.14, ub + 0.14, -0.02, 0.08, zb, zb + 0.16)
        cu = (ua + ub) / 2
        box('trim', F, cu - 0.14, cu + 0.14, -0.02, 0.12, zb - 0.05, zb + 0.3)
    # межэтажная тяга; у крыльев — выступающая полка под окнами второго этажа
    if shelf:
        box('trim', F, 0.2, L - 0.2, -0.02, 0.5, F2 - 0.05, F2 + 0.25)
        box('trim', F, 0.3, L - 0.3, -0.02, 0.4, F2 - 0.25, F2 - 0.05)
    else:
        box('trim', F, -0.04, L + 0.04, -0.02, 0.12, F2 - 0.05, F2 + 0.15)
    # венчающий карниз
    box('trim', F, -0.06, L + 0.06, -0.02, 0.12, TOP - 0.55, TOP - 0.35)
    box('trim', F, -0.14, L + 0.14, -0.02, 0.28, TOP - 0.35, TOP - 0.15)
    box('trim', F, -0.30, L + 0.30, -0.02, 0.48, TOP - 0.15, TOP)
    # угловые лопатки
    lesene(F, 0.25, PL, TOP - 0.55)
    lesene(F, L - 0.25, PL, TOP - 0.55)
    return F, L

def grid(L, n, w, cols, margin=0.9):
    """n осей окон, равномерно по длине стены."""
    if n <= 0: return []
    step = (L - 2 * margin) / n
    return [(margin + step * (k + 0.5), w, cols) for k in range(n)]

# ================================================================== ФАСАДЫ
# Ризалит на улицу: четыре пилястры, три оси; дверь — в правой оси (по фото).
Ff, Lf = edge(FRONT)
bay = (Lf - 0.5) / 3
axes = [0.25 + bay * (k + 0.5) for k in range(3)]
facade(FRONT, [(c, 1.5, 2) for c in axes], doors=[(axes[2], 1.5)])
for k in range(4):
    u = 0.25 + bay * k
    lesene(Ff, u, PL, TOP - 0.55, w=0.45, pr=0.16)
    # фигурная консоль-накладка под капителью (на фото — лепнина у верха пилястр)
    box('trim', Ff, u - 0.18, u + 0.18, 0.1, 0.3, TOP - 1.35, TOP - 0.7)

# Крылья: широкие окна в четыре створки, полка под вторым этажом.
for i in (WING_W, WING_E):
    F, L = edge(i)
    facade(i, grid(L, 2, 2.7, 4, margin=1.2), shelf=True)

# Задние стены (на фото не видны): обычные окна в той же сетке.
for i in (2, 3, 4):
    F, L = edge(i)
    n = max(1, int((L - 1.6) / 3.0))
    facade(i, grid(L, n, 1.4, 2))

# ================================================================== КРОВЛЯ
# Вальма над шестиугольником: свес — контур, раздутый от центра; верх — тот же
# контур, сжатый к центру (площадка под фонариком). Скаты — трапеции.
C2 = W(CX, CZ)
def ring(k, z):
    return [Vector((C2.x + (W(*p).x - C2.x) * k, C2.y + (W(*p).y - C2.y) * k, z)) for p in POLY]
OV = 1.08
lo, hi = ring(OV, TOP), ring(TOPK, TOP + RISE)
n = len(POLY)
for i in range(n):
    j = (i + 1) % n
    q = [lo[i], lo[j], hi[j], hi[i]]
    c = sum(q, Vector()) / 4
    face('roof', q, Vector((c.x - C2.x, c.y - C2.y, 2.5)))
    beam('roof', lo[i] + UP * 0.06, hi[i] + UP * 0.06, 0.2, 0.12)          # рёбра вальмы
face('roof', hi, UP)
face('trim', lo, -UP)                                                   # подшивка свеса

# Фронтон над ризалитом: треугольник с карнизом по скатам, круглое окошко и
# гирлянда под ним; конёк фронтона уходит в скат вальмы.
GR = 1.9
hw = Lf / 2 + 0.3
cu = Lf / 2
zt = TOP
prism_uz('wall', Ff, [(cu - hw, zt), (cu + hw, zt), (cu, zt + GR)], -3.6, 0.0)
box('trim', Ff, cu - hw - 0.1, cu + hw + 0.1, -0.02, 0.5, zt - 0.05, zt + 0.12)   # горизонтальный карниз
for s in (-1, 1):
    prism_uz('trim', Ff, [(cu + s * (hw + 0.25), zt + 0.02), (cu + s * (hw + 0.25), zt + 0.22),
                          (cu, zt + GR + 0.3), (cu, zt + GR + 0.1)], -0.02, 0.45)
    # скаты кровли фронтона
    p0, p1 = Ff.p(cu + s * (hw + 0.35), 0.5, zt + 0.15), Ff.p(cu, 0.5, zt + GR + 0.3)
    p2, p3 = Ff.p(cu, -3.6, zt + GR + 0.3), Ff.p(cu + s * (hw + 0.35), -3.6, zt + 0.15)
    face('roof', [p0, p1, p2, p3], Ff.N() * 0 + UP + Ff.U() * s)
# круглое окошко-окулюс
oz = zt + GR * 0.42
seg = 14
r0, r1 = 0.42, 0.28
ringo = [(cu + r0 * math.cos(2 * math.pi * k / seg), oz + r0 * math.sin(2 * math.pi * k / seg)) for k in range(seg)]
ringi = [(cu + r1 * math.cos(2 * math.pi * k / seg), oz + r1 * math.sin(2 * math.pi * k / seg)) for k in range(seg)]
prism_uz('trim', Ff, ringo, 0.0, 0.1)
face('glass', [Ff.p(u, 0.12, z) for u, z in ringi], Ff.N())
# гирлянда — два листа-накладки, расходящиеся от окулюса вниз
for s in (-1, 1):
    prism_uz('trim', Ff, [(cu + s * 0.3, oz - 0.35), (cu + s * 1.1, oz - 0.5),
                          (cu + s * 1.0, oz - 0.68), (cu + s * 0.2, oz - 0.52)], 0.0, 0.08)

# ================================================================== ФОНАРИК
# Восьмигранная башенка на вершине вальмы: белые стенки, окошки по четырём
# сторонам, карниз, пирамидка черепицы.
Fz = TOP + RISE
R = 1.85
LH = 2.1
F0 = Frame(Vector((C2.x, C2.y)), Vector((1, 0)), Vector((0, 1)))
oct8 = [(R * math.cos(math.pi / 8 + k * math.pi / 4), R * math.sin(math.pi / 8 + k * math.pi / 4)) for k in range(8)]
for k in range(8):
    a, b = oct8[k], oct8[(k + 1) % 8]
    pa, pb = Vector((C2.x + a[0], C2.y + a[1])), Vector((C2.x + b[0], C2.y + b[1]))
    u = (pb - pa)
    L = u.length
    nn = Vector((u.y, -u.x)).normalized()
    if nn.dot((pa + pb) / 2 - Vector((C2.x, C2.y))) < 0:
        nn = -nn
    F = Frame(pa, u, nn)
    if k % 2 == 0:
        wall(F, 0, L, Fz - 0.4, Fz + LH, 0, [(L / 2 - 0.3, L / 2 + 0.3, Fz + 0.55, Fz + 1.35)], reveal=0.15)
        pane(F, L / 2 - 0.3, L / 2 + 0.3, Fz + 0.55, Fz + 1.35, 1, 0.99)
    else:
        wall(F, 0, L, Fz - 0.4, Fz + LH, 0, [], reveal=0.15)
    box('trim', F, -0.05, L + 0.05, -0.02, 0.1, Fz - 0.4, Fz - 0.1)
    box('trim', F, -0.1, L + 0.1, -0.02, 0.18, Fz + LH - 0.25, Fz + LH - 0.05)
    box('trim', F, -0.2, L + 0.2, -0.02, 0.35, Fz + LH - 0.05, Fz + LH + 0.1)
# пирамидка
ap = Vector((C2.x, C2.y, Fz + LH + 0.1 + 1.6))
rr = R + 0.45
base = [Vector((C2.x + rr * math.cos(math.pi / 8 + k * math.pi / 4),
                C2.y + rr * math.sin(math.pi / 8 + k * math.pi / 4), Fz + LH + 0.1)) for k in range(8)]
for k in range(8):
    a, b = base[k], base[(k + 1) % 8]
    m = (a + b) / 2
    face('roof', [a, b, ap], Vector((m.x - C2.x, m.y - C2.y, 1.5)))
face('trim', base, -UP)
lathe('trim_s', ap, [(0.09, 0.0), (0.12, 0.25), (0.05, 0.6), (0.01, 0.8)], seg=8)   # шпиль-навершие

finish('kat28', __file__)
