# Графская пристань (Севастополь, 1846) — пропилеи с двойной дорической колоннадой,
# парадная лестница в два марша с площадкой, два мраморных льва, площадка у воды.
#
#   blender -b --python models/grafskaya/build.py -- [glb]
#
# План — контур OSM r6814012:0 (прямоугольник 23.07 × 4.95 м, длинная ось почти
# с севера на юг, повёрнут на 8.7°) и четыре пешеходные «ступени» OSM, уходящие
# на восток к набережной. Фасады — по фото с Викисклада (models/grafskaya/refs).
#
# Начало координат — середина восточного (морского) фасада пропилеев на уровне
# пола колоннады (= уровень площади Нахимова). Ось d модели идёт НА ВОСТОК-ЮГ-ВОСТОК
# к воде, u — вдоль фасада на север. Лестница уходит вниз на 4.16 м к набережной.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

X0, Z0 = 82.65, -46.6            # середина восточного фасада (мир x, z)
origin(X0, Z0)

COL['wall']  = ((0.90, 0.89, 0.85), 0.85)    # побелка пропилеев
COL['trim']  = ((0.94, 0.93, 0.89), 0.8)     # белёные детали и мрамор
COL['stone'] = ((0.47, 0.47, 0.46), 0.92)    # серый гранит ступеней
COL['wall2'] = ((0.50, 0.24, 0.20), 0.55)    # красный гранит дорожки
COL['wall3'] = ((0.60, 0.49, 0.45), 0.9)     # плитка набережной
COL['roof']  = ((0.27, 0.28, 0.29), 0.9)     # плоская кровля
COL['wood']  = ((0.16, 0.10, 0.07), 0.6)

# направление в плане: восточный фасад смотрит наружу по n, u — вдоль него на север
n_w = Vector((0.9884, 0.1517)).normalized()          # в мире (x, z)
N = Vector((n_w.x, -n_w.y))                          # в плоскости Blender
U = Vector((-N.y, N.x))
Fe = Frame(Vector((0, 0)), U, N)

# ------------------------------------------------------------ размеры
HL, DEP = 11.53, 4.95        # полудлина и глубина пропилеев
S = 2.74                     # шаг колонн
ROWS = (-0.8, -4.15)         # оси рядов колонн (восточный, западный)
COLH = 4.70                  # колонна с капителью
ARCH, FRIEZE, COR = 5.35, 6.05, 6.65     # верх архитрава, фриза, карниза
ATT = 8.15                   # верх аттика
PAV = 7.9                    # внутренний торец павильона по u
RISE, TREAD = 0.16, 0.66     # ступень
D_TOP = 1.2                  # терраса перед колоннадой
N_UP, LAND = 22, 6.0         # ступеней верхнего марша, длина площадки
D_L0 = D_TOP + N_UP * TREAD  # начало площадки 15.72
D_L1 = D_L0 + LAND           # конец площадки 21.72
Z_LAND = -N_UP * RISE        # -3.52
N_LOW = 3
D_Q0 = D_L1 + N_LOW * TREAD  # 23.70 — начало набережной
Z_Q = Z_LAND - (N_LOW + 1) * RISE   # -4.16
D_EDGE = 30.7                # кромка воды (OSM-берег ≈ x 113)
BOT = -6.2

def ew(d):
    """Полуширина лестницы на расстоянии d от фасада."""
    if d <= D_TOP: return 10.4
    if d >= D_L0: return 14.2
    return 10.4 + 3.8 * (d - D_TOP) / (D_L0 - D_TOP)

def trap(d0, d1, k=0.0):
    return [(-ew(d0) - k, d0), (ew(d0) + k, d0), (ew(d1) + k, d1), (-ew(d1) - k, d1)]

# ------------------------------------------------------------ примитивы
def ell(m, T, cen, rad, nu=6, nv=10):
    """Эллипсоид в локальных осях (lx вперёд, ly влево, lz вверх); T(lx,ly,lz) → точка."""
    bm = bm_of(m)
    cx, cy, cz = cen; rx, ry, rz = rad
    c3 = T(cx, cy, cz)
    ring = []
    for i in range(1, nu):
        th = math.pi * i / nu
        ring.append([T(cx + rx * math.sin(th) * math.cos(2 * math.pi * j / nv),
                       cy + ry * math.sin(th) * math.sin(2 * math.pi * j / nv),
                       cz - rz * math.cos(th)) for j in range(nv)])
    top, bot = T(cx, cy, cz + rz), T(cx, cy, cz - rz)
    for i in range(len(ring) - 1):
        for j in range(nv):
            k = (j + 1) % nv
            q = [ring[i][j], ring[i][k], ring[i + 1][k], ring[i + 1][j]]
            face(m, q, sum(q, Vector()) / 4 - c3)
    for j in range(nv):
        k = (j + 1) % nv
        t = [top, ring[0][k], ring[0][j]]; face(m, t, sum(t, Vector()) / 3 - c3)
        t = [bot, ring[-1][j], ring[-1][k]]; face(m, t, sum(t, Vector()) / 3 - c3)

