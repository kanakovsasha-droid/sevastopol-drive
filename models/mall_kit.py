# Общий набор для торговых центров: объёмы по контуру, панельные стены,
# стеклянные витражи с импостами, козырьки, фермы под крышными буквами и
# объёмные вывески из шрифтов macOS (буквы — настоящая геометрия: картинок
# в моделях игры нет).
#
#     from mall_kit import *        # тянет за собой kit
#
# Всё, что здесь есть, — поверх models/kit.py: kit не правим.
import bpy, bmesh, math, os
from mathutils import Vector
import kit
from kit import *

FONTS = '/System/Library/Fonts/Supplemental/'
_FONT = {}

def font(name):
    if name not in _FONT:
        _FONT[name] = bpy.data.fonts.load(os.path.join(FONTS, name))
    return _FONT[name]

def lod_keep(*names):
    """Материалы, которые остаются и в дальнем уровне (крупные вывески)."""
    for n in names:
        kit.LOD_KEEP.add(n)

def frame_lr(a, b, inside):
    """Рамка фасада по ребру a–b, у которой u растёт вправо для зрителя снаружи."""
    F, L = frame_from(a, b, inside)
    if Vector((-F.n.y, F.n.x)).dot(F.u) < 0:
        F, L = frame_from(b, a, inside)
    return F, L

def mat(name, rgb, rough=0.6):
    COL[name] = (rgb, rough)

# ------------------------------------------------------------------ объёмы
def prism_world(m, pts, z0, z1, top=True, bottom=False, roof=None):
    """Многоугольник в мире [(x, z)…] вытянут по высоте z0..z1 (вогнутый — можно)."""
    P = [W(x, z) for x, z in pts]
    a = [Vector((p.x, p.y, z0)) for p in P]
    b = [Vector((p.x, p.y, z1)) for p in P]
    # обход против часовой — наружу смотрят правые нормали
    s = sum(P[i].x * P[(i + 1) % len(P)].y - P[(i + 1) % len(P)].x * P[i].y for i in range(len(P)))
    if s < 0:
        a.reverse(); b.reverse()
    n = len(a)
    for i in range(n):
        j = (i + 1) % n
        e = b[j] - b[i]
        out = Vector((e.y, -e.x, 0))
        face(m, [a[i], a[j], b[j], b[i]], out)
    if top:
        face(roof or m, b, UP)
    if bottom:
        face(m, a, -UP)

def flat_roof(m, pts, z, edge='trim', par=0.9, w=0.35):
    """Плоская кровля с парапетом по контуру."""
    prism_world(m, pts, z - 0.2, z, top=True)
    P = [W(x, zz) for x, zz in pts]
    n = len(P)
    for i in range(n):
        a, b = P[i], P[(i + 1) % n]
        beam(edge, Vector((a.x, a.y, z + par / 2)), Vector((b.x, b.y, z + par / 2)), w, par)

# ------------------------------------------------------------------ фасады
def panels(F, u0, u1, z0, z1, d, m='wall', joint='wall2', step=1.2, horiz=True, jw=0.05):
    """Гладкая стена из панелей: плоскость и тонкие швы-рейки."""
    face(m, [F.p(u0, d, z0), F.p(u1, d, z0), F.p(u1, d, z1), F.p(u0, d, z1)], F.N())
    if not joint:
        return
    if horiz:
        z = z0 + step
        while z < z1 - 0.1:
            box(joint, F, u0, u1, d - 0.01, d + 0.04, z - jw / 2, z + jw / 2, bottom=False)
            z += step
    else:
        u = u0 + step
        while u < u1 - 0.1:
            box(joint, F, u - jw / 2, u + jw / 2, d - 0.01, d + 0.04, z0, z1, bottom=False)
            u += step

def curtain(F, u0, u1, z0, z1, d, du=1.5, dz=1.5, glass='glass', frame='metal', mw=0.08, mz=None):
    """Стеклянный витраж: стекло и сетка импостов. mz — свои уровни ригелей."""
    face(glass, [F.p(u0, d, z0), F.p(u1, d, z0), F.p(u1, d, z1), F.p(u0, d, z1)], F.N())
    n = max(1, round((u1 - u0) / du))
    for i in range(n + 1):
        u = u0 + (u1 - u0) * i / n
        box(frame, F, u - mw / 2, u + mw / 2, d, d + 0.10, z0, z1, bottom=False)
    zs = mz if mz is not None else [z0 + (z1 - z0) * k / max(1, round((z1 - z0) / dz)) for k in range(max(1, round((z1 - z0) / dz)) + 1)]
    for z in zs:
        box(frame, F, u0, u1, d, d + 0.10, z - mw / 2, z + mw / 2, bottom=False)

