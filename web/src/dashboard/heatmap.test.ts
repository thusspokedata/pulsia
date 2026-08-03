import { localDayKey } from "./heatmap";

test("localDayKey formatea la fecha local como YYYY-MM-DD", () => {
  expect(localDayKey(new Date(2026, 0, 5, 10).getTime())).toBe("2026-01-05");
  expect(localDayKey(new Date(2026, 0, 5, 20).getTime())).toBe("2026-01-05");
  expect(localDayKey(new Date(2026, 0, 6, 8).getTime())).toBe("2026-01-06");
});
