# Главпочтамт Севастополя, Большая Морская, 21 (модерн, 1914, арх. Г. П. Долин)
# — модель с нуля.
#
#   blender -b --python models/pochtamt/build.py -- [glb]
#
# Контур OSM way 92723182 повёрнут на ~13° к осям мира. План собран в местной
# системе с началом в юго-западном углу контура (-249; 1178.8):
#   a — вдоль южного фасада на восток (ребро 5 контура, 56.5 м),
#   b — вдоль западного фасада на Б. Морскую к северу (ребро 6, 29.3 м).
# Корпуса (a, b в метрах, сверено с контуром до 0.2 м):
#   S  южное крыло вдоль поперечной улицы  a 0…56.5,    b 0…9.1
#   W  западное крыло на Б. Морскую         a 0…16.3,    b 9.1…29.3
#   N  северная перемычка                   a 16.3…31,   b 22.6…29.3
#   C  средняя перемычка                    a 16.3…38,   b 9.1…15.5
#   E  восточное крыло                      a 41.8…56.5, b 9.1…29
#   T  хвост к северу                       a 41.8…51.9, b 29…53.8
# Угол (0, 0) срезан, на срезе — трёхгранный эркер на 2–4 этажах и шатровая
# башенка со шпилем над карнизом. Фото открыть не удалось — работаем по
# описанию refs/center-models.json (поле source); что наугад — NOTES.md.
# Ноль высоты — тротуар у юго-западного угла. Улица вдоль южного фасада
# поднимается на восток на ~4.5 м: рельеф игры снят в ground.json (сетка 3 м
# в местных a, b; высота над нулём), окна ниже земли не ставим.
import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

HERE = os.path.dirname(os.path.abspath(__file__))

# ------------------------------------------------------------------ местная система
P5, P4, P6 = (-249.0, 1178.8), (-194.0, 1165.9), (-255.7, 1150.3)    # точки контура
_la = math.hypot(P4[0] - P5[0], P4[1] - P5[1]); _lb = math.hypot(P6[0] - P5[0], P6[1] - P5[1])
SA = ((P4[0] - P5[0]) / _la, (P4[1] - P5[1]) / _la)      # +a в мире (x, z)
SB = ((P6[0] - P5[0]) / _lb, (P6[1] - P5[1]) / _lb)      # +b в мире

def LW(a, b):
    return (P5[0] + a * SA[0] + b * SB[0], P5[1] + a * SA[1] + b * SB[1])

X0, Z0 = P5
origin(X0, Z0)

def L2(a, b):
    """Местная точка → плоскость Blender."""
    return W(*LW(a, b))

# рельеф игры под домом
_G = json.load(open(os.path.join(HERE, 'ground.json')))
def ground(a, b):
    s = _G['step']; g = _G['g']
    fa = (a - _G['a0']) / s; fb = (b - _G['b0']) / s
    i = max(0, min(len(g[0]) - 2, int(math.floor(fa)))); k = max(0, min(len(g) - 2, int(math.floor(fb))))
    ta = min(1, max(0, fa - i)); tb = min(1, max(0, fb - k))
    return ((g[k][i] * (1 - ta) + g[k][i + 1] * ta) * (1 - tb) +
            (g[k + 1][i] * (1 - ta) + g[k + 1][i + 1] * ta) * tb)

class Fac:
    """Фасад по отрезку p0 → p1 в местных (a, b); out — наружу (a, b)."""
    def __init__(self, p0, p1, out):
        self.p0 = p0
        self.L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        self.t = ((p1[0] - p0[0]) / self.L, (p1[1] - p0[1]) / self.L)
        self.out = out
        o = L2(*p0)
        u = (L2(*p1) - o).normalized()
        n = (L2(p0[0] + out[0], p0[1] + out[1]) - o).normalized()
        self.F = Frame(o, u, n)
    def loc(self, u, d=0.0):
        return (self.p0[0] + self.t[0] * u + self.out[0] * d, self.p0[1] + self.t[1] * u + self.out[1] * d)
    def g(self, u, d=0.3):
        return ground(*self.loc(u, d))

