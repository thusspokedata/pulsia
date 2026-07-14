import { test, expect } from "bun:test";
import {
  FoodExtractionSchema, FoodSchema, FoodInputSchema,
  MealInputSchema, MealItemInputSchema, MealItemSchema, MealSchema,
  QuantityUnitSchema, FoodBasisSchema, MealTypeSchema,
  WaterLogInputSchema, WaterLogSchema,
  NutritionObjectiveSchema, NutritionGoalInputSchema,
} from "./nutrition";

const extraction = {
  name: "Banana", basis: "per_100g",
  kcal: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3,
  unitWeightG: 120, source: "estimate",
};

test("FoodExtractionSchema acepta un alimento válido", () => {
  expect(FoodExtractionSchema.parse(extraction)).toMatchObject({ name: "Banana", basis: "per_100g" });
});

test("FoodExtractionSchema rechaza kcal negativas", () => {
  expect(FoodExtractionSchema.safeParse({ ...extraction, kcal: -1 }).success).toBe(false);
});

test("FoodExtractionSchema rechaza un nombre en blanco (trim)", () => {
  expect(FoodExtractionSchema.safeParse({ ...extraction, name: "   " }).success).toBe(false);
});

test("unitWeightG puede ser null (líquido/a granel)", () => {
  const liquid = { ...extraction, name: "Leche", basis: "per_100ml", unitWeightG: null };
  expect(FoodExtractionSchema.parse(liquid).unitWeightG).toBeNull();
});

test("FoodSchema exige id y createdAt", () => {
  const food = { ...extraction, id: "11111111-1111-4111-8111-111111111111", createdAt: 1_700_000_000_000 };
  expect(FoodSchema.parse(food).id).toBeString();
  expect(FoodInputSchema.safeParse(food).success).toBe(true); // extra keys se ignoran, base válida
});

test("MealInputSchema exige al menos un ítem", () => {
  expect(MealInputSchema.safeParse({ eatenAt: 1, items: [] }).success).toBe(false);
});

test("MealInputSchema acepta una comida con tipo y nota opcionales", () => {
  const meal = {
    eatenAt: 1_700_000_000_000, mealType: "desayuno", note: "liviano",
    items: [{ foodId: "11111111-1111-4111-8111-111111111111", quantity: 1, quantityUnit: "unit" }],
  };
  expect(MealInputSchema.parse(meal).items).toHaveLength(1);
});

test("MealItemInputSchema rechaza cantidad no positiva", () => {
  expect(MealItemInputSchema.safeParse({ foodId: "11111111-1111-4111-8111-111111111111", quantity: 0, quantityUnit: "g" }).success).toBe(false);
});

test("los enums exponen sus valores", () => {
  expect(QuantityUnitSchema.options).toEqual(["g", "ml", "unit"]);
  expect(FoodBasisSchema.options).toEqual(["per_100g", "per_100ml"]);
  expect(MealTypeSchema.options).toEqual(["desayuno", "almuerzo", "cena", "snack"]);
});

test("MealSchema parsea una comida persistida con ítems snapshot", () => {
  const meal = {
    id: "22222222-2222-4222-8222-222222222222", eatenAt: 1, mealType: null, note: null,
    items: [{
      id: "33333333-3333-4333-8333-333333333333", foodId: null, foodName: "Banana",
      quantity: 1, quantityUnit: "unit", grams: 120, kcal: 107, protein_g: 1.3, carbs_g: 27.6, fat_g: 0.4,
    }],
  };
  expect(MealSchema.parse(meal).items[0].foodName).toBe("Banana");
});

test("FoodExtractionSchema acepta los micros opcionales", () => {
  const withMicros = {
    name: "Muesli", basis: "per_100g", kcal: 442, protein_g: 9.9, carbs_g: 63, fat_g: 14.8,
    unitWeightG: null, source: "label",
    saturated_fat_g: 4.2, sugars_g: 14, fiber_g: 8.4, salt_g: 0.2,
    cholesterol_mg: 12, water_ml: 3,
  };
  expect(FoodExtractionSchema.parse(withMicros)).toMatchObject({ saturated_fat_g: 4.2, sugars_g: 14, fiber_g: 8.4, salt_g: 0.2, cholesterol_mg: 12, water_ml: 3 });
});

