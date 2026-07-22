import { burnThresholds, FIXED_THRESHOLDS, MIN_DAYS_FOR_PERCENTILES } from "../src/session/burnThresholds";

test("con pocos días usa los umbrales fijos", () => {
  const few = [100, 200, 300];
  expect(burnThresholds(few)).toEqual(FIXED_THRESHOLDS);
});

test("justo por debajo del mínimo todavía usa los fijos", () => {
  const days = Array.from({ length: MIN_DAYS_FOR_PERCENTILES - 1 }, (_, i) => (i + 1) * 10);
  expect(burnThresholds(days)).toEqual(FIXED_THRESHOLDS);
});

test("alcanzado el mínimo usa cuartiles del historial", () => {
  // 20 días de 100..2000 → cuartiles en 500 / 1000 / 1500.
  const days = Array.from({ length: 20 }, (_, i) => (i + 1) * 100);
  const t = burnThresholds(days);
  expect(t).not.toEqual(FIXED_THRESHOLDS);
  expect(t).toEqual([500, 1000, 1500]);
});

test("ignora los días sin gasto al calcular los cuartiles", () => {
  // Los ceros son días sin entrenar: incluirlos correría los cuartiles hacia abajo y pintaría
  // de oscuro cualquier día con actividad.
  const days = Array.from({ length: 20 }, (_, i) => (i + 1) * 100);
  const withZeros = [...days, ...Array.from({ length: 100 }, () => 0)];
  expect(burnThresholds(withZeros)).toEqual(burnThresholds(days));
});

test("los umbrales salen ordenados de menor a mayor", () => {
  const days = Array.from({ length: 40 }, (_, i) => (i * 37) % 900);
  const [a, b, c] = burnThresholds(days);
  expect(a).toBeLessThanOrEqual(b);
  expect(b).toBeLessThanOrEqual(c);
});

test("cada corte parte el historial en cuartos", () => {
  // La razón de ser de la escala relativa: el primer corte deja 1/4 del historial por debajo, el
  // segundo la mitad, el tercero 3/4. Si los índices se corren un puesto, los cuatro niveles de
  // color dejan de repartirse parejo.
  const days = Array.from({ length: 20 }, (_, i) => (i + 1) * 100);
  const [q1, q2, q3] = burnThresholds(days);
  expect(days.filter((k) => k <= q1).length).toBe(5);
  expect(days.filter((k) => k <= q2).length).toBe(10);
  expect(days.filter((k) => k <= q3).length).toBe(15);
});
