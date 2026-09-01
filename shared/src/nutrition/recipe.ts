import { NUTRIENTS, type NutrientKey } from "./nutrients";
import { foodMacrosRaw, type MacroSource } from "./macros";
import type { QuantityUnit, SugarClass } from "../schemas/nutrition";

export interface RecipeIngredient {
  food: MacroSource;
  quantity: number;
  unit: QuantityUnit;
  // Clase del azúcar del ingrediente (intrinsic|free|mixed). Va como campo HERMANO de `food`, no
  // dentro de MacroSource: MacroSource es solo nutrientes escalables por cantidad, y sugarClass es
  // metadata cualitativa que NO escala. null/undefined = desconocido.
  sugarClass?: SugarClass | null;
}

type MacroBlock = { kcal: number; protein_g: number; carbs_g: number; fat_g: number } & Record<NutrientKey, number | null>;

export interface DerivedRecipe {
  sumGrams: number;          // suma de gramos de los ingredientes (ml cuenta como g 1:1)
  effectiveWeightG: number;  // cookedWeightG ?? sumGrams
  total: MacroBlock;         // totales absolutos de toda la receta (para el preview)
  per100: MacroBlock;        // por 100 g (lo que se guarda como Food)
  sugarClass: SugarClass | null; // clase de azúcar de la receta, compuesta desde sus ingredientes
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const roundTo = (n: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};

// Deriva una receta a sus totales y a los valores por 100 g. Reusa el MISMO núcleo de escalado que
// el diario (foodMacrosRaw, el corazón sin redondear de foodMacrosForQuantity) pero suma las
// contribuciones CRUDAS de cada ingrediente y redondea recién al final: sumar valores que ya
// vinieron redondeados por-ingrediente y volver a escalar a por-100g arrastra el error de redondeo
// (p.ej. 50 g de un alimento de 89 kcal/100g redondearía a 45 kcal → 90 kcal/100g en vez de 89).
// La semántica de null se preserva a mano (no con sumNutrientByKey, que redondea por-llamada y
// reintroduciría el mismo sesgo): un micro que ningún ingrediente tiene queda null, nunca 0.
export function deriveRecipe(ingredients: RecipeIngredient[], cookedWeightG: number | null): DerivedRecipe {
  const raw = ingredients.map((i) => foodMacrosRaw(i.food, i.quantity, i.unit, { weighedCooked: false }));
  const sumGrams = raw.reduce((a, m) => a + m.grams, 0);
  const effectiveWeightG = cookedWeightG ?? sumGrams;
  if (effectiveWeightG <= 0) throw new Error("La receta necesita al menos un ingrediente con peso.");
  const factor = 100 / effectiveWeightG;

  const rawKcal = raw.reduce((a, m) => a + m.kcal, 0);
  const rawProtein = raw.reduce((a, m) => a + m.protein_g, 0);
  const rawCarbs = raw.reduce((a, m) => a + m.carbs_g, 0);
  const rawFat = raw.reduce((a, m) => a + m.fat_g, 0);

  const total = {
    kcal: Math.round(rawKcal),
    protein_g: round1(rawProtein),
    carbs_g: round1(rawCarbs),
    fat_g: round1(rawFat),
  } as MacroBlock;
  const per100 = {
    kcal: Math.round(rawKcal * factor),
    protein_g: round1(rawProtein * factor),
    carbs_g: round1(rawCarbs * factor),
    fat_g: round1(rawFat * factor),
  } as MacroBlock;

  for (const n of NUTRIENTS) {
    const values = raw.map((m) => m[n.key]);
    const hasData = values.some((v) => v != null);
    const rawSum = hasData ? values.reduce<number>((a, v) => a + (v ?? 0), 0) : null;
    total[n.key] = rawSum == null ? null : roundTo(rawSum, n.decimals);
    per100[n.key] = rawSum == null ? null : roundTo(rawSum * factor, n.decimals);
  }

  // sugarClass de la receta compuesto desde el de sus ingredientes. El motor de azúcares LIBRES
  // (freeSugars.ts) mira el sugarClass del Food: si la receta queda null, es conservador y cuenta
  // TODO el azúcar como libre (una ensalada 100% fruta entera volvería a marcar "azúcar alto"). Por
  // eso lo derivamos acá.
  //
  // Regla (3 vías) sobre los ingredientes que APORTAN azúcar — su sugars_g crudo escalado > 0. Un
  // ingrediente sin azúcar (agua, pollo) no aporta clasificación y por eso se excluye: su sugarClass
  // (o su ausencia) no debe contaminar el resultado.
  //   - Ningún ingrediente aporta azúcar → null (no hay azúcar que clasificar).
  //   - Todos los que aportan azúcar son "intrinsic" → "intrinsic".
  //   - Todos los que aportan azúcar son "free" → "free".
  //   - Cualquier otro caso (mezcla intrinsic+free, algún "mixed", o algún null/desconocido entre los
  //     que aportan azúcar) → "mixed". Conservador: ante la duda contamos de más, igual criterio que
  //     freeSugars.ts (mixed hace que se cuente parte como libre, no que se descarte).
  const sugarClasses = ingredients
    .filter((_, i) => typeof raw[i].sugars_g === "number" && (raw[i].sugars_g as number) > 0)
    .map((ing) => ing.sugarClass ?? null);
  let sugarClass: SugarClass | null;
  if (sugarClasses.length === 0) sugarClass = null;
  else if (sugarClasses.every((c) => c === "intrinsic")) sugarClass = "intrinsic";
  else if (sugarClasses.every((c) => c === "free")) sugarClass = "free";
  else sugarClass = "mixed";

  return { sumGrams, effectiveWeightG, total, per100, sugarClass };
}
