import { test, expect } from "bun:test";
import { estimateSessionBurn } from "./exerciseBurn";

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

import { estimateCardioBurn, dayExerciseBurn, MET_BY_CARDIO } from "./exerciseBurn";

test("REGRESIÓN: fuerza sigue usando MET 5 (no cambia por el refactor)", () => {
  // Mismo caso que "MET fallback sin FC (5 MET) y neto": 5*80*1h = 400; neto 400 - 71.58 = 328
  const r = estimateSessionBurn({ durationMs: HOUR, avgHr: null, weightKg: 80, age: 40, sex: "male", bmr: 1718 });
  expect(r.kcal).toBe(328);
});

test("MET_BY_CARDIO: caminata pesa menos que running", () => {
  expect(MET_BY_CARDIO.walk).toBeLessThan(MET_BY_CARDIO.run);
  expect(MET_BY_CARDIO.walk).toBe(3.5);
  expect(MET_BY_CARDIO.run).toBe(9.8);
});

test("cardio con kcal del reloj: se resta el BMR del intervalo (el reloj reporta bruto)", () => {
  // 140 kcal del reloj, 60 min, bmr 1718 → basal del rato = (1718/1440)*60 = 71.58
  // neto = 140 - 71.58 = 68.42 → 68
  const r = estimateCardioBurn(
    { type: "walk", durationMs: HOUR, avgHr: 105, kcal: 140 },
    { weightKg: 80, age: 40, sex: "male", bmr: 1718 },
  );
  expect(r).toEqual({ kcal: 68, method: "device" });
});

test("cardio con kcal del reloj y SIN bmr: se usan tal cual", () => {
  // Sin perfil completo no hay BMR que restar; el dato del reloj pasa intacto.
  const r = estimateCardioBurn(
    { type: "walk", durationMs: HOUR, avgHr: 105, kcal: 140 },
    { weightKg: 80, age: 40, sex: "male", bmr: null },
  );
  expect(r).toEqual({ kcal: 140, method: "device" });
});

test("cardio del reloj: el neto nunca es negativo (clamp a 0)", () => {
  // Actividad larga y muy suave: 50 kcal en 120 min, basal del rato = 144 → -94, clampeado a 0.
  const r = estimateCardioBurn(
    { type: "walk", durationMs: 2 * HOUR, avgHr: 80, kcal: 50 },
    { weightKg: 80, age: 40, sex: "male", bmr: 1728 },
  );
  expect(r).toEqual({ kcal: 0, method: "device" });
});

test("cardio sin kcal y sin FC: MET del tipo, neto de BMR", () => {
  // walk: 3.5*80*1h = 280 gross; neto 280 - (1718/1440)*60 = 280 - 71.58 = 208.42 → 208
  const r = estimateCardioBurn(
    { type: "walk", durationMs: HOUR, avgHr: null, kcal: null },
    { weightKg: 80, age: 40, sex: "male", bmr: 1718 },
  );
  expect(r).toEqual({ kcal: 208, method: "met" });
});

test("cardio sin kcal: running usa su propio MET (no el de fuerza)", () => {
  // run: 9.8*80*1h = 784 bruto
  const r = estimateCardioBurn(
    { type: "run", durationMs: HOUR, avgHr: null, kcal: null },
    { weightKg: 80, age: 40, sex: "male", bmr: null },
  );
  expect(r.kcal).toBe(784);
});

test("cardio sin kcal pero con FC: Keytel gana al MET", () => {
  const r = estimateCardioBurn(
    { type: "walk", durationMs: HOUR, avgHr: 140, kcal: null },
    { weightKg: 80, age: 40, sex: "male", bmr: 1718 },
  );
  expect(r).toEqual({ kcal: 749, method: "hr" });
});

test("cardio sin peso y sin kcal del reloj → 0/none", () => {
  const r = estimateCardioBurn({ type: "walk", durationMs: HOUR, avgHr: null, kcal: null }, { age: 40 });
  expect(r).toEqual({ kcal: 0, method: "none" });
});

test("dayExerciseBurn suma sesiones de fuerza + actividades de cardio", () => {
  const athlete = { weightKg: 80, age: 40, sex: "male" as const, bmr: null };
  const total = dayExerciseBurn(
    [{ totalDurationMs: HOUR, avgHr: null }],                                   // fuerza: 5*80 = 400
    [{ type: "walk", durationMs: HOUR, avgHr: null, kcal: null },               // walk:  3.5*80 = 280
     { type: "run", durationMs: HOUR, avgHr: null, kcal: 500 }],                // device: 500
    athlete,
  );
  expect(total).toBe(400 + 280 + 500);
});

test("dayExerciseBurn con listas vacías da 0", () => {
  expect(dayExerciseBurn([], [], { weightKg: 80 })).toBe(0);
});
