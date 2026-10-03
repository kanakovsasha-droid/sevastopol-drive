# Владимирский собор — усыпальница адмиралов (Лазарев, Корнилов, Истомин, Нахимов), ул. Суворова, 3,
# вершина Центрального холма. OSM way w92717303. Неовизантийский крестово-купольный храм
# (1854-1888, К. А. Тон / А. А. Авдеев): инкерманский камень полосами, один купол на барабане.
#
#   blender -b --python models/vladimir_sobor/build.py -- [glb]
#
# Локальный план (u, v): u — «восток» (к алтарной апсиде), v — «юг» (z мира растёт на юг),
# начало (0, 0) — центр купола. Ось церкви повёрнута на 10.4° от осей мира (контур OSM).
# Ноль высоты — подножие главной (западной) лестницы. Подробности — NOTES.md.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# ---- материалы
COL['wall'] = ((0.90, 0.86, 0.74), 0.9)        # светлая полоса кладки
COL['wall2'] = ((0.82, 0.79, 0.70), 0.92)      # серо-бежевая полоса
COL['wall3'] = ((0.86, 0.66, 0.16), 0.35)      # золото: кресты, шея купола, мозаика
COL['trim'] = ((0.95, 0.93, 0.86), 0.85)       # белый камень: наличники, карнизы, капители
COL['stone'] = ((0.30, 0.29, 0.29), 0.85)      # тёмная жесть нижних кровель
COL['roof'] = ((0.36, 0.52, 0.45), 0.55)       # позеленевшая медь купола
COL['glass'] = ((0.07, 0.09, 0.14), 0.2)
COL['wood'] = ((0.16, 0.28, 0.22), 0.45)       # зелёный мрамор колонн порталов
COL['metal'] = ((0.09, 0.10, 0.15), 0.5)       # тёмный металл: двери, перила, круглые стёкла окон

# ---- положение: центр купола в мире и поворот оси
TH = math.radians(10.4)
DOME_W = (-148.4 + 0.9836 * 5.3 + 0.1805 * 3.1, 676.6 - 0.1805 * 5.3 + 0.9836 * 3.1)   # (-142.63, 678.69)
STAIR = -20.3                                  # u подножия западной лестницы
X0 = DOME_W[0] + math.cos(TH) * STAIR
Z0 = DOME_W[1] - math.sin(TH) * STAIR
origin(X0, Z0)
LO = W(*DOME_W)
e_b = Vector((math.cos(TH), math.sin(TH)))
s_b = Vector((math.sin(TH), -math.cos(TH)))
PF = Frame(LO, e_b, s_b)

def P(u, v):
    return LO + e_b * u + s_b * v

def pt(u, v, z):
    p = P(u, v)
    return Vector((p.x, p.y, z))

def FR(nu, nv, pu, pv):
    """Рамка фасада: наружу (nu, nv) в плане (u, v), точка стены (pu, pv); a — вдоль, d — наружу."""
    n = (e_b * nu + s_b * nv).normalized()
    return Frame(P(pu, pv), Vector((-n.y, n.x)), n)

# ---- размеры
ST = 2.0                 # уровень пола (после лестницы)
PL = 0.6                 # верх цоколя
HU, HV, CH = 12.2, 11.55, 7.0       # полуразмеры восьмигранного корпуса и срез углов
EAVE = 14.5              # карниз
APEX = 18.2              # конёк фронтонов
BAND = 0.66             # высота полосы кладки
R_D = 4.9                # радиус барабана
Z_D0, Z_D1 = 16.4, 24.0  # барабан
SQ2 = math.sqrt(2)

def band_ranges(z0, z1):
    out = []
    k = int(math.floor((z0 - PL) / BAND))
    z = z0
    while z < z1 - 1e-6:
        nxt = min(z1, PL + (k + 1) * BAND)
        out.append((z, nxt, 'wall' if k % 2 == 0 else 'wall2'))
        z = nxt; k += 1
    return out

def sprism(F, poly, z0, z1, top=True):
    """Полосатая призма: плоский многоугольник (u, d) в рамке F."""
    br = band_ranges(z0, z1)
    for i, (a, b, m) in enumerate(br):
        prism_plan(m, F, poly, a, b, top=(top and i == len(br) - 1))

