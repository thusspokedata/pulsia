# El informe cuenta las actividades importadas — Diseño

**Fecha:** 2026-07-24
**Rama:** `feat/informe-cuenta-actividades` (desde `main` tras #184)
**Dominio:** 2 — Nutrición (agente de informes)

> **Pieza 0** de una feature mayor: importar entrenamientos de fuerza del `.FIT` como entrenamientos
> (con series/reps/pesos), que la IA reconozca los ejercicios que dio, y que alimenten futuros
> planes. Esta pieza es el fix acotado del síntoma; las Piezas 1-3 tienen su propio brainstorming.

## Objetivo

El owner importó dos entrenamientos de fuerza (`.FIT`) y **la IA no los tuvo en cuenta como
entrenamientos** en el informe.

### La causa, verificada en prod

Los `.FIT` de fuerza (`subSport: strengthTraining`) se importan como **cardio tipo "other"**
(`mapSport` no reconoce la fuerza). En la DB del owner:

```
type   sport_profile_name  metabolic_kcal  kcal  fecha
other  Fuerza              39              124   2026-07-24
other  Fuerza              65              354   2026-07-23
```

`collect.ts` calcula las actividades del día (`dayCardio`) pero **solo las usa para el total de
kcal** (`exercise`); nunca se las pasa a la IA. El prompt (`report.ts:23`) dice:

```
- Entrenamiento: ${d.sessionsCount} sesión(es), gasto estimado ${d.exercise} kcal
```

donde `sessionsCount` = **solo** `workout_session` (fuerza registrada en la app). Resultado: la IA
lee *"0 sesión(es), gasto 478 kcal"* — contradictorio, y no puede interpretar que hubo
entrenamiento.

### Qué NO es esta pieza

- **No reclasifica.** El `"other"` sigue siendo "other". Reconocer la fuerza como fuerza estructurada
  (con series/reps/pesos) es la **Pieza 1**.
- **No toca el parser ni el import.** Los datos ya están en la DB; esto es solo lectura + prompt.
- **No cambia la semántica de `sessionsCount`.** Sigue contando sesiones de fuerza de la app.

## Diseño

Aprovechar que `sportProfileName` (el nombre del perfil deportivo del reloj: "Fuerza", "Elíptica",
"Caminar") **ya está persistido** por actividad. Dárselo a la IA para que vea qué hiciste y con qué
nombre, sin esperar a la reclasificación.

### `collect.ts` — exponer el desglose

Hoy `dayCardio` descarta `sportProfileName`:

```ts
const dayCardio = allCardio
  .filter((a) => a.startedAt >= from && a.startedAt <= to)
  .map((a) => ({ type: a.type, durationMs: a.durationMs, avgHr: a.avgHr, kcal: a.kcal }));
```

`dayCardio` se sigue usando tal cual para `dayExerciseBurn` (no se toca). Se agrega, en paralelo, un
campo nuevo en `ReportData`:

```ts
activities: { name: string; durationMin: number; kcal: number | null; avgHr: number | null }[];
```

donde `name = sportProfileName ?? CARDIO_LABELS[type]` (fallback al label español del tipo si el
`.FIT` no trajo el perfil, o si la actividad se cargó a mano). Se arma desde las mismas actividades
del rango, ordenadas por `startedAt`.

### `report.ts` — mostrárselo a la IA

Reemplazar la línea única de entrenamiento por dos, y ramificar por `periodDays`:

**Diario** (`periodDays === 1`) — listar cada actividad:
```
- Entrenamiento de fuerza (app): 0 sesión(es)
- Actividades registradas/importadas: Fuerza 47 min (354 kcal, FC 134), Fuerza 28 min (124 kcal, FC 102)
- Gasto total de ejercicio: 478 kcal
```

**Periódico** (`periodDays > 1`) — agregar por nombre para no inundar el prompt:
```
- Entrenamiento de fuerza (app): 3 sesión(es)
- Actividades registradas/importadas: 8× Fuerza, 5× Caminar, 3× Elíptica
- Gasto total de ejercicio: 5240 kcal
```

Si no hay actividades, se omite la línea "Actividades…" (no `"ninguna"`; menos ruido, mismo patrón
que `foodNamesLine`).

### Seguridad

`sportProfileName` es texto que viene del `.FIT` del usuario, así que entra en el bloque de datos
que `report.ts` **ya** blinda con su línea anti-inyección (el bloque entero se declara como DATOS,
no instrucciones). No se agrega una superficie nueva: es un dato más dentro del mismo bloque
protegido. No se puede testear contra el LLM real, pero la defensa que lo cubre ya tiene su propio
test de regresión ([[claude-review-es-estatico]] / la auditoría de #139).

## Componentes

| Archivo | Cambio |
|---|---|
| `backend/src/reports/collect.ts` | `ReportData.activities` nuevo; armarlo desde las actividades del rango con `sportProfileName ?? CARDIO_LABELS[type]` |
| `backend/src/ai/report.ts` | Reemplazar la línea de entrenamiento por el desglose diario/periódico |
| `backend/src/reports/collect.test.ts` | Cobertura del nuevo campo |
| `backend/src/ai/report.test.ts` | Cobertura del formato diario y periódico |

Sin migración, sin cambios en shared ni mobile. Backend puro → **no toca el fingerprint del OTA**.

## Testing

**Verificación por mutación de cada test nuevo** — §6 del ONBOARDING.

1. **`collect.ts`: la actividad usa `sportProfileName` como nombre.** Una actividad `type:"other"`,
   `sportProfileName:"Fuerza"` → `activities[0].name === "Fuerza"`. Mutación: si el map ignora
   `sportProfileName` y usa el label del tipo, daría "Otro" y el test cae.
2. **`collect.ts`: fallback al label del tipo** cuando `sportProfileName` es `undefined` → "Caminar"
   para `walk`. Cubre la rama del `??`.
3. **`collect.ts`: fuera del rango no entra.** Una actividad con `startedAt` fuera de `[from, to]`
   no aparece en `activities`.
4. **`report.ts` diario lista cada actividad con su nombre.** El caso exacto del bug: dos "Fuerza"
   → el texto contiene "Fuerza 47 min" y "Fuerza 28 min". Sin este test la feature puede no existir
   y la suite seguir verde.
5. **`report.ts` periódico agrega por nombre.** `periodDays > 1` con 8 "Fuerza" → "8× Fuerza", no
   ocho líneas. Mutación: si no ramifica por `periodDays`, el diario y el periódico saldrían igual.
6. **Sin actividades se omite la línea**, no aparece "Actividades:" vacío.

**Riesgo de test falso anticipado:** el test 4 (diario) puede pasar por el eco si `"Fuerza"` aparece
en el prompt por otra vía. Anclar la aserción al patrón completo `"Fuerza 47 min"`, no al literal
`"Fuerza"` suelto (la clase de test falso que este repo ya acumuló: regex corto que matchea por más
de un camino).

## Pendiente / conexión con las piezas siguientes

- **Pieza 1:** reconocer la fuerza del `.FIT` como entrenamiento estructurado (series/reps/pesos +
  ejercicios), decidiendo dónde se guarda (`workout_session` vs estructura propia). Cuando exista,
  `sessionsCount` contará esos entrenamientos de fuerza de verdad y esta línea del prompt se
  refinará.
- **Dato ya disponible para más adelante:** `metabolic_kcal` (el basal medido por Garmin) está
  persistido — sirve para afinar la corrección del BMR sin estimarlo con Mifflin (ver el spec de
  fuerza/%HRR, `2026-07-24-gasto-fuerza-hrr-design.md`, que quedó pausado).
