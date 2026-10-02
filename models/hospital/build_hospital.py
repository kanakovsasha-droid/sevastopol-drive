# Городская больница №1 им. Пирогова на площади Восставших — модель с нуля.
#
#   blender -b --python models/hospital/build_hospital.py -- [glb] [render <кадр>]
#
# План снят с контура OSM way 91744608 и спутника (tools/sat.html), фасады — с
# панорам Яндекса 2020 года. Координаты Blender: X = мир.x − X0, Y = −(мир.z − Z0),
# Z вверх; ноль высоты — тротуар у подножия лестницы портика. glTF при экспорте
# сам переводит это в систему игры, так что модель ставится в (X0, земля, Z0)
# без поворота.
import bpy, bmesh, math, sys, os
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []

X0, Z0 = -761.3, 1638.7          # середина фасада портика (точка P15 контура)

def W(x, z):
    return Vector((x - X0, -(z - Z0)))

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

# ================================================================== ЗДАНИЕ
# Опорные точки контура OSM (мир x, z)
P = {0: (-752.6, 1632.0), 1: (-710.6, 1619.0), 12: (-798.7, 1671.0), 13: (-760.2, 1646.6),
     14: (-764.4, 1644.4), 15: (-761.3, 1638.7), 16: (-758.2, 1633.1), 17: (-755.3, 1634.6)}

t = (W(*P[16]) - W(*P[14])).normalized()                 # вдоль фасада портика, на север
nrm = Vector((-t.y, t.x))                                 # наружу
if nrm.dot(W(-738, 1637.5) - W(*P[15])) > 0:
    nrm = -nrm
FP = Frame(W(*P[15]), t, nrm)

GROUND = -3.0            # стены уходят под землю: участок с уклоном
ST = 1.5                 # высота стилобата
COLH, COLD = 9.6, 1.1
EAVE = 10.3              # верх карниза крыльев
ENT0 = ST + COLH         # низ антаблемента 11.1
ENT1 = ENT0 + 1.3        # верх фриза 12.4
COR1 = ENT1 + 0.7        # верх карниза 13.1
HALF = 6.07              # полуширина антаблемента по архитраву
BACK = -3.7              # стена за колоннами
DC = -0.82               # ось колонн
REAR = -17.0

