import { scaleMultiSeries } from "../src/session/multiChart";

test("escala varias series con un min/max compartido entre todas", () => {
  // Serie A: y entre 0 y 10. Serie B: y entre 100 y 200.
  // Si se escalaran por separado, el punto "alto" de B (200) caería arriba (y chico) igual que el "alto" de A (10).
  // Con escala compartida, el punto más alto de A (10) queda MUY abajo (y grande) porque el máximo real es 200.
  const seriesA = { points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] };
  const seriesB = { points: [{ x: 0, y: 100 }, { x: 10, y: 200 }] };
  const [outA, outB] = scaleMultiSeries([seriesA, seriesB], { width: 100, height: 100, padding: 10 });

  // El punto más alto de B (y=200, el máximo global) debe estar arriba del todo (y ≈ padding).
  expect(outB.points[1].y).toBeCloseTo(10, 5);
  // El punto más alto de A (y=10) es el mínimo global relativo a B, así que NO debe estar arriba del todo:
  // con escala compartida, A entero queda comprimido cerca del fondo (y grande), muy lejos de padding=10.
  expect(outA.points[1].y).toBeGreaterThan(50);
});

test("escala un único punto combinado sin dividir por cero", () => {
  const [out] = scaleMultiSeries([{ points: [{ x: 5, y: 5 }] }], { width: 100, height: 100, padding: 10 });
  expect(out.points).toHaveLength(1);
  expect(Number.isFinite(out.points[0].x)).toBe(true);
  expect(Number.isFinite(out.points[0].y)).toBe(true);
});

test("array de series vacío devuelve []", () => {
  expect(scaleMultiSeries([], { width: 100, height: 100, padding: 10 })).toEqual([]);
});

test("una serie sin puntos se mapea a una serie sin puntos, sin crashear", () => {
  const seriesA = { points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] };
  const seriesEmpty = { points: [] };
  const [outA, outEmpty] = scaleMultiSeries([seriesA, seriesEmpty], { width: 100, height: 100, padding: 10 });
  expect(outA.points).toHaveLength(2);
  expect(outEmpty.points).toHaveLength(0);
});

test("todas las series vacías no crashea", () => {
  const out = scaleMultiSeries([{ points: [] }, { points: [] }], { width: 100, height: 100, padding: 10 });
  expect(out).toHaveLength(2);
  expect(out[0].points).toHaveLength(0);
  expect(out[1].points).toHaveLength(0);
});
