# Бывшая караимская кенасса (Б. Морская, 11; ныне школа бокса), контур OSM w90821892.
#
# Собрано БЕЗ Blender: в облачной сессии его нет и поставить нельзя, поэтому
# здесь свой маленький писатель GLB на чистом Python. Материалы и их смысл —
# как в models/kit.py (wall, wall2, wall3, roof, stone, trim, trim_s, glass,
# metal, wood): по имени материала modelbatch.js решает, кто бросает тень и у
# кого подсветка теневой стороны. Два файла: data/models/kenassa.glb
# (подробный) и kenassa.lod.glb (дальний — только масса).
#
#   python3 models/kenassa/build.py
#
# Свои оси: X — вдоль южного торца на восток, Y — вверх, Z — вдоль длинной
# оси на ЮГ; Z = 0 — плоскость парадного (южного) торца, дом уходит к Z < 0.
# Начало — середина южного ребра контура на уровне земли. В GLB оси мира
# (x — восток, z — юг) получаются поворотом на угол контура.
import json, math, os, struct

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
OSM = 'w90821892'

# ---------------------------------------------------------------- контур
W = json.load(open(os.path.join(ROOT, 'data', 'world.json')))
poly = next(b['poly'] for b in W['buildings'] if b['id'] == OSM)
P = [(poly[i], poly[i + 1]) for i in range(0, len(poly), 2)]
if P[0] == P[-1]:
    P.pop()
# южное ребро (ребро 3): (-301.7, 907.9) → (-315.6, 910.6); восточное (ребро 2)
SE, SW = P[3], P[4]
NE = P[2]
ux, uz = SE[0] - SW[0], SE[1] - SW[1]
L = math.hypot(ux, uz); ux, uz = ux / L, uz / L          # на восток вдоль торца
vx, vz = -uz, ux                                         # на юг вдоль дома
if vx * (SE[0] - NE[0]) + vz * (SE[1] - NE[1]) < 0:
    vx, vz = -vx, -vz
OX, OZ = (SE[0] + SW[0]) / 2, (SE[1] + SW[1]) / 2
WID = 14.2                      # торец
LEN = 33.7                      # длинная сторона
HW = WID / 2

def to_world(p):
    x, y, z = p
    return (x * ux + z * vx, y, x * uz + z * vz)

# ---------------------------------------------------------------- цвета (sRGB, шероховатость)
def hx(h):
    v = int(h[1:], 16)
    return ((v >> 16) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255)

COL = {
    'wall':   (hx('#d9cdb0'), 0.9),    # кладка из бежевого известняка
    'wall2':  (hx('#c7b997'), 0.9),    # швы кладки, чуть темнее
    'wall3':  (hx('#ecebe5'), 0.9),    # побелённый цоколь
    'roof':   (hx('#5b4c43'), 0.8),    # тёмная кровля
    'stone':  ((0.60, 0.58, 0.54), 0.9),   # ступени
    'trim':   (hx('#e4dac2'), 0.85),   # карнизы, архивольт, модульоны — светлый камень
    'trim_s': (hx('#e9e1cc'), 0.8),    # колонны (гладкие нормали)
    'glass':  ((0.07, 0.10, 0.13), 0.15),
    'metal':  (hx('#4f6b55'), 0.5),    # зелёный оцинкованный отлив
    'wood':   ((0.25, 0.15, 0.09), 0.6),
}
LOD_MATS = {'wall', 'wall2', 'wall3', 'roof', 'stone', 'glass', 'trim_s'}

# ---------------------------------------------------------------- примитивы
class Mesh:
    def __init__(self):
        self.tris = {}          # материал -> [(p0, p1, p2, n0, n1, n2)]

    def tri(self, m, a, b, c, na=None, nb=None, nc=None):
        if na is None:
            n = norm(cross(sub(b, a), sub(c, a)))
            na = nb = nc = n
        self.tris.setdefault(m, []).append((a, b, c, na, nb, nc))

    def quad(self, m, a, b, c, d):
        self.tri(m, a, b, c); self.tri(m, a, c, d)

    def poly(self, m, pts):
        for i in range(1, len(pts) - 1):
            self.tri(m, pts[0], pts[i], pts[i + 1])

def sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def norm(a):
    l = math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2) or 1
    return (a[0] / l, a[1] / l, a[2] / l)

def box(M, m, x0, x1, y0, y1, z0, z1, skip=()):
    """Короб, грани наружу; skip — какие грани не ставить ('-x', '+y'…)."""
    v = lambda i, j, k: ((x0, x1)[i], (y0, y1)[j], (z0, z1)[k])
    faces = {
        '-x': [v(0, 0, 0), v(0, 0, 1), v(0, 1, 1), v(0, 1, 0)],
        '+x': [v(1, 0, 1), v(1, 0, 0), v(1, 1, 0), v(1, 1, 1)],
        '-y': [v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1)],
        '+y': [v(0, 1, 1), v(1, 1, 1), v(1, 1, 0), v(0, 1, 0)],
        '-z': [v(1, 0, 0), v(0, 0, 0), v(0, 1, 0), v(1, 1, 0)],
        '+z': [v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)],
    }
    for k, f in faces.items():
        if k not in skip:
            M.quad(m, *f)

def cyl(M, m, x, z, y0, y1, r0, r1, seg=12, smooth=True, caps=True):
    """Усечённый конус по оси Y (ствол колонны, база, колокол капители)."""
    ring = [(math.cos(2 * math.pi * i / seg), math.sin(2 * math.pi * i / seg)) for i in range(seg)]
    k = (r0 - r1) / (y1 - y0)
    for i in range(seg):
        (c0, s0), (c1, s1) = ring[i], ring[(i + 1) % seg]
        a = (x + c0 * r0, y0, z + s0 * r0); b = (x + c1 * r0, y0, z + s1 * r0)
        c = (x + c1 * r1, y1, z + s1 * r1); d = (x + c0 * r1, y1, z + s0 * r1)
        if smooth:
            n0 = norm((c0, k, s0)); n1 = norm((c1, k, s1))
            M.tri(m, a, c, b, n0, n1, n1); M.tri(m, a, d, c, n0, n0, n1)
        else:
            M.quad(m, a, d, c, b)
        if caps:
            M.tri(m, (x, y1, z), c, d)
            M.tri(m, (x, y0, z), a, b)

def gable(M, m, x0, x1, y0, y1, z):
    """Треугольник щипца в плоскости z (лицом к +z)."""
    M.tri(m, (x0, y0, z), (x1, y0, z), ((x0 + x1) / 2, y1, z))

# ---------------------------------------------------------------- размеры
G = -3.0          # стены уходят под землю на участке с уклоном
PL = 1.7          # белёный цоколь
COR = 12.0        # венчающий карниз парадного объёма
ENT = 9.6         # низ антаблемента = верх капителей
CB = 0.5          # верх ступеней перед портиком, база колонн
FRONT = 7.0       # глубина парадного объёма (с фронтоном) до зала
APEX = 16.2       # конёк фронтона — «высокий» фронтон
HALL = 14.0       # стены зала, поднятые над парадным объёмом
HALL_APEX = 17.8  # конёк зала
NX = 3.7          # полуширина ниши портика
ND = 2.2          # глубина ниши
COLX = 2.75       # оси колонн
COLZ = -0.75
ZN = -LEN