test("FoodExtractionSchema permite omitir los micros (estimado)", () => {
  const noMicros = { name: "Banana", basis: "per_100g", kcal: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3, unitWeightG: 120, source: "estimate" };
  const parsed = FoodExtractionSchema.parse(noMicros);
  expect(parsed.sugars_g ?? null).toBeNull();
});

test("FoodExtractionSchema acepta micros en null", () => {
  const nulled = { name: "X", basis: "per_100g", kcal: 1, protein_g: 0, carbs_g: 0, fat_g: 0, unitWeightG: null, source: "estimate", saturated_fat_g: null, sugars_g: null, fiber_g: null, salt_g: null };
  expect(FoodExtractionSchema.safeParse(nulled).success).toBe(true);
});

test("FoodExtractionSchema rechaza un micro negativo", () => {
  const bad = { name: "X", basis: "per_100g", kcal: 1, protein_g: 0, carbs_g: 0, fat_g: 0, unitWeightG: null, source: "estimate", sugars_g: -1 };
  expect(FoodExtractionSchema.safeParse(bad).success).toBe(false);
});

test("MealItemSchema acepta micros snapshoteados o null", () => {
  const item = {
    id: "33333333-3333-4333-8333-333333333333", foodId: null, foodName: "Muesli",
    quantity: 50, quantityUnit: "g", grams: 50, kcal: 221, protein_g: 5, carbs_g: 31.5, fat_g: 7.4,
    saturated_fat_g: 2.1, sugars_g: 7, fiber_g: 4.2, salt_g: 0.1,
    cholesterol_mg: 6, water_ml: 45,
  };
  expect(MealItemSchema.parse(item)).toMatchObject({ sugars_g: 7, fiber_g: 4.2, cholesterol_mg: 6, water_ml: 45 });
  const legacy = { ...item, saturated_fat_g: undefined, sugars_g: undefined, fiber_g: undefined, salt_g: undefined, cholesterol_mg: undefined, water_ml: undefined };
  expect(MealItemSchema.safeParse(legacy).success).toBe(true);
});

test("WaterLogInputSchema acepta ml positivo + loggedAt, rechaza ml <= 0 y dedazos", () => {
  expect(WaterLogInputSchema.safeParse({ ml: 250, loggedAt: 1_700_000_000_000 }).success).toBe(true);
  expect(WaterLogInputSchema.safeParse({ ml: 0, loggedAt: 1 }).success).toBe(false);
  expect(WaterLogInputSchema.safeParse({ ml: -5, loggedAt: 1 }).success).toBe(false);
  expect(WaterLogInputSchema.safeParse({ ml: 999999, loggedAt: 1 }).success).toBe(false); // tope anti-dedazo (max 5000)
});

test("WaterLogSchema exige id uuid", () => {
  const ok = WaterLogSchema.safeParse({ id: "11111111-1111-4111-8111-111111111111", ml: 250, loggedAt: 1 });
  expect(ok.success).toBe(true);
  expect(WaterLogSchema.safeParse({ id: "no-uuid", ml: 250, loggedAt: 1 }).success).toBe(false);
});

test("NutritionGoalInputSchema acepta objetivo + ritmo, rechaza objetivo inválido", () => {
  expect(NutritionGoalInputSchema.safeParse({ objective: "lose", rateKgPerWeek: 0.5 }).success).toBe(true);
  expect(NutritionGoalInputSchema.safeParse({ objective: "maintain", rateKgPerWeek: 0, manualKcal: 2200 }).success).toBe(true);
  expect(NutritionGoalInputSchema.safeParse({ objective: "bulk", rateKgPerWeek: 0.5 }).success).toBe(false);
  expect(NutritionGoalInputSchema.safeParse({ objective: "gain", rateKgPerWeek: 5 }).success).toBe(false); // rate > 1
  expect(NutritionGoalInputSchema.safeParse({ objective: "lose", rateKgPerWeek: 0.25, manualKcal: -5 }).success).toBe(false);
});
