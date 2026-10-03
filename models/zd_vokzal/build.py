# Железнодорожный вокзал Севастополя (ул. Вокзальная, 1) — модель с нуля.
#
#   blender -b --python models/zd_vokzal/build.py -- [glb]
#
# План — контур OSM way 93712574, выпрямленный до прямоугольников (ось дома
# повёрнута на 8,5° от севера). Фасады, кровли и башенка — по фото Викисклада
# (refs/r00 — восточный фасад на площадь, r03/r05/r10 — со стороны платформ,
# r01/r02 — угол и башенка). Ноль высоты — земля у подножия лестницы главного входа.
#
# Локальные координаты плана: pu — вдоль оси дома на СЕВЕР, pd — на ВОСТОК
# (к привокзальной площади). Начало — середина восточного ребра выступа (306.7, 2400).
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

X0, Z0 = 306.7, 2400.0
origin(X0, Z0)

COL['wall'] = ((0.78, 0.78, 0.76), 0.92)     # серая штукатурка восточного фасада
COL['wall2'] = ((0.90, 0.90, 0.88), 0.92)    # белёные крылья и сторона платформ
COL['wall3'] = ((0.72, 0.72, 0.70), 0.92)    # тимпан фронтона, ниши
COL['roof'] = ((0.15, 0.46, 0.14), 0.7)      # зелёная кровля
COL['stone'] = ((0.76, 0.75, 0.72), 0.9)     # рустованный цоколь, ступени
COL['trim'] = ((0.95, 0.95, 0.93), 0.85)
COL['wood'] = ((0.36, 0.20, 0.10), 0.6)
COL['metal'] = ((0.20, 0.24, 0.30), 0.5)

UN = Vector((0.147, 0.989)).normalized()     # на север вдоль оси дома (плоскость Blender)
EN = Vector((UN.y, -UN.x))                   # на восток
def PW(pu, pd): return UN * pu + EN * pd
FP = Frame(Vector((0, 0)), UN, EN)           # u = pu, d = pd

GROUND = -3.0
EAVE = 8.8            # низ венчающего карниза
CT = 0.6              # высота карниза
ZE = EAVE + CT        # верх карниза = пята кровель
CEN_C = -3.15         # ось центрального объёма по pu
CEN_HW = 12.85        # его полуширина (контур: pu −16 … 9.7)
CEN_E = 0.0           # восточная грань, pd
CEN_W = -19.0         # западная грань, pd
WALL_W = -17.3        # западная грань крыльев

PLAN = [(-38.7, -17.3), (-30, -17.3), (-30, -19), (-23.9, -19), (-23.9, -17.3), (-16, -17.3), (-16, -19),
        (9.7, -19), (9.7, -17.3), (17.9, -17.3), (17.9, -19), (23.9, -19), (23.9, -17.3), (38.1, -17.3),
        (38.1, -12.3), (41.6, -12.3), (41.6, -6.3), (38.1, -6.3), (38.1, -1.7), (18.8, -1.7), (18.8, 0),
        (-18.8, 0), (-18.8, -1.7), (-38.7, -1.7), (-38.7, -5.5), (-39.9, -5.5), (-39.9, -13.3), (-38.7, -13.3)]
N = len(PLAN)
PTS = [PW(*p) for p in PLAN]
area = sum(PTS[i].x * PTS[(i + 1) % N].y - PTS[(i + 1) % N].x * PTS[i].y for i in range(N)) / 2
EDGE = []
for i in range(N):
    a, b = PTS[i], PTS[(i + 1) % N]
    d = (b - a).normalized()
    n = Vector((d.y, -d.x)) if area > 0 else Vector((-d.y, d.x))
    EDGE.append((Frame(a, d, n), (b - a).length))

def eu(i, t):
    """Расстояние от начала ребра i до плановой координаты t (pu или pd, смотря что меняется)."""
    p, q = PLAN[i], PLAN[(i + 1) % N]
    return abs(t - p[0]) if abs(p[0] - q[0]) > 1e-6 else abs(t - p[1])

