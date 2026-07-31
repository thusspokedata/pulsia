import { mealsToPerDayNutrients, suppPerDayToNutrients } from "../src/nutrition/coverageData";
import type { Meal } from "@pulsia/shared";

const item = (v: Partial<Record<string, number | null>>) => ({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, ...v }) as any;
const meal = (eatenAt: number, items: any[]): Meal => ({ id: "m", eatenAt, mealType: "lunch", note: null, items }) as any;

test("mealsToPerDayNutrients: suma por día, null si ningún ítem declara", () => {
  const t = new Date(2026, 6, 1, 13).getTime(); // 1 jul 13:00 local
  const per = mealsToPerDayNutrients([
    meal(t, [item({ vitamin_c_mg: 40 }), item({ vitamin_c_mg: 10, calcium_mg: 100 })]),
  ]);
  expect(per["2026-07-01"].vitamin_c_mg).toBe(50);
  expect(per["2026-07-01"].calcium_mg).toBe(100);
  expect(per["2026-07-01"].vitamin_d_mcg).toBeNull(); // nadie lo declaró
});

test("suppPerDayToNutrients: mapea totals a PerDayNutrients", () => {
  const per = suppPerDayToNutrients({
    "2026-07-01": { totals: { vitamin_d_mcg: 20 }, byNutrient: {} },
    "2026-07-02": { totals: {}, byNutrient: {} },
  });
  expect(per["2026-07-01"].vitamin_d_mcg).toBe(20);
  expect(per["2026-07-02"]).toEqual({});
});
