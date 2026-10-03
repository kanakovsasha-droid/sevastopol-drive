# Общие приёмы для памятников и малых форм центра Севастополя (мой набор поверх kit.py;
# kit.py не правится). Подключение в build.py:
#     import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
#     sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mon_common'))
#     from mon import *
#
# Здесь: лофт по сечениям (эллипсы), конечность между двумя точками, эллипсоид, ступенчатый
# прямоугольный лофт для постаментов, балка-полоска, якорь, поворот всей модели вокруг начала.
# Ключи материалов с суффиксом _s — гладкие нормали (бронза); wall3_s и stone_s попадают в дальний уровень.
import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import kit
from kit import *

kit.SMOOTH.update({'wall3_s', 'metal_s', 'stone_s', 'wall2_s'})
kit.LOD_KEEP.update({'wall3_s', 'stone_s', 'wall2_s'})

def V(x, y, z):
    return Vector((x, y, z))

def _flip_out(f, hint):
    f.normal_update()
    if f.normal.dot(hint) < 0:
        f.normal_flip()

def loft(m, secs, seg=16, cap0=True, cap1=True, smooth=True):
    """Тело по сечениям: secs = [(cx, cy, z, rx, ry, rot, wob, n)] (rot — поворот эллипса вокруг Z,
    wob/n — волнистость кромки: радиус × (1 + wob·cos(n·t)))."""
    bm = bm_of(m)
    rings = []
    for s in secs:
        cx, cy, z, rx, ry = s[:5]
        rot = s[5] if len(s) > 5 else 0.0
        wob = s[6] if len(s) > 6 else 0.0
        nn = s[7] if len(s) > 7 else 5
        cr, sr = math.cos(rot), math.sin(rot)
        ring = []
        for k in range(seg):
            t = 2 * math.pi * k / seg
            w = 1 + wob * math.cos(nn * t)
            lx, ly = rx * w * math.cos(t), ry * w * math.sin(t)
            ring.append(bm.verts.new((cx + lx * cr - ly * sr, cy + lx * sr + ly * cr, z)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(seg):
            j = (k + 1) % seg
            try:
                f = bm.faces.new([rings[i][k], rings[i][j], rings[i + 1][j], rings[i + 1][k]])
                f.smooth = smooth
            except ValueError:
                pass
    for flag, ring, sgn in ((cap0, rings[0], -1), (cap1, rings[-1], 1)):
        if flag:
            try:
                f = bm.faces.new(ring if sgn > 0 else ring[::-1])
            except ValueError:
                pass
    # нормали наружу
    for f in list(bm.faces):
        pass
    return rings

def limb(m, p0, p1, r0, r1, seg=8, cap0=True, cap1=True, ry0=None, ry1=None):
    """Круглая (или эллиптическая) труба между двумя точками."""
    bm = bm_of(m)
    ax = (p1 - p0).normalized()
    side = ax.cross(UP)
    if side.length < 1e-4:
        side = Vector((1, 0, 0))
    side.normalize()
    up = side.cross(ax).normalized()
    rings = []
    for p, r, ry in ((p0, r0, ry0 or r0), (p1, r1, ry1 or r1)):
        rings.append([bm.verts.new(p + side * r * math.cos(2 * math.pi * k / seg) + up * ry * math.sin(2 * math.pi * k / seg))
                      for k in range(seg)])
    for k in range(seg):
        j = (k + 1) % seg
        try:
            bm.faces.new([rings[0][k], rings[0][j], rings[1][j], rings[1][k]]).smooth = True
        except ValueError:
            pass
    if cap0:
        try: bm.faces.new(rings[0][::-1])
        except ValueError: pass
    if cap1:
        try: bm.faces.new(rings[1])
        except ValueError: pass

def ellipsoid(m, c, rx, ry, rz, seg=10, rings=6, rot=0.0):
    secs = []
    for i in range(rings + 1):
        a = -math.pi / 2 + math.pi * i / rings
        r = math.cos(a)
        z = c.z + rz * math.sin(a)
        if i == 0 or i == rings:
            r = 0.001
        secs.append((c.x, c.y, z, max(rx * r, 0.001), max(ry * r, 0.001), rot))
    loft(m, secs, seg, cap0=False, cap1=False)

def rloft(m, rings, cx=0.0, cy=0.0, top=True, bottom=False):
    """Прямоугольный лофт: rings = [(z, hx, hy)], прямые грани между кольцами (для постаментов)."""
    P = lambda z, hx, hy, sx, sy: Vector((cx + sx * hx, cy + sy * hy, z))
    cen = Vector((cx, cy, (rings[0][0] + rings[-1][0]) / 2))
    for (za, ax, ay), (zb, bx, by) in zip(rings[:-1], rings[1:]):
        corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
        for i in range(4):
            s0, s1 = corners[i], corners[(i + 1) % 4]
            q = [P(za, ax, ay, *s0), P(za, ax, ay, *s1), P(zb, bx, by, *s1), P(zb, bx, by, *s0)]
            face(m, q, sum(q, Vector()) / 4 - Vector((cx, cy, (za + zb) / 2)))
    z, hx, hy = rings[-1]
    if top:
        face(m, [P(z, hx, hy, *c) for c in [(-1, -1), (1, -1), (1, 1), (-1, 1)]], UP)
    if bottom:
        z, hx, hy = rings[0]
        face(m, [P(z, hx, hy, *c) for c in [(-1, -1), (1, -1), (1, 1), (-1, 1)]], -UP)

def slab(m, x0, x1, y0, y1, z0, z1, bottom=True):
    """Брус по осям Blender (x восток, y север)."""
    F0 = Frame(Vector((0, 0)), Vector((1, 0)), Vector((0, 1)))
    box(m, F0, x0, x1, y0, y1, z0, z1, bottom)

def strip(m, p0, p1, w0, w1, thick, up_hint=UP):
    """Плоская пластина-перо между двумя точками, шириной w0→w1 (поперёк — по up_hint×ось)."""
    ax = (p1 - p0).normalized()
    side = ax.cross(up_hint)
    if side.length < 1e-4:
        side = Vector((1, 0, 0))
    side.normalize()
    nrm = side.cross(ax).normalized()
    pts = lambda p, w, s: [p + side * (-w / 2) + nrm * s * thick / 2, p + side * (w / 2) + nrm * s * thick / 2]
    a0, a1 = pts(p0, w0, 1); b0, b1 = pts(p1, w1, 1)
    c0, c1 = pts(p0, w0, -1); d0, d1 = pts(p1, w1, -1)
    cen = (p0 + p1) / 2
    for q in ([a0, a1, b1, b0], [c1, c0, d0, d1], [a0, b0, d0, c0], [a1, c1, d1, b1], [a0, a1, c1, c0], [b0, d0, d1, b1]):
        face(m, q, sum(q, Vector()) / 4 - cen)

def rot_all(deg, cx=0.0, cy=0.0):
    """Повернуть всё построенное вокруг вертикали через (cx, cy) на deg градусов против часовой."""
    a = math.radians(deg); c, s = math.cos(a), math.sin(a)
    for bm in kit.BM.values():
        for v in bm.verts:
            x, y = v.co.x - cx, v.co.y - cy
            v.co.x = cx + x * c - y * s
            v.co.y = cy + x * s + y * c

def arc_pts(cx, cy, r, a0, a1, n):
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / n), cy + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]