# ------------------------------------------------------------------ мелкие помощники
def post4(m, F, u, d, z0, z1, w):
    """Четырёхгранный столбик без днища и крышки (8 треугольников)."""
    h = w / 2
    P = [F.p(u - h, d - h, z0), F.p(u + h, d - h, z0), F.p(u + h, d + h, z0), F.p(u - h, d + h, z0)]
    Q = [F.p(u - h, d - h, z1), F.p(u + h, d - h, z1), F.p(u + h, d + h, z1), F.p(u - h, d + h, z1)]
    c = F.p(u, d, (z0 + z1) / 2)
    for i in range(4):
        j = (i + 1) % 4
        q = [P[i], P[j], Q[j], Q[i]]
        face(m, q, sum(q, Vector()) / 4 - c)

def balustrade(F, u0, u1, d=0.34, z0=ZE, h=0.85, pitch=0.42):
    box('trim', F, u0, u1, d - 0.17, d + 0.17, z0, z0 + 0.10, bottom=False)
    box('trim', F, u0, u1, d - 0.16, d + 0.16, z0 + 0.10 + h, z0 + 0.26 + h, bottom=False)
    n = max(1, int(round((u1 - u0) / pitch)))
    for k in range(n + 1):
        u = u0 + (u1 - u0) * k / n
        if k % 8 == 4:        # тумба
            box('trim', F, u - 0.2, u + 0.2, d - 0.2, d + 0.2, z0 + 0.10, z0 + 0.34 + h, bottom=False)
            box('trim', F, u - 0.26, u + 0.26, d - 0.26, d + 0.26, z0 + 0.34 + h, z0 + 0.44 + h, bottom=False)
        else:
            post4('trim', F, u, d, z0 + 0.10, z0 + 0.10 + h, 0.13)

def slab(m, pts, t):
    top = pts
    bot = [p - UP * t for p in pts]
    c = sum(top + bot, Vector()) / 8
    face(m, top, UP); face(m, bot, -UP)
    for i in range(4):
        j = (i + 1) % 4
        q = [top[i], top[j], bot[j], bot[i]]
        face(m, q, sum(q, Vector()) / 4 - c)

def sphere(m, c, r, seg=8):
    prof = [(r * math.sin(math.pi * k / 4), -r * math.cos(math.pi * k / 4)) for k in range(5)]
    lathe(m, c, [(max(rr, 0.001), z) for rr, z in prof], seg, cap=False)

def win(F, cu, za, w, h, d=0.0, frame='wood'):
    """Лёгкое окно: наличник из четырёх брусков, стекло, импост и поперечина."""
    ua, ub, zb = cu - w / 2, cu + w / 2, za + h
    j = 0.14
    box('trim', F, ua - j, ua, d, d + 0.06, za, zb + j, bottom=False)
    box('trim', F, ub, ub + j, d, d + 0.06, za, zb + j, bottom=False)
    box('trim', F, ua - j, ub + j, d, d + 0.09, zb, zb + j, bottom=False)
    box('trim', F, ua - j - 0.05, ub + j + 0.05, d, d + 0.14, za - 0.12, za)
    g = d - 0.2
    face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
    t = 0.05
    box(frame, F, cu - t / 2, cu + t / 2, g, g + 0.06, za, zb, bottom=False)
    box(frame, F, ua, ub, g, g + 0.06, za + h * 0.68 - t / 2, za + h * 0.68 + t / 2, bottom=False)
    return (ua, ub, za, zb)

