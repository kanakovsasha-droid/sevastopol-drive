# Б. Морская, 8 — угловой дом с эркером-ротондой и восьмигранным фонарём
# (OSM w92718640, «Раки&эклеры», раньше «Единая Россия»). Модель с нуля.
#
#   blender -b --python models/w92718640/build.py -- [glb]
#   (или python3.13 с модулем bpy: python3.13 models/w92718640/build.py -- glb)
#
# План — контур OSM как есть (14 точек), фасады — по описанию refs/center-models.json
# (фото P9151248 и 17779240140, вид с востока). Что наугад — NOTES.md.
# Ноль высоты — тротуар у эркера (северо-восточный угол, точка P1 контура).
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

COL['wall'] = ((0.878, 0.839, 0.749), 0.9)     # #e0d6bf светло-бежевая штукатурка
COL['wall2'] = ((0.93, 0.92, 0.88), 0.85)      # гладкий белый первый этаж эркера
COL['stone'] = ((0.561, 0.541, 0.502), 0.9)    # #8f8a80 серо-кирпичный цоколь
COL['roof'] = ((0.48, 0.29, 0.23), 0.8)        # #7a4b3a ржаво-коричневая кровля
COL['wood'] = ((0.42, 0.20, 0.13), 0.7)        # красно-коричневые галереи двора
COL['metal'] = ((0.08, 0.08, 0.09), 0.5)       # кованые ворота, решётки

PTS = [(-383.6, 761.2), (-377.5, 760.2), (-371.9, 792.9), (-369.6, 806.6), (-371.4, 807.0),
       (-370.9, 810.5), (-401.6, 815.6), (-403.9, 802.4), (-384.7, 799.2), (-388.9, 774.7),
       (-395.8, 775.8), (-398.5, 760.0), (-384.2, 757.6)]
X0, Z0 = PTS[1]
origin(X0, Z0)

GROUND = -3.0
F1, F2 = 4.2, 7.8        # верх первого и второго этажа
EAVE = 11.2              # низ венчающего карниза
TOP = EAVE + 0.6         # плоская кровля
SEG = 12                 # грани ротонды

# обход контура: знак площади → наружная нормаль ребра
_B = [W(*p) for p in PTS]
_area = sum(_B[i].x * _B[(i + 1) % len(_B)].y - _B[(i + 1) % len(_B)].x * _B[i].y for i in range(len(_B)))

def edge(i):
    a, b = _B[i], _B[(i + 1) % len(_B)]
    u = (b - a).normalized()
    n = Vector((u.y, -u.x)) if _area > 0 else Vector((-u.y, u.x))
    return Frame(a, u, n), (b - a).length

def light_glazing(F, ua, ub, za, zb, d, transom=True, mull=True):
    """Стекло в глубине проёма, один импост и одна горбылька — без рамки по контуру."""
    g = d - 0.22
    face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
    if mull:
        cu = (ua + ub) / 2
        box('trim', F, cu - 0.04, cu + 0.04, g, g + 0.06, za, zb, bottom=False)
    if transom:
        z = za + (zb - za) * 0.7
        box('trim', F, ua, ub, g, g + 0.06, z - 0.04, z + 0.04, bottom=False)

def street_facade(F, u0, u1, bays, brackets=True):
    """Уличный фасад: витрины первого этажа, окна с наличниками, пояс, консольный карниз."""
    step = (u1 - u0) / bays
    holes, w2, w3 = [], [], []
    for i in range(bays):
        cu = u0 + step * (i + 0.5)
        holes.append((cu - 1.0, cu + 1.0, 0.55, 3.45))
        w2.append((cu - 0.7, cu + 0.7, F1 + 1.0, F1 + 3.2))
        w3.append((cu - 0.7, cu + 0.7, F2 + 0.9, F2 + 2.95))
    wall(F, u0, u1, 0.55, TOP, 0, holes + w2 + w3)
    box('stone', F, u0, u1, -0.3, 0.06, GROUND, 0.55, bottom=False)
    for h in holes:
        light_glazing(F, *h, 0, mull=False)
    for h in w2:
        surround(F, *h, 0)
        box('trim', F, h[0] - 0.3, h[1] + 0.3, 0, 0.2, h[3] + 0.16, h[3] + 0.3, bottom=False)   # сандрик-полка
        light_glazing(F, *h, 0)
    for h in w3:
        box('trim', F, h[0] - 0.2, h[1] + 0.2, 0, 0.12, h[2] - 0.12, h[2], bottom=False)        # подоконник
        light_glazing(F, *h, 0, transom=False)
    band(F, u0, u1, 0, F1 - 0.05, F1 + 0.25, 0.14)          # пояс над первым этажом
    band(F, u0, u1, 0, F2 + 0.55, F2 + 0.7, 0.07)           # подоконный пояс третьего
    cornice(F, u0, u1, 0, EAVE - 0.6, ext=0.45)
    if brackets:                                            # консоли под карнизом
        k = u0 + 0.45
        while k < u1 - 0.3:
            box('trim', F, k - 0.09, k + 0.09, 0, 0.42, EAVE - 0.95, EAVE - 0.6, bottom=False)
            k += 1.2
    rail(F, u0, u1, -0.25)