def lion(base, head, s=1.0):
    """Мраморный лев лёжа; base — точка на верху плинта (x, y, z), head — единичный вектор взгляда."""
    ex = Vector((head.x, head.y, 0)); ey = Vector((-head.y, head.x, 0))
    T = lambda x, y, z: base + ex * (x * s) + ey * (y * s) + UP * (z * s)
    ms = 'trim_s'           # гладкие нормали (эллипсоиды 6×10 — стыки меньше 40°)
    ell(ms, T, (-0.30, 0, 0.46), (1.05, 0.43, 0.38), 6, 10)         # туловище
    ell(ms, T, (0.62, 0, 0.76), (0.52, 0.54, 0.55), 6, 10)          # грудь и грива
    ell(ms, T, (1.03, 0, 0.90), (0.31, 0.26, 0.28), 6, 10)          # голова
    ell(ms, T, (1.30, 0, 0.72), (0.20, 0.15, 0.13), 6, 10)          # морда
    for sy in (-1, 1):
        ell('trim', T, (-1.00, sy * 0.30, 0.34), (0.48, 0.26, 0.32), 5, 8)    # бёдра
        ell('trim', T, (1.10, sy * 0.20, 0.13), (0.55, 0.11, 0.12), 4, 6)     # передние лапы вперёд
        ell('trim', T, (0.95, sy * 0.30, 1.0), (0.07, 0.05, 0.09), 4, 6)      # уши
    beam('trim', T(-1.35, -0.38, 0.12), T(-1.75, -0.60, 0.12), 0.08)           # хвост

def figure(base, facing, h=2.0):
    """Мраморная статуя в нише: драпированная фигура."""
    r = h / 2.0
    prof = [(0.30, 0), (0.31, 0.06), (0.27, 0.35 * r), (0.24, 0.85 * r), (0.22, 1.05 * r),
            (0.27, 1.30 * r), (0.30, 1.45 * r), (0.19, 1.60 * r), (0.09, 1.66 * r)]
    prof = [(a, b) for a, b in prof]
    lathe('trim', base, prof, 10)
    ex = Vector((facing.x, facing.y, 0)); ey = Vector((-facing.y, facing.x, 0))
    T = lambda x, y, z: base + ex * x + ey * y + UP * z
    ell('trim', T, (0.0, 0, 1.78 * r), (0.12, 0.11, 0.14), 5, 8)
    ell('trim', T, (0.10, 0.25, 1.20 * r), (0.09, 0.07, 0.30), 4, 6)    # рука со складкой плаща

def urn(base):
    prof = [(0.26, 0), (0.26, 0.07), (0.17, 0.15), (0.20, 0.34), (0.33, 0.55), (0.35, 0.62),
            (0.28, 0.76), (0.36, 0.82), (0.38, 0.88)]
    lathe('trim', base, prof, 10)

def doric(cx, cy, z0, nfl=8, R0=0.47, R1=0.385):
    """Дорическая колонна без базы: каннелированный ствол с энтазисом, эхин, абака."""
    bm = bm_of('trim_s')
    n = 2 * nfl
    def ring(z, r, flute):
        out = []
        for k in range(n):
            rr = r * (0.915 if (flute and k % 2) else 1.0)
            a = 2 * math.pi * k / n
            out.append(bm.verts.new(Vector((cx + rr * math.cos(a), cy + rr * math.sin(a), z))))
        return out
    prof = [(0.0, R0, 1), (2.2, R0 - (R0 - R1) * 0.47 + 0.012, 1), (4.20, R1, 0), (4.33, R1 * 1.04, 0), (4.43, 0.47, 0), (4.55, 0.52, 0)]
    rs = [ring(z0 + z, r, f) for z, r, f in prof]
    for i in range(len(rs) - 1):
        for k in range(n):
            j = (k + 1) % n
            bm.faces.new([rs[i][k], rs[i][j], rs[i + 1][j], rs[i + 1][k]]).smooth = True
    bm.faces.new(rs[-1])
    bm.faces.new(list(reversed(rs[0])))
    F0 = Frame(Vector((cx, cy)), Vector((1, 0)), Vector((0, 1)))
    box('trim_s', F0, -0.54, 0.54, -0.54, 0.54, z0 + 4.55, z0 + COLH)

