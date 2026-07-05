# Entrenamiento · Sugerencia de peso inicial por ejercicio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps `- [ ]`.
> **NOTA orquestador:** "IMPLEMENTÁ VOS, NO delegues ni spawnees subagentes". Verificar git/tests reales tras cada tarea.

**Goal:** Al entrenar, sugerir el **peso inicial** de cada ejercicio a partir del **último peso real** que usaste en ese ejercicio.

**Decisiones de diseño (autónomas):**
- v1 **regla determinista:** el último peso (kg) registrado para ese `catalogId` en las sesiones recientes.
- **Backend calcula** el mapa `{ catalogId: kg }` desde `getRecentSessions` (mobile no guarda historial local). Endpoint dedicado `GET /sessions/last-weights`.
- **UX no intrusiva:** en la pantalla de sesión, para el ejercicio activo mostrar un hint **"Sugerido: X kg"** tocable que **rellena** el input de peso (no auto-completa solo, el usuario opta).
- Ventana: últimas **20** sesiones (suficiente para cubrir ejercicios no hechos hace poco; costo ok a la escala actual).

**Tech Stack:** Backend Hono+Bun+Drizzle (`bun test`, fake db). Mobile Expo (jest `--runInBand`).

**Entorno:** `cd backend && bun test`; `cd mobile && npm test -- --runInBand`. Commits firmados. Rama `feat/sugerencia-peso` (creada).

**Contexto (verificado):**
- `getRecentSessions(db, userId, limit)` (`backend/src/sessions/repository.ts`) devuelve sesiones completas **más recientes primero**, sets ordenados por `setNumber` asc. Sets tienen `weightKg: number|null`.
- `backend/src/routes/sessions.ts`: usa `SINGLE_USER_ID`; rutas `PUT /:id`, `GET /:id`, `GET /`, `DELETE /:id`. **El endpoint estático `/last-weights` debe registrarse ANTES de `/:id`.**
- `mobile/src/api/sessions.ts`: `apiFetch`-based clients. `mobile/app/sesion.tsx`: input de peso `<TextInput testID="weight" value={weight} onChangeText={setWeight}/>` (~línea 528); `current` = ejercicio activo (`SessionExercise` con `catalogId`); `getBackendUrl` para la URL.

---

## Task 1: backend — `lastWeightByExercise` + `GET /sessions/last-weights`

**Files:**
- Create: `backend/src/sessions/lastWeight.ts`, `backend/src/sessions/lastWeight.test.ts`
- Modify: `backend/src/routes/sessions.ts`
- Test: `backend/src/routes/sessions.test.ts` (extender)

- [ ] **Step 1: Test que falla (helper puro).** Crear `backend/src/sessions/lastWeight.test.ts`:
```ts
import { test, expect } from "bun:test";
import { lastWeightByExercise } from "./lastWeight";
import type { WorkoutSession } from "@pulsia/shared";

function setL(setNumber: number, weightKg: number | null) {
  return { setNumber, reps: 8, weightKg, rpe: 8, startedAt: 1, endedAt: 2, durationMs: 1, repTimestamps: [], hrAvg: null, hrMax: null, skipped: false };
}
function exL(catalogId: string, sets: any[]) {
  return { catalogId, garminName: catalogId, order: 0, note: "", substitutedFromId: null, planned: { sets: 3, reps: "8", targetLoad: "RPE 8", restSeconds: 60 }, skipped: false, sets };
}
function sessL(startedAt: number, exercises: any[]): WorkoutSession {
  return { id: `s${startedAt}`, programId: "p", weekNumber: 1, dayLabel: "D", location: "gym", startedAt, endedAt: startedAt + 1, totalDurationMs: 1, notes: "", exercises } as WorkoutSession;
}

test("toma el último peso (última serie con weightKg) de la sesión más reciente por ejercicio", () => {
  // sessions más recientes primero
  const sessions = [
    sessL(200, [exL("bench", [setL(1, 42), setL(2, 44)])]), // reciente → 44 (última serie con peso)
    sessL(100, [exL("bench", [setL(1, 40)]), exL("squat", [setL(1, 80)])]),
  ];
  const map = lastWeightByExercise(sessions);
  expect(map.bench).toBe(44);
  expect(map.squat).toBe(80);
});

test("ignora sets sin peso (weightKg null)", () => {
  const map = lastWeightByExercise([sessL(100, [exL("bench", [setL(1, null), setL(2, 50)])])]);
  expect(map.bench).toBe(50);
});

test("ejercicio sin ningún peso registrado no aparece", () => {
  const map = lastWeightByExercise([sessL(100, [exL("bench", [setL(1, null)])])]);
  expect(map.bench).toBeUndefined();
});
```

- [ ] **Step 2: Correr, confirmar FAIL.** `cd backend && bun test src/sessions/lastWeight.test.ts`

- [ ] **Step 3: Implementar** `backend/src/sessions/lastWeight.ts`:
```ts
import type { WorkoutSession } from "@pulsia/shared";

// Mapa catalogId → último peso (kg) usado. `sessions` viene más-reciente-primero.
// Para cada ejercicio, se toma el peso de la última serie con weightKg != null de la
// sesión más reciente donde aparece con peso.
export function lastWeightByExercise(sessions: WorkoutSession[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const s of sessions) {
    for (const ex of s.exercises) {
      if (ex.catalogId in map) continue;
      // sets vienen por setNumber asc → recorrer al revés para el último con peso.
      for (let i = ex.sets.length - 1; i >= 0; i--) {
        const w = ex.sets[i].weightKg;
        if (w != null) { map[ex.catalogId] = w; break; }
      }
    }
  }
  return map;
}
```

