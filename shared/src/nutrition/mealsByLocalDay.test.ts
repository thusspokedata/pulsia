import { describe, it, expect } from "bun:test";
import { mealsByLocalDay } from "./mealsByLocalDay";
import type { Meal } from "../schemas/nutrition";

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function meal(eatenAt: number, kcal: number, protein: number, micros: Record<string, number> = {}): Meal {
  return {
    id: crypto.randomUUID(), eatenAt, mealType: null, note: null,
    items: [{
      id: crypto.randomUUID(), foodId: null, foodName: "x", quantity: 1, quantityUnit: "unit", grams: 100,
      kcal, protein_g: protein, carbs_g: 0, fat_g: 0, ...micros,
    } as Meal["items"][number]],
  };
}

const D1 = Date.UTC(2026, 6, 10, 12);
const D2 = Date.UTC(2026, 6, 11, 12);

describe("mealsByLocalDay", () => {
  it("agrupa por día y suma macros", () => {
    const out = mealsByLocalDay([meal(D1, 500, 30), meal(D1, 300, 20), meal(D2, 400, 10)], dayKey);
    expect(out["2026-07-10"].kcal).toBe(800);
    expect(out["2026-07-10"].protein_g).toBe(50);
    expect(out["2026-07-11"].kcal).toBe(400);
  });

  it("un micro es null el día que NINGÚN ítem lo declaró, y suma los presentes", () => {
    const out = mealsByLocalDay(
      [meal(D1, 100, 0, { iron_mg: 2 }), meal(D1, 100, 0, {})],
      dayKey,
    );
    expect(out["2026-07-10"].nutrients.iron_mg).toBe(2);
    expect(out["2026-07-10"].nutrients.calcium_mg).toBeUndefined();
  });

  it("comidas vacías → objeto vacío", () => {
    expect(mealsByLocalDay([], dayKey)).toEqual({});
  });
});
