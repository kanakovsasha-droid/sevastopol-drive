# Большая Морская, 3 — трёхэтажный дом с аркадой (Xiaomi, паб «317»),
# Черноморка (OSM way 92717224). Модель с нуля.
#
#   blender -b --python models/bm3/build.py -- [glb]
#
# План — контур OSM: длинное крыло 63 × 13.5 м вдоль Большой Морской (фасад
# на запад) и два коротких корпуса во двор — северный (21 × 14.6) и южный
# (25 × 12.9), в плане «П». Фасад — по описанию refs/center-models.json:
# 1-й этаж — белый руст и аркада с витринами, 2–3-й этажи — кремово-песочный
# известняк #dfd2b3, небольшие балконы с балясинами, угловые пилястры, карниз
# на кронштейнах, вальмовая кровля. Фото в облаке не открыть — что наугад,
# записано в NOTES.md. Ноль высоты — тротуар у середины уличного фасада.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# Контур OSM (мир x, z), обход как в world.json
P = [(-352.6, 740.2), (-363.2, 678.1), (-343.1, 671.2), (-338.3, 685.0),
     (-347.8, 688.3), (-341.5, 725.0), (-329.4, 723.8), (-327.8, 736.6)]
X0, Z0 = -357.9, 709.15                     # середина уличного фасада P0–P1
origin(X0, Z0)

COL['wall'] = ((0.875, 0.824, 0.702), 0.9)   # #dfd2b3, кремово-песочный известняк
COL['wall2'] = ((0.91, 0.90, 0.86), 0.9)     # белый руст первого этажа
COL['trim'] = ((0.93, 0.92, 0.87), 0.85)     # пилястры, карниз, балконы
COL['stone'] = ((0.58, 0.56, 0.52), 0.9)     # цоколь
COL['roof'] = ((0.478, 0.478, 0.478), 0.85)  # #7a7a7a
COL['glass'] = ((0.08, 0.11, 0.14), 0.15)

GROUND = -3.0
GF = 4.5                 # верх первого (торгового) этажа
BELT = GF + 0.2          # пояс над рустом
F3 = 7.9                 # низ третьего этажа
EAVE = 11.1              # низ венчающего карниза
COR = EAVE + 0.6         # верх карниза = свес кровли
RISE = 2.2               # подъём вальмы основного крыла

# ------------------------------------------------------------------ план
def V2(p): return Vector(p)
CEN = (-349.0, 712.0)                        # точка внутри крыла
u_w = (V2(P[1]) - V2(P[0])).normalized()     # вдоль уличного фасада, на север
n_in = Vector((-u_w.y, u_w.x))
if n_in.dot(V2(CEN) - V2(P[0])) < 0: n_in = -n_in
depth = lambda p: (V2(p) - V2(P[0])).dot(n_in)   # глубина от уличного фасада
WD = depth(P[4])                             # ширина крыла по контуру, 13.45

def at_depth(p, q, t):
    """Точка на прямой p→q с глубиной t (можно за пределами отрезка)."""
    dp, dq = depth(p), depth(q)
    a, b = V2(p), V2(q)
    return tuple(a + (b - a) * ((t - dp) / (dq - dp)))

def inside_pt(a, b):
    """Точка мира в метре внутрь дома от середины ребра a→b (обход по часовой в плане мира)."""
    m = (V2(a) + V2(b)) / 2; e = (V2(b) - V2(a)).normalized()
    for s in (1, -1):
        q = m + Vector((-e.y, e.x)) * s
        if point_in(q): return tuple(q)
    return CEN

def point_in(q):
    c = False
    for i in range(len(P)):
        (x1, z1), (x2, z2) = P[i], P[(i + 1) % len(P)]
        if (z1 > q.y) != (z2 > q.y) and q.x < x1 + (q.y - z1) * (x2 - x1) / (z2 - z1):
            c = not c
    return c

# ------------------------------------------------------------------ примитивы
def quad(m, F, u0, u1, z0, z1, d):
    face(m, [F.p(u0, d, z0), F.p(u1, d, z0), F.p(u1, d, z1), F.p(u0, d, z1)], F.N())

