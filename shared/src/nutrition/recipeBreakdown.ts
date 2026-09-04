import { foodMacrosRaw, type MacroSource, type ScaledMacros } from "./macros";
import type { RecipeItemInput } from "../schemas/nutrition";

// Un ingrediente de una receta con su aporte crudo al nutriente/macro elegido.
export interface RecipeContribution {
  foodId: string;
  name: string;
  value: number; // aporte SIN redondear (la pantalla reparte el amount de la fila por fracción)
}

export interface RecipeExpansion {
  // Ingredientes que resuelven Y aportan > 0, de mayor a menor. Desempate por nombre, igual que
  // rankFoods, para que la lista no baile entre renders.
  contributions: RecipeContribution[];
  // false si ALGÚN item de la receta no resolvió (borrado/no está en el catálogo). La pantalla
  // usa esto para NO expandir (decisión d del owner): nunca reparte sobre un total incompleto.
  complete: boolean;
}

// Reparte una receta a sus ingredientes para un macro/micro. `resolve` mapea foodId → el Food del
// ingrediente (per-100g + nombre); `valueOf` es el MISMO extractor que usa el ranking de la pantalla
// (macroValueOf / nutrientValueOf), así comida y expansión hablan la misma unidad (incl. sal→sodio).
// Aplana un solo nivel: si un ingrediente es a su vez una receta, se usa su per-100g tal cual (no se
// recursea). No se usa cookedWeightG ni redondeo: el reparto de la pantalla es por FRACCIÓN, y la
// fracción entre ingredientes es invariante a la escala.
export function expandRecipe(
  items: RecipeItemInput[],
  resolve: (foodId: string) => (MacroSource & { name: string }) | null,
  valueOf: (m: ScaledMacros) => number | null,
): RecipeExpansion {
  let complete = true;
  const contributions: RecipeContribution[] = [];
  for (const it of items) {
    const food = resolve(it.foodId);
    if (food == null) {
      complete = false;
      continue; // seguimos: no depender del orden para marcar incompleto
    }
    let scaled: ScaledMacros;
    try {
      // weighedCooked:false alinea con deriveRecipe (recipe.ts): la receta se derivó aplicando el
      // per-100g SECO tal cual, sin dividir por cookingYield. Repartir con otra semántica sesgaría
      // las fracciones respecto a cómo se construyó la receta.
      scaled = foodMacrosRaw(food, it.quantity, it.unit, { weighedCooked: false });
    } catch {
      // Unidad incoherente con el basis del ingrediente (dato viejo/corrupto): tratamos como faltante.
      complete = false;
      continue;
    }
    const value = valueOf(scaled);
    if (value == null || value <= 0) continue; // no aporta: no enseña nada (igual que rankFoods)
    contributions.push({ foodId: it.foodId, name: food.name, value });
  }
  contributions.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  return { contributions, complete };
}

// Una sub-fila del acordeón: cuánto de la porción de la fila (`amount`, ya redondeado) aportó cada
// ingrediente y su % de la receta.
export interface RecipeSubRow {
  foodId: string;
  name: string;
  amount: number;
  pct: number;
}

// Reparte `rowAmount` (la cantidad de la fila padre: gramos del macro, mg/µg del micro, g de sal…)
// entre los ingredientes por su fracción del total (`c.value / Σ`). Centraliza el cálculo que antes
// duplicaban macro.tsx y nutriente.tsx. Cada `amount` se redondea a 1 decimal, pero eso puede hacer
// que la suma no cierre (tres tercios de 1.0 → 0.3+0.3+0.3 = 0.9); para que la suma sea EXACTAMENTE
// `round1(rowAmount)`, el residuo se asigna a la fila de mayor aporte (la primera: `contributions`
// viene ordenado desc). Si Σ<=0 no hay nada que repartir → []. `pct` se redondea por separado (puede
// sumar 99 o 101, igual que las tortas de breakdown.ts).
export function recipeSubRows(contributions: RecipeContribution[], rowAmount: number): RecipeSubRow[] {
  const sum = contributions.reduce((a, c) => a + c.value, 0);
  if (sum <= 0) return [];
  const round1 = (x: number) => Math.round(x * 10) / 10;
  const rows = contributions.map((c) => ({
    foodId: c.foodId,
    name: c.name,
    amount: round1((c.value / sum) * rowAmount),
    pct: Math.round((c.value / sum) * 100),
  }));
  // Conservación del total: el redondeo por fila puede dejar un residuo (± algunas décimas).
  // Lo cargamos a la primera fila (la de mayor aporte) para que la suma cierre en round1(rowAmount).
  const target = round1(rowAmount);
  const got = rows.reduce((a, r) => a + r.amount, 0);
  const residual = round1(target - got);
  if (residual !== 0) rows[0].amount = round1(rows[0].amount + residual);
  return rows;
}
