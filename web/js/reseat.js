// Пересадка мебели квартала, когда достроится соседний квадрат земли.
//
// Мебель квартала лежит с запасом за его край (точки — до 64 м, заборы —
// целыми линиями), а сетка земли у каждого квадрата своя. Квартал ждёт только
// СВОЮ землю (chunkTerrainReady), и всё, что стояло за швом, садилось по сырому
// DEM (terrain.fallbackHeight): у пл. Нахимова на шве z = 0 павильон остановки
// «Площадь Нахимова» и знак висели на 1,6 м над тротуаром, киоск у (−43, −47)
// тонул на 1,8 м, забор у Графской висел. Ждать соседей квартал не может —
// на старте это восемь квадратов земли до первой улицы под машиной. Поэтому
// строим сразу, а мебель, задевшую недостроенную землю, пересобираем, как
// только та приедет: сборка мебели детерминирована, меняются только высоты.

const waiting = new Set();   // { obj, keys, rebuild }

// obj.userData.missing — ключи квадратов земли, которых не было при сборке
// (их собирает buildFurniture). rebuild() → новая группа на замену obj.
export function waitGround(obj, rebuild) {
  const keys = obj.userData.missing;
  if (keys && keys.length) waiting.add({ obj, keys, rebuild });
}

// Зовётся, когда квадрат земли key собран (terrain.setSurface уже был).
// dispose(old) — выгрузка старой группы (геометрии и материалы — в мусор).
export function groundReady(key, dispose) {
  for (const w of waiting) {
    const host = w.obj.parent;
    // квартал выгружен (или уже пересобран) — ждать нечего
    if (!host || !host.parent) { waiting.delete(w); continue; }
    if (!w.keys.includes(key)) continue;
    waiting.delete(w);
    const fresh = w.rebuild();
    fresh.visible = w.obj.visible;
    host.add(fresh);
    host.remove(w.obj);
    dispose(w.obj);
    // угол квартала задевает до трёх соседей: кто ещё не приехал — ждём дальше
    waitGround(fresh, w.rebuild);
  }
}

export const reseatPending = () => waiting.size;