def yard_facade(F, u0, u1, bays):
    """Дворовый фасад: окна в три ряда без наличников и откосов, тонкий карниз."""
    step = (u1 - u0) / bays
    holes = []
    for i in range(bays):
        cu = u0 + step * (i + 0.5)
        for za, h in ((1.0, 2.0), (F1 + 0.9, 2.0), (F2 + 0.9, 1.9)):
            holes.append((cu - 0.6, cu + 0.6, za, za + h))
    wall(F, u0, u1, GROUND, TOP, 0, [])
    for ua, ub, za, zb in holes:                             # двор виден издали: стекло заподлицо
        face('glass', [F.p(ua, 0.03, za), F.p(ub, 0.03, za), F.p(ub, 0.03, zb), F.p(ua, 0.03, zb)], F.N())
    band(F, u0 - 0.2, u1 + 0.2, 0, EAVE - 0.1, EAVE + 0.15, 0.25)

def plain_facade(F, u0, u1, street=True):
    wall(F, u0, u1, GROUND, TOP, 0, [])
    if street:
        box('stone', F, u0, u1, -0.3, 0.06, GROUND, 0.55, bottom=False)
        band(F, u0, u1, 0, F1 - 0.05, F1 + 0.25, 0.14)
        cornice(F, u0, u1, 0, EAVE - 0.6, ext=0.45)
    else:
        band(F, u0 - 0.2, u1 + 0.2, 0, EAVE - 0.1, EAVE + 0.15, 0.25)

def rail(F, u0, u1, d, z=TOP, h=0.9):
    """Ограждение по парапету плоской кровли."""
    beam('metal', F.p(u0, d, z + h), F.p(u1, d, z + h), 0.05)
    n = max(1, round((u1 - u0) / 3.0))
    for i in range(n + 1):
        u = u0 + (u1 - u0) * i / n
        beam('metal', F.p(u, d, z), F.p(u, d, z + h), 0.04)

# ================================================================== КОРПУС
C_U, C_D, R = 2.2, -1.4, 3.4      # ось эркера в рамке восточного фасада и радиус

def build_main():
    FE, LE = edge(1)
    street_facade(FE, C_U + R - 0.2, LE, 8)
    F, L = edge(2); street_facade(F, 0, L, 4)
    F, L = edge(3); plain_facade(F, 0, L)
    F, L = edge(4); plain_facade(F, 0, L)
    F, L = edge(5); street_facade(F, 0, L, 9)                 # на ул. Лумумбы — ритм наугад
    F, L = edge(6); yard_facade(F, 0, L, 4)                   # к соседу на запад
    F, L = edge(7); yard_facade(F, 0, L, 6)
    F, L = edge(8); yard_facade(F, 0, L, 7); gallery(F, L)    # галереи во дворе
    F, L = edge(9); yard_facade(F, 0, L, 2)
    F, L = edge(10); yard_facade(F, 0, L, 5)
    F, L = edge(11); yard_facade(F, 0, L, 4)                  # к проезду у дома №6
    F, L = edge(12); risalit(F, L)
    F, L = edge(0); plain_facade(F, 0, L - 3.0)               # короткий торец у эркера
    # плоская кровля и парапет
    face('stone', [Vector((p.x, p.y, TOP)) for p in _B], UP)

def gallery(F, L):
    """Деревянные галереи во двор на втором и третьем этажах."""
    for z in (F1, F2):
        box('stone', F, 0.3, L - 0.3, 0, 1.3, z - 0.15, z, bottom=True)
        beam('wood', F.p(0.3, 1.25, z + 1.0), F.p(L - 0.3, 1.25, z + 1.0), 0.08, 0.1)
        beam('wood', F.p(0.3, 1.25, z + 0.15), F.p(L - 0.3, 1.25, z + 0.15), 0.06)
        n = round((L - 0.6) / 0.7)
        for i in range(n + 1):
            u = 0.3 + (L - 0.6) * i / n
            box('wood', F, u - 0.05, u + 0.05, 1.2, 1.3, z, z + 1.0, bottom=False)
        for i in range(0, n + 1, 4):                          # стойки до следующего яруса
            u = 0.3 + (L - 0.6) * i / n
            box('wood', F, u - 0.07, u + 0.07, 1.16, 1.3, z, z + 3.45, bottom=False)

