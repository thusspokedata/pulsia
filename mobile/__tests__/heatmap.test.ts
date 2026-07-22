import { availableYears, buildYearHeatmap } from "../src/session/heatmap";
import type { DayBurn } from "../src/session/dailyBurn";

const T: [number, number, number] = [200, 400, 600];

function burnMap(entries: Record<string, number>): Map<string, DayBurn> {
  const m = new Map<string, DayBurn>();
  for (const [date, kcal] of Object.entries(entries)) {
    m.set(date, { kcal, strengthKcal: kcal, cardioKcal: 0, minutes: 0 });
  }
  return m;
}

test("un día cae en la celda correcta con el nivel correcto según su gasto", () => {
  const { weeks } = buildYearHeatmap(burnMap({ "2026-03-15": 350 }), T, 2026);
  const cell = weeks.flat().find((c) => c.date === "2026-03-15");
  expect(cell).toBeDefined();
  expect(cell!.kcal).toBe(350);
  expect(cell!.level).toBe(2); // > 200 y <= 400
  expect(cell!.inYear).toBe(true);
});

test("los cuatro niveles se asignan según los umbrales", () => {
  const { weeks } = buildYearHeatmap(
    burnMap({
      "2026-03-10": 150, // <= 200 → 1
      "2026-03-11": 350, // <= 400 → 2
      "2026-03-12": 550, // <= 600 → 3
      "2026-03-13": 900, // > 600  → 4
    }),
    T,
    2026,
  );
  const lvl = (d: string) => weeks.flat().find((c) => c.date === d)!.level;
  expect(lvl("2026-03-10")).toBe(1);
  expect(lvl("2026-03-11")).toBe(2);
  expect(lvl("2026-03-12")).toBe(3);
  expect(lvl("2026-03-13")).toBe(4);
});

test("la celda expone los minutos del día para el desglose", () => {
  const m = new Map<string, DayBurn>([
    ["2026-03-15", { kcal: 350, strengthKcal: 200, cardioKcal: 150, minutes: 72 }],
  ]);
  const cell = buildYearHeatmap(m, T, 2026)
    .weeks.flat()
    .find((c) => c.date === "2026-03-15")!;
  expect(cell.minutes).toBe(72);
});

test("un día sin gasto queda en nivel 0", () => {
  const { weeks } = buildYearHeatmap(burnMap({}), T, 2026);
  const cell = weeks.flat().find((c) => c.date === "2026-03-15")!;
  expect(cell.kcal).toBe(0);
  expect(cell.level).toBe(0);
});

test("los umbrales recibidos mandan: el MISMO día da el mismo nivel en años distintos", () => {
  // Blindaje de la decisión de diseño: los cuartiles se calculan sobre TODO el historial y se
  // pasan como input. Si alguien los recalculara adentro por año, este test se cae.
  //
  // Para que discrimine de verdad, los dos años tienen distribuciones OPUESTAS: 2025 lleno de días
  // flojos, 2026 lleno de días fuertes. Con cuartiles por año, el día de 350 kcal sería de los más
  // altos de 2025 y de los más bajos de 2026 → niveles distintos. Con los umbrales de input, no.
  const entries: Record<string, number> = { "2025-06-10": 350, "2026-06-10": 350 };
  for (let d = 1; d <= 28; d++) {
    const dd = String(d).padStart(2, "0");
    entries[`2025-02-${dd}`] = 100; // año flojo
    entries[`2026-02-${dd}`] = 1000; // año fuerte
  }
  const shared = burnMap(entries);
  const a = buildYearHeatmap(shared, T, 2025);
  const b = buildYearHeatmap(shared, T, 2026);
  const lvlA = a.weeks.flat().find((c) => c.date === "2025-06-10")!.level;
  const lvlB = b.weeks.flat().find((c) => c.date === "2026-06-10")!.level;
  expect(lvlA).toBe(lvlB);
  expect(lvlA).toBe(2); // el nivel de los umbrales fijos, no el de los cuartiles del año
});

test("availableYears incluye un año que SOLO tiene cardio", () => {
  // Sin esto, un año de solo caminatas existe en los datos pero es inalcanzable desde el selector.
  const years = availableYears(
    [{ startedAt: new Date("2026-03-15T10:00:00").getTime() }],
    [{ startedAt: new Date("2024-08-02T10:00:00").getTime() }],
  );
  expect(years).toEqual([2026, 2024]);
});

