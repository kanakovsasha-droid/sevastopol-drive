#!/bin/bash
# кадры для проверки: bash models/kino_ukraina/shots.sh [имена...]
cd "$(dirname "$0")/../.."
B=models/kino_ukraina/kino_ukraina.blend
R=models/render.py
O=models/kino_ukraina/out
r() { blender -b $B --python $R -- $O/$1.png "$2" "$3" ${4:-24} ${5:-1200} ${6:-760} ${7:-20} >/dev/null 2>&1 && echo done $1; }
for n in "${@:-wfront wcorner efront ecorner top}"; do
 case $n in
  wfront) r wfront 119.5,1339.0,2.0 143.2,1347.8,6 24 ;;
  wcorner) r wcorner 126,1322,2.5 150,1348,6 24 ;;
  efront) r efront 218.3,1364.9,2.5 193.2,1357.8,6 24 ;;
  ecorner) r ecorner 215.6,1337.8,3 189.3,1357.0,6 24 ;;
  top) r top 114.8,1372.7,55 169.7,1353.1,3 24 ;;
  topne) r topne 215,1325,45 160,1352,4 26 ;;
  wdet) r wdet 128,1347,2.2 141,1347,7 30 ;;
  edet) r edet 208,1359,2.2 193,1358,7 30 ;;
 esac
done
