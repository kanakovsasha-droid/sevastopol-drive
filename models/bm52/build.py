# Жилой сталинский дом, Большая Морская, 52 (у площади Ушакова) — модель с нуля.
#
#   blender -b --python models/bm52/build.py -- [glb]
#   (или python3 models/bm52/build.py -- glb, если bpy стоит модулем)
#
# План — контур OSM way 166878780 как есть (он ровный): длинный корпус 68×13 м
# вдоль Б. Морской и короткое крыло на юге к ул. Шмидта, западный торец крыла
# глухой — к нему примыкает соседний дом w166878801. Фасады — по описанию в
# refs/center-models.json (дворовые фото 2022_40/41); что не описано — сдержанно,
# см. NOTES.md. Ноль высоты — тротуар у середины фасада на Б. Морскую.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

X0, Z0 = -164.45, 1599.9          # середина фасада на Б. Морскую (ребро A→B)
origin(X0, Z0)

hexc = lambda h: tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))
COL['wall'] = (hexc('#d4c299'), 0.9)      # охристо-бежевая штукатурка
COL['stone'] = (hexc('#e6d9c0'), 0.9)     # светлый цоколь
COL['roof'] = (hexc('#a33a30'), 0.75)     # красная кромка и кровля
COL['trim'] = ((0.90, 0.86, 0.76), 0.85)  # тяги, карниз, подоконники — светлее стены
COL['wall2'] = ((0.93, 0.93, 0.91), 0.5)  # белый ПВХ поздних лоджий

# Контур OSM в порядке обхода: G H C D A B E F
POLY = [(-186.1, 1644.7), (-168.7, 1639.2), (-167.8, 1636.4), (-186.9, 1570.8),
        (-174.0, 1567.1), (-154.9, 1632.7), (-162.7, 1650.6), (-182.5, 1656.9)]
G_, H_, C_, D_, A_, B_, E_, F_ = range(8)

GROUND = -3.0
PL = 1.0                      # верх цоколя = пол первого этажа
FL = [PL, 4.6, 7.7, 10.8]     # полы этажей: первый выше (магазины), дальше по 3.1
EAVE = 13.6                   # низ венчающего карниза
TOP = 14.15                   # плоская кровля
WW, WH, WS = 1.3, 1.75, 0.85  # окно: ширина, высота, от пола до подоконника
REV = 0.2                     # глубина откоса

PTS = [W(*p) for p in POLY]
_area = sum(PTS[i].x * PTS[(i + 1) % 8].y - PTS[(i + 1) % 8].x * PTS[i].y for i in range(8))

def edge(i):
    """Рамка ребра i (точка i → i+1), наружу по обходу контура."""
    a, b = PTS[i], PTS[(i + 1) % 8]
    u = (b - a).normalized()
    n = Vector((u.y, -u.x)) if _area > 0 else Vector((-u.y, u.x))
    return Frame(a, u, n), (b - a).length

def convex(i):
    """Выпуклый ли угол контура в вершине i."""
    a, b, c = PTS[i - 1], PTS[i], PTS[(i + 1) % 8]
    cr = (b - a).x * (c - b).y - (b - a).y * (c - b).x
    return (cr > 0) == (_area > 0)

