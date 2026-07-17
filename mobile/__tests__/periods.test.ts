import { dayPeriod, weekPeriod, biweekPeriod, monthPeriod, periodFor } from "../src/reports/periods";

const NOW = new Date("2026-07-14T15:00:00").getTime(); // martes 14 jul 2026

test("dayPeriod hoy: 00:00 a 23:59:59.999 y label", () => {
  const p = dayPeriod(0, new Date("2026-07-14T15:00:00").getTime());
  expect(new Date(p.start).getHours()).toBe(0);
  // El span exacto: getHours()===23 pasaba igual con un día que terminara 23:59:55.
  expect(p.end - p.start).toBe(24 * 3600_000 - 1);
  expect(p.kind).toBe("daily");
  expect(p.label).toBe("14 de julio"); // /14/ matcheaba el día aunque el mes fuera el equivocado
});

test("dayPeriod offset 1 = ayer (positivo = pasado)", () => {
  const now = new Date("2026-07-14T15:00:00").getTime();
  const today = dayPeriod(0, now);
  const yest = dayPeriod(1, now);
  expect(today.start - yest.start).toBe(24 * 3600_000); // ayer es 24h ANTES de hoy
});

test("weekPeriod: lunes 00:00 a domingo 23:59; offset 1 = semana anterior", () => {
  const w = weekPeriod(0, NOW);
  const start = new Date(w.start);
  expect(start.getDay()).toBe(1);   // lunes
  expect(start.getHours()).toBe(0);
  expect(new Date(w.end).getDay()).toBe(0); // domingo
  // El span exacto: getDay()===0 pasaba igual con una semana acortada (domingo 21:59).
  expect(w.end - w.start).toBe(7 * 86400000 - 1);
  expect(w.kind).toBe("weekly");
  // la semana de 14/jul (martes) arranca el lunes 13
  expect(start.getDate()).toBe(13);
  expect(weekPeriod(0, NOW).start - weekPeriod(1, NOW).start).toBe(7 * 86400000);
});

test("biweekPeriod: 14 jul cae en la 2ª quincena (16? no: día ≤15 → 1ª)", () => {
  const b = biweekPeriod(0, NOW); // día 14 ≤ 15 → primera quincena [1..15]
  expect(new Date(b.start).getDate()).toBe(1);
  expect(new Date(b.end).getDate()).toBe(15);
  expect(b.kind).toBe("biweekly");
  // quincena anterior = 16..30 de junio
  const prev = biweekPeriod(1, NOW);
  expect(new Date(prev.start).getDate()).toBe(16);
  expect(new Date(prev.start).getMonth()).toBe(5); // junio
});

test("monthPeriod: 1 a fin de mes; offset 1 = mes anterior", () => {
  const m = monthPeriod(0, NOW);
  expect(new Date(m.start).getDate()).toBe(1);
  expect(new Date(m.start).getMonth()).toBe(6); // julio
  expect(new Date(m.end).getDate()).toBe(31);
  expect(new Date(monthPeriod(1, NOW).start).getMonth()).toBe(5); // junio
});

test("periodFor despacha por kind", () => {
  expect(periodFor("daily", 0, NOW).kind).toBe("daily");
  expect(periodFor("weekly", 0, NOW).kind).toBe("weekly");
  expect(periodFor("biweekly", 0, NOW).kind).toBe("biweekly");
  expect(periodFor("monthly", 0, NOW).kind).toBe("monthly");
});