def build(full):
    M = Mesh()
    # ---- масса: парадный объём и зал
    # южная стена — пилоны по краям, ниша между ними
    box(M, 'wall', -HW, HW, PL, COR, ZN, -ND, skip=('-y',) if full else ())
    for s in (-1, 1):
        x0, x1 = sorted((s * HW, s * NX))
        box(M, 'wall', x0, x1, PL, COR, -ND, 0, skip=('-z', '-y'))
    # зал над парадным объёмом
    box(M, 'wall', -HW + 0.4, HW - 0.4, COR, HALL, ZN + 0.4, -FRONT, skip=('-y',))
    # цоколь (белёный, чуть выступает)
    box(M, 'wall3', -HW - 0.08, HW + 0.08, G, PL, ZN - 0.08, -ND, skip=('+y',) if full else ())
    for s in (-1, 1):
        x0, x1 = sorted((s * (HW + 0.08), s * NX))
        box(M, 'wall3', x0, x1, G, PL, -ND, 0.08, skip=('-z', '+y'))
    # задняя стена ниши и её боковины до низа антаблемента
    box(M, 'wall', -NX, NX, G, ENT, -ND - 0.3, -ND, skip=('-z',))
    # кровля парадного объёма: два ската от фронтона до зала
    rh = APEX - COR
    for s in (-1, 1):
        a = (s * (HW + 0.9), COR, 0.9); b = (0, APEX, 0.9)
        c = (0, APEX, -FRONT - 0.3); d = (s * (HW + 0.9), COR, -FRONT - 0.3)
        M.quad('roof', a, b, c, d) if s < 0 else M.quad('roof', d, c, b, a)
    # кровля зала: двускатная с вальмой на севере
    hw = HW - 0.4 + 0.5
    zs, zn = -FRONT, ZN + 0.4 - 0.5
    hip = zn + hw * 0.9           # вальма чуть круче скатов
    for s in (-1, 1):
        a = (s * hw, HALL, zs); b = (0, HALL_APEX, zs); c = (0, HALL_APEX, hip); d = (s * hw, HALL, zn)
        M.quad('roof', a, b, c, d) if s < 0 else M.quad('roof', d, c, b, a)
    M.tri('roof', (hw, HALL, zn), (-hw, HALL, zn), (0, HALL_APEX, hip))
    # щипец зала над кровлей парадного объёма — гладкий, в цвет стены
    gable(M, 'wall', -HW + 0.4, HW - 0.4, HALL, HALL_APEX - 0.15, -FRONT + 0.01)
    box(M, 'wall', -HW + 0.4, HW - 0.4, COR, HALL, -FRONT, -FRONT + 0.01, skip=('-z', '-y'))
    # фронтон: тимпан
    gable(M, 'wall', -HW, HW, COR, APEX - 0.25, 0.0)
    M.tri('wall', (HW, COR, -0.3), (-HW, COR, -0.3), (0, APEX - 0.25, -0.3))
    # колонны: стволы (в дальнем — грубо)
    for s in (-1, 1):
        x = s * COLX
        if full:
            box(M, 'trim', x - 0.68, x + 0.68, CB, CB + 0.28, COLZ - 0.68, COLZ + 0.68)    # плинт
            cyl(M, 'trim_s', x, COLZ, CB + 0.28, CB + 0.55, 0.62, 0.54, seg=14)          # торус
            cyl(M, 'trim_s', x, COLZ, CB + 0.55, ENT - 1.25, 0.5, 0.43, seg=16, caps=False)
            # коринфская капитель упрощённо: колокол и два пояса листьев, абака
            cyl(M, 'trim_s', x, COLZ, ENT - 1.25, ENT - 0.2, 0.43, 0.58, seg=16)
            cyl(M, 'trim', x, COLZ, ENT - 1.25, ENT - 0.85, 0.52, 0.56, seg=8, smooth=False)
            cyl(M, 'trim', x, COLZ, ENT - 0.85, ENT - 0.45, 0.56, 0.64, seg=8, smooth=False)
            for k in range(4):            # волюты по углам
                a = math.pi / 4 + k * math.pi / 2
                cx, cz = x + math.cos(a) * 0.6, COLZ + math.sin(a) * 0.6
                box(M, 'trim', cx - 0.14, cx + 0.14, ENT - 0.55, ENT - 0.2, cz - 0.14, cz + 0.14)
            box(M, 'trim', x - 0.72, x + 0.72, ENT - 0.2, ENT, COLZ - 0.72, COLZ + 0.72)  # абака
        else:
            cyl(M, 'trim_s', x, COLZ, CB, ENT, 0.5, 0.45, seg=8)
    # ступени перед портиком
    for i, z in enumerate((1.6, 0.8)):
        box(M, 'stone', -NX - 0.3, NX + 0.3, G, CB * (i + 1) / 2, -ND, z, skip=('-y',))
    # антаблемент над портиком (балка от пилона к пилону) — в дальнем тоже
    box(M, 'wall', -HW, HW, ENT, COR - 1.0, -0.1, 0.0, skip=('-y', '+y', '-z'))
    box(M, 'wall', -NX, NX, ENT, COR - 1.0, -ND, 0.0, skip=('+z', '-z', '+y', '-x', '+x'))
    # дверь и арочное окно в нише
    box(M, 'wood', -1.0, 1.0, CB, CB + 3.2, -ND + 0.02, -ND + 0.06)
    arch_window(M, 0, -ND + 0.02, 4.4, 7.9, 1.35, full)

    if not full:
        return M

    # ---- детали подробного уровня
    # швы кладки: тонкие горизонтальные полосы через 0.4 м по всем фасадам
    y = PL + 0.4
    while y < COR - 1.0:
        e, t = 0.012, 0.03
        for s in (-1, 1):                                     # пилоны торца
            x0, x1 = sorted((s * HW, s * NX))
            box(M, 'wall2', x0, x1, y, y + t, 0, e, skip=('-z', '-y', '+y'))
            sx = s * HW
            box(M, 'wall2', min(sx, sx + s * e), max(sx, sx + s * e), y, y + t, ZN, 0,
                skip=('-x' if s > 0 else '+x', '-y', '+y'))
        box(M, 'wall2', -HW, HW, y, y + t, ZN - e, ZN, skip=('+z', '-y', '+y'))
        if y < ENT:
            box(M, 'wall2', -NX, NX, y, y + t, -ND, -ND + e, skip=('-z', '-y', '+y'))
        y += 0.4
    # лопатки по краям торца
    for s in (-1, 1):
        x0, x1 = sorted((s * HW, s * (HW - 1.2)))
        box(M, 'wall', x0, x1, PL, ENT, 0, 0.22, skip=('-z', '-y'))
    # боковые ризалиты-рёбра: два на каждой длинной стене
    for z in (-14.0, -24.5):
        for s in (-1, 1):
            x0, x1 = sorted((s * HW, s * (HW + 0.15)))
            box(M, 'wall', x0, x1, PL, COR - 1.0, z - 0.8, z + 0.8, skip=('-y',))
    # зелёный оцинкованный отлив над цоколем
    for s in (-1, 1):
        x0, x1 = sorted((s * (HW + 0.18), s * NX))
        box(M, 'metal', x0, x1, PL, PL + 0.06, -ND, 0.18, skip=('-z',))
    box(M, 'metal', -HW - 0.18, HW + 0.18, PL, PL + 0.06, ZN - 0.18, -ND)
    # антаблемент: архитрав в две полки, фриз, дентикулы, карниз с модульонами
    entab(M, full=True)
    # обрамление ниши: архивольт и замок над окном, профиль двери
    box(M, 'trim', -1.25, 1.25, CB + 3.2, CB + 3.45, -ND, -ND + 0.12)
    for s in (-1, 1):
        box(M, 'trim', s * 1.0 - 0.12, s * 1.0 + 0.12, CB, CB + 3.2, -ND, -ND + 0.1)
    # поребрик у основания ниши
    return M