def slab_wall(m, s, d0, d1, i0, i1, o0, o1, zb, zt0, zt1):
    """Щёки лестницы: стенка с наклонным верхом; i — внутренняя кромка (u), o — наружная."""
    P = lambda u, d, z: Fe.p(s * u, d, z)
    c = P((i0 + o1) / 2, (d0 + d1) / 2, (zb + zt0) / 2)
    quads = [
        [P(i0, d0, zb), P(i1, d1, zb), P(i1, d1, zt1), P(i0, d0, zt0)],      # внутренняя
        [P(o0, d0, zb), P(o1, d1, zb), P(o1, d1, zt1), P(o0, d0, zt0)],      # наружная
        [P(i0, d0, zt0), P(i1, d1, zt1), P(o1, d1, zt1), P(o0, d0, zt0)],    # верх
        [P(i0, d0, zb), P(o0, d0, zb), P(o0, d0, zt0), P(i0, d0, zt0)],      # торец
        [P(i1, d1, zb), P(o1, d1, zb), P(o1, d1, zt1), P(i1, d1, zt1)],
    ]
    for q in quads:
        face(m, q, sum(q, Vector()) / 4 - c)

# ------------------------------------------------------------ пропилеи
def build_propylaea():
    F = Fe
    # стилобат и фундамент
    box('stone', F, -11.75, 11.75, -5.2, 0.12, -3.5, -0.02)
    box('trim', F, -11.65, 11.65, -5.1, 0.04, -0.12, 0.0)
    # павильоны: сплошные блоки по торцам
    for s in (-1, 1):
        a, b = sorted((s * PAV, s * HL))
        box('wall', F, a, b, -DEP, -0.5, 0, COLH)                      # тело
        pc = s * (PAV + HL) / 2                                         # центр павильона по u
        nu0, nu1 = pc - 0.8, pc + 0.8                                   # ниша для статуи
        nz0, nz1 = 0.8, 3.9
        box('wall', F, a, nu0, -0.5, 0, 0, COLH)                       # лицо с нишей (восток)
        box('wall', F, nu1, b, -0.5, 0, 0, COLH)
        box('wall', F, nu0, nu1, -0.5, 0, 0, nz0)
        box('wall', F, nu0, nu1, -0.5, 0, nz1, COLH)
        # обрамление ниши
        for (x0, x1, z0, z1) in ((nu0 - 0.12, nu0, nz0 - 0.1, nz1 + 0.1), (nu1, nu1 + 0.12, nz0 - 0.1, nz1 + 0.1),
                                 (nu0 - 0.12, nu1 + 0.12, nz1, nz1 + 0.1), (nu0 - 0.12, nu1 + 0.12, nz0 - 0.1, nz0)):
            box('trim', F, x0, x1, 0, 0.07, z0, z1)
        figure(F.p(pc, -0.28, nz0 + 0.22), F.N(), 2.4)
        box('trim', F, pc - 0.5, pc + 0.5, -0.5 + 0.02, -0.05, nz0, nz0 + 0.22)         # постамент статуи
        # цоколь и лопатки на восточной и западной сторонах
        box('trim', F, a - 0.06, b + 0.06, 0, 0.07, 0, 0.45)
        box('trim', F, a - 0.06, b + 0.06, -DEP - 0.07, -DEP, 0, 0.45)
        for (x0, x1) in ((a - 0.06, a + 0.5), (b - 0.5, b + 0.06)):                # угловые лопатки
            box('trim', F, x0, x1, 0, 0.1, 0.45, COLH)
            box('trim', F, x0, x1, -DEP - 0.1, -DEP, 0.45, COLH)
        # филёнка на западном фасаде (со стороны площади)
        px0, px1, pz0, pz1 = pc - 0.8, pc + 0.8, 1.0, 3.7
        for (x0, x1, z0, z1) in ((px0 - 0.12, px0, pz0 - 0.1, pz1 + 0.1), (px1, px1 + 0.12, pz0 - 0.1, pz1 + 0.1),
                                 (px0 - 0.12, px1 + 0.12, pz1, pz1 + 0.1), (px0 - 0.12, px1 + 0.12, pz0 - 0.1, pz0)):
            box('trim', F, x0, x1, -DEP - 0.07, -DEP, z0, z1)
        box('trim', F, px0, px1, -DEP - 0.02, -DEP, pz0, pz1)
    # дверь служебного помещения в торце павильона (в проход)
    box('wood', F, PAV - 0.07, PAV, -3.3, -2.1, 0, 2.3)
    # колонны
    for k in range(-5, 6, 2):
        for d in ROWS:
            P = F.p(k * S / 2, d, 0)
            doric(P.x, P.y, 0)
    # антаблемент
    box('wall', F, -HL, HL, -DEP, 0, COLH, ARCH)                                   # архитрав
    box('trim', F, -HL - 0.03, HL + 0.03, -DEP - 0.03, 0.03, ARCH - 0.07, ARCH)     # тения
    box('wall', F, -HL, HL, -DEP, 0, ARCH, FRIEZE)                                  # фриз
    box('trim', F, -HL - 0.1, HL + 0.1, -DEP - 0.1, 0.1, FRIEZE, FRIEZE + 0.15)     # ложе карниза
    box('wall', F, -HL - 0.42, HL + 0.42, -DEP - 0.42, 0.42, FRIEZE + 0.15, COR - 0.17)   # венчающий вынос
    box('trim', F, -HL - 0.5, HL + 0.5, -DEP - 0.5, 0.5, COR - 0.17, COR)           # сима
    # триглифы и гутты
    step = S / 3
    for k in range(-13, 14):
        u = k * step
        if abs(u) > HL - 0.2: continue
        box('trim', F, u - 0.17, u + 0.17, 0, 0.06, ARCH + 0.1, FRIEZE - 0.1)           # триглиф, восток
        box('trim', F, u - 0.17, u + 0.17, -DEP - 0.06, -DEP, ARCH + 0.1, FRIEZE - 0.1) # запад
        box('trim', F, u - 0.17, u + 0.17, 0, 0.04, ARCH - 0.07, ARCH)                  # гутты
        box('trim', F, u - 0.17, u + 0.17, -DEP - 0.04, -DEP, ARCH - 0.07, ARCH)
    for sgn in (-1, 1):                                                              # торцы
        dd = -0.2
        while dd > -DEP + 0.2:
            a, b = sorted((sgn * HL, sgn * (HL + 0.06)))
            box('trim', F, a, b, dd - 0.17, dd + 0.17, ARCH + 0.1, FRIEZE - 0.1)
            dd -= step
    # аттик
    box('wall', F, -4.35, 4.35, -4.45, -0.5, COR, ATT)
    box('trim', F, -4.55, 4.55, -4.65, -0.3, ATT, ATT + 0.2)
    prism_uz('wall', F, [(-1.9, ATT + 0.2), (1.9, ATT + 0.2), (0, ATT + 0.6)], -4.3, -0.65)
    for face_d in (-0.5, -4.45):                                                     # «1846» из тёмных знаков
        for i, u in enumerate((-0.62, -0.2, 0.22, 0.64)):
            sg = 1 if face_d > -1 else -1
            a, b = sorted((face_d, face_d + sg * 0.04))
            box('wood', F, u - 0.07, u + 0.07, a, b, COR + 0.85, COR + 1.15)
    # кровля и акротерии
    face('roof', [F.p(-HL + 0.1, -DEP + 0.1, COR + 0.01), F.p(HL - 0.1, -DEP + 0.1, COR + 0.01),
                  F.p(HL - 0.1, -0.1, COR + 0.01), F.p(-HL + 0.1, -0.1, COR + 0.01)], UP)
    for u in (-HL + 0.15, HL - 0.5):
        for d in (-0.5, -DEP + 0.1):
            box('trim', F, u, u + 0.4, d - 0.4, d, COR, COR + 0.5)
    for u in (-2.2, 0, 2.2):                                                         # флагштоки
        p = F.p(u, -2.5, ATT + 0.2)
        beam('metal', p, p + UP * 2.6, 0.05)

