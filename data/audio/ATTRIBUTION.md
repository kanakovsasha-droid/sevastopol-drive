# Звуки машины

Все файлы в этой папке нарезаны скриптом `tools/build-audio.mjs` из превью
записей Freesound (mp3 128 кбит/с) и пересохранены в WAV 22 050 Гц моно:
петли сделаны бесшовными (хвост наложен на начало), громкость выровнена,
у разовых звуков — короткая атака и затухание. Других изменений нет.

| Файлы | Запись | Автор | Лицензия |
|---|---|---|---|
| `eng_idle`, `eng_low`, `eng_mid`, `eng_high`, `eng_hi2`, `eng_top` | [Muscle car sounds.mp3](https://freesound.org/s/332636/) | Superhollyward | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `pop_1` … `pop_6` | [Car Antilag (No cleanup, 32float)](https://freesound.org/s/797835/) | modusmogulus | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `bang_1`, `bang_3` | [S41-25 Car backfires; reverberant.wav](https://freesound.org/s/675723/) | craigsmith | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `bang_2` | [BACKFIRE.ogg](https://freesound.org/s/105351/) | CeebFrack | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `tyre_squeal` | [Chrysler LHS tire squeal 04 (04-25-2009).wav](https://freesound.org/s/71739/) | audible-edge | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

Записи именно E63 (M177) со свободной лицензией на Freesound не нашлось.
Петли мотора — басовитый V8 маслкара крупным планом: все шесть из одной
записи, чтобы тембр не прыгал между петлями. Обороты каждой петли (по частоте
вспышек, 4 на оборот) — в `sounds.json`; 983 … 6795 об/мин.

Записи с некоммерческими лицензиями (NC), без переработки (ND) и «все права
защищены» не брали: репозиторий публичный.
