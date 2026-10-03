# Набор для сборки зданий игры в Blender: стены с проёмами, окна, наличники,
# карнизы, кровли, ордер — и выгрузка в GLB двух уровней детализации.
#
# Скрипт дома лежит в models/<имя>/build.py и начинается так:
#     import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
#     from kit import *
#     origin(X0, Z0)          # точка мира, в которой у модели начало координат
#     ... геометрия ...
#     finish('имя', __file__)
#
# Координаты Blender: X = мир.x − X0, Y = −(мир.z − Z0), Z вверх; ноль высоты —
# земля у точки (X0, Z0). glTF при экспорте переводит это в оси игры сам, так
# что модель ставится в мир без поворота.
#
# Фасад описывается рамкой Frame(o, u, n): o — точка на стене в плане, u — вдоль
# стены, n — наружу. Все примитивы принимают (u, d, z): вдоль, наружу, вверх.
import bpy, bmesh, math, sys, os
from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
_O = [0.0, 0.0]

def origin(x0, z0):
    _O[0], _O[1] = x0, z0

def W(x, z):
    """Точка мира (x, z) → плоскость Blender."""
    return Vector((x - _O[0], -(z - _O[1])))

def frame_from(a, b, inside):
    """Рамка фасада по двум точкам мира; inside — любая точка мира внутри дома."""
    o = W(*a); u = (W(*b) - o).normalized()
    n = Vector((-u.y, u.x))
    if n.dot(W(*inside) - o) > 0: n = -n
    return Frame(o, u, n), (W(*b) - o).length

# ------------------------------------------------------------------ материалы
COL = {                       # sRGB, шероховатость
    'wall':  ((0.86, 0.73, 0.38), 0.9),    # охристая штукатурка
    'trim':  ((0.93, 0.91, 0.85), 0.85),   # белёные детали
    'stone': ((0.60, 0.58, 0.54), 0.9),    # цоколь, ступени
    'roof':  ((0.62, 0.25, 0.17), 0.8),    # черепица
    'glass': ((0.07, 0.10, 0.13), 0.15),
    'wood':  ((0.25, 0.15, 0.09), 0.6),
    'metal': ((0.16, 0.17, 0.18), 0.5),
}
SMOOTH = {'trim_s'}           # колонны: гладкие нормали
BM = {}

def bm_of(m):
    if m not in BM:
        BM[m] = bmesh.new()
    return BM[m]

def face(m, pts, hint=None):
    bm = bm_of(m)
    try:
        f = bm.faces.new([bm.verts.new(p) for p in pts])
    except ValueError:
        return None
    if hint is not None:
        f.normal_update()
        if f.normal.dot(hint) < 0:
            f.normal_flip()
    return f

class Frame:
    """Плоскость фасада: o — точка, u — вдоль стены, n — наружу."""
    def __init__(self, o, u, n):
        self.o, self.u, self.n = o, u.normalized(), n.normalized()
    def p(self, u, d, z):
        v = self.o + self.u * u + self.n * d
        return Vector((v.x, v.y, z))
    def U(self): return Vector((self.u.x, self.u.y, 0))
    def N(self): return Vector((self.n.x, self.n.y, 0))

UP = Vector((0, 0, 1))

def box(m, F, u0, u1, d0, d1, z0, z1, bottom=True):
    c = F.p((u0 + u1) / 2, (d0 + d1) / 2, (z0 + z1) / 2)
    P = lambda u, d, z: F.p(u, d, z)
    quads = [
        [P(u0, d1, z0), P(u1, d1, z0), P(u1, d1, z1), P(u0, d1, z1)],
        [P(u0, d0, z0), P(u1, d0, z0), P(u1, d0, z1), P(u0, d0, z1)],
        [P(u0, d0, z0), P(u0, d1, z0), P(u0, d1, z1), P(u0, d0, z1)],
        [P(u1, d0, z0), P(u1, d1, z0), P(u1, d1, z1), P(u1, d0, z1)],
        [P(u0, d0, z1), P(u1, d0, z1), P(u1, d1, z1), P(u0, d1, z1)],
    ]
    if bottom:
        quads.append([P(u0, d0, z0), P(u1, d0, z0), P(u1, d1, z0), P(u0, d1, z0)])
    for q in quads:
        cq = sum(q, Vector()) / 4
        face(m, q, cq - c)

