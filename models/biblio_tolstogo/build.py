# Центральная городская библиотека им. Л. Н. Толстого (ул. Ленина, 51, площадь Ушакова) — модель с нуля.
#
#   blender -b --python models/biblio_tolstogo/build.py -- [glb]
#
# План — контур OSM way 91447927, фасады — по фото Викисклада (refs/). Дом: двухэтажное
# крыло (длинная ось на СВ), на юго-западном торце — полуротонда: три арки в рустованном
# цоколе, над ним открытая лоджия из шести колонн, мощный карниз, барабан с арочными окнами
# и плоским куполом. Ноль высоты — тротуар у подножия ступеней, против центральной арки.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# ------------------------------------------------------------------ материалы
COL['wall']  = ((0.90, 0.88, 0.80), 0.92)     # побелённая штукатурка
COL['wall2'] = ((0.78, 0.75, 0.66), 0.95)     # ниши, тимпаны
COL['trim']  = ((0.95, 0.94, 0.89), 0.88)
COL['stone'] = ((0.46, 0.46, 0.45), 0.9)      # ступени, цоколь
COL['roof']  = ((0.36, 0.41, 0.39), 0.65)     # серо-зелёный металл
COL['wood']  = ((0.42, 0.24, 0.10), 0.6)

# ------------------------------------------------------------------ план
CW = (-24.7, 1667.0)                           # центр полуротонды (мир)
_a = (25.0, -30.4); _l = math.hypot(*_a)       # ось крыла на СВ: ребро контура
AW = (_a[0] / _l, _a[1] / _l)
FRONT = (-AW[0], -AW[1])
RO = 7.6                                       # радиус рустованного яруса = полуширина крыла
X0, Z0 = CW[0] + RO * FRONT[0], CW[1] + RO * FRONT[1]     # низ центральной арки
origin(X0, Z0)

AB = Vector((AW[0], -AW[1]))                   # ось крыла в плоскости Blender
TB = Vector((AB.y, -AB.x))                     # поперёк, на ЮВ
CB = W(*CW)

def lp(s, t, z=0.0):
    v = CB + AB * s + TB * t
    return Vector((v.x, v.y, z))

def pol(r, ph, z=0.0):
    """Полярные: ph — градусы от фасада полуротонды (на ЮЗ), + в сторону ЮВ."""
    p = math.radians(ph)
    return lp(-r * math.cos(p), r * math.sin(p), z)

def radial(ph):
    p = math.radians(ph)
    v = -AB * math.cos(p) + TB * math.sin(p)
    return Vector((v.x, v.y, 0))

def tan_frame(r, ph):
    p = math.radians(ph)
    u = AB * math.sin(p) + TB * math.cos(p)
    n = -AB * math.cos(p) + TB * math.sin(p)
    return Frame(pol(r, ph).xy, u, n)

# высоты
GR = -3.0         # стены уходят под землю
FL = 0.55         # пол арок полуротонды (ступени)
LEDGE = 6.2       # пол лоджии / верх рустованного яруса
ZC = 9.6          # низ венчающего карниза
EAVE = 10.9       # верх карниза
COLH = 3.1

# ------------------------------------------------------------------ вспомогательное
def pb(m, F, u0, u1, d0, d1, z0, z1, bottom=False, back=False):
    """Накладная деталь: как box, но без грани, прижатой к стене (и без низа)."""
    P = lambda u, d, z: F.p(u, d, z)
    c = F.p((u0 + u1) / 2, (d0 + d1) / 2, (z0 + z1) / 2)
    quads = [[P(u0, d1, z0), P(u1, d1, z0), P(u1, d1, z1), P(u0, d1, z1)],
             [P(u0, d0, z0), P(u0, d1, z0), P(u0, d1, z1), P(u0, d0, z1)],
             [P(u1, d0, z0), P(u1, d1, z0), P(u1, d1, z1), P(u1, d0, z1)],
             [P(u0, d0, z1), P(u1, d0, z1), P(u1, d1, z1), P(u0, d1, z1)]]
    if bottom: quads.append([P(u0, d0, z0), P(u1, d0, z0), P(u1, d1, z0), P(u0, d1, z0)])
    if back: quads.append([P(u0, d0, z0), P(u1, d0, z0), P(u1, d0, z1), P(u0, d0, z1)])
    for q in quads:
        face(m, q, sum(q, Vector()) / 4 - c)

