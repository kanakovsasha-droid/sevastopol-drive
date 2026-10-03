#!/bin/bash
# кадры для проверки: bash models/biblio_tolstogo/shots.sh
cd "$(dirname "$0")/../.."
B=models/biblio_tolstogo
R="blender -b $B/biblio_tolstogo.blend --python models/render.py --"
# мир: центр полуротонды (-24.7, 1667), ось крыла на СВ (0.635, -0.772), фронт на ЮЗ (-0.635, 0.772)
$R $B/out/front.png -42,1688,1.7 -26,1668,6 24 1400 880 24 &
$R $B/out/corner.png -52,1668,3.2 -22,1658,6 24 1400 880 24 &
$R $B/out/top.png -45,1700,48 -18,1655,5 28 1400 880 24 &
$R $B/out/wing.png -52,1648,2 -22,1650,6 24 1400 880 24 &
$R $B/out/detail.png -32,1678,3 -25,1668,7.5 40 1400 880 24 &
$R $B/out/cmp.png -44,1686,1.7 -22,1660,6 21 1400 880 24 &
$R $B/out/ne.png 16,1673,2.5 -8,1648,5 24 1400 880 24 &
$R $B/out/ne2.png 12,1625,6 -10,1650,5 24 1400 880 24 &
$R $B/out/piers.png -36,1681,2.2 -28,1670,3.5 32 1400 880 24 &
wait