def anchor(m, p, yaw, sc=1.0, lying=True):
    """Старый адмиралтейский якорь, лежит на плите: веретено, шток, лапы-дуга, кольцо."""
    cy_, sy_ = math.cos(yaw), math.sin(yaw)
    R = lambda x, y, z: V(p.x + (x * cy_ - y * sy_) * sc, p.y + (x * sy_ + y * cy_) * sc, p.z + z * sc)
    limb(m, R(0, -0.9, 0.12), R(0, 0.95, 0.12), 0.07, 0.06, 6)            # веретено
    limb(m, R(-0.55, 0.78, 0.12), R(0.55, 0.78, 0.12), 0.045, 0.045, 6)   # шток
    for s in (-1, 1):                                                      # лапы: дуга от низа веретена
        prev = R(0, -0.9, 0.12)
        for a in arc_pts(0, -0.7, 0.62, -math.pi / 2, -math.pi / 2 + s * 1.1, 4)[1:]:
            q = R(a[0], a[1] - 0.2, 0.12)
            limb(m, prev, q, 0.06, 0.055, 6)
            prev = q
        # лапа-лопасть
        strip(m, prev, prev + V(0.12 * s * cy_, 0.12 * s * sy_, 0.08) * sc, 0.2 * sc, 0.0001, 0.05 * sc)
    # кольцо вверху
    ring = [R(0.0, 1.0, 0.12)]
    for i in range(1, 9):
        t = 2 * math.pi * i / 8
        ring.append(R(0.12 * math.sin(t), 1.0 + 0.12 - 0.12 * math.cos(t), 0.12))
    for a, b in zip(ring[:-1], ring[1:]):
        limb(m, a, b, 0.025, 0.025, 4)

def skin(m, rings, cap0=True, cap1=True, smooth=True, closed=True):
    """Поверхность по готовым кольцам точек (одинакового числа вершин)."""
    bm = bm_of(m)
    vr = [[bm.verts.new(p) for p in ring] for ring in rings]
    n = len(vr[0])
    for i in range(len(vr) - 1):
        for k in range(n if closed else n - 1):
            j = (k + 1) % n
            try:
                bm.faces.new([vr[i][k], vr[i][j], vr[i + 1][j], vr[i + 1][k]]).smooth = smooth
            except ValueError:
                pass
    if cap0:
        try: bm.faces.new(vr[0][::-1])
        except ValueError: pass
    if cap1:
        try: bm.faces.new(vr[-1])
        except ValueError: pass
    return vr

def spiral(m, c, plane, r0, r1, a0, a1, n=14, w=0.07, w1=None):
    """Завиток: спираль в плоскости plane=(ex, ey) вокруг c; радиус r0→r1, угол a0→a1."""
    ex, ey = plane
    pts = []
    for i in range(n + 1):
        t = i / n
        r = r0 + (r1 - r0) * t
        a = a0 + (a1 - a0) * t
        pts.append(c + ex * (r * math.cos(a)) + ey * (r * math.sin(a)))
    for i in range(n):
        ww = w + ((w1 if w1 is not None else w) - w) * i / n
        limb(m, pts[i], pts[i + 1], ww, ww * 0.95 if w1 is None else w + (w1 - w) * (i + 1) / n, 6)
    return pts