test("availableYears no duplica un año presente en las dos fuentes", () => {
  const years = availableYears(
    [{ startedAt: new Date("2026-03-15T10:00:00").getTime() }],
    [{ startedAt: new Date("2026-08-02T10:00:00").getTime() }],
  );
  expect(years).toEqual([2026]);
});

test("availableYears dedupea y ordena desc", () => {
  const years = availableYears([
    { startedAt: new Date("2024-05-01T10:00:00").getTime() },
    { startedAt: new Date("2026-01-10T10:00:00").getTime() },
    { startedAt: new Date("2024-11-01T10:00:00").getTime() },
  ]);
  expect(years).toEqual([2026, 2024]);
});

test("availableYears con listas vacías → []", () => {
  expect(availableYears([])).toEqual([]);
  expect(availableYears([], [])).toEqual([]);
});

test("no se generan celdas futuras en el año en curso", () => {
  const now = new Date("2026-03-15T12:00:00").getTime();
  const { weeks } = buildYearHeatmap(burnMap({}), T, 2026, now);
  const future = weeks.flat().filter((c) => c.inYear && c.date > "2026-03-21");
  expect(future).toHaveLength(0);
});

test("año vacío → todas las celdas dentro del año quedan en level 0", () => {
  const { weeks } = buildYearHeatmap(burnMap({}), T, 2026);
  const inYearCells = weeks.flat().filter((c) => c.inYear);
  expect(inYearCells.length).toBeGreaterThanOrEqual(365);
  expect(inYearCells.every((c) => c.level === 0 && c.kcal === 0)).toBe(true);
});

test("celdas de padding fuera del año quedan marcadas inYear:false", () => {
  const { weeks } = buildYearHeatmap(burnMap({}), T, 2026);
  const outside = weeks.flat().filter((c) => !c.inYear);
  expect(outside.length).toBeGreaterThan(0);
  expect(outside.every((c) => !c.date.startsWith("2026"))).toBe(true);
});

test("un día del mapa fuera del año mostrado no pinta su celda de padding", () => {
  // El 2025-12-31 cae en la grilla de 2026 como padding: debe quedar en 0, no en su gasto real.
  const { weeks } = buildYearHeatmap(burnMap({ "2025-12-31": 900 }), T, 2026);
  const cell = weeks.flat().find((c) => c.date === "2025-12-31");
  if (cell) {
    expect(cell.inYear).toBe(false);
    expect(cell.kcal).toBe(0);
    expect(cell.level).toBe(0);
  }
});

test("la grilla tiene 7 filas (días) por columna (semana)", () => {
  const { weeks } = buildYearHeatmap(burnMap({}), T, 2026);
  for (const week of weeks) {
    expect(week.length).toBe(7);
  }
});

test("con nowMs, recorta a la semana de hoy y marca future en la semana en curso", () => {
  const now = new Date("2026-06-15T12:00:00").getTime(); // lunes 15/06/2026
  const { weeks } = buildYearHeatmap(burnMap({}), T, 2026, now);
  const flat = weeks.flat();
  expect(flat.find((c) => c.date === "2026-06-16")!.future).toBe(true);
  expect(flat.find((c) => c.date === "2026-06-15")!.future).toBe(false); // hoy no es futuro
  expect(flat.find((c) => c.date === "2026-06-14")!.future).toBe(false);
  expect(flat.find((c) => c.date === "2026-07-01")).toBeUndefined();
  expect(flat.find((c) => c.date === "2026-12-31")).toBeUndefined();
  const lastInYear = flat.filter((c) => c.inYear).at(-1)!;
  expect(lastInYear.date).toBe("2026-06-20");
});

test("sin nowMs, ninguna celda es future (retro-compatible)", () => {
  const { weeks } = buildYearHeatmap(burnMap({}), T, 2026);
  expect(weeks.flat().every((c) => c.future === false)).toBe(true);
});

test("un año futuro NO se recorta → grilla no vacía", () => {
  const now = new Date("2026-06-15T12:00:00").getTime();
  const { weeks } = buildYearHeatmap(burnMap({}), T, 2027, now);
  const inYear = weeks.flat().filter((c) => c.inYear);
  expect(inYear.length).toBeGreaterThanOrEqual(365);
});

test("un año pasado se muestra completo (no se recorta)", () => {
  const now = new Date("2026-06-15T12:00:00").getTime();
  const { weeks } = buildYearHeatmap(burnMap({}), T, 2024, now);
  const inYear = weeks.flat().filter((c) => c.inYear);
  expect(inYear.length).toBeGreaterThanOrEqual(365);
});
