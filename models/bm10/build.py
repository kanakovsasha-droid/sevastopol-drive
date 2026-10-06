# Большая Морская, 10 — угловой дом с фронтоном и лоджией на колонках (угол ул. Лумумбы).
#
#   blender -b --python models/bm10/build.py -- [glb]
#   (или без Blender: python3.11 с модулем bpy — models/bm10/build.py -- glb)
#
# План — контур OSM w90821982: он ложится на прямоугольную сетку с точностью
# ±0.1 м. Местная система FE: u — вдоль Б. Морской на юг от северо-восточного
# угла, d — наружу на восток (внутрь дома d < 0):
#   восточный корпус  u 0…38.2,  d −12.8…0   (фасад на Б. Морскую, ребро 9);
#   западное крыло    u 0…11.9,  d −27…−12.8 (вместе с ним северный фасад на
#                     ул. Лумумбы, 26.9 м, ребро 8);
#   южная пристройка  u 38.2…59.3, d −12…+1.3 (тот же контур OSM, на фото не видна).
# Фасады — по описанию в refs/center-models.json (фото Викисклада); что сделано
# наугад — NOTES.md. Ноль высоты — тротуар у северо-восточного угла.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

X0, Z0 = -368.1, 828.6           # северо-восточный угол (вершина 9 контура)
origin(X0, Z0)

COL['wall'] = ((0.89, 0.86, 0.78), 0.9)     # светло-бежевая штукатурка #e3dcc6
COL['wall2'] = ((0.90, 0.82, 0.56), 0.85)   # жёлто-кремовый карниз-козырёк над магазинами
COL['wall3'] = ((0.17, 0.13, 0.11), 0.6)    # кофейно-чёрные панели первого этажа
COL['stone'] = ((0.20, 0.26, 0.23), 0.7)    # тёмно-зелёный камень простенков
COL['roof'] = ((0.43, 0.35, 0.31), 0.6)     # тёмная жесть #6d5a4f

FE, _ = frame_from((X0, Z0), (-360.8, 866.1), (-375.0, 850.0))

def fr(u, d, du, dd, nu, nd):
    """Рамка в местной системе FE: точка (u, d), направление вдоль, наружу."""
    o = FE.p(u, d, 0).xy
    return Frame(o, FE.u * du + FE.n * dd, FE.u * nu + FE.n * nd)

GROUND = -3.0
G1 = 4.2            # верх первого (торгового) этажа
F2, F3 = 4.4, 7.9   # полы второго и третьего этажей
COR = 11.4          # низ венчающего карниза
EAVE = 12.0         # верх карниза
PED = 3.0           # высота фронтона
L_E, D_E = 38.2, 12.8      # восточный корпус
L_N, D_W = 26.9, 11.87     # северный фасад, глубина западного крыла

# ------------------------------------------------------------------ примитивы
def plate(m, F, u0, u1, d, z0, z1):
    """Плоская планка лицом наружу: импосты и прутья, видные только спереди."""
    face(m, [F.p(u0, d, z0), F.p(u1, d, z0), F.p(u1, d, z1), F.p(u0, d, z1)], F.N())

def bar(m, a, b, w, nrm):
    """Плоский пруток между точками a и b, повёрнутый лицом к nrm."""
    ax = (b - a).normalized(); s = ax.cross(nrm).normalized() * (w / 2)
    face(m, [a - s, a + s, b + s, b - s], nrm)

def win_light(F, cu, za, w, h, d, kind='plain'):
    """Лёгкое окно: стекло в глубине, импост, наличник и подоконник."""
    ua, ub, zb = cu - w / 2, cu + w / 2, za + h
    g = d - 0.2
    face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
    plate('trim', F, cu - 0.03, cu + 0.03, g + 0.02, za, zb)
    plate('trim', F, ua, ub, g + 0.02, za + h * 0.7 - 0.03, za + h * 0.7 + 0.03)
    if kind == 'plain':
        plate('trim', F, ua - 0.14, ua, d + 0.04, za, zb + 0.14)        # наличник — плоский
        plate('trim', F, ub, ub + 0.14, d + 0.04, za, zb + 0.14)
        plate('trim', F, ua, ub, d + 0.04, zb, zb + 0.14)
        box('trim', F, ua - 0.24, ub + 0.24, d, d + 0.18, zb + 0.14, zb + 0.24, bottom=False)   # сандрик-полка
    box('trim', F, ua - 0.2, ub + 0.2, d, d + 0.14, za - 0.1, za)
    return (ua, ub, za, zb)