# ------------------------------------------------------------------ стена
def wall_m(F, u0, u1, z0, z1, d, holes, m='wall', rm='wall'):
    """Как kit.wall, но соседние куски в полосе склеены в один четырёхугольник:
    треугольников втрое меньше. Откосы — цветом стены, чтобы дальний уровень
    не просвечивал."""
    us = sorted({u0, u1, *[h[0] for h in holes], *[h[1] for h in holes]})
    zs = sorted({z0, z1, *[h[2] for h in holes], *[h[3] for h in holes]})
    us = [u for u in us if u0 - 1e-6 <= u <= u1 + 1e-6]
    zs = [z for z in zs if z0 - 1e-6 <= z <= z1 + 1e-6]
    for k in range(len(zs) - 1):
        cz = (zs[k] + zs[k + 1]) / 2
        run = None
        for i in range(len(us) - 1):
            cu = (us[i] + us[i + 1]) / 2
            hole = any(h[0] < cu < h[1] and h[2] < cz < h[3] for h in holes)
            if not hole and run is None: run = us[i]
            if hole and run is not None:
                face(m, [F.p(run, d, zs[k]), F.p(us[i], d, zs[k]), F.p(us[i], d, zs[k + 1]), F.p(run, d, zs[k + 1])], F.N())
                run = None
        if run is not None:
            face(m, [F.p(run, d, zs[k]), F.p(us[-1], d, zs[k]), F.p(us[-1], d, zs[k + 1]), F.p(run, d, zs[k + 1])], F.N())
    for h in holes:
        if len(h) > 4: continue               # арка: откосы строит arch()
        ua, ub, za, zb = h
        r = d - REV
        face(rm, [F.p(ua, d, za), F.p(ua, r, za), F.p(ua, r, zb), F.p(ua, d, zb)], F.U())
        face(rm, [F.p(ub, d, za), F.p(ub, r, za), F.p(ub, r, zb), F.p(ub, d, zb)], -F.U())
        face(rm, [F.p(ua, d, zb), F.p(ub, d, zb), F.p(ub, r, zb), F.p(ua, r, zb)], -UP)
        face(rm, [F.p(ua, d, za), F.p(ub, d, za), F.p(ub, r, za), F.p(ua, r, za)], UP)

def win(F, cu, za, w, h, d=0.0, cols=2):
    """Окно без наличника: стекло в глубине, переплёт плоскими планками, подоконник."""
    ua, ub = cu - w / 2, cu + w / 2
    g = d - REV + 0.02
    face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, za + h), F.p(ua, g, za + h)], F.N())
    f = g + 0.03
    t = 0.035
    for c in range(1, cols):
        u = ua + w * c / cols
        face('trim', [F.p(u - t, f, za), F.p(u + t, f, za), F.p(u + t, f, za + h), F.p(u - t, f, za + h)], F.N())
    zt = za + h * 0.72
    face('trim', [F.p(ua, f, zt - t), F.p(ub, f, zt - t), F.p(ub, f, zt + t), F.p(ua, f, zt + t)], F.N())
    box('trim', F, ua - 0.08, ub + 0.08, d - 0.02, d + 0.1, za - 0.07, za, bottom=False)
    return (ua, ub, za, za + h)