def prism_map(m, pts, M, d0, d1, nrm, back=False):
    """Многоугольник (x, z) в отображении M(x, z, d), вытянутый от d0 к d1 (наружу)."""
    a = [M(x, z, d0) for x, z in pts]
    b = [M(x, z, d1) for x, z in pts]
    face(m, b, nrm)
    if back: face(m, a, -nrm)
    c = sum(a + b, Vector()) / (2 * len(a))
    n = len(a)
    for i in range(n):
        j = (i + 1) % n
        q = [a[i], a[j], b[j], b[i]]
        face(m, q, sum(q, Vector()) / 4 - c)

def op_top(op, x):
    if op.get('arch'):
        R = (op['b'] - op['a']) / 2; xc = (op['a'] + op['b']) / 2
        dx = min(abs(x - xc), R)
        return op['zs'] + math.sqrt(max(R * R - dx * dx, 0))
    return op['zs']

def swall(M, x0, x1, z0, z1, d, ops, m, Nfn, maxstep=0.7, ztop=None, xs_extra=()):
    """Стена в развёртке (x — вдоль, z — вверх) с проёмами (прямоугольными или арочными)."""
    xs = {x0, x1, *xs_extra}
    for op in ops:
        xs.update([op['a'], op['b']])
        if op.get('arch'):
            n = max(5, int((op['b'] - op['a']) / 0.3))
            xs.update(op['a'] + (op['b'] - op['a']) * k / n for k in range(n + 1))
    xs = sorted(x for x in xs if x0 - 1e-6 <= x <= x1 + 1e-6)
    out = []
    for i in range(len(xs) - 1):
        a, b = xs[i], xs[i + 1]
        k = max(1, math.ceil((b - a) / maxstep))
        out += [a + (b - a) * j / k for j in range(k)]
    out.append(xs[-1])
    for i in range(len(out) - 1):
        a, b = out[i], out[i + 1]
        if b - a < 1e-6: continue
        c = (a + b) / 2
        ta = ztop(a) if ztop else z1
        tb_ = ztop(b) if ztop else z1
        op = next((o for o in ops if o['a'] < c < o['b']), None)
        nv = Nfn(c)
        if op is None:
            face(m, [M(a, z0, d), M(b, z0, d), M(b, tb_, d), M(a, ta, d)], nv)
        else:
            if op['zb'] > z0 + 1e-4:
                face(m, [M(a, z0, d), M(b, z0, d), M(b, op['zb'], d), M(a, op['zb'], d)], nv)
            ua, ub = op_top(op, a), op_top(op, b)
            if min(ta, tb_) - 1e-4 > min(ua, ub) or abs(ta - ua) + abs(tb_ - ub) > 1e-4:
                face(m, [M(a, ua, d), M(b, ub, d), M(b, tb_, d), M(a, ta, d)], nv)

def recess(M, Nfn, op, depth, mback='wall', mrev='wall', back_ops=None):
    """Углубление в стене: задняя стенка, откосы и свод."""
    a, b, zb, zs = op['a'], op['b'], op['zb'], op['zs']
    top = (lambda x: op_top(op, x))
    zmax = zs + ((b - a) / 2 if op.get('arch') else 0)
    n = max(5, int((b - a) / 0.3))
    xe = [a + (b - a) * k / n for k in range(n + 1)] if op.get('arch') else []
    swall(M, a, b, zb, zmax, -depth, back_ops or [], mback, Nfn, maxstep=999, ztop=top, xs_extra=xe)
    for x, sg in ((a, 1), (b, -1)):
        hint = M(x + sg * 0.5, zb, 0) - M(x, zb, 0)
        face(mrev, [M(x, zb, 0), M(x, zb, -depth), M(x, zs, -depth), M(x, zs, 0)], hint)
    if op.get('arch'):
        for k in range(n):
            xa, xb = a + (b - a) * k / n, a + (b - a) * (k + 1) / n
            face(mrev, [M(xa, op_top(op, xa), 0), M(xb, op_top(op, xb), 0),
                        M(xb, op_top(op, xb), -depth), M(xa, op_top(op, xa), -depth)], -UP)
    else:
        face(mrev, [M(a, zs, 0), M(b, zs, 0), M(b, zs, -depth), M(a, zs, -depth)], -UP)
        face(mrev, [M(a, zb, 0), M(b, zb, 0), M(b, zb, -depth), M(a, zb, -depth)], UP)

