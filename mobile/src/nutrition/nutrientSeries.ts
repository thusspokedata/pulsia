import { saltGFromSodiumMg, sumNullableMicro } from "@pulsia/shared";
import type { Meal, MealItem, RankNutrient } from "@pulsia/shared";
import type { XY } from "../session/chart";
import { dateKey } from "../session/dateKey";

export interface NutrientSeries {
  points: XY[]; // x = mediodía del día, y = total del nutriente ese día
  average: number | null; // sobre los días CON registro, no sobre el rango
}

// Mediodía LOCAL del día `YYYY-MM-DD`. El eje X representa el día, no la hora en que se comió:
// si usáramos el `eatenAt`, dos días se separarían más o menos según a qué hora desayunaste.
// El mediodía además deja 12 h de margen contra el DST, mismo criterio que `dayAtNoon`.
function noonOf(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}

// `salt_g` NO es un campo del ítem: el snapshot guarda SODIO. La curva se dibuja igual en SAL,
// que es la unidad que el usuario lee en el resto de la app (referencia OMS de 5 g/día). Sin este
// puente, `item["salt_g"]` sería `undefined` en todos los ítems y la curva de sal quedaría vacía
// sin que nadie se entere. Mismo criterio que `nutrientValue` en shared/nutrition/nutrientLevel.ts.
function sourceValue(item: MealItem, nutrient: RankNutrient): number | null | undefined {
  return nutrient === "salt_g" ? item.sodium_mg : item[nutrient];
}

// Total diario de un micro. Un día sin comidas, o con comidas pero sin NINGÚN ítem que declare el
// dato, no genera punto: no es lo mismo "comí 0" que "no sé", y dibujar un 0 mentiría a favor.
// Un 0 declarado sí es un punto. `sumNullableMicro` es el mismo helper que arma el total del día
// en la pestaña Nutrientes, así que la curva no puede contradecir ese número.
export function dailyNutrientSeries(meals: Meal[], nutrient: RankNutrient): NutrientSeries {
  const byDay = new Map<string, (number | null | undefined)[]>();
  for (const m of meals) {
    const key = dateKey(m.eatenAt);
    const acc = byDay.get(key) ?? [];
    for (const item of m.items) acc.push(sourceValue(item, nutrient));
    byDay.set(key, acc);
  }

  const points: XY[] = [];
  for (const [key, values] of byDay) {
    // La sal se convierte sobre el sodio YA SUMADO del día, no ítem por ítem: redondear cada
    // conversión a 1 decimal desvía el total (dos ítems de 50 mg darían 0,2 g en vez de 0,3).
    // Es el mismo número que muestra el total del día, así que la curva no puede contradecirlo.
    const summed = sumNullableMicro(values);
    const total = nutrient === "salt_g" ? saltGFromSodiumMg(summed) : summed;
    if (total == null) continue;
    points.push({ x: noonOf(key), y: total });
  }
  points.sort((a, b) => a.x - b.x); // el backend no garantiza el orden de las comidas

  const average =
    points.length > 0 ? Math.round((points.reduce((a, p) => a + p.y, 0) / points.length) * 10) / 10 : null;
  return { points, average };
}
