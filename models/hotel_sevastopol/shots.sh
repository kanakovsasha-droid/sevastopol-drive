#!/bin/bash
# кадры для проверки: bash models/hotel_sevastopol/shots.sh [имена...]
cd "$(dirname "$0")/../.."
B=models/hotel_sevastopol/hotel_sevastopol.blend
R=models/render.py
O=models/hotel_sevastopol/out
r() { blender -b $B --python $R -- $O/$1.png "$2" "$3" ${4:-24} ${5:-1200} ${6:-760} ${7:-14} >/dev/null 2>&1 && echo done $1; }
for n in "${@:-front corner top}"; do
 case $n in
  front) r front -312,425,2 -341,395,8 24 ;;
  corner) r corner -300,380,3 -345,395,8 22 ;;
  top) r top -300,470,60 -365,395,6 26 ;;
  portico) r portico -321,411,3 -341,394,9 30 ;;
  colon) r colon -316,370,3 -331,376,8 30 ;;
  back) r back -460,330,40 -380,375,6 26 ;;
  avenue) r avenue -356,438,3 -335,392,8 24 ;;
  sw) r sw -420,470,3 -378,405,7 26 ;;
 esac
done
