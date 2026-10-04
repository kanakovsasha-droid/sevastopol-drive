#!/bin/bash
# кадры для проверки: bash models/ddut/shots.sh [front se sea top nw ...]
cd "$(dirname "$0")/../.."
S=${SAMPLES:-14}
ARGS=("$@")
want() { [ ${#ARGS[@]} -eq 0 ] && return 0; for x in "${ARGS[@]}"; do [ "$x" = "$1" ] && return 0; done; return 1; }
sh() { models/ddut/shot.sh "$@"; }
want front && sh front 45,0,2.5 -3,0,9 28 1200 760 $S
want se    && sh se 40,-30,5 -20,5,8 26 1200 760 $S
want sea   && sh sea -95,0,6 -40,0,6 28 1200 760 $S
want top   && sh top -30,0,190 -30,0,0 30 1100 800 $S
want nw    && sh nw -45,-60,12 -25,-15,7 26 1200 760 $S
want seaq  && SEA=1 sh seaq -95,0,2 -40,0,4 28 1200 760 $S
want seaq2 && SEA=1 sh seaq2 -100,-40,1 -35,0,3 26 1200 760 $S
want portico && sh portico 24,-3,2.2 -2,0,9 30 1200 800 $S
want sw && sh sw -62,62,9 -32,10,6 26 1200 760 $S
want ne && sh ne 30,-60,10 -15,-5,8 26 1200 760 $S
want topc && sh topc -25,0,120 -25,0,0 40 1200 800 $S
want dbg && sh dbg -30,12,45 -35,6,10 40 1200 800 $S
