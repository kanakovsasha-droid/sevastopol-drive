# Генератор кедра для игры «Севастополь»: ствол с корой, почти горизонтальные
# скелетные ветви, на них плоские «подушки» хвои с рваным краем — ярусами.
# Общий для models/cedar_lazarev и models/tree_ushakov; каждая папка задаёт
# свои параметры (порода, высота, профиль кроны) в build.py.
#
# Начало координат модели — основание ствола на земле, оси мира: Blender X =
# восток, Blender Y = север (= −z мира), Z вверх. Выгрузка — два GLB:
# data/models/<имя>.glb (подробный) и <имя>.lod.glb (дальний).
# Цвет — атрибут вершин (COLOR_0), материалы 'leaf' и 'bark'. Базовый цвет
# материала — самый светлый тон, цвет вершин его затемняет (в игре цвет
# вершины умножается на цвет материала).
import bpy, math, random, os, sys, json
from mathutils import Vector, noise

UP = Vector((0, 0, 1))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def lin(c):
    return tuple(x ** 2.2 for x in c)


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def table(tb, u):
    """Кусочно-линейная функция по таблице [(u, значение)]."""
    if u <= tb[0][0]:
        return tb[0][1]
    for (u0, v0), (u1, v1) in zip(tb, tb[1:]):
        if u <= u1:
            return v0 + (v1 - v0) * (u - u0) / (u1 - u0)
    return tb[-1][1]


def fbm(p, octaves=3):
    t, a, f = 0.0, 1.0, 1.0
    for _ in range(octaves):
        t += a * noise.noise(p * f)
        a *= 0.5
        f *= 2.03
    return t


# ------------------------------------------------------------------ сетка
class Geo:
    """Сырая сетка: вершины, грани, цвет и «надутая» нормаль на вершину."""

    def __init__(self):
        self.v, self.f, self.c, self.o = [], [], [], []

    def add(self, p, col, out=None):
        self.v.append((p.x, p.y, p.z))
        self.c.append(col)
        self.o.append(out)
        return len(self.v) - 1

    def face(self, idx, hint):
        a, b, c = (Vector(self.v[i]) for i in idx[:3])
        n = (b - a).cross(c - a)
        if len(idx) == 4:
            d = Vector(self.v[idx[3]])
            n = (c - a).cross(d - b)
        if n.dot(hint) < 0:
            idx = list(reversed(idx))
        self.f.append(tuple(idx))

    def tris(self):
        return sum(len(f) - 2 for f in self.f)


# ------------------------------------------------------------------ трубка
def frames(pts):
    """Параллельный перенос рамки вдоль ломаной."""
    T = []
    for i in range(len(pts)):
        a = pts[max(0, i - 1)]
        b = pts[min(len(pts) - 1, i + 1)]
        T.append((b - a).normalized())
    n = T[0].cross(UP)
    if n.length < 1e-3:
        n = Vector((1, 0, 0))
    n.normalize()
    out = []
    for t in T:
        n = (n - t * n.dot(t))
        if n.length < 1e-4:
            n = t.orthogonal()
        n.normalize()
        out.append((t, n, t.cross(n)))
    return out


def tube(G, pts, radii, sides, colfn, rfn=None, tip=True, phase=0.0):
    """Трубка по точкам pts с радиусами radii; rfn(i, угол, p) — множитель
    радиуса (кора, корневые лапы); colfn(p, угол) — цвет вершины."""
    fr = frames(pts)
    rings = []
    for i, (p, r) in enumerate(zip(pts, radii)):
        t, n, b = fr[i]
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides + phase
            d = n * math.cos(a) + b * math.sin(a)
            rr = r * (rfn(i, a, p) if rfn else 1.0)
            q = p + d * rr
            ring.append(G.add(q, colfn(q, a), d))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(sides):
            j = (k + 1) % sides
            q = [rings[i][k], rings[i][j], rings[i + 1][j], rings[i + 1][k]]
            c = (pts[i] + pts[i + 1]) / 2
            m = sum((Vector(G.v[x]) for x in q), Vector()) / 4
            G.face(q, m - c)
    if tip:
        t = fr[-1][0]
        e = G.add(pts[-1] + t * radii[-1] * 1.5, colfn(pts[-1], 0), t)
        for k in range(sides):
            j = (k + 1) % sides
            G.face([rings[-1][k], rings[-1][j], e], t)


