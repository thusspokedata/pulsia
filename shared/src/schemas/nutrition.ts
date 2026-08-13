import { z } from "zod";
import { NUTRIENTS } from "../nutrition/nutrients";

export const FoodBasisSchema = z.enum(["per_100g", "per_100ml"]); // sólido vs líquido
export const QuantityUnitSchema = z.enum(["g", "ml", "unit"]);
export const MealTypeSchema = z.enum(["desayuno", "almuerzo", "cena", "snack"]);

export type FoodBasis = z.infer<typeof FoodBasisSchema>;
export type QuantityUnit = z.infer<typeof QuantityUnitSchema>;
export type MealType = z.infer<typeof MealTypeSchema>;

// Procedencia de los macros y de los micros de etiqueta. `estimate` se abrió en `ai` (lo estimó
// el modelo) y `manual` (lo cargó el usuario a mano): la distinción estaba pendiente en el
// backlog y la migración se hacía igual. `usda` = los macros salieron de la base de composición
// de USDA (no de una etiqueta, ni de la IA, ni tipeados a mano): lo usa el seed del catálogo
// base, que arma cada alimento entero desde una fila de USDA. Es una fuente real, como `label`.
// `recipe` = macros COMPUESTOS desde los ingredientes de una receta (no de etiqueta/USDA/IA/manual).
export const SourceMacrosSchema = z.enum(["label", "ai", "manual", "usda", "recipe"]);
export type SourceMacros = z.infer<typeof SourceMacrosSchema>;

// Procedencia del bloque de vitaminas y minerales. null = no se pudo matchear contra USDA y el
// bloque quedó vacío (NO es lo mismo que valores en 0).
export const SourceMicrosSchema = z.enum(["usda", "ai"]).nullable();
export type SourceMicros = z.infer<typeof SourceMicrosSchema>;

// Macros por 100g/100ml. Obligatorios y no-nullable: son el núcleo, y a diferencia de los
// micros siempre hay un valor (aunque sea estimado).
const macrosPer100 = {
  kcal: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
};

// Los 30 nutrientes salen del REGISTRO, no de una lista repetida acá: agregar uno en
// nutrients.ts lo agrega al schema, al escalado y a las sumas de una sola vez.
// Todos OPCIONALES + nullable: la IA puede omitirlos, un alimento sin match en USDA los deja
// vacíos, y los alimentos/comidas viejos no los tienen. `null` es "no sabemos", que NO es 0.
const nutrientFields = Object.fromEntries(
  NUTRIENTS.map((n) => [n.key, z.number().nonnegative().nullable().optional()]),
) as Record<(typeof NUTRIENTS)[number]["key"], z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;

// Lo que la IA extrae de la foto (output estructurado). Sin id/userId.
export const FoodExtractionSchema = z.object({
  name: z.string().trim().min(1),
  basis: FoodBasisSchema,
  ...macrosPer100,
  ...nutrientFields,
  // "1 unidad" en la base del alimento (g si per_100g, ml si per_100ml). null si no es contable.
  unitWeightG: z.number().positive().nullable(),
  sourceMacros: SourceMacrosSchema,
  sourceMicros: SourceMicrosSchema,
  // fdcId de la fila de USDA usada, para rastrear de dónde salieron los micros y re-matchear
  // después. null si no hubo match.
  usdaFdcId: z.number().int().nullable().optional(),
});
export type FoodExtraction = z.infer<typeof FoodExtractionSchema>;

// Lo que la 1ª llamada de IA devuelve: identifica el alimento y da una frase de búsqueda. NO
// incluye vitaminas ni minerales — esos los aporta USDA. Los "micros de etiqueta" (saturadas,
// azúcares, fibra, sodio, colesterol, agua) SÍ los da, porque son legibles de una etiqueta y son
// los mismos 6 que la app ya manejaba.
export const FoodIdentificationSchema = z.object({
  name: z.string().trim().min(1),
  basis: FoodBasisSchema,
  // Macros: de la etiqueta si hay, estimados si no.
  kcal: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
  // Micros legibles de una etiqueta (los 6 de siempre; sal ya convertida a sodio).
  saturated_fat_g: z.number().nonnegative().nullable().optional(),
  sugars_g: z.number().nonnegative().nullable().optional(),
  fiber_g: z.number().nonnegative().nullable().optional(),
  sodium_mg: z.number().nonnegative().nullable().optional(),
  cholesterol_mg: z.number().nonnegative().nullable().optional(),
  water_ml: z.number().nonnegative().nullable().optional(),
  unitWeightG: z.number().positive().nullable(),
  // "label" si leyó una tabla nutricional; "ai" si estimó.
  sourceMacros: z.enum(["label", "ai"]),
  // Frase de búsqueda en INGLÉS para matchear contra USDA.
  searchQuery: z.string().trim().min(1),
});
export type FoodIdentification = z.infer<typeof FoodIdentificationSchema>;

