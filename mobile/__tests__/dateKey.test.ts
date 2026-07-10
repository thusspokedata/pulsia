import { dateKey } from "../src/session/dateKey";

test("formatea fecha local como YYYY-MM-DD con ceros a la izquierda", () => {
  expect(dateKey(new Date("2026-03-05T10:00:00").getTime())).toBe("2026-03-05");
});

test("usa la fecha LOCAL, no UTC (medianoche no se corre de día)", () => {
  const ms = new Date(2026, 0, 1, 0, 30).getTime(); // 1 ene 2026 00:30 local
  expect(dateKey(ms)).toBe("2026-01-01");
});

test("meses y días de un dígito quedan paddeados a 2 dígitos", () => {
  expect(dateKey(new Date(2026, 8, 9, 12, 0).getTime())).toBe("2026-09-09");
});

test("fin de año", () => {
  expect(dateKey(new Date(2025, 11, 31, 23, 59).getTime())).toBe("2025-12-31");
});
