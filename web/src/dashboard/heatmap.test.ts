import { countByLocalDay, yearOf } from "./heatmap";

test("agrupa timestamps por día local (YYYY-MM-DD) y cuenta", () => {
  const d1 = new Date(2026, 0, 5, 10).getTime(); // 5 ene
  const d2 = new Date(2026, 0, 5, 20).getTime(); // 5 ene (mismo día, otra hora)
  const d3 = new Date(2026, 0, 6, 8).getTime();  // 6 ene
  const map = countByLocalDay([d1, d2, d3]);
  expect(map.get("2026-01-05")).toBe(2);
  expect(map.get("2026-01-06")).toBe(1);
});

test("yearOf devuelve el año local del timestamp", () => {
  expect(yearOf(new Date(2026, 5, 1).getTime())).toBe(2026);
});
