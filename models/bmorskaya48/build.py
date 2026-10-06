# Большая Морская, 48 — угловой дом сталинской застройки с ионической
# лоджией над гранёным эркером. Модель с нуля.
#
#   blender -b --python models/bmorskaya48/build.py -- [glb]
#
# Контур OSM way 91740348 — прямоугольник 12.2 × 54.1 м, длинной стороной
# вдоль Б. Морской (восточный фасад). С севера к нему вплотную примыкает
# w91740319 (общая стена), с юга — проезд, с запада — двор.
# Описание — refs/center-models.json (одно фото снизу с угла); что видно и что
# наугад — NOTES.md. Ноль высоты — тротуар под эркером.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# ------------------------------------------------------------------ контур
NW, NE, SE, SW = (-209.1, 1474.2), (-197.2, 1471.3), (-184.6, 1523.9), (-196.6, 1526.8)
IN = (-197.0, 1499.0)
LEN = 54.1
EU = 16.0                     # ось эркера: напротив примыкания улицы с востока

_d = ((SE[0] - NE[0]) / LEN, (SE[1] - NE[1]) / LEN)
X0, Z0 = round(NE[0] + _d[0] * EU, 2), round(NE[1] + _d[1] * EU, 2)
origin(X0, Z0)

COL['wall'] = ((0.851, 0.800, 0.651), 0.9)     # песчано-бежевая штукатурка #d9cca6
COL['trim'] = ((0.914, 0.878, 0.784), 0.85)    # наличники и пояса #e9e0c8
COL['roof'] = ((0.553, 0.561, 0.541), 0.85)    # #8d8f8a
COL['stone'] = ((0.62, 0.60, 0.55), 0.9)       # цоколь — наугад

FE, _ = frame_from(NE, SE, IN)     # Б. Морская: u с севера на юг, n на восток
FS, LS = frame_from(SE, SW, IN)    # южный торец к проезду
FW, _ = frame_from(SW, NW, IN)     # двор: u с юга на север
FN, LN = frame_from(NW, NE, IN)    # общая стена с соседом

GROUND = -3.0
SHOP = 4.0                    # верх первого (торгового) этажа
FL = [4.0, 7.2, 10.4]         # низ жилых этажей; верхний — с лоджией
EAVE = 13.4                   # низ венчающего карниза
TOP = 14.0                    # кровля
PAR = 14.6                    # верх парапета
WW, WH, SILL = 1.3, 1.85, 0.9

# оси окон по Б. Морской: четыре севернее эркера, одиннадцать южнее
E0, E1, EP = EU - 2.6, EU + 2.6, 1.0          # эркер: ширина у стены, вылет
AX = [1.0 + 3.1 * (k + 0.5) for k in range(4)] + [E1 + (53.0 - E1) / 11 * (k + 0.5) for k in range(11)]
BAL = AX[5]                   # балкон с балюстрадой на третьем этаже, левее эркера

def fr_plan(F, a, b, inside):
    """Рамка по двум точкам (u, d) в рамке F; inside — точка (u, d) внутри."""
    pa, pb, pi = F.p(a[0], a[1], 0), F.p(b[0], b[1], 0), F.p(inside[0], inside[1], 0)
    o = Vector((pa.x, pa.y)); u = Vector((pb.x - pa.x, pb.y - pa.y))
    L = u.length; u.normalize()
    n = Vector((-u.y, u.x))
    if n.dot(Vector((pi.x, pi.y)) - o) > 0: n = -n
    return Frame(o, u, n), L

# ------------------------------------------------------------------ лёгкие окна
# Окон под семьдесят: коробки набора (12 треугольников на брусок) не влезают
# в бюджет 10 тыс., поэтому переплёт — плоские полосы перед стеклом, а наличник —
# П-образная накладка без задней грани.
def pbox(m, F, u0, u1, d0, d1, z0, z1):
    """Брусок у стены: без задней грани."""
    P = F.p
    face(m, [P(u0, d1, z0), P(u1, d1, z0), P(u1, d1, z1), P(u0, d1, z1)], F.N())
    face(m, [P(u0, d0, z1), P(u1, d0, z1), P(u1, d1, z1), P(u0, d1, z1)], UP)
    face(m, [P(u0, d0, z0), P(u1, d0, z0), P(u1, d1, z0), P(u0, d1, z0)], -UP)
    face(m, [P(u0, d0, z0), P(u0, d1, z0), P(u0, d1, z1), P(u0, d0, z1)], -F.U())
    face(m, [P(u1, d0, z0), P(u1, d1, z0), P(u1, d1, z1), P(u1, d0, z1)], F.U())