def build_portico():
    F = FP
    # стилобат и лестница
    box('stone', F, -6.5, 6.5, BACK, 0.12, GROUND, ST - 0.06)
    box('trim', F, -6.55, 6.55, BACK, 0.17, ST - 0.06, ST)
    n, rise, run = 9, ST / 9, 0.34
    for i in range(n):
        top = ST - rise * (i + 1)
        box('stone', F, -4.75, 4.75, 0.12, 0.12 + run * (i + 1) + 0.02, top - rise - (0 if i < n - 1 else 3), top)
    for s in (-1, 1):       # тумбы по сторонам лестницы
        u0, u1 = sorted((s * 4.75, s * 6.5))
        box('stone', F, u0, u1, 0.12, 1.9, GROUND, ST - 0.12)
        box('trim', F, u0 - 0.05, u1 + 0.05, 0.12, 1.96, ST - 0.12, ST)
        box('stone', F, u0, u1, 1.9, 3.3, GROUND, 0.75)
        box('trim', F, u0 - 0.05, u1 + 0.05, 1.9, 3.36, 0.75, 0.87)
    for s in (-1.6, 1.6):   # перила
        a, b = F.p(s, 0.3, ST + 0.9), F.p(s, 0.12 + run * n, 0.9)
        beam('metal', a, b, 0.05)
        beam('metal', a + UP * -0.45, b + UP * -0.45, 0.03)
        for k in range(4):
            q = a + (b - a) * (k / 3)
            beam('metal', q, q - UP * 0.9, 0.04)
    # колонны и пилястры
    axes = (-5.5, -1.95, 1.95, 5.5)
    for u in axes:
        corinthian(F.p(u, DC, ST), COLH, COLD)
        pilaster(F, u, BACK, ST, COLH)
    # стена за колоннами
    door = (-0.95, 0.95, ST, ST + 3.1)
    holes = [door, (-4.4, -3.1, ST + 0.95, ST + 3.0), (3.1, 4.4, ST + 0.95, ST + 3.0)]
    zs, r, sill = 8.55, 0.98, 5.55           # пята арки, радиус, подоконник
    arches = [-3.72, 0.0, 3.72]
    for cu in arches:
        holes.append((cu - r, cu + r, sill, zs + r))
    wall(F, -6.0, 6.0, ST, ENT1, BACK, holes)
    # дверь
    g = BACK - 0.22
    face('wood', [F.p(-0.95, g, ST), F.p(0.95, g, ST), F.p(0.95, g, ST + 2.35), F.p(-0.95, g, ST + 2.35)], F.N())
    face('glass', [F.p(-0.95, g, ST + 2.35), F.p(0.95, g, ST + 2.35), F.p(0.95, g, ST + 3.1), F.p(-0.95, g, ST + 3.1)], F.N())
    box('trim', F, -0.03, 0.03, g, g + 0.05, ST, ST + 3.1)
    box('trim', F, -0.95, 0.95, g, g + 0.07, ST + 2.32, ST + 2.40)
    box('trim', F, -1.25, -0.95, BACK, BACK + 0.14, ST, ST + 3.3)
    box('trim', F, 0.95, 1.25, BACK, BACK + 0.14, ST, ST + 3.3)
    box('trim', F, -1.25, 1.25, BACK, BACK + 0.14, ST + 3.1, ST + 3.5)
    box('trim', F, -1.5, 1.5, BACK, BACK + 0.32, ST + 3.5, ST + 3.68)
    for cu in (-3.75, 3.75):
        surround(F, cu - 0.65, cu + 0.65, ST + 0.95, ST + 3.0, BACK)
        glazing(F, cu - 0.65, cu + 0.65, ST + 0.95, ST + 3.0, BACK)
    band(F, -6.0, 6.0, BACK, ST + 3.95, ST + 4.15, 0.08)          # междуэтажный пояс
    # арочные окна: заполнение углов, архивольт, стекло
    seg = 14
    for cu in arches:
        arc = [(cu + r * math.cos(math.pi * k / seg), zs + r * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
        hs = seg // 2
        face('wall', [F.p(cu + r, BACK, zs + r)] + [F.p(u, BACK, z) for u, z in arc[:hs + 1]], F.N())
        face('wall', [F.p(cu - r, BACK, zs + r)] + [F.p(u, BACK, z) for u, z in arc[hs:]], F.N())
        for k in range(seg):
            (ua, za), (ub, zb) = arc[k], arc[k + 1]
            face('trim', [F.p(ua, BACK, za), F.p(ub, BACK, zb), F.p(ub, BACK - 0.24, zb), F.p(ua, BACK - 0.24, za)],
                 F.p(cu, BACK, zs) - F.p((ua + ub) / 2, BACK, (za + zb) / 2))
            ro = r + 0.26                                         # архивольт
            oa = (cu + ro * math.cos(math.pi * k / seg), zs + ro * math.sin(math.pi * k / seg))
            ob = (cu + ro * math.cos(math.pi * (k + 1) / seg), zs + ro * math.sin(math.pi * (k + 1) / seg))
            face('trim', [F.p(ua, BACK + 0.07, za), F.p(ub, BACK + 0.07, zb), F.p(ob[0], BACK + 0.07, ob[1]), F.p(oa[0], BACK + 0.07, oa[1])], F.N())
            face('trim', [F.p(oa[0], BACK, oa[1]), F.p(ob[0], BACK, ob[1]), F.p(ob[0], BACK + 0.07, ob[1]), F.p(oa[0], BACK + 0.07, oa[1])],
                 F.p((oa[0] + ob[0]) / 2, BACK, (oa[1] + ob[1]) / 2) - F.p(cu, BACK, zs))
        box('trim', F, cu - r - 0.26, cu - r, BACK, BACK + 0.07, sill, zs)       # наличник по бокам
        box('trim', F, cu + r, cu + r + 0.26, BACK, BACK + 0.07, sill, zs)
        box('trim', F, cu - r - 0.4, cu + r + 0.4, BACK, BACK + 0.16, sill - 0.14, sill)
        gd = BACK - 0.22
        face('glass', [F.p(cu - r, gd, sill), F.p(cu + r, gd, sill)] + [F.p(u, gd, z) for u, z in arc], F.N())
        for dx in (-r / 3, r / 3):                                 # переплёт
            top = zs + math.sqrt(r * r - dx * dx)
            box('trim', F, cu + dx - 0.03, cu + dx + 0.03, gd, gd + 0.06, sill, top)
        for z in (sill + 0.03, sill + 0.75, sill + 1.5, sill + 2.25, zs):
            box('trim', F, cu - r, cu + r, gd, gd + 0.06, z - 0.03, z + 0.03)
    for a, b in ((-6.0, -4.9), (-2.54, -1.18), (1.18, 2.54), (4.9, 6.0)):   # импост в уровне пят арок
        band(F, a, b, BACK, zs - 0.12, zs + 0.06, 0.07)
    # центральный объём за портиком
    for s in (-1, 1):
        Fs = Frame(F.o + F.u * (s * 6.0), F.n, F.u * s)
        wall(Fs, REAR, BACK, GROUND, ENT1, 0, [])
        band(Fs, REAR, BACK, 0, ENT0, ENT0 + 0.6, 0.07)
        box('trim', Fs, BACK - 1.0, BACK, 0, 0.16, ST, ENT0)       # угловая лопатка
    box('wall', F, -6.0, 6.0, REAR, REAR + 0.3, GROUND, ENT1 + 2)
    box('trim', F, -5.6, 5.6, BACK, DC + 0.5, ENT0 + 0.55, ENT0 + 0.62)      # потолок портика
    # антаблемент: архитрав (белый), фриз (охра), карниз с модульонами
    def ring(z0, z1, off, m):
        h = HALF + off
        box(m, F, -h, h, DC - 0.47, DC + 0.47 + off, z0, z1)
        for s in (-1, 1):
            u0, u1 = sorted((s * (HALF - 0.94), s * h))
            box(m, F, u0, u1, REAR, DC + 0.47 + off, z0, z1)
    ring(ENT0, ENT0 + 0.32, 0.0, 'trim')
    ring(ENT0 + 0.32, ENT0 + 0.6, 0.04, 'trim')
    ring(ENT0 + 0.6, ENT1, 0.0, 'wall')
    ring(ENT1, ENT1 + 0.16, 0.10, 'trim')
    ring(ENT1 + 0.42, ENT1 + 0.58, 0.58, 'trim')
    ring(ENT1 + 0.58, COR1, 0.70, 'trim')
    ring(ENT1 + 0.16, ENT1 + 0.42, 0.06, 'trim')
    fr = DC + 0.47
    for i in range(-11, 12):                                       # модульоны по фасаду
        u = i * 0.56
        box('trim', F, u - 0.11, u + 0.11, fr, fr + 0.5, ENT1 + 0.18, ENT1 + 0.42)
    for s in (-1, 1):                                              # и по бокам
        Fs = Frame(F.o + F.u * (s * HALF), F.n, F.u * s)
        dd = fr - 0.56
        while dd > REAR + 4:
            box('trim', Fs, dd - 0.11, dd + 0.11, 0, 0.5, ENT1 + 0.18, ENT1 + 0.42)
            dd -= 0.56
    # фронтон
    ov = HALF + 0.70
    sl = math.tan(math.radians(21.5))
    apex = COR1 + ov * sl
    prism_uz('wall', F, [(-HALF, COR1), (HALF, COR1), (0, COR1 + HALF * sl)], fr - 0.4, fr)
    bt = 0.44
    for s in (-1, 1):
        prism_uz('trim', F, [(s * ov, COR1), (0, apex), (0, apex - bt), (s * (ov - bt / sl), COR1)], fr - 0.2, fr + 0.70)
        prism_uz('trim', F, [(s * ov, COR1 - 0.02), (0, apex + 0.1), (0, apex), (s * ov, COR1 - 0.12)], fr - 0.2, fr + 0.78)
        k = 1
        while k * 0.56 < ov - 1.4:                                 # модульоны по скатам
            u = s * k * 0.56
            zt = apex - abs(u) * sl - bt
            box('trim', F, u - 0.11, u + 0.11, fr, fr + 0.46, zt - 0.24, zt + 0.02)
            k += 1
    # двускатная кровля центрального объёма
    for s in (-1, 1):
        face('roof', [F.p(s * (ov + 0.06), fr + 0.74, COR1 + 0.04), F.p(0, fr + 0.74, apex + 0.14),
                      F.p(0, REAR, apex + 0.14), F.p(s * (ov + 0.06), REAR, COR1 + 0.04)], F.U() * s + UP)
    prism_uz('wall', F, [(-HALF, COR1), (HALF, COR1), (0, apex)], REAR, REAR + 0.3)

def facade_rows(F, u0, u1, d, bays, kinds=True, z_cor=EAVE - 0.6):
    """Двухэтажный фасад крыла: цоколь, окна в два ряда, пояс, карниз."""
    L = u1 - u0
    step = L / bays
    holes, wins = [], []
    for i in range(bays):
        cu = u0 + step * (i + 0.5)
        pedim = kinds and i % 3 == 1
        wins.append((cu, 2.25, 1.3, 2.15, 'rust' if pedim else 'plain'))
        wins.append((cu, 6.35, 1.3, 2.25, 'plain'))
    for cu, za, w, h, kind in wins:
        holes.append((cu - w / 2, cu + w / 2, za, za + h))
    wall(F, u0, u1, 0.95, z_cor, d, holes)
    box('stone', F, u0, u1, d - 0.3, d + 0.08, GROUND, 0.95)
    band(F, u0, u1, d, 0.95, 1.07, 0.11)
    for cu, za, w, h, kind in wins:
        window(F, cu, za, w, h, d, kind)
    band(F, u0, u1, d, 5.25, 5.47, 0.09)
    cornice(F, u0, u1, d, z_cor)

def build_south():
    o = W(*P[13]); u = (W(*P[12]) - o).normalized()
    n = Vector((-u.y, u.x))
    if n.dot(W(-738, 1637.5) - o) > 0: n = -n
    F = Frame(o, u, n)
    L, Wd = 45.6, 13.8
    facade_rows(F, 0, L, 0, 13)
    for a, b in ((L - 1.25, L), (0.0, 0.0)):                       # рустованный угол
        z = 1.07
        while a < b and z < EAVE - 0.9:
            box('trim', F, a, b + 0.06, 0, 0.09, z, z + 0.42)
            z += 0.5
    Fy = Frame(F.p(L, -Wd, 0).xy, -F.u, -F.n)                      # дворовый фасад
    facade_rows(Fy, 0, L + 6, 0, 14, kinds=False)
    Fe = Frame(F.p(L, 0, 0).xy, -F.n, F.u)                         # торец
    facade_rows(Fe, 0, Wd, 0, 3, kinds=False)
    z = 1.07
    while z < EAVE - 0.9:
        box('trim', Fe, -0.06, 1.25, 0, 0.09, z, z + 0.42)
        box('trim', Fe, Wd - 1.25, Wd + 0.06, 0, 0.09, z, z + 0.42)
        z += 0.5
    hip_roof(F, -9, L, 0, -Wd, EAVE, 3.1, hip0=False)
    zr = lambda d: EAVE + 3.1 * (0.55 - d) / (Wd / 2 + 0.55)
    for cu in (8.5, 22.8, 37.0):
        dormer(F, cu, -2.4, zr(-2.4) - 0.05)
    for cu, d in ((14.0, -5.0), (30.5, -5.2), (41.0, -8.6)):
        chimney(F, cu, d, EAVE, zr(d if d > -Wd / 2 else -Wd - d) + 1.0)
    return F

def build_north():
    o = W(*P[0]); u = (W(*P[1]) - o).normalized()
    n = Vector((-u.y, u.x))
    if n.dot(W(-738, 1637.5) - o) > 0: n = -n
    F = Frame(o, u, n)
    L, Wd = 43.8, 13.6
    facade_rows(F, 0, L, 0, 12)
    Fy = Frame(F.p(L, -Wd, 0).xy, -F.u, -F.n)
    facade_rows(Fy, 0, L + 8, 0, 14, kinds=False)
    hip_roof(F, 0.4, L + 1, 0, -Wd, EAVE, 3.05, hip0=True, hip1=False)
    zr = lambda d: EAVE + 3.05 * (0.55 - d) / (Wd / 2 + 0.55)
    for cu in (7.5, 21.5, 35.5):
        dormer(F, cu, -2.4, zr(-2.4) - 0.05)
    for cu, d in ((13.0, -5.0), (28.0, -5.2)):
        chimney(F, cu, d, EAVE, zr(d) + 1.0)
    # переходная стенка от угла портика к крылу (ребро P17 → P0 контура)
    a = W(*P[17]); b = W(*P[0])
    uu = (b - a).normalized(); nn = Vector((-uu.y, uu.x))
    if nn.dot(W(-738, 1637.5) - a) > 0: nn = -nn
    Fc = Frame(a, uu, nn)
    Lc = (b - a).length
    wall(Fc, -0.3, Lc, 0.95, EAVE - 0.6, 0, [])
    box('stone', Fc, -0.3, Lc, -0.3, 0.08, GROUND, 0.95)
    band(Fc, -0.3, Lc, 0, 5.25, 5.47, 0.09)
    cornice(Fc, -0.3, Lc, 0, EAVE - 0.6, ext=0.4)
    # клин между портиком и крылом, под общей кровлей
    c1 = FP.p(4.0, -14.0, 0).xy
    tri = [a, b, F.p(0, -Wd, 0).xy, c1]
    Fi = Frame(Vector((0, 0)), Vector((1, 0)), Vector((0, 1)))
    prism_plan('wall', Fi, [(p.x, p.y) for p in tri], GROUND, EAVE - 0.1, top=False)
    cen = sum(tri, Vector((0, 0))) / 4
    apex = Vector((cen.x, cen.y, EAVE + 2.4))
    rim = [Vector((p.x, p.y, EAVE)) for p in (a + nn * 0.4, b + nn * 0.4, tri[2], tri[3])]
    for i in range(4):
        q = [rim[i], rim[(i + 1) % 4], apex]
        face('roof', q, UP)
    # ---- башня с бельведером
    T0, T1, TD0, TD1 = 43.8, 51.3, 2.3, -5.2
    TH = 17.2
    sides = [(Frame(F.p(T0, TD0, 0).xy, F.u, F.n), T1 - T0),
             (Frame(F.p(T1, TD0, 0).xy, -F.n, F.u), TD0 - TD1),
             (Frame(F.p(T1, TD1, 0).xy, -F.u, -F.n), T1 - T0),
             (Frame(F.p(T0, TD1, 0).xy, F.n, -F.u), TD0 - TD1)]
    for Ft, Lt in sides:
        holes = []
        for za, h in ((2.25, 2.15), (6.35, 2.25), (10.2, 2.0), (13.6, 2.0)):
            for cu in (Lt * 0.29, Lt * 0.71):
                holes.append(window(Ft, cu, za, 1.1, h, 0))
        wall(Ft, 0, Lt, 0.95, TH, 0, holes)
        box('stone', Ft, 0, Lt, -0.3, 0.08, GROUND, 0.95)
        band(Ft, 0, Lt, 0, 5.25, 5.47, 0.09)
        band(Ft, 0, Lt, 0, 9.5, 9.72, 0.09)
        band(Ft, -0.1, Lt + 0.1, 0, TH, TH + 0.25, 0.12)
        k = 0.3
        while k < Lt:
            box('trim', Ft, k - 0.1, k + 0.1, 0, 0.42, TH + 0.25, TH + 0.5)
            k += 0.52
        band(Ft, -0.55, Lt + 0.55, 0, TH + 0.5, TH + 0.72, 0.58)
        band(Ft, -0.68, Lt + 0.68, 0, TH + 0.72, TH + 0.85, 0.70)
    BZ = TH + 0.85
    box('trim', F, T0 - 0.1, T1 + 0.1, TD1 - 0.1, TD0 + 0.1, BZ - 0.3, BZ + 0.35)      # площадка
    box('wall', F, T0 + 1.7, T1 - 1.7, TD1 + 1.7, TD0 - 1.7, BZ, BZ + 4.3)              # ядро бельведера
    BH = 3.7
    cu, cd = (T0 + T1) / 2, (TD0 + TD1) / 2
    hw = (T1 - T0) / 2 - 0.45
    for i in range(4):
        for j in range(4):
            if 0 < i < 3 and 0 < j < 3: continue
            base = F.p(cu - hw + 2 * hw * i / 3, cd - hw + 2 * hw * j / 3, BZ + 0.35)
            prof = [(0.27, 0), (0.27, 0.12), (0.22, 0.16)]
            prof += [(0.22 - 0.035 * (k / 5) ** 1.8, 0.16 + (BH - 0.5) * k / 5) for k in range(1, 6)]
            prof += [(0.21, BH - 0.32), (0.27, BH - 0.12), (0.29, BH - 0.1), (0.29, BH)]
            lathe('trim_s', base, prof, 12)
    z0 = BZ + 0.35 + BH
    box('trim', F, T0 + 0.15, T1 - 0.15, TD1 + 0.15, TD0 - 0.15, z0, z0 + 0.45)
    box('wall', F, T0 + 0.18, T1 - 0.18, TD1 + 0.18, TD0 - 0.18, z0 + 0.45, z0 + 0.8)
    box('trim', F, T0 - 0.25, T1 + 0.25, TD1 - 0.25, TD0 + 0.25, z0 + 0.8, z0 + 1.0)
    Ft = Frame(F.p(T0 - 0.25, 0, 0).xy, F.u, F.n)
    hip_roof(Ft, 0, T1 - T0 + 0.5, TD0 + 0.25, TD1 - 0.25, z0 + 1.0, 0.9, ov=0.05)
    # ---- восточный трёхэтажный корпус с плоской кровлей
    E0, E1, ED0, ED1 = 41.9, 54.2, -1.6, -24.8
    EH = 12.9
    es = [(Frame(F.p(E0, ED0, 0).xy, F.u, F.n), E1 - E0, 3),
          (Frame(F.p(E1, ED0, 0).xy, -F.n, F.u), ED0 - ED1, 6),
          (Frame(F.p(E1, ED1, 0).xy, -F.u, -F.n), E1 - E0, 3),
          (Frame(F.p(E0, ED1, 0).xy, F.n, -F.u), ED0 - ED1, 6)]
    for Fe, Le, bays in es:
        holes = []
        for za in (2.1, 5.7, 9.3):
            for i in range(bays):
                holes.append(window(Fe, Le * (i + 0.5) / bays, za, 1.3, 2.0, 0))
        wall(Fe, 0, Le, 0.95, EH, 0, holes)
        box('stone', Fe, 0, Le, -0.3, 0.08, GROUND, 0.95)
        cornice(Fe, 0, Le, 0, EH, ext=0.42)
        za = EH + 0.6
        beam('metal', Fe.p(0, 0.1, za + 0.95), Fe.p(Le, 0.1, za + 0.95), 0.05)
        beam('metal', Fe.p(0, 0.1, za + 0.5), Fe.p(Le, 0.1, za + 0.5), 0.03)
        k = 0.0
        while k <= Le + 0.01:
            beam('metal', Fe.p(k, 0.1, za), Fe.p(k, 0.1, za + 0.95), 0.04)
            k += Le / round(Le / 1.3)
    box('stone', F, E0, E1, ED1, ED0, EH + 0.3, EH + 0.6)
    return F

build_portico()
build_south()
build_north()

# ------------------------------------------------------------------ сцена
bpy.ops.wm.read_factory_settings(use_empty=True)
mats = {}
for name, (rgb, rough) in COL.items():
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    lin = [c ** 2.2 for c in rgb]
    b.inputs['Base Color'].default_value = (*lin, 1)
    b.inputs['Roughness'].default_value = rough
    m.use_backface_culling = False
    mats[name] = m

col = bpy.data.collections.new('Hospital')
bpy.context.scene.collection.children.link(col)
tris = 0
for key, bm in BM.items():
    mname = key[:-2] if key in SMOOTH else key
    if key in SMOOTH:
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('hospital_' + key)
    bm.to_mesh(me); bm.free()
    me.materials.append(mats[mname])
    if key in SMOOTH:
        me.set_sharp_from_angle(angle=math.radians(40))
    ob = bpy.data.objects.new('hospital_' + key, me)
    col.objects.link(ob)
    me.calc_loop_triangles()
    tris += len(me.loop_triangles)
print('ТРЕУГОЛЬНИКОВ:', tris)

os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'hospital.blend'))

if 'glb' in ARGS:
    out = os.path.normpath(os.path.join(HERE, '..', '..', 'data', 'models', 'hospital.glb'))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_yup=True)
    print('GLB:', out, os.path.getsize(out) // 1024, 'КБ')