# ------------------------------------------------------------------ подушка хвои
def pad(G, c, u, rx, ry, th, droop, seed, colfn, outfn, N=12, rings=(0.38, 0.72), lod=False, pitch=0.0):
    """Плоская подушка хвои: купол сверху, плоское дно, рваный край.
    c — центр (на уровне края), u — направление ветви (горизонталь),
    rx — полуось вдоль ветви, ry — поперёк, th — толщина, droop — свис края."""
    u = Vector((u.x, u.y, 0)).normalized()
    v = UP.cross(u)
    rng = random.Random(seed)
    ph = Vector((rng.uniform(0, 50), rng.uniform(0, 50), rng.uniform(0, 50)))
    R, A = [], []
    for k in range(N):
        a = 2 * math.pi * (k + rng.uniform(-0.2, 0.2)) / N
        ca, sa = math.cos(a), math.sin(a)
        e = 1.0 / math.sqrt((ca / rx) ** 2 + (sa / ry) ** 2)
        f = 0.88 + 0.26 * noise.noise(ph + Vector((ca * 1.4, sa * 1.4, 0)))
        if not lod:                            # рваный край: лапы и выемки
            f *= 0.93 + 0.12 * noise.noise(ph * 2.1 + Vector((ca * 3.5, sa * 3.5, 1.0)))
            if rng.random() < 0.3:
                f *= rng.uniform(0.70, 0.85)
        R.append(e * f)
        A.append((ca, sa))

    def P(k, t, z):
        ca, sa = A[k]
        return c + u * (ca * R[k] * t) + v * (sa * R[k] * t) + UP * (z - pitch * ca * R[k] * t)

    def edge_z(k):
        ca, _ = A[k]
        # край свисает, сильнее к концу ветви (ca > 0)
        return (-droop * (0.55 + 0.45 * ca) * th + 0.26 * th * noise.noise(ph * 1.7 + Vector((A[k][0] * 2, A[k][1] * 2, 3.0)))
                - (0.18 * th if (k % 3 == 1 and not lod) else 0.0))

    def top_z(k, t):
        bump = 0.30 * th * noise.noise(ph * 0.7 + Vector((A[k][0] * t * 2.5, A[k][1] * t * 2.5, 7.0)))
        bump += rng.uniform(-0.12, 0.12) * th
        return th * 0.50 * (1 - t ** 2.6) + bump * (1 - t * 0.6) + edge_z(k) * t ** 3

    top = G.add(c + UP * th * 0.52, colfn(c + UP * th * 0.52, 1, 0.0), outfn(c + UP * th, 1))
    edge = []
    for k in range(N):
        q = P(k, 1.0, edge_z(k))
        edge.append(G.add(q, colfn(q, 0.5, 1.0), outfn(q, 0)))
    prev = [top] * N
    for t in rings:
        ring = []
        for k in range(N):
            q = P(k, t, top_z(k, t))
            ring.append(G.add(q, colfn(q, 1, t), outfn(q, 1)))
        for k in range(N):
            j = (k + 1) % N
            if prev[0] == top:
                G.face([top, ring[k], ring[j]], UP)
            else:
                G.face([prev[k], ring[k], ring[j], prev[j]], UP)
        prev = ring
    for k in range(N):
        j = (k + 1) % N
        if prev[0] == top:
            G.face([top, edge[k], edge[j]], UP)
        else:
            G.face([prev[k], edge[k], edge[j], prev[j]], UP)
    # дно
    bc = c + UP * (-th * 0.26)
    bot = G.add(bc, colfn(bc, -1, 0.0), outfn(bc, -1))
    for k in range(N):
        j = (k + 1) % N
        G.face([bot, edge[j], edge[k]], -UP)