def glaze(F, ua, ub, za, zb, d, cols=2, rows=(0.7,), reveal=0.24):
    g = d - reveal + 0.02
    face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
    f = g + 0.03; t = 0.07
    q = lambda a, b, c, e: face('trim', [F.p(a, f, c), F.p(b, f, c), F.p(b, f, e), F.p(a, f, e)], F.N())
    q(ua, ub, za, za + t); q(ua, ub, zb - t, zb); q(ua, ua + t, za + t, zb - t); q(ub - t, ub, za + t, zb - t)
    for c in range(1, cols):
        u = ua + (ub - ua) * c / cols
        q(u - t / 2, u + t / 2, za + t, zb - t)
    for r in rows:
        z = za + (zb - za) * r
        q(ua + t, ub - t, z - t / 2, z + t / 2)

def frame_u(F, ua, ub, za, zb, d, w=0.16, pr=0.05):
    """П-образный наличник одной накладкой."""
    poly = [(ua - w, za), (ua, za), (ua, zb), (ub, zb), (ub, za), (ub + w, za), (ub + w, zb + w), (ua - w, zb + w)]
    face('trim', [F.p(u, d + pr, z) for u, z in poly], F.N())
    n = len(poly)
    for i in range(n):
        j = (i + 1) % n
        (u0, z0), (u1, z1) = poly[i], poly[j]
        face('trim', [F.p(u0, d, z0), F.p(u1, d, z1), F.p(u1, d + pr, z1), F.p(u0, d + pr, z0)], None)
    pbox('trim', F, ua - w - 0.04, ub + w + 0.04, d, d + 0.12, za - 0.1, za)

def win_cap(F, cu, za, w, h, d, cap=True):
    """Окно в наличнике с карнизиком."""
    glaze(F, cu - w / 2, cu + w / 2, za, za + h, d)
    frame_u(F, cu - w / 2, cu + w / 2, za, za + h, d)
    if cap:
        pbox('trim', F, cu - w / 2 - 0.3, cu + w / 2 + 0.3, d, d + 0.2, za + h + 0.16, za + h + 0.3)

def baluster_row(F, u0, u1, d, z0, step=0.26):
    """Балюстрада: плинт, балясины-веретёна, поручень."""
    box('trim', F, u0, u1, d - 0.12, d + 0.12, z0, z0 + 0.14)
    box('trim', F, u0 - 0.04, u1 + 0.04, d - 0.15, d + 0.15, z0 + 0.86, z0 + 0.98)
    n = max(1, int((u1 - u0) / step))
    prof = [(0.05, 0.14), (0.095, 0.40), (0.045, 0.66), (0.06, 0.80), (0.05, 0.86)]
    for k in range(n):
        u = u0 + (u1 - u0) * (k + 0.5) / n
        p = F.p(u, d, z0)
        lathe('trim', p, prof, seg=5, cap=False)

