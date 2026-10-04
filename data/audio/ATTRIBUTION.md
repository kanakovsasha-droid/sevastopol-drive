# Звуки машины

Все файлы в этой папке нарезаны скриптом `tools/build-audio.mjs` из превью
записей Freesound (mp3, их Freesound отдаёт без входа; оригиналы WAV качаются
только с аккаунтом) и пересохранены в WAV 22 050 Гц моно. Петли мотора
выпрямлены по высоте (запись читается с переменной скоростью, чтобы обороты
в петле были постоянными) и сделаны бесшовными (хвост наложен на начало),
громкость выровнена; у разовых звуков — короткая атака и затухание. Других
изменений нет.

| Файлы | Запись | Автор | Лицензия |
|---|---|---|---|
| `v8_idle` (холостые) | [mustang 1.wav](https://freesound.org/s/205504/) | [VacekH](https://freesound.org/people/VacekH/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `v8_pool` (пул ровной езды для зёрен) | [mustang 9.wav](https://freesound.org/s/205511/), [mustang 10.wav](https://freesound.org/s/205503/) | [VacekH](https://freesound.org/people/VacekH/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `pop_1` … `pop_6` | [Car Antilag (No cleanup, 32float)](https://freesound.org/s/797835/) | modusmogulus | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `bang_1`, `bang_3` | [S41-25 Car backfires; reverberant.wav](https://freesound.org/s/675723/) | craigsmith | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `bang_2` | [BACKFIRE.ogg](https://freesound.org/s/105351/) | CeebFrack | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `starter` (стартер, прокрутка до схватывания) | [Starting of Ford V8 5 Liter engine](https://freesound.org/s/455925/) | [noiseloop](https://freesound.org/people/noiseloop/) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `tyre_squeal` | [Chrysler LHS tire squeal 04 (04-25-2009).wav](https://freesound.org/s/71739/) | audible-edge | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

Мотор — Ford Mustang Shelby GT500 (V8), записи VacekH (Roland R4 PRO,
Sennheiser MKH60), всё от одной машины. Ход звучит не петлёй, а зёрнами по
~0.1 с из случайных мест пула `v8_pool`: четыре ровных участка езды,
выпрямленных к одной высоте и выровненных по тембру (разметка — в
`sounds.json` → `pools`). Запуска мотора в этом
наборе нет, поэтому стартер взят из записи Ford 5.0 V8 (noiseloop, CC BY 3.0 —
с указанием автора, как здесь); схватывание и рык после него играют петли
Mustang. Записи именно E63 (M177) со
свободной лицензией на Freesound не нашлось. Обороты каждой петли (по частоте
вспышек, 4 на оборот) — в `sounds.json`.

Отстрелы на сбросе газа у открытого звука — не отдельные записи, а короткие
всплески той же петли мотора под узким ФНЧ плюс треск из шума
(`web/js/engine-audio.js`, `_overrun`). `pop_*`/`bang_*` остались запасными
для синтеза.

Записи с некоммерческими лицензиями (NC), без переработки (ND) и «все права
защищены» не брали: репозиторий публичный.
