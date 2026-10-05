# Севастопольский театр оперы и балета на мысе Хрустальном (Капитанская, 12) —
# модель с нуля по проекту Coop Himmelb(l)au (Вольф Прикс), 2018–2026.
#
#   blender -b --python models/opera/build.py -- [glb]
#
# Три части, как в схеме-«взрыве» авторов: КРОВЛЯ — белая парящая оболочка
# с двумя горбами и консолями до 25–33 м; КЛИПСА — изогнутая лента из белых
# горизонтальных ламелей, обнимающая зал и закулисье с севера; ЦОКОЛЬ —
# подиум, на котором стоит стеклянное фойе. Подробности и догадки — NOTES.md.
#
# План кровли — контур OSM way 1547727809 (совпадает со спутником: оболочка
# видна сверху целиком). Ноль высоты — уровень площади у южного входа; к морю
# (на север) земля падает на 14 м, и подиум там стоит открытой стеной с
# лентой окон нижних этажей.
import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *
from mathutils import Vector

COL['roof']  = ((0.93, 0.93, 0.91), 0.55)    # белые панели оболочки
COL['wall']  = ((0.88, 0.88, 0.87), 0.7)     # низ оболочки (софит)
COL['wall2'] = ((0.82, 0.83, 0.83), 0.85)    # фибробетон подиума
COL['stone'] = ((0.66, 0.65, 0.62), 0.9)     # гранит площади и ступеней
COL['glass'] = ((0.16, 0.24, 0.32), 0.08)    # голубое витражное стекло
COL['trim']  = ((0.95, 0.95, 0.94), 0.6)     # ламели клипсы
COL['metal'] = ((0.72, 0.74, 0.77), 0.45)    # импосты витража

# Сглаженные материалы: оболочка кривая, плоские грани на ней — «мятая бумага».
for k in ('roof_s', 'wall_s'):
    SMOOTH.add(k); LOD_KEEP.add(k)

X0, Z0 = -985.0, 290.0                        # площадь у южного входа
origin(X0, Z0)

# ------------------------------------------------------------------ план кровли
OSM = [(-1043.2, 103.6), (-982.0, 107.7), (-972.0, 155.6), (-964.1, 183.7), (-963.0, 207.7),
       (-969.4, 228.2), (-939.9, 268.3), (-995.6, 312.8), (-1047.2, 248.5), (-1061.2, 224.5),
       (-1064.0, 212.8), (-1061.9, 186.0), (-1052.0, 145.2)]
SHARP = {0, 1, 6, 7, 8}                       # углы консолей: остаются острыми
N_OUT = 100

def chaikin(pts, sharp, it=3):
    P = [(Vector(p), i in sharp) for i, p in enumerate(pts)]
    for _ in range(it):
        Q = []
        n = len(P)
        for i in range(n):
            a, sa = P[i]; b, sb = P[(i + 1) % n]
            if sa: Q.append((a, True))
            Q.append((a.lerp(b, 0.25), False) if not sa else (a.lerp(b, 0.12), False))
            Q.append((a.lerp(b, 0.75), False) if not sb else (a.lerp(b, 0.88), False))
        P = Q
    return P

def resample(P, n):
    """Равный шаг по длине, острые углы попадают в выборку точно."""
    pts = [p for p, s in P]
    idx = [i for i, (p, s) in enumerate(P) if s]
    L = sum((pts[(i + 1) % len(pts)] - pts[i]).length for i in range(len(pts)))
    out = []
    for k, i0 in enumerate(idx):
        i1 = idx[(k + 1) % len(idx)]
        seg = [pts[i0]]
        j = i0
        while j != i1:
            j = (j + 1) % len(pts); seg.append(pts[j])
        sl = sum((seg[m + 1] - seg[m]).length for m in range(len(seg) - 1))
        m = max(2, round(n * sl / L))
        acc = [0.0]
        for q in range(len(seg) - 1): acc.append(acc[-1] + (seg[q + 1] - seg[q]).length)
        for t in range(m):
            d = sl * t / m
            q = 0
            while q < len(seg) - 2 and acc[q + 1] < d: q += 1
            f = (d - acc[q]) / max(1e-6, acc[q + 1] - acc[q])
            out.append((seg[q].lerp(seg[q + 1], f), t == 0))
    return out