def ionic(F, base, H, D=0.45):
    """Ионическая колонна: база, ствол с утонением, эхин, абака и две волюты по фасаду."""
    R = D / 2
    prof = [(R * 1.35, 0.0), (R * 1.35, 0.08), (R * 1.2, 0.14), (R * 1.25, 0.20), (R, 0.26)]
    zc = H - 0.32
    for i in range(1, 6):
        t = i / 5
        prof.append((R - R * 0.14 * t ** 1.6, 0.26 + (zc - 0.26) * t))
    prof += [(R * 0.98, zc + 0.03), (R * 1.15, zc + 0.12)]
    lathe('trim_s', base, prof, seg=10, cap=True)
    G = Frame(Vector((base.x, base.y)), F.u, F.n)
    z = base.z
    box('trim', G, -R * 1.45, R * 1.45, -R * 1.2, R * 1.2, z + H - 0.2, z + H - 0.08)   # подушка
    box('trim', G, -R * 1.5, R * 1.5, -R * 1.3, R * 1.3, z + H - 0.08, z + H)          # абака
    bm = bm_of('trim_s'); sg = 8; rr = 0.11
    for s in (-1, 1):
        c0 = G.p(s * R * 1.35, 0, z + H - 0.24)
        ring = lambda dd: [bm.verts.new(c0 + G.N() * dd + (G.U() * math.cos(2 * math.pi * i / sg) + UP * math.sin(2 * math.pi * i / sg)) * rr) for i in range(sg)]
        ra, rb = ring(-R * 1.1), ring(R * 1.1)
        for i in range(sg):
            j = (i + 1) % sg
            bm.faces.new([ra[i], ra[j], rb[j], rb[i]]).smooth = True
        bm.faces.new(ra); bm.faces.new(rb)

def flat_windows(F, axes, zs, w=WW, h=WH):
    """Дворовые окна: стекло и рамка заподлицо, без проёма — дешёво."""
    for z in zs:
        for cu in axes:
            face('glass', [F.p(cu - w / 2, 0.03, z), F.p(cu + w / 2, 0.03, z),
                           F.p(cu + w / 2, 0.03, z + h), F.p(cu - w / 2, 0.03, z + h)], F.N())
            face('trim', [F.p(cu - w / 2 - 0.1, 0.02, z - 0.12), F.p(cu + w / 2 + 0.1, 0.02, z - 0.12),
                          F.p(cu + w / 2 + 0.1, 0.02, z), F.p(cu - w / 2 - 0.1, 0.02, z)], F.N())

# ================================================================== Б. Морская
def build_east():
    F = FE
    holes = []
    # первый этаж: витрины между простенками, вход с пилястрами под эркером
    shop = []
    for cu in AX:
        shop.append((cu - 1.1, cu + 1.1, 0.45, 3.1))
    door = (EU - 0.9, EU + 0.9, 0.0, 2.9)
    holes += shop + [door]
    for ua, ub, za, zb in shop:
        glaze(F, ua, ub, za, zb, 0, cols=2, rows=(0.78,))
    g = -0.22
    face('wood', [F.p(door[0], g, 0), F.p(door[1], g, 0), F.p(door[1], g, 2.3), F.p(door[0], g, 2.3)], F.N())
    face('glass', [F.p(door[0], g, 2.3), F.p(door[1], g, 2.3), F.p(door[1], g, 2.9), F.p(door[0], g, 2.9)], F.N())
    for s in (-1, 1):
        u = EU + s * 1.25
        box('trim', F, u - 0.25, u + 0.25, 0, 0.18, 0, 3.15)
        box('trim', F, u - 0.32, u + 0.32, 0, 0.24, 3.0, 3.2)
    # цоколь под витринами
    box('stone', F, -0.05, LEN + 0.05, 0, 0.08, GROUND, 0.45)
    # козырёк по всей ширине и белая вывеска над ним
    box('metal', F, 0.2, LEN - 0.2, 0, 1.4, 3.3, 3.42)
    box('trim', F, 0.4, LEN - 0.4, 0, 0.12, 3.45, 3.95)
    band(F, -0.05, LEN + 0.05, 0, SHOP, SHOP + 0.25, 0.14)
    # жилые этажи
    for i, z0 in enumerate(FL):
        for cu in AX:
            if i == 1 and cu == BAL:
                holes.append((cu - 0.65, cu + 0.65, z0, z0 + 2.45))
                glaze(F, cu - 0.65, cu + 0.65, z0, z0 + 2.45, 0, cols=2, rows=(0.75,))
                frame_u(F, cu - 0.65, cu + 0.65, z0, z0 + 2.45, 0)
                continue
            holes.append((cu - WW / 2, cu + WW / 2, z0 + SILL, z0 + SILL + WH))
            win_cap(F, cu, z0 + SILL, WW, WH, 0)
    # верхний этаж за лоджией: дверь и два окна
    zl = FL[2]
    for cu, za, h in ((EU - 1.55, zl + SILL, WH), (EU, zl, 2.5), (EU + 1.55, zl + SILL, WH)):
        holes.append((cu - 0.55, cu + 0.55, za, za + h))
        glaze(F, cu - 0.55, cu + 0.55, za, za + h, 0, cols=2, rows=(0.72,))
    wall(F, 0, LEN, GROUND, TOP, 0, holes)
    # междуэтажные пояса и угловые пилястры
    for z in (FL[1] - 0.1, FL[2] - 0.1):
        band(F, -0.02, E0, 0, z, z + 0.12, 0.06); band(F, E1, LEN + 0.02, 0, z, z + 0.12, 0.06)
    for cu in (0.48, LEN - 0.48):
        pilaster(F, cu, 0, SHOP + 0.25, EAVE - SHOP - 0.25, w=0.8, pr=0.14)
    cornice(F, -0.1, LEN + 0.1, 0, EAVE, ext=0.6)
    # балкон с балюстрадой на третьем этаже
    z = FL[1]
    box('trim', F, BAL - 1.1, BAL + 1.1, 0, 0.95, z - 0.2, z)
    for s in (-0.8, 0.8):
        prism_uz('trim', F, [(BAL + s - 0.1, z - 0.2), (BAL + s + 0.1, z - 0.2), (BAL + s + 0.1, z - 0.75)], 0, 0.8)
    baluster_row(F, BAL - 1.0, BAL + 1.0, 0.85, z)
    for s in (-1, 1):
        a = Frame(F.p(BAL + s * 1.0, 0, 0).to_2d(), F.n, F.u)
        baluster_row(a, 0.05, 0.75, 0, z)

