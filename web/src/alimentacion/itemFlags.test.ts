import { itemFlags } from "./itemFlags";
import type { MealItem } from "@pulsia/shared";

function item(over: Partial<MealItem>): MealItem {
  return {
    id: "1", foodId: null, foodName: "x", quantity: 1, quantityUnit: "g", grams: 100,
    kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
    ...over,
  } as MealItem;
}

test("marca grasa ALTA cuando el per-100 supera el umbral FSA (17.5 g)", () => {
  const flags = itemFlags(item({ grams: 200, fat_g: 40 })); // 20 g/100g → high
  const fat = flags.all.find((f) => f.nutrient === "fat_g");
  expect(fat?.level).toBe("high");
  expect(flags.notable.some((f) => f.nutrient === "fat_g" && f.sentiment === "bad")).toBe(true);
});

test("reconstruye per-100: 6 g de grasa en 300 g es BAJO (2 g/100g), no notable", () => {
  const flags = itemFlags(item({ grams: 300, fat_g: 6 })); // 2 g/100g → low (el crudo 6 sería medium)
  expect(flags.notable.some((f) => f.nutrient === "fat_g")).toBe(false);
});

test("grams 0 no rompe (factor 0)", () => {
  expect(() => itemFlags(item({ grams: 0, fat_g: 10 }))).not.toThrow();
});
