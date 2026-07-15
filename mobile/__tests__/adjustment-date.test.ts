import { adjustmentDateForReport } from "../src/nutrition/adjustmentDate";

const NOW = new Date("2026-07-14T15:00:00").getTime(); // martes 14 jul 2026

test("daily offset 0 (informe de hoy): ajuste = mañana (15 jul)", () => {
  expect(adjustmentDateForReport("daily", 0, NOW)).toBe("2026-07-15");
});

test("daily offset 1 (informe de ayer): ajuste = hoy (14 jul)", () => {
  expect(adjustmentDateForReport("daily", 1, NOW)).toBe("2026-07-14");
});

test("daily offset grande (informe de hace 10 días): ajuste sigue siendo día+1", () => {
  expect(adjustmentDateForReport("daily", 10, NOW)).toBe("2026-07-05");
});

test("weekly/biweekly/monthly: no manda adjustmentForDate (undefined)", () => {
  expect(adjustmentDateForReport("weekly", 0, NOW)).toBeUndefined();
  expect(adjustmentDateForReport("biweekly", 0, NOW)).toBeUndefined();
  expect(adjustmentDateForReport("monthly", 0, NOW)).toBeUndefined();
});