# ================================================================== эркер и лоджия
def build_erker():
    F = FE
    plan = [(E0, 0), (E0 + 0.8, EP), (E1 - 0.8, EP), (E1, 0)]
    z0, z1 = FL[0] + 0.2, FL[2]
    # консоли и плита под эркером
    prism_plan('trim', F, [(E0 - 0.15, 0), (E0 + 0.75, EP + 0.15), (E1 - 0.75, EP + 0.15), (E1 + 0.15, 0)], z0 - 0.25, z0)
    for u in (E0 + 0.6, EU - 0.9, EU + 0.9, E1 - 0.6):
        prism_uz('trim', F, [(u - 0.14, z0 - 0.25), (u + 0.14, z0 - 0.25), (u + 0.14, z0 - 0.95)], 0, EP * 0.85)
    # грани: две срезанные, лицевая с двумя окнами на этаж
    for k in range(3):
        G, L = fr_plan(F, plan[k], plan[k + 1], (EU, -1))
        holes = []
        if k == 1:
            for z in FL[:2]:
                for cu in (L / 2 - 0.85, L / 2 + 0.85):
                    holes.append((cu - 0.5, cu + 0.5, z + SILL, z + SILL + WH))
                    glaze(G, cu - 0.5, cu + 0.5, z + SILL, z + SILL + WH, 0, cols=2, rows=(0.7,))
                    frame_u(G, cu - 0.5, cu + 0.5, z + SILL, z + SILL + WH, 0)
        wall(G, 0, L, z0, z1, 0, holes)
        band(G, -0.02, L + 0.02, 0, FL[1] - 0.1, FL[1] + 0.02, 0.06)
    # кованый балкон по лицевой грани (третий этаж)
    G, L = fr_plan(F, plan[1], plan[2], (EU, -1))
    z = FL[1]
    box('trim', G, -0.1, L + 0.1, 0, 0.45, z - 0.16, z)
    for a, b in (((-0.05, 0.42), (L + 0.05, 0.42)),):
        for h in (0.1, 0.95):
            beam('metal', G.p(a[0], a[1], z + h), G.p(b[0], b[1], z + h), 0.04)
    for k in range(int(L / 0.2) + 1):
        u = k * L / int(L / 0.2)
        beam('metal', G.p(u, 0.42, z), G.p(u, 0.42, z + 0.95), 0.018)
    for s in (0, L):
        beam('metal', G.p(s, 0.42, z + 0.95), G.p(s, 0.02, z + 0.95), 0.04)
    # пол лоджии на эркере
    prism_plan('trim', F, [(E0 - 0.1, 0), (E0 + 0.75, EP + 0.12), (E1 - 0.75, EP + 0.12), (E1 + 0.1, 0)], z1 - 0.05, z1 + 0.12)
    # лоджия: четыре ионические колонны по углам эркера, балюстрада между ними
    zc = z1 + 0.12
    H = EAVE - 0.45 - zc
    cols = [(E0 + 0.3, 0.25), (E0 + 0.95, EP - 0.12), (E1 - 0.95, EP - 0.12), (E1 - 0.3, 0.25)]
    for u, d in cols:
        ionic(F, F.p(u, d, zc), H)
    for k in range(3):
        a, b = cols[k], cols[k + 1]
        G, L = fr_plan(F, a, b, (EU, -1))
        baluster_row(G, 0.3, L - 0.3, 0, zc)
    # антаблемент над колоннами по плану эркера, выше — венчающий карниз
    ent = [(E0, 0), (E0 + 0.85, EP + 0.05), (E1 - 0.85, EP + 0.05), (E1, 0)]
    prism_plan('trim', F, ent, EAVE - 0.45, EAVE, top=False)
    cor = [(E0 - 0.6, 0), (E0 + 0.6, EP + 0.6), (E1 - 0.6, EP + 0.6), (E1 + 0.6, 0)]
    prism_plan('trim', F, cor, EAVE, EAVE + 0.6)
    face('trim', [F.p(u, d, EAVE - 0.45) for u, d in ent], -UP)