def prism_uz(m, F, poly, d0, d1):
    """Многоугольник в плоскости фасада (u, z), вытянутый по глубине."""
    a = [F.p(u, d0, z) for u, z in poly]
    b = [F.p(u, d1, z) for u, z in poly]
    s = 1 if d1 > d0 else -1
    face(m, b, F.N() * s)
    face(m, a, F.N() * -s)
    cu = sum(u for u, z in poly) / len(poly); cz = sum(z for u, z in poly) / len(poly)
    c = F.p(cu, (d0 + d1) / 2, cz)
    n = len(poly)
    for i in range(n):
        j = (i + 1) % n
        q = [a[i], a[j], b[j], b[i]]
        face(m, q, sum(q, Vector()) / 4 - c)

def prism_plan(m, F, poly, z0, z1, top=True):
    """Многоугольник в плане (u, d), вытянутый по высоте."""
    a = [F.p(u, d, z0) for u, d in poly]
    b = [F.p(u, d, z1) for u, d in poly]
    if top:
        face(m, b, UP)
    c = sum(a, Vector()) / len(a) + UP * (z1 - z0) / 2
    n = len(poly)
    for i in range(n):
        j = (i + 1) % n
        q = [a[i], a[j], b[j], b[i]]
        face(m, q, sum(q, Vector()) / 4 - c)

