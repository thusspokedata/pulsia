import type { FoodBasis } from "../schemas/nutrition";

// Los seis nutrientes que llevan semáforo. El ORDEN importa: desempata el orden de los chips
// en la UI, así que cambiarlo cambia lo que ve el usuario.
export const FLAGGED_NUTRIENTS = [
  "fat_g",
  "saturated_fat_g",
  "sugars_g",
  "salt_g",
  "cholesterol_mg",
  "fiber_g",
] as const;
export type FlaggedNutrient = (typeof FLAGGED_NUTRIENTS)[number];

export type NutrientLevel = "low" | "medium" | "high" | "unknown";

// Un umbral con sus operadores explícitos, porque los dos esquemas que mezclamos NO usan los
// mismos: el FSA define "alto" como > (22,5 g de azúcar es medio), la FDA como >= (60 mg de
// colesterol ya es alto). Codificarlo acá evita tener que recordarlo en cada comparación.
type Band = {
  low: number;
  high: number;
  lowInclusive: boolean; // true → value <= low es bajo
  highInclusive: boolean; // true → value >= high es alto
};

const FSA: Omit<Band, "low" | "high"> = { lowInclusive: true, highInclusive: false };

// Etiquetado frontal de la FSA/DoH (Reino Unido), por 100 g de alimento sólido.
const FSA_SOLID = {
  fat_g: { low: 3.0, high: 17.5, ...FSA },
  saturated_fat_g: { low: 1.5, high: 5.0, ...FSA },
  sugars_g: { low: 5.0, high: 22.5, ...FSA },
  salt_g: { low: 0.3, high: 1.5, ...FSA },
} as const satisfies Record<string, Band>;

// Misma guía, escala reducida para bebidas, por 100 ml.
const FSA_DRINK = {
  fat_g: { low: 1.5, high: 8.75, ...FSA },
  saturated_fat_g: { low: 0.75, high: 2.5, ...FSA },
  sugars_g: { low: 2.5, high: 11.25, ...FSA },
  salt_g: { low: 0.3, high: 0.75, ...FSA },
} as const satisfies Record<string, Band>;

// El FSA no cubre colesterol ni fibra, así que estos dos salen del %DV de la FDA
// (21 CFR 101.54 y 101.62). No tienen escala de bebidas: los anclajes son por porción de
// referencia, no por volumen, así que el basis no los afecta.
const FDA = {
  // "low cholesterol" = <=20 mg; "alto en" = >=20% del DV de 300 mg = 60 mg.
  cholesterol_mg: { low: 20, high: 60, lowInclusive: true, highInclusive: true },
  // DV de fibra = 28 g. "good source" arranca en 10% (2,8 g), "excellent" en 20% (5,6 g).
  // Es el único PISO del set (ver NUTRIENT_REFERENCE_KIND en references.ts): mucha fibra es
  // bueno. Por eso el bajo usa < en vez de <=.
  fiber_g: { low: 2.8, high: 5.6, lowInclusive: false, highInclusive: true },
} as const satisfies Record<string, Band>;

function bandFor(nutrient: FlaggedNutrient, basis: FoodBasis): Band {
  if (nutrient === "cholesterol_mg" || nutrient === "fiber_g") return FDA[nutrient];
  return basis === "per_100ml" ? FSA_DRINK[nutrient] : FSA_SOLID[nutrient];
}

/**
 * Cuánto hay de un nutriente, contra los umbrales. NO opina sobre si eso es bueno o malo:
 * de eso se ocupa nutrientSentiment, porque la fibra va al revés que el resto.
 *
 * Un valor ausente devuelve "unknown", nunca "low". Los cinco micros son nullable en el
 * schema, y decir "bajo en azúcar" de un alimento cuyo azúcar no conocemos es afirmar algo
 * que no sabemos.
 */
export function nutrientLevel(
  nutrient: FlaggedNutrient,
  value: number | null | undefined,
  basis: FoodBasis,
): NutrientLevel {
  if (value == null || !Number.isFinite(value)) return "unknown";
  const band = bandFor(nutrient, basis);
  const isLow = band.lowInclusive ? value <= band.low : value < band.low;
  if (isLow) return "low";
  const isHigh = band.highInclusive ? value >= band.high : value > band.high;
  return isHigh ? "high" : "medium";
}

