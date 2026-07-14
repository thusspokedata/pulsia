import { test, expect } from "bun:test";
import { computeNutritionGoal } from "./goal";

const base = { sex: "male" as const, age: 40, heightCm: 178, weightKg: 80, activityLevel: "light" as const };

test("meta auto para mantenimiento (BMR Mifflin × actividad)", () => {
  const r = computeNutritionGoal({ ...base, objective: "maintain", rateKgPerWeek: 0 });
  if (r.status !== "ok") throw new Error("esperaba ok");
  // BMR = 10*80 + 6.25*178 - 5*40 + 5 = 1717.5 ; TDEE crudo = 1717.5*1.375 = 2361.5625 → round 2362
  expect(r.bmr).toBe(1718);
  expect(r.kcal).toBe(2362);
  expect(r.source).toBe("auto");
});

test("perder aplica déficit por ritmo (0.5 kg/sem ≈ -550)", () => {
  const r = computeNutritionGoal({ ...base, objective: "lose", rateKgPerWeek: 0.5 });
  if (r.status !== "ok") throw new Error("esperaba ok");
  expect(r.kcal).toBe(2362 - 550); // tdee crudo 2361.5625 - 550 = 1811.5625 → round 1812
  expect(r.protein_g).toBe(160);   // 80 * 2.0 en déficit
});

test("ganar aplica superávit; proteína 1.8 g/kg fuera de déficit", () => {
  const r = computeNutritionGoal({ ...base, objective: "gain", rateKgPerWeek: 0.25 });
  if (r.status !== "ok") throw new Error("esperaba ok");
  expect(r.kcal).toBe(2362 + 275); // tdee crudo 2361.5625 + 275 = 2636.5625 → round 2637
  expect(r.protein_g).toBe(144);   // 80 * 1.8
});

test("piso de 1500 kcal", () => {
  const r = computeNutritionGoal({ sex: "female", age: 30, heightCm: 155, weightKg: 50, activityLevel: "sedentary", objective: "lose", rateKgPerWeek: 0.5 });
  if (r.status !== "ok") throw new Error("esperaba ok");
  expect(r.kcal).toBe(1500);
});

test("manualKcal pisa el cálculo (source manual, sin piso)", () => {
  const r = computeNutritionGoal({ ...base, objective: "maintain", rateKgPerWeek: 0, manualKcal: 1400 });
  if (r.status !== "ok") throw new Error("esperaba ok");
  expect(r.kcal).toBe(1400);
  expect(r.source).toBe("manual");
});

test("carbos = resto y nunca negativos", () => {
  const r = computeNutritionGoal({ ...base, objective: "maintain", rateKgPerWeek: 0 });
  if (r.status !== "ok") throw new Error("esperaba ok");
  // kcal 2362, prot 144g(576), grasa round(2362*0.27/9)=71g(639) → carbos=(2362-576-639)/4=286.75→287
  expect(r.fat_g).toBe(71);
  expect(r.carbs_g).toBe(287);
});

test("sexo other usa constante promedio (-78)", () => {
  const r = computeNutritionGoal({ ...base, sex: "other", objective: "maintain", rateKgPerWeek: 0 });
  if (r.status !== "ok") throw new Error("esperaba ok");
  // BMR = 1717.5 - 5 (male era +5) ... other = -78 → 1634.5 → round 1635
  expect(r.bmr).toBe(1635);
});

test("incompleto lista lo que falta (sin manual)", () => {
  const r = computeNutritionGoal({ sex: "male", objective: "maintain", rateKgPerWeek: 0 });
  expect(r.status).toBe("incomplete");
  if (r.status !== "incomplete") throw new Error("");
  expect(r.missing).toEqual(["edad", "altura", "peso"]);
});

test("manual sin peso: macros por % (no rompe)", () => {
  const r = computeNutritionGoal({ objective: "maintain", rateKgPerWeek: 0, manualKcal: 2000 });
  if (r.status !== "ok") throw new Error("esperaba ok");
  expect(r.protein_g).toBe(125); // 2000*0.25/4
});
