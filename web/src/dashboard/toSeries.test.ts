import { toSeries } from "./toSeries";

test("mapea métricas a puntos {t, v} ordenados por tiempo", () => {
  const pts = toSeries([
    { id: "b", metricType: "weight_kg", value: 79, measuredAt: 2000 },
    { id: "a", metricType: "weight_kg", value: 80, measuredAt: 1000 },
  ]);
  expect(pts).toEqual([{ t: 1000, v: 80 }, { t: 2000, v: 79 }]);
});

test("lista vacía → []", () => {
  expect(toSeries([])).toEqual([]);
});