// Lo que estima la IA cuando el usuario descarta USDA: SOLO el bloque de micronutrientes (los 30
// del registro), por 100 g/ml, todos nullable/opcionales. NO incluye macros: esos ya existen en la
// identificación/alimento y no se re-estiman. Se deriva de `nutrientFields` (misma fuente que el
// resto del schema) para que un nutriente nuevo caiga solo.
export const FoodMicrosEstimateSchema = z.object(nutrientFields);
export type FoodMicrosEstimate = z.infer<typeof FoodMicrosEstimateSchema>;

// Un ingrediente de una receta: referencia a un Food del catálogo + cantidad cruda en su unidad.
export const RecipeItemInputSchema = z.object({
  foodId: z.string().uuid(),
  quantity: z.number().positive(),
  unit: QuantityUnitSchema,
});
export type RecipeItemInput = z.infer<typeof RecipeItemInputSchema>;

// La composición viva de una receta. Se guarda en el Food (JSONB) para poder editar y recalcular.
// cookedWeightG = peso del plato terminado; null = usar la suma de los pesos de los ingredientes.
// El agua agregada/evaporada queda capturada por cookedWeightG cuando el usuario pesa el plato.
export const RecipeSchema = z.object({
  items: z.array(RecipeItemInputSchema).min(1),
  cookedWeightG: z.number().positive().nullable(),
});
export type Recipe = z.infer<typeof RecipeSchema>;

// Alta/edición de un alimento del catálogo (lo que confirma el usuario). `recipe` presente = el
// Food es una receta (sus macros/micros per-100g se derivan de los ingredientes); ausente = un
// alimento común. La IA nunca lo emite (FoodExtractionSchema no lo tiene).
export const FoodInputSchema = FoodExtractionSchema.extend({
  recipe: RecipeSchema.nullable().optional(),
});
export type FoodInput = z.infer<typeof FoodInputSchema>;

// Alimento persistido / devuelto por el backend.
export const FoodSchema = FoodInputSchema.extend({
  id: z.string().uuid(),
  createdAt: z.number().int(),
  // Sólo lectura: lo setea el backend (no viene en el alta/edición). true si el alimento lo creó
  // quien hace el request. Es la base del catálogo compartido entre usuarios.
  mine: z.boolean().optional(),
});
export type Food = z.infer<typeof FoodSchema>;

// Un ítem al crear una comida (lo que manda el móvil): referencia + cantidad cruda.
export const MealItemInputSchema = z.object({
  foodId: z.string().uuid(),
  quantity: z.number().positive(),
  quantityUnit: QuantityUnitSchema,
});
export type MealItemInput = z.infer<typeof MealItemInputSchema>;

// Crear/editar una comida.
export const MealInputSchema = z.object({
  eatenAt: z.number().int(),
  mealType: MealTypeSchema.nullable().optional(),
  note: z.string().nullable().optional(),
  items: z.array(MealItemInputSchema).min(1),
});
export type MealInput = z.infer<typeof MealInputSchema>;

// Ítem persistido: cantidad cruda + snapshot de macros YA escalados a este ítem.
export const MealItemSchema = z.object({
  id: z.string().uuid(),
  foodId: z.string().uuid().nullable(), // null si el alimento se borró luego
  foodName: z.string(),
  quantity: z.number(),
  quantityUnit: QuantityUnitSchema,
  grams: z.number(),
  ...macrosPer100,
  ...nutrientFields,
});
export type MealItem = z.infer<typeof MealItemSchema>;

// Comida persistida / devuelta.
export const MealSchema = z.object({
  id: z.string().uuid(),
  eatenAt: z.number().int(),
  mealType: MealTypeSchema.nullable(),
  note: z.string().nullable(),
  items: z.array(MealItemSchema),
});
export type Meal = z.infer<typeof MealSchema>;

// Agua tomada (registro rápido): ml + momento. El aporte de agua de los alimentos va aparte (water_ml del ítem).
export const WaterLogInputSchema = z.object({
  ml: z.number().positive().max(5000), // tope anti-dedazo por carga (una botella grande ~2L; 5000 deja margen)
  loggedAt: z.number().int(),
});
export type WaterLogInput = z.infer<typeof WaterLogInputSchema>;

export const WaterLogSchema = WaterLogInputSchema.extend({
  id: z.string().uuid(),
});
export type WaterLog = z.infer<typeof WaterLogSchema>;

// Objetivo nutricional (input del usuario para calcular la meta calórica). El cálculo vive en nutrition/goal.ts.
export const NutritionObjectiveSchema = z.enum(["lose", "maintain", "gain"]);
export type NutritionObjective = z.infer<typeof NutritionObjectiveSchema>;

export const NutritionGoalInputSchema = z.object({
  objective: NutritionObjectiveSchema,
  rateKgPerWeek: z.number().min(0).max(1),                 // la UI usa 0.25 / 0.5; ignorado si maintain
  manualKcal: z.number().int().positive().max(10000).nullable().optional(), // override total (fallback)
});
export type NutritionGoalInput = z.infer<typeof NutritionGoalInputSchema>;
