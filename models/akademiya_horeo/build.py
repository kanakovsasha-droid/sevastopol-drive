# Академия хореографии на мысе Хрустальном (Капитанская, 20) — модель по
# фото готового здания (2024–2025) и по спутнику; рендеры Coop Himmelb(l)au /
# «Метрополис» — только там, где фото нет.
#
#   blender -b --python models/akademiya_horeo/build.py -- [glb]
#
# План — контур OSM way 1094669609, он прямоугольный: в местной сетке
# (u — на северо-восток вдоль фасада к Капитанской, v — на юго-восток)
# это 105 × 63 м с хвостом 35 × 55 м на юг и выступом 9 × 25 м на восток.
# Блоки (одно здание, шесть частей разной высоты):
#   • «ячеистый» корпус буквой Г вокруг двора — белые квадратные окна в
#     выступающих рамках, 4 этажа над ленточным этажом, на столбах (под ним
#     газон, к морю видно насквозь), +24.5 м;
#   • западный корпус у беговой дорожки — белые коробки с ленточным
#     остеклением, ступенями к северу, с башней до +28 м и зелёными
#     террасами;
#   • учебный корпус с «пятнистым» экраном (случайные окна-капли) на
#     юго-восточном и дворовом фасадах, 3 этажа над утопленным первым,
#     +18.5 м;
#   • синий стеклянный корпус залов на юге (+18.5) с каплевидным световым
#     двором в кровле;
#   • стеклянный павильон входа на восточном углу (+13);
#   • двор-амфитеатр (374 места) — дуги ступеней.
#
# Ноль высоты — земля у точки (−1260, 190), в игре там ровно 16.44 м.
# Подробности и догадки — NOTES.md.
import sys, os, math, json, random
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *
from mathutils import Vector

COL['wall']  = ((0.92, 0.92, 0.90), 0.6)     # белые панели
COL['wall2'] = ((0.78, 0.78, 0.76), 0.85)    # цоколь
COL['wall3'] = ((0.16, 0.32, 0.58), 0.06)    # синее стекло залов
COL['roof']  = ((0.80, 0.80, 0.79), 0.8)
COL['glass'] = ((0.13, 0.21, 0.32), 0.08)
COL['trim']  = ((0.96, 0.96, 0.95), 0.6)     # рамы окон, импосты
COL['stone'] = ((0.76, 0.75, 0.72), 0.9)     # ступени амфитеатра
COL['green'] = ((0.36, 0.47, 0.24), 0.95)    # зелёные террасы

X0, Z0 = -1260.0, 190.0
origin(X0, Z0)
random.seed(1094669609)

# ------------------------------------------------------------------ местная сетка
V2 = (-1344.2, 166.6)                         # западный угол контура OSM
Uw = Vector((90.1, -53.7)).normalized()       # вдоль СЗ фасада, мир (x, z)
O = W(*V2)
U = Vector((Uw.x, -Uw.y))                     # то же в плоскости Blender
N = Vector((U.y, -U.x))                       # на юго-восток
# проверка: N в мире = (0.512, 0.859) — на юго-юго-восток
F0 = Frame(O, U, N)

def L2(u, v): return O + U * u + N * v
def L3(u, v, z):
    p = L2(u, v); return Vector((p.x, p.y, z))
def world(u, v):
    p = L2(u, v); return (round(p.x + X0, 1), round(-p.y + Z0, 1))

def FF(u0, v0, u1, v1, out):
    """Рамка фасада от (u0,v0) к (u1,v1); out — наружу в местной сетке (du, dv)."""
    a, b = L2(u0, v0), L2(u1, v1)
    return Frame(a, b - a, U * out[0] + N * out[1])

ZB = -7.0          # низ масс: к морю (СЗ) земля на 2–6 м ниже нуля

# Контур OSM в местной сетке (с точностью 0.2 м):
#   (0,0) (105,0) (105,63) (114,63) (114,87.5) (39,87.5) (39,109) (4.6,109) (4.6,54) (0,54)