export type NutrientSentiment = "bad" | "warn" | "good" | "neutral" | "unknown";

/**
 * Si el nivel medido es bueno o malo. Acá —y solo acá— vive la dirección de cada nutriente,
 * espejando el NUTRIENT_REFERENCE_KIND de references.ts: la fibra es piso, los otros cinco son
 * techos. Sin esta separación, la UI tendría que saber que la fibra va al revés.
 */
export function nutrientSentiment(
  nutrient: FlaggedNutrient,
  level: NutrientLevel,
): NutrientSentiment {
  if (level === "unknown") return "unknown";
  if (nutrient === "fiber_g") return level === "high" ? "good" : "neutral";
  if (level === "high") return "bad";
  if (level === "medium") return "warn";
  return "neutral";
}

export type NutrientFlag = {
  nutrient: FlaggedNutrient;
  level: NutrientLevel;
  sentiment: NutrientSentiment;
  value: number | null;
};

export type FoodFlags = {
  /** bad | warn | good, ordenados por severidad. Lo que la UI pinta como chips. */
  notable: NutrientFlag[];
  /** Los que no tienen dato. Se muestran aparte: "no sé" no es "está bajo". */
  unknown: FlaggedNutrient[];
  /** Los seis, en orden fijo. Para la vista de detalle. */
  all: NutrientFlag[];
};

// Lo mínimo que hace falta para juzgar un alimento. Un Food lo satisface, pero pedir solo esto
// permite testear sin construir un Food entero con id, userId y timestamps.
export type FoodFlagsInput = {
  basis: FoodBasis;
  fat_g: number;
  saturated_fat_g?: number | null;
  sugars_g?: number | null;
  salt_g?: number | null;
  cholesterol_mg?: number | null;
  fiber_g?: number | null;
};

const SENTIMENT_RANK: Record<NutrientSentiment, number> = {
  bad: 0,
  warn: 1,
  good: 2,
  neutral: 3,
  unknown: 4,
};

/**
 * El valor de un nutriente en `food`, o `null` si no está cargado. Centraliza el chequeo de
 * `typeof`: los micros son `number | null | undefined` en el schema, y un dato corrupto que
 * llegara como string (por ejemplo desde un JSON externo mal tipado) tampoco debe colarse
 * como si fuera un número real. Se usa acá y en nutrientFilter.ts — sin este helper, los dos
 * archivos repetían la misma línea con el mismo riesgo de que se desincronicen.
 */
export function nutrientValue(food: FoodFlagsInput, nutrient: FlaggedNutrient): number | null {
  const raw = food[nutrient];
  return typeof raw === "number" ? raw : null;
}

export function foodFlags(food: FoodFlagsInput): FoodFlags {
  const all: NutrientFlag[] = FLAGGED_NUTRIENTS.map((nutrient) => {
    const value = nutrientValue(food, nutrient);
    const level = nutrientLevel(nutrient, value, food.basis);
    return { nutrient, level, sentiment: nutrientSentiment(nutrient, level), value };
  });

  const rankOf = (n: FlaggedNutrient) => FLAGGED_NUTRIENTS.indexOf(n);
  const notable = all
    .filter((f) => f.sentiment === "bad" || f.sentiment === "warn" || f.sentiment === "good")
    // Orden determinista: primero por severidad, y los empates por el orden de la tabla.
    // `Array.prototype.sort` ya es estable (ES2019+), así que hoy los empates salen en el
    // orden de FLAGGED_NUTRIENTS aunque este segundo criterio no estuviera: `all` se
    // construye iterando FLAGGED_NUTRIENTS y `filter` preserva ese orden. El desempate
    // explícito no depende de esa estabilidad del motor: mantiene el contrato aun si el día
    // de mañana alguien reordena o filtra distinto la construcción de `all`.
    .sort(
      (a, b) =>
        SENTIMENT_RANK[a.sentiment] - SENTIMENT_RANK[b.sentiment] ||
        rankOf(a.nutrient) - rankOf(b.nutrient),
    );

  const unknown = all.filter((f) => f.level === "unknown").map((f) => f.nutrient);

  return { notable, unknown, all };
}
