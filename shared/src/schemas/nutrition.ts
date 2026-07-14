import { z } from "zod";

export const FoodBasisSchema = z.enum(["per_100g", "per_100ml"]); // sólido vs líquido
export const QuantityUnitSchema = z.enum(["g", "ml", "unit"]);
export const FoodSourceSchema = z.enum(["label", "estimate"]);
export const MealTypeSchema = z.enum(["desayuno", "almuerzo", "cena", "snack"]);

export type FoodBasis = z.infer<typeof FoodBasisSchema>;
export type QuantityUnit = z.infer<typeof QuantityUnitSchema>;
export type FoodSource = z.infer<typeof FoodSourceSchema>;
export type MealType = z.infer<typeof MealTypeSchema>;

// Macros por 100g/100ml (núcleo; extensible a micros después).
const macrosPer100 = {
  kcal: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
};

// Micros de etiqueta (por 100g/100ml). Todos OPCIONALES + nullable: la IA puede omitirlos y
// los alimentos/comidas viejos no los tienen.
const microsPer100 = {
  saturated_fat_g: z.number().nonnegative().nullable().optional(),
  sugars_g: z.number().nonnegative().nullable().optional(),
  fiber_g: z.number().nonnegative().nullable().optional(),
  salt_g: z.number().nonnegative().nullable().optional(),
  cholesterol_mg: z.number().nonnegative().nullable().optional(), // mg (no g)
  water_ml: z.number().nonnegative().nullable().optional(),        // aporte de agua por 100g/ml
};

// Lo que la IA extrae de la foto (output estructurado). Sin id/userId.
export const FoodExtractionSchema = z.object({
  name: z.string().trim().min(1),
  basis: FoodBasisSchema,
  ...macrosPer100,
  ...microsPer100,
  // "1 unidad" en la base del alimento (g si per_100g, ml si per_100ml). null si no es contable.
  unitWeightG: z.number().positive().nullable(),
  source: FoodSourceSchema,
});
export type FoodExtraction = z.infer<typeof FoodExtractionSchema>;

// Alta/edición de un alimento del catálogo (lo que confirma el usuario).
export const FoodInputSchema = FoodExtractionSchema;
export type FoodInput = z.infer<typeof FoodInputSchema>;

// Alimento persistido / devuelto por el backend.
export const FoodSchema = FoodInputSchema.extend({
  id: z.string().uuid(),
  createdAt: z.number().int(),
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
  ...microsPer100,
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
  ml: z.number().positive(),
  loggedAt: z.number().int(),
});
export type WaterLogInput = z.infer<typeof WaterLogInputSchema>;

export const WaterLogSchema = WaterLogInputSchema.extend({
  id: z.string().uuid(),
});
export type WaterLog = z.infer<typeof WaterLogSchema>;
