# Mercedes-Benz E-Class (W212)

3D-модель: «Mercedes-Benz E-Class (W212)» — автор Savelliy 07,
https://sketchfab.com/3d-models/mercedes-benz-e-class-w212-9b70707fd2304f578175158564719c5d
Лицензия: Creative Commons Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/).

Это обычный E-класс W212, не AMG: свободной модели E63 W212 нет. В игре под
ней — параметры E63 AMG W212 2011–2013 (M157 5.5 V8 битурбо, 525 л.с.).

Изменения: переведена в метры по колёсной базе 2.874 м, развёрнута носом в +Z
игры, ноль — на земле между осями; колёса выделены в отдельные узлы
wheel_FL/FR/RL/RR, задвоенные в исходнике задние колёса убраны, сетка
прорежена с 205 до 77 тыс. треугольников; материалы сведены к одному
Principled BSDF (в исходнике активный выход шёл через Diffuse — glTF это не
читает), кузов перекрашен в серебро (`models/w212/prep.py`). Файл в игре —
`data/models/w212.glb`.