def arch(F, cu, za, zs, r, d=0.0, seg=8):
    """Арочная витрина первого этажа: проём до пяты, заполнение пазух, архивольт."""
    arc = [(cu + r * math.cos(math.pi * k / seg), zs + r * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
    hs = seg // 2
    face('wall', [F.p(cu + r, d, zs + r)] + [F.p(u, d, z) for u, z in arc[:hs + 1]], F.N())
    face('wall', [F.p(cu - r, d, zs + r)] + [F.p(u, d, z) for u, z in arc[hs:]], F.N())
    rr = d - REV
    for ua in (cu - r, cu + r):
        s = 1 if ua < cu else -1
        face('wall', [F.p(ua, d, za), F.p(ua, rr, za), F.p(ua, rr, zs), F.p(ua, d, zs)], F.U() * s)
    face('wall', [F.p(cu - r, d, za), F.p(cu + r, d, za), F.p(cu + r, rr, za), F.p(cu - r, rr, za)], UP)
    for k in range(seg):
        (ua, za_), (ub, zb_) = arc[k], arc[k + 1]
        face('wall', [F.p(ua, d, za_), F.p(ub, d, zb_), F.p(ub, rr, zb_), F.p(ua, rr, za_)],
             F.p(cu, d, zs) - F.p((ua + ub) / 2, d, (za_ + zb_) / 2))
        ro = r + 0.22                                           # архивольт плоской лентой
        oa = (cu + ro * math.cos(math.pi * k / seg), zs + ro * math.sin(math.pi * k / seg))
        ob = (cu + ro * math.cos(math.pi * (k + 1) / seg), zs + ro * math.sin(math.pi * (k + 1) / seg))
        face('trim', [F.p(ua, d + 0.05, za_), F.p(ub, d + 0.05, zb_), F.p(ob[0], d + 0.05, ob[1]), F.p(oa[0], d + 0.05, oa[1])], F.N())
    g = rr + 0.02
    face('glass', [F.p(cu - r, g, za), F.p(cu + r, g, za)] + [F.p(u, g, z) for u, z in arc], F.N())
    f, t = g + 0.03, 0.04
    face('trim', [F.p(cu - r, f, zs - t), F.p(cu + r, f, zs - t), F.p(cu + r, f, zs + t), F.p(cu - r, f, zs + t)], F.N())
    face('trim', [F.p(cu - t, f, za), F.p(cu + t, f, za), F.p(cu + t, f, zs), F.p(cu - t, f, zs)], F.N())
    return (cu - r, cu + r, za, zs + r, 'arch')                 # откосы арки уже построены

def axes(L, n, margin):
    """n осей окон, равномерно по ребру длиной L с полями по краям."""
    if n <= 0: return []
    step = (L - 2 * margin) / n
    return [margin + step * (i + 0.5) for i in range(n)]

def basement(F, cu):
    """Окошко подвала в цоколе с решёткой."""
    face('glass', [F.p(cu - 0.45, 0.09, 0.2), F.p(cu + 0.45, 0.09, 0.2), F.p(cu + 0.45, 0.09, 0.7), F.p(cu - 0.45, 0.09, 0.7)], F.N())
    for k in (-0.22, 0.0, 0.22):
        face('metal', [F.p(cu + k - 0.025, 0.11, 0.2), F.p(cu + k + 0.025, 0.11, 0.2),
                       F.p(cu + k + 0.025, 0.11, 0.7), F.p(cu + k - 0.025, 0.11, 0.7)], F.N())

# ------------------------------------------------------------------ фасады
def facade(i, plan, shop=False, cellar=False):
    """Фасад по ребру i: plan — оси окон [(u, тип)], тип 'w' — обычное окно на всех
    этажах; специальные места строит вызывающий и передаёт свои проёмы в extra."""
    F, L = edge(i)
    e0 = 0.45 if convex(i) else 0.0
    e1 = 0.45 if convex((i + 1) % 8) else 0.0
    holes = []
    for cu in plan['axes']:
        if shop:
            holes.append(arch(F, cu, PL + 0.25, 3.35, 1.0))
        else:
            holes.append(win(F, cu, FL[0] + WS, WW, WH))
        for z in FL[1:]:
            holes.append(win(F, cu, z + WS, WW, WH))
    holes += plan.get('extra', [])
    wall_m(F, 0, L, PL, EAVE, 0, holes)
    box('stone', F, -0.0, L, -0.3, 0.08, GROUND, PL)                              # цоколь
    box('trim', F, -e0 * 0.2, L + e1 * 0.2, -0.02, 0.12, PL - 0.1, PL + 0.04, bottom=False)
    if cellar:
        for cu in plan['axes']:
            basement(F, cu)
    box('trim', F, -e0 * 0.25, L + e1 * 0.25, -0.02, 0.10, FL[1] - 0.12, FL[1] + 0.08, bottom=False)   # пояс над 1-м этажом
    # венчающий карниз: три полки с нарастающим вылетом, верхняя кромка красная
    box('trim', F, -e0 * 0.2, L + e1 * 0.2, -0.02, 0.10, EAVE, EAVE + 0.2, bottom=False)
    box('trim', F, -e0 * 0.45, L + e1 * 0.45, -0.02, 0.26, EAVE + 0.2, EAVE + 0.38)
    box('roof', F, -e0, L + e1, -0.02, 0.45, EAVE + 0.38, TOP)
    return F, L

def flat_wall(i):
    """Глухая стена (брандмауэр к соседу, короткие уступы)."""
    F, L = edge(i)
    wall_m(F, 0, L, GROUND, TOP, 0, [])
    return F, L

# ---- фасад на Б. Морскую (A→B): 21 ось, внизу арочные витрины (по аналогии с БМ 33/35)
F_AB, L_AB = facade(A_, {'axes': axes(68.3, 21, 0.4)}, shop=True)

# ---- северный торец (D→A): три оси
facade(D_, {'axes': axes(13.4, 3, 1.5)})

# ---- угол к площади (B→E) и фасад на ул. Шмидта (E→F)
facade(B_, {'axes': axes(19.5, 6, 0.6)})
facade(E_, {'axes': axes(20.8, 6, 0.8)})

# ---- брандмауэр к соседу (F→G) и уступ H→C
flat_wall(F_)
flat_wall(H_)

# ---- дворовый фасад крыла (G→H): пять осей и подвальные окна
facade(G_, {'axes': axes(18.2, 5, 1.0)}, cellar=True)

# ---- дворовый фасад корпуса (C→D): ризалит в центре, по сторонам лестницы и лоджии
F_CD, L_CD = edge(C_)
MID = L_CD / 2
RIS = 3.6                                   # полуширина ризалита (~7 м по фото)
STAIRS = [MID - 14.0, MID + 14.0]
LOG = [(s - 3.4, s - 1.0) if s < MID else (s + 1.0, s + 3.4) for s in STAIRS]   # лоджия — с внешней стороны лестницы
extra = []
# ризалит: две тройные оси между тремя пилястрами
TRI = [MID - 1.7, MID + 1.7]
for cu in TRI:
    for z in FL:
        extra.append(win(F_CD, cu, z + WS, 2.5, WH, 0.35, cols=3))
# лестницы: вертикальное ленточное окно и дверь подъезда внизу
for s in STAIRS:
    extra.append(win(F_CD, s, 2.6, 1.1, 10.6, cols=1))
    extra.append((s - 0.65, s + 0.65, 0.0, 2.25))
plain = [u for u in axes(L_CD, 21, 0.4)
         if abs(u - MID) > RIS + 0.5 and all(abs(u - s) > 1.6 for s in STAIRS)
         and not any(a - 0.8 < u < b + 0.8 for a, b in LOG)]
holes = []
for cu in plain:
    for z in FL:
        holes.append(win(F_CD, cu, z + WS, WW, WH))
for a, b in LOG:                                       # за лоджиями — дверь на балкон
    for z in FL[1:]:
        holes.append(win(F_CD, (a + b) / 2, z + 0.1, 0.9, 2.3, cols=1))
# стена корпуса (кроме ризалита) и стена ризалита на 0,35 м вперёд
stair_holes = [h for h in extra if not (MID - RIS < (h[0] + h[1]) / 2 < MID + RIS)]
ris_holes = [h for h in extra if MID - RIS < (h[0] + h[1]) / 2 < MID + RIS]
wall_m(F_CD, 0, MID - RIS, PL, EAVE, 0, [h for h in holes + stair_holes if h[1] < MID])
wall_m(F_CD, MID + RIS, L_CD, PL, EAVE, 0, [h for h in holes + stair_holes if h[0] > MID])
# у дверей подъездов стена идёт до земли: цоколь вокруг двери
box('stone', F_CD, 0, L_CD, -0.3, 0.08, GROUND, 0.0)
for a, b in [(0, STAIRS[0] - 0.65), (STAIRS[0] + 0.65, STAIRS[1] - 0.65), (STAIRS[1] + 0.65, L_CD)]:
    box('stone', F_CD, a, b, -0.3, 0.08, 0.0, PL, bottom=False)
for s in STAIRS:
    g = -0.18
    face('wood', [F_CD.p(s - 0.65, g, 0), F_CD.p(s + 0.65, g, 0), F_CD.p(s + 0.65, g, 2.25), F_CD.p(s - 0.65, g, 2.25)], F_CD.N())
    box('metal', F_CD, s - 1.0, s + 1.0, 0, 1.1, 2.45, 2.55)               # козырёк над входом
    box('stone', F_CD, s - 0.9, s + 0.9, 0, 1.2, -0.3, 0.12)                # крыльцо
for cu in plain:
    basement(F_CD, cu)
box('trim', F_CD, 0, L_CD, -0.02, 0.12, PL - 0.1, PL + 0.04, bottom=False)
box('trim', F_CD, 0, L_CD, -0.02, 0.10, FL[1] - 0.12, FL[1] + 0.08, bottom=False)
# ризалит
RD = 0.35
Fr = Frame(F_CD.o + F_CD.n * RD, F_CD.u, F_CD.n)
wall_m(Fr, MID - RIS, MID + RIS, PL, EAVE, 0, [(h[0], h[1], h[2], h[3]) for h in ris_holes])
for s, u in ((-1, MID - RIS), (1, MID + RIS)):                              # щёки ризалита
    face('wall', [F_CD.p(u, 0, GROUND), F_CD.p(u, RD, GROUND), F_CD.p(u, RD, EAVE), F_CD.p(u, 0, EAVE)], F_CD.U() * s)
box('stone', Fr, MID - RIS, MID + RIS, -0.3, 0.08, GROUND, PL)
SHELF = FL[3] - 0.1                                    # полка-карниз над третьим этажом
for k, cu in enumerate((MID - 3.35, MID, MID + 3.35)):  # три пилястры от второго этажа до полки
    box('trim', Fr, cu - 0.28, cu + 0.28, -0.02, 0.14, FL[1], SHELF, bottom=False)
box('trim', Fr, MID - 3.75, MID + 3.75, -0.02, 0.22, SHELF, SHELF + 0.18)
box('trim', Fr, MID - 3.75, MID + 3.75, -0.02, 0.4, SHELF + 0.18, SHELF + 0.4)
box('trim', Fr, MID - RIS, MID + RIS, -0.02, 0.10, FL[1] - 0.12, FL[1] + 0.08, bottom=False)
# лоджии: белый ПВХ, 2–4 этажи, на консольной плите
for a, b in LOG:
    for z in FL[1:]:
        box('stone', F_CD, a, b, 0, 1.25, z - 0.18, z, bottom=True)                 # плита
        z1 = z + 3.1 - 0.18
        box('wall2', F_CD, a, b, 1.15, 1.25, z, z + 1.0, bottom=False)              # нижняя панель
        for s, u in ((-1, a), (1, b)):
            box('wall2', F_CD, u - 0.05 if s > 0 else u, u if s > 0 else u + 0.05, 0, 1.25, z, z + 1.0, bottom=False)
        face('glass', [F_CD.p(a, 1.2, z + 1.0), F_CD.p(b, 1.2, z + 1.0), F_CD.p(b, 1.2, z1), F_CD.p(a, 1.2, z1)], F_CD.N())
        for s, u in ((-1, a), (1, b)):
            face('glass', [F_CD.p(u, 0, z + 1.0), F_CD.p(u, 1.2, z + 1.0), F_CD.p(u, 1.2, z1), F_CD.p(u, 0, z1)], F_CD.U() * s)
        for k in range(4):                                                         # белые импосты
            u = a + (b - a) * k / 3
            box('wall2', F_CD, u - 0.04, u + 0.04, 1.18, 1.26, z + 1.0, z1, bottom=False)
        box('wall2', F_CD, a, b, 1.18, 1.26, z1 - 0.06, z1, bottom=False)
    box('stone', F_CD, a, b, 0, 1.25, EAVE - 0.2, EAVE)                             # козырёк над верхней
# карниз двора
e0 = 0.45 if convex(C_) else 0.0
e1 = 0.45 if convex(D_) else 0.0
box('trim', F_CD, 0, L_CD, -0.02, 0.10, EAVE, EAVE + 0.2, bottom=False)
box('trim', F_CD, -e0 * 0.45, L_CD + e1 * 0.45, -0.02, 0.26, EAVE + 0.2, EAVE + 0.38)
box('roof', F_CD, -e0, L_CD + e1, -0.02, 0.45, EAVE + 0.38, TOP)
box('trim', Fr, MID - RIS - 0.2, MID + RIS + 0.2, -0.02, 0.2, EAVE + 0.2, EAVE + 0.38)
box('roof', Fr, MID - RIS - 0.3, MID + RIS + 0.3, -0.02, 0.4, EAVE + 0.38, TOP)

# ------------------------------------------------------------------ кровля
face('roof', [Vector((p.x, p.y, TOP)) for p in PTS], UP)
# металлическая ограда по краю кровли (на фото — по периметру)
for i in range(8):
    F, L = edge(i)
    if L < 4: continue
    zr = TOP + 0.9
    beam('metal', F.p(0.3, -0.35, zr), F.p(L - 0.3, -0.35, zr), 0.05)
    n = max(1, round(L / 4.0))
    for k in range(n + 1):
        u = 0.3 + (L - 0.6) * k / n
        beam('metal', F.p(u, -0.35, TOP), F.p(u, -0.35, zr), 0.05)
# выходы на кровлю над лестницами
for s in STAIRS:
    box('wall', F_CD, s - 1.4, s + 1.4, -4.2, -0.8, TOP, TOP + 2.2)
    box('roof', F_CD, s - 1.55, s + 1.55, -4.35, -0.65, TOP + 2.2, TOP + 2.35)

finish('bm52', __file__, tri_budget=10000)
