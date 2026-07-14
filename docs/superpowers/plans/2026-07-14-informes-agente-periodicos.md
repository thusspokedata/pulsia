# Informes del agente — PR2 (semanal / quincenal / mensual) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.
> **Depende de:** PR1 (#124, `feat/informes-diario`) YA MERGEADO en main. Empezar SOLO con #124 en main (usa `periods.ts`, `informes.tsx`, `collect.ts`, `report.ts` de ese PR).

**Goal:** Informes periódicos (semanal desde lunes, quincenal 1–15/16–fin, mes calendario) sobre la infra del PR1. El backend ya genera cualquier `kind`; se agrega el cómputo de períodos + selector de tipo en la UI, y se mejora la agregación periódica del collector (promedios por día + tendencia de peso) para que los números tengan sentido en varios días.

**Architecture:** Mobile-only para los períodos y el selector; cambio chico en `collect.ts`/`report.ts` para que los informes de varios días den al agente el N de días (promedios) y la tendencia de peso. Sin migración. OTA a vc10.

**Tech Stack:** Bun monorepo. Reusa `dayAtNoon`, la pantalla Informes y el prompt del PR1.

**Referencia:** spec `docs/superpowers/specs/2026-07-14-informes-agente-design.md` (períodos + tendencias).

## File structure

- `mobile/src/reports/periods.ts` (+test) — `weekPeriod`/`biweekPeriod`/`monthPeriod` + `periodFor(kind, offset, now)`.
- `mobile/app/nutricion/informes.tsx` — selector de tipo (chips) + wire.
- `backend/src/reports/collect.ts` (+test) — `periodDays` + `weightTrend` en `ReportData`.
- `backend/src/ai/report.ts` (+test) — prompt periódico usa periodDays (promedios) + tendencia de peso.

---

### Task 1: Backend — agregación periódica en el collector

**Files:**
- Modify: `backend/src/reports/collect.ts`
- Test: `backend/src/reports/collect.test.ts`

- [ ] **Step 1: Tests que fallan**

En `backend/src/reports/collect.test.ts`, agregá al final (reusá los helpers `meal`/`item`/`fakeDb`/`deps` del archivo; adaptá si difieren):
```ts
test("periodDays y weightTrend (primer y último peso del rango)", async () => {
  const deps = {
    listMeals: async () => [], listWater: async () => [],
    listSessions: async () => [],
    getMetrics: async () => [ // ordenados asc por measuredAt (como el real)
      { id: "a", metricType: "weight_kg", value: 82, measuredAt: 100 },
      { id: "b", metricType: "steps", value: 5000, measuredAt: 150 },
      { id: "c", metricType: "weight_kg", value: 80, measuredAt: 900 },
    ],
  };
  const athlete = { goal: { status: "incomplete" } } as any;
  // período de 7 días: from=0, to=7*86400000-1
  const data = await collectReportData({} as any, "u", 0, 7 * 86400000 - 1, athlete, deps as any);
  expect(data.periodDays).toBe(7);
  expect(data.weightTrend).toEqual({ first: 82, last: 80 });
  expect(data.metrics.weight_kg).toBe(80); // último sigue siendo el "actual"
});

test("periodDays mínimo 1 y weightTrend null si no hay peso", async () => {
  const deps = { listMeals: async () => [], listWater: async () => [], listSessions: async () => [], getMetrics: async () => [] };
  const data = await collectReportData({} as any, "u", 0, 10, { goal: { status: "incomplete" } } as any, deps as any);
  expect(data.periodDays).toBe(1);
  expect(data.weightTrend).toBeNull();
});
```

- [ ] **Step 2: Verlos fallar**

Run: `cd backend && bun test src/reports/collect.test.ts`
Expected: FAIL (`periodDays`/`weightTrend` no existen en `ReportData`).

- [ ] **Step 3: Implementar**

En `backend/src/reports/collect.ts`:
- En `interface ReportData`, agregá:
```ts
  periodDays: number;
  weightTrend: { first: number; last: number } | null;
```
- En `collectReportData`, antes del `return`, computá:
```ts
  const periodDays = Math.max(1, Math.round((to - from + 1) / 86_400_000));
  const weights = metrics.filter((m) => m.metricType === "weight_kg");
  const weightTrend = weights.length > 0 ? { first: weights[0].value, last: weights[weights.length - 1].value } : null;
```
- Agregalos al objeto devuelto (`return { totals, cholesterolMg, liquid, exercise, sessionsCount, metrics, athlete, periodDays, weightTrend }`).

- [ ] **Step 4: Verlos pasar + typecheck**

Run: `cd backend && bun test src/reports/collect.test.ts && bunx tsc --noEmit`
Expected: PASS, sin errores. (Los tests previos de collect siguen verdes: `periodDays` para el caso "un día 0..10" = 1.)

- [ ] **Step 5: Commit**

IMPORTANT: firmar `-S`, SIN Co-Authored-By.
```bash
git add backend/src/reports/collect.ts backend/src/reports/collect.test.ts
git commit -S -m "feat(backend): periodDays + tendencia de peso en la recolección (para informes de varios días)"
```

---

### Task 2: Backend — prompt periódico con promedios + tendencia de peso

**Files:**
- Modify: `backend/src/ai/report.ts`
- Test: `backend/src/ai/report.test.ts`

- [ ] **Step 1: Tests que fallan**

En `backend/src/ai/report.test.ts`, el fixture `data` NO tiene `periodDays`/`weightTrend` — agregáselos (`periodDays: 7, weightTrend: { first: 82, last: 80 }`). Y agregá:
```ts
test("periódico: instruye a promediar por día y menciona la tendencia de peso", () => {
  const p = buildReportPrompt("weekly", { ...data, periodDays: 7, weightTrend: { first: 82, last: 80 } });
  expect(p).toMatch(/7 d[ií]as/);        // sabe el N de días
  expect(p).toMatch(/promedi/i);          // pide promedios
  expect(p).toMatch(/82|80/);             // menciona la evolución del peso
});

test("diario NO habla de promedios de varios días", () => {
  const p = buildReportPrompt("daily", { ...data, periodDays: 1, weightTrend: null });
  expect(p).not.toMatch(/promediá por día|dividí por/i);
});
```

- [ ] **Step 2: Verlos fallar**

Run: `cd backend && bun test src/ai/report.test.ts`
Expected: FAIL (el prompt no usa periodDays/weightTrend; puede haber además error de tipos por el fixture sin los campos nuevos — agregalos como en Step 1).

- [ ] **Step 3: Implementar**

En `backend/src/ai/report.ts`:
- En `dataBlock(d)`, agregá una línea de tendencia de peso cuando exista:
```ts
    d.weightTrend ? `- Evolución del peso: de ${d.weightTrend.first} kg a ${d.weightTrend.last} kg en el período` : `- Evolución del peso: s/d`,
```
- En `buildReportPrompt`, reemplazá la línea condicional `periodica ? ... : ...` por una que, en periódico, incluya el N de días y pida promediar:
```ts
    periodica
      ? `Como es un informe periódico de ${data.periodDays} días, los TOTALES de arriba son la SUMA del período: PROMEDIÁ por día (p.ej. kcal/día = total / ${data.periodDays}) y compará contra la meta DIARIA. Enfocate en tendencias: días probablemente por encima/debajo de la meta, patrones recurrentes (azúcar/sal/colesterol), la evolución del peso, y la adherencia al entrenamiento.`
      : "Como es un informe de un día, resumí cómo fue el día vs la meta y qué se puede mejorar mañana.",
```

- [ ] **Step 4: Verlos pasar + suite backend**

Run: `cd backend && bun test src/ai/report.test.ts && bun test && bunx tsc --noEmit`
Expected: PASS, suite verde, tsc limpio.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/report.ts backend/src/ai/report.test.ts
git commit -S -m "feat(backend): prompt periódico promedia por día (periodDays) + menciona la tendencia de peso"
```

---

### Task 3: Mobile — períodos semana / quincena / mes

**Files:**
- Modify: `mobile/src/reports/periods.ts`
- Test: `mobile/__tests__/periods.test.ts`

- [ ] **Step 1: Tests que fallan**

En `mobile/__tests__/periods.test.ts`, agregá (usá un `now` fijo, p.ej. martes 2026-07-14T15:00):
```ts
import { weekPeriod, biweekPeriod, monthPeriod, periodFor } from "../src/reports/periods";

const NOW = new Date("2026-07-14T15:00:00").getTime(); // martes 14 jul 2026

test("weekPeriod: lunes 00:00 a domingo 23:59; offset 1 = semana anterior", () => {
  const w = weekPeriod(0, NOW);
  const start = new Date(w.start);
  expect(start.getDay()).toBe(1);   // lunes
  expect(start.getHours()).toBe(0);
  expect(new Date(w.end).getDay()).toBe(0); // domingo
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
```

- [ ] **Step 2: Verlos fallar**

Run: `cd mobile && npm test -- periods --runInBand`
Expected: FAIL (funciones no existen).

- [ ] **Step 3: Implementar**

En `mobile/src/reports/periods.ts`, agregá (dejá `dayPeriod` como está; reusá `MESES`):
```ts
const atMidnight = (d: Date): Date => { d.setHours(0, 0, 0, 0); return d; };
const endOfDay = (start: number): number => start + 24 * 3600_000 - 1;
const label2 = (a: Date, b: Date): string => `${a.getDate()} al ${b.getDate()} de ${MESES[b.getMonth()]}`;

// Semana desde LUNES. offset 0 = semana actual, 1 = anterior.
export function weekPeriod(offset: number, now: number): Period {
  const d = atMidnight(new Date(now));
  const dow = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - dow - offset * 7);
  const start = d.getTime();
  const end = start + 7 * 24 * 3600_000 - 1;
  const a = new Date(start); const b = new Date(end);
  return { kind: "weekly", start, end, label: `Semana del ${label2(a, b)}` };
}

// Quincena: [1..15] y [16..fin de mes]. offset cuenta quincenas hacia atrás.
export function biweekPeriod(offset: number, now: number): Period {
  const base = new Date(now);
  let year = base.getFullYear();
  let month = base.getMonth();
  let half = base.getDate() <= 15 ? 0 : 1; // 0 = primera, 1 = segunda
  for (let i = 0; i < offset; i++) {
    if (half === 1) half = 0;
    else { half = 1; month -= 1; if (month < 0) { month = 11; year -= 1; } }
  }
  const startDay = half === 0 ? 1 : 16;
  const start = new Date(year, month, startDay, 0, 0, 0, 0).getTime();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const endDay = half === 0 ? 15 : lastDay;
  const end = new Date(year, month, endDay, 23, 59, 59, 999).getTime();
  return { kind: "biweekly", start, end, label: `${startDay}–${endDay} de ${MESES[month]}` };
}

// Mes calendario. offset 0 = mes actual.
export function monthPeriod(offset: number, now: number): Period {
  const base = new Date(now);
  const year = base.getFullYear();
  const month = base.getMonth() - offset;
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { kind: "monthly", start: start.getTime(), end: end.getTime(), label: `${MESES[start.getMonth()]} ${start.getFullYear()}` };
}

export function periodFor(kind: import("@pulsia/shared").ReportKind, offset: number, now: number): Period {
  switch (kind) {
    case "weekly": return weekPeriod(offset, now);
    case "biweekly": return biweekPeriod(offset, now);
    case "monthly": return monthPeriod(offset, now);
    default: return dayPeriod(offset, now);
  }
}
```
(Nota: `new Date(year, month, ...)` con month fuera de rango normaliza el año — cubre el retroceso de meses.)

- [ ] **Step 4: Verlos pasar + typecheck**

Run: `cd mobile && npm test -- periods --runInBand && bunx tsc --noEmit`
Expected: PASS. Si algún esperado de fecha choca por el `now` elegido, recalculá a mano el día real (no toques la lógica) y ajustá el esperado del test documentando la cuenta.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/reports/periods.ts mobile/__tests__/periods.test.ts
git commit -S -m "feat(mobile): períodos semanal/quincenal/mensual + periodFor"
```

---

### Task 4: Mobile — selector de tipo en la pantalla Informes

**Files:**
- Modify: `mobile/app/nutricion/informes.tsx`

- [ ] **Step 1: Selector + wire**

En `mobile/app/nutricion/informes.tsx`:
- Import: `periodFor` (en vez de/además de `dayPeriod`), `type ReportKind` de `@pulsia/shared`, y `ChipGroup` de `../../src/components/ChipGroup`.
- Estado nuevo:
```ts
  const [kind, setKind] = useState<ReportKind>("daily");
  const period = periodFor(kind, offset, Date.now());
```
(reemplazá `const period = dayPeriod(...)`).
- Al cambiar de `kind`, resetear el offset y limpiar el contenido:
```ts
  function pickKind(k: ReportKind) { setKind(k); setOffset(0); setContent(null); setCreatedAt(null); }
```
- El `load` y `generate` usan `kind`/`period` (ya toman `period.start`/`period.end`; cambiá el `getReport(u, "daily", start)` por `getReport(u, kind, start)` y el `generateReport({ kind: "daily", ... })` por `generateReport({ kind, ... })`).
- `useFocusEffect` depende también de `kind` (agregá `kind` a las deps del `useCallback` que llama `load`, o reincluí `load(period.start)` — como `period` cambia con kind y offset, asegurate de recargar al cambiar cualquiera).
- **UI**: arriba de todo, un `ChipGroup single` con las 4 opciones:
```tsx
      <ChipGroup single
        options={[{ value: "daily", label: "Día" }, { value: "weekly", label: "Semana" }, { value: "biweekly", label: "Quincena" }, { value: "monthly", label: "Mes" }]}
        selected={[kind]} onChange={(v) => pickKind(v[0] as ReportKind)} />
```
- Textos kind-aware: el botón "Generar informe del día" y el spinner "…analizando tu día…" pasan a una etiqueta por kind, p.ej.:
```tsx
  const KIND_LABEL: Record<ReportKind, string> = { daily: "del día", weekly: "de la semana", biweekly: "de la quincena", monthly: "del mes" };
```
usá `Generar informe {KIND_LABEL[kind]}` y `El agente está analizando tu {kind === "daily" ? "día" : "período"}…`.

- [ ] **Step 2: Typecheck + sweep**

Run: `cd mobile && bunx tsc --noEmit && npm test -- --runInBand`
Expected: sin errores, verde (flakes conocidos generando/ecg ignorables).

- [ ] **Step 3: Commit**

```bash
git add mobile/app/nutricion/informes.tsx
git commit -S -m "feat(mobile): selector Día/Semana/Quincena/Mes en la pantalla Informes"
```

---

## Self-Review

**Spec coverage:** períodos semana(lunes)/quincena(1–15,16–fin)/mes → Task 3. Selector en la pantalla → Task 4. Tendencias periódicas (promedios por día + evolución del peso) → Tasks 1/2 (el agente ya recibe el N de días y la tendencia de peso). Backend ya kind-agnóstico desde PR1 (rutas/repo/gate no cambian). Sin migración. OTA vc10. ✅

**Placeholder scan:** sin TBD; código completo. Los esperados de fecha de Task 3 dependen del `now` fijo (martes 14/jul/2026); si el calendario real difiere, ajustar el número (no la lógica).

**Type consistency:** `Period.kind`/`periodFor` (Task 3) consumidos por informes (Task 4); `ReportKind` de shared en ambos. `periodDays`/`weightTrend` (Task 1) usados por el prompt (Task 2). `getReport`/`generateReport` ya aceptan cualquier `kind` string (PR1).

**Riesgos:**
- Task 3: aritmética de fechas con `new Date(y, m, d)` (normaliza meses/años negativos). El test de quincena depende de que 14 ≤ 15 → 1ª quincena; y la anterior = 16–30 jun (junio tiene 30). Verificar.
- Task 4: al cambiar `kind` u `offset`, recargar (deps del `useFocusEffect`/effect). No romper el flujo 403→Configuración del PR1.
- El collector para períodos largos suma TODO el rango (correcto): el agente promedia con `periodDays`. Días-sobre/bajo-meta exactos quedan fuera de alcance (el agente los estima cualitativamente); si se quiere precisión, es un follow-up (agregación por-día con TZ).
