import { availableYears, buildYearHeatmap } from "../src/session/heatmap";

function session(dateStr: string, mins: number) {
  return { startedAt: new Date(dateStr).getTime(), totalDurationMs: mins * 60000 };
}

test("una sesión en fecha conocida cae en la celda correcta con el nivel correcto", () => {
  const { weeks } = buildYearHeatmap([session("2026-03-15T10:00:00", 45)], 2026);
  const cell = weeks.flat().find((c) => c.date === "2026-03-15");
  expect(cell).toBeDefined();
  expect(cell!.minutes).toBe(45);
  expect(cell!.level).toBe(2); // 31-60
  expect(cell!.inYear).toBe(true);
});

test("dos sesiones el mismo día suman minutos (45+20=65 → level 3)", () => {
  const sessions = [session("2026-03-15T08:00:00", 45), session("2026-03-15T20:00:00", 20)];
  const { weeks } = buildYearHeatmap(sessions, 2026);
  const cell = weeks.flat().find((c) => c.date === "2026-03-15")!;
  expect(cell.minutes).toBe(65);
  expect(cell.level).toBe(3);
});

test("año vacío → todas las celdas dentro del año quedan en level 0", () => {
  const { weeks } = buildYearHeatmap([], 2026);
  const inYearCells = weeks.flat().filter((c) => c.inYear);
  expect(inYearCells.length).toBeGreaterThanOrEqual(365);
  expect(inYearCells.every((c) => c.level === 0 && c.minutes === 0)).toBe(true);
});

test("celdas de padding fuera del año quedan marcadas inYear:false", () => {
  const { weeks } = buildYearHeatmap([], 2026);
  const outside = weeks.flat().filter((c) => !c.inYear);
  expect(outside.length).toBeGreaterThan(0);
  expect(outside.every((c) => !c.date.startsWith("2026"))).toBe(true);
});

test("la grilla tiene 7 filas (días) por columna (semana)", () => {
  const { weeks } = buildYearHeatmap([], 2026);
  for (const week of weeks) {
    expect(week.length).toBe(7);
  }
});

test("niveles: 0min→0, 1-30→1, 31-60→2, 61-90→3, >90→4", () => {
  const cases: [number, 0 | 1 | 2 | 3 | 4][] = [
    [0, 0],
    [1, 1],
    [30, 1],
    [31, 2],
    [60, 2],
    [61, 3],
    [90, 3],
    [91, 4],
    [200, 4],
  ];
  for (const [mins, expected] of cases) {
    const { weeks } = buildYearHeatmap(mins > 0 ? [session("2026-06-01T10:00:00", mins)] : [], 2026);
    const cell = weeks.flat().find((c) => c.date === "2026-06-01")!;
    expect(cell.level).toBe(expected);
  }
});

test("availableYears dedupea y ordena desc", () => {
  const years = availableYears([
    { startedAt: new Date("2024-05-01").getTime() },
    { startedAt: new Date("2026-01-10").getTime() },
    { startedAt: new Date("2024-11-01").getTime() },
  ]);
  expect(years).toEqual([2026, 2024]);
});

test("availableYears con lista vacía → []", () => {
  expect(availableYears([])).toEqual([]);
});

test("con nowMs, recorta a la semana de hoy (sin semanas futuras) y marca future en la semana en curso", () => {
  const now = new Date("2026-06-15T12:00:00").getTime(); // lunes 15/06/2026
  const { weeks } = buildYearHeatmap([], 2026, now);
  const flat = weeks.flat();
  // Dentro de la semana de hoy: mañana es futuro; hoy y ayer no.
  expect(flat.find((c) => c.date === "2026-06-16")!.future).toBe(true);
  expect(flat.find((c) => c.date === "2026-06-15")!.future).toBe(false); // hoy no es futuro
  expect(flat.find((c) => c.date === "2026-06-14")!.future).toBe(false);
  // No se generan semanas posteriores a la de hoy → no hay celdas de julio ni diciembre.
  expect(flat.find((c) => c.date === "2026-07-01")).toBeUndefined();
  expect(flat.find((c) => c.date === "2026-12-31")).toBeUndefined();
  // La última celda del año en curso es el sábado de la semana de hoy (20/06/2026).
  const lastInYear = flat.filter((c) => c.inYear).at(-1)!;
  expect(lastInYear.date).toBe("2026-06-20");
});

test("sin nowMs, ninguna celda es future (retro-compatible)", () => {
  const { weeks } = buildYearHeatmap([], 2026);
  expect(weeks.flat().every((c) => c.future === false)).toBe(true);
});
