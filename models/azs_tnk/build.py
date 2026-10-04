# АЗС сети ТНК — по панораме Яндекса (ул. Вакуленчука, 2020): синий фриз,
# красные опоры, красная полоса павильона. Стелу и ТРК на панораме не
# разглядеть — стела синяя с красным коробом (догадка), ТРК серебристые.
#   blender -b --python models/azs_tnk/build.py -- glb
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from azs_kit import build

B, R = (0.10, 0.25, 0.53), (0.72, 0.16, 0.20)
build('azs_tnk', __file__, {
    'col': {
        'brand': (B, 0.45), 'logo_txt': ((0.97, 0.97, 0.96), 0.5),
        'clad': (R, 0.45), 'pump2': (R, 0.5), 'shop_band': (R, 0.5),
        'stela': (B, 0.5), 'stela2': (R, 0.5), 'stela_led': ((1.00, 0.32, 0.10), 0.4),
    },
    'fascia_text': [('ТНК', 0.0)], 'fascia_size': 0.62,
    'stela': {'h': 6.0, 'w': 1.8, 'top_h': 1.4, 'top_text': 'ТНК', 'top_text_size': 0.6,
              'rows': [('92', '53.50'), ('95', '57.30'), ('ДТ', '59.50')], 'row_h': 0.6},
})
