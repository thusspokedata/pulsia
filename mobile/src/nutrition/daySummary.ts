import { NUTRIENT_KEYS, freeSugarsG, saltGFromSodiumMg, sumNutrientByKey } from "@pulsia/shared";
import type { Meal, MealItem, NutrientKey, NutrientSum, WaterLog } from "@pulsia/shared";

export interface NutritionDaySummary {
  dayTotals: {
    kcal: number; protein_g: number; carbs_g: number; fat_g: number;
    sugars_g: number | null; fiber_g: number | null; saturated_fat_g: number | null; salt_g: number | null;
  };
  cholesterolMg: number | null;
  // Total del día de CADA nutriente del registro, con su marca de parcial. `dayTotals` y
  // `cholesterolMg` salen de acá: si se calcularan por separado, la pestaña de nutrientes y la
  // card del resumen podrían mostrar dos números distintos del mismo día.
  nutrients: Record<NutrientKey, NutrientSum>;
  // Azúcar LIBRE del día (fruta/verdura entera NO cuenta; sí jugo, seco y agregado). Es el número
  // que se compara contra el límite OMS (50 g). `nutrients.sugars_g` sigue siendo el TOTAL: el día
  // muestra el total partido en intrínseco vs libre, y solo lo libre pesa contra la referencia.
  // Se calcula por ítem con `freeSugarsG` y se suma con la misma mecánica que el resto (decimales
  // del registro + marca `partial`), para no divergir de cómo se totaliza `sugars_g`.
  sugarFree: NutrientSum;
  liquid: { total: number; drank: number; fromFood: number };
  // Aporte de los suplementos TOMADOS ese día, por nutriente (viene del backend, calculado con la
  // misma supplementMicros que el informe). Vacío si no hay plan/tomas. NO se mezcla en `nutrients`
  // (que es comida): el diario los muestra como segmento aparte.
  supplementNutrients: Partial<Record<NutrientKey, number>>;
}

/**
 * Suma cada nutriente del REGISTRO a lo largo de una lista de ítems.
 *
 * Se recorre el REGISTRO y no una lista escrita a mano: agregar un nutriente lo suma solo.
 * `sumNutrientByKey` respeta los decimales que declara cada uno (sumar el zinc a 1 decimal
 * convierte 0,25 en 0,3) y devuelve `partial: true` cuando algunos ítems tenían el dato y otros
 * no — que es la diferencia entre "comiste 0,8 mg de zinc" y "0,8 de los que sabemos".
 *
 * La usan el TOTAL DEL DÍA y el detalle de UNA comida. Es la misma cuenta sobre distintos ítems, y
 * tenerla dos veces ya costó un bug: el detalle se quedaba con el `.value` y tiraba el `partial`,
 * así que la misma comida se veía como piso en el día y como exacta en su propia pantalla.
 */
export function sumarNutrientesDeItems(items: MealItem[]): Record<NutrientKey, NutrientSum> {
  const nutrients = {} as Record<NutrientKey, NutrientSum>;
  for (const key of NUTRIENT_KEYS) {
    nutrients[key] = sumNutrientByKey(items.map((it) => it[key]), key);
  }
  return nutrients;
}

export function buildNutritionDaySummary(meals: Meal[], water: WaterLog[]): NutritionDaySummary {
  const items = meals.flatMap((m) => m.items);
  const nutrients = sumarNutrientesDeItems(items);

  // El ítem guarda SODIO; la pantalla habla en SAL (referencia OMS de 5 g/día). Se suma el sodio
  // y se convierte UNA vez al final: convertir por ítem redondea a 1 decimal cada vez y el total
  // se va desviando (dos ítems de 50 mg darían 0,2 g en vez de 0,3). Mismo criterio que el
  // backend en nutrientLevel.ts / breakdown.ts.
  const saltG = saltGFromSodiumMg(nutrients.sodium_mg.value);
  const dayTotals = {
    kcal: items.reduce((a, it) => a + it.kcal, 0),
    protein_g: items.reduce((a, it) => a + it.protein_g, 0),
    carbs_g: items.reduce((a, it) => a + it.carbs_g, 0),
    fat_g: items.reduce((a, it) => a + it.fat_g, 0),
    sugars_g: nutrients.sugars_g.value, fiber_g: nutrients.fiber_g.value,
    saturated_fat_g: nutrients.saturated_fat_g.value, salt_g: saltG,
  };
  const cholesterolMg = nutrients.cholesterol_mg.value;
  // Azúcar LIBRE por ítem (usa total + agregado + clase del ítem) y se suma con la MISMA mecánica
  // que `sugars_g` (`sumNutrientByKey` con la clave "sugars_g": 1 decimal + `partial`). Un ítem sin
  // dato de azúcar deja `null`, que marca el total como parcial igual que en el total del día.
  const sugarFree = sumNutrientByKey(
    items.map((it) => freeSugarsG({ sugars_g: it.sugars_g, added_sugars_g: it.added_sugars_g, sugarClass: it.sugarClass })),
    "sugars_g",
  );
  const fromFood = nutrients.water_ml.value ?? 0;
  const drank = water.reduce((a, w) => a + w.ml, 0);
  return { dayTotals, cholesterolMg, nutrients, sugarFree, liquid: { total: Math.round(fromFood + drank), drank, fromFood }, supplementNutrients: {} };
}
