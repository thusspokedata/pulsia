# Entrenamiento · % cumplimiento en la lista del historial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps `- [ ]`.
> **NOTA orquestador:** "IMPLEMENTÁ VOS, NO delegues ni spawnees subagentes". Verificar git/tests reales tras cada tarea.

**Goal:** Mostrar el **% de cumplimiento** en cada fila de la lista del historial (hoy la lista liviana no lo trae).

**Decisión de diseño (autónoma):** `listSessions` pasa a **hidratar** exercises+sets y computar `completionPct` por sesión en JS (`done sets / planned sets`, igual que `summary.ts`), proyectando de vuelta a la DTO liviana + `completionPct`. Se elige hidratar (no SQL agregado crudo) porque es correcto, testeable con el fake-db, y a la escala actual (un usuario, pocas sesiones) el costo es despreciable. Optimizable con un agregado SQL si el volumen crece.

**Tech Stack:** Backend Hono+Bun+Drizzle (`bun test`, fake db). Mobile Expo (jest `--runInBand`).

**Entorno:** `cd backend && bun test`; `cd mobile && npm test -- --runInBand`. Commits firmados. Rama `feat/historial-completion-pct` (creada).

**Contexto (verificado):**
- `backend/src/sessions/repository.ts`: `listSessions(db, userId)` hoy hace un `.select({...6 cols...}).from(workoutSession).where(...)` (sin exercises). `getSession`/`getRecentSessions` usan `db.query.workoutSession.findMany/findFirst({ with: { exercises: { with: { sets } } } })` + `rowsToSession(row)`.
- `backend/src/routes/sessions.ts`: `GET /` → `c.json(await listSessions(deps.db, SINGLE_USER_ID))`.
- Fórmula de % (`mobile/src/session/summary.ts:74-76`): `totalPlannedSets = Σ ex.planned.sets`; `totalDoneSets = Σ sets con endedAt != null`; `pct = planned>0 ? round(done/planned*100) : 0`.
- `mobile/src/api/sessions.ts`: `interface SessionListItem { id, programId, dayLabel, location, startedAt, totalDurationMs }`.
- `mobile/app/(tabs)/historial.tsx`: filas renderizan `dayLabel` + `fmtDate(startedAt)` + `⏱ fmt(totalDurationMs)` (~líneas 169-177).

---

## Task 1: backend — `completionPct` en `listSessions`

**Files:**
- Create: `backend/src/sessions/completion.ts`, `backend/src/sessions/completion.test.ts`
- Modify: `backend/src/sessions/repository.ts` (`listSessions`)
- Test: `backend/src/sessions/repository.test.ts` (extender)

- [ ] **Step 1: Test que falla (helper puro).** Crear `backend/src/sessions/completion.test.ts`:
```ts
import { test, expect } from "bun:test";
import { sessionCompletionPct } from "./completion";
import type { WorkoutSession } from "@pulsia/shared";

function ex(planned: number, doneSets: number) {
  return {
    catalogId: "x", garminName: "X", order: 0, note: "", substitutedFromId: null,
    planned: { sets: planned, reps: "8", targetLoad: "RPE 8", restSeconds: 60 }, skipped: false,
    sets: Array.from({ length: doneSets }, (_, i) => ({
      setNumber: i + 1, reps: 8, weightKg: 40, rpe: 8, startedAt: 1, endedAt: 2, durationMs: 1,
      repTimestamps: [], hrAvg: null, hrMax: null, skipped: false,
    })),
  };
}
function sess(exercises: any[]): WorkoutSession {
  return { id: "s", programId: "p", weekNumber: 1, dayLabel: "D", location: "gym",
    startedAt: 1, endedAt: 2, totalDurationMs: 1, notes: "", exercises } as WorkoutSession;
}

test("100% si todas las series planeadas están hechas", () => {
  expect(sessionCompletionPct(sess([ex(2, 2), ex(3, 3)]))).toBe(100);
});
test("50% con la mitad hechas", () => {
  expect(sessionCompletionPct(sess([ex(4, 2)]))).toBe(50);
});
test("0% sin series planeadas → 0 (sin división por cero)", () => {
  expect(sessionCompletionPct(sess([ex(0, 0)]))).toBe(0);
});
test("sólo cuenta series terminadas (endedAt != null)", () => {
  const s = sess([ex(2, 1)]);
  s.exercises[0].sets.push({ setNumber: 2, reps: 8, weightKg: null, rpe: null, startedAt: 3, endedAt: null, durationMs: null, repTimestamps: [], hrAvg: null, hrMax: null, skipped: false } as any);
  expect(sessionCompletionPct(s)).toBe(50); // 1 terminada / 2 planeadas
});
```

- [ ] **Step 2: Correr, confirmar FAIL.** `cd backend && bun test src/sessions/completion.test.ts`

- [ ] **Step 3: Implementar** `backend/src/sessions/completion.ts`:
```ts
import type { WorkoutSession } from "@pulsia/shared";

// % de cumplimiento = series terminadas / series planeadas (redondeado). 0 si no hay planeadas.
export function sessionCompletionPct(session: WorkoutSession): number {
  const planned = session.exercises.reduce((acc, ex) => acc + ex.planned.sets, 0);
  const done = session.exercises.reduce(
    (acc, ex) => acc + ex.sets.filter((s) => s.endedAt != null).length,
    0,
  );
  return planned > 0 ? Math.round((done / planned) * 100) : 0;
}
```

