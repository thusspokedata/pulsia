// Fuente ÚNICA de qué micronutrientes existen. De acá se derivan el schema Zod, el escalado por
// cantidad, las sumas, las referencias diarias y el agrupado de la UI. Agregar un nutriente es
// agregar una línea acá: si se escribiera a mano en cada lugar, olvidarse de uno lo perdería en
// silencio (es el bug de buildFitActivity, que ningún test veía).
export type NutrientGroup = "grasas" | "carbohidratos" | "vitaminas" | "minerales";
export type NutrientUnit = "g" | "mg" | "mcg" | "ml";

export interface NutrientDef {
  readonly key: string;
  readonly label: string; // español, para la UI
  readonly unit: NutrientUnit;
  readonly group: NutrientGroup;
  readonly decimals: number; // redondeo al escalar por cantidad
}

// El orden dentro de cada grupo es el orden de la UI. Es una decisión de presentación y por eso
// vive acá, explícito, y no se deriva alfabéticamente de las claves.
export const NUTRIENTS = [
  // --- Grasas ---
  { key: "saturated_fat_g", label: "Grasas saturadas", unit: "g", group: "grasas", decimals: 1 },
  { key: "omega3_g", label: "Omega-3", unit: "g", group: "grasas", decimals: 2 },
  { key: "omega6_g", label: "Omega-6", unit: "g", group: "grasas", decimals: 2 },
  { key: "cholesterol_mg", label: "Colesterol", unit: "mg", group: "grasas", decimals: 1 },
  // --- Carbohidratos ---
  { key: "sugars_g", label: "Azúcares", unit: "g", group: "carbohidratos", decimals: 1 },
  { key: "fiber_g", label: "Fibra", unit: "g", group: "carbohidratos", decimals: 1 },
  // --- Vitaminas (14) ---
  { key: "vitamin_a_mcg", label: "Vitamina A", unit: "mcg", group: "vitaminas", decimals: 1 },
  { key: "vitamin_b1_mg", label: "Vitamina B1 (tiamina)", unit: "mg", group: "vitaminas", decimals: 2 },
  { key: "vitamin_b2_mg", label: "Vitamina B2 (riboflavina)", unit: "mg", group: "vitaminas", decimals: 2 },
  { key: "vitamin_b3_mg", label: "Vitamina B3 (niacina)", unit: "mg", group: "vitaminas", decimals: 1 },
  { key: "vitamin_b5_mg", label: "Vitamina B5 (ác. pantoténico)", unit: "mg", group: "vitaminas", decimals: 2 },
  { key: "vitamin_b6_mg", label: "Vitamina B6 (piridoxina)", unit: "mg", group: "vitaminas", decimals: 2 },
  { key: "vitamin_b7_mcg", label: "Vitamina B7 (biotina)", unit: "mcg", group: "vitaminas", decimals: 1 },
  { key: "vitamin_b9_mcg", label: "Vitamina B9 (folato)", unit: "mcg", group: "vitaminas", decimals: 1 },
  { key: "vitamin_b12_mcg", label: "Vitamina B12 (cobalamina)", unit: "mcg", group: "vitaminas", decimals: 2 },
  { key: "vitamin_c_mg", label: "Vitamina C", unit: "mg", group: "vitaminas", decimals: 1 },
  { key: "vitamin_d_mcg", label: "Vitamina D", unit: "mcg", group: "vitaminas", decimals: 2 },
  { key: "vitamin_e_mg", label: "Vitamina E", unit: "mg", group: "vitaminas", decimals: 2 },
  { key: "vitamin_k_mcg", label: "Vitamina K", unit: "mcg", group: "vitaminas", decimals: 1 },
  { key: "choline_mg", label: "Colina", unit: "mg", group: "vitaminas", decimals: 1 },
  // --- Minerales (9) ---
  { key: "calcium_mg", label: "Calcio", unit: "mg", group: "minerales", decimals: 1 },
  { key: "iron_mg", label: "Hierro", unit: "mg", group: "minerales", decimals: 2 },
  { key: "magnesium_mg", label: "Magnesio", unit: "mg", group: "minerales", decimals: 1 },
  { key: "iodine_mcg", label: "Yodo", unit: "mcg", group: "minerales", decimals: 1 },
  { key: "phosphorus_mg", label: "Fósforo", unit: "mg", group: "minerales", decimals: 1 },
  { key: "potassium_mg", label: "Potasio", unit: "mg", group: "minerales", decimals: 1 },
  { key: "selenium_mcg", label: "Selenio", unit: "mcg", group: "minerales", decimals: 1 },
  { key: "sodium_mg", label: "Sodio", unit: "mg", group: "minerales", decimals: 1 },
  { key: "zinc_mg", label: "Zinc", unit: "mg", group: "minerales", decimals: 2 },
  // --- Otros ---
  { key: "water_ml", label: "Agua", unit: "ml", group: "carbohidratos", decimals: 1 },
] as const satisfies readonly NutrientDef[];

export type NutrientKey = (typeof NUTRIENTS)[number]["key"];
export const NUTRIENT_KEYS = NUTRIENTS.map((n) => n.key) as NutrientKey[];

// Valores de nutrientes de un alimento o ítem. Todos opcionales y nullable: `null` es "no
// sabemos", que NO es lo mismo que 0.
export type NutrientValues = { [K in NutrientKey]?: number | null };

const GROUP_ORDER: NutrientGroup[] = ["grasas", "carbohidratos", "vitaminas", "minerales"];

export function nutrientsByGroup(): Record<NutrientGroup, NutrientDef[]> {
  const out = Object.fromEntries(GROUP_ORDER.map((g) => [g, [] as NutrientDef[]])) as Record<
    NutrientGroup,
    NutrientDef[]
  >;
  for (const n of NUTRIENTS) out[n.group].push(n);
  return out;
}
