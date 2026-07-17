# Atribución trabajo/descanso con pausas mid-serie

Fecha: 2026-07-17
Ámbito: `mobile/` (motor de sesión + resumen + estado de pausa) y `shared/` (esquema).

## Problema

Tras el fix de `fix/tiempo-de-trabajo` (commit `970be8c`, "una serie empieza cuando termina
el descanso anterior"), quedó destapado un bug de **atribución** preexistente en el resumen de
sesión: si el usuario **pausa en medio de una serie** (no durante el descanso), ese tiempo de
pausa se cuenta como **Trabajo** en vez de descontarse.

- `finishSession` resta `pausedMs` del **total**, pero la pausa **no toca** `startedAt`/`endedAt`
  de la serie abierta. Como `durationMs = endedAt − startedAt` (reloj de pared), el tiempo de
  pausa queda **dentro** del `durationMs` de esa serie.
- `summarize` calcula `workMs = Σ durationMs` y `restMs = total − workMs`. Con `durationMs`
  inflado: **Trabajo sube, Descanso baja**. La identidad `Trabajo + Descanso = Total` sigue
  cerrando (el descanso se deriva restando), pero la atribución queda mal.
- Caso extremo: si la pausa mid-serie es tan grande que `workMs > total`, `restMs` clampea a 0 y
  **Trabajo puede superar al Total**.

Pausar **durante el descanso** ya está bien resuelto a nivel sesión: `total` excluye la pausa y
`restMs = total − work` la atribuye correctamente al descanso. Pero el **rest por-fila** de
`perSet` (`próxima.startedAt − esta.endedAt`) **sí** queda inflado por una pausa mid-descanso,
porque usa timestamps de reloj de pared.

## Causa raíz

No existe registro de **dónde** ocurrió cada pausa. `PauseState` solo guarda el acumulado
(`pausedMs`) y el inicio de la pausa en curso (`pausedAt`). Sin los **intervalos** de pausa no se
puede saber qué serie (o qué hueco de descanso) solapa cada pausa.

## Decisiones de diseño

1. **Corrección canónica en `finishSession`** (no solo display). La sesión que produce
   `finishSession` es la que se persiste (`enqueueSession` → backend). Corregir ahí el
   `durationMs` de cada serie hace que la atribución sea correcta **en todos lados** (resumen
   local, backend, resúmenes longitudinales, y de yapa `exerciseBurn` que estima kcal desde
   `durationMs` → ahora usa tiempo activo, más correcto). `summarize` no cambia su cálculo de
   `workMs`.
2. **Modelo general de "tiempo muerto".** Los intervalos de pausa son tiempo muerto que se resta
   de **cualquier ventana de reloj de pared** que solapen:
   - `durationMs` de cada serie (arregla la atribución trabajo/descanso) → en `finishSession`.
   - hueco de descanso **por-fila** de `perSet` (arregla la inflación del rest mid-descanso) → en
     `summarize`.
3. **Los intervalos son la única fuente de verdad.** Se guardan en `PauseState` (persistidos) y se
   adjuntan a la `WorkoutSession` en `finishSession`, para que tanto `finishSession` (duraciones)
   como `summarize` (rest por-fila) lean lo mismo. `pausedMs`/`pausedAt` dejan de ser la fuente:
   `pausedMs` total se **deriva** de los intervalos.

Alternativa descartada (**solo display en `summarize`**): dejaría el `durationMs` crudo en la DB,
así que backend y longitudinal seguirían con el bug, y `summarize` dejaría de ser función pura de
`WorkoutSession`.

## Modelo de datos

Nuevo intervalo de pausa (epoch ms):

```ts
// shared/src/schemas/session.ts
export const PauseIntervalSchema = z.object({
  startedAt: z.number().int(),
  endedAt: z.number().int(), // en la sesión persistida siempre está cerrado
});
export type PauseInterval = z.infer<typeof PauseIntervalSchema>;
```

`WorkoutSessionSchema` gana un campo **opcional** (back-compat con sesiones ya persistidas y con
el backend, que ignora el campo si no lo mapea):

```ts
pauseIntervals: z.array(PauseIntervalSchema).optional(),
```

`PauseState` (mobile, AsyncStorage) pasa a guardar los intervalos. El último puede estar **abierto**
(`endedAt: null`) = pausa en curso:

```ts
export interface PauseInterval { startedAt: number; endedAt: number | null; }
export interface PauseState {
  sessionId: string;
  intervals: PauseInterval[];
}
```

Derivados en la UI (reemplazan los refs de hoy):
- `paused` = último intervalo abierto (`endedAt == null`).
- `pausedMs` total = `Σ (endedAt − startedAt)` de los cerrados `+ (abierto ? now − startedAt : 0)`.

## Algoritmo

Solapamiento de dos ventanas `[a0,a1]` y `[b0,b1]`:

```
overlapMs(a0, a1, b0, b1) = max(0, min(a1, b1) − max(a0, b0))
```

`finishSession(session, { nowMs, pauseIntervals })`:
1. Normalizar intervalos: `endedAt ?? nowMs` (cerrar el abierto), clampear a `[startedAt, nowMs]`
   de la sesión, descartar los de duración ≤ 0.
2. `totalPaused = Σ (iv.endedAt − iv.startedAt)`.
3. `totalDurationMs = max(0, nowMs − session.startedAt − totalPaused)`.
4. Por cada serie con `endedAt != null` y `durationMs != null`:
   `paused = Σ overlapMs(set.startedAt, set.endedAt, iv.startedAt, iv.endedAt)`;
   `durationMs = max(0, durationMs − paused)`.
5. Devolver `{ ...session, exercises: corregidos, endedAt: nowMs, totalDurationMs,
   pauseIntervals: normalizados }`.

`summarize`, rest por-fila (`perSet[i].restMs`):

```
gap = next.startedAt − set.endedAt
paused = Σ overlapMs(set.endedAt, next.startedAt, iv.startedAt, iv.endedAt)   // iv de session.pauseIntervals
restMs = max(0, gap − paused)
```

`workMs`, `restMs` a nivel sesión y todo lo demás quedan **igual**: al leer el `durationMs` ya
corregido, `workMs = Σ durationMs` y `restMs = total − workMs` cierran con la atribución correcta.

## Cambios por componente

- **`shared/src/schemas/session.ts`**: `PauseIntervalSchema` + `pauseIntervals?` en la sesión.
- **`mobile/src/storage/pauseState.ts`**: `PauseState` con `intervals`; validador acepta la nueva
  forma; migración best-effort del formato viejo (ver back-compat).
- **`mobile/src/session/engine.ts`**: helper `overlapMs` (exportado, puro) + `finishSession` con la
  nueva firma `{ nowMs; pauseIntervals?: PauseInterval[] }` y la corrección de `durationMs`.
- **`mobile/src/session/summary.ts`**: rest por-fila resta el solapamiento con
  `session.pauseIntervals`.
- **`mobile/app/sesion.tsx`**: mantener `intervals` en un ref en vez de `pausedMs`/`pausedAt`;
  `onPauseToggle` empuja/cierra intervalos; `resumeIfPaused` cierra el abierto; `onFinish` pasa
  `pauseIntervals` (cerrando el abierto en `now`) a `finishSession`; restaurar intervalos desde
  `PauseState`.

## Casos borde y back-compat

- **Sesión sin pausas / con pausas solo en descanso**: `pauseIntervals` no solapa ninguna serie →
  `durationMs` intacto → comportamiento idéntico al de hoy (no regresa nada).
- **Pausa que excede la serie**: `overlapMs` clampea; `durationMs` nunca baja de 0.
- **`PauseState` viejo persistido** (`{ pausedMs, pausedAt }` sin `intervals`): migración
  best-effort en `getPauseState` → si `pausedAt != null`, un intervalo **abierto** `{ startedAt:
  pausedAt, endedAt: null }`; el `pausedMs` ya acumulado (pausas resueltas antes del update) de una
  sesión **en vuelo** se pierde para la atribución. Limitación conocida, se auto-sana en la próxima
  sesión; solo afecta a una sesión pausada/reanudada justo antes de actualizar la app.
- **Sesiones ya guardadas sin `pauseIntervals`**: `summarize` trata el campo ausente como `[]` →
  rest por-fila sin corrección (igual que hoy). Sin migración de datos.
- **`durationMs !== endedAt − startedAt`** tras la corrección: invariante que **hoy no usa nadie**
  (verificado: `summarize` deriva el rest de timestamps, el backend guarda `durationMs` tal cual).

## Testing (TDD + verificación por mutación, convención del repo)

Unit puros (sin UI):
- `overlapMs`: sin solape, solape parcial por ambos lados, contención total, ventanas idénticas,
  toques en el borde (== 0).
- `finishSession`:
  - pausa **mid-serie** → `durationMs` de esa serie baja exactamente el solape; `workMs`
    (vía `summarize`) baja y `restMs` sube; identidad `work + rest == total`.
  - pausa **mid-descanso** → `durationMs` de series intacto; `total` baja; atribución correcta.
  - pausa que **excede** la serie → `durationMs` clampa a 0, `Trabajo ≤ Total`.
  - múltiples pausas en una misma serie; pausa que cruza el borde entre serie y descanso.
  - sin pausas → sesión idéntica.
- `summarize`: rest por-fila resta el solape con `pauseIntervals`; sin `pauseIntervals` → igual que
  hoy.

Verificación por mutación sobre `overlapMs`, la corrección de `durationMs` y la del rest por-fila
(que los tests maten mutaciones de `max`/`min`, signos y límites).

## Fuera de alcance

- Persistir `pauseIntervals` en una columna del backend (el valor canónico que importa aguas abajo
  —`durationMs` corregido— ya se persiste; el rest por-fila se calcula sobre el objeto local).
- Corrección de rest por-fila para sesiones históricas ya guardadas sin `pauseIntervals`.
- Cambios de UI del resumen (`SessionSummary.tsx`) más allá de reflejar los números corregidos.

## Flujo de trabajo

Rama nueva desde `main`, ejecución subagent-driven, TDD + mutación, PR con review de CodeRabbit +
`@claude review`.