def arch_window(M, x, z, y0, ys, r, full):
    """Арочное окно с веерной расстекловкой: прямоугольник y0..ys и полукруг r."""
    seg = 12 if full else 6
    pts = [(x - r, y0, z), (x + r, y0, z), (x + r, ys, z)]
    for i in range(1, seg):
        a = math.pi * i / seg
        pts.append((x + r * math.cos(a), ys + r * math.sin(a), z))
    pts.append((x - r, ys, z))
    M.poly('glass', pts)
    if not full:
        return
    # архивольт: профилированное кольцо
    w, d = 0.28, 0.14
    for i in range(seg):
        a0, a1 = math.pi * i / seg, math.pi * (i + 1) / seg
        p = lambda a, rr, zz: (x + rr * math.cos(a), ys + rr * math.sin(a), zz)
        M.quad('trim', p(a0, r, z + d), p(a0, r + w, z + d), p(a1, r + w, z + d), p(a1, r, z + d))
        M.quad('trim', p(a0, r + w, z), p(a0, r + w, z + d), p(a1, r + w, z + d), p(a1, r + w, z))
    for s in (-1, 1):
        box(M, 'trim', x + s * r - (w if s < 0 else 0), x + s * r + (w if s > 0 else 0), y0 - 0.1, ys, z, z + d)
    box(M, 'trim', x - r - 0.35, x + r + 0.35, y0 - 0.25, y0, z, z + 0.25)      # подоконник
    box(M, 'trim', x - 0.22, x + 0.22, ys + r - 0.05, ys + r + w + 0.15, z, z + d + 0.06)  # замок
    # переплёт: импост, средник и лучи веера
    bar = 0.06
    box(M, 'trim', x - r, x + r, ys - bar, ys + bar, z, z + 0.05)
    box(M, 'trim', x - bar, x + bar, y0, ys, z, z + 0.05)
    for s in (-1, 1):
        box(M, 'trim', x + s * r / 2 - bar, x + s * r / 2 + bar, y0, ys, z, z + 0.05)
    for k in range(1, 6):
        a = math.pi * k / 6
        c, s_ = math.cos(a), math.sin(a)
        nx, ny = -s_ * bar, c * bar
        p0 = (x + c * 0.25, ys + s_ * 0.25); p1 = (x + c * r, ys + s_ * r)
        M.quad('trim', (p0[0] - nx, p0[1] - ny, z + 0.05), (p1[0] - nx, p1[1] - ny, z + 0.05),
               (p1[0] + nx, p1[1] + ny, z + 0.05), (p0[0] + nx, p0[1] + ny, z + 0.05))