def slab(m, F, u0, u1, d0, d1, z0, z1):
    box(m, F, u0, u1, d0, d1, z0, z1)

def truss(F, u0, u1, z0, z1, d, m='metal', w=0.12, bays=None):
    """Плоская ферма под крышные буквы: пояса, стойки и раскосы."""
    P = lambda u, z: F.p(u, d, z)
    beam(m, P(u0, z0), P(u1, z0), w)
    beam(m, P(u0, z1), P(u1, z1), w)
    n = bays or max(1, round((u1 - u0) / (z1 - z0)))
    for i in range(n + 1):
        u = u0 + (u1 - u0) * i / n
        beam(m, P(u, z0), P(u, z1), w)
        if i < n:
            u2 = u0 + (u1 - u0) * (i + 1) / n
            beam(m, P(u, z0) if i % 2 == 0 else P(u, z1), P(u2, z1) if i % 2 == 0 else P(u2, z0), w * 0.8)
    # подкосы назад к кровле
    for i in range(0, n + 1, 2):
        u = u0 + (u1 - u0) * i / n
        beam(m, F.p(u, d, z1 - 0.2), F.p(u, d - 1.6, z0), w * 0.8)

# ------------------------------------------------------------------ вывески
def text(m, F, s, u, z, h, d, depth=0.25, fnt='Arial Bold.ttf', align='CENTER',
         width=None, res=2, spacing=1.0, shear=0.0, valign='BASE'):
    """Объёмные буквы на фасаде. (u, z) — точка выравнивания (низ строки),
    h — высота прописной (по рамке текста), width — сжать/растянуть по ширине.
    Возвращает (u0, u1) — края надписи на фасаде."""
    cu = bpy.data.curves.new('t', 'FONT')
    cu.body = s
    cu.font = font(fnt)
    cu.size = 1.0
    cu.resolution_u = res
    cu.extrude = depth / 2
    cu.space_character = spacing
    cu.shear = shear
    cu.align_x = 'LEFT'
    ob = bpy.data.objects.new('t', cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    k = h / (y1 - y0)
    kx = k if width is None else width / (x1 - x0)
    wid = (x1 - x0) * kx
    # буквы читаются слева направо для того, кто стоит перед фасадом
    rgt = Vector((-F.n.y, F.n.x))
    sg = 1 if rgt.dot(F.u) > 0 else -1
    if sg < 0:
        align = {'LEFT': 'RIGHT', 'RIGHT': 'LEFT'}.get(align, align)
    ua = u - wid / 2 if align == 'CENTER' else (u if align == 'LEFT' else u - wid)
    yb = y0 if valign == 'BOTTOM' else 0.0
    if valign == 'BASE':
        yb = y0
    bm = kit.bm_of(m)
    vv = [bm.verts.new(F.p((ua + (v.co.x - x0) * kx) if sg > 0 else (ua + wid - (v.co.x - x0) * kx),
                           d + depth / 2 + v.co.z, z + (v.co.y - yb) * k)) for v in me.vertices]
    for p in me.polygons:
        try:
            ids = list(p.vertices)
            bm.faces.new([vv[i] for i in (ids if sg > 0 else ids[::-1])])
        except ValueError:
            pass
    bpy.data.objects.remove(ob)
    bpy.data.meshes.remove(me)
    bpy.data.curves.remove(cu)
    return ua, ua + wid

def board(F, u0, u1, z0, z1, d, m, depth=0.3, rim=None):
    """Короб-вывеска (лайтбокс) с ободком."""
    box(m, F, u0, u1, d, d + depth, z0, z1)
    if rim:
        box(rim, F, u0 - 0.06, u1 + 0.06, d + depth - 0.05, d + depth + 0.02, z0 - 0.06, z0)
        box(rim, F, u0 - 0.06, u1 + 0.06, d + depth - 0.05, d + depth + 0.02, z1, z1 + 0.06)

def disc(m, F, u, z, r, d, depth=0.12, seg=20):
    pts = [(u + r * math.cos(2 * math.pi * k / seg), z + r * math.sin(2 * math.pi * k / seg)) for k in range(seg)]
    prism_uz(m, F, pts, d, d + depth)

def sphere(m, c, r, seg=16, rings=10):
    prof = [(r * math.sin(math.pi * i / rings), r - r * math.cos(math.pi * i / rings)) for i in range(rings + 1)]
    prof[0] = (0.001, 0.0); prof[-1] = (0.001, 2 * r)
    lathe(m, c - Vector((0, 0, r)), prof, seg, cap=False)

def arc_pts(cx, cz, r, a0, a1, n):
    """Дуга в мире: центр (cx, cz), углы в градусах от востока к югу (ось z мира)."""
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cz + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]