# ------------------------------------------------------------------ цвета (описание)
COL['wall'] = ((0.925, 0.914, 0.878), 0.9)    # #ece9e0, светлая штукатурка
COL['wall2'] = ((0.85, 0.84, 0.81), 0.9)      # дворовые и задние стены, сероватые
COL['wall3'] = ((0.47, 0.51, 0.55), 0.55)     # кровля башенки: серая с голубым
COL['stone'] = ((0.608, 0.612, 0.596), 0.9)   # #9b9c98, рустованный цоколь
COL['roof'] = ((0.54, 0.54, 0.525), 0.85)     # #8a8a86, плоская крыша за парапетом
COL['trim'] = ((0.97, 0.96, 0.93), 0.85)      # лепнина, тяги, карниз
COL['wood'] = ((0.36, 0.22, 0.12), 0.6)       # дубовая дверь

GROUND = -3.0
BASE = 2.5                         # верх рустованного цоколя
FL = (2.5, 6.0, 9.5, 13.0)         # полы этажей
COR = 15.9                         # низ венчающего карниза
TOP = 16.5                         # верх карниза, крыша
PAR = 17.3                         # верх парапета главных фасадов
WIN_H = (2.3, 2.3, 2.2, 2.0)       # высота окон по этажам
SILL = 0.9

# ------------------------------------------------------------------ окна
def win(F, cu, za, w, h, holes, kind='plain'):
    """Прямоугольное окно: проём в список, стекло, переплёт крестом, подоконник."""
    ua, ub, zb = cu - w / 2, cu + w / 2, za + h
    holes.append((ua, ub, za, zb))
    g = -0.18
    face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
    f = g + 0.03
    zt = za + h * 0.7
    face('trim', [F.p(cu - 0.035, f, za), F.p(cu + 0.035, f, za), F.p(cu + 0.035, f, zt), F.p(cu - 0.035, f, zt)], F.N())
    face('trim', [F.p(ua, f, zt - 0.035), F.p(ub, f, zt - 0.035), F.p(ub, f, zt + 0.035), F.p(ua, f, zt + 0.035)], F.N())
    box('trim', F, ua - 0.1, ub + 0.1, 0, 0.12, za - 0.1, za, bottom=False)
    if kind in ('lintel', 'panel'):
        box('trim', F, ua - 0.18, ub + 0.18, 0, 0.1, zb, zb + 0.22, bottom=False)
    if kind == 'panel':            # лепная вставка под окном (ризалиты)
        box('trim', F, ua + 0.1, ub - 0.1, 0, 0.05, za - 0.75, za - 0.2, bottom=False)