OUT = resample(chaikin(OSM, SHARP), N_OUT)    # [(Vector мира x,z), острый?]
N = len(OUT)

# Хребет: к нему стягиваются кольца оболочки (план вытянут с севера на юг).
SP0, SP1 = Vector((-1009.0, 145.0)), Vector((-999.0, 258.0))
def spine(p):
    d = SP1 - SP0
    t = max(0.0, min(1.0, (p - SP0).dot(d) / d.length_squared))
    return SP0 + d * t

def ring_pt(i, s):
    p = OUT[i][0]
    return p.lerp(spine(p), s)

# ------------------------------------------------------------------ высоты
NW, NE, ETIP, STIP = Vector(OSM[0]), Vector(OSM[1]), Vector(OSM[6]), Vector(OSM[7])
def g(p, c, r): return math.exp(-((p - c).length / r) ** 2)

def top_h(p, s):
    """Верх оболочки над нулём. p — точка плана мира, s — доля пути к хребту."""
    zt = max(0.0, min(1.0, (p.y - 104.0) / 209.0))
    h = 22.5 + 3.5 * zt                                  # к югу кромка выше
    # «чайка»: концы консолей задраны
    h += 3.0 * g(p, ETIP, 30) + 3.5 * g(p, STIP, 30) + 1.5 * g(p, NW, 25) + 1.5 * g(p, NE, 25)
    h += 3.0 * s ** 0.8                                  # оболочка поднимается от кромки
    h += 13.5 * g(p, Vector((-1007.0, 165.0)), 46)       # горб над сценой
    h += 8.0 * g(p, Vector((-997.0, 248.0)), 28)         # горб над фойе
    h -= 2.5 * g(p, Vector((-1004.0, 207.0)), 18) * s    # талия между горбами
    return h

def thick(s):
    return 1.3 + 4.5 * min(1.0, s / 0.5)

def bot_h(p, s): return top_h(p, s) - thick(s)

def V3(p, h):
    q = W(p.x, p.y)
    return Vector((q.x, q.y, h))

# ------------------------------------------------------------------ кровля
S_TOP = [0, 0.03, 0.09, 0.17, 0.28, 0.41, 0.56, 0.72, 0.87, 1.0]
S_BOT = [0, 0.03, 0.09, 0.17, 0.27, 0.39, 0.52]
C3 = V3(Vector((-1005.0, 200.0)), 20)

def sheet(m, S, fh, up):
    for a in range(len(S) - 1):
        for i in range(N):
            j = (i + 1) % N
            q = [(i, S[a]), (j, S[a]), (j, S[a + 1]), (i, S[a + 1])]
            P = [V3(ring_pt(k, s), fh(ring_pt(k, s), s)) for k, s in q]
            if (P[0] - P[3]).length < 1e-3 and (P[1] - P[2]).length < 1e-3: continue
            face(m, P, UP if up else -UP)

sheet('roof_s', S_TOP, top_h, True)
sheet('wall_s', S_BOT, bot_h, False)
for i in range(N):                                        # кромка оболочки
    j = (i + 1) % N
    a, b = OUT[i][0], OUT[j][0]
    q = [V3(a, bot_h(a, 0)), V3(b, bot_h(b, 0)), V3(b, top_h(b, 0)), V3(a, top_h(a, 0))]
    face('roof', q, sum(q, Vector()) / 4 - C3)