def sbox(F, u0, u1, d0, d1, z0, z1, top=True):
    sprism(F, [(u0, d0), (u1, d0), (u1, d1), (u0, d1)], z0, z1, top)

def oct_poly(dl=0.0):
    hu, hv, c = HU + dl, HV + dl, CH + dl * (2 - SQ2)
    return [(-hu + c, -hv), (hu - c, -hv), (hu, -hv + c), (hu, hv - c),
            (hu - c, hv), (-hu + c, hv), (-hu, hv - c), (-hu, -hv + c)]

def ring(dl, z0, z1, m='trim'):
    prism_plan(m, PF, oct_poly(dl), z0, z1, top=False)

def edge_frame(i, dl=0.0):
    pl = oct_poly(dl)
    a, b = P(*pl[i]), P(*pl[(i + 1) % 8])
    t = (b - a).normalized()
    n = Vector((t.y, -t.x))
    if n.dot((a + b) / 2 - LO) < 0:
        n = -n
    mid = (a + b) / 2
    L = (b - a).length
    return Frame(mid, Vector((-n.y, n.x)), n), L

# ================================================================== мелкие формы
def arc_pts(a, zs, r, n=8):
    return [(a + r * math.cos(math.pi * k / n), zs + r * math.sin(math.pi * k / n)) for k in range(n + 1)]

def arch_ring(F, c, zs, r, d, t=0.24, pr=0.07, n=10, m='trim', legs_z0=None):
    """Архивольт-накладка: полукольцо r..r+t с вылетом pr (и ножки вниз до legs_z0)."""
    for k in range(n):
        a0, a1 = math.pi * k / n, math.pi * (k + 1) / n
        p = lambda ang, rr, dd: F.p(c + rr * math.cos(ang), dd, zs + rr * math.sin(ang))
        face(m, [p(a0, r, d + pr), p(a1, r, d + pr), p(a1, r + t, d + pr), p(a0, r + t, d + pr)], F.N())
        face(m, [p(a0, r + t, d), p(a1, r + t, d), p(a1, r + t, d + pr), p(a0, r + t, d + pr)],
             p((a0 + a1) / 2, r + t, d) - F.p(c, d, zs))
    if legs_z0 is not None:
        box(m, F, c - r - t, c - r, d, d + pr, legs_z0, zs, bottom=False)
        box(m, F, c + r, c + r + t, d, d + pr, legs_z0, zs, bottom=False)

def rwin(F, a, za, w, h, d, ncirc=4, cols=1, ring_t=0.2, sill=True, arch_outer=0.0):
    """Арочное окно с круглыми отверстиями (как на фото): светлая плита, тёмные круги, белая рамка."""
    r = w / 2
    zs = za + h - r
    arc = arc_pts(a, zs, r, 8)
    face('trim', [F.p(a - r, d + 0.03, za), F.p(a + r, d + 0.03, za)] + [F.p(u, d + 0.03, z) for u, z in arc], F.N())
    zc0, zc1 = za + r * 0.95, za + h - r * 1.2
    sp = (zc1 - zc0) / max(ncirc - 1, 1)
    cr = min(r * (0.5 if cols == 1 else 0.3), sp * 0.42)
    xs = [a] if cols == 1 else [a - r * 0.5, a + r * 0.5]
    for x in xs:
        for i in range(ncirc):
            z = zc0 + sp * i
            face('metal', [F.p(x + cr * math.cos(2 * math.pi * k / 6), d + 0.05, z + cr * math.sin(2 * math.pi * k / 6)) for k in range(6)], F.N())
    arch_ring(F, a, zs, r, d, ring_t, 0.06, 8, 'trim', legs_z0=za)
    if sill:
        box('trim', F, a - r - ring_t - 0.08, a + r + ring_t + 0.08, d, d + 0.14, za - 0.16, za - 0.02)
    if arch_outer:      # внешняя слепая арка вокруг окна
        arch_ring(F, a, zs, r + arch_outer, d, 0.2, 0.03, 10, 'trim', legs_z0=za - 0.1)

def dark_arch(F, a, za, r, zs, d, m='glass'):
    face(m, [F.p(a - r, d, za), F.p(a + r, d, za)] + [F.p(u, d, z) for u, z in arc_pts(a, zs, r, 8)], F.N())

