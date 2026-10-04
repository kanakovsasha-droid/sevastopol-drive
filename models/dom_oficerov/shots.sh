#!/bin/bash
# кадры: bash models/dom_oficerov/shots.sh [имена...]
cd "$(dirname "$0")/../.."
B=models/dom_oficerov
pt() { python3 - "$1" "$2" <<'PY'
import sys
u,d=float(sys.argv[1]),float(sys.argv[2])
print("%.1f,%.1f"%(11.3+0.0470*u-0.99889*d, 263+0.99889*u+0.0470*d))
PY
}
shot() { n=$1; c=($2); l=($3)
  blender -b $B/dom_oficerov.blend --python models/render.py -- $B/out/$n.png $(pt ${c[0]} ${c[1]}),${c[2]} $(pt ${l[0]} ${l[1]}),${l[2]} $4 ${5:-1400} ${6:-900} ${7:-14} 2>&1 | grep -E "КАДР|Error|Traceback"; }
want="${@:-front photo corner east top entrance}"
for n in $want; do case $n in
 photo)    shot photo    "55 24 2.0"   "20 -4 8" 24 ;;
 front)    shot front    "30 40 2.0"   "30 0 9" 24 ;;
 corner)   shot corner   "70 30 8"    "28 -5 8" 24 ;;
 corner2)  shot corner2  "-12 22 6"    "28 -12 8" 24 ;;
 east)     shot east     "30 -75 12"   "30 -20 8" 28 ;;
 top)      shot top      "30 45 70"    "30 -8 4" 30 ;;
 entrance) shot entrance "31 14 1.7"   "31 0 4.5" 28 ;;
 fins)     shot fins     "22 16 5"     "33 0 11" 28 ;;
esac; done
