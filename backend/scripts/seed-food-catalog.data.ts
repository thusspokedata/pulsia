// Catálogo BASE de ingredientes canónicos, tomado de las listas del plan de alimentación por
// intercambios (imágenes del onboarding: Proteínas, Carbohidratos, Grasas, Verdura, Fruta).
//
// Cada ítem se mapea a una fila CONCRETA de la copia local de USDA (`usda_food`) por su `fdcId`,
// elegida a mano prefiriendo `foundation` > `sr_legacy` > `survey` en la forma cruda/simple del
// alimento (ver spec 2026-08-07-seed-catalogo-base-usda-design.md). El seed
// (`seed-food-catalog.ts`) arma cada alimento ENTERO desde esa fila (macros + micros) y lo inserta
// bajo el dueño del catálogo compartido, salteando los que ya existen por nombre.
//
// NO están las 4 líneas combinadas de lácteos ("Leche desnatada + 1 yogur 0 %", etc.): el alcance
// es "solo ingredientes simples". Tampoco los ya presentes en el catálogo con otro nombre
// (Almendra, Nueces, Coliflor, Sandía, Hummus, Miel, Zanahoria, Aceitunas verdes, Uvas verdes,
// Diente de ajo, Manteca de maní, Manteca, Banana↔Plátano, Manzana roja, Claras de huevo, Huevo…).
//
// `unitWeightG` queda en null a propósito: el plan es por raciones/gramos, no por unidad, y no
// queremos inventar pesos medios por pieza. La app permite loguear en gramos.
//
// `basis` es "per_100g" para todos (los aceites también: USDA reporta el aceite por 100 g).

import type { FoodBasis } from "@pulsia/shared";

export interface SeedFood {
  /** Nombre en español, tal como aparece en el catálogo. */
  name: string;
  basis: FoodBasis;
  unitWeightG: number | null;
  /** Fila de `usda_food` elegida a mano (macros + micros salen de acá). */
  fdcId: number;
  /** Descripción USDA de esa fila, para revisar el mapeo de un vistazo (no se persiste). */
  usda: string;
}

