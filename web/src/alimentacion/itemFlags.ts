import { foodFlags, type FoodFlags, type MealItem } from "@pulsia/shared";

// El semáforo FSA/FDA razona por 100 g/ml, pero el snapshot del MealItem guarda los valores YA
// escalados a `grams`. Reconstruimos la composición por 100 y le pedimos el semáforo. `basis` se
// aproxima por la unidad de carga (ml → bebida; si no, sólido): el ítem no persiste el basis del
// alimento original.
export function itemFlags(item: MealItem): FoodFlags {
  const factor = item.grams > 0 ? 100 / item.grams : 0;
  const per100 = (v: number | null | undefined) => (v == null ? null : v * factor);
  return foodFlags({
    basis: item.quantityUnit === "ml" ? "per_100ml" : "per_100g",
    fat_g: item.fat_g * factor,
    saturated_fat_g: per100(item.saturated_fat_g),
    sugars_g: per100(item.sugars_g),
    sodium_mg: per100(item.sodium_mg),
    cholesterol_mg: per100(item.cholesterol_mg),
    fiber_g: per100(item.fiber_g),
  });
}
