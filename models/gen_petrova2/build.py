# Ген. Петрова, 2 — длинный трёхэтажный дом 1951–54 гг. на западе пл. Лазарева
# (OSM way 92028623). Модель с нуля по контуру OSM и описанию refs/center-models.json.
#
#   blender -b --python models/gen_petrova2/build.py -- [glb]
#
# План по OSM почти точно прямоугольный: уличный корпус 65 × 15,5 м вдоль
# ул. Генерала Петрова (ребро 8 контура), во двор — южное крыло 16 × 11 м и
# северный корпус 28 × 14 м, вынесенный к площади. Ноль высоты — тротуар
# посередине уличного фасада. Что сделано наугад — NOTES.md.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *
LOD_KEEP.discard('wall2')          # швы руста вдали не видны

COL['wall']  = ((0.886, 0.839, 0.733), 0.9)    # кремовый известняк #e2d6bb
COL['wall3'] = ((0.922, 0.894, 0.812), 0.9)    # облицовка первого этажа #ebe4cf
COL['wall2'] = ((0.80, 0.76, 0.66), 0.9)       # швы руста
COL['trim']  = ((0.95, 0.93, 0.87), 0.85)
COL['roof']  = ((0.478, 0.353, 0.282), 0.8)    # черепица #7a5a48
COL['stone'] = ((0.66, 0.63, 0.57), 0.9)

P8, P9 = (-473.8, 586.1), (-512.4, 638.4)       # концы уличного фасада
X0, Z0 = -493.10, 612.25                         # середина уличного фасада
origin(X0, Z0)

# рамка уличного фасада: u — от P9 на северо-восток к площади, d — наружу, на улицу
FS, LEN = frame_from(P9, P8, (-505, 610))
F0 = Frame(FS.o, FS.u, FS.n)

GROUND = -3.0
Z1, Z2, EAVE = 3.9, 7.2, 10.5                    # перекрытия и низ карниза
RISE = 2.6

def edge(ua, da, ub, db):
    """Рамка стены по двум точкам плана (u, d) уличной рамки; наружу — вправо по ходу обхода."""
    a, b = F0.p(ua, da, 0), F0.p(ub, db, 0)
    t = (b - a).xy.normalized()
    n = Vector((t.y, -t.x))
    return Frame(a.xy, t, n), (b - a).length

# обход контура против часовой (в плане u, d): наружу всегда справа
LOG_U, LOG_D = 5.0, 4.0                          # угловая лоджия у площади
EDGES = [
    # (ua, da, ub, db, улица?, лоджия: срез верхних этажей с начала/конца)
    (0.0, 0.0, 65.0, 0.0, True, None),           # 8: на ул. Генерала Петрова
    (65.0, 0.0, 65.0, -11.7, True, None),        # 7: торец к площади
    (65.0, -11.7, 82.7, -11.7, True, 'end'),     # 6: северный корпус к улице
    (82.7, -11.7, 82.7, -25.9, True, 'start'),   # 5: северный торец к площади
    (82.7, -25.9, 54.7, -25.9, False, None),     # 4: двор
    (54.7, -25.9, 54.7, -15.5, False, None),     # 3
    (54.7, -15.5, 15.9, -15.5, False, None),     # 2: двор
    (15.9, -15.5, 15.9, -26.7, False, None),     # 1
    (15.9, -26.7, 0.0, -26.7, False, None),      # 0: двор
    (0.0, -26.7, 0.0, 0.0, False, None),         # 9: южный торец
]

def flat(m, F, u0, u1, d, z0, z1, top=True):
    """Накладка на стену: лицевая грань (и верхняя полка) без боков — экономия треугольников."""
    face(m, [F.p(u0, d, z0), F.p(u1, d, z0), F.p(u1, d, z1), F.p(u0, d, z1)], F.N())
    if top:
        face(m, [F.p(u0, 0, z1), F.p(u1, 0, z1), F.p(u1, d, z1), F.p(u0, d, z1)], UP)

def win(F, cu, za, w, h, street, mull=True):
    """Окно: откосы, стекло в глубине, импост крестом, подоконник; на улицу — наличник."""
    g = -0.20
    face('glass', [F.p(cu - w / 2, g, za), F.p(cu + w / 2, g, za), F.p(cu + w / 2, g, za + h), F.p(cu - w / 2, g, za + h)], F.N())
    if mull:
        flat('trim', F, cu - 0.04, cu + 0.04, g + 0.04, za, za + h, top=False)
        flat('trim', F, cu - w / 2, cu + w / 2, g + 0.04, za + h * 0.7 - 0.04, za + h * 0.7 + 0.04, top=False)
    flat('trim', F, cu - w / 2 - 0.08, cu + w / 2 + 0.08, 0.10, za - 0.12, za)
    if street:
        flat('trim', F, cu - w / 2 - 0.14, cu - w / 2, 0.04, za, za + h + 0.14, top=False)
        flat('trim', F, cu + w / 2, cu + w / 2 + 0.14, 0.04, za, za + h + 0.14, top=False)
        flat('trim', F, cu - w / 2 - 0.22, cu + w / 2 + 0.22, 0.10, za + h + 0.14, za + h + 0.30)
    return (cu - w / 2, cu + w / 2, za, za + h)

