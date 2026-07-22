import { buildDailyBurn } from "../src/session/dailyBurn";
import { dayExerciseBurn } from "@pulsia/shared";

const ATHLETE = { weightKg: 80, age: 40, sex: "male" as const, bmr: null };

function session(dateStr: string, mins: number, avgHr: number | null = null) {
  return { startedAt: new Date(dateStr).getTime(), totalDurationMs: mins * 60000, avgHr };
}
function cardio(dateStr: string, mins: number, kcal: number | null) {
  return {
    type: "walk" as const,
    startedAt: new Date(dateStr).getTime(),
    durationMs: mins * 60000,
    avgHr: null,
    kcal,
  };
}

test("un día con SOLO cardio produce una entrada con gasto", () => {
  // Este es el bug reportado por el usuario: hoy el cardio no existe para Progreso.
  const map = buildDailyBurn([], [cardio("2026-03-15T10:00:00", 60, 300)], ATHLETE);
  const day = map.get("2026-03-15");
  expect(day).toBeDefined();
  expect(day!.cardioKcal).toBe(300);
  expect(day!.strengthKcal).toBe(0);
  expect(day!.kcal).toBe(300);
});

test("un día con fuerza Y cardio suma las dos fuentes por separado", () => {
  // Valores DISTINTOS a propósito: con fuerza y cardio iguales, sumar dos veces la misma fuente
  // daría el mismo total y el test no discriminaría.
  const map = buildDailyBurn(
    [session("2026-03-15T08:00:00", 60)], // MET 5 * 80 kg * 1h = 400
    [cardio("2026-03-15T18:00:00", 60, 300)], // device: 300
    ATHLETE,
  );
  const day = map.get("2026-03-15")!;
  expect(day.strengthKcal).toBe(400);
  expect(day.cardioKcal).toBe(300);
  expect(day.kcal).toBe(700);
});

test("el total por día coincide EXACTAMENTE con dayExerciseBurn", () => {
  // Invariante anti-divergencia: si alguien toca una de las dos funciones y no la otra,
  // Progreso y Nutrición mostrarían cifras distintas para el mismo día.
  const sessions = [session("2026-03-15T08:00:00", 45, 130)];
  const activities = [cardio("2026-03-15T18:00:00", 90, 420)];
  const map = buildDailyBurn(sessions, activities, ATHLETE);
  const expected = dayExerciseBurn(
    sessions.map((s) => ({ totalDurationMs: s.totalDurationMs, avgHr: s.avgHr })),
    activities.map((a) => ({
      type: a.type,
      durationMs: a.durationMs,
      avgHr: a.avgHr,
      kcal: a.kcal,
    })),
    ATHLETE,
  );
  expect(map.get("2026-03-15")!.kcal).toBe(expected);
});

test("agrupa por día LOCAL y separa días distintos", () => {
  const map = buildDailyBurn(
    [],
    [cardio("2026-03-15T10:00:00", 60, 300), cardio("2026-03-16T10:00:00", 30, 150)],
    ATHLETE,
  );
  expect(map.get("2026-03-15")!.kcal).toBe(300);
  expect(map.get("2026-03-16")!.kcal).toBe(150);
  expect(map.size).toBe(2);
});

test("acumula los minutos de las dos fuentes", () => {
  const map = buildDailyBurn(
    [session("2026-03-15T08:00:00", 45)],
    [cardio("2026-03-15T18:00:00", 30, 150)],
    ATHLETE,
  );
  expect(map.get("2026-03-15")!.minutes).toBe(75);
});

test("sin perfil (sin peso) el gasto es 0 pero los minutos se conservan", () => {
  // La pantalla usa esto para distinguir 'no entrenó' de 'no puedo calcular el gasto'.
  const map = buildDailyBurn([session("2026-03-15T08:00:00", 45)], [], { bmr: null });
  const day = map.get("2026-03-15")!;
  expect(day.kcal).toBe(0);
  expect(day.minutes).toBe(45);
});
