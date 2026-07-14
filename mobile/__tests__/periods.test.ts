import { dayPeriod } from "../src/reports/periods";

test("dayPeriod hoy: 00:00 a 23:59:59.999 y label", () => {
  const p = dayPeriod(0, new Date("2026-07-14T15:00:00").getTime());
  expect(new Date(p.start).getHours()).toBe(0);
  expect(new Date(p.end).getHours()).toBe(23);
  expect(p.kind).toBe("daily");
  expect(p.label).toMatch(/14/);
});

test("dayPeriod offset -1 = ayer", () => {
  const today = dayPeriod(0, new Date("2026-07-14T15:00:00").getTime());
  const yest = dayPeriod(-1, new Date("2026-07-14T15:00:00").getTime());
  expect(today.start - yest.start).toBe(24 * 3600_000);
});
