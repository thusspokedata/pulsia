import { dayAtNoon } from "../src/session/metricDate";
test("dayAtNoon(0) = mediodía de hoy", () => {
  const now = new Date(2026, 6, 11, 9, 30).getTime();
  const d = new Date(dayAtNoon(0, now));
  expect(d.getHours()).toBe(12); expect(d.getDate()).toBe(11);
});
test("dayAtNoon(2) = mediodía de hace 2 días", () => {
  const now = new Date(2026, 6, 11, 9, 30).getTime();
  const d = new Date(dayAtNoon(2, now));
  expect(d.getDate()).toBe(9); expect(d.getHours()).toBe(12);
});