def arch_face(F, a0, a1, zlo, zhi, d, arches, m='wall', n=8):
    """Плоскость стены с арочными проёмами (до пола zlo): арки — (центр, радиус, пята)."""
    xs = {a0, a1}
    for c, r, zs in arches:
        for k in range(n + 1):
            xs.add(c - r + 2 * r * k / n)
    xs = sorted(x for x in xs if a0 - 1e-6 <= x <= a1 + 1e-6)
    def top(x):
        for c, r, zs in arches:
            if c - r - 1e-6 <= x <= c + r + 1e-6:
                return zs + math.sqrt(max(r * r - (x - c) ** 2, 0)), True
        return zlo, False
    for i in range(len(xs) - 1):
        xa, xb = xs[i], xs[i + 1]
        xm = (xa + xb) / 2
        ta, ina = top(xa); tb, inb = top(xb)
        _, inm = top(xm)
        if inm:
            ta, _ = top(xa + 1e-6) if ina else (ta, 0)
            face(m, [F.p(xa, d, ta), F.p(xb, d, tb), F.p(xb, d, zhi), F.p(xa, d, zhi)], F.N())
        else:
            face(m, [F.p(xa, d, zlo), F.p(xb, d, zlo), F.p(xb, d, zhi), F.p(xa, d, zhi)], F.N())

def soffit(F, c, r, zs, d, depth, n=8, m='wall2'):
    """Внутренняя поверхность арки (тоннель) на глубину depth внутрь."""
    pts = arc_pts(c, zs, r, n)
    for k in range(n):
        (ua, za), (ub, zb) = pts[k], pts[k + 1]
        face(m, [F.p(ua, d, za), F.p(ub, d, zb), F.p(ub, d - depth, zb), F.p(ua, d - depth, za)],
             F.p(c, d, zs) - F.p((ua + ub) / 2, d, (za + zb) / 2))
    for s in (-1, 1):
        face(m, [F.p(c + s * r, d, ST), F.p(c + s * r, d - depth, ST), F.p(c + s * r, d - depth, zs), F.p(c + s * r, d, zs)],
             -F.U() * s)

def column(F, a, d, z0, z1, r=0.34, cap=True):
    """Зелёная колонна с базой и белой капителью (кубическая византийская)."""
    p = F.p(a, d, 0)
    base = Vector((p.x, p.y, 0))
    lathe('wood', base, [(r, z0 + 0.25), (r * 0.92, z0 + 0.4), (r * 0.86, z1 - 0.1)], 10, cap=False)
    box('trim', F, a - r * 1.5, a + r * 1.5, d - r * 1.5, d + r * 1.5, z0, z0 + 0.25)
    if cap:
        box('trim', F, a - r * 1.2, a + r * 1.2, d - r * 1.2, d + r * 1.2, z1 - 0.1, z1 + 0.28)
        box('trim', F, a - r * 1.65, a + r * 1.65, d - r * 1.65, d + r * 1.65, z1 + 0.28, z1 + 0.5)

def colonnette(F, a, d, z0, z1, r=0.2, m='trim'):
    p = F.p(a, d, 0)
    base = Vector((p.x, p.y, 0))
    lathe(m, base, [(r * 1.25, z0), (r * 1.25, z0 + 0.12), (r, z0 + 0.2), (r, z1 - 0.2), (r * 1.2, z1 - 0.12), (r * 1.2, z1)], 8, cap=True)
    box('trim', F, a - r * 1.5, a + r * 1.5, d - r * 1.5, d + r * 1.5, z1, z1 + 0.22)

def rake(F, hw, z0, rise, d, ov=0.25):
    """Тимпан с полосами и падающий карниз фронтона."""
    z1 = z0 + rise
    for (a, b, m) in band_ranges(z0, z1):
        wa = max(hw * (1 - (a - z0) / rise), 0.002)
        wb = max(hw * (1 - (b - z0) / rise), 0.002)
        prism_uz(m, F, [(-wa, a), (wa, a), (wb, b), (-wb, b)], d - 0.3, d)
    for s in (-1, 1):
        p0 = F.p(s * (hw + ov), d + 0.12, z0 - 0.05)
        p1 = F.p(0, d + 0.12, z1 + 0.12)
        beam('trim', p0, p1, 0.5, 0.3)
        beam('trim', F.p(s * (hw + ov + 0.1), d + 0.02, z0 - 0.15), F.p(0, d + 0.02, z1 + 0.02), 0.34, 0.2)

