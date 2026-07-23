import { test, expect } from "bun:test";
import {
  FoodExtractionSchema, FoodIdentificationSchema, FoodSchema, FoodInputSchema,
  MealInputSchema, MealItemInputSchema, MealItemSchema, MealSchema,
  QuantityUnitSchema, FoodBasisSchema, MealTypeSchema,
  WaterLogInputSchema, WaterLogSchema,
  NutritionObjectiveSchema, NutritionGoalInputSchema,
  SourceMacrosSchema, SourceMicrosSchema,
} from "./nutrition";
import { NUTRIENT_KEYS } from "../nutrition/nutrients";

const extraction = {
  name: "Banana", basis: "per_100g",
  kcal: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3,
  unitWeightG: 120, sourceMacros: "ai", sourceMicros: null,
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
    unitWeightG: null, sourceMacros: "label", sourceMicros: "usda",
    saturated_fat_g: 4.2, sugars_g: 14, fiber_g: 8.4, sodium_mg: 80,
    cholesterol_mg: 12, water_ml: 3,
  };
  expect(FoodExtractionSchema.parse(withMicros)).toMatchObject({ saturated_fat_g: 4.2, sugars_g: 14, fiber_g: 8.4, sodium_mg: 80, cholesterol_mg: 12, water_ml: 3 });
});

test("FoodExtractionSchema permite omitir los micros (estimado)", () => {
  const noMicros = { ...extraction };
  const parsed = FoodExtractionSchema.parse(noMicros);
  expect(parsed.sugars_g ?? null).toBeNull();
});

test("FoodExtractionSchema acepta micros en null", () => {
  const nulled = { ...extraction, saturated_fat_g: null, sugars_g: null, fiber_g: null, sodium_mg: null };
  expect(FoodExtractionSchema.safeParse(nulled).success).toBe(true);
});

test("FoodExtractionSchema rechaza un micro negativo", () => {
  expect(FoodExtractionSchema.safeParse({ ...extraction, sugars_g: -1 }).success).toBe(false);
});

test("FoodExtractionSchema acepta todos los nutrientes del registro", () => {
  const base = {
    ...extraction, name: "Huevo", kcal: 143, protein_g: 12.6, carbs_g: 0.7, fat_g: 9.5,
    unitWeightG: 50, sourceMacros: "ai", sourceMicros: "usda",
    ...Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 1])),
  };
  const r = FoodExtractionSchema.safeParse(base);
  expect(r.success).toBe(true);
  // No alcanza con que parsee: el schema tiene que CONSERVAR los 30. Si un nutriente del
  // registro no estuviera en el schema, Zod lo descartaría en silencio y el safeParse
  // seguiría dando true.
  const parsed = r.success ? (r.data as Record<string, unknown>) : {};
  for (const k of NUTRIENT_KEYS) expect(parsed[k]).toBe(1);
});

test("salt_g ya no forma parte del schema", () => {
  expect(Object.keys(FoodExtractionSchema.shape)).not.toContain("salt_g");
  expect(Object.keys(FoodExtractionSchema.shape)).toContain("sodium_mg");
});

test("source viejo NO se acepta: la migración lo abrió en dos", () => {
  const viejo = {
    name: "X", basis: "per_100g", kcal: 1, protein_g: 1, carbs_g: 1, fat_g: 1,
    unitWeightG: null, source: "estimate",
  };
  expect(FoodExtractionSchema.safeParse(viejo).success).toBe(false);
  // El payload de arriba falla por no traer sourceMacros/sourceMicros, así que por sí solo no
  // probaría que "estimate" dejó de ser un valor válido. Esta segunda mitad sí: trae las dos
  // procedencias nuevas y el único problema es el valor viejo.
  expect(FoodExtractionSchema.safeParse({ ...extraction, sourceMacros: "estimate" }).success).toBe(false);
});

test("sourceMicros acepta null (alimento sin match en USDA)", () => {
  const sinMatch = {
    name: "Dulce de leche", basis: "per_100g", kcal: 315, protein_g: 7, carbs_g: 55, fat_g: 7,
    unitWeightG: null, sourceMacros: "ai", sourceMicros: null,
  };
  const r = FoodExtractionSchema.safeParse(sinMatch);
  expect(r.success).toBe(true);
  expect(r.success && r.data.sourceMicros).toBeNull();

  // Que un objeto con sourceMicros: null parsee NO prueba que el campo exista: Zod ignora las
  // claves de más, así que si sourceMicros se cayera del schema el parseo seguiría dando true.
  // Estas tres son las que realmente lo atan.
  expect(Object.keys(FoodExtractionSchema.shape)).toContain("sourceMicros");
  const { sourceMicros: _omitido, ...faltante } = sinMatch;
  expect(FoodExtractionSchema.safeParse(faltante).success).toBe(false); // es obligatorio, no opcional
  expect(FoodExtractionSchema.safeParse({ ...sinMatch, sourceMicros: "inventado" }).success).toBe(false);
});