def arch(F, cu, r, sill, zs, d=0.0, m='wall2', reveal=0.22, seg=12, door_h=None, hood=0.34, hood_pr=0.08):
    """Арочный проём: заполнение углов над пятами, откосы, архивольт, остекление.
    Дырку (cu-r, cu+r, sill, zs+r) для wall() вызывающий делает сам."""
    arc = [(cu + r * math.cos(math.pi * k / seg), zs + r * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
    hs = seg // 2
    face(m, [F.p(cu + r, d, zs + r)] + [F.p(u, d, z) for u, z in arc[:hs + 1]], F.N())
    face(m, [F.p(cu - r, d, zs + r)] + [F.p(u, d, z) for u, z in arc[hs:]], F.N())
    ro = r + hood
    for k in range(seg):
        (ua, za), (ub, zb) = arc[k], arc[k + 1]
        c = F.p(cu, d, zs)
        face('trim', [F.p(ua, d, za), F.p(ub, d, zb), F.p(ub, d - reveal, zb), F.p(ua, d - reveal, za)],
             c - F.p((ua + ub) / 2, d, (za + zb) / 2))
        oa = (cu + ro * math.cos(math.pi * k / seg), zs + ro * math.sin(math.pi * k / seg))
        ob = (cu + ro * math.cos(math.pi * (k + 1) / seg), zs + ro * math.sin(math.pi * (k + 1) / seg))
        face('trim', [F.p(ua, d + hood_pr, za), F.p(ub, d + hood_pr, zb), F.p(ob[0], d + hood_pr, ob[1]),
                      F.p(oa[0], d + hood_pr, oa[1])], F.N())
        face('trim', [F.p(oa[0], d, oa[1]), F.p(ob[0], d, ob[1]), F.p(ob[0], d + hood_pr, ob[1]),
                      F.p(oa[0], d + hood_pr, oa[1])],
             F.p((oa[0] + ob[0]) / 2, d, (oa[1] + ob[1]) / 2) - F.p(cu, d, zs))
    box('trim', F, cu - r - hood, cu - r, d, d + hood_pr, sill if door_h is None else sill, zs)
    box('trim', F, cu + r, cu + r + hood, d, d + hood_pr, sill if door_h is None else sill, zs)
    gd = d - reveal + 0.02
    low = door_h if door_h else sill
    face('glass', [F.p(cu - r, gd, low), F.p(cu + r, gd, low)] + [F.p(u, gd, z) for u, z in arc], F.N())
    t = 0.05
    box('wood', F, cu - t / 2, cu + t / 2, gd, gd + 0.06, low, zs + r, bottom=False)
    for z in (zs, low + (zs - low) * 0.5) if door_h is None else (zs, door_h + 0.8):
        box('wood', F, cu - r, cu + r, gd, gd + 0.06, z - t / 2, z + t / 2, bottom=False)
    if door_h:     # дверное полотно
        gd2 = gd + 0.01
        face('wood', [F.p(cu - r, gd2, sill), F.p(cu + r, gd2, sill), F.p(cu + r, gd2, door_h), F.p(cu - r, gd2, door_h)], F.N())
        for s in (-1, 1):
            box('wood', F, cu + s * r * 0.5 - 0.03, cu + s * r * 0.5 + 0.03, gd2, gd2 + 0.06, sill, door_h, bottom=False)
        box('wood', F, cu - 0.03, cu + 0.03, gd2, gd2 + 0.06, sill, door_h, bottom=False)
        box('trim', F, cu - r - 0.1, cu + r + 0.1, d - 0.1, d + 0.18, sill - 0.12, sill)    # порог

def strip(F, u0, w, z0, z1, pr=0.09, d=0.0):
    box('trim', F, u0, u0 + w, d - 0.02, d + pr, z0, z1, bottom=False)

# ------------------------------------------------------------------ стены по рёбрам плана
def edge_walls(i, items, m='wall2', base=True, cornice_on=True, bands=True, quoins=True, base_gap=None, ext=0.45):
    F, L = EDGE[i]
    holes, post = [], []
    for it in items:
        if it[0] == 'win':
            _, cu, za, w, h = it
            holes.append((cu - w / 2, cu + w / 2, za, za + h))
        elif it[0] == 'arch':
            _, cu, r, sill, zs = it[:5]
            holes.append((cu - r, cu + r, sill, zs + r))
    wall(F, 0, L, GROUND, EAVE, 0, holes, m=m, reveal=0.2)
    for it in items:
        if it[0] == 'win':
            win(F, it[1], it[2], it[3], it[4])
        elif it[0] == 'arch':
            kw = dict(m=m)
            if len(it) > 5: kw.update(it[5])
            arch(F, it[1], it[2], it[3], it[4], **kw)
    if base:
        segs = [(0, L)] if not base_gap else [(0, base_gap[0]), (base_gap[1], L)]
        for a, b in segs:
            if b - a > 0.05:
                box('stone', F, a, b, -0.3, 0.08, GROUND, 1.3)
                box('trim', F, a, b, -0.3, 0.12, 1.3, 1.42, bottom=False)
    if cornice_on:
        cornice(F, 0, L, 0, EAVE, ext=ext)
    if bands:
        band(F, 0, L, 0, 4.72, 4.92, 0.09)
    if quoins and L > 6:
        strip(F, 0.0, 0.5, 1.42, EAVE)
        strip(F, L - 0.5, 0.5, 1.42, EAVE)

def bays(L, pitch=3.1, margin=0.0):
    n = max(1, int(round((L - 2 * margin) / pitch)))
    step = (L - 2 * margin) / n
    return [margin + step * (k + 0.5) for k in range(n)]

def wing_items(L, pitch=3.1, margin=0.0, w=1.25):
    out = []
    for cu in bays(L, pitch, margin):
        out.append(('win', cu, 1.6, w, 2.6))
        out.append(('win', cu, 5.3, w, 1.9))
    return out

def door_items(L):
    return [('arch', L / 2, 0.85, 0.12, 2.9, dict(door_h=2.9 - 0.0, hood=0.25, hood_pr=0.07)),
            ('win', L / 2, 5.3, 1.25, 1.9)]

# --- западные грани (стороны платформ)
edge_walls(0, wing_items(EDGE[0][1], 2.9))
edge_walls(1, [], bands=False, quoins=False)
edge_walls(2, door_items(EDGE[2][1]), bands=True, quoins=False)
edge_walls(3, [], bands=False, quoins=False)
edge_walls(4, wing_items(EDGE[4][1], 2.7))
edge_walls(5, [], bands=False, quoins=False)
edge_walls(7, [], bands=False, quoins=False)
edge_walls(8, wing_items(EDGE[8][1], 2.8))
edge_walls(9, [], bands=False, quoins=False)
edge_walls(10, door_items(EDGE[10][1]), bands=True, quoins=False)
edge_walls(11, [], bands=False, quoins=False)
edge_walls(12, wing_items(EDGE[12][1], 2.9))
# --- северный торец
edge_walls(13, wing_items(EDGE[13][1], 2.5), quoins=False)
edge_walls(14, [], cornice_on=False, bands=False, quoins=False)
edge_walls(15, [('arch', 3.0, 0.8, 1.6, 3.6, dict(hood=0.28, hood_pr=0.07))], cornice_on=False, bands=False, quoins=False)
edge_walls(16, [], cornice_on=False, bands=False, quoins=False)
edge_walls(17, wing_items(EDGE[17][1], 4.6), quoins=False)
# --- восточные крылья
edge_walls(18, wing_items(EDGE[18][1], 3.2))
edge_walls(19, [], bands=False, quoins=False)
edge_walls(21, [], bands=False, quoins=False)
edge_walls(22, wing_items(EDGE[22][1], 3.3))
# --- южный торец
edge_walls(23, wing_items(EDGE[23][1], 3.8), quoins=False)
edge_walls(24, [], bands=False, quoins=False)
edge_walls(25, [('arch', 3.9, 0.9, 0.12, 2.9, dict(door_h=2.9, hood=0.25, hood_pr=0.07)),
                ('win', 1.2, 1.6, 0.9, 2.2), ('win', 6.6, 1.6, 0.9, 2.2)], quoins=False)
edge_walls(26, [], bands=False, quoins=False)
edge_walls(27, wing_items(EDGE[27][1], 4.0), quoins=False)

# ---- центральный объём, западная грань (к платформам): три больших арки
F6, L6 = EDGE[6]
arches6 = [('arch', eu(6, pu), 1.15, 0.15, 4.5, dict(hood=0.34, hood_pr=0.08)) for pu in (-10.5, CEN_C, 4.2)]
edge_walls(6, arches6, bands=False, quoins=False)
band(F6, 0, L6, 0, 7.2, 7.4, 0.10)
strip(F6, 0.0, 0.7, 1.42, EAVE, 0.12)
strip(F6, L6 - 0.7, 0.7, 1.42, EAVE, 0.12)

# ---- центральный объём, восточная грань (на площадь): 7 арок, фронтон, рустованный цоколь
F20, L20 = EDGE[20]
DOOR_U = eu(20, CEN_C)
east_items = []
for off in (-9.9, -7.1, -4.3, 4.3, 7.1, 9.9):
    east_items.append(('arch', eu(20, CEN_C + off), 0.78, 2.4, 5.7, dict(hood=0.30, hood_pr=0.08, m='wall')))
east_items.append(('arch', DOOR_U, 1.45, 0.75, 5.15, dict(door_h=4.4, hood=0.55, hood_pr=0.12, m='wall')))
# северное плечо (pu 9.7…18.8) — два этажа окон как у крыльев
for cu in bays(eu(20, 9.7), 3.05):
    east_items.append(('win', cu, 1.6, 1.25, 2.6))
    east_items.append(('win', cu, 5.3, 1.25, 1.9))
edge_walls(20, east_items, m='wall', bands=False, quoins=False, base_gap=(DOOR_U - 1.45, DOOR_U + 1.45), ext=0.55)
cen_u0, cen_u1 = eu(20, 9.7), eu(20, -16.0)
sh_n, sh_s = eu(20, 9.7), L20 - eu(20, -16.0)
band(F20, 0, cen_u0, 0, 4.72, 4.92, 0.09)                    # пояс на плечах
band(F20, cen_u1, L20, 0, 4.72, 4.92, 0.09)
band(F20, cen_u0, cen_u1, 0, 7.2, 7.4, 0.10)                  # пояс над арками
for u in (cen_u0, cen_u1 - 0.8):                              # пилястры по краям центра
    strip(F20, u, 0.8, 1.42, EAVE, 0.13)
strip(F20, 0.0, 0.5, 1.42, EAVE); strip(F20, L20 - 0.5, 0.5, 1.42, EAVE)
band(F20, cen_u0, cen_u1, 0, 5.55, 5.65, 0.05)

# ступени главного входа
for k in range(5):
    box('stone', F20, DOOR_U - 4.2, DOOR_U + 4.2, 0, 0.42 * (k + 1), GROUND, 0.75 - 0.15 * k)
for s in (-1, 1):
    u0, u1 = sorted((DOOR_U + s * 4.2, DOOR_U + s * 4.6))
    box('stone', F20, u0, u1, 0, 2.2, GROUND, 0.9)

# ------------------------------------------------------------------ боковые стены центра и кровли
# стены центрального объёма над плечами (до верха карниза)
for pu, s in ((-16.0, -1), (9.7, 1)):
    n = UN * s
    for d0, d1 in ((WALL_W, CEN_E),):
        q = [FP.p(pu, d0, EAVE), FP.p(pu, d1, EAVE), FP.p(pu, d1, ZE + 1.0), FP.p(pu, d0, ZE + 1.0)]
        face('wall2', q, Vector((n.x, n.y, 0)))

# крылья: низкая вальма за балюстрадой
hip_roof(FP, 9.7, 38.1, -1.7, WALL_W, ZE, 0.9, ov=0.1, hip0=False, hip1=True)
hip_roof(FP, -38.7, -16.0, -1.7, WALL_W, ZE, 0.9, ov=0.1, hip0=True, hip1=False)
for a, b, c, d in ((9.7, 18.8, -1.7, 0.0), (-18.8, -16.0, -1.7, 0.0), (-30, -23.9, WALL_W, -19), (17.9, 23.9, WALL_W, -19),
                   (-39.9, -38.7, -13.3, -5.5)):
    face('roof', [FP.p(a, c, ZE), FP.p(b, c, ZE), FP.p(b, d, ZE), FP.p(a, d, ZE)], UP)

# центральный двускатный объём: конёк по востоку-западу
SL = 4.4 / CEN_HW                                    # уклон ~19°
HWR = CEN_HW + 0.15
R_Z = ZE - 0.02
for s in (-1, 1):
    face('roof', [FP.p(CEN_C + s * HWR, CEN_E + 0.45, R_Z), FP.p(CEN_C, CEN_E + 0.45, R_Z + HWR * SL),
                  FP.p(CEN_C, CEN_W - 0.45, R_Z + HWR * SL), FP.p(CEN_C + s * HWR, CEN_W - 0.45, R_Z)],
         FP.U() * s + UP)
    face('trim', [FP.p(CEN_C + s * HWR, CEN_E + 0.45, R_Z), FP.p(CEN_C + s * HWR, CEN_W - 0.45, R_Z),
                  FP.p(CEN_C + s * HWR, CEN_W - 0.45, R_Z - 0.2), FP.p(CEN_C + s * HWR, CEN_E + 0.45, R_Z - 0.2)], FP.U() * s)
beam('roof', FP.p(CEN_C, CEN_E + 0.4, R_Z + HWR * SL + 0.05), FP.p(CEN_C, CEN_W - 0.4, R_Z + HWR * SL + 0.05), 0.3, 0.16)

STROKES = {
    'В': [(0, 0, 0, 1), (0, 1, .85, 1), (0, .5, .85, .5), (0, 0, .85, 0), (.85, .5, .85, 1), (.85, 0, .85, .5)],
    'О': [(0, 0, 0, 1), (1, 0, 1, 1), (0, 1, 1, 1), (0, 0, 1, 0)],
    'К': [(0, 0, 0, 1), (0, .45, 1, 1), (.3, .62, 1, 0)],
    'З': [(0, 1, 1, 1), (0, 0, 1, 0), (.2, .5, 1, .5), (1, 0, 1, 1)],
    'А': [(0, 0, .5, 1), (1, 0, .5, 1), (.2, .4, .8, .4)],
    'Л': [(0, 1, 1, 1), (1, 0, 1, 1), (0, 0, .4, 1)],
}
def letters(F, cu, z0, h, text, d, wf=0.7, gap=0.38):
    tw = (len(text) * wf + (len(text) - 1) * gap) * h
    u = cu - tw / 2
    for ch in text:
        for x0, y0, x1, y1 in STROKES[ch]:
            a = F.p(u + x0 * wf * h, d, z0 + y0 * h)
            b = F.p(u + x1 * wf * h, d, z0 + y1 * h)
            beam('glass', a, b, 0.11)
        u += (wf + gap) * h

def pediment(Fp, cu, d, name=None):
    """Фронтон центрального объёма: тимпан, наклонные карнизы с зубчиками."""
    hw = CEN_HW
    ov = 0.45
    sl = SL
    hwo = hw + ov
    apex = ZE + hwo * sl
    prism_uz('wall3', Fp, [(cu - hw, ZE), (cu + hw, ZE), (cu, ZE + hw * sl)], d - 0.35, d)
    bt = 0.5
    for s in (-1, 1):
        prism_uz('trim', Fp, [(cu + s * hwo, ZE), (cu, apex), (cu, apex - bt), (cu + s * (hwo - bt / sl), ZE)], d - 0.15, d + 0.55)
        prism_uz('trim', Fp, [(cu + s * hwo, ZE - 0.02), (cu, apex + 0.1), (cu, apex), (cu + s * hwo, ZE - 0.12)], d - 0.15, d + 0.65)
        k = 1
        while k * 0.62 < hwo - 1.0:                          # зубчики
            u = s * k * 0.62
            zt = apex - abs(u) * sl - bt
            box('trim', Fp, cu + u - 0.13, cu + u + 0.13, d, d + 0.42, zt - 0.28, zt + 0.02, bottom=False)
            k += 1

# восточный фронтон (Frame u = pu)
Fe = Frame(FP.p(0, CEN_E, 0).xy, FP.u, FP.n)
pediment(Fe, CEN_C, 0.0)
letters(Fe, CEN_C, ZE + 1.25, 1.05, 'ВОКЗАЛ', 0.06)
# западный фронтон
Fw = Frame(FP.p(CEN_C, CEN_W, 0).xy, -FP.u, -FP.n)
pediment(Fw, 0.0, 0.0)
# герб над восточным фронтоном — звезда-маяк: небольшой блок
box('trim', Fe, CEN_C - 0.25, CEN_C + 0.25, 0.0, 0.08, ZE + 3.2, ZE + 3.8)

# ------------------------------------------------------------------ балюстрады
BAL = [0, 1, 2, 3, 4, 8, 9, 10, 11, 12, 13, 17, 18, 19, 21, 22, 23, 24, 25, 26, 27]
for i in BAL:
    F, L = EDGE[i]
    a, b = 0.15, L - 0.15
    if i in (4,):
        b = L - 0.1
    balustrade(F, a, b)
# плечи восточного фасада
F, L = EDGE[20]
balustrade(F, 0.15, cen_u0 - 0.1)
balustrade(F, cen_u1 + 0.1, L - 0.15)

# ------------------------------------------------------------------ башенка на северном конце
TU0, TU1, TD0, TD1 = 35.2, 41.6, -12.3, -6.3
TB = 12.9                                     # верх основания
TC = ((TU0 + TU1) / 2, (TD0 + TD1) / 2)
box('wall2', FP, TU0, TU1, TD0, TD1, EAVE, TB, bottom=False)
box('trim', FP, TU0 - 0.1, TU1 + 0.1, TD0 - 0.1, TD1 + 0.1, EAVE, EAVE + 0.22, bottom=False)
box('trim', FP, TU0 - 0.18, TU1 + 0.18, TD0 - 0.18, TD1 + 0.18, TB - 0.45, TB - 0.2)
box('trim', FP, TU0 - 0.4, TU1 + 0.4, TD0 - 0.4, TD1 + 0.4, TB - 0.2, TB + 0.12)
box('trim', FP, TU0 - 0.28, TU1 + 0.28, TD0 - 0.28, TD1 + 0.28, TB + 0.12, TB + 0.32)
# глухие арочные ниши на гранях основания
def niche(F, cu, z0, w, h):
    r = w / 2
    zs = z0 + h - r
    seg = 8
    poly = [(cu - r, z0), (cu + r, z0)] + [(cu + r * math.cos(math.pi * k / seg), zs + r * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
    prism_uz('trim', F, poly, 0.0, 0.07)
    r2 = r - 0.2
    poly2 = [(cu - r2, z0 + 0.2), (cu + r2, z0 + 0.2)] + [(cu + r2 * math.cos(math.pi * k / seg), zs + r2 * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
    prism_uz('wall3', F, poly2, 0.0, 0.10)
tb_frames = [
    (Frame(FP.p(TU0, TD0, 0).xy, FP.n, -FP.u), TD1 - TD0),            # южная грань (pu=TU0): u вдоль востока
    (Frame(FP.p(TU0, TD1, 0).xy, FP.u, FP.n), TU1 - TU0),             # восточная грань (pd=TD1)
    (Frame(FP.p(TU0, TD0, 0).xy, FP.u, -FP.n), TU1 - TU0),            # западная грань (pd=TD0)
]
for Ft, Lt in tb_frames:
    niche(Ft, Lt / 2, EAVE + 0.7, 1.8, 3.1)
Ftn = Frame(FP.p(TU1, TD0, 0).xy, FP.n, FP.u)
niche(Ftn, (TD1 - TD0) / 2, EAVE + 0.7, 1.8, 3.1)
# шары на углах основания
for (pu, pd) in ((TU0, TD0), (TU0, TD1), (TU1, TD0), (TU1, TD1)):
    sphere('trim', FP.p(pu, pd, TB + 0.32 + 0.3), 0.3)
# барабан
base = FP.p(TC[0], TC[1], 0)
R_D = 2.05
Z0D = TB + 0.32
prof = [(2.45, Z0D), (2.45, Z0D + 0.18), (2.15, Z0D + 0.3), (2.15, Z0D + 0.42), (R_D + 0.12, Z0D + 0.5), (R_D, Z0D + 0.62),
        (R_D, Z0D + 4.6), (R_D + 0.08, Z0D + 4.7), (R_D + 0.25, Z0D + 4.8), (R_D + 0.4, Z0D + 4.95), (R_D + 0.4, Z0D + 5.2),
        (R_D + 0.15, Z0D + 5.25)]
lathe('trim_s', base, prof, 20, cap=True)
# гирлянда барельефа на барабане: пояс из выступающих плашек
for k in range(8):
    ang = k * math.pi / 4 + math.pi / 8
    c = base + Vector((math.cos(ang), math.sin(ang), 0)) * (R_D + 0.04)
    sphere('trim', Vector((c.x, c.y, Z0D + 3.2)), 0.2, 6)
cap = [(R_D + 0.4, Z0D + 5.2), (R_D + 0.55, Z0D + 5.2), (R_D + 0.55, Z0D + 5.35), (0.9, Z0D + 6.3), (0.3, Z0D + 6.55), (0.15, Z0D + 6.6)]
lathe('roof', base, cap, 20, cap=True)
beam('metal', Vector((base.x, base.y, Z0D + 6.55)), Vector((base.x, base.y, Z0D + 15.5)), 0.12)
sphere('trim', Vector((base.x, base.y, Z0D + 15.7)), 0.28)

# флагшток на южном крыле (на фото виден отдельный шпиль у восточного торца)
sp = FP.p(-30.0, -9.5, ZE + 0.2)
beam('metal', sp, sp + UP * 8.0, 0.1)

# ------------------------------------------------------------------ навес над платформой вдоль западной стороны
CAN0, CAN1 = -38.7, 38.1
CZ0, CZ1 = 4.8, 4.0
CD0, CD1 = WALL_W, -26.0
slab('metal', [FP.p(CAN0, CD0, CZ0), FP.p(CAN1, CD0, CZ0), FP.p(CAN1, CD1, CZ1), FP.p(CAN0, CD1, CZ1)], 0.28)
box('metal', FP, CAN0, CAN1, CD1 - 0.12, CD1 + 0.02, CZ1 - 0.55, CZ1 + 0.15)
n_col = int((CAN1 - CAN0) // 6.5) + 1
for k in range(n_col + 1):
    u = CAN0 + 2.0 + (CAN1 - CAN0 - 4.0) * k / n_col
    box('metal', FP, u - 0.13, u + 0.13, CD1 + 0.3 - 0.13, CD1 + 0.3 + 0.13, 0.0, CZ1 - 0.28, bottom=False)

finish('zd_vokzal', __file__, tri_budget=25000)
