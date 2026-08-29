// Севастополь, центр: Артбухта — Нахимова — Большая Морская — Малахов курган,
// вокзал на юге, кусок Северной стороны через бухту.
export const BBOX = {
  south: 44.5875,
  west:  33.4985,
  north: 44.6325,
  east:  33.5615,
};

// Точка отсчёта локальных координат (метры) — площадь Нахимова.
export const ORIGIN = { lat: 44.6166, lon: 33.5254 };

// Зум тайлов высот. z14 при lat 44.6 ≈ 6.8 м/пиксель.
// Исходник (Copernicus/SRTM) ~30 м, так что это уже с запасом.
export const DEM_ZOOM = 14;

export const R_EARTH = 6378137;

// Локальная проекция: равнопромежуточная относительно ORIGIN.
// На 5 км искажение пренебрежимо (<1 м), зато метры честные и обратимые.
const M_PER_DEG_LAT = 111132.92 - 559.82 * Math.cos(2 * ORIGIN.lat * Math.PI / 180)
                    + 1.175 * Math.cos(4 * ORIGIN.lat * Math.PI / 180);
const M_PER_DEG_LON = 111412.84 * Math.cos(ORIGIN.lat * Math.PI / 180)
                    - 93.5 * Math.cos(3 * ORIGIN.lat * Math.PI / 180);

export function project(lat, lon) {
  return {
    x: (lon - ORIGIN.lon) * M_PER_DEG_LON,   // восток +
    z: -(lat - ORIGIN.lat) * M_PER_DEG_LAT,  // север = -Z (правая система Three.js)
  };
}
export const SCALE = { mPerDegLat: M_PER_DEG_LAT, mPerDegLon: M_PER_DEG_LON };
