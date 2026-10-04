# АЗС сети СНП — навес по панораме Яндекса (Городское шоссе, 2019): синий
# фриз (светлее сверху, тёмно-синяя кромка снизу), серебристые опоры, ТРК
# серебристые с синим цоколем. Стелу сети на панорамах не нашёл — синяя,
# по цвету фриза (догадка, см. refs/fuel_brands.md).
#   blender -b --python models/azs_snp/build.py -- glb
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from azs_kit import build

B1, B2 = (0.22, 0.36, 0.71), (0.05, 0.13, 0.34)
build('azs_snp', __file__, {
    'col': {
        'brand': (B1, 0.45), 'brand2': (B2, 0.5), 'logo_txt': ((0.97, 0.97, 0.96), 0.5),
        'clad': ((0.66, 0.66, 0.70), 0.35), 'pump2': ((0.18, 0.26, 0.48), 0.5),
        'shop_band': (B1, 0.45),
        'stela': (B1, 0.5), 'stela2': (B2, 0.5), 'stela_led': ((0.95, 0.95, 0.92), 0.4),
    },
    'fascia_text': [('СНП', 0.0)], 'fascia_size': 0.6, 'stripe': (0.0, 0.32),
    'stela': {'h': 6.0, 'w': 1.8, 'top_h': 1.4, 'top_text': 'СНП', 'top_text_size': 0.6,
              'rows': [('92', '53.50'), ('95', '57.30'), ('ДТ', '59.50')], 'row_h': 0.6},
})