def gable_roof(F, hw, ds, de, z_eave, z_ridge, ov=0.45, m='stone'):
    for s in (-1, 1):
        A = F.p(s * (hw + ov), ds, z_eave); B = F.p(0, ds, z_ridge)
        C = F.p(0, de, z_ridge); D = F.p(s * (hw + ov), de, z_eave)
        face(m, [A, B, C, D], UP + F.U() * s * 0.5 + F.N() * 0.0)

def cross(cx, cy, z0, h=3.0):
    c = Vector((cx, cy, z0))
    beam('wall3', c, c + UP * h, 0.14)
    beam('wall3', c + UP * h * 0.68 - Vector((0.5, 0, 0)), c + UP * h * 0.68 + Vector((0.5, 0, 0)), 0.11)
    beam('wall3', c + UP * h * 0.86 - Vector((0.34, 0, 0)), c + UP * h * 0.86 + Vector((0.34, 0, 0)), 0.09)

# ================================================================== КОРПУС
def body():
    # цоколь
    prism_plan('wall2', PF, oct_poly(0.12), -3.0, PL, top=False)
    ring(0.2, PL - 0.02, PL + 0.14)
    sprism(PF, oct_poly(0.0), PL, EAVE)
    # карниз с зубчиками
    ring(0.10, EAVE - 0.5, EAVE)
    ring(0.35, EAVE, EAVE + 0.26)
    ring(0.62, EAVE + 0.26, EAVE + 0.5)
    ring(0.12, 6.35, 6.62)                      # пояс на уровне нижних кровель
    for i in range(8):
        F, L = edge_frame(i)
        s = -L / 2 + 0.4
        while s < L / 2 - 0.3:
            box('trim', F, s - 0.11, s + 0.11, 0, 0.2, EAVE - 0.9, EAVE - 0.5, bottom=False)
            s += 0.56
    # угловые колонки на стыках граней (срезы)
    pl = oct_poly(0.0)
    for k in range(8):
        a, b, c = P(*pl[k - 1]), P(*pl[k]), P(*pl[(k + 1) % 8])
        n1 = (b - a).normalized(); n2 = (c - b).normalized()
        out = Vector((n1.y - n2.y, n2.x - n1.x)).normalized()
        if out.dot(b - LO) < 0: out = -out
        q = b + out * 0.1
        Fk = Frame(q, Vector((-out.y, out.x)), out)
        colonnette(Fk, 0, 0, 7.4, 11.6, 0.27)
    # окна на срезанных углах
    for i in (1, 3, 5, 7):
        F, L = edge_frame(i)
        rwin(F, 0, 8.6, 1.3, 3.5, 0, ncirc=4, arch_outer=0.55)
    # нижние кровли (тёмная жесть): пирамида от карниза к барабану
    n = 32
    center = LO
    def ray(poly, ang):
        d = Vector((math.cos(ang), math.sin(ang)))
        best = 1e9
        for i in range(len(poly)):
            a = Vector(poly[i]); b = Vector(poly[(i + 1) % len(poly)])
            e = b - a
            M = e.x * d.y - d.x * e.y
            if abs(M) < 1e-9: continue
            t = (-a.x * e.y + e.x * a.y) / M
            sp = (d.x * a.y - d.y * a.x) / M
            if t > 0 and -1e-6 <= sp <= 1 + 1e-6:
                best = min(best, t)
        return best
    poly_uv = oct_poly(0.55)
    for k in range(n):
        a0, a1 = 2 * math.pi * k / n, 2 * math.pi * (k + 1) / n
        r0, r1 = ray(poly_uv, a0), ray(poly_uv, a1)
        z_hi = 17.4
        q = [pt(r0 * math.cos(a0), r0 * math.sin(a0), EAVE + 0.2), pt(r1 * math.cos(a1), r1 * math.sin(a1), EAVE + 0.2),
             pt(5.0 * math.cos(a1), 5.0 * math.sin(a1), z_hi), pt(5.0 * math.cos(a0), 5.0 * math.sin(a0), z_hi)]
        face('stone', q, UP)

