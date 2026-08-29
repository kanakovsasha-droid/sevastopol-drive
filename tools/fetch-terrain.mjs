import { writeFileSync, mkdirSync } from 'node:fs';
import { decodePNG } from './png.mjs';
import { BBOX, DEM_ZOOM } from './config.mjs';

const DIR = new URL('../data/', import.meta.url).pathname;
const TILE = 256;
const HEADERS = { 'User-Agent': 'sevastopol-game/0.1 (personal hobby project)' };

const lon2tx = (lon, z) => (lon + 180) / 360 * 2 ** z;
const lat2ty = (lat, z) => {
  const r = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z;
};

async function main() {
  mkdirSync(DIR, { recursive: true });
  const z = DEM_ZOOM;
  // +1 тайл запаса по краям, чтобы билинейная выборка не упиралась в границу
  const x0 = Math.floor(lon2tx(BBOX.west, z)) - 1;
  const x1 = Math.floor(lon2tx(BBOX.east, z)) + 1;
  const y0 = Math.floor(lat2ty(BBOX.north, z)) - 1;
  const y1 = Math.floor(lat2ty(BBOX.south, z)) + 1;
  const nx = x1 - x0 + 1, ny = y1 - y0 + 1;
  const W = nx * TILE, H = ny * TILE;
  console.log(`тайлов ${nx}x${ny} на зуме ${z} → сетка ${W}x${H}`);

  const heights = new Float32Array(W * H);
  let ok = 0;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${tx}/${ty}.png`;
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`тайл ${z}/${tx}/${ty}: HTTP ${res.status}`);
      const img = decodePNG(Buffer.from(await res.arrayBuffer()));
      const c = img.channels;
      const ox = (tx - x0) * TILE, oy = (ty - y0) * TILE;
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const p = (y * TILE + x) * c;
          const v = img.data[p] * 256 + img.data[p + 1] + img.data[p + 2] / 256 - 32768;
          heights[(oy + y) * W + (ox + x)] = v;
        }
      }
      ok++;
    }
  }

  let min = Infinity, max = -Infinity, land = 0;
  for (const v of heights) { if (v < min) min = v; if (v > max) max = v; if (v > 0.5) land++; }

  writeFileSync(DIR + 'terrain.bin', Buffer.from(heights.buffer));
  writeFileSync(DIR + 'terrain.json', JSON.stringify({
    zoom: z, tileX0: x0, tileY0: y0, tileSize: TILE, width: W, height: H,
    min, max,
  }, null, 2));
  console.log(`скачано тайлов ${ok}; высоты от ${min.toFixed(1)} до ${max.toFixed(1)} м; суши ${(100 * land / heights.length).toFixed(0)}%`);
}
main();