# ------------------------------------------------------------------ подиум
# Площадка под консолями — почти до кромки кровли; к морю стоит стеной.
S_POD = 0.025
POD = [ring_pt(i, S_POD) for i in range(N)]
PB = -24.0
PT = 0.5                                      # верх подиума: на ЮВ земля до +0.4
face('stone', [V3(p, PT) for p in POD], UP)
for i in range(N):
    j = (i + 1) % N
    q = [V3(POD[i], PB), V3(POD[j], PB), V3(POD[j], PT), V3(POD[i], PT)]
    face('wall2', q, sum(q, Vector()) / 4 - C3)
    # ленты окон нижних этажей: к морю земля на 14 м ниже площади, и подиум
    # там — три этажа закулисья и служебных входов
    if POD[i].y > 240.0: continue
    o = (POD[i] - spine(POD[i])).normalized() * 0.06
    qa, qb = POD[i] + o, POD[j] + o
    for za, zb in ((-14.6, -11.8), (-10.3, -7.5), (-6.0, -3.0)):
        q = [V3(qa, za), V3(qb, za), V3(qb, zb), V3(qa, zb)]
        face('glass', q, sum(q, Vector()) / 4 - C3)

# ------------------------------------------------------------------ стеклянное фойе
# Линия витража: отступ от кромки 8 м, у консолей — до 25 (восток) и 20 (юг).
def inset(p):
    return 8.0 + 18.0 * g(p, ETIP, 26) + 13.0 * g(p, STIP, 24) - 2.0 * g(p, (NW + NE) / 2, 30)

GL = []
for i in range(N):
    p = OUT[i][0]
    s = inset(p) / max(1.0, (spine(p) - p).length)
    GL.append((ring_pt(i, min(s, 0.5)), min(s, 0.5)))

def lean(p):
    """Вынос низа витража внутрь: стекло фойе наклонено наружу (юг)."""
    return (p - spine(p)).normalized() * (3.5 * smooth(225.0, 255.0, p.y))
def smooth(a, b, x):
    x = max(0.0, min(1.0, (x - a) / (b - a))); return x * x * (3 - 2 * x)

for i in range(N):
    j = (i + 1) % N
    (a, sa), (b, sb) = GL[i], GL[j]
    da, db = lean(a), lean(b)
    q = [V3(a - da, PT), V3(b - db, PT), V3(b, bot_h(b, sb) + 1.0), V3(a, bot_h(a, sa) + 1.0)]
    face('glass', q, sum(q, Vector()) / 4 - C3)
    # импосты: вертикаль в каждом узле, ригели на 6 и 12 м
    hn = bot_h(a, sa)
    o = (a - spine(a)).normalized() * 0.25
    beam('metal', V3(a + o - da, PT), V3(a + o, hn + 0.5), 0.35, 0.5)
    ob_ = (b - spine(b)).normalized() * 0.25
    for zz in (6.0, 12.0):
        fa, fb = 1 - zz / (hn + 1.0), 1 - zz / (bot_h(b, sb) + 1.0)
        beam('metal', V3(a + o - da * fa, zz), V3(b + ob_ - db * fb, zz), 0.2, 0.3)

# ------------------------------------------------------------------ клипса
# Лента из белых ламелей вокруг зала и сцены: «глаз» с запада через север
# на восток, концы сходятся остриём у фойе; под лентой на северо-востоке —
# терраса на море (вид авторов с востока, w_1814_r29).
north = [k for k in range(N) if GL[k][0].y < 236.0]
start = next(k for k in north if (k - 1) % N not in north)
path = []
k = start
while k in north:
    path.append(GL[k]); k = (k + 1) % N
# путь: t = 0 — запад, t = 1 — восток
L = [0.0]
for m in range(1, len(path)): L.append(L[-1] + (path[m][0] - path[m - 1][0]).length)
TOT = L[-1]
def smooth(a, b, x):
    x = max(0.0, min(1.0, (x - a) / (b - a))); return x * x * (3 - 2 * x)
