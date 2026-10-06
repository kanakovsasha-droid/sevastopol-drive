# Сквер на склоне у Библиотеки им. Толстого: запись sq-tolstoy в data/squares.json.
#
# Владелец (скрины у (−1, 1619) и (−34, 1687)): «жёсткий голый обрыв земли до
# дороги — там должен быть парк». Склон от библиотеки w91447927 и тротуара
# ул. Ленина вниз к Красному спуску в OSM не имеет контура зелени — только
# дорожки и лестницы (w437360006, w437360263, w437360356, w608441220,
# w608441371, w107597019) и туалет w884467667, то есть это благоустроенный
# склон. Контур собираем из соседних данных:
#   * грубая рамка участка (между ул. Ленина, Красным спуском, домами
#     Ленина 47 / Пушкина 22 и пл. Ушакова) — её вершины лежат ЗА кромками
#     улиц, так что настоящие края дают вычитания ниже;
#   * минус полотно улиц с тротуаром (c ≤ 2: полуширина + 3.5 м; проезды
#     c = 3: + 1 м), минус дома OSM с отступом 2 м, минус зелень OSM (парк
#     w238838388) с отступом 1 м;
#   * берём кусок, где лежит середина склона (20, 1665), и упрощаем до 0.5 м.
# Дорожки внутри — OSM, их рисует сборщик дорог, props.js по ним не сажает.
#
#   /usr/bin/python3 tools/tolstoy-slope.py [--dry]      (нужен shapely)

import json, sys, os
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union

ROOT = os.path.join(os.path.dirname(__file__), '..')
DRY = '--dry' in sys.argv

FRAME = [(-22, 1598), (40, 1572), (125, 1600), (60, 1790), (-25, 1790), (-45, 1700), (-50, 1655)]
SEED = (20, 1665)

w = json.load(open(os.path.join(ROOT, 'data/world.json')))
frame = Polygon(FRAME)
box = frame.buffer(40)

def poly(q):
    return Polygon([(q[i], q[i + 1]) for i in range(0, len(q), 2)])

cut = []
for r in w['roads']:
    q = r['pts']
    ln = LineString([(q[i], q[i + 1]) for i in range(0, len(q), 2)])
    if not ln.intersects(box):
        continue
    c, hw = r.get('c', 9), r.get('w', 6) / 2
    if c <= 2:
        cut.append(ln.buffer(hw + 3.5))
    elif c == 3:
        cut.append(ln.buffer(hw + 1))
for b in w['buildings']:
    p = poly(b['poly'])
    if p.is_valid and p.intersects(box):
        cut.append(p.buffer(2))
for g in w['green']:
    p = poly(g['poly'])
    if p.is_valid and p.intersects(box):
        cut.append(p.buffer(1))

area = frame.difference(unary_union(cut))
parts = list(area.geoms) if hasattr(area, 'geoms') else [area]
part = next(p for p in parts if p.contains(Point(SEED)))
part = part.simplify(0.5).buffer(0)
if hasattr(part, 'geoms'):
    part = max(part.geoms, key=lambda p: p.area)
ring = list(part.exterior.coords)[:-1]
out = [round(v, 1) for xy in ring for v in xy]
print(f'sq-tolstoy: {len(ring)} вершин, {part.area:.0f} м²', file=sys.stderr)

rec = {
    'id': 'sq-tolstoy',
    'name': 'Склон-сквер у Библиотеки им. Толстого (пл. Ушакова — Красный спуск)',
    'kind': 'park',
    'dens': 320,                # м² на дерево (у парка 130): ≤ +5% треугольников
    'poly': out,
    'source': 'своего контура в OSM нет; на склоне от библиотеки w91447927 и ул. Ленина к Красному спуску '
              'в OSM только дорожки и лестницы (w437360006, w437360263, w437360356, w608441220, w608441371, '
              'w107597019) и туалет w884467667 — благоустроенный склон. Контур — tools/tolstoy-slope.py: '
              'рамка участка минус улицы с тротуарами, дома OSM (2 м) и парк w238838388 (1 м). '
              'Что там парк — со слов владельца (п. 37 CLOUD.md).',
    'checked': '2026-10-06',
}
if DRY:
    print(json.dumps(rec, ensure_ascii=False))
    sys.exit(0)
path = os.path.join(ROOT, 'data/squares.json')
sq = json.load(open(path))
sq = [s for s in sq if s['id'] != rec['id']] + [rec]
json.dump(sq, open(path, 'w'), ensure_ascii=False, indent=1)
open(path, 'a').write('\n')
