import { buildDailyMinutes } from "../src/session/weeklyBars";

function session(dateStr: string, mins: number) {
  return { startedAt: new Date(dateStr).getTime(), totalDurationMs: mins * 60000 };
}

const NOW = new Date("2026-07-10T12:00:00").getTime();

test("devuelve exactamente 28 entradas terminando hoy", () => {
  const days = buildDailyMinutes([], NOW);
  expect(days.length).toBe(28);
  expect(days[27].date).toBe("2026-07-10");
  expect(days[0].date).toBe("2026-06-13");
});

test("una sesión hoy aparece en la última entrada", () => {
  const days = buildDailyMinutes([session("2026-07-10T09:00:00", 30)], NOW);
  expect(days[27].minutes).toBe(30);
});

test("una sesión de hace 30 días queda excluida (fuera de la ventana de 28)", () => {
  const days = buildDailyMinutes([session("2026-06-10T09:00:00", 30)], NOW);
  expect(days.every((d) => d.minutes === 0)).toBe(true);
});

test("dos sesiones el mismo día suman minutos", () => {
  const days = buildDailyMinutes(
    [session("2026-07-10T08:00:00", 10), session("2026-07-10T20:00:00", 15)],
    NOW
  );
  expect(days[27].minutes).toBe(25);
});

test("días sin sesión quedan en 0", () => {
  const days = buildDailyMinutes([session("2026-07-10T08:00:00", 10)], NOW);
  expect(days[0].minutes).toBe(0);
  expect(days[26].minutes).toBe(0);
});

test("respeta un tamaño de ventana `days` custom", () => {
  const days = buildDailyMinutes([], NOW, 7);
  expect(days.length).toBe(7);
  expect(days[6].date).toBe("2026-07-10");
});