def balcony(F, cu, z, w=2.0, dep=0.8):
    """Балкончик второго этажа: плита на консолях и чугунная решётка."""
    box('stone', F, cu - w / 2, cu + w / 2, 0, dep, z - 0.16, z)
    for s in (-0.6, 0.6):
        box('trim', F, cu + s * w / 2 - 0.1, cu + s * w / 2 + 0.1, 0, dep - 0.1, z - 0.5, z - 0.16)
    a, b, c = F.p(cu - w / 2 + 0.04, dep - 0.04, z), F.p(cu + w / 2 - 0.04, dep - 0.04, z), None
    beam('metal', a + UP * 0.95, b + UP * 0.95, 0.05)
    beam('metal', a + UP * 0.1, b + UP * 0.1, 0.03)
    for s in (-1, 1):
        q = F.p(cu + s * (w / 2 - 0.04), 0.02, z)
        beam('metal', q + UP * 0.95, F.p(cu + s * (w / 2 - 0.04), dep - 0.04, z + 0.95), 0.04)
    for k in range(7):
        q = a + (b - a) * (k / 6)
        beam('metal', q, q + UP * 0.95, 0.025)

def rust(F, u0, u1, z0, z1, holes):
    """Швы облицовки первого этажа (блоки ~50 × 25 см — швы через два ряда)."""
    z = z0 + 0.5
    while z < z1 - 0.1:
        segs = [(u0, u1)]
        for ha, hb, hz0, hz1 in holes:
            if hz0 - 0.15 < z < hz1 + 0.3:
                nxt = []
                for a, b in segs:
                    if hb <= a or ha >= b: nxt.append((a, b)); continue
                    if ha - 0.22 > a: nxt.append((a, ha - 0.22))
                    if hb + 0.22 < b: nxt.append((hb + 0.22, b))
                segs = nxt
        for a, b in segs:
            face('wall2', [F.p(a, 0.012, z), F.p(b, 0.012, z), F.p(b, 0.012, z + 0.04), F.p(a, 0.012, z + 0.04)], F.N())
        z += 0.5

def facade(F, L, street, cut):
    """Стена одного ребра: первый этаж (на улицу — витрины), два жилых этажа, пояс, карниз."""
    n = max(1, round(L / 3.3))
    step = L / n
    lu0, lu1 = 0.0, L                            # где идут верхние этажи (лоджия срезает угол)
    if cut == 'end': lu1 = L - LOG_U
    if cut == 'start': lu0 = LOG_D
    h1, hu = [], []
    for i in range(n):
        cu = step * (i + 0.5)
        if street:
            sw = min(2.3, step - 0.9)
            h1.append(win(F, cu, 0.45, sw, 2.85, True, mull=False))
            box('trim', F, cu - sw / 2, cu + sw / 2, -0.2, -0.12, 2.55, 2.63)   # фрамуга витрины
        else:
            h1.append(win(F, cu, 1.15, 1.25, 1.9, False, mull=False))
        if not (lu0 + 0.9 < cu < lu1 - 0.9):
            continue
        balc = street and L > 30 and i % 3 == 1
        if balc:
            hu.append(win(F, cu, Z1 + 0.35, 1.2, 2.55, True))
            balcony(F, cu, Z1 + 0.35)
        else:
            hu.append(win(F, cu, Z1 + 0.95, 1.3, 1.95, street, mull=street))
        hu.append(win(F, cu, Z2 + 0.9, 1.3, 1.85, street, mull=street))
    wall(F, 0, L, GROUND, Z1, 0, h1, m='wall3')
    if street:
        rust(F, 0, L, 0.0, Z1 - 0.3, h1)
    box('stone', F, -0.05, L + 0.05, -0.1, 0.12, GROUND, 0.4)               # цоколь
    band(F, 0, L, 0, Z1, Z1 + 0.25, 0.14)                                    # пояс над первым этажом
    wall(F, lu0, lu1, Z1 + 0.25, EAVE, 0, hu)
    band(F, lu0, lu1, 0, Z2 - 0.05, Z2 + 0.07, 0.05)
    cornice(F, lu0 if cut != 'start' else lu0 - 0.5, lu1 if cut != 'end' else lu1 + 0.5, 0, EAVE, ext=0.45)

