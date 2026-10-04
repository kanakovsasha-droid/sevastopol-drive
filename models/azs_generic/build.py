# АЗС без опознанной сети или сеть без фото: нейтральная — серый фриз без
# надписи (имя из OSM пишет fuel.js атласом), белые опоры, серебристые ТРК,
# серая стела с тёмными табло.
#   blender -b --python models/azs_generic/build.py -- glb
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from azs_kit import build

build('azs_generic', __file__, {
    'col': {},
    'fascia_text': [], 'shop_text': '',
    'stela': {'h': 5.6, 'w': 1.7, 'top_h': 1.3,
              'rows': [('92', '53.50'), ('95', '57.30'), ('ДТ', '59.50')], 'row_h': 0.58},
})
