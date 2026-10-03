#!/bin/bash
# кадры для проверки: bash models/bank_rossiya/shots.sh [имена...]
cd "$(dirname "$0")/../.."
B=models/bank_rossiya/bank_rossiya.blend
R=models/render.py
O=models/bank_rossiya/out
r() { blender -b $B --python $R -- $O/$1.png "$2" "$3" ${4:-24} ${5:-1200} ${6:-760} ${7:-10} >/dev/null 2>&1 && echo done $1; }
for n in "${@:-front corner top}"; do
 case $n in
  front) r front 25,468,1.7 39,493,6 24 ;;
  frontfar) r frontfar 14,455,1.7 40,494,6 22 ;;
  portico) r portico 33,482,1.7 39.3,493.5,5.5 32 ;;
  corner) r corner 62,478,1.7 50,495,5 24 ;;
  nearm) r nearm 100,500,1.7 62,500,5 24 ;;
  west) r west 8,520,1.7 32,508,5 24 ;;
  top) r top 20,440,60 52,505,6 26 ;;
  court) r court 38,540,5 55,505,6 24 ;;
  sign) r sign 28,478,6 39,494,11.5 40 ;;
  se) r se 95,530,6 60,505,5 24 ;;
 esac
done