def entab(M, full):
    """Антаблемент парадного торца и карниз по всему периметру."""
    # архитрав двумя полками по торцу (над колоннами и пилонами)
    box(M, 'trim', -HW, HW, ENT, ENT + 0.4, 0, 0.1, skip=('-z',))
    box(M, 'trim', -HW, HW, ENT + 0.4, ENT + 0.85, 0, 0.18, skip=('-z',))
    box(M, 'trim', -NX, NX, ENT - 0.02, ENT, -ND, 0.1)                       # софит балки
    # фриз гладкий (стена), над ним полка и дентикулы
    y = COR - 1.0
    box(M, 'trim', -HW - 0.1, HW + 0.1, y, y + 0.15, ZN - 0.1, 0.25)
    dent(M, y + 0.15, 0.2)
    # венчающий карниз с выносом 0.8 и модульонами по всему периметру
    box(M, 'trim', -HW - 0.8, HW + 0.8, COR - 0.3, COR, ZN - 0.8, 0.8)
    box(M, 'trim', -HW - 0.45, HW + 0.45, COR - 0.55, COR - 0.3, ZN - 0.45, 0.45)
    # модульоны: кронштейны под выносом
    def mod(x0, x1, z0, z1):
        box(M, 'trim', x0, x1, COR - 0.55, COR - 0.3, z0, z1, skip=('+y',))
    step = 0.9
    n = int((2 * HW + 0.8) / step)
    for i in range(n + 1):
        x = -HW - 0.4 + i * (2 * HW + 0.8) / n
        mod(x - 0.1, x + 0.1, 0.45, 0.75)
        mod(x - 0.1, x + 0.1, ZN - 0.75, ZN - 0.45)
    n = int((LEN + 0.8) / step)
    for i in range(n + 1):
        z = ZN - 0.4 + i * (LEN + 0.8) / n
        mod(HW + 0.45, HW + 0.75, z - 0.1, z + 0.1)
        mod(-HW - 0.75, -HW - 0.45, z - 0.1, z + 0.1)
    # наклонные карнизы фронтона
    rake(M)

