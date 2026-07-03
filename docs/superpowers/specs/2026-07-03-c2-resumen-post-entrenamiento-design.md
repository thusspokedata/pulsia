# C2 — Resumen post-entrenamiento + Cancelar — Diseño

> Fecha: 2026-07-03. Estado: aprobado, pendiente de implementación.
> Sub-proyecto **C2** (experiencia post-entrenamiento). Mobile-only; reusa datos ya capturados en la
> `WorkoutSession`. El **mapa corporal (C3)** se enchufa después dentro de esta misma pantalla.

## 0. Objetivo

Al terminar un entrenamiento, mostrar una **pantalla de resumen** con métricas de la sesión (en vez
de saltar directo al inicio). Además, agregar un botón **Cancelar entrenamiento** con confirmación
para descartar una sesión en curso.

## 1. Flujo

- **Terminar entrenamiento** (botón existente): hoy hace enqueue + sync + `router.replace("/")`.
  Nuevo: hace enqueue + sync + **muestra el resumen** (estado `finishedSession`). El resumen tiene un
  botón **"Listo"** que recién ahí navega al inicio. La lógica de guardado/sync no cambia.
- **Cancelar entrenamiento** (botón nuevo, separado de Terminar): abre un pop-up nativo
  (`Alert.alert`) "¿Seguro que querés cancelarlo? Se perderá lo registrado." → No / Sí. Si confirma:
  `clearActiveSession()` (no se guarda) y `router.replace("/")`.

## 2. Arquitectura

- **`mobile/src/session/summary.ts`** — función pura `summarize(session): SessionSummary`. TDD.
  Depende del catálogo (`getExerciseById` de `@pulsia/shared`) solo para `primaryMuscles`.
- **`mobile/src/components/SessionSummary.tsx`** — componente presentacional que recibe el
  `SessionSummary` y lo renderiza. Sin lógica de cálculo.
- **`mobile/app/sesion.tsx`** — integra: estado `finishedSession`, render condicional del resumen,
  botón Cancelar.

## 3. `summarize(session)` → `SessionSummary`

```ts
interface SetRow {
  setNumber: number;
  exerciseName: string;      // garminName
  durationMs: number | null; // tiempo de la serie
  restMs: number | null;     // hueco hasta la próxima serie (null en la última)
  reps: number;
  weightKg: number | null;
  volumeKg: number | null;   // reps*weightKg, o null si peso corporal
}
interface ExerciseSummary {
  order: number; garminName: string;
  plannedSets: number; doneSets: number; completed: boolean;
  reps: number; volumeKg: number;   // volumen del ejercicio (Σ reps*peso; peso corporal cuenta 0)
}
interface MuscleVolume { muscle: string; sets: number; } // nº de series por músculo primario
interface SessionSummary {
  durationMs: number;                // totalDurationMs (fallback: endedAt-startedAt)
  workMs: number;                    // Σ durationMs de series terminadas
  restMs: number;                    // max(0, durationMs - workMs)
  totalPlannedSets: number;          // Σ planned.sets de TODOS los ejercicios (saltar baja el %)
  totalDoneSets: number;             // Σ series con endedAt != null
  completionPct: number;             // round(totalDoneSets/totalPlannedSets*100); 0 si plan=0
  exercisesDone: number;             // ejercicios con doneSets >= planned.sets
  exercisesTotal: number;
  totalReps: number;
  totalVolumeKg: number;             // Σ (reps*peso) de series con peso
  avgRpe: number | null;             // promedio de rpe no nulos (1 decimal)
  sessionLoadRpe: number | null;     // Σ reps*rpe (proxy de carga interna); null si no hay rpe
  avgHr: number | null;              // promedio redondeado de hrAvg no nulos
  maxHr: number | null;              // máximo de hrMax no nulos
  perExercise: ExerciseSummary[];
  perMuscle: MuscleVolume[];         // ordenado por sets desc; alimenta C3
  perSet: SetRow[];                  // ordenado por startedAt (para la tabla)
}
```

Reglas:
- Solo cuentan series con `endedAt != null` para work/reps/volumen/HR/rpe.
- `restMs` por serie: se aplanan todas las series (de todos los ejercicios) ordenadas por
  `startedAt`; el rest de una serie = `siguiente.startedAt - esta.endedAt` (>= 0); `null` en la última.
- `perMuscle`: por cada serie terminada, sumar 1 a cada `primaryMuscle` del ejercicio (via
  `getExerciseById(catalogId)?.primaryMuscles`). Ejercicios sin match en el catálogo se ignoran.
- Divisiones por cero → 0 (o null donde aplique).

## 4. UI del resumen (`SessionSummary`)

Secciones, de arriba a abajo:
1. **Encabezado**: `dayLabel` + fecha (de `startedAt`).
2. **Grid de métricas clave** (cards chicas): Tiempo total · % cumplimiento (grande, con
   "Ejercicios X/Y" debajo) · Volumen total (kg) · Reps totales · Carga (`sessionLoadRpe` si hay,
   si no tonelaje) · Avg HR / Max HR (si hay banda; si no, se omiten).
3. **Trabajo vs descanso**: `workMs` / `restMs` (fmt mm:ss).
4. **Por músculo**: lista `músculo — N series` (placeholder de C3; el mapa corporal reemplaza/complementa esto después).
5. **Tabla por serie** (colapsable, cerrada por defecto): columnas Set · Ejercicio · Tiempo ·
   Descanso · Reps · Peso · Volumen (de `perSet`). Peso/Volumen muestran "—" si null.
6. Botón **"Listo"** → navega al inicio.

Estilo: tokens existentes (`colors`, `spacing`, `radius`), acento coral. testIDs para test:
`summary` (root), `summary-completion`, `summary-volume`, `summary-avghr`, `toggle-sets`, `summary-done`.

## 5. Cancelar

En `sesion.tsx`, botón `testID="cancel"` "Cancelar entrenamiento" (estilo sutil/destructivo,
separado de Terminar). `onCancel` usa `Alert.alert(titulo, mensaje, [{text:"No",style:"cancel"},
{text:"Sí, cancelar", style:"destructive", onPress: async () => { await clearActiveSession();
router.replace("/"); }}])`.

## 6. Testing

- **`summary.test.ts`** (TDD, jest): sesión de ejemplo con 2 ejercicios, algunas series con/ sin
  peso, con/sin rpe, con/sin HR, uno saltado → verificar completionPct, work/rest, totales, avg/max
  HR, avgRpe, sessionLoadRpe, perMuscle (conteo por músculo), perSet (orden + rest). Casos borde:
  sesión vacía, sin HR (avg/max null), plan de 0 series.
- **`session-summary.test.tsx`**: render de `SessionSummary` con un summary fijo → muestra %
  cumplimiento, volumen, avg HR, y al tocar `toggle-sets` aparece la tabla.
- **`sesion.test.tsx`**: al Terminar se muestra el resumen (aparece `summary`), y "Listo" navega;
  Cancelar dispara el Alert (mockeando `Alert.alert`) y al confirmar navega sin enqueue.

## 7. Fuera de alcance (C2 v1)
- **Mapa corporal** (C3): reemplaza/mejora la sección "por músculo".
- **Curva de HR en el tiempo / zonas / minutos de intensidad**: requieren la serie temporal de HR
  (Backlog B).
- **Calorías estimadas**: fórmula con FC + perfil (edad/sexo/peso). Cuando se quiera.
- **Training Effect / Body Battery / hidratación**: propietarios de Garmin (ingesta Garmin).
