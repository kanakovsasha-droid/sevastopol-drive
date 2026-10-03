#!/bin/bash
# кадры для проверки: bash models/termy_nautiko/shots.sh [имена...]
cd "$(dirname "$0")/../.."
B=models/termy_nautiko/termy_nautiko.blend
R="blender -b $B --python models/render.py --"
O=models/termy_nautiko/out
S="1200 760 16"
want="${@:-front corner_se side_w top}"
for n in $want; do case $n in
 front)    $R $O/front.png -1160.5,1461.0,1.8 -1186.3,1471.9,4.5 24 $S;;
 front_l)  $R $O/front_l.png -1165,1490,1.8 -1186.3,1471.9,4.5 24 $S;;
 corner_se) $R $O/corner_se.png -1150,1505,3 -1190,1465,5 24 $S;;
 side_w)   $R $O/side_w.png -1265,1450,2.5 -1215,1460,6 24 $S;;
 corner_nw) $R $O/corner_nw.png -1270,1415,4 -1215,1455,6 22 $S;;
 south)    $R $O/south.png -1195,1530,3 -1198,1492,5 24 $S;;
 top)      $R $O/top.png -1150,1520,60 -1205,1458,3 28 $S;;
 close)    $R $O/portico.png -1172,1478,2.5 -1186.3,1471.9,4.5 28 $S;;
esac; done
