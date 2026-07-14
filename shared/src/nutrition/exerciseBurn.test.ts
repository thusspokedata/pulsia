import { test, expect } from "bun:test";
import { estimateSessionBurn, sumDayExerciseBurn } from "./exerciseBurn";

const HOUR = 3600_000;

test("Keytel male, neto (resta el BMR de la duración)", () => {
  // kcal/min = (-55.0969 + 0.6309*140 + 0.1988*80 + 0.2017*40)/4.184 = 13.6714 → gross 60min = 820.28
  // neto con bmr 1718: 820.28 - (1718/1440)*60 = 820.28 - 71.58 = 748.70 → 749
  const r = estimateSessionBurn({ durationMs: HOUR, avgHr: 140, weightKg: 80, age: 40, sex: "male", bmr: 1718 });
  expect(r.method).toBe("hr");
  expect(r.kcal).toBe(749);
});

test("Keytel female, bruto (sin bmr)", () => {
  // kcal/min = (-20.4022 + 0.4472*140 - 0.1263*65 + 0.074*30)/4.184 = 8.6559 → 60min = 519.35 → 519
  const r = estimateSessionBurn({ durationMs: HOUR, avgHr: 140, weightKg: 65, age: 30, sex: "female", bmr: null });
  expect(r.kcal).toBe(519);
});

test("Keytel other = promedio de ambas fórmulas", () => {
  // male 13.6714, female(w80,age40) 8.3800 → avg 11.0257 → 60min = 661.54 → 662 (bruto)
  const r = estimateSessionBurn({ durationMs: HOUR, avgHr: 140, weightKg: 80, age: 40, sex: "other" });
  expect(r.kcal).toBe(662);
});

test("MET fallback sin FC (5 MET) y neto", () => {
  // gross = 5*80*1h = 400 ; neto con bmr 1718: 400 - 71.58 = 328.42 → 328
  const r = estimateSessionBurn({ durationMs: HOUR, avgHr: null, weightKg: 80, age: 40, sex: "male", bmr: 1718 });
  expect(r.method).toBe("met");
  expect(r.kcal).toBe(328);
});

test("MET fallback también si hay FC pero falta la edad (Keytel necesita edad)", () => {
  const r = estimateSessionBurn({ durationMs: HOUR, avgHr: 140, weightKg: 80, bmr: null });
  expect(r.method).toBe("met");
  expect(r.kcal).toBe(400);
});

test("sin duración o sin peso → 0/none", () => {
  expect(estimateSessionBurn({ durationMs: null, avgHr: 140, weightKg: 80, age: 40 })).toEqual({ kcal: 0, method: "none" });
  expect(estimateSessionBurn({ durationMs: 0, avgHr: 140, weightKg: 80, age: 40 })).toEqual({ kcal: 0, method: "none" });
  expect(estimateSessionBurn({ durationMs: HOUR, avgHr: 140, age: 40 })).toEqual({ kcal: 0, method: "none" });
});

test("FC muy baja no da negativo (clamp del kcal/min)", () => {
  const r = estimateSessionBurn({ durationMs: HOUR, avgHr: 40, weightKg: 60, age: 25, sex: "male", bmr: null });
  expect(r.kcal).toBeGreaterThanOrEqual(0);
});

test("neto no baja de 0 (gross < BMR de la duración)", () => {
  const r = estimateSessionBurn({ durationMs: HOUR, avgHr: null, weightKg: 40, age: 40, bmr: 20000 });
  expect(r.kcal).toBe(0);
});

test("sumDayExerciseBurn suma varias sesiones", () => {
  const athlete = { weightKg: 80, age: 40, sex: "male" as const, bmr: null };
  const total = sumDayExerciseBurn(
    [{ totalDurationMs: HOUR, avgHr: null }, { totalDurationMs: HOUR / 2, avgHr: null }],
    athlete,
  );
  expect(total).toBe(400 + 200);
});