def fit_circle(pts):
    """Окружность по точкам дуги (наименьшие квадраты): (cx, cz, r) в мире."""
    n = len(pts)
    sx = sum(p[0] for p in pts) / n; sz = sum(p[1] for p in pts) / n
    suu = suv = svv = suuu = svvv = suvv = svuu = 0.0
    for x, z in pts:
        u, v = x - sx, z - sz
        suu += u * u; svv += v * v; suv += u * v
        suuu += u ** 3; svvv += v ** 3; suvv += u * v * v; svuu += v * u * u
    b1 = (suuu + suvv) / 2; b2 = (svvv + svuu) / 2
    det = suu * svv - suv * suv
    uc = (b1 * svv - b2 * suv) / det; vc = (suu * b2 - suv * b1) / det
    cx, cz = uc + sx, vc + sz
    r = sum(((x - cx) ** 2 + (z - cz) ** 2) ** 0.5 for x, z in pts) / n
    return cx, cz, r

def drum(c, r, a0, a1, z0, z1, n=16, glass='glass', frame='metal', rows=None, mw=0.09, solid=None):
    """Стеклянный барабан: дуга a0..a1 (градусы в плоскости Blender, от +X против
    часовой), центр c — точка мира. rows — уровни ригелей. solid — материал
    глухой полосы (z0s, z1s, m) поверх стекла, например белый карниз."""
    C = W(*c)
    ang = [math.radians(a0 + (a1 - a0) * i / n) for i in range(n + 1)]
    P = [Vector((C.x + r * math.cos(a), C.y + r * math.sin(a))) for a in ang]
    for i in range(n):
        a, b = P[i], P[i + 1]
        q = [Vector((a.x, a.y, z0)), Vector((b.x, b.y, z0)), Vector((b.x, b.y, z1)), Vector((a.x, a.y, z1))]
        mid = (a + b) / 2 - C
        face(glass, q, Vector((mid.x, mid.y, 0)))
    for i, p in enumerate(P):
        o = (p - C).normalized() * 0.06
        beam(frame, Vector((p.x + o.x, p.y + o.y, z0)), Vector((p.x + o.x, p.y + o.y, z1)), mw)
    for z in (rows or []):
        for i in range(n):
            a, b = P[i], P[i + 1]
            oa = (a - C).normalized() * 0.06; ob = (b - C).normalized() * 0.06
            beam(frame, Vector((a.x + oa.x, a.y + oa.y, z)), Vector((b.x + ob.x, b.y + ob.y, z)), mw)
    return C, P

def ring(m, c, r0, r1, a0, a1, z0, z1, n=16):
    """Кольцевой пояс (карниз, козырёк) по дуге: от радиуса r0 до r1, z0..z1."""
    C = W(*c)
    ang = [math.radians(a0 + (a1 - a0) * i / n) for i in range(n + 1)]
    pin = [Vector((C.x + r0 * math.cos(a), C.y + r0 * math.sin(a))) for a in ang]
    pout = [Vector((C.x + r1 * math.cos(a), C.y + r1 * math.sin(a))) for a in ang]
    V = lambda p, z: Vector((p.x, p.y, z))
    for i in range(n):
        j = i + 1
        face(m, [V(pin[i], z1), V(pout[i], z1), V(pout[j], z1), V(pin[j], z1)], UP)
        face(m, [V(pin[i], z0), V(pin[j], z0), V(pout[j], z0), V(pout[i], z0)], -UP)
        mo = (pout[i] + pout[j]) / 2 - C
        face(m, [V(pout[i], z0), V(pout[j], z0), V(pout[j], z1), V(pout[i], z1)], Vector((mo.x, mo.y, 0)))
    for k in (0, n):
        p, q = pin[k], pout[k]
        face(m, [V(p, z0), V(q, z0), V(q, z1), V(p, z1)], None)

def disc_flat(m, c, r, z, n=20):
    C = W(*c)
    face(m, [Vector((C.x + r * math.cos(2 * math.pi * k / n), C.y + r * math.sin(2 * math.pi * k / n), z)) for k in range(n)], UP)

def ang_of(c, p):
    """Угол (градусы, плоскость Blender) направления от центра c к точке p (мир)."""
    v = W(*p) - W(*c)
    return math.degrees(math.atan2(v.y, v.x))
