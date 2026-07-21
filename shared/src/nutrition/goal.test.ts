import { test, expect } from "bun:test";
import { computeNutritionGoal } from "./goal";
import { exerciseAdjustedTargets } from "./goal";
import { saturatedFatRefG } from "./references";

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

test("female usa la constante -161 (por encima del piso)", () => {
  const r = computeNutritionGoal({ sex: "female", age: 30, heightCm: 170, weightKg: 65, activityLevel: "moderate", objective: "maintain", rateKgPerWeek: 0 });
  if (r.status !== "ok") throw new Error("esperaba ok");
  // BMR = 650 + 1062.5 - 150 - 161 = 1401.5 → 1402 ; TDEE = 1401.5*1.55 = 2172.325 → 2172
  expect(r.bmr).toBe(1402);
  expect(r.kcal).toBe(2172);
});

test("factor de actividad active (1.725)", () => {
  const r = computeNutritionGoal({ sex: "male", age: 25, heightCm: 180, weightKg: 75, activityLevel: "active", objective: "maintain", rateKgPerWeek: 0 });
  if (r.status !== "ok") throw new Error("esperaba ok");
  // BMR = 750 + 1125 - 125 + 5 = 1755 ; TDEE = 1755*1.725 = 3027.375 → 3027
  expect(r.bmr).toBe(1755);
  expect(r.kcal).toBe(3027);
});

test("carbos se clampea a 0 si proteína+grasa superan las kcal", () => {
  const r = computeNutritionGoal({ objective: "lose", rateKgPerWeek: 0.5, weightKg: 120, manualKcal: 800 });
  if (r.status !== "ok") throw new Error("esperaba ok");
  expect(r.protein_g).toBe(240); // 120*2.0 = 960 kcal, ya supera las 800
  expect(r.carbs_g).toBe(0);
});

test("manualKcal 0 NO cuenta como override (cae a auto → incompleto sin perfil)", () => {
  const r = computeNutritionGoal({ objective: "maintain", rateKgPerWeek: 0, manualKcal: 0 });
  expect(r.status).toBe("incomplete");
});

test("manual con perfil completo devuelve bmr/tdee informativos (para el gasto neto)", () => {
  const r = computeNutritionGoal({ ...base, objective: "maintain", rateKgPerWeek: 0, manualKcal: 1400 });
  if (r.status !== "ok") throw new Error("esperaba ok");
  expect(r.kcal).toBe(1400);        // la meta sigue siendo la manual
  expect(r.source).toBe("manual");
  expect(r.bmr).toBe(1718);          // informativo (base: male 40a 178cm 80kg)
  expect(r.tdee).toBe(2362);         // 1717.5 * 1.375 → 2362
});

test("manual SIN datos antropométricos sigue con bmr/tdee null", () => {
  const r = computeNutritionGoal({ objective: "maintain", rateKgPerWeek: 0, manualKcal: 2000 });
  if (r.status !== "ok") throw new Error("esperaba ok");
  expect(r.bmr).toBeNull();
  expect(r.tdee).toBeNull();
});

const okGoal = {
  status: "ok" as const, source: "auto" as const,
  kcal: 2112, protein_g: 132, carbs_g: 254, fat_g: 63, bmr: 1700, tdee: 2100,
};

test("el bonus del ejercicio va entero a carbos", () => {
  const t = exerciseAdjustedTargets(okGoal, 1667);
  expect(t.carbs_g).toEqual({ base: 254, bonus: 417, total: 671 }); // 1667/4 = 416.75 → 417
  expect(t.kcal).toEqual({ base: 2112, bonus: 1667, total: 3779 });
});

test("proteína y grasa NO escalan con el ejercicio", () => {
  const t = exerciseAdjustedTargets(okGoal, 1667);
  expect(t.protein_g).toEqual({ base: 132, bonus: 0, total: 132 });
  expect(t.fat_g).toEqual({ base: 63, bonus: 0, total: 63 });
});

test("sin ejercicio todos los total son iguales a los base", () => {
  const t = exerciseAdjustedTargets(okGoal, 0);
  expect(t.kcal).toEqual({ base: 2112, bonus: 0, total: 2112 });
  expect(t.carbs_g).toEqual({ base: 254, bonus: 0, total: 254 });
});

test("ejercicio negativo o no finito se trata como 0, nunca resta meta", () => {
  for (const bad of [-500, NaN, Infinity]) {
    const t = exerciseAdjustedTargets(okGoal, bad);
    expect(t.carbs_g.bonus).toBe(0);
    expect(t.carbs_g.total).toBe(254);
    expect(t.kcal.bonus).toBe(0);
  }
});

// INVARIANTE DEL DISEÑO: los límites de salud no escalan con el gasto. Si alguien "arregla"
// exerciseAdjustedTargets para que infle goal.kcal, este test es el que se pone en rojo.
test("el techo de saturadas NO cambia por haber entrenado", () => {
  const sinEjercicio = saturatedFatRefG(okGoal.kcal);
  const t = exerciseAdjustedTargets(okGoal, 1667);
  expect(saturatedFatRefG(okGoal.kcal)).toBe(sinEjercicio);
  // el total ajustado existe y es mucho mayor, pero NO es lo que alimenta la referencia
  expect(t.kcal.total).toBeGreaterThan(okGoal.kcal);
  expect(saturatedFatRefG(okGoal.kcal)).not.toBe(saturatedFatRefG(t.kcal.total));
});