def risalit(F, L):
    """Ризалит у проезда: две гладкие ионические колонны во втором этаже, над калиткой."""
    wall(F, 0, L, GROUND, TOP, 0, [(1.1, L - 1.1, F2 + 0.9, F2 + 2.9)])
    light_glazing(F, 1.1, L - 1.1, F2 + 0.9, F2 + 2.9, 0)
    box('stone', F, 0, L, -0.3, 0.06, GROUND, 0.55, bottom=False)
    band(F, -0.2, L + 0.2, 0, F1 - 0.05, F1 + 0.3, 0.3)       # пьедестальный пояс
    for cu in (0.55, L - 0.55):
        base = F.p(cu, 0.28, F1 + 0.3)
        H = F2 - F1 - 0.8
        prof = [(0.3, 0), (0.3, 0.14), (0.24, 0.2)]
        prof += [(0.225 - 0.03 * (k / 4) ** 1.6, 0.2 + (H - 0.55) * k / 4) for k in range(1, 5)]
        prof += [(0.24, H - 0.3), (0.25, H - 0.25)]
        lathe('trim_s', base, prof, 10)
        z = F1 + 0.3 + H - 0.25                               # ионическая капитель: эхин и волюты
        box('trim', F, cu - 0.34, cu + 0.34, 0.0, 0.58, z, z + 0.14, bottom=True)
        for s in (-1, 1):
            box('trim', F, cu + s * 0.3 - 0.07, cu + s * 0.3 + 0.07, 0.0, 0.56, z - 0.16, z + 0.12, bottom=False)
        box('trim', F, cu - 0.32, cu + 0.32, 0.0, 0.6, z + 0.14, z + 0.22, bottom=True)
    band(F, -0.2, L + 0.2, 0, F2 - 0.5, F2 + 0.05, 0.62)      # антаблемент над колоннами
    band(F, -0.2, L + 0.2, 0, F2 + 0.4, F2 + 0.55, 0.07)
    cornice(F, 0, L, 0, EAVE - 0.6, ext=0.45)
    # проход в первом этаже под колоннами — тёмная ниша, кованые ворота в проезде к дому №6
    face('glass', [F.p(0.4, 0.02, 0), F.p(L - 0.4, 0.02, 0), F.p(L - 0.4, 0.02, 2.9), F.p(0.4, 0.02, 2.9)], F.N())
    gate((-386.7, 751.9), (-384.3, 757.4))

def gate(a, b, h=2.7):
    """Кованые ворота между домами №6 и №8 (поставлены по линии проезда наугад)."""
    A, B = W(*a), W(*b)
    pa, pb = Vector((A.x, A.y, 0)), Vector((B.x, B.y, 0))
    for p in (pa, pb):
        beam('metal', p, p + UP * (h + 0.3), 0.22)
    beam('metal', pa + UP * 0.15, pb + UP * 0.15, 0.06)
    beam('metal', pa + UP * (h - 0.1), pb + UP * (h - 0.1), 0.06)
    beam('metal', pa + UP * (h * 0.55), pb + UP * (h * 0.55), 0.04)
    L = (B - A).length
    n = int(L / 0.22)
    for i in range(1, n):
        p = pa + (pb - pa) * (i / n)
        beam('metal', p + UP * 0.1, p + UP * (h + (0.18 if i % 2 else 0.05)), 0.025)

# ================================================================== ЭРКЕР-РОТОНДА
FE0 = edge(1)[0]
C = FE0.p(C_U, C_D, 0).xy
A0 = math.atan2(FE0.n.y, FE0.n.x)          # середины граней на 0°, 30°, 60°… от востока к северу
DIAG = A0 + math.pi / 4                    # биссектриса угла дома

def rp(r, a, z):
    return Vector((C.x + r * math.cos(a), C.y + r * math.sin(a), z))

def ang(k, N=SEG, a0=None):
    return (A0 - math.pi / N if a0 is None else a0) + 2 * math.pi * k / N

def ring(m, r, z0, z1, N=SEG, a0=None, ks=None):
    for k in (ks if ks is not None else range(N)):
        t0, t1 = ang(k, N, a0), ang(k + 1, N, a0)
        q = [rp(r, t0, z0), rp(r, t1, z0), rp(r, t1, z1), rp(r, t0, z1)]
        mid = (t0 + t1) / 2
        face(m, q, Vector((math.cos(mid), math.sin(mid), 0)))