# ================================================================== ФРОНТОНЫ ВЕТВЕЙ КРЕСТА
def arms():
    walls = {'N': (0, -1, 0, -HV, HU - CH), 'S': (0, 1, 0, HV, HU - CH),
             'W': (-1, 0, -HU, 0, HV - CH), 'E': (1, 0, HU, 0, HV - CH)}
    for key, (nu, nv, pu, pv, hw) in walls.items():
        F = FR(nu, nv, pu, pv)
        rake(F, hw, EAVE, APEX - EAVE, 0.0)
        inner = (HV if key in 'NS' else HU) - 4.6
        gable_roof(F, hw, 0.5, -inner, EAVE - 0.25, APEX + 0.12)
    # южный и северный порталы с тройной аркадой
    for key, (nu, nv, pu, pv, hw) in {'N': walls['N'], 'S': walls['S']}.items():
        portal_ns(FR(nu, nv, pu, pv))
    portal_w()
    # окна тройной группы над порталом (фото: центр выше боковых)
    for key in 'NS':
        nu, nv, pu, pv, hw = walls[key]
        F = FR(nu, nv, pu, pv)
        rwin(F, 0, 9.0, 1.9, 5.0, 0, ncirc=5, cols=2)
        rwin(F, -2.35, 9.2, 1.3, 3.7, 0, ncirc=4)
        rwin(F, 2.35, 9.2, 1.3, 3.7, 0, ncirc=4)
        for s in (-1, 1):
            colonnette(F, s * 1.2, 0.12, 9.0, 12.4, 0.16)
    # восточный фронтон: два малых окна и зубчатый поясок над апсидой
    Fe = FR(1, 0, HU, 0)
    rwin(Fe, 0, 15.1, 1.3, 2.4, 0, ncirc=2)

def portal_ns(F):
    """Портал юга/севера: три арки на четырёх зелёных колоннах, дверь и две чёрные доски."""
    depth = 2.1
    hw = 3.3
    zt = 7.8
    # боковые стенки и перекрытие
    for s in (-1, 1):
        sbox(F, s * (hw - 0.3) if s > 0 else -hw, hw if s > 0 else -(hw - 0.3), 0, depth, PL, zt, top=False)
    # лицевая плоскость с арками
    cols = [-2.7, -0.9, 0.9, 2.7]
    arches = [(-1.8, 0.82, ST + 3.3), (0.0, 0.86, ST + 3.4), (1.8, 0.82, ST + 3.3)]
    arch_face(F, -hw, hw, ST, zt, depth, arches, 'wall')
    for c, r, zs in arches:
        arch_ring(F, c, zs, r, depth, 0.3, 0.1, 10, 'trim')
        soffit(F, c, r, zs, depth, depth - 0.2, 8, 'wall2')
    # верх портала: карниз и тёмная кровля
    ring_box = lambda a0, a1, d1, z0, z1: box('trim', F, a0, a1, 0, d1, z0, z1, bottom=False)
    ring_box(-hw - 0.2, hw + 0.2, depth + 0.3, zt, zt + 0.25)
    ring_box(-hw - 0.35, hw + 0.35, depth + 0.5, zt + 0.25, zt + 0.5)
    face('stone', [F.p(-hw - 0.35, depth + 0.5, zt + 0.5), F.p(hw + 0.35, depth + 0.5, zt + 0.5),
                   F.p(hw + 0.35, -0.05, zt + 1.0), F.p(-hw - 0.35, -0.05, zt + 1.0)], UP + F.N())
    # колонны
    for a in cols:
        column(F, a, depth - 0.22, ST, ST + 2.9, 0.3)
    # внутри: дверь и доски
    g = 0.18
    box('metal', F, -0.8, 0.8, g - 0.05, g + 0.04, ST, ST + 3.2)
    box('trim', F, -1.0, 1.0, g - 0.05, g + 0.02, ST + 3.2, ST + 3.4)
    for s in (-1, 1):
        box('glass', F, s * 1.45 - 0.5, s * 1.45 + 0.5, g - 0.04, g + 0.03, ST + 0.9, ST + 3.0)
    # лунеты над арками — золотая мозаика
    for c, r, zs in arches:
        face('wall3', [F.p(c + 0.55 * r * math.cos(math.pi * k / 8), depth - 1.3, zs - 0.1 + 0.55 * r * math.sin(math.pi * k / 8)) for k in range(9)], F.N())
    # лестница
    n = 5
    for i in range(n):
        top = ST - 0.4 * (i + 1)
        box('wall2', F, -4.2, 4.2, 0, depth + 0.3 * (i + 1) + 0.15, top - 0.5 if i < n - 1 else -3, top, bottom=False)

