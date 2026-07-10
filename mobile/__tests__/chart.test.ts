import { scalePoints } from "../src/session/chart";

test("scalePoints mapea al viewport con padding y invierte el eje Y", () => {
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 100 }];
  const out = scalePoints(pts, { width: 100, height: 100, padding: 10 });
  // x min→padding, x max→width-padding
  expect(out[0].x).toBeCloseTo(10, 5);
  expect(out[1].x).toBeCloseTo(90, 5);
  // y min (0) → abajo (height-padding); y max (100) → arriba (padding)
  expect(out[0].y).toBeCloseTo(90, 5);
  expect(out[1].y).toBeCloseTo(10, 5);
});

test("scalePoints con un solo punto lo centra sin dividir por cero", () => {
  const out = scalePoints([{ x: 5, y: 5 }], { width: 100, height: 100, padding: 10 });
  expect(Number.isFinite(out[0].x)).toBe(true);
  expect(Number.isFinite(out[0].y)).toBe(true);
});

test("scalePoints centra verticalmente una serie plana con más de un punto", () => {
  const pts = [{ x: 0, y: 50 }, { x: 5, y: 50 }, { x: 10, y: 50 }];
  const out = scalePoints(pts, { width: 100, height: 100, padding: 10 });
  for (const p of out) {
    expect(p.y).toBeCloseTo(50, 5);
  }
});
