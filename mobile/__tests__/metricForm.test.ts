import { buildReadingFromForm } from "../src/session/metricForm";

test("arma la lectura solo con los campos completados y válidos", () => {
  const r = buildReadingFromForm({ weight_kg: "80.5", waist_cm: "", body_fat_pct: "abc" }, 1000);
  expect(r).toEqual({ measuredAt: 1000, entries: [{ metricType: "weight_kg", value: 80.5 }] });
});

test("devuelve null si no hay ninguna entry válida", () => {
  expect(buildReadingFromForm({ weight_kg: "" }, 1000)).toBeNull();
});