def spandrels(F, c, r, zs, d0, d1, m='wall'):
    """Заполнение углов над пятами арки (между дугой и прямоугольником) — образует тоннель арки."""
    arc = [(c + r * math.cos(math.pi * (1 - k / 8) ), zs + r * math.sin(math.pi * (1 - k / 8))) for k in range(5)]   # от пяты к замку (левая половина)
    left = [(c - r, zs + r), (c - r, zs)] + arc
    right = [(c + r, zs + r), (c + r, zs)] + [(2 * c - u, z) for u, z in arc]
    prism_uz(m, F, left, d0, d1)
    prism_uz(m, F, right, d0, d1)

def arch_tunnel(F, arches, a0, a1, zbot, ztop, d0, d1):
    """Стена с арочными проёмами-тоннелями глубиной d0..d1: простенки, перемычки и пазухи."""
    xs = sorted([(c - r, c + r) for c, r, zs in arches])
    edges = [a0] + [x for pair in xs for x in pair] + [a1]
    for i in range(0, len(edges), 2):
        if edges[i + 1] - edges[i] > 0.02:
            sbox(F, edges[i], edges[i + 1], d0, d1, zbot, ztop, top=False)
    for c, r, zs in arches:
        sbox(F, c - r, c + r, d0, d1, zs + r, ztop, top=False)
        spandrels(F, c, r, zs, d0, d1)