def dent(M, y, h):
    """Ряд дентикулов по южному торцу и по бокам."""
    w, gap, d = 0.14, 0.12, 0.12
    x = -HW
    while x + w <= HW:
        box(M, 'trim', x, x + w, y, y + h, 0.25, 0.25 + d, skip=('-z',))
        x += w + gap
    for s in (-1, 1):
        z = ZN
        while z + w <= 0:
            x0, x1 = sorted((s * (HW + 0.1), s * (HW + 0.1 + d)))
            box(M, 'trim', x0, x1, y, y + h, z, z + w, skip=('-x' if s > 0 else '+x',))
            z += w + gap

def rake(M):
    """Наклонные карнизы фронтона: плиты по скатам с выносом."""
    t, out = 0.35, 0.9
    for s in (-1, 1):
        a = (s * (HW + 0.9), COR, out); b = (0, APEX, out)
        a2 = (s * (HW + 0.9), COR, 0.0); b2 = (0, APEX, 0.0)
        up = lambda p: (p[0], p[1] + t, p[2])
        # лицевая полоса и нижняя (софит) — простые плиты
        if s < 0:
            M.quad('trim', a, b, up(b), up(a))
            M.quad('trim', a2, b2, b, a)
        else:
            M.quad('trim', b, a, up(a), up(b))
            M.quad('trim', b2, a2, a, b)
    # полка у основания тимпана
    box(M, 'trim', -HW, HW, COR, COR + 0.18, -0.3, 0.3)

# ---------------------------------------------------------------- GLB
def write_glb(M, path, mats):
    bins, views, accs, prims, materials = bytearray(), [], [], [], []
    tris = 0
    for m in sorted(M.tris):
        if m not in mats:
            continue
        T = M.tris[m]
        tris += len(T)
        pos, nrm = [], []
        for a, b, c, na, nb, nc in T:
            for p, n in ((a, na), (b, nb), (c, nc)):
                pos.extend(to_world(p)); nrm.extend(to_world(n))
        n = len(pos) // 3
        lo = [min(pos[i::3]) for i in range(3)]; hi = [max(pos[i::3]) for i in range(3)]
        for arr, extra in ((pos, {'min': lo, 'max': hi}), (nrm, {})):
            off = len(bins)
            bins += struct.pack('<%df' % len(arr), *arr)
            views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(arr) * 4, 'target': 34962})
            accs.append({'bufferView': len(views) - 1, 'componentType': 5126, 'count': n, 'type': 'VEC3', **extra})
        rgb, rough = COL[m]
        materials.append({'name': m, 'doubleSided': True, 'pbrMetallicRoughness': {
            'baseColorFactor': [c ** 2.2 for c in rgb] + [1], 'metallicFactor': 0, 'roughnessFactor': rough}})
        prims.append({'name': 'kenassa_' + m, 'mesh': {'primitives': [{
            'attributes': {'POSITION': len(accs) - 2, 'NORMAL': len(accs) - 1},
            'material': len(materials) - 1}]}})
    gl = {
        'asset': {'version': '2.0', 'generator': 'models/kenassa/build.py'},
        'scene': 0, 'scenes': [{'name': 'kenassa', 'nodes': list(range(len(prims)))}],
        'nodes': [{'name': p['name'], 'mesh': i} for i, p in enumerate(prims)],
        'meshes': [p['mesh'] for p in prims], 'materials': materials,
        'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bins)}],
    }
    js = json.dumps(gl, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    bins += b'\0' * (-len(bins) % 4)
    total = 12 + 8 + len(js) + 8 + len(bins)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(bins), 0x004E4942)); f.write(bins)
    return tris

if __name__ == '__main__':
    out = os.path.join(ROOT, 'data', 'models')
    t_full = write_glb(build(True), os.path.join(out, 'kenassa.glb'), set(COL))
    t_low = write_glb(build(False), os.path.join(out, 'kenassa.lod.glb'), LOD_MATS)
    pl = {'name': 'Караимская кенасса (школа бокса)', 'file': 'kenassa.glb',
          'ox': round(OX, 2), 'oz': round(OZ, 2), 'skip': [OSM], 'tris': t_full, 'trisLod': t_low}
    with open(os.path.join(HERE, 'placement.json'), 'w') as f:
        f.write(json.dumps(pl, ensure_ascii=False) + '\n')
    print('подробный', t_full, 'треугольников; дальний', t_low)
