import { rangeBounds } from "../src/nutrition/useMealsRange";
import { dayBounds } from "../src/nutrition/dayBounds";

test("1 día = el día solo (mismos límites que dayBounds)", () => {
  expect(rangeBounds(1, 0)).toEqual({ from: dayBounds(0).from, to: dayBounds(0).to });
});

test("7 días termina HOY y arranca 6 días atrás (7 días contando hoy, no 8)", () => {
  expect(rangeBounds(7, 0)).toEqual({ from: dayBounds(6).from, to: dayBounds(0).to });
});

test("el rango se ancla al día que estás mirando, no a hoy", () => {
  // offset 3 = mirando 3 días atrás → 7 días termina ahí y arranca 9 días atrás.
  expect(rangeBounds(7, 3)).toEqual({ from: dayBounds(9).from, to: dayBounds(3).to });
});

test("30 días", () => {
  expect(rangeBounds(30, 0)).toEqual({ from: dayBounds(29).from, to: dayBounds(0).to });
});