def portal_w():
    """Главный (западный) вход: ризалит со звонницей, глубокая арка на зелёных колоннах, лестница."""
    BD = 4.4                              # вынос ризалита от стены корпуса
    hwb = 3.6
    FB = FR(-1, 0, -HU - BD, 0)           # лицо ризалита (d наружу)
    TD = 3.4                              # глубина тоннеля арки
    zs_p, r_p = ST + 4.1, 2.3
    z_pt = 9.6
    # нижний ярус: задняя заглушка, простенки, перемычка, пазухи
    sbox(FB, -hwb, hwb, -BD, -TD, PL, z_pt, top=False)
    arch_tunnel(FB, [(0.0, r_p, zs_p)], -hwb, hwb, PL, z_pt, -TD, 0.0)
    box('wall2', FB, -r_p, r_p, -TD, 0.9, -3.0, ST, bottom=False)                # пол тоннеля и площадка
    arch_ring(FB, 0.0, zs_p, r_p, 0.0, 0.32, 0.1, 14, 'trim')
    box('trim', FB, -hwb - 0.2, hwb + 0.2, -BD, 0.28, z_pt, z_pt + 0.26, bottom=False)       # карниз над порталом
    box('trim', FB, -hwb - 0.1, hwb + 0.1, -BD, 0.12, z_pt + 0.26, z_pt + 0.4, bottom=False)
    # колонны портала — по две с каждой стороны, как на фото
    for s in (-1, 1):
        column(FB, s * 1.95, -0.55, ST, ST + 3.8, 0.34)
        column(FB, s * 1.95, -1.55, ST, ST + 3.8, 0.28)
    # дверь, лунет с мозаикой, боковые доски — в глубине тоннеля
    FD = FR(-1, 0, -HU - BD + TD, 0)
    FDc = Frame(FD.o, FD.u, FD.n)
    box('metal', FB, -1.0, 1.0, -TD, -TD + 0.1, ST, ST + 3.2)
    box('trim', FB, -1.2, 1.2, -TD, -TD + 0.12, ST + 3.2, ST + 3.45)
    box('trim', FB, -1.2, -1.0, -TD, -TD + 0.12, ST, ST + 3.2)
    box('trim', FB, 1.0, 1.2, -TD, -TD + 0.12, ST, ST + 3.2)
    face('wall3', [FB.p(1.75 * math.cos(math.pi * k / 10), -TD + 0.04, ST + 4.1 + 1.75 * math.sin(math.pi * k / 10)) for k in range(11)], FB.N())
    for s in (-1, 1):
        box('glass', FB, s * 1.6 - 0.4, s * 1.6 + 0.4, -TD, -TD + 0.08, ST + 0.9, ST + 3.1)
    # пояс и верхний ярус (звонница)
    sbox(FB, -hwb, hwb, -BD, 0, z_pt + 0.4, 10.4, top=False)
    Bd = 1.5
    zbt = 14.9
    arches = [(0.0, 0.85, 12.6), (-1.95, 0.65, 12.1), (1.95, 0.65, 12.1)]
    sbox(FB, -hwb, hwb, -BD, -Bd, 10.4, zbt, top=False)
    arch_tunnel(FB, arches, -hwb, hwb, 10.4, zbt, -Bd, 0.0)
    for c, r, zs in arches:
        arch_ring(FB, c, zs, r, 0.0, 0.22, 0.08, 8, 'trim')
        dark_arch(FB, c, 10.4, r, zs, -Bd + 0.02, 'glass')
    for s in (-1, 1):
        colonnette(FB, s * 1.05, -0.3, 10.4, 12.4, 0.15)
    beam('metal', FB.p(-hwb + 0.2, -0.15, 11.4), FB.p(hwb - 0.2, -0.15, 11.4), 0.05)
    for a, z, sc in ((0.0, 12.0, 0.42), (-1.95, 11.6, 0.28), (1.95, 11.6, 0.28)):
        p = FB.p(a, -0.9, 0)
        lathe('wall3', Vector((p.x, p.y, 0)), [(0.06, z + sc * 1.2), (sc * 0.8, z + sc * 0.3), (sc * 1.05, z - sc * 0.8)], 6, cap=False)
    box('trim', FB, -hwb - 0.2, hwb + 0.2, -BD, 0.3, zbt, zbt + 0.25, bottom=False)
    rake(FB, hwb, zbt + 0.25, 1.5, 0.0, ov=0.35)
    gable_roof(FB, hwb, 0.35, -BD, zbt + 0.1, zbt + 0.25 + 1.55, ov=0.3)
    # лестница: 8 ступеней по 0.25, ширина 9
    for i in range(8):
        top = ST - 0.25 * (i + 1)
        box('wall2', FB, -4.5, 4.5, 0.0, 0.9 + 0.35 * (i + 1), top - 0.4 if i < 7 else -3, top, bottom=False)
    for s in (-1, 1):                            # щёки, столбики с крестами и перила
        u0, u1 = (s * 4.5, s * 5.1) if s > 0 else (s * 5.1, s * 4.5)
        box('wall2', FB, u0, u1, -0.6, 3.7, -3, 0.35)
        box('trim', FB, u0 - 0.04, u1 + 0.04, -0.6, 3.75, 0.35, 0.5)
        box('trim', FB, s * 4.8 - 0.3, s * 4.8 + 0.3, 3.1, 3.7, 0.5, 1.7)
        box('trim', FB, s * 4.8 - 0.4, s * 4.8 + 0.4, 3.0, 3.8, 1.7, 1.9)
        beam('trim', FB.p(s * 4.8, 3.4, 1.9), FB.p(s * 4.8, 3.4, 2.8), 0.14)
        beam('trim', FB.p(s * 4.8 - 0.25, 3.4, 2.45), FB.p(s * 4.8 + 0.25, 3.4, 2.45), 0.12)
        a = s * 3.4
        p0, p1 = FB.p(a, 0.9, ST + 0.95), FB.p(a, 3.7, 0.95)
        beam('metal', p0, p1, 0.05)
        beam('metal', p0 - UP * 0.5, p1 - UP * 0.5, 0.03)
        for k in range(5):
            q = p0 + (p1 - p0) * (k / 4)
            beam('metal', q, Vector((q.x, q.y, q.z - 0.95)), 0.03)

