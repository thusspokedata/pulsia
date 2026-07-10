import { barCenterX } from "../src/components/BarChart";

test("primer índice queda centrado en el primer paso, después del padding", () => {
  // width=320, padding=16 → innerW=288, dataLength=28 → step=288/28
  const width = 320;
  const padding = 16;
  const dataLength = 28;
  const step = (width - padding * 2) / dataLength;
  expect(barCenterX(0, dataLength, width, padding)).toBeCloseTo(padding + step / 2);
});

test("índices sucesivos avanzan exactamente un step", () => {
  const width = 400;
  const padding = 16;
  const dataLength = 28;
  const step = (width - padding * 2) / dataLength;
  const x0 = barCenterX(0, dataLength, width, padding);
  const x7 = barCenterX(7, dataLength, width, padding);
  expect(x7 - x0).toBeCloseTo(step * 7);
});

test("último índice queda dentro del área útil (antes de width - padding)", () => {
  const width = 336;
  const padding = 16;
  const dataLength = 28;
  const xLast = barCenterX(dataLength - 1, dataLength, width, padding);
  expect(xLast).toBeLessThan(width - padding);
  expect(xLast).toBeGreaterThan(padding);
});