export const SEED_FOODS: SeedFood[] = [
  // ---------------------------------------------------------------------- PROTEÍNAS
  { name: "Pollo", basis: "per_100g", unitWeightG: null, fdcId: 171052, usda: "Chicken, broilers or fryers, meat only, raw" },
  { name: "Pavo", basis: "per_100g", unitWeightG: null, fdcId: 171098, usda: "Turkey, whole, breast, meat only, raw" },
  { name: "Conejo", basis: "per_100g", unitWeightG: null, fdcId: 174347, usda: "Game meat, rabbit, wild, raw" },
  // USDA no tiene merluza/hake: whiting es otro gádido blanco magro, nutricionalmente casi idéntico (proxy).
  { name: "Merluza", basis: "per_100g", unitWeightG: null, fdcId: 173713, usda: "Fish, whiting, mixed species, raw (proxy de merluza)" },
  { name: "Bacalao", basis: "per_100g", unitWeightG: null, fdcId: 2684444, usda: "Fish, cod, Atlantic, wild caught, raw" },
  { name: "Sepia", basis: "per_100g", unitWeightG: null, fdcId: 174215, usda: "Mollusks, cuttlefish, mixed species, raw" },
  { name: "Tilapia", basis: "per_100g", unitWeightG: null, fdcId: 2684442, usda: "Fish, tilapia, farm raised, raw" },
  { name: "Calamar", basis: "per_100g", unitWeightG: null, fdcId: 174223, usda: "Mollusks, squid, mixed species, raw" },
  // USDA no tiene dorada (sea bream/gilthead): sea bass es el pescado marino magro más cercano (proxy).
  { name: "Dorada", basis: "per_100g", unitWeightG: null, fdcId: 175142, usda: "Fish, sea bass, mixed species, raw (proxy de dorada)" },
  { name: "Fiambre de pavo/pollo", basis: "per_100g", unitWeightG: null, fdcId: 172941, usda: "Turkey breast, sliced, prepackaged" },
  { name: "Proteína en polvo", basis: "per_100g", unitWeightG: null, fdcId: 173180, usda: "Beverages, Protein powder whey based" },
  { name: "Queso fresco batido light", basis: "per_100g", unitWeightG: null, fdcId: 173417, usda: "Cheese, cottage, lowfat, 1% milkfat" },
  { name: "Seitán", basis: "per_100g", unitWeightG: null, fdcId: 168147, usda: "Vital wheat gluten" },
  { name: "Mejillones", basis: "per_100g", unitWeightG: null, fdcId: 174216, usda: "Mollusks, mussel, blue, raw" },
  { name: "Gambas", basis: "per_100g", unitWeightG: null, fdcId: 175179, usda: "Crustaceans, shrimp, raw" },
  { name: "Almejas", basis: "per_100g", unitWeightG: null, fdcId: 2706338, usda: "Clams, raw" },
  { name: "Berberechos", basis: "per_100g", unitWeightG: null, fdcId: 169803, usda: "Cockles, raw (Alaska Native)" },
  { name: "Soja texturizada", basis: "per_100g", unitWeightG: null, fdcId: 2707451, usda: "Textured vegetable protein, dry" },
  { name: "Jamón serrano", basis: "per_100g", unitWeightG: null, fdcId: 2705879, usda: "Ham, prosciutto" },
  { name: "Salmón ahumado", basis: "per_100g", unitWeightG: null, fdcId: 173687, usda: "Fish, salmon, chinook, smoked" },
  { name: "Solomillo de ternera", basis: "per_100g", unitWeightG: null, fdcId: 2727573, usda: "Beef, tenderloin steak, raw" },
  { name: "Solomillo de cerdo", basis: "per_100g", unitWeightG: null, fdcId: 2646169, usda: "Pork, loin, tenderloin, boneless, raw" },
  { name: "Trucha", basis: "per_100g", unitWeightG: null, fdcId: 173717, usda: "Fish, trout, rainbow, farmed, raw" },
  // USDA no tiene el corte "secreto": la carne de cerdo molida es el perfil graso más parecido (proxy).
  { name: "Secreto ibérico", basis: "per_100g", unitWeightG: null, fdcId: 2514745, usda: "Pork, ground, raw (proxy de secreto)" },
  { name: "Entrecote de ternera", basis: "per_100g", unitWeightG: null, fdcId: 2646172, usda: "Beef, ribeye, steak, boneless, choice, raw" },
  { name: "Vacío de ternera", basis: "per_100g", unitWeightG: null, fdcId: 2646175, usda: "Beef, flank, steak, boneless, choice, raw" },
  { name: "Cordero", basis: "per_100g", unitWeightG: null, fdcId: 2727570, usda: "Lamb, ground, raw" },
  { name: "Salmón", basis: "per_100g", unitWeightG: null, fdcId: 2684441, usda: "Fish, salmon, Atlantic, farm raised, raw" },
  { name: "Sardinas", basis: "per_100g", unitWeightG: null, fdcId: 175139, usda: "Fish, sardine, Atlantic, canned in oil, drained solids with bone" },
  { name: "Boquerones", basis: "per_100g", unitWeightG: null, fdcId: 174182, usda: "Fish, anchovy, european, raw" },
  { name: "Lata de atún natural", basis: "per_100g", unitWeightG: null, fdcId: 334194, usda: "Fish, tuna, light, canned in water, drained solids" },
  { name: "Tofu", basis: "per_100g", unitWeightG: null, fdcId: 172475, usda: "Tofu, raw, firm, prepared with calcium sulfate" },

  // ---------------------------------------------------------------------- CARBOHIDRATOS
  // La imagen los agrupa en una línea ("Arroz basmati/integral"), pero el basmati (blanco) y el
  // integral (marrón) tienen macros/micros distintos (fibra, magnesio…): se siembran por separado
  // con la fila que corresponde a cada uno, en vez de mapear los dos al arroz integral.
  { name: "Arroz basmati", basis: "per_100g", unitWeightG: null, fdcId: 168878, usda: "Rice, white, long-grain, regular, enriched, cooked" },
  { name: "Arroz integral", basis: "per_100g", unitWeightG: null, fdcId: 2708414, usda: "Rice, brown, cooked, no added fat" },
  { name: "Arroz inflado", basis: "per_100g", unitWeightG: null, fdcId: 173912, usda: "Cereals ready-to-eat, rice, puffed, fortified" },
  { name: "Pasta integral", basis: "per_100g", unitWeightG: null, fdcId: 2708358, usda: "Pasta, whole grain, cooked" },
  { name: "Patata", basis: "per_100g", unitWeightG: null, fdcId: 170026, usda: "Potatoes, flesh and skin, raw" },
  { name: "Batata/Boniato", basis: "per_100g", unitWeightG: null, fdcId: 2346404, usda: "Sweet potatoes, orange flesh, without skin, raw" },
  { name: "Pan integral", basis: "per_100g", unitWeightG: null, fdcId: 2707709, usda: "Bread, whole wheat" },
  { name: "Yuca", basis: "per_100g", unitWeightG: null, fdcId: 169985, usda: "Cassava, raw" },
  { name: "Mijo", basis: "per_100g", unitWeightG: null, fdcId: 168871, usda: "Millet, cooked" },
  { name: "Polenta", basis: "per_100g", unitWeightG: null, fdcId: 168867, usda: "Cornmeal, degermed, enriched, yellow" },
  { name: "Trigo sarraceno", basis: "per_100g", unitWeightG: null, fdcId: 170686, usda: "Buckwheat groats, roasted, cooked" },
  { name: "Bulgur", basis: "per_100g", unitWeightG: null, fdcId: 170287, usda: "Bulgur, cooked" },
  { name: "Ñoquis de patata", basis: "per_100g", unitWeightG: null, fdcId: 2708722, usda: "Gnocchi, potato" },
  { name: "Fideos de arroz", basis: "per_100g", unitWeightG: null, fdcId: 168914, usda: "Rice noodles, cooked" },
  { name: "Noodles", basis: "per_100g", unitWeightG: null, fdcId: 169732, usda: "Noodles, egg, enriched, cooked" },
  { name: "Cuscús", basis: "per_100g", unitWeightG: null, fdcId: 169700, usda: "Couscous, cooked" },
  { name: "Corn flakes sin azúcar", basis: "per_100g", unitWeightG: null, fdcId: 2708453, usda: "Cereal, corn flakes, plain" },
  { name: "Harina integral", basis: "per_100g", unitWeightG: null, fdcId: 168944, usda: "Wheat flour, whole-grain, soft wheat" },
  { name: "Maíz en grano", basis: "per_100g", unitWeightG: null, fdcId: 170288, usda: "Corn grain, yellow" },
  { name: "Lentejas", basis: "per_100g", unitWeightG: null, fdcId: 172421, usda: "Lentils, mature seeds, cooked, boiled, without salt" },
  { name: "Garbanzos", basis: "per_100g", unitWeightG: null, fdcId: 173757, usda: "Chickpeas (garbanzo beans, bengal gram), mature seeds, cooked, boiled, without salt" },
  { name: "Alubias", basis: "per_100g", unitWeightG: null, fdcId: 175203, usda: "Beans, white, mature seeds, cooked, boiled, without salt" },
  { name: "Guisantes", basis: "per_100g", unitWeightG: null, fdcId: 170017, usda: "Peas, green, frozen, cooked, boiled, drained, without salt" },
  { name: "Mermelada", basis: "per_100g", unitWeightG: null, fdcId: 169641, usda: "Jams and preserves" },
  { name: "Dátiles", basis: "per_100g", unitWeightG: null, fdcId: 168191, usda: "Dates, medjool" },
  { name: "Dulce de leche", basis: "per_100g", unitWeightG: null, fdcId: 173461, usda: "Dulce de Leche" },

  // ---------------------------------------------------------------------- GRASAS
  // La fila Foundation "extra virgin" (748608) tiene los macros en null → daría 0 kcal. Se usa la
  // sr_legacy genérica, que trae los 884 kcal / 100 g de grasa.
  { name: "Aceite de oliva", basis: "per_100g", unitWeightG: null, fdcId: 171413, usda: "Oil, olive, salad or cooking" },
  { name: "Aceite de coco", basis: "per_100g", unitWeightG: null, fdcId: 330458, usda: "Oil, coconut" },
  { name: "Aguacate", basis: "per_100g", unitWeightG: null, fdcId: 2710824, usda: "Avocado, Hass, peeled, raw" },
  { name: "Guacamole", basis: "per_100g", unitWeightG: null, fdcId: 2709307, usda: "Guacamole, NFS" },
  { name: "Avellanas", basis: "per_100g", unitWeightG: null, fdcId: 170581, usda: "Nuts, hazelnuts or filberts" },
  { name: "Pistachos", basis: "per_100g", unitWeightG: null, fdcId: 2515379, usda: "Nuts, pistachio nuts, raw" },
  { name: "Queso curado", basis: "per_100g", unitWeightG: null, fdcId: 328637, usda: "Cheese, cheddar" },
  { name: "Tahini", basis: "per_100g", unitWeightG: null, fdcId: 168604, usda: "Seeds, sesame butter, tahini, type of kernels unspecified" },
  { name: "Queso parmesano", basis: "per_100g", unitWeightG: null, fdcId: 170848, usda: "Cheese, parmesan, hard" },
  { name: "Mozzarella light", basis: "per_100g", unitWeightG: null, fdcId: 329370, usda: "Cheese, mozzarella, low moisture, part-skim" },

  // ---------------------------------------------------------------------- VERDURA
  { name: "Lechuga", basis: "per_100g", unitWeightG: null, fdcId: 2346391, usda: "Lettuce, leaf, green, raw" },
  { name: "Canónigos", basis: "per_100g", unitWeightG: null, fdcId: 169219, usda: "Cornsalad, raw" },
  { name: "Rúcula", basis: "per_100g", unitWeightG: null, fdcId: 2710822, usda: "Arugula, baby, raw" },
  { name: "Escarola", basis: "per_100g", unitWeightG: null, fdcId: 168412, usda: "Endive, raw" },
  { name: "Kale", basis: "per_100g", unitWeightG: null, fdcId: 323505, usda: "Kale, raw" },
  { name: "Espinacas", basis: "per_100g", unitWeightG: null, fdcId: 168462, usda: "Spinach, raw" },
  { name: "Acelgas", basis: "per_100g", unitWeightG: null, fdcId: 169991, usda: "Chard, swiss, raw" },
  { name: "Brócoli", basis: "per_100g", unitWeightG: null, fdcId: 321900, usda: "Broccoli, raw" },
  { name: "Bimi", basis: "per_100g", unitWeightG: null, fdcId: 321900, usda: "Broccoli, raw (proxy de broccolini)" },
  { name: "Calabacín", basis: "per_100g", unitWeightG: null, fdcId: 2685568, usda: "Squash, summer, green, zucchini, includes skin, raw" },
  { name: "Pimiento verde", basis: "per_100g", unitWeightG: null, fdcId: 2258588, usda: "Peppers, bell, green, raw" },
  { name: "Pimiento rojo", basis: "per_100g", unitWeightG: null, fdcId: 170108, usda: "Peppers, sweet, red, raw" },
  { name: "Puerro", basis: "per_100g", unitWeightG: null, fdcId: 169246, usda: "Leeks, (bulb and lower leaf-portion), raw" },
  { name: "Berenjena", basis: "per_100g", unitWeightG: null, fdcId: 2685577, usda: "Eggplant, raw" },
  { name: "Cebolla", basis: "per_100g", unitWeightG: null, fdcId: 170000, usda: "Onions, raw" },
  { name: "Calabaza", basis: "per_100g", unitWeightG: null, fdcId: 168448, usda: "Pumpkin, raw" },
  { name: "Col", basis: "per_100g", unitWeightG: null, fdcId: 169975, usda: "Cabbage, raw" },
  { name: "Tomate", basis: "per_100g", unitWeightG: null, fdcId: 170457, usda: "Tomatoes, red, ripe, raw, year round average" },
  { name: "Alcachofas", basis: "per_100g", unitWeightG: null, fdcId: 169205, usda: "Artichokes, (globe or french), raw" },
  { name: "Apio", basis: "per_100g", unitWeightG: null, fdcId: 2346405, usda: "Celery, raw" },
  { name: "Pepino", basis: "per_100g", unitWeightG: null, fdcId: 2346406, usda: "Cucumber, with peel, raw" },
  { name: "Espárragos", basis: "per_100g", unitWeightG: null, fdcId: 168389, usda: "Asparagus, raw" },
  { name: "Setas", basis: "per_100g", unitWeightG: null, fdcId: 168580, usda: "Mushrooms, oyster, raw" },
  { name: "Champiñones", basis: "per_100g", unitWeightG: null, fdcId: 169251, usda: "Mushrooms, white, raw" },
  { name: "Nabo", basis: "per_100g", unitWeightG: null, fdcId: 2747674, usda: "Turnips, raw" },
  { name: "Coles de Bruselas", basis: "per_100g", unitWeightG: null, fdcId: 2685575, usda: "Brussels sprouts, raw" },

  // ---------------------------------------------------------------------- FRUTA
  { name: "Melón", basis: "per_100g", unitWeightG: null, fdcId: 327198, usda: "Melons, cantaloupe, raw" },
  { name: "Piña", basis: "per_100g", unitWeightG: null, fdcId: 2346398, usda: "Pineapple, raw" },
  { name: "Naranja", basis: "per_100g", unitWeightG: null, fdcId: 746771, usda: "Oranges, raw, navels" },
  { name: "Mandarina", basis: "per_100g", unitWeightG: null, fdcId: 169105, usda: "Tangerines, (mandarin oranges), raw" },
  { name: "Melocotón", basis: "per_100g", unitWeightG: null, fdcId: 325430, usda: "Peaches, yellow, raw" },
  { name: "Pera", basis: "per_100g", unitWeightG: null, fdcId: 169118, usda: "Pears, raw" },
  { name: "Chirimoya", basis: "per_100g", unitWeightG: null, fdcId: 173953, usda: "Cherimoya, raw" },
  { name: "Higos", basis: "per_100g", unitWeightG: null, fdcId: 173021, usda: "Figs, raw" },
  { name: "Fresas", basis: "per_100g", unitWeightG: null, fdcId: 327699, usda: "Strawberries, raw" },
  { name: "Cerezas", basis: "per_100g", unitWeightG: null, fdcId: 171719, usda: "Cherries, sweet, raw" },
  { name: "Arándanos", basis: "per_100g", unitWeightG: null, fdcId: 2263889, usda: "Blueberries, raw" },
  // La fila Foundation (2727581) tiene kcal/carbs/fat en null → se usa la sr_legacy con macros completos.
  { name: "Moras", basis: "per_100g", unitWeightG: null, fdcId: 173946, usda: "Blackberries, raw" },
  { name: "Frambuesas", basis: "per_100g", unitWeightG: null, fdcId: 2263888, usda: "Raspberries, raw" },
  { name: "Albaricoque", basis: "per_100g", unitWeightG: null, fdcId: 2710815, usda: "Apricot, with skin, raw" },
  { name: "Níspero", basis: "per_100g", unitWeightG: null, fdcId: 169908, usda: "Loquats, raw" },
  { name: "Papaya", basis: "per_100g", unitWeightG: null, fdcId: 169926, usda: "Papayas, raw" },
  { name: "Ciruelas", basis: "per_100g", unitWeightG: null, fdcId: 169949, usda: "Plums, raw" },
  { name: "Kiwi", basis: "per_100g", unitWeightG: null, fdcId: 327046, usda: "Kiwifruit, green, raw" },
  { name: "Caqui", basis: "per_100g", unitWeightG: null, fdcId: 169941, usda: "Persimmons, japanese, raw" },
  { name: "Mango", basis: "per_100g", unitWeightG: null, fdcId: 169910, usda: "Mangos, raw" },
];
