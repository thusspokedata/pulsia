import { adjustmentDateForReport } from "../src/nutrition/adjustmentDate";

const NOW = new Date("2026-07-14T15:00:00").getTime(); // martes 14 jul 2026

test("daily offset 0 (informe de hoy): ajuste = mañana (15 jul)", () => {
  expect(adjustmentDateForReport("daily", 0, NOW)).toBe("2026-07-15");
});

test("daily offset > 0 (informe de un día pasado): NO ajusta — evita pisar el ajuste real de un día posterior", () => {
  // Regenerar el informe de ayer no debe dejar un ajuste para hoy (pisaría al de hoy, único por día).
  expect(adjustmentDateForReport("daily", 1, NOW)).toBeUndefined();
  expect(adjustmentDateForReport("daily", 10, NOW)).toBeUndefined();
});

test("weekly/biweekly/monthly: no manda adjustmentForDate (undefined)", () => {
  expect(adjustmentDateForReport("weekly", 0, NOW)).toBeUndefined();
  expect(adjustmentDateForReport("biweekly", 0, NOW)).toBeUndefined();
  expect(adjustmentDateForReport("monthly", 0, NOW)).toBeUndefined();
});
