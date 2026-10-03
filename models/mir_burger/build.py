# «Мир Бургер» (бывший McDonald's), пр. Нахимова, 14 — площадь Лазарева.
#
#   blender -b --python models/mir_burger/build.py -- [glb]
#
# По фото это НЕ павильон: трёхэтажный белый сталинский дом с вальмовой кровлей,
# по углам главного фасада — двухсветные лоджии с ионическими колоннами, на
# первом этаже шесть арочных проёмов с куполообразными маркизами; кафе занимает
# первый этаж, перед ним на тротуаре летняя веранда. Модель — дом целиком.
# План — контур OSM way 92028629 (выпрямлен), фасады — Викисклад (см. NOTES.md).
#
# Рамка F: u — вдоль главного фасада от ЮЗ угла к СВ (слева направо, если смотреть
# с улицы), d — наружу на ЮВ, к улице Генерала Петрова. Ноль высоты — тротуар у
# середины главного фасада (u = 18.25).
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# ------------------------------------------------------------------ цвета
COL['wall']  = ((0.93, 0.92, 0.88), 0.9)     # белая облицовочная плитка
COL['trim']  = ((0.98, 0.97, 0.95), 0.85)    # белые детали, столы, белые стулья
COL['stone'] = ((0.55, 0.55, 0.54), 0.85)    # серый гранит цоколя, ступени
COL['roof']  = ((0.43, 0.25, 0.22), 0.8)     # красно-коричневая жесть кровли
COL['wood']  = ((0.52, 0.33, 0.19), 0.7)     # настил, кашпо, коричневые стулья
COL['metal'] = ((0.20, 0.36, 0.15), 0.85)    # тёмно-зелёное: зелень в кашпо, ковка
COL['wall2'] = ((0.83, 0.73, 0.57), 0.9)     # бежевый тент маркиз и зонтов
COL['wall3'] = ((0.88, 0.09, 0.11), 0.5)     # красные буквы «МИР БУРГЕР»

A_ = (-468.6, 559.6)            # ЮЗ угол главного фасада (контур OSM)
B_ = (-446.9, 530.2)            # СВ угол
L = 36.5                        # длина главного фасада
_ux, _uz = (B_[0] - A_[0]) / L, (B_[1] - A_[1]) / L
X0, Z0 = A_[0] + _ux * 18.25, A_[1] + _uz * 18.25
origin(round(X0, 2), round(Z0, 2))
F, _ = frame_from(A_, B_, (-468.0, 539.0))

GR = -3.0            # стены уходят под землю
DEP = 14.7           # глубина основного корпуса
WU0, WD = 23.0, -20.4   # дворовое крыло у СВ торца: u 23.0..36.5, d до -20.4
BAYW, BP = 5.2, 0.3  # ширина углового ризалита и его вынос
H1, H2 = 4.5, 8.1    # отметки 2-го и 3-го этажей
EAVE = 12.8          # верх карниза
LOG = 0.6            # пол лоджии
COLTOP, ENT = 7.6, 8.3
ZS, RA = 2.8, 1.3    # пята и радиус арок первого этажа
S = [7.45 + 3.6 * i for i in range(7)]    # оси: 0..5 — арки кафе, 6 — глухая ниша
DOOR = 4             # вход в кафе
DZ = 0.32            # высота настила веранды
RISE = 4.0

# ================================================================== примитивы
def cylinder(m, c, ax, r, ln, seg=10):
    """Цилиндр с осью ax (единичный Vector), центр c."""
    bm = bm_of(m)
    a = ax.normalized()
    t1 = a.cross(UP if abs(a.z) < 0.9 else Vector((1, 0, 0))).normalized()
    t2 = a.cross(t1).normalized()
    ring = lambda o: [bm.verts.new(o + (t1 * math.cos(2 * math.pi * k / seg) + t2 * math.sin(2 * math.pi * k / seg)) * r)
                      for k in range(seg)]
    ra, rb = ring(c - a * ln / 2), ring(c + a * ln / 2)
    for k in range(seg):
        j = (k + 1) % seg
        f = bm.faces.new([ra[k], ra[j], rb[j], rb[k]]); f.smooth = True
        f.normal_update()
        mid = (ra[k].co + rb[j].co) / 2
        if f.normal.dot(mid - c) < 0: f.normal_flip()
    fa = bm.faces.new(ra); fa.normal_update()
    if fa.normal.dot(-a) < 0: fa.normal_flip()
    fb = bm.faces.new(rb); fb.normal_update()
    if fb.normal.dot(a) < 0: fb.normal_flip()

def disc_uz(m, Fr, cu, cz, r, d0, d1, seg=14):
    prism_uz(m, Fr, [(cu + r * math.cos(2 * math.pi * k / seg), cz + r * math.sin(2 * math.pi * k / seg))
                     for k in range(seg)], d0, d1)

