# Памятник святым Кириллу и Мефодию (двор Петропавловского собора), Севастополь.
#
#   blender -b --python models/kirill_mefodiy/build.py -- [glb]
#
# По фото Викисклада (refs/r20): две бронзовые фигуры с нимбами на глыбе розового гранита с бронзовой надписью
# «Первоучители словенские равноапостольные Кирилл и Мефодий, 861 г.». Кирилл (слева, ниже, в капюшоне)
# держит свиток, Мефодий (справа, выше, архиерей) — книгу.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from mon_kit import *

X0, Z0 = -14.2, 935.2
origin(X0, Z0)
set_rot(world_rot(-0.5, 0.87))
COL['wall3'] = ((0.15, 0.14, 0.12), 0.5)
COL['metal'] = ((0.16, 0.14, 0.10), 0.5)
COL['wall2'] = ((0.55, 0.38, 0.32), 0.6)       # розовый гранит
COL['stone'] = ((0.55, 0.54, 0.50), 0.9)
B = 'wall3'; G = 'wall2'
F0 = FR()

# глыба
import random
rnd = random.Random(9)
rings = []
for z, rx, ry in ((-0.3, 0.9, 1.7), (0.0, 1.0, 1.85), (0.45, 0.95, 1.8), (0.9, 0.85, 1.65), (1.2, 0.75, 1.5)):
    ph = rnd.random() * 5
    rings.append((Vector((0, 0, z)), rx, ry, (lambda p: (lambda t: 1 + 0.07 * math.sin(3 * t + p) + 0.04 * math.sin(6 * t)))(ph)))
skirt(G, rings, seg=14, caps=(False, True))
# надписи на лицевой стороне (бронза)
Fp = FR(0, 0, -90)
plate('metal', Fp, -1.1, 1.1, 0.88, 0.62, 0.82, lines=1, seed=1, pr=0.03)
plate('metal', Fp, -0.75, 0.75, 0.9, 0.34, 0.58, lines=1, seed=2, pr=0.03)
plate('metal', Fp, -0.3, 0.3, 0.9, 0.08, 0.28, lines=1, seed=3, pr=0.03)

def saint(cy, H, kind):
    z0 = 1.2
    fg = Fig(H, face=(1, 0, 0), bulk=1.25, seg=8)
    person(B, fg, pel=(0.0, cy, z0 + 0.52 * H), neck=(0.02, cy, z0 + 0.82 * H), head=(0.04, cy, z0 + 0.92 * H),
           shL=(0.0, cy + 0.27 * H / 2.7, z0 + 0.78 * H), shR=(0.0, cy - 0.27 * H / 2.7, z0 + 0.78 * H),
           haL=(0.26, cy + 0.13, z0 + 0.58 * H) if kind == 'meth' else (0.34, cy + 0.12, z0 + 0.60 * H),
           haR=(0.34, cy - 0.14, z0 + 0.56 * H),
           hipL=(0, cy + 0.1, z0 + 0.5 * H), hipR=(0, cy - 0.1, z0 + 0.5 * H),
           anL=(0, cy + 0.1, z0 + 0.05), anR=(0, cy - 0.1, z0 + 0.05),
           polesA=((0.5, 0, -1), (0.5, 0, -1)), polesL=((1, 0, 0), (1, 0, 0)),
           head_kind='bare', torso_w=1.35, head_r=1.05, arm_r=1.2, leg_r=0.5)
    # ряса
    skirt(B, [(Vector((0.0, cy, z0 + 0.62 * H)), 0.20 * H / 2.7, 0.27 * H / 2.7, None),
              (Vector((0.0, cy, z0 + 0.35 * H)), 0.27 * H / 2.7, 0.33 * H / 2.7, lambda t: 1 + 0.05 * math.sin(6 * t)),
              (Vector((0.0, cy, z0 + 0.0)), 0.32 * H / 2.7, 0.40 * H / 2.7, lambda t: 1 + 0.07 * math.sin(7 * t + 1))], seg=12, caps=(False, True))
    hz = z0 + 0.92 * H
    # нимб
    for k in range(18):
        a0 = 2 * math.pi * k / 18; a1 = 2 * math.pi * (k + 1) / 18
        p0 = P(0.04 - 0.05, cy + 0.34 * math.cos(a0), hz + 0.06 + 0.34 * math.sin(a0))
        p1 = P(0.04 - 0.05, cy + 0.34 * math.cos(a1), hz + 0.06 + 0.34 * math.sin(a1))
        beam('metal', p0, p1, 0.05)
    if kind == 'cyril':       # капюшон, свиток
        blob(B, Vector((-0.02, cy, hz + 0.02)), 0.17, 0.17, 0.2, seg=8, rings=4, bot=0.3)
        tube(B, [P(0.36, cy + 0.12, z0 + 0.35 * H), P(0.34, cy + 0.12, z0 + 0.7 * H)], [0.07, 0.07], 8)
    else:                     # Мефодий: книга
        box(B, FR(0, 0, 0), 0.20, 0.42, cy - 0.27, cy - 0.02, z0 + 0.54 * H, z0 + 0.66 * H + 0.12)
saint(-0.55, 2.55, 'cyril')
saint(0.62, 2.8, 'meth')
done('kirill_mefodiy', __file__, -14.2, 935.2, 'Памятник святым Кириллу и Мефодию')