# ------------------------------------------------------------------ окна ячеистого корпуса
def cells(F, ua, ub, z0=10.5, floors=4, fh=3.45, pitch=3.3):
    """Квадратные окна в выступающих белых рамках, шахматный разнобой глубины."""
    n = int((ub - ua - 1.2) // pitch)
    m0 = ua + (ub - ua - n * pitch) / 2
    for k in range(floors):
        za = z0 + k * fh + 0.45; zb = za + 2.45
        i = 0
        while i < n:
            r = random.random()
            if r < 0.07: i += 1; continue                 # глухая ячейка
            span = 2 if (r > 0.86 and i + 1 < n) else 1   # сдвоенное окно
            u0 = m0 + i * pitch + 0.45; u1 = m0 + (i + span) * pitch - 0.45
            d = random.choice((0.35, 0.6, 0.6, 1.0))
            t = 0.35                                      # толщина рамки
            P = lambda u, dd, z: F.p(u, dd, z)
            # боковины рамки
            for q, h in (([P(u0, 0, za), P(u1, 0, za), P(u1, d, za), P(u0, d, za)], -UP),
                         ([P(u0, 0, zb), P(u1, 0, zb), P(u1, d, zb), P(u0, d, zb)], UP),
                         ([P(u0, 0, za), P(u0, d, za), P(u0, d, zb), P(u0, 0, zb)], -F.U()),
                         ([P(u1, 0, za), P(u1, d, za), P(u1, d, zb), P(u1, 0, zb)], F.U())):
                face('trim', q, h)
            # лицо рамки — кольцо, внутри стекло на 0.2 м глубже
            a = [P(u0, d, za), P(u1, d, za), P(u1, d, zb), P(u0, d, zb)]
            b = [P(u0 + t, d, za + t), P(u1 - t, d, za + t), P(u1 - t, d, zb - t), P(u0 + t, d, zb - t)]
            for j in range(4):
                face('trim', [a[j], a[(j + 1) % 4], b[(j + 1) % 4], b[j]], F.N())
            face('glass', [F.p(u0 + t, d - 0.2, za + t), F.p(u1 - t, d - 0.2, za + t),
                           F.p(u1 - t, d - 0.2, zb - t), F.p(u0 + t, d - 0.2, zb - t)], F.N())
            i += span

def ribbons(F, ua, ub, bands, m='glass', push=0.05):
    for za, zb in bands:
        face(m, [F.p(ua, push, za), F.p(ub, push, za), F.p(ub, push, zb), F.p(ua, push, zb)], F.N())

def columns(F, ua, ub, d, z0, z1, pitch=7.5, w=0.9):
    n = max(1, int(round((ub - ua) / pitch)))
    for i in range(n + 1):
        u = ua + (ub - ua) * i / n
        box('wall', F, u - w / 2, u + w / 2, d - w / 2, d + w / 2, z0, z1, bottom=False)

# ------------------------------------------------------------------ 1. ячеистый корпус «Г»
HC = 24.5
# северное крыло u 30–105, v 0–18; восточное u 87–105, v 18–63
box('wall', F0, 30, 105, 0, 18, 10.5, HC)
box('wall', F0, 87, 105, 18, 63, 10.5, HC)
box('glass', F0, 30.3, 104.7, 0.3, 17.7, 7.0, 10.5, bottom=False)       # ленточный этаж
box('glass', F0, 87.3, 104.7, 17.7, 62.7, 7.0, 10.5, bottom=False)
box('wall', F0, 30, 105, 0, 18, 6.6, 7.0)                                # плита над столбами
box('wall', F0, 87, 105, 18, 63, 6.6, 7.0)
box('glass', F0, 30, 100, 6, 13, ZB, 6.6, bottom=False)                  # стеклянное ядро
box('glass', F0, 92, 99, 13, 50, ZB, 6.6, bottom=False)
columns(FF(30, 0, 105, 0, (0, -1)), 2, 74, 1.2, ZB, 6.6)                 # столбы с моря
columns(FF(30, 18, 87, 18, (0, 1)), 2, 56, -1.2, ZB, 6.6)                # со двора
columns(FF(105, 0, 105, 63, (1, 0)), 3, 60, 1.2, ZB, 6.6)
columns(FF(87, 18, 87, 50, (-1, 0)), 3, 32, 1.2, ZB, 6.6)
cells(FF(30, 0, 105, 0, (0, -1)), 0, 75)
cells(FF(30, 18, 87, 18, (0, 1)), 0, 57)
cells(FF(105, 0, 105, 63, (1, 0)), 0, 63)
cells(FF(87, 18, 87, 50, (-1, 0)), 0, 32)
box('trim', F0, 30, 105, -0.1, 0.4, HC, HC + 0.9, bottom=False)          # парапет
box('trim', F0, 104.6, 105.1, 0, 63, HC, HC + 0.9, bottom=False)

# ------------------------------------------------------------------ 2. западный корпус со ступенями и башней
box('glass', F0, 2, 38, 2, 54, ZB, 5.0, bottom=False)                    # утопленный первый этаж
box('wall2', F0, 0, 38, 0, 54, ZB, -1.0)                                 # цоколь к дорожке
box('wall', F0, 0, 10, 0, 18, 5.0, 14.0)                                 # нижняя ступень
box('wall', F0, 10, 30, 0, 18, 5.0, 22.0)                                # средняя
box('wall', F0, 13, 25, 3, 15, 22.0, 28.0)                               # башня
box('wall', F0, 0, 38, 18, 54, 5.0, 19.0)                                # ленточный блок
B3 = ((6.0, 9.2), (10.2, 13.4), (14.4, 17.6))
B4 = B3 + ((18.6, 21.0),)
ribbons(FF(0, 18, 0, 54, (-1, 0)), 1.5, 34.5, B3)                        # к беговой дорожке
ribbons(FF(0, 0, 0, 18, (-1, 0)), 1.0, 17.0, B3[:2])
ribbons(FF(10, 0, 10, 18, (-1, 0)), 1.0, 17.0, ((14.6, 17.6), (18.6, 21.0)))
ribbons(FF(0, 0, 30, 0, (0, -1)), 1.0, 9.0, B3[:2])
ribbons(FF(0, 0, 30, 0, (0, -1)), 11.0, 29.0, B4)
ribbons(FF(13, 3, 13, 15, (-1, 0)), 1.0, 11.0, ((22.5, 27.2),))          # стекло башни
ribbons(FF(13, 3, 25, 3, (0, -1)), 1.0, 11.0, ((22.5, 27.2),))
ribbons(FF(38, 18, 38, 54, (1, 0)), 0.5, 35.5, ((5.2, 18.3),), m='wall3')  # синее стекло во двор
# зелёные террасы
face('green', [L3(0.6, 0.6, 14.05), L3(9.6, 0.6, 14.05), L3(9.6, 17.4, 14.05), L3(0.6, 17.4, 14.05)], UP)
face('green', [L3(10.6, 15.6, 22.05), L3(29.4, 15.6, 22.05), L3(29.4, 17.4, 22.05), L3(10.6, 17.4, 22.05)], UP)
face('green', [L3(18, 21, 19.05), L3(26, 21, 19.05), L3(26, 50, 19.05), L3(18, 50, 19.05)], UP)
for (a, b, c, d, z) in ((0, 10, 0, 18, 14.0), (10, 30, 0, 18, 22.0), (0, 38, 18, 54, 19.0)):
    box('trim', F0, a, b, c - 0.1, c + 0.3, z, z + 0.9, bottom=False)

# ------------------------------------------------------------------ 3. учебный корпус с «пятнами»
HB = 18.5
box('wall2', F0, 39, 100, 53, 84.5, ZB, 5.0, bottom=False)                # утопленный первый этаж
ribbons(FF(39, 84.5, 100, 84.5, (0, 1)), 4.0, 57.0, ((0.4, 4.4),))
ribbons(FF(39, 53, 87, 53, (0, -1)), 2.0, 46.0, ((0.4, 4.4),))
box('wall', F0, 39, 100, 50, 87.5, 5.0, HB)
box('trim', F0, 39, 100, 87.3, 87.8, HB, HB + 0.6, bottom=False)

def blob(discs, n=18, smooth=2, sz=1.0):
    """Контур слияния кругов (u, z, R): луч из центра масс до дальней
    окружности, потом сглаживание — получаются «фасолины» с перехватом."""
    cx = sum(d[0] for d in discs) / len(discs); cz = sum(d[1] for d in discs) / len(discs)
    a2, p2 = random.uniform(0, 0.1), random.uniform(0, 6.28)
    pts = []
    for k in range(n):
        t = 2 * math.pi * k / n; dx, dz = math.cos(t), math.sin(t)
        best = 0.0
        for (px, pz, R) in discs:
            ox, oz = px - cx, pz - cz
            pr = dx * ox + dz * oz; q = R * R - (ox * ox + oz * oz - pr * pr)
            if q > 0: best = max(best, pr + math.sqrt(q))
        best *= 1 + a2 * math.cos(2 * t + p2)
        pts.append((cx + dx * best, cz + dz * best))
    for _ in range(smooth):
        pts = [((pts[i - 1][0] + 2 * pts[i][0] + pts[(i + 1) % n][0]) / 4,
                (pts[i - 1][1] + 2 * pts[i][1] + pts[(i + 1) % n][1]) / 4) for i in range(n)]
    return [(u, cz + (z - cz) * sz) for u, z in pts]

def blobs(F, ua, ub, z0=5.4, z1=18.1, pitch=3.5, rows=3):
    """Плотная россыпь капель: сетка ячеек со сдвигом рядов, часть ячеек
    слита в «фасолины» по горизонтали или наискось — белым остаётся сеть
    перемычек 0.4–0.8 м, как на фото."""
    nc = max(1, int((ub - ua) // pitch)); pu = (ub - ua) / nc
    pz = (z1 - z0) / rows
    used = set(); cnt = 0
    sh = [random.uniform(-0.3, 0.3) * pu for _ in range(rows)]
    for j in range(rows):
        for i in range(nc):
            if (i, j) in used: continue
            used.add((i, j))
            c1 = (ua + (i + 0.5) * pu + sh[j], z0 + (j + 0.5) * pz)
            R = lambda: pu * random.uniform(0.50, 0.58)
            r = random.random()
            if r < 0.28 and i + 1 < nc and (i + 1, j) not in used:
                used.add((i + 1, j)); c1 = (c1[0] + pu * 0.1, c1[1]); c2 = (c1[0] + pu * 0.8, c1[1] + random.uniform(-0.5, 0.5))
                d = [(*c1, R()), (*c2, R())]
            elif r < 0.46 and i + 1 < nc and j + 1 < rows and (i + 1, j + 1) not in used:
                used.add((i + 1, j + 1)); c2 = (c1[0] + pu * 0.6, c1[1] + pu * 0.7)
                d = [(*c1, R()), (*c2, R())]
            elif r < 0.56 and j + 1 < rows and (i, j + 1) not in used:
                used.add((i, j + 1)); c2 = (c1[0] + random.uniform(-0.8, 0.8), c1[1] + pu * 0.75)
                d = [(*c1, R()), (*c2, R())]
            elif r < 0.60:
                continue
            else:
                d = [(c1[0] + random.uniform(-0.3, 0.3), c1[1] + random.uniform(-0.25, 0.25), R() * (0.6 if random.random() < 0.12 else 1.0))]
            pts = blob(d, n=18 if len(d) > 1 else 12, sz=pz / pu * random.uniform(0.85, 1.05))
            pts = [(min(max(u, ua + 0.3), ub - 0.3), min(max(z, z0), z1)) for u, z in pts]
            face('wall3', [F.p(u, 0.06, z) for u, z in pts], F.N())
            cnt += 1
    return cnt

nb = blobs(FF(39, 87.5, 100, 87.5, (0, 1)), 0.6, 60.4)                # юго-восточный фасад
nb += blobs(FF(39, 50, 87, 50, (0, -1)), 0.6, 47.4)                   # дворовый
nb += blobs(FF(100, 63, 100, 87.5, (1, 0)), 0.6, 24.0, z0=13.8, rows=1)       # торец над павильоном
print('пятен:', nb)

# ------------------------------------------------------------------ 4. синий стеклянный корпус залов
HS = 18.5
box('wall3', F0, 4.6, 39, 54, 109, ZB, 17.0)
box('wall', F0, 4.6, 39, 54, 109, 17.0, HS)
box('wall2', F0, 4.4, 39.2, 53.8, 109.2, ZB, 0.6, bottom=False)
for F, a, b in ((FF(4.6, 54, 4.6, 109, (-1, 0)), 0, 55), (FF(4.6, 109, 39, 109, (0, 1)), 0, 34.4),
                (FF(39, 87.5, 39, 109, (1, 0)), 0, 21.5)):
    k = a + 3.0
    while k < b - 0.5:
        box('trim', F, k - 0.12, k + 0.12, 0, 0.3, 0.6, 17.0, bottom=False)
        k += 3.0
    for z in (5.0, 9.2, 13.2):
        box('trim', F, a, b, 0, 0.3, z - 0.12, z + 0.12, bottom=False)
# каплевидный световой двор в кровле (на спутнике у u ≈ 25, v ≈ 89)
drop = []
for k in range(16):
    t = 2 * math.pi * k / 16
    r = 1 + 0.35 * math.cos(t)                     # остриё — на юго-запад
    drop.append(L3(25 - 6.0 * r * math.cos(t) * 0.8, 89 + 5.5 * math.sin(t) * (1 - 0.25 * math.cos(t)), HS + 0.05))
face('glass', drop, UP)

# ------------------------------------------------------------------ 5. стеклянный павильон входа
HP = 13.0
box('glass', F0, 100, 113.6, 63.4, 87.1, ZB, HP)
box('wall', F0, 99.6, 114.4, 62.6, 87.9, HP, HP + 0.8)
for F, a, b in ((FF(114, 63, 114, 87.5, (1, 0)), 0, 24.5), (FF(100, 87.5, 114, 87.5, (0, 1)), 0, 14),
                (FF(100, 63, 114, 63, (0, -1)), 5, 14)):
    k = a + 2.45
    while k < b - 0.4:
        box('metal', F, k - 0.08, k + 0.08, -0.35, 0.1, 0, HP, bottom=False)
        k += 2.45
    for z in (4.3, 8.6):
        box('metal', F, a, b, -0.35, 0.1, z - 0.08, z + 0.08, bottom=False)

# ------------------------------------------------------------------ 6. амфитеатр во дворе
# Дуги ступеней вокруг сцены у дворового фасада учебного корпуса, ряды
# поднимаются к ячеистому корпусу.
C = (68.0, 49.0)
RAD = [9 + 2.6 * i for i in range(8)]
A0, A1, SEG = math.radians(175), math.radians(300), 14
def ap(r, a, z): return L3(C[0] + r * math.cos(a), C[1] + r * math.sin(a), z)
for i in range(len(RAD) - 1):
    z = 0.42 * (i + 1); r0, r1 = RAD[i], RAD[i + 1]
    for s in range(SEG):
        a, b = A0 + (A1 - A0) * s / SEG, A0 + (A1 - A0) * (s + 1) / SEG
        face('stone', [ap(r0, a, z), ap(r0, b, z), ap(r1, b, z), ap(r1, a, z)], UP)
        mid = (a + b) / 2
        face('stone', [ap(r0, a, z - 0.42), ap(r0, b, z - 0.42), ap(r0, b, z), ap(r0, a, z)],
             -(U * math.cos(mid) + N * math.sin(mid)).to_3d())
# наружная подпорная стенка последнего ряда
zt = 0.42 * (len(RAD) - 1)
for s in range(SEG):
    a, b = A0 + (A1 - A0) * s / SEG, A0 + (A1 - A0) * (s + 1) / SEG
    r = RAD[-1]; mid = (a + b) / 2
    face('stone', [ap(r, a, 0), ap(r, b, 0), ap(r, b, zt), ap(r, a, zt)],
         (U * math.cos(mid) + N * math.sin(mid)).to_3d())

# ------------------------------------------------------------------ кровли: техника
for (u, v, w, d, h) in ((60, 6, 8, 5, 1.8), (95, 30, 6, 8, 1.8), (55, 65, 10, 6, 2.0), (80, 70, 7, 5, 2.0)):
    zr = HC if v < 18 or u > 87 else HB
    box('wall2', F0, u, u + w, v, v + d, zr, zr + h, bottom=False)

# ------------------------------------------------------------------ контур для игры
LOC = [(0, 0), (105, 0), (105, 63), (114, 63), (114, 87.5), (39, 87.5), (39, 109),
       (4.6, 109), (4.6, 54), (0, 54)]
ins = 0.8
FPl = []
n = len(LOC)
for i in range(n):
    # прямоугольный контур: вершину сдвигаем на ins по биссектрисе внутрь
    pu, pv = LOC[i]; a = LOC[i - 1]; b = LOC[(i + 1) % n]
    e1 = Vector((pu - a[0], pv - a[1])).normalized(); e2 = Vector((b[0] - pu, b[1] - pv)).normalized()
    n1 = Vector((-e1.y, e1.x)); n2 = Vector((-e2.y, e2.x))     # внутрь при обходе по часовой в (u, v)
    FPl.append((pu + (n1.x + n2.x) * ins, pv + (n1.y + n2.y) * ins))
FP = []
for u, v in FPl:
    FP += list(world(u, v))
FP += FP[:2]
json.dump(FP, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'footprint.json'), 'w'))

finish('akademiya_horeo', __file__, tri_budget=20000)
