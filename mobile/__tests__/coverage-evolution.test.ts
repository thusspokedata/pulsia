import { coverageEvolution, filterByPeriod } from "../src/nutrition/coverageEvolution";
import type { PerDayNutrients } from "@pulsia/shared";

const MALE = { sex: "male" as const, age: 40 };

test("filterByPeriod: conserva los días dentro de [start,end] por mediodía local", () => {
  const per: PerDayNutrients = { "2026-07-01": { vitamin_c_mg: 1 }, "2026-07-20": { vitamin_c_mg: 1 } };
  const start = new Date(2026, 6, 1).getTime();
  const end = new Date(2026, 6, 15, 23, 59).getTime();
  expect(Object.keys(filterByPeriod(per, { start, end }))).toEqual(["2026-07-01"]);
});

test("coverageEvolution: un punto por período con clasificables, más viejo primero", () => {
  const now = new Date(2026, 6, 20, 12).getTime();
  // Comida cubre vit C en el mes actual; mes previo vacío (se omite).
  const food: PerDayNutrients = { "2026-07-10": { vitamin_c_mg: 200 } };
  const points = coverageEvolution("monthly", 0, 2, food, {}, MALE, { minDataDays: 1 }, now);
  expect(points.length).toBe(1);
  expect(points[0].y).toBe(100);
});