def arch_hole(F, cu, za, r, zs):
    """Прямоугольник проёма под арочное окно: дуга дорисуется arch_fill."""
    return (cu - r, cu + r, za, zs + r)

def arch_fill(F, cu, za, r, zs, d, seg=8, door=False):
    """Арочное окно: углы над дугой, откосы по дуге, архивольт, стекло."""
    arc = [(cu + r * math.cos(math.pi * k / seg), zs + r * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
    hs = seg // 2
    face('wall', [F.p(cu + r, d, zs + r)] + [F.p(u, d, z) for u, z in arc[:hs + 1]], F.N())
    face('wall', [F.p(cu - r, d, zs + r)] + [F.p(u, d, z) for u, z in arc[hs:]], F.N())
    gd = d - 0.2
    ro = r + 0.16
    for k in range(seg):
        (ua, za_), (ub, zb_) = arc[k], arc[k + 1]
        c = F.p(cu, d, zs)
        face('trim', [F.p(ua, d, za_), F.p(ub, d, zb_), F.p(ub, gd, zb_), F.p(ua, gd, za_)],
             c - F.p((ua + ub) / 2, d, (za_ + zb_) / 2))
        oa = (cu + ro * math.cos(math.pi * k / seg), zs + ro * math.sin(math.pi * k / seg))
        ob = (cu + ro * math.cos(math.pi * (k + 1) / seg), zs + ro * math.sin(math.pi * (k + 1) / seg))
        face('trim', [F.p(ua, d + 0.05, za_), F.p(ub, d + 0.05, zb_), F.p(ob[0], d + 0.05, ob[1]),
                      F.p(oa[0], d + 0.05, oa[1])], F.N())
    box('trim', F, cu - 0.12, cu + 0.12, d, d + 0.1, zs + r - 0.05, zs + r + 0.3)       # замок
    plate('trim', F, cu - r - 0.16, cu - r, d + 0.05, za, zs)
    plate('trim', F, cu + r, cu + r + 0.16, d + 0.05, za, zs)
    if not door:
        box('trim', F, cu - r - 0.24, cu + r + 0.24, d, d + 0.14, za - 0.1, za)
    face('glass' if not door else 'wood', [F.p(cu - r, gd, za), F.p(cu + r, gd, za)] + [F.p(u, gd, z) for u, z in arc], F.N())
    plate('trim', F, cu - 0.03, cu + 0.03, gd + 0.02, za, zs + r)
    plate('trim', F, cu - r, cu + r, gd + 0.02, zs - 0.03, zs + 0.03)

def rail(F, u0, u1, d, z, h=0.95, step=0.13, m='metal'):
    """Кованая решётка: поручень, нижняя тяга, частые прутья."""
    beam(m, F.p(u0, d, z + h), F.p(u1, d, z + h), 0.05)
    beam(m, F.p(u0, d, z + 0.1), F.p(u1, d, z + 0.1), 0.03)
    n = max(2, round((u1 - u0) / step))
    for i in range(n + 1):
        u = u0 + (u1 - u0) * i / n
        bar(m, F.p(u, d, z + 0.1), F.p(u, d, z + h), 0.025, F.N())

def rail_path(pts, z, h=0.95, step=0.13, m='metal'):
    """Решётка по ломаной в плане (точки Blender xy)."""
    for a, b in zip(pts, pts[1:]):
        A, B = Vector((a.x, a.y, z)), Vector((b.x, b.y, z))
        beam(m, A + UP * h, B + UP * h, 0.05)
        beam(m, A + UP * 0.1, B + UP * 0.1, 0.03)
        n = max(1, round((B - A).length / step))
        for i in range(n):
            q = A + (B - A) * (i / n)
            bar(m, q + UP * 0.1, q + UP * h, 0.025, (B - A).cross(UP))
    q = Vector((pts[-1].x, pts[-1].y, z))
    bar(m, q + UP * 0.1, q + UP * h, 0.025, UP.cross(B - A))

def console(F, cu, d, z, out, h=0.55, w=0.22):
    """Лепная консоль под балконом: клин, сужающийся вниз."""
    Fc = Frame(F.p(cu + w / 2, d, 0).xy, F.n, F.u)      # u — наружу от стены, глубина — вдоль фасада
    prism_uz('trim', Fc, [(0, z), (out, z), (out * 0.3, z - h * 0.6), (0, z - h)], 0, w)

def dentils(F, u0, u1, d, z, step=0.55):
    u = u0 + step / 2
    while u < u1:
        a, b = u - 0.1, u + 0.1
        plate('trim', F, a, b, d + 0.22, z, z + 0.16)
        face('trim', [F.p(a, d, z), F.p(b, d, z), F.p(b, d + 0.22, z), F.p(a, d + 0.22, z)], -UP)
        face('trim', [F.p(a, d, z), F.p(a, d + 0.22, z), F.p(a, d + 0.22, z + 0.16), F.p(a, d, z + 0.16)], -F.U())
        face('trim', [F.p(b, d, z), F.p(b, d + 0.22, z), F.p(b, d + 0.22, z + 0.16), F.p(b, d, z + 0.16)], F.U())
        u += step

def cornice_dent(F, u0, u1, d, z, ext=0.7):
    """Венчающий карниз с дентикулами, вынос ≈0.7 м; z — низ, верх z + 0.6."""
    band(F, u0 - 0.05, u1 + 0.05, d, z, z + 0.16, 0.08)
    dentils(F, u0, u1, d, z + 0.16)
    band(F, u0 - 0.3, u1 + 0.3, d, z + 0.32, z + 0.44, 0.3)
    band(F, u0 - ext, u1 + ext, d, z + 0.44, z + 0.6, ext)

def shopfront(F, ua, ub, d, door=None):
    """Витрина первого этажа: стекло на тёмной раме, над ним — тёмная панель вывески."""
    g = d - 0.25
    za, zb = 0.45, 3.0
    face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
    face('wall3', [F.p(ua, g, zb), F.p(ub, g, zb), F.p(ub, g, G1 - 0.25), F.p(ua, g, G1 - 0.25)], F.N())
    face('wall3', [F.p(ua, g, 0), F.p(ub, g, 0), F.p(ub, g, za), F.p(ua, g, za)], F.N())
    for u in (ua, ub):
        face('stone', [F.p(u, d, 0), F.p(u, g, 0), F.p(u, g, G1 - 0.25), F.p(u, d, G1 - 0.25)],
             F.U() if u == ua else -F.U())
    face('stone', [F.p(ua, d, G1 - 0.25), F.p(ub, d, G1 - 0.25), F.p(ub, g, G1 - 0.25), F.p(ua, g, G1 - 0.25)], -UP)
    box('wall3', F, ua, ub, g, g + 0.08, zb - 0.06, zb + 0.06, bottom=False)
    if door is not None:
        face('wood', [F.p(door - 0.6, g + 0.01, 0), F.p(door + 0.6, g + 0.01, 0),
                      F.p(door + 0.6, g + 0.01, 2.4), F.p(door - 0.6, g + 0.01, 2.4)], F.N())
        box('wall3', F, door - 0.66, door + 0.66, g, g + 0.08, 2.4, 2.5, bottom=False)

def ground_floor(F, u0, u1, d, shops, extra=()):
    """Первый этаж: тёмно-зелёные простенки, витрины; extra — другие проёмы (ua, ub, za, zb)."""
    holes = [(a, b, 0.0, G1 - 0.25) for a, b, _ in shops] + list(extra)
    wall(F, u0, u1, 0.0, G1, d, holes, m='stone', reveal=0.25, rm='stone')
    box('stone', F, u0, u1, d - 0.3, d, GROUND, 0.0)
    for a, b, door in shops:
        shopfront(F, a, b, d, door)
    for a, b, _ in shops:                                          # белые полосы-обрамления
        box('trim', F, a - 0.12, a, d, d + 0.06, 0, G1 - 0.25, bottom=False)
        box('trim', F, b, b + 0.12, d, d + 0.06, 0, G1 - 0.25, bottom=False)

def canopy(F, u0, u1, d):
    """Широкий жёлто-кремовый карниз-козырёк над торговым этажом."""
    box('wall2', F, u0, u1, d - 0.05, d + 0.55, G1 - 0.05, F2)
    box('wall2', F, u0, u1, d - 0.05, d + 0.15, G1 - 0.25, G1 - 0.05)

def upper_wall(F, u0, u1, d, holes, z1=COR):
    wall(F, u0, u1, F2, z1, d, holes)

# ------------------------------------------------------------------ восточный фасад (Б. Морская)
RC = 2.0            # скругление угла в первом этаже
def build_east():
    F = FE
    step = L_E / 10
    axes = [step * (i + 0.5) for i in range(10)]
    holes = []
    # второй этаж — арочные окна, третий — прямоугольные парами
    r2, za2, zs2 = 0.65, 5.2, 6.75
    for cu in axes:
        holes.append(arch_hole(F, cu, za2, r2, zs2))
        holes.append((cu - 0.6, cu + 0.6, 8.65, 10.75))
    upper_wall(F, 0, L_E, 0, holes)
    for cu in axes:
        arch_fill(F, cu, za2, r2, zs2, 0)
        win_light(F, cu, 8.65, 1.2, 2.1, 0)
    band(F, 0, L_E, 0, F3 + 0.05, F3 + 0.25, 0.1)                 # междуэтажный пояс
    cornice_dent(F, 0, L_E, 0, COR)
    # первый этаж: пять витрин по две оси, у угла — скругление
    shops = []
    for k in range(5):
        a, b = step * 2 * k + 0.55, step * 2 * (k + 1) - 0.55
        if k == 0: a = RC + 0.5
        shops.append((a, b, (a + b) / 2 if k in (1, 3) else None))
    ground_floor(F, RC, L_E, 0, shops)
    canopy(F, 0, L_E, 0)

# ------------------------------------------------------------------ северный фасад (ул. Лумумбы)
FN = fr(0, 0, 0, -1, -1, 0)          # u — на запад от угла, наружу — на север
PC = D_E / 2                          # ось фронтона: торец восточного корпуса
def build_north():
    F = FN
    holes = []
    # под фронтоном: лоджия на 3 этаже, по бокам арочные окна; на 2 этаже — балкон-корзина
    LG0, LG1 = PC - 2.0, PC + 2.0
    holes.append((LG0, LG1, F3, COR - 0.35))
    r3, za3, zs3 = 0.6, 8.65, 10.0
    for cu in (PC - 4.1, PC + 4.1):
        holes.append(arch_hole(F, cu, za3, r3, zs3))
    holes.append((PC - 0.75, PC + 0.75, F2, 7.1))                   # балконная дверь
    for cu in (PC - 4.1, PC + 4.1):
        holes.append((cu - 0.6, cu + 0.6, 5.2, 7.3))
    west = [D_E + 1.8 + i * (L_N - D_E - 2.4) / 4 for i in range(4)]   # четыре оси западного крыла
    west = [u + (L_N - D_E - 2.4) / 8 for u in west]
    for cu in west:
        holes.append((cu - 0.6, cu + 0.6, 5.2, 7.3))
        holes.append((cu - 0.6, cu + 0.6, 8.65, 10.75))
    upper_wall(F, 0, L_N, 0, holes)
    for cu in (PC - 4.1, PC + 4.1):
        arch_fill(F, cu, za3, r3, zs3, 0)
        win_light(F, cu, 5.2, 1.2, 2.1, 0)
    for cu in west:
        win_light(F, cu, 5.2, 1.2, 2.1, 0)
        win_light(F, cu, 8.65, 1.2, 2.1, 0)
    # балконная дверь второго этажа
    g = -0.2
    face('glass', [F.p(PC - 0.75, g, F2), F.p(PC + 0.75, g, F2), F.p(PC + 0.75, g, 7.1), F.p(PC - 0.75, g, 7.1)], F.N())
    box('trim', F, PC - 0.03, PC + 0.03, g, g + 0.05, F2, 7.1, bottom=False)
    box('trim', F, PC - 0.75, PC + 0.75, g, g + 0.05, 6.3, 6.36, bottom=False)
    box('trim', F, PC - 0.95, PC + 0.95, 0, 0.06, 7.1, 7.3, bottom=False)
    # лоджия: задняя стенка, пол, потолок, боковины
    LB = -1.3
    wall(F, LG0, LG1, F3, COR - 0.35, LB, [(PC - 0.7, PC + 0.7, F3 + 0.1, F3 + 2.6)])
    face('glass', [F.p(PC - 0.7, LB - 0.15, F3 + 0.1), F.p(PC + 0.7, LB - 0.15, F3 + 0.1),
                   F.p(PC + 0.7, LB - 0.15, F3 + 2.6), F.p(PC - 0.7, LB - 0.15, F3 + 2.6)], F.N())
    face('trim', [F.p(LG0, 0, F3), F.p(LG1, 0, F3), F.p(LG1, LB, F3), F.p(LG0, LB, F3)], UP)
    face('wall', [F.p(LG0, 0, COR - 0.35), F.p(LG1, 0, COR - 0.35), F.p(LG1, LB, COR - 0.35), F.p(LG0, LB, COR - 0.35)], -UP)
    face('wall', [F.p(LG0, 0, F3), F.p(LG0, LB, F3), F.p(LG0, LB, COR - 0.35), F.p(LG0, 0, COR - 0.35)], F.U())
    face('wall', [F.p(LG1, 0, F3), F.p(LG1, LB, F3), F.p(LG1, LB, COR - 0.35), F.p(LG1, 0, COR - 0.35)], -F.U())
    box('trim', F, LG0 - 0.1, LG1 + 0.1, -0.1, 0.12, COR - 0.6, COR - 0.35)   # архитрав лоджии
    # две круглые колонки (Ø 0.4) с упрощённой ионической капителью
    CH = COR - 0.6 - F3 - 0.05
    for cu in (PC - 0.67, PC + 0.67):
        base = F.p(cu, -0.35, F3 + 0.05)
        prof = [(0.26, 0), (0.26, 0.1), (0.21, 0.16)]
        prof += [(0.2 - 0.03 * (k / 4) ** 1.8, 0.16 + (CH - 0.45) * k / 4) for k in range(1, 5)]
        prof += [(0.18, CH - 0.29), (0.22, CH - 0.24), (0.22, CH - 0.2)]
        lathe('trim_s', base, prof, 10)
        box('trim', F, cu - 0.29, cu + 0.29, -0.62, -0.08, F3 + 0.05 + CH - 0.2, F3 + 0.05 + CH)  # абака-волюты
        for s in (-1, 1):
            box('trim', F, cu + s * 0.29 - 0.08, cu + s * 0.29 + 0.08, -0.6, -0.1,
                F3 + 0.05 + CH - 0.38, F3 + 0.05 + CH - 0.2)
    # узкий балкон лоджии с кованой решёткой
    box('trim', F, LG0 - 0.2, LG1 + 0.2, 0, 0.45, F3 - 0.18, F3)
    rail(F, LG0 - 0.15, LG1 + 0.15, 0.4, F3)
    # балкон-корзина второго этажа: 6 м, вынос 1.2 м, на лепных консолях
    B0, B1, BO = PC - 3.0, PC + 3.0, 1.2
    zb = F2 - 0.05
    n = 10
    pl = []
    for i in range(n + 1):
        t = i / n
        u = B0 + (B1 - B0) * t
        bul = BO * (1 - (2 * t - 1) ** 4) ** 0.5 if 0 < i < n else 0.15
        pl.append((u, bul))
    poly = [(u, max(o, 0.15)) for u, o in pl] + [(B1, 0), (B0, 0)]
    prism_plan('stone', F, [(u, o) for u, o in poly], zb - 0.18, zb)
    pts = [F.p(u, o - 0.05, 0).xy for u, o in pl]
    rail_path(pts, zb, h=0.95, step=0.16)
    for cu in (B0 + 0.6, PC - 1.2, PC + 1.2, B1 - 0.6):
        console(F, cu, 0, zb - 0.18, 0.9, h=0.7)
    # боковой балкон второго этажа справа (с улицы), волнистая решётка — простая
    sb = west[0]
    box('stone', F, sb - 0.9, sb + 0.9, 0, 0.7, F2 - 0.15, F2)
    rail(F, sb - 0.9, sb + 0.9, 0.65, F2, step=0.2)
    for s in (-1, 1):
        beam('metal', F.p(sb + s * 0.9, 0.05, F2 + 0.95), F.p(sb + s * 0.9, 0.65, F2 + 0.95), 0.04)
    # пояс и карниз; карниз под фронтоном идёт по всему фасаду
    band(F, 0, L_N, 0, F3 - 0.2, F3 - 0.05, 0.1)
    cornice_dent(F, 0, L_N, 0, COR)
    # первый этаж: у угла торговля, под балконом — окно с белой кованой решёткой, дальше витрины
    shops = [(RC + 0.5, PC - 1.6, RC + 1.4), (PC + 1.6, D_E - 0.4, None), (D_E + 0.6, D_E + 6.6, D_E + 3.6), (D_E + 7.4, L_N - 0.6, None)]
    win = (PC - 0.75, PC + 0.75, 0.9, 3.4)
    ground_floor(F, RC, L_N, 0, shops, extra=[win])
    g = -0.2
    face('glass', [F.p(win[0], g, win[2]), F.p(win[1], g, win[2]), F.p(win[1], g, win[3]), F.p(win[0], g, win[3])], F.N())
    for i in range(1, 6):                                          # белая решётка-узор
        u = win[0] + (win[1] - win[0]) * i / 6
        beam('trim', F.p(u, 0.05, win[2]), F.p(u, 0.05, win[3]), 0.03)
    for z in (1.5, 2.15, 2.8):
        beam('trim', F.p(win[0], 0.05, z), F.p(win[1], 0.05, z), 0.03)
    for i in range(3):                                             # ромбы узора
        a = win[0] + (win[1] - win[0]) * i / 3; b = win[0] + (win[1] - win[0]) * (i + 1) / 3
        beam('trim', F.p(a, 0.06, 2.15), F.p((a + b) / 2, 0.06, 2.8), 0.025)
        beam('trim', F.p((a + b) / 2, 0.06, 2.8), F.p(b, 0.06, 2.15), 0.025)
    canopy(F, 0, L_N, 0)
    return F

# ------------------------------------------------------------------ скруглённый угол первого этажа и вход на ступенях
def build_corner():
    seg = 6
    c = Vector((0, 0))
    # центр скругления в местной системе: u = RC, d = −RC
    pts = []
    for k in range(seg + 1):
        a = math.pi / 2 * k / seg
        u = RC - RC * math.cos(a)
        d = -RC + RC * math.sin(a)
        pts.append((u, d))           # от северного фасада (u=0, d=−RC) к восточному (u=RC, d=0)
    P = lambda u, d, z: FE.p(u, d, z)
    ctr = P(RC, -RC, 0)
    for k in range(seg):
        (u0, d0), (u1, d1) = pts[k], pts[k + 1]
        a, b = P(u0, d0, 0), P(u1, d1, 0)
        mid = (a + b) / 2
        out = Vector((mid.x - ctr.x, mid.y - ctr.y, 0))
        m = 'glass' if 1 <= k <= 4 else 'stone'
        face(m, [a, b, P(u1, d1, G1), P(u0, d0, G1)] if m == 'stone' else
             [a, b, P(u1, d1, 2.8), P(u0, d0, 2.8)], out)
        if m == 'glass':
            face('wall3', [P(u0, d0, 2.8), P(u1, d1, 2.8), P(u1, d1, G1), P(u0, d0, G1)], out)
        face('stone', [P(u0, d0, GROUND), P(u1, d1, GROUND), P(u1, d1, 0), P(u0, d0, 0)], out)
    # потолок над скруглением
    face('wall', [P(0, 0, G1)] + [P(u, d, G1) for u, d in pts], -UP)
    # ступени входа (3 ступени) по диагонали угла
    out = (FE.n - FE.u).normalized()                                # наружу по диагонали угла
    Fd = Frame(P(RC * 0.29, -RC * 0.29, 0).xy, Vector((-out.y, out.x)), out)
    for i in range(3):
        box('stone', Fd, -1.2 + 0.1 * i, 1.2 - 0.1 * i, -0.4, 0.35 * (3 - i), -0.3, 0.15 * (i + 1))

# ------------------------------------------------------------------ дворовые и торцевые стены
def plain_side(F, L, bays, eave=True, ground_wins=True):
    holes = []
    for i in range(bays):
        cu = L * (i + 0.5) / bays
        for za in ((1.2, 5.2, 8.65) if ground_wins else (5.2, 8.65)):
            holes.append((cu - 0.6, cu + 0.6, za, za + 2.0))
    wall(F, 0, L, 0, COR, 0, holes, reveal=0.2)
    box('stone', F, 0, L, -0.3, 0.05, GROUND, 0.0)
    for ua, ub, za, zb in holes:
        g = -0.2
        face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
        plate('trim', F, ua - 0.1, ub + 0.1, 0.03, za - 0.12, za)
    if eave:
        band(F, -0.1, L + 0.1, 0, COR, EAVE, 0.4)

def build_back():
    # западный торец крыла (на запад)
    plain_side(fr(0, -26.96, 1, 0, 0, -1), D_W, 3)
    # южная стена западного крыла (во двор)
    plain_side(fr(D_W, -26.96, 0, 1, 1, 0), 26.96 - D_E, 4)
    # западная стена восточного корпуса (во двор)
    plain_side(fr(D_W, -D_E, 1, 0, 0, -1), L_E - D_W, 7)

def build_annex():
    # южная пристройка: тот же контур OSM, на фото не видна — сдержанно, в духе дома
    F = fr(38.2, 1.3, 1, 0, 0, 1)
    L = 59.3 - 38.2
    axes = [L * (i + 0.5) / 5 for i in range(5)]
    holes = []
    for cu in axes:
        holes.append((cu - 0.6, cu + 0.6, 5.2, 7.3))
        holes.append((cu - 0.6, cu + 0.6, 8.65, 10.75))
    upper_wall(F, 0, L, 0, holes)
    for cu in axes:
        win_light(F, cu, 5.2, 1.2, 2.1, 0)
        win_light(F, cu, 8.65, 1.2, 2.1, 0)
    band(F, 0, L, 0, F3 - 0.2, F3 - 0.05, 0.1)
    cornice(F, 0, L, 0, COR, ext=0.45)
    ground_floor(F, 0, L, 0, [(0.6, 9.9, 5.2), (11.2, L - 0.6, None)])
    canopy(F, 0, L, 0)
    # уступ 1.3 м к восточному корпусу (на север)
    Fs = fr(38.2, 0, 0, 1, -1, 0)
    wall(Fs, 0, 1.3, GROUND, COR, 0, [])
    # южный торец и дворовая стена
    plain_side(fr(59.3, 1.3, 0, -1, 1, 0), 13.3, 3)
    plain_side(fr(59.3, -12.0, -1, 0, 0, -1), L, 5)
    hip_roof(F, -0.3, L, 0, -13.3, EAVE, 2.2, ov=0.45, hip0=False, hip1=True)

# ------------------------------------------------------------------ кровли, фронтон, антенна
def build_roofs():
    # восточный корпус: двускатная кровля, конёк вдоль улицы; на севере — фронтон
    ov = 0.55
    zr = EAVE + PED
    for s in (1, -1):
        de = 0 + ov if s > 0 else -D_E - ov
        face('roof', [FE.p(-0.75, de, EAVE - ov * PED / PC), FE.p(L_E, de, EAVE - ov * PED / PC),
                      FE.p(L_E, -PC, zr), FE.p(-0.75, -PC, zr)], FE.N() * s + UP)
        face('trim', [FE.p(0, de, EAVE - ov * PED / PC), FE.p(L_E, de, EAVE - ov * PED / PC),
                      FE.p(L_E, 0 if s > 0 else -D_E, EAVE), FE.p(0, 0 if s > 0 else -D_E, EAVE)], -UP)
    beam('roof', FE.p(-0.75, -PC, zr + 0.05), FE.p(L_E, -PC, zr + 0.05), 0.25, 0.14)
    Fs = fr(L_E, 0, 0, -1, 1, 0)                                    # южный щипец (над пристройкой)
    prism_uz('wall', Fs, [(0, EAVE), (D_E, EAVE), (PC, zr)], -0.3, 0)
    # фронтон: тимпан, наклонные карнизы с дентикулами
    F = FN
    prism_uz('wall', F, [(0, EAVE), (D_E, EAVE), (PC, zr)], -0.3, 0.02)
    sl = PED / PC
    ext = 0.75
    for s in (-1, 1):
        e = PC + s * (PC + ext)
        top = zr + ext * sl
        prism_uz('trim', F, [(e, EAVE), (PC, top), (PC, top - 0.3), (e - s * 0.3 / sl, EAVE)], -0.6, 0.7)
        k = PC + s * 0.5
        while abs(k - PC) < PC - 0.3:                              # дентикулы по скатам
            zt = zr - abs(k - PC) * sl - 0.22
            box('trim', F, k - 0.09, k + 0.09, 0.02, 0.24, zt - 0.14, zt)
            k += s * 0.5
    # ограждение кровли по свесам на улицу
    for Fr, L in ((FE, L_E), (FN, L_N)):
        if Fr is FN:
            continue
        zz = EAVE - 0.45 * PED / PC + 0.05
        beam('metal', Fr.p(0, 0.45, zz + 0.6), Fr.p(L, 0.45, zz + 0.6), 0.04)
        beam('metal', Fr.p(0, 0.45, zz + 0.3), Fr.p(L, 0.45, zz + 0.3), 0.025)
        k = 0.0
        while k <= L:
            beam('metal', Fr.p(k, 0.45, zz), Fr.p(k, 0.45, zz + 0.6), 0.03)
            k += 1.9
    # западное крыло: кровля к улице Лумумбы, вальма на западе, восточный край уходит под кровлю корпуса
    hip_roof(FN, PC, L_N, 0, -D_W, EAVE, 2.5, hip0=False, hip1=True)
    zf = EAVE - 0.55 * 2.5 / (D_W / 2 + 0.55)
    zz = zf + 0.05
    beam('metal', FN.p(D_E + 0.3, 0.45, zz + 0.6), FN.p(L_N + 0.3, 0.45, zz + 0.6), 0.04)
    k = D_E + 0.3
    while k <= L_N + 0.3:
        beam('metal', FN.p(k, 0.45, zz), FN.p(k, 0.45, zz + 0.6), 0.03)
        k += 1.9
    # решётчатая вышка-антенна на коньке (ферма)
    tu, td = 9.0, -PC
    H, b0, b1 = 4.5, 0.75, 0.2
    pt = lambda i, j, t: FE.p(tu + (i - 0.5) * 2 * (b0 + (b1 - b0) * t), td + (j - 0.5) * 2 * (b0 + (b1 - b0) * t), zr + H * t)
    corners = [(0, 0), (1, 0), (1, 1), (0, 1)]
    for i, j in corners:
        beam('metal', pt(i, j, 0), pt(i, j, 1), 0.06)
    for k in range(4):
        t0, t1 = k / 4, (k + 1) / 4
        for c in range(4):
            (i0, j0), (i1, j1) = corners[c], corners[(c + 1) % 4]
            beam('metal', pt(i0, j0, t1), pt(i1, j1, t1), 0.035)
            beam('metal', pt(i0, j0, t0), pt(i1, j1, t1), 0.025)
    beam('metal', FE.p(tu, td, zr + H), FE.p(tu, td, zr + H + 1.5), 0.04)

build_east()
build_north()
build_corner()
build_back()
build_annex()
build_roofs()

finish('bm10', __file__, tri_budget=10000)
