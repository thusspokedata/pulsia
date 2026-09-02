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

// Redondeo a 1 decimal, mismo criterio que el promedio de abajo. Se aplica al total combinado
// (comida + suplemento) porque el aporte del suplemento puede venir con decimales largos del
// backend, y arrastrarlos a la curva mostraría "12,3999" donde la lista de aportes muestra 12,4.
const round1 = (n: number) => Math.round(n * 10) / 10;

// Total diario de un micro. Un día sin comidas, o con comidas pero sin NINGÚN ítem que declare el
// dato, no genera punto: no es lo mismo "comí 0" que "no sé", y dibujar un 0 mentiría a favor.
// Un 0 declarado sí es un punto. `sumNullableMicro` es el mismo helper que arma el total del día
// en la pestaña Nutrientes, así que la curva no puede contradecir ese número.
//
// `supplementByDay` (opcional): el aporte de los suplementos tomados ese día, por dateKey, en la
// MISMA unidad FUENTE que `sourceValue` — para `salt_g` es SODIO (mg), no sal; el resto en su
// unidad propia. Sin este fold, la curva "Evolución" quedaba food-only y contradecía la lista "De
// mayor a menor aporte" (que sí suma el suplemento): un nutriente que viene casi todo de una
// pastilla dibujaba una curva plana y baja. Cuando es `undefined`, el comportamiento es idéntico
// al anterior (retrocompatibilidad): la unión de días es solo la de `meals` y no se suma nada.
export function dailyNutrientSeries(
  meals: Meal[],
  nutrient: RankNutrient,
  supplementByDay?: Record<string, number | null | undefined>,
): NutrientSeries {
  const byDay = new Map<string, (number | null | undefined)[]>();
  for (const m of meals) {
    const key = dateKey(m.eatenAt);
    const acc = byDay.get(key) ?? [];
    for (const item of m.items) acc.push(sourceValue(item, nutrient));
    byDay.set(key, acc);
  }

  // Unión de días: los de las comidas MÁS los que solo tienen aporte de suplemento. Un día
  // solo-suplemento (tomaste la pastilla pero no registraste comida) DEBE generar punto y contar
  // para el promedio: es un día CON registro del nutriente; omitirlo subestimaría el promedio
  // justo en los nutrientes que dependen del suplemento, que es el caso que este ticket arregla.
  const keys = new Set<string>(byDay.keys());
  if (supplementByDay) for (const k of Object.keys(supplementByDay)) keys.add(k);

  const points: XY[] = [];
  for (const key of keys) {
    // `summedFood` es null si ese día no hubo NINGÚN ítem con el dato (o no hubo comida). `supp`
    // es el aporte del suplemento en unidad fuente (sodio para la sal). Si ninguno de los dos
    // tiene dato, no hay punto: "no sé" no es lo mismo que "0".
    const summedFood = sumNullableMicro(byDay.get(key) ?? []);
    const supp = supplementByDay?.[key];
    if (summedFood == null && supp == null) continue;

    // El sodio de comida y de suplemento se SUMA y recién ahí se convierte a sal: convertir cada
    // fuente por separado y sumar las sales desviaría el total por el redondeo a 1 decimal (mismo
    // motivo por el que la sal del día se convierte sobre el sodio ya sumado, no ítem por ítem).
    // Así la curva coincide con el total combinado que muestra la lista de aportes.
    const combinedSource = (summedFood ?? 0) + (supp ?? 0);
    const total = nutrient === "salt_g" ? saltGFromSodiumMg(combinedSource) : round1(combinedSource);
    if (total == null) continue; // combinedSource siempre es número acá, pero mantiene el tipo prolijo
    points.push({ x: noonOf(key), y: total });
  }
  points.sort((a, b) => a.x - b.x); // el backend no garantiza el orden de las comidas

  const average =
    points.length > 0 ? Math.round((points.reduce((a, p) => a + p.y, 0) / points.length) * 10) / 10 : null;
  return { points, average };
}