def prof(t):
    """(низ, верх, вынос) ленты в точке t: «глаз», сходящийся к концам."""
    e = math.sin(math.pi * t) ** 0.65
    lo = 10.0 - 5.5 * e - 1.5 * smooth(0.45, 0.75, t) * e
    hi = 10.0 + 9.0 * e
    return lo, hi, 11.0 * e
def deck(t):
    """Вынос палубы под клипсой: на северо-востоке — терраса на море."""
    return 2.5 + 13.0 * math.exp(-((t - 0.62) / 0.12) ** 2)
SL = 11                                                   # ламелей по высоте
for m in range(len(path) - 1):
    t0, t1 = L[m] / TOT, L[m + 1] / TOT
    (a, sa), (b, sb) = path[m], path[m + 1]
    na = (a - spine(a)).normalized(); nb = (b - spine(b)).normalized()
    la, ha, oa = prof(t0); lb, hb, ob = prof(t1)
    if ha - la < 0.8 and hb - lb < 0.8: continue
    for k in range(SL):
        f = k / (SL - 1)
        za, zb = la + (ha - la) * f, lb + (hb - lb) * f
        e = math.sqrt(max(0.0, 1 - (2 * f - 1) ** 2))     # линза: шире всего посередине
        ra, rb = oa * e + 1.0, ob * e + 1.0
        w = 2.0
        A0, A1 = a + na * (ra - w / 2), a + na * (ra + w / 2)
        B0, B1 = b + nb * (rb - w / 2), b + nb * (rb + w / 2)
        th = 0.4
        P = [V3(A0, za), V3(A1, za), V3(B1, zb), V3(B0, zb)]
        Q = [V3(A0, za + th), V3(A1, za + th), V3(B1, zb + th), V3(B0, zb + th)]
        face('trim', Q, UP); face('trim', P, -UP)
        face('trim', [P[1], P[2], Q[2], Q[1]], V3(A1, 0) - V3(A0, 0))
    # нижняя ламель — сплошная белая палуба (терраса и пандус), с ней LOD
    A0, A1 = a + na * 0.2, a + na * (oa * 0.3 + deck(t0))
    B0, B1 = b + nb * 0.2, b + nb * (ob * 0.3 + deck(t1))
    P = [V3(A0, la - 0.9), V3(A1, la - 0.9), V3(B1, lb - 0.9), V3(B0, lb - 0.9)]
    Q = [V3(A0, la), V3(A1, la), V3(B1, lb), V3(B0, lb)]
    face('wall2', Q, UP); face('wall2', P, -UP)
    face('wall2', [P[1], P[2], Q[2], Q[1]], V3(A1, 0) - V3(A0, 0))
    # тёмное нутро клипсы — чтобы сквозь ламели не светило небо
    q = [V3(a + na * 0.3, la), V3(b + nb * 0.3, lb), V3(b + nb * 0.3, hb), V3(a + na * 0.3, ha)]
    face('glass', q, V3(na, 0) - V3(Vector((0, 0)), 0))

# ------------------------------------------------------------------ амфитеатр
# Ступени с восточной площадки к мемориалу (на генплане авторов — красным).
FA, LA = frame_from((-962.0, 186.0), (-966.0, 232.0), (-1000.0, 210.0))
for k in range(7):
    box('stone', FA, 2.0, LA - 2.0, 0.0, 3.0 + 2.2 * k, -6.0, -0.45 * k)

# Контур для игры: подиум на 1.2 м внутрь. Его ставим вместо коробки OSM в
# data/world.json и чанки (hide) — по нему стена-столкновение и каменный
# цоколь plinth.js; по сырому контуру OSM цоколь вылезал бы из-под подиума
# на скруглениях и закрывал ленты окон.
import json
FP = []
for i in range(0, N, 2):
    p = OUT[i][0]
    q = ring_pt(i, S_POD + 1.2 / max(1.0, (spine(p) - p).length))
    FP += [round(q.x, 1), round(q.y, 1)]
FP += FP[:2]
json.dump(FP, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'footprint.json'), 'w'))

finish('opera', __file__, tri_budget=25000)
