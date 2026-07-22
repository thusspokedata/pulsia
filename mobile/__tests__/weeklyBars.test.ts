import { buildDailyKcal } from "../src/session/weeklyBars";
import type { DayBurn } from "../src/session/dailyBurn";

function burnMap(entries: Record<string, number>): Map<string, DayBurn> {
  const m = new Map<string, DayBurn>();
  for (const [date, kcal] of Object.entries(entries)) {
    m.set(date, { kcal, strengthKcal: kcal, cardioKcal: 0, minutes: 0 });
  }
  return m;
}

const NOW = new Date("2026-03-15T12:00:00").getTime();

test("devuelve exactamente `days` entradas terminando en hoy", () => {
  const out = buildDailyKcal(burnMap({}), NOW, 28);
  expect(out).toHaveLength(28);
  expect(out[27].date).toBe("2026-03-15");
  expect(out[0].date).toBe("2026-02-16");
});

test("un día con gasto aparece con sus kcal", () => {
  const out = buildDailyKcal(burnMap({ "2026-03-14": 450 }), NOW, 28);
  expect(out.find((d) => d.date === "2026-03-14")!.kcal).toBe(450);
});

test("los días sin actividad van en 0, no se omiten", () => {
  // Las barras necesitan el eje completo: omitir días comprimiría el gráfico y mentiría
  // sobre la constancia.
  const out = buildDailyKcal(burnMap({ "2026-03-14": 450 }), NOW, 28);
  expect(out.filter((d) => d.kcal === 0)).toHaveLength(27);
});

test("un día fuera de la ventana no entra", () => {
  const out = buildDailyKcal(burnMap({ "2026-01-01": 900 }), NOW, 28);
  expect(out.some((d) => d.date === "2026-01-01")).toBe(false);
  // Ni su gasto se cuela en otro día: la ventana recorta, no reasigna.
  expect(out.every((d) => d.kcal === 0)).toBe(true);
});

test("respeta un tamaño de ventana `days` custom", () => {
  const out = buildDailyKcal(burnMap({}), NOW, 7);
  expect(out).toHaveLength(7);
  expect(out[6].date).toBe("2026-03-15");
  expect(out[0].date).toBe("2026-03-09");
});