def disc(m, r, z, up=True, N=SEG, a0=None):
    face(m, [rp(r, ang(k, N, a0), z) for k in range(N)], UP if up else -UP)

def frustum(m, r0, z0, r1, z1, N=SEG, a0=None):
    for k in range(N):
        t0, t1 = ang(k, N, a0), ang(k + 1, N, a0)
        q = [rp(r0, t0, z0), rp(r0, t1, z0), rp(r1, t1, z1), rp(r1, t0, z1)]
        mid = (t0 + t1) / 2
        face(m, q, Vector((math.cos(mid), math.sin(mid), 0.8)))

def seg_frame(k, r, N=SEG, a0=None):
    """Рамка грани k многогранника: начало — середина грани."""
    mid = (ang(k, N, a0) + ang(k + 1, N, a0)) / 2
    ap = r * math.cos(math.pi / N)
    n = Vector((math.cos(mid), math.sin(mid)))
    return Frame(C + n * ap, Vector((-n.y, n.x)), n), 2 * r * math.sin(math.pi / N)

def arch_win(F, w, sill, spring, d=0.0, grille=True, nseg=8):
    r = w / 2
    arc = [(r * math.cos(math.pi * k / nseg), spring + r * math.sin(math.pi * k / nseg)) for k in range(nseg + 1)]
    face('glass', [F.p(-r, d + 0.03, sill), F.p(r, d + 0.03, sill)] + [F.p(u, d + 0.03, z) for u, z in arc], F.N())
    ro = r + 0.15
    for k in range(nseg):                                   # клинчатое обрамление
        (ua, za), (ub, zb) = arc[k], arc[k + 1]
        oa = (ro * math.cos(math.pi * k / nseg), spring + ro * math.sin(math.pi * k / nseg))
        ob = (ro * math.cos(math.pi * (k + 1) / nseg), spring + ro * math.sin(math.pi * (k + 1) / nseg))
        face('trim', [F.p(ua, d + 0.07, za), F.p(ub, d + 0.07, zb), F.p(ob[0], d + 0.07, ob[1]), F.p(oa[0], d + 0.07, oa[1])], F.N())
    box('trim', F, -0.1, 0.1, d, d + 0.12, spring + r - 0.05, spring + ro + 0.12, bottom=False)   # замковый камень
    for s in (-1, 1):
        box('trim', F, s * r - (0.15 if s < 0 else 0), s * r + (0.15 if s > 0 else 0), d, d + 0.07, sill, spring, bottom=False)
    box('trim', F, -r - 0.22, r + 0.22, d, d + 0.16, sill - 0.12, sill, bottom=False)
    if grille:                                              # затейливая решётка — упрощённо
        for u in (-r / 2, 0, r / 2):
            top = spring + math.sqrt(max(0, r * r - u * u)) - 0.04
            beam('metal', F.p(u, d + 0.06, sill), F.p(u, d + 0.06, top), 0.03)
        for z in (sill + (spring - sill) * 0.45, spring):
            beam('metal', F.p(-r, d + 0.06, z), F.p(r, d + 0.06, z), 0.03)