# ================================================================== АПСИДА
def apse():
    cu, R = 10.6, 4.5
    n = 12
    poly = [(cu + R * math.cos(math.pi * (-0.5 + k / n)), R * math.sin(math.pi * (-0.5 + k / n))) for k in range(n + 1)]
    prism_plan('wall2', PF, [(u + (0.1 * (u - cu) / R), v + 0.1 * v / R) for u, v in poly], -3.0, PL, top=False)
    sprism(PF, poly, PL, 11.2, top=False)
    # карниз апсиды
    for k in range(n):
        a0, a1 = math.pi * (-0.5 + k / n), math.pi * (-0.5 + (k + 1) / n)
        for rr, z0, z1 in ((R + 0.12, 10.7, 11.2), (R + 0.35, 11.2, 11.45)):
            q = [pt(cu + rr * math.cos(a0), rr * math.sin(a0), z1), pt(cu + rr * math.cos(a1), rr * math.sin(a1), z1),
                 pt(cu + rr * math.cos(a1), rr * math.sin(a1), z0), pt(cu + rr * math.cos(a0), rr * math.sin(a0), z0)]
            face('trim', q, pt(cu + rr * math.cos((a0 + a1) / 2), rr * math.sin((a0 + a1) / 2), (z0 + z1) / 2) - pt(cu, 0, (z0 + z1) / 2))
    # коническая зелёная кровля
    prof = [(R + 0.4, 11.45), (R * 0.9, 11.9), (R * 0.62, 12.7), (R * 0.3, 13.3), (0.05, 13.6)]
    base = pt(cu, 0, 0); base.z = 0
    lathe('roof', base, prof, 16, cap=False)
    # окна апсиды
    for ang in (-0.62, 0.0, 0.62):
        nn = Vector((math.cos(ang), math.sin(ang)))      # в (u,v)
        nb = (e_b * nn.x + s_b * nn.y).normalized()
        F = Frame(P(cu + R * math.cos(ang), R * math.sin(ang)) - nb * 0.0, Vector((-nb.y, nb.x)), nb)
        rwin(F, 0, 4.0, 1.2, 3.8, -0.02, ncirc=4)

# ================================================================== БАРАБАН И КУПОЛ
def drum():
    base = Vector((LO.x, LO.y, 0))
    seg = 32
    for (a, b, m) in band_ranges(Z_D0, Z_D1):
        lathe(m, base, [(R_D, a), (R_D, b)], seg, cap=False)
    # нижний пояс и венчающий карниз
    lathe('trim', base, [(R_D + 0.25, Z_D0 + 0.0), (R_D + 0.25, Z_D0 + 0.3), (R_D + 0.1, Z_D0 + 0.34)], 32, cap=False)
    lathe('trim', base, [(R_D + 0.08, Z_D1 - 0.02), (R_D + 0.4, Z_D1), (R_D + 0.4, Z_D1 + 0.3), (R_D + 0.2, Z_D1 + 0.34)], 32, cap=False)
    # восемь окон с кругами и слепыми арками, между ними колонки
    for k in range(8):
        ang = math.radians(22.5 + 45 * k)
        out = Vector((math.cos(ang), math.sin(ang)))
        nb = (e_b * out.x + s_b * out.y).normalized()
        F = Frame(P(R_D * out.x, R_D * out.y) + nb * 0.0, Vector((-nb.y, nb.x)), nb)
        rwin(F, 0, Z_D0 + 2.3, 1.15, 3.7, 0.0, ncirc=4, sill=False, arch_outer=0.42)
        ang2 = math.radians(45 * k)
        o2 = Vector((math.cos(ang2), math.sin(ang2)))
        nb2 = (e_b * o2.x + s_b * o2.y).normalized()
        F2 = Frame(P(R_D * o2.x, R_D * o2.y) + nb2 * 0.08, Vector((-nb2.y, nb2.x)), nb2)
        colonnette(F2, 0, 0, Z_D0 + 0.35, Z_D1 - 1.2, 0.19)
    # купол — слегка вытянутая полусфера, зелёная медь
    R = R_D + 0.4
    zh = Z_D1 + 0.32
    H = 3.7
    N = 8
    prof = [(R * math.cos(math.pi / 2 * (i / N) ** 0.9 * 0.985), zh + H * math.sin(math.pi / 2 * i / N)) for i in range(N + 1)]
    lathe('roof', base, prof, 20, cap=False)
    # рёбра-швы купола
    # шея и крест
    zn = zh + H
    lathe('wall3', base, [(0.62, zn - 0.15), (0.62, zn + 0.45), (0.85, zn + 0.55), (0.85, zn + 0.85), (0.5, zn + 0.95), (0.4, zn + 1.1),
                          (0.7, zn + 1.35), (0.7, zn + 1.65), (0.3, zn + 1.85)], 8, cap=True)
    cross(LO.x, LO.y, zn + 1.8, 3.3)

body()
arms()
apse()
drum()

finish('vladimir_sobor', __file__)