def wall_cut(F, u0, u1, z0, z1, d, holes, m, reveal=0.22):
    """Как wall() из kit, но откосы — только у прямоугольных проёмов (5-й элемент False)."""
    us = sorted({u0, u1, *[h[0] for h in holes], *[h[1] for h in holes]})
    zs = sorted({z0, z1, *[h[2] for h in holes], *[h[3] for h in holes]})
    us = [u for u in us if u0 - 1e-6 <= u <= u1 + 1e-6]
    zs = [z for z in zs if z0 - 1e-6 <= z <= z1 + 1e-6]
    for i in range(len(us) - 1):
        for k in range(len(zs) - 1):
            cu, cz = (us[i] + us[i + 1]) / 2, (zs[k] + zs[k + 1]) / 2
            if any(h[0] < cu < h[1] and h[2] < cz < h[3] for h in holes):
                continue
            quad(m, F, us[i], us[i + 1], zs[k], zs[k + 1], d)
    for h in holes:
        if len(h) > 4 and not h[4]: continue
        ua, ub, za, zb = h[:4]
        r = d - reveal
        face('trim', [F.p(ua, d, za), F.p(ua, r, za), F.p(ua, r, zb), F.p(ua, d, zb)], F.U())
        face('trim', [F.p(ub, d, za), F.p(ub, r, za), F.p(ub, r, zb), F.p(ub, d, zb)], -F.U())
        face('trim', [F.p(ua, d, zb), F.p(ub, d, zb), F.p(ub, r, zb), F.p(ua, r, zb)], -UP)
        face('trim', [F.p(ua, d, za), F.p(ub, d, za), F.p(ub, r, za), F.p(ua, r, za)], UP)

def win(F, cu, za, w, h, d=0.0, rich=False, reveal=0.22, sill=True):
    """Окно: стекло в глубине, подоконник; на уличных фасадах — импост и замок."""
    g = d - reveal + 0.02
    quad('glass', F, cu - w / 2, cu + w / 2, za, za + h, g)
    if sill:
        box('trim', F, cu - w / 2 - 0.08, cu + w / 2 + 0.08, d - 0.02, d + 0.12, za - 0.1, za, bottom=False)
    if rich:
        box('trim', F, cu - 0.03, cu + 0.03, g, g + 0.06, za, za + h, bottom=False)
        box('trim', F, cu - w / 2, cu + w / 2, g, g + 0.06, za + h * 0.7 - 0.03, za + h * 0.7 + 0.03, bottom=False)
        box('trim', F, cu - w / 2 - 0.12, cu + w / 2 + 0.12, d - 0.02, d + 0.06, za + h, za + h + 0.16, bottom=False)
        box('trim', F, cu - 0.17, cu + 0.17, d - 0.02, d + 0.1, za + h - 0.05, za + h + 0.26, bottom=False)
    return (cu - w / 2, cu + w / 2, za, za + h)

def rust(F, u0, u1, z0, z1, d, holes, row=0.6, gap=0.07, pr=0.05):
    """Белый руст: горизонтальные ленты камня между проёмами."""
    z = z0
    while z < z1 - 0.05:
        za, zb = z, min(z + row - gap, z1)
        cuts = sorted((h[0], h[1]) for h in holes if h[2] < zb and h[3] > za)
        a = u0
        for ha, hb in cuts + [(u1, u1)]:
            if ha - a > 0.15:
                box('trim', F, a, ha, d - 0.01, d + pr, za, zb, bottom=False)
            a = max(a, hb)
        z += row

