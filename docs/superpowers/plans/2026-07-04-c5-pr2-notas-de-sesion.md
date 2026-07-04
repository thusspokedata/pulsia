# C5 · PR2 — Notas de sesión (mobile) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir escribir/editar la nota freeform de una sesión (`WorkoutSession.notes`) desde 3 lugares: durante la sesión, al terminar (resumen), y editable después desde el Historial.

**Architecture:** El backend ya persiste `notes` (columna `workout_session.notes`, `PUT /sessions/:id`, `GET /sessions/:id`) y `putSession` ya manda la sesión completa. Así que PR2 es **solo mobile**: una función pura del engine (`setNotes`), un componente reutilizable `NotesEditor`, y 3 puntos de integración. `SessionSummary` queda read-only; las notas se editan en el contenedor.

**Tech Stack:** Expo/React Native, TypeScript, jest (`jest-expo`, correr con `--runInBand`), AsyncStorage. Tests en `mobile/__tests__/` (NUNCA en `mobile/app/`).

**Notas de entorno:**
- Correr tests desde `mobile/`: `cd mobile && npm test -- --runInBand <patrón>`. Typecheck: `npm run typecheck`.
- `zod` no resuelve desde `mobile/` → no `import { z }`; usar tipos de `@pulsia/shared`.
- Commits firmados `git commit -S`. NUNCA atribución a Claude/Anthropic.
- Rama de trabajo: `feat/c5-notas` desde `main`.

**Contexto de código existente (para referencia):**
- `mobile/src/session/engine.ts`: funciones puras estilo `export function endSet(session, args): WorkoutSession { ... }`. `notes` se inicializa `""` en `startSession` y nunca se muta.
- `mobile/app/sesion.tsx`: `const [session, setSession] = useState<WorkoutSession|null>(null)` (línea 55); `function apply(next){ setSession(next); void setActiveSession(next); }` (88-91); vista de sesión terminada `if (finishedSession) { return <ScrollView>...<SessionSummary summary={summarize(finishedSession)} /> ... <Pressable testID="summary-done">Listo</Pressable> ... }` (207-220); `onFinish` encola + sync + `setFinishedSession(done)` (315-334). `const sess = session` (230). Tokens: `import { colors, radius, spacing } from "../src/theme/tokens"`.
- `mobile/app/(tabs)/historial.tsx`: vista detalle `if (selected != null) { return <ScrollView>...<Pressable testID="hist-back">← Volver</Pressable><SessionSummary summary={summarize(selected)} /></ScrollView> }` (112-121); `baseUrl.current` tiene la URL; importa `getSessions, getSessionById, deleteSessionById` de `../../src/api/sessions`.
- `mobile/src/api/sessions.ts`: exporta `putSession(baseUrl, session)`, `getSessions`, `getSessionById`, `deleteSessionById`.

---

## Task 1: `setNotes` en el engine (pura)

**Files:**
- Modify: `mobile/src/session/engine.ts`
- Test: `mobile/__tests__/session-engine.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `mobile/__tests__/session-engine.test.ts` (usa el mismo helper para construir una sesión que los otros tests del archivo; si hay un builder local reusarlo, si no construir un `WorkoutSession` mínimo inline):

```ts
import { setNotes } from "../src/session/engine";

