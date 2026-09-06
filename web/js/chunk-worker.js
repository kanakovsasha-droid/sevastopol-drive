// Качалка чанков. Живёт в отдельном потоке ровно ради одной строчки —
// response.json(). Разбор 300-килобайтного чанка стоит 20–60 мс, и в главном
// потоке это гарантированный пропуск кадров ровно в тот момент, когда игрок
// въезжает в новый квартал. Здесь же он никому не мешает.
self.onmessage = async e => {
  const { key, url } = e.data;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    self.postMessage({ key, data });
  } catch (err) {
    self.postMessage({ key, error: String(err && err.message || err) });
  }
};
