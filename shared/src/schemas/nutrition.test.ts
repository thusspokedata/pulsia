import { test, expect } from "bun:test";
import {
  FoodExtractionSchema, FoodSchema, FoodInputSchema,
  MealInputSchema, MealItemInputSchema, MealSchema,
  QuantityUnitSchema, FoodBasisSchema, MealTypeSchema,
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