def voussoirs(m, M, nrm, xc, zs, R, d0, d1, n=9, thick=0.6, notch=0.17, key=0.3, alt=0.0):
    """Клинчатые рустованные замки арки: ступенчатый внешний контур, увеличенный ключ."""
    for k in range(n):
        t0 = math.pi * (1 - k / n); t1 = math.pi * (1 - (k + 1) / n)
        ro = R + thick - (notch if k % 2 else 0) + (key if k == n // 2 else 0)
        pts = [(xc + R * math.cos(t0), zs + R * math.sin(t0)), (xc + R * math.cos(t1), zs + R * math.sin(t1)),
               (xc + ro * math.cos(t1), zs + ro * math.sin(t1)), (xc + ro * math.cos(t0), zs + ro * math.sin(t0))]
        prism_map(m, pts, M, d0, d1 - (alt if k % 2 else 0) + (0.08 if k == n // 2 else 0), nrm)

def sector(m, r0, r1, a0, a1, z0, z1, n=None, top=True, bottom=True, inner=True, step=10.0):
    """Дуговой брус: радиусы r0..r1, углы a0..a1 (градусы), высоты z0..z1."""
    n = n or max(1, math.ceil(abs(a1 - a0) / step))
    for i in range(n):
        pa = a0 + (a1 - a0) * i / n; pb_ = a0 + (a1 - a0) * (i + 1) / n
        c = pol((r0 + r1) / 2, (pa + pb_) / 2, (z0 + z1) / 2)
        P = lambda r, p, z: pol(r, p, z)
        outer = [P(r1, pa, z0), P(r1, pb_, z0), P(r1, pb_, z1), P(r1, pa, z1)]
        face(m, outer, sum(outer, Vector()) / 4 - c)
        if inner and r0 > 0.01:
            q = [P(r0, pa, z0), P(r0, pb_, z0), P(r0, pb_, z1), P(r0, pa, z1)]
            face(m, q, sum(q, Vector()) / 4 - c)
        if top:
            q = [P(r0, pa, z1), P(r0, pb_, z1), P(r1, pb_, z1), P(r1, pa, z1)]
            face(m, q, UP)
        if bottom:
            q = [P(r0, pa, z0), P(r0, pb_, z0), P(r1, pb_, z0), P(r1, pa, z0)]
            face(m, q, -UP)
        if i == 0:
            q = [P(r0, pa, z0), P(r1, pa, z0), P(r1, pa, z1), P(r0, pa, z1)]
            face(m, q, sum(q, Vector()) / 4 - c)
        if i == n - 1:
            q = [P(r0, pb_, z0), P(r1, pb_, z0), P(r1, pb_, z1), P(r0, pb_, z1)]
            face(m, q, sum(q, Vector()) / 4 - c)

def ring_cornice(rb, z0, a0, a1, dent_deg, mod_deg, core_r0=None, corona=0.95, mod_d=0.85, top=True, step=10.0):
    """Карниз по дуге: фриз, зубчики, гусёк, модульоны, венчающая полка. rb — радиус стены."""
    ri = core_r0 if core_r0 else rb - 0.3
    sector('wall', ri, rb + 0.03, a0, a1, z0, z0 + 0.45, top=False, inner=False, step=step)       # фриз
    k = a0 + dent_deg / 2
    while k < a1:
        sector('trim', rb, rb + 0.19, k - dent_deg * 0.22, k + dent_deg * 0.22, z0 + 0.45, z0 + 0.70, n=1, bottom=False, inner=False)
        k += dent_deg
    sector('trim', ri, rb + 0.38, a0, a1, z0 + 0.70, z0 + 0.82, inner=False, top=False, step=step)  # гусёк
    sector('wall', ri, rb + 0.03, a0, a1, z0 + 0.82, z0 + 1.12, top=False, bottom=False, inner=False, step=step)
    k = a0 + mod_deg / 2
    while k < a1:
        sector('trim', rb, rb + mod_d, k - mod_deg * 0.2, k + mod_deg * 0.2, z0 + 0.82, z0 + 1.12, n=1, bottom=False, inner=False, top=False)
        k += mod_deg
    sector('wall', ri, rb + corona, a0, a1, z0 + 1.12, z0 + 1.30, inner=False, top=top, step=step)  # корона

def straight_cornice(F, u0, u1):
    """То же вдоль прямой стены (рамка F, d — наружу)."""
    pb('wall', F, u0, u1, -0.3, 0.0, ZC, EAVE, back=True)                          # ядро
    pb('wall', F, u0, u1, -0.02, 0.03, ZC, ZC + 0.45)                              # фриз
    u = u0 + 0.2
    while u < u1 - 0.12:
        pb('trim', F, u - 0.08, u + 0.08, 0.0, 0.19, ZC + 0.45, ZC + 0.70)
        u += 0.4
    pb('trim', F, u0, u1, 0.0, 0.38, ZC + 0.70, ZC + 0.82)
    u = u0 + 0.45
    while u < u1 - 0.2:
        pb('trim', F, u - 0.12, u + 0.12, 0.0, 0.85, ZC + 0.82, ZC + 1.12)
        u += 0.9
    pb('wall', F, u0, u1, -0.05, 0.95, ZC + 1.12, EAVE, bottom=True)

def tuscan(base, H=COLH, D=0.74, seg=10):
    """Тосканская колонна: база, ствол с энтазисом, эхин, квадратная абака."""
    R = D / 2
    F0 = Frame(Vector((base.x, base.y)), Vector((1, 0)), Vector((0, 1)))
    box('trim', F0, -R * 1.4, R * 1.4, -R * 1.4, R * 1.4, base.z, base.z + 0.18)
    z0 = base.z
    prof = [(R * 1.12, 0.18), (R * 1.0, 0.24)]
    n = 5
    zs0, zs1 = 0.30, H - 0.55
    for i in range(n + 1):
        t = i / n
        prof.append((R * (1.0 - 0.12 * t * t), zs0 + (zs1 - zs0) * t))
    prof += [(R * 0.88, H - 0.52), (R * 1.0, H - 0.42), (R * 1.18, H - 0.30), (R * 1.22, H - 0.25)]
    lathe('trim_s', Vector((base.x, base.y, z0)), prof, seg, cap=True)
    box('trim', F0, -R * 1.45, R * 1.45, -R * 1.45, R * 1.45, z0 + H - 0.25, z0 + H)

# ================================================================== ПОЛУРОТОНДА
RB = 6.2               # задняя стенка арочных ниш
RW = 5.3               # стена за колоннами лоджии
RCOL = 6.7             # ось колонн
RD = 6.0               # барабан
ZD0, ZD1 = EAVE, 14.0  # барабан: низ и верх стены

def build_rotunda():
    r = RO
    xr = lambda ph: r * math.radians(ph)
    Nr = lambda x: radial(math.degrees(x / r))
    # --- ступени вокруг фасада
    for k in range(3):
        sector('stone', r - 0.1, r + 0.75 * (k + 1), -90, 90, GR, FL - 0.19 * k, bottom=False, inner=False)
    # --- стена рустованного яруса с тремя арками
    ARC = (-45.0, 0.0, 45.0)
    W_AR = 2.2
    SP = 3.5
    ops = [dict(a=xr(c) - W_AR / 2, b=xr(c) + W_AR / 2, zb=FL, zs=SP, arch=True) for c in ARC]
    M = lambda x, z, d: pol(r + d, math.degrees(x / r), z)
    swall(M, xr(-90), xr(90), GR, LEDGE - 0.4, 0, ops, 'wall', Nr)
    for c, op in zip(ARC, ops):
        recess(M, Nr, op, r - RB)
        Mc = lambda x, z, d, c=c: pol(r + d, c + math.degrees(x / r), z)
        voussoirs('trim', Mc, radial(c), 0.0, SP, W_AR / 2, -0.12, 0.30, n=9, thick=0.62, notch=0.20, key=0.34, alt=0.12)
    # --- рустованные простенки
    ha = math.degrees(W_AR / 2 / r)
    piers = [(-90, -45 - ha), (-45 + ha, -ha), (ha, 45 - ha), (45 + ha, 90)]
    nc = 10
    hc = (LEDGE - 0.4 - FL) / nc
    for pier_a, pier_b in piers:
        for j in range(nc):
            z0 = FL + j * hc
            big = j % 2 == 0
            sector('trim', r - 0.1, r + (0.17 if big else 0.05), pier_a + (0 if big else 0.6), pier_b - (0 if big else 0.6),
                   z0, z0 + hc - 0.035, n=max(2, math.ceil((pier_b - pier_a) / 9)), top=False, bottom=False, inner=False)
    # --- пояс над арками (он же пол лоджии)
    sector('wall', RW - 0.1, r + 0.45, -90, 90, LEDGE - 0.4, LEDGE, inner=False)
    sector('trim', r - 0.1, r + 0.55, -90, 90, LEDGE - 0.4, LEDGE - 0.32, top=False, inner=False)
    sector('trim', r + 0.35, r + 0.58, -90, 90, LEDGE - 0.12, LEDGE + 0.03, inner=False)
    # --- дверь в правой арке, табличка и тёмная дверца в остальных
    F = tan_frame(RB, 45)
    box('wood', F, -0.65, 0.65, 0.0, 0.09, FL, FL + 2.45)
    face('glass', [F.p(-0.65, 0.07, FL + 2.5), F.p(0.65, 0.07, FL + 2.5), F.p(0.65, 0.07, FL + 3.15), F.p(-0.65, 0.07, FL + 3.15)], F.N())
    pb('trim', F, -0.75, 0.75, 0.0, 0.14, FL + 2.45, FL + 2.55)
    pb('trim', F, -0.85, -0.65, 0.0, 0.12, FL, FL + 3.2); pb('trim', F, 0.65, 0.85, 0.0, 0.12, FL, FL + 3.2)
    pb('trim', F, -0.9, 0.9, 0.0, 0.12, FL + 3.15, FL + 3.28)
    arc = [(0.95 * math.cos(math.pi * k / 10), FL + 3.4 + 0.5 * math.sin(math.pi * k / 10)) for k in range(11)]
    face('wall2', [F.p(u, 0.03, z) for u, z in arc], F.N())
    F = tan_frame(RB, 0)
    pb('stone', F, -0.5, 0.5, 0.0, 0.05, 2.6, 3.35)
    pb('wall2', F, -0.7, 0.7, 0.0, 0.03, FL, 2.3)
    F = tan_frame(RB, -45)
    pb('metal', F, -0.55, 0.55, 0.0, 0.06, FL, FL + 2.0)

    # --- лоджия: стена за колоннами и окна между колоннами
    wins = [(-72, 1.3), (-36, 1.5), (0, 1.5), (36, 1.5), (72, 1.3)]
    Mw = lambda x, z, d: pol(RW + d, math.degrees(x / RW), z)
    Nw = lambda x: radial(math.degrees(x / RW))
    xw = lambda ph: RW * math.radians(ph)
    WZ0, WZ1 = LEDGE + 0.9, LEDGE + 2.8
    wops = [dict(a=xw(c) - w / 2, b=xw(c) + w / 2, zb=WZ0, zs=WZ1) for c, w in wins]
    swall(Mw, xw(-90), xw(90), LEDGE, ZC, 0, wops, 'wall', Nw)
    for (c, w), op in zip(wins, wops):
        recess(Mw, Nw, op, 0.3)
        Fw = tan_frame(RW, c)
        glazing(Fw, -w / 2, w / 2, WZ0, WZ1, 0, cols=2, rows=(0.62,), reveal=0.3)
        pb('trim', Fw, -w / 2 - 0.14, -w / 2, 0, 0.05, WZ0, WZ1); pb('trim', Fw, w / 2, w / 2 + 0.14, 0, 0.05, WZ0, WZ1)
        pb('trim', Fw, -w / 2 - 0.2, w / 2 + 0.2, 0, 0.12, WZ1, WZ1 + 0.2)
        pb('trim', Fw, -w / 2 - 0.1, w / 2 + 0.1, 0, 0.1, WZ0 - 0.12, WZ0)
        for k in range(-3, 4):         # рустованная перемычка над окном
            pb('trim', Fw, k * w / 7 - w / 14 + 0.02, k * w / 7 + w / 14 - 0.02, 0, 0.05, WZ1 + 0.22, WZ1 + 0.62)
    # возвраты стены у торца крыла (плоские стены на оси s = 0)
    for sg in (1, -1):
        Fr = Frame(lp(0, sg * RW).xy, TB * sg, -AB)
        wall(Fr, 0, RO - RW, LEDGE, ZC, 0, [])
    # колонны
    for c in (-90, -54, -18, 18, 54, 90):
        tuscan(pol(RCOL, c, LEDGE))
    # антаблемент
    sector('wall', RW - 0.1, r + 0.03, -90, 90, ZC - 0.3, ZC, top=False, inner=False)       # архитрав / потолок
    sector('trim', RW + 1.0, r + 0.05, -90, 90, ZC - 0.3, ZC - 0.2, top=False, inner=False)
    ring_cornice(r, ZC, -90, 90, 4.0, 6.0, core_r0=RW - 0.1, top=False)
    # настил кровли над лоджией
    sector('roof', RW - 0.1, r + 0.95, -90, 90, EAVE, EAVE + 0.04, bottom=False, inner=False)

def arch_glass(F, hw, zb, zs, d, trans=(0.45,)):
    """Арочное окно: стекло, рама, импост и средник."""
    arc = [(hw * math.cos(math.pi * k / 8), zs + hw * math.sin(math.pi * k / 8)) for k in range(9)]
    pts = [(hw, zb)] + arc + [(-hw, zb)]
    face('glass', [F.p(u, d, z) for u, z in pts], F.N())
    t = 0.05
    pb('trim', F, -hw, -hw + t, d, d + 0.07, zb, zs); pb('trim', F, hw - t, hw, d, d + 0.07, zb, zs)
    pb('trim', F, -hw, hw, d, d + 0.07, zb, zb + t)
    pb('trim', F, -t / 2, t / 2, d, d + 0.07, zb, zs + hw)
    for f in trans:
        z = zb + (zs - zb) * f
        pb('trim', F, -hw, hw, d, d + 0.07, z - t / 2, z + t / 2)
    pb('trim', F, -hw, hw, d, d + 0.07, zs - t / 2, zs + t / 2)
    ri = 1 - t / hw
    for k in range(8):
        (ua, za), (ub, zb2) = arc[k], arc[k + 1]
        face('trim', [F.p(ua, d + 0.07, za), F.p(ub, d + 0.07, zb2),
                      F.p(ub * ri, d + 0.07, zs + (zb2 - zs) * ri), F.p(ua * ri, d + 0.07, zs + (za - zs) * ri)], F.N())

def build_drum():
    r = RD
    xr = lambda ph: r * math.radians(ph)
    cs = [36 * k for k in range(-4, 5)]            # окна через 36°, на тыльной стороне окна нет
    HW, ZB, ZS = 0.74, 11.9, 12.95
    ops = [dict(a=xr(c) - HW, b=xr(c) + HW, zb=ZB, zs=ZS, arch=True) for c in cs]
    M = lambda x, z, d: pol(r + d, math.degrees(x / r), z)
    Nf = lambda x: radial(math.degrees(x / r))
    swall(M, xr(-180), xr(180), ZD0 - 0.1, ZD1, 0, ops, 'wall', Nf, maxstep=1.2)
    for c, op in zip(cs, ops):
        recess(M, Nf, op, 0.32)
        F = tan_frame(r, c)
        arch_glass(F, HW, ZB, ZS, -0.28)
        # архивольт одним ободом
        outer = [(( HW + 0.2) * math.cos(math.pi * k / 8), ZS + (HW + 0.2) * math.sin(math.pi * k / 8)) for k in range(9)]
        inner = [(HW * math.cos(math.pi * k / 8), ZS + HW * math.sin(math.pi * k / 8)) for k in range(9)]
        Mc = lambda x, z, d, c=c: pol(r + d, c + math.degrees(x / r), z)
        prism_map('trim', outer + inner[::-1], Mc, -0.04, 0.07, radial(c))
        pb('trim', F, -HW - 0.12, HW + 0.12, 0.0, 0.10, ZB - 0.12, ZB)
    ring_cornice(r, ZD1, -180, 180, 6.0, 9.0, core_r0=r - 0.6, corona=1.1, mod_d=1.0, top=True, step=12.0)
    # плоский купол
    prof = [(r + 0.8, ZD1 + 1.30), (r + 0.7, ZD1 + 1.55), (5.9, ZD1 + 1.95), (4.5, ZD1 + 2.35), (2.6, ZD1 + 2.6), (0.0, ZD1 + 2.7)]
    lathe('roof', pol(0, 0, 0), prof, 32, cap=False)

# ================================================================== КРЫЛО
FN = Frame(lp(0, -RO).xy, AB, -TB)          # СЗ фасад (улица Ленина), u вдоль крыла на СВ
FS = Frame(lp(0, RO).xy, AB, TB)            # ЮВ фасад
LW = 38.0                                   # длина крыла от оси полуротонды
AN_S0, AN_T1 = 28.0, 16.1                    # пристройка на СВ конце, ЮВ сторона
FE = Frame(lp(LW, -RO).xy, TB, AB)          # торец, u на ЮВ
FA = Frame(lp(AN_S0, AN_T1).xy, AB, TB)     # ЮВ фасад пристройки
FAs = Frame(lp(AN_S0, RO).xy, TB, -AB)      # ЮЗ торец пристройки
ZU, HU = 6.95, 2.0                          # верхние окна: подоконник, высота
WW = 1.2                                    # ширина окон

def plain_win(F, cu, za, h, w=WW):
    ua, ub = cu - w / 2, cu + w / 2
    zt = za + h
    glazing(F, ua, ub, za, zt, 0, cols=2, rows=(0.66,))
    pb('trim', F, ua - 0.14, ua, 0, 0.05, za, zt + 0.14); pb('trim', F, ub, ub + 0.14, 0, 0.05, za, zt + 0.14)
    pb('trim', F, ua, ub, 0, 0.05, zt, zt + 0.14)
    pb('trim', F, ua - 0.2, ub + 0.2, 0, 0.12, za - 0.1, za)
    return (ua, ub, za, zt)

def hat_window(F, cu, za=ZU, w=WW, h=HU):
    ua, ub = cu - w / 2, cu + w / 2
    zt = za + h
    glazing(F, ua, ub, za, zt, 0, cols=2, rows=(0.64,))
    pb('trim', F, ua - 0.14, ua, 0, 0.05, za, zt); pb('trim', F, ub, ub + 0.14, 0, 0.05, za, zt)
    pb('trim', F, ua - 0.14, ub + 0.14, 0, 0.06, zt, zt + 0.12)
    for s in (ua - 0.26, ub + 0.04):                                   # консоли
        pb('trim', F, s, s + 0.22, 0, 0.14, zt - 0.62, zt + 0.12)
    pb('trim', F, ua - 0.36, ub + 0.36, 0, 0.26, zt + 0.12, zt + 0.28)
    pb('trim', F, ua - 0.46, ub + 0.46, 0, 0.33, zt + 0.28, zt + 0.38, bottom=True)
    pb('trim', F, ua - 0.1, ub + 0.1, 0, 0.12, za - 0.12, za)
    return (ua, ub, za, zt)

def ped_window(F, cu, za=1.15, w=WW, h=1.6):
    ua, ub = cu - w / 2, cu + w / 2
    zt = za + h
    glazing(F, ua, ub, za, zt, 0, cols=2, rows=(0.5,))
    pb('trim', F, ua - 0.1, ua, 0, 0.05, za, zt); pb('trim', F, ub, ub + 0.1, 0, 0.05, za, zt)
    pb('trim', F, ua - 0.1, ub + 0.1, 0, 0.06, zt, zt + 0.1)
    pb('trim', F, ua - 0.22, ub + 0.22, 0, 0.24, zt + 0.1, zt + 0.22, bottom=True)
    prism_uz('trim', F, [(ua - 0.22, zt + 0.22), (ub + 0.22, zt + 0.22), (cu, zt + 0.22 + 0.5)], 0.0, 0.18)
    pb('trim', F, ua - 0.16, ub + 0.16, 0, 0.10, za - 0.12, za)
    return (ua, ub, za, zt)

def bust(F, u, zc=7.95):
    """Бюст в круглой нише на консоли."""
    disc = [(u + 0.62 * math.cos(2 * math.pi * k / 14), zc + 0.62 * math.sin(2 * math.pi * k / 14)) for k in range(14)]
    face('wall2', [F.p(x, 0.012, z) for x, z in disc], F.N())
    pb('trim', F, u - 0.17, u + 0.17, 0.0, 0.26, zc - 0.40, zc - 0.05)       # плечи
    pb('trim', F, u - 0.11, u + 0.11, 0.04, 0.20, zc - 0.05, zc + 0.30)         # голова
    pb('trim', F, u - 0.12, u + 0.12, 0.0, 0.34, zc - 0.82, zc - 0.40, bottom=True)   # консоль
    pb('trim', F, u - 0.05, u + 0.05, 0.0, 0.22, zc - 1.25, zc - 0.82)

def plinth(F, u0, u1):
    pb('stone', F, u0, u1, -0.25, 0.10, GR, 0.8, back=True)
    pb('trim', F, u0, u1, -0.25, 0.14, 0.8, 0.9, bottom=True)

def string_course(F, u0, u1):
    pb('trim', F, u0, u1, -0.02, 0.10, 5.55, 5.70)
    pb('trim', F, u0, u1, -0.02, 0.17, 5.70, 6.05)
    pb('trim', F, u0, u1, -0.02, 0.22, 6.05, LEDGE, bottom=True)

def wing_side(F, u0, u1, cus, rich, z_hi=ZC):
    """Фасад крыла: цоколь, нижний ярус с арками, пояс, верхние окна, карниз."""
    holes = []
    for i, cu in enumerate(cus):
        if rich:
            if i != 0:
                holes.append(ped_window(F, cu))
            holes.append(hat_window(F, cu))
        else:
            holes.append(plain_win(F, cu, 1.2, 2.3))
            holes.append(plain_win(F, cu, ZU, HU))
    wall(F, u0, u1, GR, z_hi, 0, holes)
    plinth(F, u0, u1)
    string_course(F, u0, u1)
    if rich:
        M = lambda x, z, d: F.p(x, d, z)
        for i, cu in enumerate(cus):
            voussoirs('trim', M, F.N(), cu, 3.55, 1.2, -0.06, 0.22, n=9, thick=0.62, notch=0.17, key=0.3, alt=0.09)
            arc = [(cu + 1.06 * math.cos(math.pi * k / 8), 3.55 + 1.06 * math.sin(math.pi * k / 8)) for k in range(9)]
            if i != 0:
                face('wall2', [F.p(x, 0.012, z) for x, z in arc], F.N())
            else:
                face('wall2', [F.p(cu + 1.06, 0.012, 1.0), F.p(cu - 1.06, 0.012, 1.0)] +
                     [F.p(x, 0.012, z) for x, z in reversed(arc)], F.N())
        for i in range(len(cus) - 1):
            bust(F, (cus[i] + cus[i + 1]) / 2)

def end_wall(F, u0, u1, cus, top, floors, base_wall=GR):
    """Простой торец: два ряда окон и пояс."""
    holes = []
    for cu in cus:
        for za, h in floors:
            holes.append(plain_win(F, cu, za, h))
    wall(F, u0, u1, base_wall, top, 0, holes)
    plinth(F, u0, u1)

def build_wing():
    cus = [3.0 + 4.0 * i for i in range(9)]
    # СЗ фасад
    wing_side(FN, 0, LW, cus, True)
    straight_cornice(FN, -0.95, LW + 0.95)
    for (a, b) in ((0, 1.0), (LW - 1.0, LW)):          # угловые руст-лопатки
        z, k = 0.9, 0
        while z < 5.4:
            pb('trim', FN, a, b, -0.02, 0.07 if k % 2 == 0 else 0.03, z, z + 0.55)
            z += 0.6; k += 1
    # ЮВ фасад: до пристройки полностью, над ней — только верх
    wing_side(FS, 0, AN_S0, [3.0 + 4.0 * i for i in range(7)], False)
    wall(FS, AN_S0, LW, 8.9, ZC, 0, [])
    straight_cornice(FS, -0.95, LW + 0.95)
    string_course(FS, AN_S0, LW)
    # торец на СВ (основная часть крыла)
    end_wall(FE, 0, 2 * RO, (2.55, 7.6, 12.65), ZC, ((1.2, 2.3), (ZU, HU)))
    string_course(FE, 0, 2 * RO)
    straight_cornice(FE, -0.95, 2 * RO + 0.95)
    # пристройка
    AH = 8.0
    end_wall(FA, 0, LW - AN_S0, (1.7, 5.0, 8.3), AH, ((1.1, 2.2), (4.9, 2.3)))
    end_wall(FAs, 0, AN_T1 - RO, (2.1, 6.4), AH, ((1.1, 2.2), (4.9, 2.3)))
    end_wall(FE, 2 * RO, 2 * RO + AN_T1 - RO, (2 * RO + 2.1, 2 * RO + 6.4), AH, ((1.1, 2.2), (4.9, 2.3)))
    for F_, a, b in ((FA, 0, LW - AN_S0), (FAs, 0, AN_T1 - RO), (FE, 2 * RO, 2 * RO + AN_T1 - RO)):
        pb('trim', F_, a, b, -0.02, 0.15, 4.0, 4.2)
        cornice(F_, a, b, 0, AH, ext=0.5)
    # кровля пристройки — пологий скат к стене крыла
    Fsh = Frame(lp(0, 0).xy, TB, AB)
    prism_uz('roof', Fsh, [(RO - 0.1, 9.52), (AN_T1 + 0.65, 8.85), (AN_T1 + 0.65, 8.60), (RO - 0.1, 8.60)], AN_S0 - 0.55, LW + 0.55)
    # кровля крыла: низкая вальма
    Fr = Frame(lp(0, 0).xy, AB, TB)
    hip_roof(Fr, -0.9, LW + 0.9, RO + 0.9, -(RO + 0.9), EAVE, 1.45, ov=0.15, hip0=True, hip1=True)
    # водосточные трубы
    for sg in (-1, 1):
        beam('trim', lp(0.35, sg * (RO + 0.12), 0.4), lp(0.35, sg * (RO + 0.12), ZC - 0.1), 0.12)

build_rotunda()
build_drum()
build_wing()

finish('biblio_tolstogo', __file__, tri_budget=25000)