# ================================================================== торец, двор, общая стена, кровля
def build_south():
    F = FS
    ax = [LS * (k + 0.5) / 3 for k in range(3)]
    holes = []
    for z0 in FL:
        for cu in ax:
            holes.append((cu - WW / 2, cu + WW / 2, z0 + SILL, z0 + SILL + WH))
            win_cap(F, cu, z0 + SILL, WW, WH, 0)
    for cu in ax:
        holes.append((cu - 0.65, cu + 0.65, 1.0, 3.0))
        glaze(F, cu - 0.65, cu + 0.65, 1.0, 3.0, 0)
    wall(F, 0, LS, GROUND, TOP, 0, holes)
    band(F, -0.05, LS + 0.05, 0, SHOP, SHOP + 0.25, 0.14)
    cornice(F, -0.1, LS + 0.1, 0, EAVE, ext=0.6)
    box('stone', F, -0.05, LS + 0.05, 0, 0.08, GROUND, 0.45)

def build_yard():
    F = FW
    wall(F, 0, LEN, GROUND, TOP, 0, [])
    ax = [LEN - u for u in AX]               # те же оси, что с улицы
    flat_windows(F, ax, [1.0] + [z + SILL for z in FL])
    band(F, -0.05, LEN + 0.05, 0, EAVE + 0.2, EAVE + 0.5, 0.2)
    wall(FN, 0, LN, GROUND, TOP, 0, [])      # к соседу

def build_roof():
    F = FE
    prism_plan('roof', F, [(0, 0), (LEN, 0), (LEN, -12.2), (0, -12.2)], TOP - 0.3, TOP)
    t = 0.3
    for G, L in ((FE, LEN), (FS, LS), (FW, LEN), (FN, LN)):
        box('wall', G, 0, L, -t, 0, TOP, PAR, bottom=False)
        box('trim', G, -0.05, L + 0.05, -t - 0.05, 0.05, PAR, PAR + 0.08, bottom=False)
    for k in range(3):                      # выходы на кровлю — наугад
        u = 10 + k * 17
        box('wall', F, u - 0.8, u + 0.8, -7.0, -5.4, TOP, TOP + 1.6)

build_east()
build_erker()
build_south()
build_yard()
build_roof()
print('НАЧАЛО МОДЕЛИ (ox, oz):', X0, Z0)
finish('bmorskaya48', __file__, tri_budget=10000)