def beam(m, p0, p1, w, h=None):
    """Брус между двумя точками."""
    h = h or w
    ax = (p1 - p0).normalized()
    side = ax.cross(UP)
    if side.length < 1e-4:
        side = Vector((1, 0, 0))
    side.normalize(); up = side.cross(ax).normalized()
    ring = lambda p: [p + side * sx * w / 2 + up * sz * h / 2 for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    a, b = ring(p0), ring(p1)
    c = (p0 + p1) / 2
    for i in range(4):
        j = (i + 1) % 4
        q = [a[i], a[j], b[j], b[i]]
        face(m, q, sum(q, Vector()) / 4 - c)
    face(m, a, -ax); face(m, b, ax)

def lathe(m, base, prof, seg=20, cap=True):
    """Тело вращения: prof = [(r, z)], base — точка оси на нуле."""
    bm = bm_of(m)
    rings = []
    for r, z in prof:
        rings.append([bm.verts.new(base + Vector((r * math.cos(2 * math.pi * k / seg),
                                                  r * math.sin(2 * math.pi * k / seg), z)))
                      for k in range(seg)])
    for i in range(len(rings) - 1):
        for k in range(seg):
            j = (k + 1) % seg
            f = bm.faces.new([rings[i][k], rings[i][j], rings[i + 1][j], rings[i + 1][k]])
            f.smooth = True
    if cap:
        f = bm.faces.new(rings[-1]); f.normal_update()
        if f.normal.z < 0: f.normal_flip()

# ------------------------------------------------------------------ стена с проёмами
def wall(F, u0, u1, z0, z1, d, holes, m='wall', reveal=0.24, rm='trim'):
    """Плоскость стены на глубине d с прямоугольными проёмами (ua, ub, za, zb)."""
    us = sorted({u0, u1, *[h[0] for h in holes], *[h[1] for h in holes]})
    zs = sorted({z0, z1, *[h[2] for h in holes], *[h[3] for h in holes]})
    us = [u for u in us if u0 - 1e-6 <= u <= u1 + 1e-6]
    zs = [z for z in zs if z0 - 1e-6 <= z <= z1 + 1e-6]
    for i in range(len(us) - 1):
        for k in range(len(zs) - 1):
            cu, cz = (us[i] + us[i + 1]) / 2, (zs[k] + zs[k + 1]) / 2
            if any(h[0] < cu < h[1] and h[2] < cz < h[3] for h in holes):
                continue
            face(m, [F.p(us[i], d, zs[k]), F.p(us[i + 1], d, zs[k]),
                     F.p(us[i + 1], d, zs[k + 1]), F.p(us[i], d, zs[k + 1])], F.N())
    for ua, ub, za, zb in holes:      # откосы
        r = d - reveal
        face(rm, [F.p(ua, d, za), F.p(ua, r, za), F.p(ua, r, zb), F.p(ua, d, zb)], F.U())
        face(rm, [F.p(ub, d, za), F.p(ub, r, za), F.p(ub, r, zb), F.p(ub, d, zb)], -F.U())
        face(rm, [F.p(ua, d, zb), F.p(ub, d, zb), F.p(ub, r, zb), F.p(ua, r, zb)], -UP)
        face(rm, [F.p(ua, d, za), F.p(ub, d, za), F.p(ub, r, za), F.p(ua, r, za)], UP)

def glazing(F, ua, ub, za, zb, d, cols=2, rows=(0.68,), reveal=0.24, glass='glass'):
    """Стекло в глубине проёма и переплёт."""
    g = d - reveal + 0.02
    face(glass, [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
    t = 0.06
    f0, f1 = g, g + 0.07
    box('trim', F, ua, ua + t, f0, f1, za, zb); box('trim', F, ub - t, ub, f0, f1, za, zb)
    box('trim', F, ua, ub, f0, f1, za, za + t); box('trim', F, ua, ub, f0, f1, zb - t, zb)
    for c in range(1, cols):
        u = ua + (ub - ua) * c / cols
        box('trim', F, u - t / 2, u + t / 2, f0, f1, za, zb)
    for r in rows:
        z = za + (zb - za) * r
        box('trim', F, ua, ub, f0, f1, z - t / 2, z + t / 2)

def surround(F, ua, ub, za, zb, d, kind='plain'):
    """Наличник: простой или с рустом и треугольным сандриком."""
    if kind == 'plain':
        w, pr = 0.16, 0.05
        box('trim', F, ua - w, ua, d, d + pr, za, zb + w)
        box('trim', F, ub, ub + w, d, d + pr, za, zb + w)
        box('trim', F, ua, ub, d, d + pr, zb, zb + w)
        box('trim', F, ua - w - 0.04, ub + w + 0.04, d, d + 0.13, za - 0.1, za)
        return
    # рустованные лопатки по бокам
    w = 0.42
    z = za - 0.1
    k = 0
    while z < zb - 0.05:
        h = min(0.34, zb - z)
        pr = 0.10 if k % 2 == 0 else 0.07
        ww = w if k % 2 == 0 else w - 0.09
        box('trim', F, ua - ww, ua, d, d + pr, z, z + h - 0.035)
        box('trim', F, ub, ub + ww, d, d + pr, z, z + h - 0.035)
        z += h; k += 1
    box('trim', F, ua - w - 0.08, ub + w + 0.08, d, d + 0.16, za - 0.22, za - 0.1)     # подоконник
    zc = zb + 0.02
    box('trim', F, ua - w - 0.05, ub + w + 0.05, d, d + 0.12, zc, zc + 0.16)            # архитрав
    hw = (ub - ua) / 2 + w + 0.22
    cu = (ua + ub) / 2
    zp = zc + 0.16
    box('trim', F, cu - hw, cu + hw, d, d + 0.24, zp, zp + 0.09)                          # полка
    rise = 0.62
    prism_uz('wall', F, [(cu - hw + 0.12, zp + 0.09), (cu + hw - 0.12, zp + 0.09), (cu, zp + rise)], d, d + 0.06)
    for s in (-1, 1):                                                                    # скаты сандрика
        prism_uz('trim', F, [(cu + s * hw, zp + 0.09), (cu + s * hw, zp + 0.21),
                             (cu, zp + rise + 0.14), (cu, zp + rise)], d, d + 0.26)

def window(F, cu, za, w, h, d, kind='plain', cols=2, rows=(0.68,)):
    surround(F, cu - w / 2, cu + w / 2, za, za + h, d, kind)
    glazing(F, cu - w / 2, cu + w / 2, za, za + h, d, cols, rows)
    return (cu - w / 2, cu + w / 2, za, za + h)

def band(F, u0, u1, d, z0, z1, pr, m='trim'):
    box(m, F, u0, u1, d - 0.02, d + pr, z0, z1)

def cornice(F, u0, u1, d, z, ext=0.5):
    """Венчающий карниз крыла: три полки с нарастающим вылетом, z — низ."""
    band(F, u0 - 0.10, u1 + 0.10, d, z, z + 0.22, 0.10)
    band(F, u0 - 0.28, u1 + 0.28, d, z + 0.22, z + 0.42, 0.28)
    band(F, u0 - ext, u1 + ext, d, z + 0.42, z + 0.60, ext)

def hip_roof(F, u0, u1, d0, d1, z, rise, ov=0.55, hip0=True, hip1=True, m='roof'):
    """Вальмовая крыша над прямоугольником; d0 > d1."""
    a, b, c, e = u0 - (ov if hip0 else 0), u1 + (ov if hip1 else 0), d0 + ov, d1 - ov
    half = (c - e) / 2
    dm = (c + e) / 2
    r0 = a + (half if hip0 else 0)
    r1 = b - (half if hip1 else 0)
    R0, R1 = F.p(r0, dm, z + rise), F.p(r1, dm, z + rise)
    A, B, C, D = F.p(a, c, z), F.p(b, c, z), F.p(b, e, z), F.p(a, e, z)
    face(m, [A, B, R1, R0], F.N() + UP)
    face(m, [C, D, R0, R1], -F.N() + UP)
    if hip0: face(m, [D, A, R0], -F.U() + UP)
    else:    face('wall', [D, A, R0], -F.U())
    if hip1: face(m, [B, C, R1], F.U() + UP)
    else:    face('wall', [B, C, R1], F.U())
    face('trim', [A, B, C, D], -UP)            # подшивка свеса
    # конёк
    beam('roof', R0 + UP * 0.05, R1 + UP * 0.05, 0.28, 0.16)

def dormer(F, cu, d_front, zb, r=0.85, depth=3.2):
    """Слуховое окно «бычий глаз» — полукруг, уходящий в скат."""
    n = 10
    arc = [(cu + r * math.cos(math.pi * k / n), zb + r * math.sin(math.pi * k / n)) for k in range(n + 1)]
    prism_uz('roof', F, arc, d_front - depth, d_front)
    ri = r - 0.16
    arc2 = [(cu + ri * math.cos(math.pi * k / n), zb + 0.1 + ri * math.sin(math.pi * k / n)) for k in range(n + 1)]
    face('trim', [F.p(u, d_front + 0.02, z) for u, z in arc], F.N())
    face('glass', [F.p(u, d_front + 0.04, z) for u, z in arc2], F.N())

def chimney(F, u, d, z0, z1, w=0.75):
    box('wall', F, u - w / 2, u + w / 2, d - w / 2, d + w / 2, z0, z1)
    box('trim', F, u - w / 2 - 0.08, u + w / 2 + 0.08, d - w / 2 - 0.08, d + w / 2 + 0.08, z1, z1 + 0.14)

# ------------------------------------------------------------------ ордер
def corinthian(base, H=9.6, D=1.1, seg=20):
    """Колонна: аттическая база, гладкий ствол с энтазисом, коринфская капитель."""
    R = D / 2
    F0 = Frame(Vector((base.x, base.y)), Vector((1, 0)), Vector((0, 1)))
    box('trim', F0, -0.77 * D / 1.1, 0.77 * D / 1.1, -0.77 * D / 1.1, 0.77 * D / 1.1, base.z, base.z + 0.2)
    k = D / 1.1
    prof = [(0.74, 0.20), (0.78, 0.25), (0.78, 0.30), (0.73, 0.35), (0.66, 0.37), (0.63, 0.42),
            (0.66, 0.47), (0.69, 0.49), (0.70, 0.53), (0.67, 0.57), (0.585, 0.60)]
    prof = [(r * k, z * k) for r, z in prof]
    cap_h = 1.17 * D
    zs0, zs1 = 0.60 * k, H - cap_h
    n = 10
    for i in range(n + 1):
        t = i / n
        prof.append((R - (R * 0.15) * t ** 1.8, zs0 + (zs1 - zs0) * t))
    rt = R * 0.85
    prof += [(rt + 0.04, zs1 - 0.07), (rt + 0.05, zs1 - 0.035), (rt + 0.04, zs1)]
    # колокол капители
    bell = lambda t: rt + 0.01 + (0.66 * D - rt) * t ** 2.2
    nb = 6
    zb1 = H - 0.17 * D
    for i in range(nb + 1):
        t = i / nb
        prof.append((bell(t), zs1 + (zb1 - zs1) * t))
    lathe('trim_s', base, prof, seg, cap=True)
    # абака с вогнутыми сторонами
    a = 0.80 * D; c = 0.66 * D; ch = 0.10 * D
    pts = []
    for q in range(4):
        ang = q * math.pi / 2
        ca, sa = math.cos(ang), math.sin(ang)
        loc = [(a, -a + ch), (c + 0.03, -a * 0.45), (c, 0), (c + 0.03, a * 0.45), (a, a - ch)]
        for x, y in loc:
            pts.append((x * ca - y * sa, x * sa + y * ca))
    prism_plan('trim', F0, pts, base.z + zb1, base.z + H)
    # два яруса листьев аканта и угловые волюты
    def leaf(ang, z0, z1, w, curl, off):
        ca, sa = math.cos(ang), math.sin(ang)
        tang = Vector((-sa, ca, 0)); rad = Vector((ca, sa, 0))
        m = 5
        prev = None
        for i in range(m + 1):
            t = i / m
            z = z0 + (z1 - z0) * (t if t < 0.82 else 0.82 + (t - 0.82) * 0.35 - (t - 0.82) ** 2 * 6)
            tb = (z - zs1) / (zb1 - zs1)
            r = bell(max(0, min(1, tb))) + off + curl * t ** 3
            ww = w * (1 - 0.55 * t ** 2) / 2
            c0 = base + rad * r + UP * z
            cur = (c0 - tang * ww, c0 + tang * ww)
            if prev:
                f = face('trim_s', [prev[0], prev[1], cur[1], cur[0]], rad)
                if f: f.smooth = True
            prev = cur
    for q in range(8):
        leaf(q * math.pi / 4, zs1 + 0.02, zs1 + 0.50 * D, 0.36 * D, 0.22 * D, 0.045)
    for q in range(8):
        leaf(q * math.pi / 4 + math.pi / 8, zs1 + 0.02, zs1 + 0.86 * D, 0.36 * D, 0.24 * D, 0.03)
    for q in range(4):
        ang = math.pi / 4 + q * math.pi / 2
        ca, sa = math.cos(ang), math.sin(ang)
        rad = Vector((ca, sa, 0)); tang = Vector((-sa, ca, 0))
        leaf(ang, zs1 + 0.60 * D, zb1 - 0.02, 0.16 * D, 0.30 * D, 0.03)
        c0 = base + rad * (0.97 * D) + UP * (zb1 - 0.15 * D)
        bm = bm_of('trim_s')
        rr = 0.15 * D; sg = 10
        ra = [bm.verts.new(c0 - tang * 0.07 * D + (rad * math.cos(2 * math.pi * i / sg) + UP * math.sin(2 * math.pi * i / sg)) * rr) for i in range(sg)]
        rb = [bm.verts.new(c0 + tang * 0.07 * D + (rad * math.cos(2 * math.pi * i / sg) + UP * math.sin(2 * math.pi * i / sg)) * rr) for i in range(sg)]
        for i in range(sg):
            j = (i + 1) % sg
            bm.faces.new([ra[i], ra[j], rb[j], rb[i]]).smooth = True
        bm.faces.new(ra); bm.faces.new(rb)

def pilaster(F, cu, d, z0, H, w=0.95, pr=0.16):
    box('trim', F, cu - w / 2 - 0.08, cu + w / 2 + 0.08, d, d + pr + 0.06, z0, z0 + 0.45)
    box('trim', F, cu - w / 2, cu + w / 2, d, d + pr, z0 + 0.45, z0 + H - 1.25)
    box('trim', F, cu - w / 2 - 0.03, cu + w / 2 + 0.03, d, d + pr + 0.03, z0 + H - 1.32, z0 + H - 1.25)
    # капитель пилястры: расширяющийся блок и листья-накладки
    prism_uz('trim', F, [(cu - w / 2, z0 + H - 1.25), (cu + w / 2, z0 + H - 1.25),
                         (cu + w / 2 + 0.16, z0 + H - 0.18), (cu - w / 2 - 0.16, z0 + H - 0.18)], d, d + pr + 0.06)
    for i in (-1, 0, 1):
        box('trim', F, cu + i * 0.3 - 0.11, cu + i * 0.3 + 0.11, d, d + pr + 0.13, z0 + H - 1.22, z0 + H - 0.80)
    for i in (-0.5, 0.5):
        box('trim', F, cu + i * 0.3 - 0.11, cu + i * 0.3 + 0.11, d, d + pr + 0.10, z0 + H - 0.80, z0 + H - 0.45)
    box('trim', F, cu - w / 2 - 0.2, cu + w / 2 + 0.2, d, d + pr + 0.14, z0 + H - 0.18, z0 + H)


# ------------------------------------------------------------------ выгрузка
# Дальний уровень: только масса дома — стены, кровля, цоколь, стёкла и колонны.
# Наличники, карнизы, переплёты и решётки с трёхсот метров не видны, а весят
# три четверти треугольников.
LOD_KEEP = {'wall', 'roof', 'stone', 'glass', 'trim_s', 'wall2', 'wall3'}

def finish(name, script, tri_budget=None):
    here = os.path.dirname(os.path.abspath(script))
    meshes = {}
    for key, bm in BM.items():
        if key in SMOOTH:
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        meshes[key] = bm
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = {}
    for mname, (rgb, rough) in COL.items():
        m = bpy.data.materials.new(mname)
        m.use_nodes = True
        b = m.node_tree.nodes.get('Principled BSDF')
        b.inputs['Base Color'].default_value = (*[c ** 2.2 for c in rgb], 1)
        b.inputs['Roughness'].default_value = rough
        m.use_backface_culling = False
        mats[mname] = m
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    tris, low = 0, 0
    for key, bm in meshes.items():
        mname = key[:-2] if key in SMOOTH else key
        me = bpy.data.meshes.new(name + '_' + key)
        bm.to_mesh(me); bm.free()
        me.materials.append(mats[mname])
        if key in SMOOTH:
            me.set_sharp_from_angle(angle=math.radians(40))
        ob = bpy.data.objects.new(name + '_' + key, me)
        col.objects.link(ob)
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)
        if key in LOD_KEEP: low += len(me.loop_triangles)
        print('  %-8s %6d' % (key, len(me.loop_triangles)))
    BM.clear()
    print('ТРЕУГОЛЬНИКОВ:', tris, '· дальний уровень:', low)
    if tri_budget and tris > tri_budget:
        print('ПРЕВЫШЕН БЮДЖЕТ', tri_budget)
    os.makedirs(os.path.join(here, 'out'), exist_ok=True)
    bpy.context.scene['origin'] = list(_O)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(here, name + '.blend'))
    if 'glb' in ARGS:
        d = os.path.normpath(os.path.join(here, '..', '..', 'data', 'models'))
        os.makedirs(d, exist_ok=True)
        out = os.path.join(d, name + '.glb')
        bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_yup=True)
        for ob in list(col.objects):
            if ob.name[len(name) + 1:] not in LOD_KEEP:
                bpy.data.objects.remove(ob)
        lo = os.path.join(d, name + '.lod.glb')
        bpy.ops.export_scene.gltf(filepath=lo, export_format='GLB', export_apply=True, export_yup=True)
        print('GLB:', os.path.getsize(out) // 1024, 'КБ · дальний', os.path.getsize(lo) // 1024, 'КБ')