def back_windows(fc, m='wall2'):
    """Задний или дворовый фасад: гладкая стена, окна стёклами на стене."""
    F = fc.F
    wall(F, 0, fc.L, GROUND, TOP, 0, [], m=m)
    box('trim', F, -0.15, fc.L + 0.15, 0, 0.22, COR + 0.15, TOP, bottom=True)
    n = int(fc.L // 3.4)
    if n < 1:
        return
    step = fc.L / n
    for i in range(n):
        cu = step * (i + 0.5)
        gz = fc.g(cu)
        for f, z in enumerate(FL):
            za = z + SILL; zb = za + WIN_H[f] - 0.1
            if za < gz + 0.3:
                continue
            face('glass', [F.p(cu - 0.65, 0.02, za), F.p(cu + 0.65, 0.02, za),
                           F.p(cu + 0.65, 0.02, zb), F.p(cu - 0.65, 0.02, zb)], F.N())

def rust_lines(F, u0, u1, z0, z1):
    """Рустовка цоколя: горизонтальные рёбра блоков."""
    z = z0 + 0.5
    while z < z1 - 0.1:
        box('stone', F, u0, u1, 0, 0.05, z, z + 0.07, bottom=False)
        z += 0.5

def pilaster_m(F, cu, w=0.7, pr=0.12):
    box('trim', F, cu - w / 2, cu + w / 2, 0, pr, BASE + 0.25, COR, bottom=False)

def floor_bands(F, u0, u1):
    box('stone', F, u0 - 0.05, u1 + 0.05, 0, 0.2, BASE - 0.05, BASE + 0.25, bottom=True)   # полка над цоколем
    for z in FL[1:]:
        box('trim', F, u0, u1, 0, 0.1, z - 0.05, z + 0.17, bottom=True)                    # междуэтажные тяги

def main_facade(fc, axes, w, pilasters, skip_ground=(), extra_holes=()):
    """Улица: рустованный цоколь, четыре этажа окон, тяги, пилястры, карниз, парапет."""
    F = fc.F
    lo, hi = [], list(extra_holes)
    for cu, kind in axes:
        gz = fc.g(cu)
        if 0.6 > gz + 0.15 and cu not in skip_ground:                 # окна цоколя
            win(F, cu, 0.6, w * 0.85, 1.3, lo)
        for f, z in enumerate(FL):
            if f == 0 and cu in skip_ground:
                continue
            za = z + SILL
            if za < gz + 0.3:
                continue
            k = kind if f in (1, 2) else ('lintel' if f == 0 else 'plain')
            win(F, cu, za, w, WIN_H[f], hi, k)
    lo += [(h[0], h[1], h[2], min(h[3], BASE)) for h in extra_holes if h[2] < BASE]
    hi = [(h[0], h[1], max(h[2], BASE), h[3]) for h in hi if h[3] > BASE]
    wall(F, 0, fc.L, GROUND, BASE, 0, lo, m='stone', rm='stone')
    wall(F, 0, fc.L, BASE, TOP, 0, hi, rm='wall')
    rust_lines(F, 0, fc.L, -1.0, BASE - 0.1)
    floor_bands(F, 0, fc.L)
    for cu in pilasters:
        pilaster_m(F, cu)
    cornice(F, 0, fc.L, 0, COR, ext=0.45)
    box('wall', F, 0, fc.L, -0.3, 0, TOP, PAR, bottom=False)              # парапет
    box('trim', F, -0.05, fc.L + 0.05, -0.35, 0.05, PAR, PAR + 0.08, bottom=False)

# ================================================================== УЛИЧНЫЕ ФАСАДЫ
CH = 3.5                           # срез угла
WEST = Fac((0, CH), (0, 29.3), (-1, 0))         # u = b, на Б. Морскую
SOUTH = Fac((CH, 0), (56.5, 0), (0, -1))        # u = a − CH, на поперечную улицу

# западный фасад: ризалит у угла на 3 оси (вход в 3-й оси), затем 2 и 3 оси
DOOR_B = 11.2
wa = [(5.6, 'panel'), (8.4, 'panel'), (DOOR_B, 'panel'), (14.4, 'lintel'), (17.0, 'lintel'),
      (20.2, 'lintel'), (22.9, 'lintel'), (25.6, 'lintel')]
wa = [(b - CH, k) for b, k in wa]
wp = [b - CH for b in (4.2, 12.6, 18.6, 27.3)]
du = DOOR_B - CH
DOOR = (du - 0.9, du + 0.9, 0.45, 4.6)
main_facade(WEST, wa, 1.4, wp, skip_ground=(du,), extra_holes=(DOOR,))
for u in wp[:2]:                   # ризалит: широкие лопатки по краям
    box('trim', WEST.F, u - 0.5, u + 0.5, 0, 0.2, BASE + 0.25, COR, bottom=False)

# южный фасад: ровный ритм, 4 группы по 3 оси между пилястрами
sp = [p - CH for p in (4.2, 16.7, 29.2, 41.7, 54.2)]
sa = []
for p in sp[:-1]:
    for off in (2.35, 6.25, 10.15):
        sa.append((p + off, 'lintel'))
main_facade(SOUTH, sa, 1.6, sp)
for p in sp:                       # «зубцы» прямого аттика над пилястрами
    box('wall', SOUTH.F, p - 0.45, p + 0.45, -0.3, 0.05, PAR, PAR + 0.55, bottom=False)
    box('trim', SOUTH.F, p - 0.52, p + 0.52, -0.35, 0.1, PAR + 0.55, PAR + 0.65, bottom=False)
for p in wp[2:]:
    box('wall', WEST.F, p - 0.45, p + 0.45, -0.3, 0.05, PAR, PAR + 0.55, bottom=False)
    box('trim', WEST.F, p - 0.52, p + 0.52, -0.35, 0.1, PAR + 0.55, PAR + 0.65, bottom=False)

# ------------------------------------------------------------------ вход и фигурный аттик
def entrance():
    F = WEST.F
    u0, u1 = DOOR[0], DOOR[1]
    zs, r = 3.7, 0.9                                # пята арки, радиус
    n = 10
    arc = [(du + r * math.cos(math.pi * k / n), zs + r * math.sin(math.pi * k / n)) for k in range(n + 1)]
    # заполнение углов над аркой (проём прямоугольный до 4.6)
    face('wall', [F.p(u1, 0, zs)] + [F.p(u, 0, z) for u, z in arc] + [F.p(u0, 0, zs), F.p(u0, 0, 4.6), F.p(u1, 0, 4.6)], F.N())
    # дверное полотно в глубине, с арочной фрамугой
    g = -0.28
    face('wood', [F.p(u0, g, 0.45), F.p(u1, g, 0.45), F.p(u1, g, zs), F.p(u0, g, zs)], F.N())
    face('glass', [F.p(u, g + 0.01, z) for u, z in arc], F.N())
    box('wood', F, du - 0.04, du + 0.04, g, g + 0.06, 0.45, zs)
    for s in (-1, 1):                               # откосы арки
        box('trim', F, du + s * 0.9 - 0.02, du + s * 0.9 + 0.02, g, 0, 0.45, zs)
    # портальчик: лопатки, архивольт, полка и табличка
    for s in (-1, 1):
        a, b = sorted((du + s * 0.9, du + s * 1.3))
        box('trim', F, a, b, 0, 0.16, 0.45, zs + 0.1, bottom=False)
    ro = r + 0.38
    ring = [(du + ro * math.cos(math.pi * k / n), zs + ro * math.sin(math.pi * k / n)) for k in range(n + 1)]
    for k in range(n):
        prism_uz('trim', F, [arc[k], arc[k + 1], ring[k + 1], ring[k]], 0, 0.16)
    box('trim', F, du - 0.25, du + 0.25, 0, 0.24, zs + r - 0.05, zs + ro + 0.05, bottom=False)   # замок
    box('trim', F, du - 1.6, du + 1.6, 0, 0.3, 5.0, 5.25)
    box('trim', F, du - 1.4, du + 1.4, 0, 0.36, 5.25, 5.38)
    box('stone', F, du - 0.8, du + 0.8, 0.36, 0.42, 5.42, 5.86, bottom=False)                   # табличка «Почта»
    # ступени к двери
    gz = WEST.g(du, 1.0)
    n = max(2, round((0.45 - gz) / 0.16))
    for i in range(n):
        top = 0.45 - (0.45 - gz) * i / n
        box('stone', F, du - 1.3, du + 1.3, 0, 0.32 * (i + 1) + 0.05, GROUND, top)
    # три флагштока над входом
    for s in (-1, 0, 1):
        a = F.p(du + s * 1.0, 0.1, 6.1)
        b = F.p(du + s * 1.0, 1.9, 7.9)
        beam('metal', a, b, 0.06)
        beam('metal', b, b + (b - a).normalized() * 0.12, 0.12)

entrance()

def volute_attic():
    """Фигурный аттик с волютами над ризалитом у угла (3 оси)."""
    F = WEST.F
    u0, u1 = wp[0] - 0.5, wp[1] + 0.5
    cu = (u0 + u1) / 2; hw = (u1 - u0) / 2
    top, z0 = 19.4, PAR
    prof = []
    for k in range(9):
        t = k / 8
        s = t * t * (3 - 2 * t)
        prof.append((cu - hw + (hw - 1.2) * t, z0 + 0.2 + (top - z0 - 0.2) * s))
    pts = [(u0, TOP)] + prof + [(2 * cu - u, z) for u, z in reversed(prof)] + [(u1, TOP)]
    prism_uz('wall', F, pts, -0.3, 0.12)
    box('trim', F, cu - 1.4, cu + 1.4, -0.35, 0.2, top, top + 0.16)             # полка гребня
    for s in (-1, 1):                                                         # волюты
        c = (cu + s * (hw - 0.55), z0 + 0.65)
        oct_ = [(c[0] + 0.42 * math.cos(math.pi * k / 4), c[1] + 0.42 * math.sin(math.pi * k / 4)) for k in range(8)]
        prism_uz('trim', F, oct_, 0.12, 0.3)
    box('trim', F, cu - 0.7, cu + 0.7, 0.12, 0.22, 17.9, 18.8, bottom=False)  # лепной картуш

volute_attic()

# ================================================================== УГОЛ: срез, эркер, башенка
CF = Fac((0, CH), (CH, 0), (-1 / math.sqrt(2), -1 / math.sqrt(2)))
LC = CF.L
BAY0, BAY1 = FL[1], COR                        # эркер на 2–4 этажах
BD = 1.1                                       # вылет эркера
bay_pl = [(0.25, 0.0), (1.15, BD), (LC - 1.15, BD), (LC - 0.25, 0.0)]

def corner():
    F = CF.F
    # срез угла до эркера: цоколь, первый этаж с окном
    lo, hi = [], []
    win(F, LC / 2, FL[0] + SILL, 1.3, WIN_H[0], hi, 'lintel')
    wall(F, 0, LC, GROUND, BASE, 0, lo, m='stone', rm='stone')
    wall(F, 0, LC, BASE, BAY0, 0, hi, rm='wall')
    wall(F, 0, LC, BAY0, TOP, -0.02, [])       # за эркером
    rust_lines(F, 0, LC, -1.0, BASE - 0.1)
    box('stone', F, -0.05, LC + 0.05, 0, 0.2, BASE - 0.05, BASE + 0.25)
    # консоли под эркером
    for u in (0.75, LC / 2, LC - 0.75):
        box('trim', F, u - 0.22, u + 0.22, 0, 0.55, BAY0 - 1.15, BAY0 - 0.15, bottom=True)
        box('trim', F, u - 0.22, u + 0.22, 0, BD, BAY0 - 0.6, BAY0 - 0.15, bottom=True)
        box('trim', F, u - 0.17, u + 0.17, 0.5, 0.62, BAY0 - 1.0, BAY0 - 0.6, bottom=False)  # маска
    prism_plan('trim', F, [(u, d) for u, d in bay_pl], BAY0 - 0.15, BAY0 + 0.05)
    # три грани эркера
    for i in range(3):
        (ua, da), (ub, db) = bay_pl[i], bay_pl[i + 1]
        a, b = F.p(ua, da, 0), F.p(ub, db, 0)
        u = Vector((b.x - a.x, b.y - a.y))
        n = Vector((u.y, -u.x)).normalized()
        if n.dot(Vector((F.n.x, F.n.y))) < 0:
            n = -n
        G = Frame(Vector((a.x, a.y)), u, n)
        ln = u.length
        holes = []
        w = 1.3 if i == 1 else 0.75
        for f in (1, 2, 3):
            win(G, ln / 2, FL[f] + SILL, w, WIN_H[f], holes, 'lintel' if f < 3 else 'plain')
        wall(G, 0, ln, BAY0 + 0.05, COR, 0, holes, rm='wall')
        for z in FL[2:]:
            box('trim', G, 0, ln, 0, 0.1, z - 0.05, z + 0.17)
    # карниз эркера и угла
    grow = lambda s: [(0.25 - s * 0.4, -s * 0.15), (1.15 - s * 0.1, BD + s), (LC - 1.15 + s * 0.1, BD + s), (LC - 0.25 + s * 0.4, -s * 0.15)]
    prism_plan('trim', F, grow(0.12), COR, COR + 0.25)
    prism_plan('trim', F, grow(0.35), COR + 0.25, TOP)
    box('wall', F, -0.2, LC + 0.2, -0.3, 0, TOP, PAR, bottom=False)
    # башенка: восьмигранный барабан, шатёр, шпиль
    c = F.p(LC / 2, 0.35, 0)
    base = Vector((c.x, c.y, PAR))
    R = 1.9
    ring = lambda r: [(r * math.cos(math.pi / 8 + math.pi * k / 4), r * math.sin(math.pi / 8 + math.pi * k / 4)) for k in range(8)]
    F0 = Frame(Vector((c.x, c.y)), Vector((1, 0)), Vector((0, 1)))
    prism_plan('wall', F0, ring(R), TOP, 18.5)
    prism_plan('trim', F0, ring(R + 0.2), 18.5, 18.75)
    for k in range(8):                         # окошки барабана
        ang = math.pi / 8 + math.pi * k / 4 + math.pi / 8
        dvec = Vector((math.cos(ang), math.sin(ang), 0))
        p = base + dvec * (R * math.cos(math.pi / 8) + 0.01)
        t = Vector((-dvec.y, dvec.x, 0))
        face('glass', [p - t * 0.3 + UP * 0.2, p + t * 0.3 + UP * 0.2, p + t * 0.3 + UP * 0.95, p - t * 0.3 + UP * 0.95], dvec)
    lathe('wall3', Vector((c.x, c.y, 0)),
          [(R + 0.35, 18.75), (R + 0.05, 19.3), (R - 0.45, 20.4), (1.0, 21.5), (0.45, 22.3), (0.18, 22.6)], seg=8)
    lathe('metal', Vector((c.x, c.y, 0)), [(0.16, 22.55), (0.22, 22.8), (0.16, 23.0), (0.05, 23.1), (0.04, 26.0), (0.0, 26.5)], seg=6)

corner()

# ================================================================== ЗАДНИЕ И ДВОРОВЫЕ СТЕНЫ
BACK = [((56.5, 0), (56.5, 29), (1, 0)), ((56.5, 29), (51.9, 29), (0, 1)), ((51.9, 29), (51.9, 53.8), (1, 0)),
        ((51.9, 53.8), (41.8, 53.8), (0, 1)), ((41.8, 53.8), (41.8, 9.1), (-1, 0)), ((41.8, 9.1), (38, 9.1), (0, 1)),
        ((38, 9.1), (38, 15.5), (1, 0)), ((38, 15.5), (16.3, 15.5), (0, 1)), ((16.3, 15.5), (16.3, 22.6), (1, 0)),
        ((16.3, 22.6), (31, 22.6), (0, -1)), ((31, 22.6), (31, 29.3), (1, 0)), ((31, 29.3), (0, 29.3), (0, 1))]
for p0, p1, out in BACK:
    back_windows(Fac(p0, p1, out))

# ================================================================== КРЫША
def rect(a0, a1, b0, b1):
    return [L2(a0, b0), L2(a1, b0), L2(a1, b1), L2(a0, b1)]
def roof_poly(pts, z=TOP):
    face('roof', [Vector((p.x, p.y, z)) for p in pts], UP)
roof_poly([L2(CH, 0), L2(56.5, 0), L2(56.5, 9.1), L2(0, 9.1), L2(0, CH)])
for r in ((0, 16.3, 9.1, 29.3), (16.3, 31, 22.6, 29.3), (16.3, 38, 9.1, 15.5), (41.8, 56.5, 9.1, 29), (41.8, 51.9, 29, 53.8)):
    roof_poly(rect(*r))

# ================================================================== БАЛЮСТРАДА ВДОЛЬ ЮЖНОГО ФАСАДА
def balustrade():
    F = SOUTH.F
    D = 1.4
    u0, u1 = 4.0, 50.0
    def top(u):
        return SOUTH.g(u, D) + 1.0
    k = int((u1 - u0) / 2.5)
    us = [u0 + (u1 - u0) * i / k for i in range(k + 1)]
    for u in us:                                  # тумбы
        box('trim', F, u - 0.15, u + 0.15, D - 0.15, D + 0.15, top(u) - 1.6, top(u) + 0.08, bottom=False)
    for a, b in zip(us, us[1:]):                  # поручень, нижний брус, балясины
        pa, pb = F.p(a, D, top(a) - 0.06), F.p(b, D, top(b) - 0.06)
        beam('trim', pa, pb, 0.2, 0.12)
        beam('trim', pa - UP * 0.82, pb - UP * 0.82, 0.18, 0.12)
        for j in range(1, 4):
            t = j / 4
            p = pa + (pb - pa) * t
            beam('trim', p - UP * 0.76, p - UP * 0.06, 0.1)

balustrade()

finish('pochtamt', __file__, tri_budget=12000)