test("setNotes setea la nota sin mutar la sesión original ni tocar el resto", () => {
  const base = { id: "s1", programId: "p1", weekNumber: 1, dayLabel: "Día 1", location: "gym",
    startedAt: 1000, endedAt: null, totalDurationMs: null, notes: "", exercises: [] } as any;
  const next = setNotes(base, "me dolió el hombro");
  expect(next.notes).toBe("me dolió el hombro");
  expect(base.notes).toBe(""); // no muta el original
  expect(next.exercises).toBe(base.exercises); // preserva el resto por referencia
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd mobile && npm test -- --runInBand session-engine`
Expected: FAIL — `setNotes` no existe.

- [ ] **Step 3: Implementar `setNotes`**

Agregar a `mobile/src/session/engine.ts` (junto a las otras funciones puras):

```ts
export function setNotes(session: WorkoutSession, notes: string): WorkoutSession {
  return { ...session, notes };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd mobile && npm test -- --runInBand session-engine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/session/engine.ts mobile/__tests__/session-engine.test.ts
git commit -S -m "feat(mobile): setNotes puro en el engine de sesión"
```

---

## Task 2: Componente `NotesEditor`

**Files:**
- Create: `mobile/src/components/NotesEditor.tsx`
- Test: `mobile/__tests__/notes-editor.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

Crear `mobile/__tests__/notes-editor.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react-native";
import { NotesEditor } from "../src/components/NotesEditor";

test("muestra el valor y emite onChangeText al escribir", () => {
  const onChangeText = jest.fn();
  render(<NotesEditor value="hola" onChangeText={onChangeText} />);
  const input = screen.getByTestId("notes-input");
  expect(input.props.value).toBe("hola");
  fireEvent.changeText(input, "hola mundo");
  expect(onChangeText).toHaveBeenCalledWith("hola mundo");
});

test("respeta editable=false", () => {
  render(<NotesEditor value="x" onChangeText={() => {}} editable={false} />);
  expect(screen.getByTestId("notes-input").props.editable).toBe(false);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd mobile && npm test -- --runInBand notes-editor`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar el componente**

Crear `mobile/src/components/NotesEditor.tsx`:

```tsx
import { View, Text, TextInput } from "react-native";
import { colors, radius, spacing } from "../theme/tokens";

export function NotesEditor({
  value,
  onChangeText,
  onBlur,
  editable = true,
  label = "Nota de la sesión",
  placeholder = "Cómo te sentiste, molestias, observaciones…",
}: {
  value: string;
  onChangeText: (t: string) => void;
  onBlur?: () => void;
  editable?: boolean;
  label?: string;
  placeholder?: string;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{label}</Text>
      <TextInput
        testID="notes-input"
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        editable={editable}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={1000}
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.sm,
          padding: spacing.sm,
          color: colors.text,
          minHeight: 72,
          textAlignVertical: "top",
        }}
      />
    </View>
  );
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd mobile && npm test -- --runInBand notes-editor`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/NotesEditor.tsx mobile/__tests__/notes-editor.test.tsx
git commit -S -m "feat(mobile): componente NotesEditor reutilizable"
```

---

## Task 3: Nota durante la sesión (vista activa de `sesion.tsx`)

**Files:**
- Modify: `mobile/app/sesion.tsx`
- Test: `mobile/__tests__/sesion.test.tsx` (extender)

- [ ] **Step 1: Escribir el test que falla**

Agregar a `mobile/__tests__/sesion.test.tsx` un test que, tras arrancar una sesión, escriba en el `notes-input` y verifique que se persiste vía `setActiveSession`. Seguir el patrón de mocks ya usado en ese archivo (mock de `../src/storage/activeSession`, `expo-router`, etc.). Esqueleto:

```tsx
// Asumiendo que el archivo ya mockea setActiveSession como jest.fn() (si no, agregarlo al mock existente).
test("escribir una nota durante la sesión la persiste en la sesión activa", async () => {
  // ...render de SesionScreen con una sesión activa (reusar el harness/beforeEach del archivo)...
  const input = await screen.findByTestId("notes-input");
  fireEvent.changeText(input, "hombro molesto");
  await waitFor(() =>
    expect(setActiveSession).toHaveBeenCalledWith(expect.objectContaining({ notes: "hombro molesto" })),
  );
});
```

Nota para el implementador: adaptar al harness real del archivo (cómo monta la sesión activa y qué está mockeado). Si `setActiveSession` no está mockeado como spy, agregarlo al `jest.mock("../src/storage/activeSession", ...)` existente.

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd mobile && npm test -- --runInBand sesion`
Expected: FAIL — no hay `notes-input` en la vista activa todavía.

- [ ] **Step 3: Implementar**

En `mobile/app/sesion.tsx`:
1. Importar el componente y la función pura arriba:
```tsx
import { NotesEditor } from "../src/components/NotesEditor";
// y sumar setNotes al import existente del engine:
// import { ..., setNotes } from "../src/session/engine";
```
2. En la vista activa (después del bloque de "Ejercicios" / cerca del final del JSX de la sesión activa, antes de los botones de sesión), agregar:
```tsx
<NotesEditor value={sess.notes} onChangeText={(t) => apply(setNotes(sess, t))} />
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd mobile && npm test -- --runInBand sesion`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
cd mobile && npm run typecheck
git add mobile/app/sesion.tsx mobile/__tests__/sesion.test.tsx
git commit -S -m "feat(mobile): editar la nota durante la sesión (persiste en sesión activa)"
```

---

## Task 4: Nota al terminar (vista `finishedSession` de `sesion.tsx`)

**Files:**
- Modify: `mobile/app/sesion.tsx`
- Test: `mobile/__tests__/sesion.test.tsx` (extender)

Contexto: al terminar, la sesión ya fue encolada y limpiada de `activeSession`. Editar la nota acá debe **re-encolar** la sesión actualizada (upsert idempotente por id) y re-sincronizar.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `sesion.test.tsx` un test que llegue a la vista de resumen (terminar la sesión) y luego escriba en el `notes-input`, verificando que se re-encola con la nota. Reusar los mocks de `enqueueSession`/`syncPending`/`getBackendUrl` del archivo (agregarlos como spies si faltan). Esqueleto:

```tsx
test("editar la nota en el resumen re-encola la sesión con la nota", async () => {
  // ...render + terminar la sesión (fireEvent en testID "finish") para llegar al resumen...
  const input = await screen.findByTestId("notes-input");
  fireEvent.changeText(input, "buen día de espalda");
  fireEvent(input, "blur");
  await waitFor(() =>
    expect(enqueueSession).toHaveBeenCalledWith(expect.objectContaining({ notes: "buen día de espalda" })),
  );
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd mobile && npm test -- --runInBand sesion`
Expected: FAIL — no hay `notes-input` en la vista de resumen.

- [ ] **Step 3: Implementar**

En `mobile/app/sesion.tsx`, dentro del `if (finishedSession) { ... }` (207-220), agregar estado local para la nota editada y el `NotesEditor` antes del botón "Listo":

```tsx
// arriba, junto a los otros useState:
const [finishedNotes, setFinishedNotes] = useState("");
// sincronizar cuando aparece el resumen:
useEffect(() => { if (finishedSession) setFinishedNotes(finishedSession.notes); }, [finishedSession]);

async function saveFinishedNotes() {
  if (!finishedSession) return;
  const updated = setNotes(finishedSession, finishedNotes);
  setFinishedSession(updated);
  await enqueueSession(updated);
  const url = await getBackendUrl();
  if (url) void syncPending(url);
}
```
Y en el JSX del resumen, entre `<SessionSummary .../>` y el `<Pressable testID="summary-done">`:
```tsx
<NotesEditor value={finishedNotes} onChangeText={setFinishedNotes} onBlur={saveFinishedNotes} />
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd mobile && npm test -- --runInBand sesion`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
cd mobile && npm run typecheck
git add mobile/app/sesion.tsx mobile/__tests__/sesion.test.tsx
git commit -S -m "feat(mobile): editar la nota en el resumen post-entrenamiento (re-encola)"
```

---

## Task 5: Editar la nota desde el Historial

**Files:**
- Modify: `mobile/app/(tabs)/historial.tsx`
- Test: `mobile/__tests__/historial.test.tsx` (extender)

- [ ] **Step 1: Escribir el test que falla**

Agregar a `mobile/__tests__/historial.test.tsx`. El archivo ya mockea `../src/api/sessions` — sumar `putSession: jest.fn(async () => undefined)` a ese mock. Test:

```tsx
import { putSession } from "../src/api/sessions";

test("editar la nota en el detalle del historial la guarda con putSession", async () => {
  await render(<HistorialScreen />);
  await waitFor(() => expect(screen.getByTestId(`hist-item-${mockSessionA.id}`)).toBeTruthy());
  await fireEvent.press(screen.getByTestId(`hist-item-${mockSessionA.id}`));
  const input = await screen.findByTestId("notes-input");
  fireEvent.changeText(input, "revisar técnica de press");
  fireEvent(input, "blur");
  await waitFor(() =>
    expect(putSession).toHaveBeenCalledWith("http://backend.test",
      expect.objectContaining({ id: mockSessionA.id, notes: "revisar técnica de press" })),
  );
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd mobile && npm test -- --runInBand historial`
Expected: FAIL — no hay `notes-input` en el detalle.

- [ ] **Step 3: Implementar**

En `mobile/app/(tabs)/historial.tsx`:
1. Importar: `import { NotesEditor } from "../../src/components/NotesEditor";` y sumar `putSession` al import de `../../src/api/sessions`.
2. Estado local para la nota editada:
```tsx
const [detailNotes, setDetailNotes] = useState("");
useEffect(() => { if (selected) setDetailNotes(selected.notes); }, [selected]);

async function saveDetailNotes() {
  const url = baseUrl.current;
  if (!url || !selected) return;
  const updated = { ...selected, notes: detailNotes };
  setSelected(updated);
  try { await putSession(url, updated); } catch { setDetailError("No se pudo guardar la nota"); }
}
```
3. En la vista detalle (`if (selected != null)`), agregar entre el `<Pressable testID="hist-back">` y `<SessionSummary .../>`:
```tsx
<NotesEditor value={detailNotes} onChangeText={setDetailNotes} onBlur={saveDetailNotes} />
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd mobile && npm test -- --runInBand historial`
Expected: PASS.

- [ ] **Step 5: Typecheck + suite completa + commit**

```bash
cd mobile && npm run typecheck && npm test -- --runInBand
git add "mobile/app/(tabs)/historial.tsx" mobile/__tests__/historial.test.tsx
git commit -S -m "feat(mobile): editar la nota de una sesión desde el Historial"
```

---

## Cierre del PR
- Rama `feat/c5-notas` desde `main`. Tras todas las tareas: `cd mobile && npm run typecheck && npm test -- --runInBand` en verde.
- Push + PR → review (poll con timer; escalar a `@claude review` si CodeRabbit tarda) → aplicar hallazgos → merge con OK del usuario.
- Nativo: no requiere nuevo build para probar (es JS puro); igual se ve recién en el próximo preview.
