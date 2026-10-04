# АЗС сети ТЭС (TES) — по панорамам Яндекса (refs/fuel_brands.md):
# ул. Сеченова, 2019 и ул. Генерала Мельника, 2020.
# Фиолетовый фриз с белыми буквами «TES» и кругом-эмблемой, снизу — зелёная
# полоса-кромка; опоры белые с фиолетовой вставкой; ТРК зелёные с белым верхом;
# стела — высокий фиолетовый пилон со скруглённым верхом, зелёный короб с
# эмблемой, красные цифры цен и зелёная надпись TES внизу.
#   blender -b --python models/azs_tes/build.py -- glb
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from azs_kit import build

P, G, W = (0.29, 0.18, 0.55), (0.42, 0.70, 0.25), (0.96, 0.96, 0.95)
build('azs_tes', __file__, {
    'col': {
        'brand': (P, 0.5), 'brand2': (G, 0.5), 'logo_txt': (W, 0.5),
        'logo_a': (G, 0.5), 'logo_b': (W, 0.5),
        'clad2': (P, 0.5), 'pump': ((0.18, 0.60, 0.28), 0.4), 'pump2': (W, 0.5),
        'shop_band': (P, 0.5), 'shop_txt': (W, 0.5),
        'stela': (P, 0.5), 'stela2': (G, 0.5), 'stela_txt2': (G, 0.5),
        'stela_panel': ((0.06, 0.05, 0.12), 0.3), 'stela_led': ((1.00, 0.32, 0.10), 0.4),
        'stela_lab': (W, 0.5),
    },
    'fascia_text': [('TES', 1.2)], 'fascia_size': 0.70, 'fascia_logo': (-1.3, 0.36, 0, 0),
    'stripe': (0.0, 0.16), 'clad_band': (0.20, 1.30), 'shop_stripe': True,
    'stela': {'h': 7.6, 'w': 1.7, 'r': 0.55, 'top_h': 1.5, 'top_gap': 0.25, 'logo': (0.5, 0, 0), 'logo_at': 0.5,
              'rows': [('92', '53.50'), ('95', '57.30'), ('ДТ', '49.50'), ('ГАЗ', '27.90')], 'row_h': 0.55,
              'foot_text': 'TES', 'foot_z': 1.5, 'foot_size': 0.62},
})