test("las dos procedencias tienen los valores de la migración", () => {
  expect(SourceMacrosSchema.options).toEqual(["label", "ai", "manual"]);
  expect(SourceMicrosSchema.safeParse("usda").success).toBe(true);
  expect(SourceMicrosSchema.safeParse("ai").success).toBe(true);
  expect(SourceMicrosSchema.safeParse("manual").success).toBe(false); // los micros no se cargan a mano
});

test("usdaFdcId es opcional y entero", () => {
  expect(FoodExtractionSchema.safeParse({ ...extraction, usdaFdcId: 1750340 }).success).toBe(true);
  expect(FoodExtractionSchema.safeParse({ ...extraction, usdaFdcId: null }).success).toBe(true);
  expect(FoodExtractionSchema.safeParse({ ...extraction, usdaFdcId: 1.5 }).success).toBe(false);
});

const identificacion = {
  name: "Huevo frito", basis: "per_100g",
  kcal: 196, protein_g: 13.6, carbs_g: 0.8, fat_g: 15,
  unitWeightG: 46, sourceMacros: "ai", searchQuery: "egg whole cooked fried",
};

test("FoodIdentificationSchema acepta una identificación válida con searchQuery", () => {
  const r = FoodIdentificationSchema.safeParse(identificacion);
  expect(r.success).toBe(true);
  expect(r.success && r.data.searchQuery).toBe("egg whole cooked fried");
});

test("FoodIdentificationSchema exige searchQuery no vacío", () => {
  const { searchQuery: _q, ...faltante } = identificacion;
  expect(FoodIdentificationSchema.safeParse(faltante).success).toBe(false);
  expect(FoodIdentificationSchema.safeParse({ ...identificacion, searchQuery: "   " }).success).toBe(false);
});

test("FoodIdentificationSchema NO le pide vitaminas ni minerales a la IA", () => {
  // El corazón de la feature: la IA identifica, USDA aporta los micros. Si un vitamin_/mineral
  // apareciera en el schema de identificación, le estaríamos pidiendo al modelo que los invente.
  const claves = Object.keys(FoodIdentificationSchema.shape);
  const microsUsda = NUTRIENT_KEYS.filter(
    (k) => !["saturated_fat_g", "sugars_g", "fiber_g", "sodium_mg", "cholesterol_mg", "water_ml"].includes(k),
  );
  for (const k of microsUsda) expect(claves).not.toContain(k);
  // Y sí conserva los 6 micros de etiqueta.
  for (const k of ["saturated_fat_g", "sugars_g", "fiber_g", "sodium_mg", "cholesterol_mg", "water_ml"]) {
    expect(claves).toContain(k);
  }
});

test("FoodIdentificationSchema: sourceMacros es label|ai (nunca manual: no lo carga la IA)", () => {
  expect(FoodIdentificationSchema.safeParse({ ...identificacion, sourceMacros: "label" }).success).toBe(true);
  expect(FoodIdentificationSchema.safeParse({ ...identificacion, sourceMacros: "manual" }).success).toBe(false);
});

test("MealItemSchema acepta micros snapshoteados o null", () => {
  const item = {
    id: "33333333-3333-4333-8333-333333333333", foodId: null, foodName: "Muesli",
    quantity: 50, quantityUnit: "g", grams: 50, kcal: 221, protein_g: 5, carbs_g: 31.5, fat_g: 7.4,
    saturated_fat_g: 2.1, sugars_g: 7, fiber_g: 4.2, sodium_mg: 40,
    cholesterol_mg: 6, water_ml: 45,
  };
  expect(MealItemSchema.parse(item)).toMatchObject({ sugars_g: 7, fiber_g: 4.2, sodium_mg: 40, cholesterol_mg: 6, water_ml: 45 });
  const legacy = { ...item, saturated_fat_g: undefined, sugars_g: undefined, fiber_g: undefined, sodium_mg: undefined, cholesterol_mg: undefined, water_ml: undefined };
  expect(MealItemSchema.safeParse(legacy).success).toBe(true);
});

test("MealItemSchema también lleva los 30 nutrientes del registro", () => {
  expect(Object.keys(MealItemSchema.shape)).toEqual(expect.arrayContaining([...NUTRIENT_KEYS]));
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
