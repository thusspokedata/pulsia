import { test, expect } from "bun:test";
import { computeNutritionGoal } from "./goal";
import { buildGoalRationale } from "./goalRationale";

const base = { sex: "male", age: 30, heightCm: 180, weightKg: 80, activityLevel: "moderate" } as const;

test("meta automática: explica TDEE, ajuste por objetivo y proteína", () => {
  const goal = computeNutritionGoal({ ...base, objective: "lose", rateKgPerWeek: 0.5 });
  if (goal.status !== "ok") throw new Error("esperaba ok");
  const { lines } = buildGoalRationale(goal, { ...base, objective: "lose", rateKgPerWeek: 0.5 });
  const text = lines.join("\n");
  expect(text).toContain(String(goal.tdee));      // menciona el TDEE calculado
  expect(text).toContain(String(goal.kcal));      // menciona la meta
  expect(text).toContain(String(goal.protein_g)); // proteína
  expect(text.toLowerCase()).toContain("déficit"); // objetivo lose
});

test("meta manual: NO inventa TDEE como origen de la meta", () => {
  const goal = computeNutritionGoal({ ...base, objective: "maintain", rateKgPerWeek: 0, manualKcal: 2222 });
  if (goal.status !== "ok") throw new Error("esperaba ok");
  const { lines } = buildGoalRationale(goal, { ...base, objective: "maintain", rateKgPerWeek: 0, manualKcal: 2222 });
  const text = lines.join("\n").toLowerCase();
  expect(text).toContain("2222");
  expect(text).toContain("fijaste"); // el usuario fijó la meta
});

test("mantener: sin ajuste por objetivo", () => {
  const goal = computeNutritionGoal({ ...base, objective: "maintain", rateKgPerWeek: 0 });
  if (goal.status !== "ok") throw new Error("esperaba ok");
  const text = buildGoalRationale(goal, { ...base, objective: "maintain", rateKgPerWeek: 0 }).lines.join("\n").toLowerCase();
  expect(text).toContain("mantener");
});
