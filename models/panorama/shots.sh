#!/bin/bash
# кадры для проверки: bash models/panorama/shots.sh [front corner_s corner_n top rear detail]
cd "$(dirname "$0")/../.."
S=${SAMPLES:-12}
B() { blender -b models/panorama/panorama.blend --python models/render.py -- "$@" 2>&1 | tail -1; }
want() { [ $# -eq 0 ] && return 0; for x in "${ARGS[@]}"; do [ "$x" = "$NAME" ] && return 0; done; return 1; }
ARGS=("$@")
NAME=front;    want && B models/panorama/out/front.png -240,2347,1.7 -170,2347,9 36 1200 760 $S
NAME=corner_s; want && B models/panorama/out/corner_s.png -215,2372,2.0 -172,2342,8 28 1200 760 $S
NAME=corner_n; want && B models/panorama/out/corner_n.png -215,2322,2.0 -172,2352,8 28 1200 760 $S
NAME=top;      want && B models/panorama/out/top.png -120,2420,70 -163,2346,10 30 1200 760 $S
NAME=rear;     want && B models/panorama/out/rear.png -110,2347,2.0 -163,2347,10 28 1200 760 $S
NAME=detail;   want && B models/panorama/out/detail.png -200,2355,2.0 -186,2346,5 40 1200 760 $S
