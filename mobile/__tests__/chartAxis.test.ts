import { niceTicks, innerTicks, shortDate } from "../src/session/chartAxis";

test("niceTicks: rango 72–75 → enteros redondos", () => {
  expect(niceTicks(72, 75, 4)).toEqual([72, 73, 74, 75]);
});

test("niceTicks: rango amplio 0–1000 → pasos uniformes", () => {
  const t = niceTicks(0, 1000, 4);
  expect(t.length).toBeGreaterThanOrEqual(3);
  const step = t[1] - t[0];
  for (let i = 1; i < t.length; i++) expect(Number((t[i] - t[i - 1]).toFixed(6))).toBe(step);
});

test("niceTicks: valor plano → un solo tick", () => {
  expect(niceTicks(70, 70)).toEqual([70]);
});

test("innerTicks: excluye los bordes (para no pisar min/max)", () => {
  expect(innerTicks(60, 120, 4)).toEqual([80, 100]);
  expect(innerTicks(80, 80)).toEqual([]); // valor plano → sin gridlines intermedias
});

test("shortDate: timestamp → 'd mes'", () => {
  const s = shortDate(new Date(2026, 6, 9, 12, 0, 0).getTime());
  expect(s).toMatch(/9/);
  expect(s.length).toBeGreaterThan(2);
});