def arch_bay(F, cu, r, zs, d=0.0, rec=0.35, seg=10):
    """Арка с витриной: пазухи стены, откос по дуге, стекло с переплётом, замковый камень."""
    arc = [(cu + r * math.cos(math.pi * k / seg), zs + r * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
    hs = seg // 2
    face('wall2', [F.p(cu + r, d, zs + r)] + [F.p(u, d, z) for u, z in arc[:hs + 1]], F.N())
    face('wall2', [F.p(cu - r, d, zs + r)] + [F.p(u, d, z) for u, z in arc[hs:]], F.N())
    for k in range(seg):
        (ua, za), (ub, zb) = arc[k], arc[k + 1]
        face('trim', [F.p(ua, d, za), F.p(ub, d, zb), F.p(ub, d - rec, zb), F.p(ua, d - rec, za)],
             F.p(cu, d, zs) - F.p((ua + ub) / 2, d, (za + zb) / 2))
    for u in (cu - r, cu + r):                                   # откосы опор
        face('trim', [F.p(u, d, 0.0), F.p(u, d - rec, 0.0), F.p(u, d - rec, zs), F.p(u, d, zs)],
             F.U() * (1 if u < cu else -1))
    g = d - rec + 0.02
    face('glass', [F.p(cu - r, g, 0.0), F.p(cu + r, g, 0.0)] + [F.p(u, g, z) for u, z in arc], F.N())
    box('trim', F, cu - r, cu + r, g, g + 0.08, zs - 0.05, zs + 0.05, bottom=False)       # импост витрины
    box('trim', F, cu - r, cu + r, g, g + 0.08, 0.0, 0.35, bottom=False)                  # низ витрины
    for du in (-r / 2, r / 2):
        box('trim', F, cu + du - 0.04, cu + du + 0.04, g, g + 0.08, 0.35, zs + math.sqrt(r * r - du * du), bottom=False)
    box('trim', F, cu - 0.22, cu + 0.22, d - 0.01, d + 0.12, zs + r - 0.12, zs + r + 0.42, bottom=False)  # замок

def balcony(F, cu, z, w=2.4, dep=0.85):
    """Небольшой балкон: плита на двух консолях, балясины, поручень."""
    box('trim', F, cu - w / 2, cu + w / 2, 0, dep, z - 0.18, z)
    for s in (-1, 1):
        Fb = Frame(F.o + F.u * (cu + s * (w / 2 - 0.25)), F.n, F.u)
        prism_uz('trim', Fb, [(0, z - 0.18), (dep - 0.05, z - 0.18), (0, z - 0.8)], -0.1, 0.1)
    n = 9
    for i in range(n):
        u = cu - w / 2 + 0.12 + (w - 0.24) * i / (n - 1)
        box('trim', F, u - 0.05, u + 0.05, dep - 0.14, dep - 0.04, z, z + 0.85, bottom=False)
    for s in (-1, 1):
        for dd in (0.3,):
            u = cu + s * (w / 2 - 0.09)
            box('trim', F, u - 0.05, u + 0.05, dd - 0.05, dd + 0.05, z, z + 0.85, bottom=False)
    box('trim', F, cu - w / 2, cu + w / 2, dep - 0.16, dep, z + 0.85, z + 0.97, bottom=False)
    for s in (-1, 1):
        u0, u1 = sorted((cu + s * w / 2, cu + s * (w / 2 - 0.12)))
        box('trim', F, u0, u1, 0, dep, z + 0.85, z + 0.97, bottom=False)

def crown(F, u0, u1, brackets=True, e0=0.5, e1=0.5):
    """Венчающий карниз; на уличных фасадах — с кронштейнами."""
    band(F, u0 - 0.1, u1 + 0.1, 0, EAVE, EAVE + 0.25, 0.1)
    band(F, u0 - e0, u1 + e1, 0, EAVE + 0.43, COR, 0.55)
    if brackets:
        k = u0 + 0.45
        while k < u1 - 0.3:
            box('trim', F, k - 0.09, k + 0.09, 0.08, 0.5, EAVE + 0.2, EAVE + 0.43, bottom=False)
            k += 1.3
    else:
        band(F, u0 - 0.25, u1 + 0.25, 0, EAVE + 0.25, EAVE + 0.43, 0.28)

def pilaster_c(F, u0, u1):
    box('trim', F, u0, u1, -0.01, 0.12, BELT, EAVE, bottom=False)
    box('trim', F, u0 - 0.06, u1 + 0.06, -0.01, 0.17, EAVE - 0.35, EAVE, bottom=False)

def bays(L, step, margin):
    n = max(1, round((L - 2 * margin) / step))
    s = (L - 2 * margin) / n
    return [margin + s * (i + 0.5) for i in range(n)]

# ------------------------------------------------------------------ фасады
def main_facade():
    """Уличный фасад на Большую Морскую: аркада из пяти арок посередине."""
    F, L = frame_from(P[0], P[1], CEN)          # u — с юга на север
    mid, step = L / 2, 4.0
    axes = [mid + step * k for k in range(-7, 8)]
    arcs = [mid + step * k for k in range(-2, 3)]
    r, zs = 1.5, 2.65
    holes = []
    for cu in axes:
        if cu in arcs:
            holes.append((cu - r, cu + r, 0.0, zs + r, False))
        else:
            holes.append((cu - 1.2, cu + 1.2, 0.35, 3.55))
    wall_cut(F, 0, L, 0.0, GF, 0, holes, 'wall2')
    rust(F, 0, L, 0.35, GF, 0, holes)
    for cu in axes:
        if cu in arcs:
            arch_bay(F, cu, r, zs)
        else:
            quad('glass', F, cu - 1.2, cu + 1.2, 0.35, 3.55, -0.2)
            box('trim', F, cu - 0.04, cu + 0.04, -0.2, -0.14, 0.35, 3.55, bottom=False)
            box('trim', F, cu - 1.2, cu + 1.2, -0.2, -0.14, 2.75, 2.83, bottom=False)
            box('trim', F, cu - 0.22, cu + 0.22, -0.01, 0.12, 3.35, 3.95, bottom=False)   # замок
    box('stone', F, 0, L, -0.25, 0.08, GROUND, 0.35)
    band(F, -0.1, L + 0.1, 0, GF, BELT, 0.18)
    # верхние этажи: оси над арками и витринами; балконы на 2-м этаже над 1, 3, 5 аркой
    balc = {arcs[0], arcs[2], arcs[4]}
    holes = []
    for cu in axes:
        if cu in balc:
            holes.append(win(F, cu, BELT + 0.05, 1.3, 2.55, rich=True))
            balcony(F, cu, BELT + 0.02)
        else:
            holes.append(win(F, cu, BELT + 0.9, 1.4, 1.95, rich=True))
        holes.append(win(F, cu, F3 + 0.85, 1.4, 1.85, rich=True))
    wall_cut(F, 0, L, BELT, EAVE, 0, holes, 'wall')
    band(F, 0, L, 0, F3 + 0.05, F3 + 0.2, 0.06)
    pilaster_c(F, 0, 1.0); pilaster_c(F, L - 1.0, L)
    crown(F, 0, L)

def end_facade(a, b, inside, corner_at_start):
    """Северный и южный торцы на улицу: руст внизу, окна, карниз с кронштейнами."""
    F, L = frame_from(a, b, inside)
    axes = bays(L - 1.0, 3.8, 1.2)
    axes = [u + (1.0 if corner_at_start else 0.0) for u in axes]
    holes = [(cu - 1.0, cu + 1.0, 0.6, 3.3) for cu in axes]
    wall_cut(F, 0, L, 0.0, GF, 0, holes, 'wall2')
    rust(F, 0, L, 0.35, GF, 0, holes)
    for cu in axes:
        quad('glass', F, cu - 1.0, cu + 1.0, 0.6, 3.3, -0.2)
        box('trim', F, cu - 1.08, cu + 1.08, -0.02, 0.12, 0.5, 0.6, bottom=False)
    box('stone', F, 0, L, -0.25, 0.08, GROUND, 0.35)
    band(F, -0.1, L + 0.1, 0, GF, BELT, 0.18)
    holes = []
    for cu in axes:
        holes.append(win(F, cu, BELT + 0.9, 1.3, 1.95, rich=True))
        holes.append(win(F, cu, F3 + 0.85, 1.3, 1.85, rich=True))
    wall_cut(F, 0, L, BELT, EAVE, 0, holes, 'wall')
    band(F, 0, L, 0, F3 + 0.05, F3 + 0.2, 0.06)
    if corner_at_start: pilaster_c(F, 0, 1.0)
    else: pilaster_c(F, L - 1.0, L)
    crown(F, 0, L)

def yard_facade(a, b, inside):
    """Дворовые и восточные стены: гладкая штукатурка, простые окна, карниз без кронштейнов."""
    F, L = frame_from(a, b, inside)
    axes = bays(L, 3.6, 0.9) if L > 4 else []
    holes = []
    for cu in axes:
        holes.append(win(F, cu, 1.0, 1.2, 1.9, sill=False))
        holes.append(win(F, cu, BELT + 0.9, 1.2, 1.9, sill=False))
        holes.append(win(F, cu, F3 + 0.85, 1.2, 1.8, sill=False))
    wall_cut(F, 0, L, GROUND, EAVE, 0, holes, 'wall', reveal=0.18)
    crown(F, 0, L, brackets=False, e0=0.0, e1=0.0)

# ------------------------------------------------------------------ кровля
def offset_quad(Q, offs):
    """Сдвинуть рёбра четырёхугольника наружу на offs[i] и пересечь соседние."""
    c = sum((V2(q) for q in Q), Vector((0, 0))) / 4
    lines = []
    for i in range(4):
        a, b = V2(Q[i]), V2(Q[(i + 1) % 4])
        e = (b - a).normalized(); n = Vector((-e.y, e.x))
        if n.dot(c - a) > 0: n = -n
        lines.append((a + n * offs[i], e))
    out = []
    for i in range(4):
        (p1, e1), (p2, e2) = lines[i - 1], lines[i]
        den = e1.x * e2.y - e1.y * e2.x
        t = ((p2.x - p1.x) * e2.y - (p2.y - p1.y) * e2.x) / den
        out.append(p1 + e1 * t)
    return out

def hip_quad(Q, rise, ov, hip0=True, hip1=True):
    """Вальма над четырёхугольником A B C D (мир): A–B и D–C — длинные скаты,
    A–D и B–C — торцы; торец без вальмы уходит под соседнюю кровлю."""
    offs = [ov, ov if hip1 else 0.0, ov, ov if hip0 else 0.0]   # рёбра AB, BC, CD, DA
    A, B, C, D = [W(p.x, p.y) for p in offset_quad(Q, offs)]
    m0, m1 = (A + D) / 2, (B + C) / 2
    ax = (m1 - m0).normalized()
    w0, w1 = (A - D).length / 2, (B - C).length / 2
    R0 = m0 + ax * (w0 if hip0 else 0)
    R1 = m1 - ax * (w1 if hip1 else 0)
    z, zr = COR, COR + rise
    v = lambda p, h: Vector((p.x, p.y, h))
    face('roof', [v(A, z), v(B, z), v(R1, zr), v(R0, zr)], UP)
    face('roof', [v(C, z), v(D, z), v(R0, zr), v(R1, zr)], UP)
    if hip0: face('roof', [v(D, z), v(A, z), v(R0, zr)], UP)
    if hip1: face('roof', [v(B, z), v(C, z), v(R1, zr)], UP)
    face('trim', [v(A, z), v(B, z), v(C, z), v(D, z)], -UP)        # подшивка свеса
    beam('roof', v(R0, zr + 0.05), v(R1, zr + 0.05), 0.26, 0.14)

def roofs():
    ov = 0.55
    tan_a = RISE / (WD / 2 + ov)
    # основное крыло: концы по линиям северной и южной стен
    wing = [P[0], P[1], at_depth(P[1], P[2], WD), at_depth(P[0], P[7], WD)]
    hip_quad(wing, RISE, ov)
    # дворовые корпуса: скат положе крыла, чтобы внутри крыла их кровля уходила под его вальму
    half = WD / 2
    for a, b, c, d in ((P[1], P[2], P[3], P[4]), (P[0], P[7], P[6], P[5])):
        Q = [at_depth(a, b, half), b, c, at_depth(d, c, half)]
        dep = (V2(b) - V2(c)).length
        hip_quad(Q, 0.88 * tan_a * (dep / 2 + ov), ov, hip0=False)

main_facade()
end_facade(P[1], P[2], inside_pt(P[1], P[2]), True)
end_facade(P[7], P[0], inside_pt(P[7], P[0]), False)
for i in (2, 3, 4, 5, 6):
    yard_facade(P[i], P[i + 1], inside_pt(P[i], P[i + 1]))
roofs()

finish('bm3', __file__)
