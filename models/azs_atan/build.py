# АЗС сети АТАН — по панорамам Яндекса (refs/fuel_brands.md):
# ул. Борисова, 2019 (ATAN Россия №84) и пл. Ревякина, 2020 (№88).
# Навес с жёлтым фризом и зелёными буквами «ATAN» дважды на сторону, жёлтая
# арка-навершие; опоры белые; стела — жёлтый короб с зелёным кругом-логотипом
# и надписью ATAN, ниже белое тело с тёмно-зелёными табло и зелёными цифрами.
#   blender -b --python models/azs_atan/build.py -- glb
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from azs_kit import build

Y, G = (0.95, 0.77, 0.10), (0.00, 0.50, 0.24)
build('azs_atan', __file__, {
    'col': {
        'brand': (Y, 0.55), 'brand2': (G, 0.5), 'logo_txt': (G, 0.5),
        'logo_a': (G, 0.5), 'logo_b': (Y, 0.5),
        'pump2': (Y, 0.5), 'shop_band': (Y, 0.55), 'shop_txt': (G, 0.5),
        'stela': ((0.93, 0.93, 0.91), 0.6), 'stela2': (Y, 0.55), 'stela_txt': (G, 0.5),
        'stela_panel': ((0.04, 0.10, 0.06), 0.3), 'stela_led': ((0.40, 1.00, 0.50), 0.4),
        'stela_lab': ((0.40, 1.00, 0.50), 0.5),
    },
    'fascia_text': [('ATAN', -3.6), ('ATAN', 3.6)], 'fascia_size': 0.66,
    'arch': (-5.2, 2.9, 0.6),
    'stela': {'h': 6.2, 'w': 1.9, 'top_h': 2.1, 'logo': (0.62, 0, 0), 'logo_tri': True, 'logo_at': 0.6,
              'top_text': 'ATAN', 'top_text_size': 0.36,
              'rows': [('92', '53.50'), ('95', '57.30'), ('ДТ', '59.50')], 'row_h': 0.6},
})
