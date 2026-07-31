import { test, expect } from "bun:test";
import { coveragePeriod, coverageReference, COVERAGE_TOLERANCE, type PerDayNutrients } from "./coverage";

const MALE = { sex: "male" as const, age: 40 };

test("coverageReference: pisos sí, techos no", () => {
  expect(coverageReference("vitamin_d_mcg", MALE)).toBe(15); // EFSA AI
  expect(coverageReference("fiber_g", MALE)).toBe(30); // references.ts
  expect(coverageReference("sodium_mg", MALE)).toBeNull(); // techo (EFSA null)
  expect(coverageReference("cholesterol_mg", MALE)).toBeNull(); // techo
  expect(coverageReference("vitamin_b1_mg", MALE)).toBeNull(); // EFSA proporcional a energía → null
});

test("clasifica food / supplement / uncovered con banda del 10%", () => {
  const food: PerDayNutrients = {
    "2026-07-01": { vitamin_c_mg: 100, vitamin_d_mcg: 1, calcium_mg: 300 },
    "2026-07-02": { vitamin_c_mg: 100, vitamin_d_mcg: 1, calcium_mg: 300 },
  };
  const supp: PerDayNutrients = {
    "2026-07-01": { vitamin_d_mcg: 20 },
    "2026-07-02": { vitamin_d_mcg: 20 },
  };
  const r = coveragePeriod(food, supp, MALE, { minDataDays: 1 });
  const byKey = Object.fromEntries(r.byNutrient.map((n) => [n.key, n.state]));
  expect(byKey["vitamin_c_mg"]).toBe("food");
  expect(byKey["vitamin_d_mcg"]).toBe("supplement");
  expect(byKey["calcium_mg"]).toBe("uncovered");
  expect(r.daysRegistered).toBe(2);
  // Fija el denominador de suppAvg = daysRegistered (40 en 2 días → 20), no el nº de tomas.
  const dRow = r.byNutrient.find((n) => n.key === "vitamin_d_mcg")!;
  expect(dRow.suppAvg).toBe(20);
});

test("días vacíos de suplemento (placeholders del endpoint) no cuentan como registrados", () => {
  // range-nutrients-daily devuelve una entrada por CADA día del rango, incluso los sin toma
  // (`totals` vacío). Esos {} no son registros: daysRegistered debe contar solo el día con comida.
  const food: PerDayNutrients = { "2026-07-10": { vitamin_c_mg: 200 } };
  const supp: PerDayNutrients = {
    "2026-07-08": {}, "2026-07-09": {}, "2026-07-10": {}, "2026-07-11": {}, "2026-07-12": {},
  };
  const r = coveragePeriod(food, supp, MALE, { minDataDays: 1 });
  expect(r.daysRegistered).toBe(1);
});

test("food desconocida + suplemento insuficiente y con muchos días → few_data, no uncovered", () => {
  // calcium ref(male,40)=950. Comida nunca declara calcio (null); suplemento aporta 100/día por 5
  // días (muy por debajo del piso). Como la comida es DESCONOCIDA, no podemos afirmar "sin cubrir":
  // el estado honesto es "pocos datos", no "uncovered" (spec §4.1).
  const supp: PerDayNutrients = {
    "2026-07-01": { calcium_mg: 100 }, "2026-07-02": { calcium_mg: 100 },
    "2026-07-03": { calcium_mg: 100 }, "2026-07-04": { calcium_mg: 100 }, "2026-07-05": { calcium_mg: 100 },
  };
  const r = coveragePeriod({}, supp, MALE, { minDataDays: 3 });
  const cal = r.byNutrient.find((n) => n.key === "calcium_mg")!;
  expect(cal.foodAvg).toBeNull();
  expect(cal.daysWithData).toBe(0);
  expect(cal.state).toBe("few_data");
});

test("pocos datos: bajo minDataDays y sin cubrir → few_data (no uncovered)", () => {
  const food: PerDayNutrients = { "2026-07-01": { calcium_mg: 100 } };
  const r = coveragePeriod(food, {}, MALE, { minDataDays: 3 });
  const cal = r.byNutrient.find((n) => n.key === "calcium_mg")!;
  expect(cal.state).toBe("few_data");
  expect(cal.daysWithData).toBe(1);
});

test("null ≠ 0 en comida no esconde el aporte del suplemento", () => {
  const food: PerDayNutrients = { "2026-07-01": { calcium_mg: 950 } };
  const supp: PerDayNutrients = { "2026-07-01": { vitamin_d_mcg: 20 } };
  const r = coveragePeriod(food, supp, MALE, { minDataDays: 1 });
  const d = r.byNutrient.find((n) => n.key === "vitamin_d_mcg")!;
  expect(d.foodAvg).toBeNull();
  expect(d.state).toBe("supplement");
});

test("onlyFoodPct excluye few_data y no clasificables", () => {
  const food: PerDayNutrients = { "2026-07-01": { vitamin_c_mg: 200, calcium_mg: 10 } };
  const r = coveragePeriod(food, {}, MALE, { minDataDays: 3 });
  expect(r.onlyFoodPct).toBe(100);
  expect(r.counts.food).toBe(1);
  expect(r.counts.fewData).toBe(1);
});

test("banda exacta: 90% cuenta, 89% no", () => {
  const ref = coverageReference("vitamin_c_mg", MALE)!; // 110
  const at90: PerDayNutrients = { d: { vitamin_c_mg: COVERAGE_TOLERANCE * ref } };
  const at89: PerDayNutrients = { d: { vitamin_c_mg: 0.89 * ref } };
  expect(coveragePeriod(at90, {}, MALE, { minDataDays: 1 }).byNutrient.find((n) => n.key === "vitamin_c_mg")!.state).toBe("food");
  expect(coveragePeriod(at89, {}, MALE, { minDataDays: 1 }).byNutrient.find((n) => n.key === "vitamin_c_mg")!.state).toBe("uncovered");
});
