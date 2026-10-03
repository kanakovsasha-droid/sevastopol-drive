#!/bin/bash
# кадры для проверки: bash models/matrosskiy_klub/shots.sh [имена...]
cd "$(dirname "$0")/../.."
B=models/matrosskiy_klub
pt() { python3 - "$1" "$2" <<'PY'
import sys,math
P0=(-97.8,1789.9);P14=(-109.5,1849.9);l=math.hypot(P14[0]-P0[0],P14[1]-P0[1]);A=((P14[0]-P0[0])/l,(P14[1]-P0[1])/l);E=(A[1],-A[0])
s,t=float(sys.argv[1]),float(sys.argv[2]);print("%.1f,%.1f"%(P0[0]+A[0]*s+E[0]*t,P0[1]+A[1]*s+E[1]*t))
PY
}
shot() { # имя  cam(s,t,h)  look(s,t,h)  lens [W H S]
  n=$1; c=($2); l=($3)
  cp=$(pt ${c[0]} ${c[1]}); lp=$(pt ${l[0]} ${l[1]})
  blender -b $B/matrosskiy_klub.blend --python models/render.py -- $B/out/$n.png $cp,${c[2]} $lp,${l[2]} $4 ${5:-1100} ${6:-740} ${7:-16} 2>&1 | grep -E "КАДР|Error|Traceback"
}
want="${@:-front corner east top tower}"
for n in $want; do case $n in
 front)  shot front  "-34 12 2.0"  "0 12 11" 24 ;;
 front2) shot front2 "-38 -6 3"   "0 8 11" 24 ;;
 corner) shot corner "-26 -22 3" "10 14 11" 24 ;;
 east)   shot east   "14 70 3"   "14 24 13" 24 ;;
 east2)  shot east2  "30 62 8"   "30 24 18" 30 ;;
 top)    shot top    "30 -50 70"   "30 22 8" 28 ;;
 tower)  shot tower  "6 62 20"   "31 28 33" 40 ;;
 rot)    shot rot    "70 60 6"   "48 33 9" 26 ;;
 west)   shot west   "12 -42 3"  "14 0 11" 26 ;;
 far)    shot far    "60 120 22"  "28 20 24" 30 ;;
esac; done