# ------------------------------------------------------------ лестница, площадка, львы
def build_stairs():
    F = Fe
    # терраса перед колоннадой
    prism_plan('stone', F, [(-11.3, 0.12), (11.3, 0.12), (11.3, D_TOP), (-11.3, D_TOP)], BOT, 0.0)
    # верхний марш
    steps = []
    for k in range(1, N_UP + 1):
        steps.append((D_TOP + (k - 1) * TREAD, D_TOP + k * TREAD, -RISE * k))
    steps.append((D_L0, D_L1, Z_LAND))                                              # площадка
    for j in range(N_LOW):
        steps.append((D_L1 + j * TREAD, D_L1 + (j + 1) * TREAD, Z_LAND - RISE * (j + 1)))
    for d0, d1, zt in steps:
        prism_plan('stone', F, trap(d0, d1), zt - 1.1, zt)
    # красная гранитная дорожка по оси
    def strip(d0, d1, zt, half):
        face('wall2', [F.p(-half, d0, zt + 0.012), F.p(half, d0, zt + 0.012), F.p(half, d1, zt + 0.012), F.p(-half, d1, zt + 0.012)], UP)
    strip(0.12, D_TOP, 0.0, 2.1)
    prev = 0.0
    for d0, d1, zt in steps:
        strip(d0, d1, zt, 2.1 if d0 < D_L1 else 2.5)
        face('wall2', [F.p(-2.1, d0 - 0.005, zt + 0.012), F.p(2.1, d0 - 0.005, zt + 0.012),
                       F.p(2.1, d0 - 0.005, prev), F.p(-2.1, d0 - 0.005, prev)], -F.N())
        prev = zt
    # набережная: плитка перед лестницей и по бокам, кромка у воды
    prism_plan('wall3', F, [(-27, D_Q0), (27, D_Q0), (27, D_EDGE), (-27, D_EDGE)], BOT, Z_Q)
    for s in (-1, 1):
        prism_plan('wall3', F, [(s * 15.1, 20.9), (s * 27, 20.9), (s * 27, D_Q0), (s * 15.1, D_Q0)], BOT, Z_Q)
    face('wall2', [F.p(-2.5, D_Q0, Z_Q + 0.012), F.p(2.5, D_Q0, Z_Q + 0.012), F.p(3.4, D_Q0 + 3.0, Z_Q + 0.012), F.p(-3.4, D_Q0 + 3.0, Z_Q + 0.012)], UP)
    box('stone', F, -27, 27, D_EDGE - 0.3, D_EDGE + 0.28, BOT, Z_Q - 0.0)           # кромка
    box('stone', F, -27, 27, D_EDGE - 0.45, D_EDGE + 0.28, Z_Q - 0.18, Z_Q)
    for sx in (-1, 1):                                                              # швартовые тумбы
        for u in (8, 18):
            p = F.p(sx * u, D_EDGE - 0.9, Z_Q)
            beam('metal', p, p + UP * 0.38, 0.22)
    # подпорные стенки набережной по сторонам лестницы
    for s in (-1, 1):
        a, b = sorted((s * 15.1, s * 27))
        box('wall', F, a, b, 20.2, 20.9, BOT, Z_Q + 2.6)
        box('trim', F, a, b, 20.1, 21.0, Z_Q + 2.6, Z_Q + 2.75)
        # щёки лестницы
        T = 0.9
        zt = lambda tz: tz + 1.0
        slab_wall('stone', s, D_TOP, D_L0, ew(D_TOP), ew(D_L0), ew(D_TOP) + T, ew(D_L0) + T, BOT, zt(-RISE), zt(Z_LAND))
        slab_wall('stone', s, D_L0, D_L1, 14.2, 14.2, 14.2 + T, 14.2 + T, BOT, zt(Z_LAND), zt(Z_LAND))
        slab_wall('stone', s, D_L1, D_Q0, 14.2, 14.2, 14.2 + T, 14.2 + T, BOT, zt(Z_LAND), zt(Z_Q))
        # тумбы с вазами
        for d, u in ((D_TOP + 0.1, ew(D_TOP) + 0.45), (D_L0, 14.2 + 0.45), (D_L1, 14.2 + 0.45)):
            zz = (zt(-RISE) if d < D_L0 - 1 else zt(Z_LAND))
            box('stone', F, s * (u - 0.5) if s > 0 else s * (u + 0.5), s * (u + 0.5) if s > 0 else s * (u - 0.5),
                d - 0.5, d + 0.5, zz - 0.1, zz + 0.55)
            urn(F.p(s * u, d, zz + 0.55))
        # львы на гранитных постаментах у подошвы лестницы
        pu, pd = s * 17.1, 22.3
        box('stone', F, *sorted((pu - 1.75, pu + 1.75)), pd - 0.85, pd + 0.85, BOT, Z_Q + 1.15)
        box('trim', F, *sorted((pu - 1.85, pu + 1.85)), pd - 0.95, pd + 0.95, Z_Q + 1.15, Z_Q + 1.3)
        base = F.p(pu, pd, Z_Q + 1.3)
        lion(base, F.U() * (-s), 1.12)

build_propylaea()
build_stairs()

finish('grafskaya', __file__)
