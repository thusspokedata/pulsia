import { computeWaterGoalMl, WATER_GOAL_FALLBACK_ML } from "../src/nutrition/waterGoal";

test("el override manual válido gana sobre el peso", () => {
  expect(computeWaterGoalMl({ overrideMl: 2500, weightKg: 80 })).toBe(2500);
});

test("sin override, usa 35 ml/kg del peso (redondeado)", () => {
  expect(computeWaterGoalMl({ overrideMl: null, weightKg: 80 })).toBe(2800);
  expect(computeWaterGoalMl({ overrideMl: null, weightKg: 72.5 })).toBe(Math.round(35 * 72.5));
});

test("sin override ni peso, cae al fallback fijo", () => {
  expect(computeWaterGoalMl({ overrideMl: null, weightKg: null })).toBe(WATER_GOAL_FALLBACK_ML);
  expect(computeWaterGoalMl({})).toBe(WATER_GOAL_FALLBACK_ML);
});

test("un override inválido (0, negativo, NaN) se ignora y cae a auto", () => {
  expect(computeWaterGoalMl({ overrideMl: 0, weightKg: 80 })).toBe(2800);
  expect(computeWaterGoalMl({ overrideMl: -5, weightKg: 80 })).toBe(2800);
  expect(computeWaterGoalMl({ overrideMl: Number.NaN, weightKg: 80 })).toBe(2800);
});

test("un peso inválido (0, negativo) cae al fallback", () => {
  expect(computeWaterGoalMl({ overrideMl: null, weightKg: 0 })).toBe(WATER_GOAL_FALLBACK_ML);
  expect(computeWaterGoalMl({ overrideMl: null, weightKg: -10 })).toBe(WATER_GOAL_FALLBACK_ML);
});
