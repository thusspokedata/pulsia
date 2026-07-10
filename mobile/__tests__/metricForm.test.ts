import { buildReadingFromForm, buildBpReadingFromForm } from "../src/session/metricForm";

test("arma la lectura solo con los campos completados y válidos", () => {
  const r = buildReadingFromForm({ weight_kg: "80.5", waist_cm: "", body_fat_pct: "abc" }, 1000);
  expect(r.reading).toEqual({ measuredAt: 1000, entries: [{ metricType: "weight_kg", value: 80.5 }] });
  expect(r.invalid).toEqual(["body_fat_pct"]);
});

test("devuelve reading null si no hay ninguna entry válida", () => {
  const r = buildReadingFromForm({ weight_kg: "" }, 1000);
  expect(r.reading).toBeNull();
  expect(r.invalid).toEqual([]);
});

test("reporta como invalid los campos no vacíos pero fuera de rango o no numéricos", () => {
  const r = buildReadingFromForm({ weight_kg: "abc", waist_cm: "99999" }, 1000);
  expect(r.reading).toBeNull();
  expect(r.invalid).toEqual(["weight_kg", "waist_cm"]);
});

test("buildBpReadingFromForm arma la lectura con las 3 métricas de presión", () => {
  const r = buildBpReadingFromForm({ alta: "125", baja: "82", pulso: "68" }, 1000);
  expect(r.reading).toEqual({
    measuredAt: 1000,
    entries: [
      { metricType: "bp_systolic", value: 125 },
      { metricType: "bp_diastolic", value: 82 },
      { metricType: "bp_pulse", value: 68 },
    ],
  });
  expect(r.invalid).toEqual([]);
});

test("buildBpReadingFromForm omite campos vacíos y reporta invalid fuera de rango", () => {
  const r = buildBpReadingFromForm({ alta: "125", baja: "", pulso: "999" }, 1000);
  expect(r.reading).toEqual({ measuredAt: 1000, entries: [{ metricType: "bp_systolic", value: 125 }] });
  expect(r.invalid).toEqual(["bp_pulse"]);
});

test("buildBpReadingFromForm devuelve reading null si no hay ningún valor válido", () => {
  const r = buildBpReadingFromForm({ alta: "", baja: "", pulso: "" }, 1000);
  expect(r.reading).toBeNull();
  expect(r.invalid).toEqual([]);
});