- [ ] **Step 4: Correr, confirmar PASS.** `cd backend && bun test src/sessions/lastWeight.test.ts`

- [ ] **Step 5: Test que falla (ruta).** En `backend/src/routes/sessions.test.ts`, agregar un test de `GET /sessions/last-weights`. El fake db debe soportar `query.workoutSession.findMany` devolviendo una sesión con un ejercicio+set con weightKg. Modelar sobre el harness del archivo (reusar `deps`/`fakeDb`/`nestedSessionRow`). Assert:
```ts
test("GET /sessions/last-weights devuelve el mapa de últimos pesos", async () => {
  // fake db.query.workoutSession.findMany → [row con bench, set weightKg 40]
  const res = await app.request("/sessions/last-weights");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.barbell_bench_press).toBe(40); // según el catalogId/weight del fixture
});
```
(Adaptar catalogId/weight al fixture que uses. Si el harness no tiene `findMany`, agregarlo.)

- [ ] **Step 6: Correr, confirmar FAIL.** `cd backend && bun test src/routes/sessions.test.ts`

- [ ] **Step 7: Implementar la ruta.** En `backend/src/routes/sessions.ts`:
  - Importar `getRecentSessions` (ya se importa `listSessions` etc. de `../sessions/repository` — agregar `getRecentSessions`) y `lastWeightByExercise` de `../sessions/lastWeight`.
  - Registrar la ruta **ANTES** de `r.get("/:id", ...)`:
```ts
  r.get("/last-weights", async (c) => {
    const recent = await getRecentSessions(deps.db, SINGLE_USER_ID, 20);
    return c.json(lastWeightByExercise(recent));
  });
```

- [ ] **Step 8: Correr backend completo + typecheck.** `cd backend && bun test && npx tsc --noEmit`

- [ ] **Step 9: Commit.**
```bash
git add backend/src/sessions/lastWeight.ts backend/src/sessions/lastWeight.test.ts backend/src/routes/sessions.ts backend/src/routes/sessions.test.ts
git commit -S -m "feat(backend): GET /sessions/last-weights (último peso por ejercicio)"
```

---

## Task 2: mobile — hint de peso sugerido en la sesión

**Files:**
- Modify: `mobile/src/api/sessions.ts` (nuevo `getLastWeights`)
- Modify: `mobile/app/sesion.tsx`
- Test: `mobile/__tests__/sesion.test.tsx` (extender)

- [ ] **Step 1: api client.** En `mobile/src/api/sessions.ts` agregar:
```ts
export async function getLastWeights(baseUrl: string): Promise<Record<string, number>> {
  const res = await apiFetch(baseUrl, "/sessions/last-weights");
  if (!res.ok) throw new Error("No se pudieron cargar los pesos sugeridos");
  return (await res.json()) as Record<string, number>;
}
```

- [ ] **Step 2: Test que falla.** En `mobile/__tests__/sesion.test.tsx`: mockear `../src/api/sessions` (o extender su mock) para que `getLastWeights` devuelva `{ barbell_bench_press: 42 }` (el catalogId del ejercicio del `program` de test). Agregar test:
```ts
test("muestra el peso sugerido del ejercicio activo y al tocarlo rellena el input", async () => {
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("tap-rep"));
  const hint = await screen.findByTestId("weight-suggestion");
  expect(hint.props.children).toEqual(expect.arrayContaining(["Sugerido: ", 42, " kg"])); // o el string que armes
  await fireEvent.press(hint);
  expect(screen.getByTestId("weight").props.value).toBe("42");
});
```
(Adaptar: si `../src/api/sessions` no está mockeado en el archivo, agregar `jest.mock("../src/api/sessions", () => ({ getLastWeights: async () => ({ barbell_bench_press: 42 }) }))`. Ajustar el assert del hint al string exacto que renderices.)

- [ ] **Step 3: Correr, confirmar FAIL.** `cd mobile && npm test -- --runInBand sesion`

- [ ] **Step 4: Implementar en `mobile/app/sesion.tsx`.**
  1. Importar `getLastWeights` de `../src/api/sessions`.
  2. Estado + carga (junto al effect de `getProfile`/equipment):
```tsx
const [lastWeights, setLastWeights] = useState<Record<string, number>>({});
useEffect(() => {
  void getBackendUrl().then((url) => { if (url) getLastWeights(url).then(setLastWeights).catch(() => {}); });
}, []);
```
  3. Cerca del input de peso (`testID="weight"`), agregar el hint para el ejercicio activo:
```tsx
{current && lastWeights[current.catalogId] != null && (
  <Pressable testID="weight-suggestion" onPress={() => setWeight(String(lastWeights[current.catalogId]))}>
    <Text style={{ color: colors.accentText, fontSize: 12 }}>{"Sugerido: "}{lastWeights[current.catalogId]}{" kg"}</Text>
  </Pressable>
)}
```
  (Ubicarlo de forma coherente con el layout del input de peso/RPE.)

- [ ] **Step 5: Correr, confirmar PASS + typecheck + suite completa.** `cd mobile && npm test -- --runInBand sesion && npm run typecheck && npm test -- --runInBand`

- [ ] **Step 6: Commit.**
```bash
git add mobile/src/api/sessions.ts mobile/app/sesion.tsx mobile/__tests__/sesion.test.tsx
git commit -S -m "feat(mobile): hint de peso sugerido (último usado) en la sesión"
```

---

## Cierre del PR
- `cd backend && bun test && npx tsc --noEmit`, `cd mobile && npm run typecheck && npm test -- --runInBand` — verde.
- Push + PR → review (timer + escalado a `@claude`) → aplicar hallazgos → merge (con comentarios corregidos).
- Backend → requiere redeploy de la Pi para producción (queda para el usuario).
