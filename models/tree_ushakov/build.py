# Кедр гималайский (Cedrus deodara) в центре кругового движения на площади Ушакова.
# Сборка: blender -b --python models/tree_ushakov/build.py -- glb
# Генератор общий с кедром на площади Лазарева: models/cedar_lazarev/treegen.py.
# Натура и выводы — NOTES.md рядом.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'cedar_lazarev'))
from treegen import Cedar, export

tree = Cedar(
    seed=1954,
    H=18.0, z0=2.0, r0=0.50,
    fork=None, lean=(0.25, 0.15),
    # конус с притуплённой верхушкой, нижние ветви метут почти до земли
    crown=[(0.0, 7.0), (0.15, 7.3), (0.40, 6.5), (0.65, 5.2), (0.85, 3.6), (1.0, 1.3)],
    rise=0.20, sag=0.30, drape=0.6, pitch=0.28,     # концы ветвей свисают — главный признак деодара
    tiers=11, per=(5, 3), th=(1.0, 0.7), laterals=3, top_pads=2, pad_w=1.5, N=14,
    leaf_dark=(0.05, 0.09, 0.06), leaf_mid=(0.15, 0.24, 0.17), leaf_top=(0.33, 0.43, 0.37),
    bark=((0.18, 0.16, 0.15), (0.44, 0.41, 0.38)),
)
export(tree, 'tree_ushakov', __file__, dict(
    name='Кедр на площади Ушакова', x=-105.0, z=1682.0,
    species='Cedrus deodara (кедр гималайский)', crown=None))