# ------------------------------------------------------------------ дерево
class Cedar:
    """Параметры:
    H — высота, crown — таблица [(u, радиус кроны)] по u = (z − z0)/(H − z0),
    z0 — низ кроны, r0 — радиус ствола у земли, fork — высота раздвоения
    (None — один ствол), rise/sag — подъём ветви у ствола и свис к концу,
    tiers — число ярусов, per — ветвей на ярус (низ, верх),
    leaf_dark/leaf_mid/leaf_top — цвета хвои (sRGB), bark — (тёмный, светлый)."""

    def __init__(self, **k):
        self.__dict__.update(dict(
            H=20.0, z0=2.2, r0=0.55, fork=None, fork_spread=1.6, lean=(0.0, 0.0),
            crown=[(0, 7), (0.3, 8), (0.6, 6), (0.85, 4.5), (1, 1.5)],
            rise=0.30, sag=0.20, tiers=9, per=(5, 3), th=(0.95, 0.65),
            pad_w=1.0, N=16, pitch=0.0, tier_pow=0.92, leader_from=0.6, laterals=3, top_pads=3, drape=0.35,
            leaf_dark=(0.07, 0.12, 0.09), leaf_mid=(0.17, 0.26, 0.19), leaf_top=(0.34, 0.44, 0.41),
            bark=((0.20, 0.17, 0.15), (0.47, 0.42, 0.37)), seed=1))
        self.__dict__.update(k)
        self.rng = random.Random(self.seed)
        self.skeleton()

    # ---- ось ствола / лидеров
    def R(self, z):
        u = (z - self.z0) / (self.H - self.z0)
        return table(self.crown, clamp(u, 0, 1))

    def leaders(self):
        """Список осевых линий: [(точки, радиусы)] — ствол и, при раздвоении, второй лидер."""
        H, r0 = self.H, self.r0
        top = H - 1.0
        lx, ly = self.lean

        def axis(z, side):
            p = Vector((lx * z / H, ly * z / H, z))
            p.x += 0.35 * noise.noise(Vector((z * 0.15, 0.3, self.seed)))
            p.y += 0.35 * noise.noise(Vector((z * 0.15, 5.3, self.seed)))
            if self.fork is not None and z > self.fork and side is not None:
                s = (z - self.fork) / (top - self.fork)
                off = self.fork_spread * math.sin(min(1.0, s * 1.3) * math.pi / 2)
                p += side * off
            return p

        def radius(z):
            u = clamp(z / top)
            r = r0 * (1 - 0.86 * u ** 0.85)
            if z < 1.2:
                r *= 1 + 0.55 * ((1.2 - max(z, 0)) / 1.2) ** 2.5
            return max(r, 0.05)

        zs = [-0.5, -0.15, 0.15, 0.45, 0.8, 1.3, 2.0, 2.8, 3.7]
        z = 3.7
        while z < top - 0.01:
            z = min(top, z + 1.25)
            zs.append(z)
        out = []
        if self.fork is None:
            pts = [axis(z, None) for z in zs]
            out.append((pts, [radius(z) for z in zs], None))
        else:
            a = self.rng.uniform(0, 2 * math.pi)
            for sgn, kr, ktop in ((1, 1.0, 1.0), (-1, 0.82, 0.93)):
                side = Vector((math.cos(a), math.sin(a), 0)) * sgn
                zz = [z for z in zs if z <= top * ktop] + ([top * ktop] if zs[-1] > top * ktop else [])
                pts = [axis(z, side) for z in zz]
                rad = [radius(z) * (1 if z <= self.fork else kr) for z in zz]
                if sgn < 0:          # второй лидер отходит от ствола выше точки раздвоения
                    k0 = next(i for i, z in enumerate(zz) if z > self.fork)
                    pts, rad = pts[k0 - 1:], rad[k0 - 1:]
                    rad[0] *= 0.8
                out.append((pts, rad, side))
        return out

    def axis_at(self, z, az):
        """Точка на ближайшем по азимуту лидере на высоте z и радиус ствола там."""
        best = None
        for pts, rad, side in self.L:
            if z < pts[0].z or z > pts[-1].z:
                continue
            for i in range(len(pts) - 1):
                if pts[i].z <= z <= pts[i + 1].z:
                    t = (z - pts[i].z) / max(1e-6, pts[i + 1].z - pts[i].z)
                    p = pts[i].lerp(pts[i + 1], t)
                    r = rad[i] + (rad[i + 1] - rad[i]) * t
                    score = 0 if side is None else -side.dot(Vector((math.cos(az), math.sin(az), 0)))
                    if best is None or score < best[0]:
                        best = (score, p, r)
        if best is None:
            pts, rad, _ = self.L[0]
            return pts[-1].copy(), rad[-1]
        return best[1], best[2]

    # ---- скелет и подушки
    def skeleton(self):
        rng = self.rng
        self.L = self.leaders()
        self.branches = []      # (точки, радиусы, ярус)
        self.lats = []
        self.pads = []          # dict(c, u, rx, ry, th, droop, seed, main)
        H, z0 = self.H, self.z0
        n = self.tiers
        golden = math.pi * (3 - math.sqrt(5))
        az0 = rng.uniform(0, 6.28)
        top_axis = max(p[0][-1].z for p in self.L)
        for ti in range(n):
            u = ti / (n - 1)
            zt = z0 + (top_axis - 0.6 - z0) * (u ** self.tier_pow) + rng.uniform(-0.25, 0.25)
            nb = round(self.per[0] + (self.per[1] - self.per[0]) * u)
            for bi in range(nb):
                az = az0 + ti * golden * 1.3 + bi * 2 * math.pi / nb + rng.uniform(-0.35, 0.35)
                zb = zt + rng.uniform(-0.35, 0.35)
                base, rt = self.axis_at(zb, az)
                Lb = max(0.8, self.R(zb + 0.6) * rng.uniform(0.82, 1.06) - rt)
                d = Vector((math.cos(az), math.sin(az), 0))
                side = d.cross(UP)
                curve = rng.uniform(-0.12, 0.12)
                pts = []
                M = 5
                for i in range(M + 1):
                    s = i / M
                    h = Lb * (self.rise * s * (1 - s) * 1.6 - self.sag * s ** 2.2)
                    p = base + d * (rt * 0.6 + Lb * s) + side * (curve * Lb * s * s) + UP * h
                    p.z = max(p.z, 1.0 + 0.3 * s)
                    pts.append(p)
                rb = clamp(0.045 + 0.042 * Lb, 0.05, 0.36) * (1.0 - 0.25 * u)
                rr = [max(0.025, rb * (1 - 0.82 * (i / M) ** 0.9)) for i in range(M + 1)]
                self.branches.append((pts, rr, ti))
                th = (self.th[0] + (self.th[1] - self.th[0]) * u) * rng.uniform(0.85, 1.15)

                def at(s):
                    x = s * M
                    i = min(M - 1, int(x))
                    return pts[i].lerp(pts[i + 1], x - i)

                # подушки на самой ветви: ближе к концу крупнее
                w = self.pad_w
                for s, kx, ky in ((0.22, 0.20, 0.17), (0.40, 0.17, 0.15), (0.60, 0.21, 0.19), (0.80, 0.22, 0.21), (1.0, 0.18, 0.17)):
                    if Lb < 2.0 and s < 0.6:
                        continue
                    if s < 0.4 and u < 0.45:
                        continue
                    rx = max(0.6, Lb * kx * w) * rng.uniform(0.85, 1.15)
                    ry = max(0.55, Lb * ky * w * 1.25) * rng.uniform(0.85, 1.15)
                    c = at(s) + UP * th * 0.28
                    self.pads.append(dict(c=c, u=d, rx=rx, ry=ry, th=th, droop=self.drape, pitch=self.pitch * s,
                                          seed=rng.randrange(1 << 30), br=len(self.branches) - 1, s=s))
                # боковые ветви веером в стороны — ширина яруса
                nl = self.laterals if Lb > 2.5 else 1
                for li in range(nl):
                    s = 0.32 + 0.52 * (li + 0.5) / nl + rng.uniform(-0.05, 0.05)
                    sg = 1 if li % 2 == 0 else -1
                    if rng.random() < 0.5:
                        sg = -sg
                    ang = sg * rng.uniform(0.75, 1.15)
                    dl = (d * math.cos(ang) + side * math.sin(ang))
                    ll = Lb * rng.uniform(0.28, 0.40) * (1 - 0.35 * s)
                    p0 = at(s)
                    lp = [p0 + dl * (ll * k / 2) + UP * (ll * (0.10 * k / 2 - self.sag * 0.5 * (k / 2) ** 2)) for k in range(3)]
                    for q in lp:
                        q.z = max(q.z, 1.1)
                    lr = [max(0.02, rr[int(s * M)] * 0.55 * (1 - 0.7 * k / 2)) for k in range(3)]
                    self.lats.append((lp, lr, ti))
                    rx = max(0.55, ll * 0.55 * w) * rng.uniform(0.85, 1.15)
                    ry = max(0.5, ll * 0.48 * w) * rng.uniform(0.85, 1.15)
                    self.pads.append(dict(c=lp[-1] - dl * rx * 0.25 + UP * th * 0.28, u=dl, rx=rx, ry=ry,
                                          th=th * 0.9, droop=self.drape, seed=rng.randrange(1 << 30), pitch=self.pitch * 0.7,
                                          br=len(self.branches) - 1, s=s))
        # подушки не уходят в землю: низ свисающего края не ниже 0.5 м
        for pd in self.pads:
            low = pd['c'].z - pd['th'] * (0.3 + pd['droop'] + 0.3) - pd.get('pitch', 0.0) * pd['rx'] * 1.1
            if low < 0.5:
                pd['c'] = pd['c'] + UP * (0.5 - low)
        # лидеры в верхней части кроны одеты мелкими подушками, чтобы не торчали голыми жердями
        for pts, rad, _ in self.L:
            z = max(pts[0].z, self.H * self.leader_from)
            while z < pts[-1].z - 0.8:
                p, _r = None, None
                for i in range(len(pts) - 1):
                    if pts[i].z <= z <= pts[i + 1].z:
                        t = (z - pts[i].z) / max(1e-6, pts[i + 1].z - pts[i].z)
                        p = pts[i].lerp(pts[i + 1], t)
                if p is not None:
                    a = rng.uniform(0, 6.28)
                    d = Vector((math.cos(a), math.sin(a), 0))
                    self.pads.append(dict(c=p + d * 0.45, u=d, rx=rng.uniform(1.0, 1.4), ry=rng.uniform(0.9, 1.2),
                                          th=self.th[1] * 0.9, droop=self.drape, seed=rng.randrange(1 << 30), br=-1, s=1))
                z += rng.uniform(1.0, 1.4)
        # макушка: несколько подушек вокруг вершин лидеров
        for pts, rad, _ in self.L:
            tp = pts[-1]
            for k in range(self.top_pads):
                a = rng.uniform(0, 6.28)
                d = Vector((math.cos(a), math.sin(a), 0))
                r = self.R(tp.z) * rng.uniform(0.3, 0.6)
                self.pads.append(dict(c=tp + d * r * 0.6 + UP * rng.uniform(-0.3, 0.4), u=d,
                                      rx=max(0.9, r), ry=max(0.8, r * 0.85), th=self.th[1] * 1.1,
                                      droop=self.drape * 0.8, seed=rng.randrange(1 << 30), br=-1, s=1))
            self.pads.append(dict(c=tp + UP * 0.25, u=Vector((1, 0, 0)), rx=1.1, ry=1.0, th=self.th[1] * 1.2,
                                  droop=self.drape, seed=rng.randrange(1 << 30), br=-1, s=1))

    # ---- цвет
    def leaf_col(self, p, top, t, tint):
        """top: 1 — верх подушки, −1 — дно, 0.5 — край; t — доля радиуса."""
        Rz = max(1.0, self.R(p.z))
        outer = clamp(Vector((p.x, p.y, 0)).length / Rz)
        h = clamp(p.z / self.H)
        l = 0.18 + 0.30 * outer + 0.22 * h + tint + 0.13 * noise.noise(p * 0.8 + Vector((3.1, 7.7, 1.3)))
        if top > 0.9:
            l += 0.22 - 0.08 * t
        elif top < 0:
            l -= 0.22
        else:
            l += 0.05
        l = clamp(l)
        if l < 0.55:
            c = mix(self.leaf_dark, self.leaf_mid, l / 0.55)
        else:
            c = mix(self.leaf_mid, self.leaf_top, (l - 0.55) / 0.45)
        return lin(c)

    def leaf_out(self, p, top):
        hc = self.H * 0.45
        Rm = max(x[1] for x in self.crown)
        o = Vector((p.x, p.y, (p.z - hc) * Rm / (self.H * 0.5)))
        if o.length < 1e-3:
            o = UP.copy()
        o.normalize()
        return (o + UP * 0.35 * top).normalized()

    def bark_col(self, p, a):
        n = fbm(Vector((math.cos(a) * 2.2, math.sin(a) * 2.2, p.z * 0.6)) + Vector((p.x, p.y, 0)) * 0.7, 2)
        t = clamp(0.5 + 0.55 * n)
        c = mix(self.bark[0], self.bark[1], t)
        if p.z < 0.6:
            c = mix(c, self.bark[0], 0.4 * (0.6 - p.z) / 1.1)
        return lin(c)

    # ---- сборка сеток
    def build(self, lod=False):
        Gb, Gl = Geo(), Geo()
        rng = random.Random(self.seed + (7 if lod else 0))
        # ствол и лидеры с корой: продольные борозды и корневые лапы
        for li, (pts, rad, side) in enumerate(self.L):
            sides = 5 if lod else 12
            ph = rng.uniform(0, 6.28)

            def rfn(i, a, p, ph=ph):
                k = 1.0
                if not lod:
                    k += 0.07 * noise.noise(Vector((math.cos(a) * 3.0, math.sin(a) * 3.0, p.z * 0.25 + ph)))
                    k += 0.04 * math.sin(a * 9 + p.z * 0.4 + ph)
                if p.z < 1.0 and li == 0:
                    lobe = max(0.0, math.cos(a * 5 + ph)) ** 2
                    k += (0.55 if not lod else 0.35) * lobe * ((1.0 - max(p.z, -0.3)) / 1.3) ** 2
                return k

            if lod:
                keep = [0, 2, 4, 6] + list(range(8, len(pts), 2)) if li == 0 else list(range(0, len(pts), 2))
                if keep[-1] != len(pts) - 1:
                    keep.append(len(pts) - 1)
                P = [pts[i] for i in keep]
                Rr = [rad[i] for i in keep]
            else:
                P, Rr = pts, rad
            tube(Gb, P, Rr, sides, self.bark_col, rfn, tip=True, phase=ph)
        # скелетные ветви
        for pts, rr, ti in self.branches:
            if lod:
                if ti > self.tiers * 0.25:
                    continue
                tube(Gb, [pts[0], pts[2], pts[4]], [rr[0], rr[2], rr[4]], 3, self.bark_col, tip=False)
            else:
                tube(Gb, pts, rr, 5, self.bark_col, tip=True)
        if not lod:
            for lp, lr, ti in self.lats:
                tube(Gb, lp, lr, 3, self.bark_col, tip=True)
        # хвоя
        if not lod:
            for pd in self.pads:
                tint = random.Random(pd['seed']).uniform(-0.07, 0.07)
                pad(Gl, pd['c'], pd['u'], pd['rx'], pd['ry'], pd['th'], pd['droop'], pd['seed'],
                    lambda q, top, t, tint=tint: self.leaf_col(q, top, t, tint),
                    lambda q, top: self.leaf_out(q, top), N=self.N, rings=(0.55,), pitch=pd.get('pitch', 0.0))
        else:
            # дальний уровень: подушки одной ветви сливаем в две крупные
            groups = {}
            for pd in self.pads:
                groups.setdefault(pd['br'], []).append(pd)
            for br, lst in groups.items():
                if br < 0:      # подушки лидеров и макушки — пачками по высоте
                    bins = {}
                    for p in lst:
                        bins.setdefault(int(p['c'].z // 3.0), []).append(p)
                    chunks = list(bins.values())
                else:
                    inner = [p for p in lst if p['s'] < 0.6]
                    outer = [p for p in lst if p['s'] >= 0.6]
                    chunks = [x for x in (inner, outer) if x]
                for ch in chunks:
                    c = sum((p['c'] for p in ch), Vector()) / len(ch)
                    u = ch[0]['u'] if br < 0 else Vector(self.branches[br][0][-1] - self.branches[br][0][0])
                    u = Vector((u.x, u.y, 0)).normalized()
                    v = UP.cross(u)
                    ex = max(abs((p['c'] - c).dot(u)) + p['rx'] * 0.95 for p in ch)
                    ey = max(abs((p['c'] - c).dot(v)) + p['ry'] * 0.95 for p in ch)
                    th = sum(p['th'] for p in ch) / len(ch) * 1.1
                    sd = ch[0]['seed']
                    tint = random.Random(sd).uniform(-0.05, 0.05)
                    pad(Gl, c, u, ex, ey, th, self.drape, sd,
                        lambda q, top, t, tint=tint: self.leaf_col(q, top, t, tint),
                        lambda q, top: self.leaf_out(q, top), N=7, rings=(0.55,), lod=True, pitch=self.pitch * 0.6)
        return Gb, Gl


# ------------------------------------------------------------------ Blender
def material(name, base, rough):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes.get('Principled BSDF')
    b.inputs['Roughness'].default_value = rough
    if 'Specular IOR Level' in b.inputs:
        b.inputs['Specular IOR Level'].default_value = 0.25
    ca = nt.nodes.new('ShaderNodeVertexColor')
    ca.layer_name = 'Color'
    mul = nt.nodes.new('ShaderNodeMix')
    mul.data_type = 'RGBA'
    mul.blend_type = 'MULTIPLY'
    mul.inputs['Factor'].default_value = 1.0
    mul.inputs[6].default_value = (*base, 1)
    nt.links.new(ca.outputs['Color'], mul.inputs[7])
    nt.links.new(mul.outputs[2], b.inputs['Base Color'])
    m.use_backface_culling = False
    return m


def to_object(G, name, mat, col, base, blend=0.5):
    me = bpy.data.meshes.new(name)
    me.from_pydata(G.v, [], G.f)
    me.update()
    me.materials.append(mat)
    at = me.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT')
    flat = []
    for c in G.c:
        flat += [min(1.0, c[0] / base[0]), min(1.0, c[1] / base[1]), min(1.0, c[2] / base[2]), 1.0]
    at.data.foreach_set('color', flat)
    me.color_attributes.active_color = at
    me.color_attributes.render_color_index = 0
    me.shade_smooth()
    ns = []
    for i, vx in enumerate(me.vertices):
        o = G.o[i]
        n = vx.normal.copy()
        if o is not None:
            n = (n * (1 - blend) + Vector(o) * blend)
            if n.length < 1e-4:
                n = Vector(o)
            n.normalize()
        ns.append(n)
    me.normals_split_custom_set_from_vertices(ns)
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    return ob


def export(tree, name, script, info):
    here = os.path.dirname(os.path.abspath(script))
    data = os.path.normpath(os.path.join(here, '..', '..', 'data', 'models'))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    leaf_base = lin(tree.leaf_top)
    bark_base = lin(tree.bark[1])
    res = {}
    for lod in (True, False):
        Gb, Gl = tree.build(lod)
        for c in list(bpy.data.collections):
            bpy.data.collections.remove(c)
        for o in list(bpy.data.objects):
            bpy.data.objects.remove(o)
        for m in list(bpy.data.materials):
            bpy.data.materials.remove(m)
        for m in list(bpy.data.meshes):
            bpy.data.meshes.remove(m)
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
        mb = material('bark', bark_base, 0.95)
        ml = material('leaf', leaf_base, 0.9)
        to_object(Gb, name + '_bark', mb, col, bark_base, blend=0.0)
        to_object(Gl, name + '_leaf', ml, col, leaf_base, blend=0.5)
        tris = Gb.tris() + Gl.tris()
        if not lod:
            xs = [v[0] for v in Gl.v]; ys = [v[1] for v in Gl.v]
            res['crown'] = round(((max(xs) - min(xs)) + (max(ys) - min(ys))) / 2, 1)
            res['h'] = round(max(v[2] for v in Gl.v), 1)
        res['lod' if lod else 'full'] = tris
        print(('ДАЛЬНИЙ' if lod else 'ПОДРОБНЫЙ'), 'кора', Gb.tris(), 'хвоя', Gl.tris(), 'всего', tris)
        if 'glb' in ARGS:
            os.makedirs(data, exist_ok=True)
            out = os.path.join(data, name + ('.lod.glb' if lod else '.glb'))
            kw = dict(filepath=out, export_format='GLB', export_apply=True, export_yup=True)
            try:
                bpy.ops.export_scene.gltf(**kw, export_vertex_color='ACTIVE')
            except TypeError:
                bpy.ops.export_scene.gltf(**kw, export_colors=True)
            print('GLB', out, os.path.getsize(out) // 1024, 'КБ')
    bpy.context.scene['origin'] = [info['x'], info['z']]
    os.makedirs(os.path.join(here, 'out'), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(here, name + '.blend'))
    pl = dict(name=info['name'], file=name + '.glb', x=info['x'], z=info['z'],
              tris=res['full'], trisLod=res['lod'], species=info['species'],
              h=res['h'], crown=res['crown'])
    with open(os.path.join(here, 'placement.json'), 'w') as f:
        json.dump(pl, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print('ТРЕУГОЛЬНИКОВ:', res['full'], '· дальний уровень:', res['lod'], '· высота', res['h'], '· крона', res['crown'])
