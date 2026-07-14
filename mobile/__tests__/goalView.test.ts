import { buildGoalView } from "../src/nutrition/goalView";
import type { NutritionGoalResult } from "@pulsia/shared";

const comido = { kcal: 1200, protein_g: 90, carbs_g: 120, fat_g: 40 };

test("ok: arma meta/comido/restante + barras por macro", () => {
  const goal: NutritionGoalResult = { status: "ok", source: "auto", kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60, bmr: 1600, tdee: 2000 };
  const v = buildGoalView(goal, comido);
  expect(v.status).toBe("ok");
  expect(v.kcal).toEqual({ meta: 2000, comido: 1200, restante: 800 });
  const prot = v.macros!.find((m) => m.key === "protein")!;
  expect(prot).toMatchObject({ comido: 90, meta: 150, restante: 60, pct: 60 });
});

test("restante negativo si comido supera la meta; pct clamp a 100", () => {
  const goal: NutritionGoalResult = { status: "ok", source: "auto", kcal: 1000, protein_g: 50, carbs_g: 100, fat_g: 30, bmr: 900, tdee: 1000 };
  const v = buildGoalView(goal, comido);
  expect(v.kcal!.restante).toBe(-200);
  expect(v.macros!.find((m) => m.key === "protein")!.pct).toBe(100);
});

test("incompleto propaga missing", () => {
  const v = buildGoalView({ status: "incomplete", missing: ["edad", "peso"] }, comido);
  expect(v.status).toBe("incomplete");
  expect(v.missing).toEqual(["edad", "peso"]);
});
