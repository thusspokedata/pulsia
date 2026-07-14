import { test, expect } from "bun:test";
import { buildReportPrompt } from "./report";

const data: any = {
  totals: { kcal: 1800, protein_g: 90, carbs_g: 200, fat_g: 70, sugars_g: 40, fiber_g: 12, saturated_fat_g: 20, salt_g: 6 },
  cholesterolMg: 350, liquid: { total: 1200, drank: 900, fromFood: 300 }, exercise: 400, sessionsCount: 1,
  metrics: { weight_kg: 80, sleep_hours: 5, stress: 4 },
  athlete: { goal: { status: "ok", kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60, bmr: 1700 } },
  periodDays: 7, weightTrend: { first: 82, last: 80 },
};

test("el prompt incluye los datos, el tipo, anti-inyección y el anclaje no-médico", () => {
  const p = buildReportPrompt("daily", data);
  expect(p).toMatch(/1800/); // kcal comido
  expect(p).toMatch(/colesterol/i);
  expect(p).toMatch(/consejo/i);
  expect(p).toMatch(/DATOS|no.*instrucc/i); // anti prompt-injection
  expect(p).toMatch(/m[ée]dico|profesional/i); // anclaje no-médico
  expect(p).toMatch(/return_report/);
  expect(p).toMatch(/di[ae]ri/i); // menciona el tipo
});

test("periódico menciona tendencias", () => {
  expect(buildReportPrompt("weekly", data)).toMatch(/tendencia|promedio/i);
});

test("periódico: instruye a promediar por día y menciona la tendencia de peso", () => {
  const p = buildReportPrompt("weekly", { ...data, periodDays: 7, weightTrend: { first: 82, last: 80 } });
  expect(p).toMatch(/7 d[ií]as/); // sabe el N de días
  expect(p).toMatch(/promedi/i); // pide promedios
  expect(p).toMatch(/82|80/); // menciona la evolución del peso
});

test("diario NO habla de promedios de varios días", () => {
  const p = buildReportPrompt("daily", { ...data, periodDays: 1, weightTrend: null });
  expect(p).not.toMatch(/promediá por día|dividí por/i);
});
