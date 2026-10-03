#!/bin/bash
# кадры для проверки: bash models/zd_vokzal/shots.sh [имена...]
cd "$(dirname "$0")/../.."
B=models/zd_vokzal/zd_vokzal.blend
R="blender -b $B --python models/render.py --"
O=models/zd_vokzal/out
# мировая точка (x,z) из (pu,pd): x = 306.7 + 0.147*pu*... см. NOTES
w() { python3 -c "
import sys
pu,pd,h=map(float,sys.argv[1:4])
ux,uz=0.147,-0.989; nx,nz=0.989,0.147
print('%.1f,%.1f,%.1f'%(306.7+ux*pu+nx*pd, 2400+uz*pu+nz*pd, h))" $1 $2 $3; }
case "$1" in
 east)  $R $O/front.png $(w -3 40 1.7) $(w -3 0 6.5) 28 1400 900 24 ;;
 corner) $R $O/corner.png $(w 70 25 3) $(w 25 -5 7) 28 1400 900 24 ;;
 corner2) $R $O/corner_s.png $(w -75 22 3) $(w -25 -5 7) 28 1400 900 24 ;;
 west)  $R $O/west.png $(w -3 -60 6) $(w -3 -19 6) 26 1400 900 24 ;;
 aerial) $R $O/aerial.png $(w -50 55 45) $(w 0 -5 5) 30 1400 900 24 ;;
 aerialw) $R $O/aerial_w.png $(w 60 -50 40) $(w 0 -5 5) 30 1400 900 24 ;;
 top) $R $O/top.png $(w 0 -2 160) $(w 0 -2 0) 35 900 1100 16 ;;
 tower) $R $O/tower.png $(w 55 12 8) $(w 38 -9 14) 45 1000 1100 24 ;;
esac