for ua, da, ub, db, street, cut in EDGES:
    Fe, L = edge(ua, da, ub, db)
    facade(Fe, L, street, cut)

# ---- угловая лоджия на колоннах у площади (2-й и 3-й этажи)
def loggia():
    cu1, cd1 = 82.7, -11.7                        # угол P6 в уличной рамке
    a0, d0 = cu1 - LOG_U, cd1 - LOG_D
    Fi, L = edge(a0, d0, cu1, d0)                 # задняя стенка вдоль улицы
    holes = [win(Fi, L / 2, Z1 + 0.35, 1.3, 2.55, False), win(Fi, L / 2, Z2 + 0.3, 1.3, 2.45, False)]
    wall(Fi, 0, L, Z1 + 0.25, EAVE, 0, holes)
    Fi, L = edge(a0, cd1, a0, d0)                 # боковая стенка
    holes = [win(Fi, L / 2, Z1 + 0.35, 1.2, 2.55, False), win(Fi, L / 2, Z2 + 0.3, 1.2, 2.45, False)]
    wall(Fi, 0, L, Z1 + 0.25, EAVE, 0, holes)
    for z in (Z1 + 0.25, Z2 + 0.0):               # плиты и балюстрады
        box('stone', F0, a0, cu1, d0, cd1, z - 0.2, z)
        rail = [(a0 + 0.15, cd1 - 0.15), (cu1 - 0.15, cd1 - 0.15), (cu1 - 0.15, d0 + 0.15)]
        for (pa, qa), (pb, qb) in zip(rail, rail[1:]):
            A, B = F0.p(pa, qa, z), F0.p(pb, qb, z)
            beam('trim', A + UP * 0.95, B + UP * 0.95, 0.24, 0.12)
            beam('trim', A + UP * 0.06, B + UP * 0.06, 0.26, 0.12)
            m = max(2, round((B - A).length / 0.36))
            for k in range(1, m):                 # балясины — квадратные столбики
                q = A + (B - A) * (k / m)
                beam('trim', q + UP * 0.12, q + UP * 0.89, 0.11)
    cols = [(a0 + 0.3, cd1 - 0.3), (cu1 - 2.3, cd1 - 0.3), (cu1 - 0.3, cd1 - 0.3), (cu1 - 0.3, d0 + 2.0), (cu1 - 0.3, d0 + 0.3)]
    for z0, z1 in ((Z1 + 0.25, Z2 - 0.2), (Z2, EAVE)):
        H = z1 - z0
        for u, d in cols:
            base = F0.p(u, d, z0)
            prof = [(0.2, 0), (0.2, 0.12), (0.16, 0.18), (0.135, H - 0.3), (0.2, H - 0.12), (0.22, H)]
            lathe('trim_s', base, prof, 8)
    box('trim', F0, a0 - 0.1, cu1 + 0.05, d0 - 0.1, cd1 + 0.05, EAVE - 0.3, EAVE)   # архитрав над лоджией
    box('trim', F0, a0, cu1 + 0.45, d0, cd1 + 0.45, EAVE, EAVE + 0.6)              # карниз над ней
loggia()

# ---- вальмовые кровли: уличный корпус, южное крыло, северный корпус
hip_roof(F0, 0.0, 65.0, 0.0, -15.5, EAVE + 0.6, RISE, ov=0.5)
Fb = Frame(F0.p(0.0, -15.5, 0).xy, -F0.n, F0.u)             # крыло: u — во двор, наружу — на ЮЗ… переворот ниже
hip_roof(Fb, -7.0, 11.2, 15.9, 0.0, EAVE + 0.6, RISE, ov=0.5, hip0=False)
hip_roof(F0, 54.7, 82.7, -11.7, -25.9, EAVE + 0.6, RISE * 0.92, ov=0.5)

zr = lambda d: EAVE + 0.6 + RISE * (0.5 - d) / (15.5 / 2 + 0.5)   # высота ската на глубине d (улица)
for cu in (10.5, 23.5, 41.5, 54.5):                                # слуховые окна на улицу
    dormer(F0, cu, -2.2, zr(-2.2) - 0.05, r=0.7, depth=2.6)
for cu, d in ((6.0, -9.0), (21.0, -8.5), (36.0, -9.0), (49.0, -8.5), (73.0, -19.0), (8.0, -21.0)):
    chimney(F0, cu, d, EAVE, EAVE + 0.6 + RISE + 0.6)

finish('gen_petrova2', __file__)