def build_rotunda():
    VIS = [k for k in range(SEG) if math.cos((ang(k) + ang(k + 1)) / 2 - DIAG) > -0.35]
    # цоколь и первый этаж: белые простенки, сплошные витрины
    ring('stone', R + 0.05, GROUND, 0.4)
    ring('glass', R - 0.25, 0.4, 3.45)
    ring('wall2', R, 3.45, F1)
    for k in VIS:
        t = ang(k)
        F = Frame(rp(R, t, 0).xy, Vector((-math.sin(t), math.cos(t))), Vector((math.cos(t), math.sin(t))))
        box('wall2', F, -0.22, 0.22, -0.3, 0.02, 0.4, 3.45, bottom=False)
    frustum('metal', R + 0.9, 3.5, R, 3.75)                  # козырёк над витринами
    ring('trim', R + 0.9, 3.42, 3.5)
    # второй этаж: два арочных окна с решётками и балюстрада под ними
    ring('wall', R, F1, F2)
    ring('trim', R + 0.12, F1 - 0.05, F1 + 0.22)
    ks = [k for k in VIS if abs(math.cos((ang(k) + ang(k + 1)) / 2 - DIAG)) > 0.5]
    wins = sorted(ks, key=lambda k: -math.cos((ang(k) + ang(k + 1)) / 2 - DIAG))[:2]
    for k in wins:
        F, Lk = seg_frame(k, R)
        arch_win(F, 1.36, F1 + 0.35, F1 + 2.5)
    # балкон с точёными балясинами по дуге над двумя окнами
    ka, kb = min(wins), max(wins)
    t0, t1 = ang(ka) - 0.08, ang(kb + 1) + 0.08
    rb = R + 0.75
    n = 10
    for i in range(n):
        a, b = t0 + (t1 - t0) * i / n, t0 + (t1 - t0) * (i + 1) / n
        q = [rp(R - 0.1, a, F1 + 0.2), rp(R - 0.1, b, F1 + 0.2), rp(rb, b, F1 + 0.2), rp(rb, a, F1 + 0.2)]
        face('trim', q, UP)
        face('trim', [rp(rb, a, F1), rp(rb, b, F1), rp(rb, b, F1 + 0.2), rp(rb, a, F1 + 0.2)],
             Vector((math.cos((a + b) / 2), math.sin((a + b) / 2), 0)))
        beam('trim', rp(rb - 0.06, a, F1 + 1.15), rp(rb - 0.06, b, F1 + 1.15), 0.16, 0.1)
    m = int((t1 - t0) * rb / 0.24)
    for i in range(m + 1):
        t = t0 + (t1 - t0) * i / m
        lathe('trim_s', rp(rb - 0.08, t, F1 + 0.2), [(0.05, 0), (0.07, 0.25), (0.035, 0.5), (0.05, 0.9)], 4, cap=False)
    # консоли под балконом
    for t in (t0 + 0.05, (t0 + t1) / 2, t1 - 0.05):
        beam('trim', rp(R - 0.1, t, F1 - 0.5), rp(rb - 0.1, t, F1 + 0.05), 0.18, 0.2)
    # третий этаж: лоджия с ленточным остеклением в белых рамах
    ring('wall', R, F2, F2 + 0.95)
    ring('glass', R - 0.12, F2 + 0.95, EAVE - 0.6)
    ring('wall', R, EAVE - 0.6, EAVE)
    for k in VIS:
        t = ang(k)
        beam('trim', rp(R - 0.08, t, F2 + 0.95), rp(R - 0.08, t, EAVE - 0.6), 0.12)
        beam('trim', rp(R - 0.08, t, F2 + 0.95), rp(R - 0.08, ang(k + 1), F2 + 0.95), 0.1)
    ring('trim', R + 0.12, F2 + 0.55, F2 + 0.7)
    # карниз эркера
    ring('trim', R + 0.15, EAVE, EAVE + 0.22)
    ring('trim', R + 0.45, EAVE + 0.22, EAVE + 0.6)
    disc('trim', R + 0.45, EAVE + 0.22, up=False)
    # мансарда: остеклённая лоджия, наклонный козырёк
    MZ = EAVE + 0.6
    disc('stone', R + 0.45, MZ)
    ring('glass', R - 0.45, MZ, MZ + 2.1)
    for k in VIS:
        t = ang(k)
        beam('trim', rp(R - 0.4, t, MZ), rp(R - 0.4, t, MZ + 2.1), 0.1)
        beam('trim', rp(R - 0.4, t, MZ + 0.9), rp(R - 0.4, ang(k + 1), MZ + 0.9), 0.08)
    frustum('roof', R + 0.35, MZ + 2.0, 2.1, MZ + 2.75)
    disc('trim', R + 0.35, MZ + 2.0, up=False)
    # восьмигранный фонарь-барабан: три арочных окна наружу, низкая вальмовая кровля
    DZ = MZ + 2.75
    rd, N8 = 1.95, 8
    a8 = DIAG - math.pi / N8                  # грань фонаря смотрит на угол
    ring('wall', rd, DZ - 0.3, DZ + 1.75, N8, a8)
    ring('trim', rd + 0.1, DZ + 1.75, DZ + 2.0, N8, a8)
    lw = [k for k in range(N8) if math.cos((ang(k, N8, a8) + ang(k + 1, N8, a8)) / 2 - DIAG) > 0.5]
    for k in lw:
        F, Lk = seg_frame(k, rd, N8, a8)
        arch_win(F, 0.7, DZ + 0.3, DZ + 1.15, grille=False, nseg=6)
    frustum('roof', rd + 0.35, DZ + 2.0, 0.15, DZ + 2.85, N8, a8)
    disc('trim', rd + 0.35, DZ + 2.0, up=False, N=N8, a0=a8)
    lathe('metal', rp(0, 0, DZ + 2.8), [(0.08, 0), (0.08, 0.3), (0.12, 0.42), (0.02, 0.9)], 6)

build_main()
build_rotunda()

finish('w92718640', __file__)