- [ ] **Step 4: Correr, confirmar PASS.** `cd backend && bun test src/sessions/completion.test.ts`

- [ ] **Step 5: Test que falla (listSessions).** En `backend/src/sessions/repository.test.ts`, agregar un test que verifique que `listSessions` devuelve `completionPct` (y sólo las cols livianas). Modelar el fake `db.query.workoutSession.findMany` para devolver una fila anidada (reusar `nestedRow` / su forma; con planned.sets y sets con endedAt). Assert:
```ts
test("listSessions incluye completionPct y proyecta liviano", async () => {
  const db: any = { query: { workoutSession: { findMany: async () => [nestedRow] } } };
  const out = await listSessions(db, "u");
  expect(out[0]).toHaveProperty("completionPct");
  expect(out[0]).not.toHaveProperty("exercises"); // sigue siendo liviano
  expect(typeof out[0].completionPct).toBe("number");
});
```
(Ajustar `nestedRow` para que tenga al menos un exercise con `planned.sets` y sets con `endedAt`. Si `nestedRow` no está en scope, construir uno mínimo con la forma que espera `rowsToSession`.)

- [ ] **Step 6: Correr, confirmar FAIL.** `cd backend && bun test src/sessions/repository.test.ts`

- [ ] **Step 7: Implementar `listSessions`** en `backend/src/sessions/repository.ts`. Reemplazar el `.select(...).from(...)` por una hidratación + proyección:
```ts
export async function listSessions(db: Db, userId: string) {
  const rows = await db.query.workoutSession.findMany({
    where: eq(workoutSession.userId, userId),
    with: { exercises: { with: { sets: true } } },
  });
  return rows.map((row) => {
    const s = rowsToSession(row);
    return {
      id: s.id, programId: s.programId, dayLabel: s.dayLabel, location: s.location,
      startedAt: s.startedAt, totalDurationMs: s.totalDurationMs,
      completionPct: sessionCompletionPct(s),
    };
  });
}
```
Importar `sessionCompletionPct` de `./completion` (y verificar que `rowsToSession`, `eq`, `workoutSession` ya están importados en el archivo — lo están).

- [ ] **Step 8: Correr backend completo + typecheck.** `cd backend && bun test && npx tsc --noEmit`

- [ ] **Step 9: Commit.**
```bash
git add backend/src/sessions/completion.ts backend/src/sessions/completion.test.ts backend/src/sessions/repository.ts backend/src/sessions/repository.test.ts
git commit -S -m "feat(backend): completionPct en la lista de sesiones (GET /sessions)"
```

---

## Task 2: mobile — mostrar el % en el historial

**Files:**
- Modify: `mobile/src/api/sessions.ts` (`SessionListItem`)
- Modify: `mobile/app/(tabs)/historial.tsx`
- Test: `mobile/__tests__/historial.test.tsx` (extender)

- [ ] **Step 1: Test que falla.** En `mobile/__tests__/historial.test.tsx`, el mock de `getSessions` devuelve items — agregar `completionPct` a esos items del mock y un test que verifique que la fila muestra el %. El archivo ya mockea `../src/api/sessions`. Agregar:
```ts
test("la fila del historial muestra el % de cumplimiento", async () => {
  (getSessions as jest.Mock).mockResolvedValue([
    { id: mockSessionA.id, programId: mockSessionA.programId, dayLabel: mockSessionA.dayLabel, location: "gym", startedAt: mockSessionA.startedAt, totalDurationMs: mockSessionA.totalDurationMs, completionPct: 80 },
  ]);
  await render(<HistorialScreen />);
  await waitFor(() => expect(screen.getByTestId(`hist-pct-${mockSessionA.id}`).props.children).toContain(80));
});
```
(Adaptar al harness; el `children` puede ser `["", 80, "%"]` según cómo se arme el string — usar `toContain(80)` o el string exacto que definas.)

- [ ] **Step 2: Correr, confirmar FAIL.** `cd mobile && npm test -- --runInBand historial`

- [ ] **Step 3: Implementar.**
  1. En `mobile/src/api/sessions.ts`, agregar `completionPct: number;` a `interface SessionListItem`.
  2. En `mobile/app/(tabs)/historial.tsx`, en la fila (junto al `⏱ {fmt(...)}`), agregar el %:
```tsx
<Text testID={`hist-pct-${s.id}`} style={{ color: colors.textMuted, fontSize: 13 }}>{s.completionPct}%</Text>
```
(Ubicarlo de forma coherente con el layout de la fila, ej. entre el día/fecha y la duración.)

- [ ] **Step 4: Correr, confirmar PASS + typecheck + suite completa.** `cd mobile && npm test -- --runInBand historial && npm run typecheck && npm test -- --runInBand`

- [ ] **Step 5: Commit.**
```bash
git add mobile/src/api/sessions.ts "mobile/app/(tabs)/historial.tsx" mobile/__tests__/historial.test.tsx
git commit -S -m "feat(mobile): mostrar el % de cumplimiento en la lista del historial"
```

---

## Cierre del PR
- `cd backend && bun test && npx tsc --noEmit`, `cd mobile && npm run typecheck && npm test -- --runInBand` — verde.
- Push + PR → review (timer + escalado a `@claude`) → aplicar hallazgos → merge (con comentarios corregidos).
- Backend → requiere redeploy de la Pi para verse en producción (queda para el usuario).
