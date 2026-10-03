# Кедр ливанский (Cedrus libani) на площади Лазарева, посажен в 1951 г.
# Сборка: blender -b --python models/cedar_lazarev/build.py -- glb
# Натура и выводы — NOTES.md рядом.
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from treegen import Cedar, export

tree = Cedar(
    seed=1951,
    H=21.0, z0=2.0, r0=0.62,
    fork=8.0, fork_spread=0.9,          # в верхней части кроны два лидера
    lean=(0.3, -0.2),
    # широкий низ, ярусы-«столы» до самого верха, плоская рваная макушка
    crown=[(0.0, 7.4), (0.18, 8.2), (0.40, 7.0), (0.62, 6.2), (0.80, 5.6), (0.92, 4.9), (1.0, 3.4)],
    rise=0.28, sag=0.10, drape=0.30,
    tiers=11, per=(6, 2), th=(1.15, 0.62), laterals=3, top_pads=2, tier_pow=1.15, pad_w=1.6, N=13, leader_from=0.42,
    leaf_dark=(0.05, 0.09, 0.06), leaf_mid=(0.14, 0.23, 0.15), leaf_top=(0.34, 0.44, 0.38),
    bark=((0.19, 0.16, 0.14), (0.47, 0.43, 0.39)),
)
export(tree, 'cedar_lazarev', __file__, dict(
    name='Кедр на площади Лазарева', x=-422.0, z=569.5,
    species='Cedrus libani (кедр ливанский)', crown=None))