def arch_parts(Fr, cu, r, za, zs, d=0.0, reveal=0.3, fill='glass', seg=12):
    """Полукруглая арка в стене: пазухи, откос по дуге, архивольт, стекло/фон.
    Возвращает прямоугольный проём для wall()."""
    arc = [(cu + r * math.cos(math.pi * k / seg), zs + r * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
    hs = seg // 2
    face('wall', [Fr.p(cu + r, d, zs + r)] + [Fr.p(u, d, z) for u, z in arc[:hs + 1]], Fr.N())
    face('wall', [Fr.p(cu - r, d, zs + r)] + [Fr.p(u, d, z) for u, z in arc[hs:]], Fr.N())
    dd = d - reveal
    for k in range(seg):
        (ua, za_), (ub, zb_) = arc[k], arc[k + 1]
        face('trim', [Fr.p(ua, d, za_), Fr.p(ub, d, zb_), Fr.p(ub, dd, zb_), Fr.p(ua, dd, za_)],
             Fr.p(cu, d, zs) - Fr.p((ua + ub) / 2, d, (za_ + zb_) / 2))
        ro = r + 0.2                                          # архивольт
        oa = (cu + ro * math.cos(math.pi * k / seg), zs + ro * math.sin(math.pi * k / seg))
        ob = (cu + ro * math.cos(math.pi * (k + 1) / seg), zs + ro * math.sin(math.pi * (k + 1) / seg))
        face('trim', [Fr.p(ua, d + 0.06, za_), Fr.p(ub, d + 0.06, zb_), Fr.p(ob[0], d + 0.06, ob[1]), Fr.p(oa[0], d + 0.06, oa[1])], Fr.N())
        face('trim', [Fr.p(oa[0], d, oa[1]), Fr.p(ob[0], d, ob[1]), Fr.p(ob[0], d + 0.06, ob[1]), Fr.p(oa[0], d + 0.06, oa[1])],
             Fr.p((oa[0] + ob[0]) / 2, d, (oa[1] + ob[1]) / 2) - Fr.p(cu, d, zs))
    box('trim', Fr, cu - r - 0.2, cu - r, d, d + 0.06, za, zs)    # лопатки до пяты
    box('trim', Fr, cu + r, cu + r + 0.2, d, d + 0.06, za, zs)
    g = dd + 0.02
    face(fill, [Fr.p(cu - r, g, zs), Fr.p(cu + r, g, zs)] + [Fr.p(u, g, z) for u, z in arc], Fr.N())
    if fill == 'glass':
        face('glass', [Fr.p(cu - r, g, za), Fr.p(cu + r, g, za), Fr.p(cu + r, g, zs), Fr.p(cu - r, g, zs)], Fr.N())
        t = 0.07
        box('trim', Fr, cu - r, cu + r, g, g + 0.08, zs - t / 2, zs + t / 2)       # импост
        box('trim', Fr, cu - t / 2, cu + t / 2, g, g + 0.08, za, zs + r)
        box('trim', Fr, cu - r, cu - r + t, g, g + 0.08, za, zs)
        box('trim', Fr, cu + r - t, cu + r, g, g + 0.08, za, zs)
        box('trim', Fr, cu - r, cu + r, g, g + 0.08, za, za + t)
    else:
        face(fill, [Fr.p(cu - r, g, za), Fr.p(cu + r, g, za), Fr.p(cu + r, g, zs), Fr.p(cu - r, g, zs)], Fr.N())
    return (cu - r, cu + r, za, zs + r)

def dome_awning(Fr, cu, zs, R=1.42, D=1.05, d=0.03, nt=10, nf=4):
    """Куполообразная маркиза над аркой: четверть эллипсоида в полоску + фестоны."""
    P = lambda th, ph: Fr.p(cu + R * math.cos(ph) * math.cos(th), d + D * math.cos(ph) * math.sin(th), zs + R * math.sin(ph))
    c = Fr.p(cu, d, zs)
    for i in range(nt):
        m = 'wall2' if i % 2 == 0 else 'wall'
        t0, t1 = math.pi * i / nt, math.pi * (i + 1) / nt
        for k in range(nf):
            p0, p1 = math.pi / 2 * k / nf, math.pi / 2 * (k + 1) / nf
            if k == nf - 1:
                face(m, [P(t0, p0), P(t1, p0), P(t0, p1)], (P(t0, p0) + P(t1, p0)) / 2 - c)
            else:
                q = [P(t0, p0), P(t1, p0), P(t1, p1), P(t0, p1)]
                face(m, q, sum(q, Vector()) / 4 - c)
        # фестон: полоса и зубец
        a, b = P(t0, 0), P(t1, 0)
        face('wall2', [a, b, b - UP * 0.17, a - UP * 0.17], (a + b) / 2 - c)
        face('wall2', [a - UP * 0.17, b - UP * 0.17, (a + b) / 2 - UP * 0.3], (a + b) / 2 - c)
    # каркас: кромка из трубки
    for i in range(0, nt, 2):
        t0, t1 = math.pi * i / nt, math.pi * (i + 2) / nt
        beam('metal', P(t0, 0), P(t1, 0), 0.03)

def stroke(Fr, x0, z0, x1, z1, t, d0, d1, m='wall3'):
    v = Vector((x1 - x0, z1 - z0)); ln = v.length; v /= ln
    p = Vector((-v.y, v.x)) * t / 2
    a = Vector((x0, z0)) - v * t / 2; b = Vector((x1, z1)) + v * t / 2
    prism_uz(m, Fr, [(a.x - p.x, a.y - p.y), (b.x - p.x, b.y - p.y), (b.x + p.x, b.y + p.y), (a.x + p.x, a.y + p.y)], d0, d1)

GLYPH = {
    'М': [((0, 0), (0, 1)), ((1, 0), (1, 1)), ((0, 1), (0.5, 0.42)), ((1, 1), (0.5, 0.42))],
    'И': [((0, 0), (0, 1)), ((1, 0), (1, 1)), ((0, 0), (1, 1))],
    'Р': [((0, 0), (0, 1)), ((0, 1), (1, 1)), ((0, 0.48), (1, 0.48)), ((1, 0.48), (1, 1))],
    'Б': [((0, 0), (0, 1)), ((0, 1), (1, 1)), ((0, 0.55), (1, 0.55)), ((0, 0), (1, 0)), ((1, 0), (1, 0.55))],
    'У': [((0, 1), (0.5, 0.38)), ((1, 1), (0.25, 0))],
    'Г': [((0, 0), (0, 1)), ((0, 1), (1, 1))],
    'Е': [((0, 0), (0, 1)), ((0, 1), (1, 1)), ((0, 0.5), (0.8, 0.5)), ((0, 0), (1, 0))],
}

def lettering(Fr, text, cu, z0, h=0.44, w=0.27, gap=0.08, t=0.075, d=0.02):
    adv = [0.22 if ch == ' ' else w + gap for ch in text]
    x = cu - (sum(adv) - gap) / 2
    for ch, a in zip(text, adv):
        for (p, q) in GLYPH.get(ch, []):
            ix = lambda s: x + t / 2 + s * (w - t)
            iz = lambda s: z0 + t / 2 + s * (h - t)
            stroke(Fr, ix(p[0]), iz(p[1]), ix(q[0]), iz(q[1]), t, d, d + 0.07)
        x += a
    # кронштейны-трубки букв к стене
    box('metal', Fr, cu - sum(adv) / 2, cu + sum(adv) / 2, 0.0, d, z0 + h * 0.45, z0 + h * 0.55)

def ionic(Fr, a, e, z0, H, D=0.62):
    """Ионическая колонна: база, ствол с утонением, эхин, волюты-валики, абака."""
    base = Fr.p(a, e, z0)
    Fc = Frame(Vector((base.x, base.y)), Fr.u, Fr.n)
    box('trim', Fc, -0.44, 0.44, -0.44, 0.44, z0, z0 + 0.22)
    R = D / 2
    prof = [(0.40, 0.22), (0.40, 0.3), (0.34, 0.37), (R, 0.45)]
    z1 = H - 0.62
    for i in range(1, 4):
        t = i / 3
        prof.append((R - 0.045 * t ** 1.6, 0.45 + (z1 - 0.45) * t))
    rt = R - 0.045
    prof += [(rt + 0.03, z1 + 0.05), (rt, z1 + 0.1), (rt + 0.08, H - 0.32), (rt + 0.05, H - 0.26)]
    lathe('trim_s', base, prof, 10)
    for s in (-1, 1):                     # волюты: валики поперёк фасада
        cylinder('trim', Fc.p(s * 0.33, 0, z0 + H - 0.33), Fc.N(), 0.13, 0.66, 8)
    box('trim', Fc, -0.36, 0.36, -0.33, 0.33, z0 + H - 0.26, z0 + H - 0.2)
    box('trim', Fc, -0.46, 0.46, -0.42, 0.42, z0 + H - 0.2, z0 + H)

def balustrade(p0, p1, h=1.0, sp=0.24, m='trim'):
    n = max(1, round((p1 - p0).length / sp))
    for k in range(1, n):
        q = p0 + (p1 - p0) * (k / n)
        beam(m, q + UP * 0.1, q + UP * (h - 0.08), 0.045)
    beam(m, p0 + UP * h, p1 + UP * h, 0.12, 0.08)
    beam(m, p0 + UP * 0.06, p1 + UP * 0.06, 0.1, 0.08)

def eave(Fr, u0, u1, d=0.0, dent=True, ext=0.7, dent_to=None, x0=True, x1=True, dz=0.0):
    """Фриз с поясом, сухарики, профилированный карниз; верх — тёмная подшивка.
    x0/x1 = False — не выносить полки за этот конец (там их перекрывает соседний карниз)."""
    e0, e1 = (1.0 if x0 else 0.0), (1.0 if x1 else 0.0)
    if not x0: u0 += 0.02
    if not x1: u1 -= 0.02
    band(Fr, u0, u1, d, 11.3 + dz, 11.42 + dz, 0.06)
    band(Fr, u0 - 0.04 * e0, u1 + 0.04 * e1, d, 11.88 + dz, 11.95 + dz, 0.08)
    if dent:
        k = u0 + 0.16
        while k < (dent_to if dent_to is not None else u1) - 0.1:
            box('trim', Fr, k - 0.065, k + 0.065, d, d + 0.14, 11.95 + dz, 12.18 + dz, bottom=False)
            k += 0.32
    band(Fr, u0 - 0.15 * e0, u1 + 0.15 * e1, d, 12.18 + dz, 12.36 + dz, 0.2)
    band(Fr, u0 - 0.4 * e0, u1 + 0.4 * e1, d, 12.36 + dz, 12.56 + dz, 0.45)
    box('roof', Fr, u0 - ext * e0, u1 + ext * e1, d - 0.02, d + ext, 12.56 + dz, EAVE - 0.01)

def simple_window(Fr, cu, za, w, h, d=0.0, frame=False):
    """Окно попроще для двора и торцов: стекло, импост с форточкой, подоконник."""
    ua, ub, zb = cu - w / 2, cu + w / 2, za + h
    g = d - 0.2
    face('glass', [Fr.p(ua, g, za), Fr.p(ub, g, za), Fr.p(ub, g, zb), Fr.p(ua, g, zb)], Fr.N())
    box('trim', Fr, cu - 0.035, cu + 0.035, g, g + 0.06, za, zb, bottom=False)
    box('trim', Fr, ua, ub, g, g + 0.06, za + h * 0.7 - 0.035, za + h * 0.7 + 0.035, bottom=False)
    box('trim', Fr, ua - 0.1, ub + 0.1, d, d + 0.1, za - 0.08, za)
    if frame:
        surround(Fr, ua, ub, za, zb, d)
    return (ua, ub, za, zb)

def win_row(Fr, cus, rows, d=0.0, simple=False):
    holes = []
    for za, h, w in rows:
        for cu in cus:
            if simple:
                holes.append(simple_window(Fr, cu, za, w, h, d))
            else:
                holes.append(window(Fr, cu, za, w, h, d, 'plain', cols=2, rows=(0.7,)))
    return holes

def dormer(Fr, cu, df, zb, w=1.3, h=1.15, depth=2.8):
    box('wall', Fr, cu - w / 2, cu + w / 2, df - depth, df, zb - 1.2, zb + h)
    face('glass', [Fr.p(cu - 0.38, df + 0.01, zb + 0.12), Fr.p(cu + 0.38, df + 0.01, zb + 0.12),
                   Fr.p(cu + 0.38, df + 0.01, zb + 0.95), Fr.p(cu - 0.38, df + 0.01, zb + 0.95)], Fr.N())
    for a, b, c0, c1 in ((-0.45, -0.38, 0.05, 1.02), (0.38, 0.45, 0.05, 1.02), (-0.45, 0.45, 0.05, 0.12),
                         (-0.45, 0.45, 0.95, 1.02), (-0.03, 0.03, 0.12, 0.95)):
        box('trim', Fr, cu + a, cu + b, df, df + 0.05, zb + c0, zb + c1)
    ov, rs = 0.15, 0.55
    for s in (-1, 1):
        face('roof', [Fr.p(cu + s * (w / 2 + ov), df + ov, zb + h), Fr.p(cu, df + ov, zb + h + rs),
                      Fr.p(cu, df - depth, zb + h + rs), Fr.p(cu + s * (w / 2 + ov), df - depth, zb + h)], UP + Fr.U() * s)
    prism_uz('wall', Fr, [(cu - w / 2, zb + h), (cu + w / 2, zb + h), (cu, zb + h + rs)], df - depth, df)

# ================================================================== главный фасад
def front():
    holes = []
    for i in range(6):                                      # арки кафе
        za = 0.0 if i == DOOR else 0.55
        holes.append(arch_parts(F, S[i], RA, za, ZS))
    holes.append(arch_parts(F, S[6], RA, 0.55, ZS, reveal=0.25, fill='wall'))   # глухая ниша
    disc_uz('trim', F, S[6], ZS + 0.25, 0.55, -0.25, -0.13, 16)              # медальон в нише
    disc_uz('wall', F, S[6], ZS + 0.25, 0.36, -0.13, -0.05, 12)
    box('trim', F, S[6] - 0.9, S[6] + 0.9, -0.25, -0.08, 0.55, 0.7)
    # второй этаж: высокие окна; третий — окна и балконные двери на осях 1, 3, 5
    holes += win_row(F, S[:6], [(4.95, 2.2, 1.3)])
    for i in range(6):
        cu = S[i]
        if i % 2 == 1:
            holes.append((cu - 0.6, cu + 0.6, 8.3, 10.55))
            glazing(F, cu - 0.6, cu + 0.6, 8.3, 10.55, 0, cols=2, rows=(0.45, 0.8))
            surround(F, cu - 0.6, cu + 0.6, 8.3, 10.55, 0)
            box('trim', F, cu - 0.95, cu + 0.95, 0, 0.72, 8.12, 8.3)            # плита балкона
            balustrade(F.p(cu - 0.9, 0.66, 8.3), F.p(cu + 0.9, 0.66, 8.3), 0.95, 0.17)
            for s in (-1, 1):
                balustrade(F.p(cu + s * 0.9, 0.0, 8.3), F.p(cu + s * 0.9, 0.66, 8.3), 0.95, 0.22)
        else:
            holes.append(window(F, cu, 8.65, 1.2, 1.85, 0, 'plain', cols=2, rows=(0.7,)))
    wall(F, BAYW, L - BAYW, 0.5, EAVE, 0, holes, reveal=0.3)
    # цоколь (кроме входа)
    for a, b in ((BAYW, S[DOOR] - RA), (S[DOOR] + RA, L - BAYW)):
        box('stone', F, a, b, -0.3, 0.06, GR, 0.5)
    box('stone', F, S[DOOR] - RA, S[DOOR] + RA, -0.3, 0.0, GR, 0.0)
    # входные двери (стекло в белой раме) — рама поверх стекла арки
    g = -0.28
    for a in (-0.62, 0.0, 0.62):
        box('trim', F, S[DOOR] + a - 0.05, S[DOOR] + a + 0.05, g, g + 0.1, 0.0, 2.4)
    box('trim', F, S[DOOR] - RA, S[DOOR] + RA, g, g + 0.1, 2.35, 2.45)
    for s in (-1, 1):
        box('metal', F, S[DOOR] + s * 0.12 - 0.02, S[DOOR] + s * 0.12 + 0.02, g + 0.1, g + 0.16, 0.9, 1.5)
    # «Окно Экспресс» на оси 3: белая панель-меню под стеклом
    box('trim', F, S[3] - 1.2, S[3] + 1.2, -0.27, -0.2, 0.55, 1.25)
    # маркизы над всеми арками кафе
    for i in range(6):
        dome_awning(F, S[i], ZS)
    # вывеска «МИР БУРГЕР» над входом
    lettering(F, 'МИР БУРГЕР', S[DOOR], 4.2)
    # кондиционеры и водостоки
    for cu, z in ((S[0] + 0.95, 5.5), (S[2] + 0.95, 9.0), (S[4] + 0.95, 5.6)):
        box('trim', F, cu, cu + 0.75, 0, 0.28, z, z + 0.5)
    for u in (BAYW + 0.15, L - BAYW - 0.15):
        beam('trim', F.p(u, 0.14, 0.15), F.p(u, 0.14, 12.3), 0.12)
    eave(F, BAYW, L - BAYW, x0=False, x1=False)

# ================================================================== угловые ризалиты с лоджиями
def bay(Fb, side_len, side_wins):
    """Fb: начало в наружном углу ризалита, u — вдоль фасада внутрь, n — на улицу."""
    Fs = Frame(Fb.p(0, 0, 0).xy, -Fb.n, -Fb.u)              # торец: вдоль — вглубь
    LA, LE = 4.1, 4.0                                       # проём лоджии по фасаду и по торцу
    # пол лоджии и ступени
    box('stone', Fb, 0, LA, -LE, 0, GR, LOG)
    for i in range(3):
        box('stone', Fb, 1.0, 3.2, 0, 0.3 * (3 - i), GR, 0.2 * (i + 1))
    # простенок ризалита
    box('wall', Fb, LA, BAYW, -0.6, 0, GR, ENT)
    box('stone', Fb, LA - 0.05, BAYW + 0.05, -0.6, 0.06, GR, 0.5)
    # колонны: угловая, у простенка, у торцевой стены
    for a, e in ((0.31, -0.31), (LA - 0.31, -0.31), (0.31, -LE + 0.31)):
        ionic(Fb, a, e, LOG, COLTOP - LOG)
    # антаблемент над проёмами
    box('wall', Fb, 0, LA, -0.62, 0, COLTOP, ENT)
    box('wall', Fb, 0, 0.62, -LE, 0, COLTOP, ENT)
    band(Fb, 0, LA, 0, COLTOP, COLTOP + 0.12, 0.05)
    band(Fs, 0, LE, 0, COLTOP, COLTOP + 0.12, 0.05)
    face('trim', [Fb.p(0, 0, ENT - 0.01), Fb.p(LA, 0, ENT - 0.01), Fb.p(LA, -LE, ENT - 0.01), Fb.p(0, -LE, ENT - 0.01)], -UP)
    # перекрытие второго этажа лоджии и балюстрады
    box('trim', Fb, 0.05, LA, -LE, -0.05, H1 - 0.1, H1 + 0.1)
    balustrade(Fb.p(0.62, -0.25, H1 + 0.1), Fb.p(LA - 0.62, -0.25, H1 + 0.1), 1.0)
    balustrade(Fb.p(0.25, -0.62, H1 + 0.1), Fb.p(0.25, -LE + 0.62, H1 + 0.1), 1.0)
    # задние стены лоджии
    Fa = Frame(Fb.p(0, -LE, 0).xy, Fb.u, Fb.n)
    door = (1.45, 2.75, LOG, LOG + 2.5)
    wa = (1.35, 2.85, 5.1, 7.25)
    wall(Fa, 0, LA, LOG, ENT, 0, [door, wa])
    face('wood', [Fa.p(1.45, -0.2, LOG), Fa.p(2.75, -0.2, LOG), Fa.p(2.75, -0.2, LOG + 2.5), Fa.p(1.45, -0.2, LOG + 2.5)], Fa.N())
    glazing(Fa, *wa, 0, cols=3, rows=(0.7,))
    Fbb = Frame(Fb.p(LA, 0, 0).xy, -Fb.n, -Fb.u)
    wb = [(1.6, 3.0, 5.1, 7.25), (1.6, 3.0, 1.5, 3.6)]
    wall(Fbb, 0.6, LE, LOG, ENT, 0, wb)
    for h in wb:
        glazing(Fbb, *h, 0, cols=2, rows=(0.7,))
    # третий этаж ризалита: застеклённая лоджия в глубоком проёме
    for Fx, ln in ((Fb, BAYW), (Fs, LE)):
        a0, a1 = (0.75, 3.55) if Fx is Fb else (0.7, 3.3)
        wall(Fx, 0, ln, ENT, EAVE, 0, [(a0, a1, 8.6, 11.0)], reveal=0.5)
        glazing(Fx, a0, a1, 8.6, 11.0, 0, cols=3, rows=(0.4, 0.78), reveal=0.5)
        box('wall', Fx, a0, a1, -0.14, 0.0, 8.6, 9.5)                          # парапет
        box('trim', Fx, a0 - 0.05, a1 + 0.05, -0.17, 0.06, 9.5, 9.58)
        box('trim', Fx, a0 - 0.2, a1 + 0.2, 0, 0.12, 8.45, 8.6)
        band(Fx, 0, ln, 0, ENT, ENT + 0.18, 0.1)
    # торцевая стена за лоджией
    wall(Fs, LE, side_len, 0.5, EAVE, 0, side_wins(Fs))
    box('stone', Fs, LE, side_len, -0.3, 0.06, GR, 0.5)
    # карнизы ризалита
    eave(Fb, 0, BAYW, dz=0.03)
    eave(Fs, 0, side_len, dent_to=BAYW, x0=False, x1=False, dz=0.03)
    box('wall', Fb, 0, BAYW, -LE, 0, EAVE - 0.4, EAVE)                          # перемычка под кровлей
    return Fs

def end_windows(along):
    def f(Fs):
        holes = []
        for cu in along:
            holes.append(simple_window(Fs, cu, 1.0, 1.3, 2.2, 0, True))
            holes.append(simple_window(Fs, cu, 4.95, 1.3, 2.2, 0, True))
            holes.append(simple_window(Fs, cu, 8.65, 1.2, 1.85, 0, True))
        return holes
    return f

def bays():
    Fsw = Frame(F.p(0, BP, 0).xy, F.u, F.n)
    bay(Fsw, DEP + BP, end_windows([7.6, 11.7]))
    Fne = Frame(F.p(L, BP, 0).xy, -F.u, F.n)
    bay(Fne, -WD + BP, end_windows([7.6, 11.7, 16.9]))

# ================================================================== двор и кровля
def rear():
    Fr = Frame(F.p(WU0, -DEP, 0).xy, -F.u, -F.n)            # вдоль от u=23 к u=0
    cus = [1.8 + 3.3 * i for i in range(7)]
    holes = []
    for i, cu in enumerate(cus):
        if i == 3:                                          # подъезд и окна лестницы
            holes.append((cu - 0.7, cu + 0.7, 0.0, 2.4))
            holes.append(simple_window(Fr, cu, 3.3, 1.1, 1.6, 0))
            holes.append(simple_window(Fr, cu, 6.9, 1.1, 1.6, 0))
            continue
        holes.append(simple_window(Fr, cu, 1.3, 1.2, 1.9, 0))
        holes.append(simple_window(Fr, cu, 5.1, 1.2, 1.9, 0))
        holes.append(simple_window(Fr, cu, 8.65, 1.2, 1.8, 0))
    wall(Fr, 0, WU0, GR, EAVE, 0, holes)
    face('wood', [Fr.p(cus[3] - 0.7, -0.2, 0), Fr.p(cus[3] + 0.7, -0.2, 0), Fr.p(cus[3] + 0.7, -0.2, 2.4), Fr.p(cus[3] - 0.7, -0.2, 2.4)], Fr.N())
    box('wall', Fr, cus[3] - 1.0, cus[3] + 1.0, 0, 1.0, 2.5, 2.65)          # козырёк
    eave(Fr, 0, WU0, dent=False, ext=0.6)
    # дворовое крыло
    Fw = Frame(F.p(WU0, WD, 0).xy, F.n, -F.u)               # западная стена крыла, вдоль от d=-20.4
    ln = WD * -1 - DEP
    wall(Fw, 0, ln, GR, EAVE, 0, win_row(Fw, [ln / 2], [(1.3, 1.9, 1.2), (5.1, 1.9, 1.2), (8.65, 1.8, 1.2)], simple=True))
    eave(Fw, 0, ln, dent=False, ext=0.6, x1=False, dz=0.01)
    Fwr = Frame(F.p(L, WD, 0).xy, -F.u, -F.n)               # торец крыла во двор
    wl = L - WU0
    wall(Fwr, 0, wl, GR, EAVE, 0, win_row(Fwr, [2.2, 6.75, 11.3], [(1.3, 1.9, 1.2), (5.1, 1.9, 1.2), (8.65, 1.8, 1.2)], simple=True))
    eave(Fwr, 0, wl, dent=False, ext=0.6)

def roofs():
    hip_roof(F, 0, L, BP, -DEP, EAVE, RISE, ov=0.7)
    Fw = Frame(F.p(L, -7.5, 0).xy, -F.n, F.u)               # кровля крыла: конёк поперёк
    hip_roof(Fw, 0, -WD - 7.5, 0, -(L - WU0), EAVE, 3.35, ov=0.7, hip0=False, hip1=True)
    zf = lambda d: EAVE + RISE * (BP + 0.7 - d) / ((DEP + BP) / 2 + 0.7)
    for cu in (9.25, 22.5):
        dormer(F, cu, -2.2, zf(-2.2) - 0.1)
    chimney(F, 4.3, -5.5, EAVE, zf(-5.5) + 1.3, 0.8)
    chimney(F, 15.5, -9.5, EAVE, EAVE + RISE - 0.2, 0.8)
    chimney(F, 31.0, -11.0, EAVE, EAVE + 3.3, 0.8)

# ================================================================== веранда
U0, U1 = 5.7, 30.9        # настил вдоль фасада
D1 = 4.8                  # глубина от стены (до тротуара остаётся ~11 м)
STEP = (S[DOOR] - 1.0, S[DOOR] + 1.0)

def table(cu, cd, s=0.8):
    box('trim', F, cu - s / 2, cu + s / 2, cd - s / 2, cd + s / 2, DZ + 0.72, DZ + 0.76)
    box('metal', F, cu - 0.04, cu + 0.04, cd - 0.04, cd + 0.04, DZ, DZ + 0.72, bottom=False)
    box('metal', F, cu - 0.28, cu + 0.28, cd - 0.28, cd + 0.28, DZ, DZ + 0.03, bottom=False)

def chair(cu, cd, face_dir, m):
    """face_dir — куда смотрит сидящий (единичный вектор в осях рамки (u, d))."""
    fu, fd = face_dir
    back = Vector((-(F.u.x * fu + F.n.x * fd), -(F.u.y * fu + F.n.y * fd)))
    side = Vector((-back.y, back.x))
    o = F.p(cu, cd, 0)
    Fc = Frame(Vector((o.x, o.y)), side, back)
    box(m, Fc, -0.22, 0.22, -0.22, 0.2, DZ + 0.42, DZ + 0.47)
    box(m, Fc, -0.22, 0.22, 0.17, 0.22, DZ + 0.47, DZ + 0.86)
    for s in (-1, 1):
        box(m, Fc, s * 0.205 - 0.025, s * 0.205 + 0.025, -0.2, 0.2, DZ, DZ + 0.42, bottom=False)
        box(m, Fc, s * 0.205 - 0.025, s * 0.205 + 0.025, -0.15, 0.2, DZ + 0.47, DZ + 0.64, bottom=False)

def umbrella(cu, cd, hw=1.4):
    beam('wood', F.p(cu, cd, DZ), F.p(cu, cd, DZ + 2.75), 0.08)
    box('metal', F, cu - 0.3, cu + 0.3, cd - 0.3, cd + 0.3, DZ, DZ + 0.08, bottom=False)
    z0, z1 = DZ + 2.25, DZ + 2.8
    c = [F.p(cu - hw, cd - hw, z0), F.p(cu + hw, cd - hw, z0), F.p(cu + hw, cd + hw, z0), F.p(cu - hw, cd + hw, z0)]
    ap = F.p(cu, cd, z1)
    for i in range(4):
        face('wall2', [c[i], c[(i + 1) % 4], ap], UP)
        beam('wood', ap - UP * 0.05, c[i] + (ap - c[i]) * 0.02, 0.035)
    for (a0, a1, b0, b1) in ((-hw, hw, -hw, -hw + 0.02), (-hw, hw, hw - 0.02, hw), (-hw, -hw + 0.02, -hw, hw), (hw - 0.02, hw, -hw, hw)):
        box('wall2', F, cu + a0, cu + a1, cd + b0, cd + b1, z0 - 0.22, z0, bottom=False)
    box('wood', F, cu - 0.07, cu + 0.07, cd - 0.07, cd + 0.07, z1 - 0.02, z1 + 0.1)

def planter(u0, u1, d0, d1, h=0.55, tall=0.45):
    box('wood', F, u0, u1, d0, d1, DZ, DZ + h, bottom=False)
    box('wood', F, u0 - 0.03, u1 + 0.03, d0 - 0.03, d1 + 0.03, DZ + h - 0.05, DZ + h)
    box('metal', F, u0 + 0.06, u1 - 0.06, d0 + 0.06, d1 - 0.06, DZ + h, DZ + h + tall * 0.6, bottom=False)
    n = max(2, round((u1 - u0) / 0.7))
    for k in range(n):                          # кусты поверх живой изгороди
        uu = u0 + (u1 - u0) * (k + 0.5) / n
        r = 0.27 + 0.05 * ((k * 7) % 3) / 2
        zc = DZ + h + tall * 0.55
        lathe('metal', F.p(uu, (d0 + d1) / 2, zc), [(r, r * 0.3), (r * 0.75, r * 0.9), (0.05, r * 1.15)], 6)

def thuja(cu, cd):
    box('wood', F, cu - 0.35, cu + 0.35, cd - 0.35, cd + 0.35, DZ, DZ + 0.7, bottom=False)
    lathe('metal', F.p(cu, cd, DZ + 0.7), [(0.12, 0), (0.36, 0.25), (0.33, 0.9), (0.2, 1.45), (0.03, 1.85)], 8)

def garland(p0, p1, sag=0.32, n=9):
    pts = []
    for k in range(n + 1):
        t = k / n
        pts.append(p0 + (p1 - p0) * t - UP * (sag * 4 * t * (1 - t)))
    for k in range(n):
        beam('metal', pts[k], pts[k + 1], 0.015)
        q = (pts[k] + pts[k + 1]) / 2 - UP * 0.06
        box('trim', Frame(Vector((q.x, q.y)), F.u, F.n), -0.045, 0.045, -0.045, 0.045, q.z - 0.05, q.z + 0.05)

def veranda():
    # подиум: гранитное основание, доски вдоль фасада, торцевая доска
    box('stone', F, U0, U1, 0.0, D1, GR, DZ - 0.04)
    k, w = 0.0, 0.15
    while k < D1 - 0.01:
        box('wood', F, U0, U1, k + 0.008, min(D1, k + w) - 0.008, DZ - 0.04, DZ, bottom=False)
        k += w
    box('wood', F, U0 - 0.03, U1 + 0.03, D1 - 0.02, D1 + 0.03, -0.02, DZ - 0.02, bottom=False)
    for u in (U0 - 0.03, U1 - 0.02):
        box('wood', F, u, u + 0.05, 0.0, D1 + 0.03, -0.02, DZ - 0.02, bottom=False)
    # ступени: к входу и с торца
    box('wood', F, STEP[0], STEP[1], D1, D1 + 0.38, -0.05, DZ / 2)
    box('wood', F, U0 - 0.4, U0, 1.4, 3.2, -0.05, DZ / 2)
    # ограждение — длинные кашпо с живой изгородью; проходы у ступеней
    def run_u(a, b, d0, d1):
        n = max(1, round((b - a) / 2.1))
        st = (b - a) / n
        for i in range(n):
            planter(a + i * st + 0.05, a + (i + 1) * st - 0.05, d0, d1)
    run_u(U0 + 0.05, STEP[0] - 0.45, D1 - 0.5, D1 - 0.05)
    run_u(STEP[1] + 0.45, U1 - 0.05, D1 - 0.5, D1 - 0.05)
    for (a, b) in ((0.35, 1.3), (3.3, D1 - 0.55)):
        box('wood', F, U0 + 0.05, U0 + 0.5, a, b, DZ, DZ + 0.55, bottom=False)
        box('metal', F, U0 + 0.11, U0 + 0.44, a + 0.06, b - 0.06, DZ + 0.55, DZ + 0.85, bottom=False)
    for (a, b) in ((0.35, D1 - 0.55),):
        box('wood', F, U1 - 0.5, U1 - 0.05, a, b, DZ, DZ + 0.55, bottom=False)
        box('metal', F, U1 - 0.44, U1 - 0.11, a + 0.06, b - 0.06, DZ + 0.55, DZ + 0.85, bottom=False)
        for t in range(4):
            dd = a + (b - a) * (t + 0.5) / 4
            lathe('metal', F.p(U1 - 0.27, dd, DZ + 0.8), [(0.2, 0), (0.27, 0.13), (0.18, 0.28), (0.04, 0.33)], 6)
    for dd in (0.8, 3.75):
        lathe('metal', F.p(U0 + 0.27, dd, DZ + 0.8), [(0.2, 0), (0.27, 0.13), (0.18, 0.28), (0.04, 0.33)], 6)
    # туи у входа
    thuja(STEP[0] - 0.12, D1 - 0.42)
    thuja(STEP[1] + 0.12, D1 - 0.42)
    # мачты гирлянд по углам и у прохода, гирлянды по периметру и к стене
    posts = [(U0 + 0.2, D1 - 0.15), (13.3, D1 - 0.15), (STEP[0] - 0.55, D1 - 0.15),
             (STEP[1] + 0.55, D1 - 0.15), (26.6, D1 - 0.15), (U1 - 0.2, D1 - 0.15)]
    top = DZ + 3.05
    for cu, cd in posts:
        beam('metal', F.p(cu, cd, DZ), F.p(cu, cd, top + 0.1), 0.07)
    for i in range(len(posts) - 1):
        (a, b), (c, e) = posts[i], posts[i + 1]
        garland(F.p(a, b, top), F.p(c, e, top), 0.3 if abs(c - a) > 3 else 0.15, max(3, round(abs(c - a) / 0.55)))
    for cu, cd in (posts[0], posts[-1], posts[1], posts[4]):
        garland(F.p(cu, cd, top), F.p(cu, 0.15, 3.45 if cu in (posts[0][0], posts[-1][0]) else 4.35), 0.35, 8)
    # столики: под зонтами — на четверых, у стены — на двоих
    k = 0
    for cu in (8.7, 12.6, 16.6, 25.4, 29.0):
        cd = 3.05
        umbrella(cu, cd)
        table(cu, cd)
        for du, dd in ((-0.62, 0), (0.62, 0), (0, -0.62), (0, 0.62)):
            chair(cu + du, cd + dd, (-du / 0.62 if du else 0, -dd / 0.62 if dd else 0), 'trim' if k % 2 else 'wood')
            k += 1
    for cu in (7.6, 11.2, 18.9, 25.2, 28.7):
        cd = 1.25
        table(cu, cd, 0.7)
        for du in (-0.58, 0.58):
            chair(cu + du, cd, (-du / 0.58, 0), 'wood' if k % 3 else 'trim')
            k += 1

# ================================================================== сборка
front()
bays()
rear()
roofs()
veranda()

finish('mir_burger', __file__, tri_budget=25000)
