import { valuesForDay } from "../src/session/metricForm";

// Mediodía local del 10 jul 2026 (el helper bucketea por día calendario local).
const dayNoon = new Date(2026, 6, 10, 12, 0, 0).getTime();
const at = (h: number, d = 10) => new Date(2026, 6, d, h, 0, 0).getTime();

test("precarga el valor registrado ese día", () => {
  const out = valuesForDay({ steps: [{ value: 8000, measuredAt: at(12) }] }, ["steps"], dayNoon);
  expect(out).toEqual({ steps: "8000" });
});

test("no precarga nada si ese día no tiene datos", () => {
  const out = valuesForDay({ steps: [{ value: 8000, measuredAt: at(12, 9) }] }, ["steps"], dayNoon);
  expect(out.steps).toBeUndefined();
});

test("si hay varios puntos el mismo día, toma el último", () => {
  const out = valuesForDay(
    { stress: [{ value: 3, measuredAt: at(8) }, { value: 5, measuredAt: at(20) }] },
    ["stress"],
    dayNoon,
  );
  expect(out).toEqual({ stress: "5" });
});

test("mezcla tipos con y sin dato del día", () => {
  const out = valuesForDay(
    { steps: [{ value: 8000, measuredAt: at(12) }], mood: [{ value: 4, measuredAt: at(12, 8) }] },
    ["steps", "mood", "energy"],
    dayNoon,
  );
  expect(out).toEqual({ steps: "8000" }); // mood es de otro día, energy no tiene serie
});
