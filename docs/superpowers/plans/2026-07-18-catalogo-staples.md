# Catálogo: recuperar ejercicios básicos recortados — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el catálogo incluya los ejercicios básicos de gimnasio que el generador descartó
(leg press, remo bajo sentado, aperturas, sentadilla frontal, etc.), sin romper los programas ya
guardados.

**Architecture:** El generador elige por categoría con un `cap` uniforme de 8, ordenando por
(cantidad de palabras ASC, alfabético ASC) y repartiendo round-robin entre buckets de equipamiento.
Ese criterio es puramente mecánico y no tiene noción de "ejercicio importante", así que descarta
básicos en favor de rarezas de nombre corto. Se agrega una **lista curada (`MUST_INCLUDE`)** que
entra siempre, sin competir por el `cap`, y una **guarda que revienta la generación** si un nombre
de la lista no existe en el SDK (para que un tipeo no falle en silencio).

**Tech Stack:** TypeScript, Bun, `@garmin/fitsdk`, `bun test`.

---

## Contexto imprescindible

**Qué es este catálogo.** `shared/src/catalog/exercises.data.ts` tiene 230 ejercicios generados
desde el SDK de Garmin. Se usa en tres lugares: el prompt de generación de programas
(`backend/src/ai/prompt.ts` y `oneoff.ts`, filtrado por equipamiento), el seed de la DB
(`backend/src/db/seed.ts`) y la app móvil.

**El archivo es auto-generado.** Su primera línea dice `AUTO-GENERATED ... do not edit by hand`.
**Nunca lo edites a mano**: se cambia `shared/scripts/generate-catalog.ts` y se regenera. Un cambio
a mano se pierde en la próxima regeneración.

**Las traducciones al español están aparte a propósito.** `shared/src/catalog/exercises.es.ts` es
un archivo curado a mano, separado justamente para que regenerar no lo pise. Un test obliga a que
**todos** los ids del catálogo tengan traducción, así que agregar ejercicios **rompe ese test hasta
que sumes las traducciones**. Eso es intencional.

**El riesgo serio: los ids.** Los programas guardados de los usuarios referencian ejercicios por
`catalogId`. Si al regenerar cambia el id de un ejercicio existente, esos programas apuntan a algo
que no existe. Por eso la Tarea 1 congela los ids actuales antes de tocar nada.

**Por qué se pierden los básicos (verificado).** En la categoría `SQUAT`, con `cap` 8, sobreviven
"Barbell Stepover", "Dumbbell Stepover" y "Kettlebell Swing Overhead", pero **no** el leg press ni
la sentadilla frontal. En `ROW` el SDK tiene 53 variantes y quedaron 8, sin el remo bajo sentado.

**Cómo correr los tests:** desde la raíz del repo, `bun test shared`. Para un archivo puntual,
`bun test shared/src/catalog/exercises.test.ts`.

**Verificación por mutación (obligatoria en este repo).** Después de que un test pase, rompé a
propósito el código que prueba y confirmá que el test **falla**. Un test que pasa igual con el
código roto no prueba nada. Esta convención existe porque en este repo aparecieron 27 tests falsos
que estaban en verde. Cada tarea de abajo tiene su paso de mutación explícito; no lo saltees.

---

## Estructura de archivos

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `shared/scripts/generate-catalog.ts` | Genera el catálogo desde el SDK | Modificar: `MUST_INCLUDE` + guarda + selección |
| `shared/src/catalog/exercises.data.ts` | Datos del catálogo | Regenerar (nunca a mano) |
| `shared/src/catalog/exercises.es.ts` | Traducciones curadas | Modificar: sumar los nuevos |
| `shared/src/catalog/catalogIds.frozen.ts` | Ids congelados pre-cambio | Crear |
| `shared/src/catalog/exercises.test.ts` | Tests del catálogo | Modificar: staples + no-regresión + tamaño |

---

## Task 1: Congelar los ids actuales (red de seguridad)

Antes de tocar el generador, dejamos por escrito los 230 ids que existen hoy, para que cualquier
cambio que haga desaparecer uno rompa el build. Es un test de caracterización: pasa apenas se
escribe (nada cambió todavía) y su valor aparece en las tareas siguientes.

**Files:**
- Create: `shared/src/catalog/catalogIds.frozen.ts`
- Modify: `shared/src/catalog/exercises.test.ts`

- [ ] **Step 1: Generar el archivo de ids congelados**

Corré exactamente esto desde la raíz del repo:

```bash
cd /Users/kilo/desarrollo26/pulsia/shared && bun -e '
import { EXERCISE_CATALOG } from "./src/catalog/exercises";
import { writeFileSync } from "fs";
const ids = EXERCISE_CATALOG.map((e) => e.id).sort();
const body = [
  "// Ids del catálogo congelados el 2026-07-18, ANTES de sumar los ejercicios básicos.",
  "// Los programas guardados de los usuarios referencian ejercicios por catalogId: si uno de estos",
  "// desaparece o cambia, esos programas quedan apuntando a un ejercicio inexistente.",
  "// Esta lista NO se actualiza al agregar ejercicios nuevos; solo crece si se decide, a conciencia,",
  "// que un id viejo puede morir (y ahí hay que migrar los programas guardados).",
  "export const FROZEN_CATALOG_IDS: string[] = [",
  ...ids.map((id) => `  "${id}",`),
  "];",
  "",
].join("\n");
writeFileSync("./src/catalog/catalogIds.frozen.ts", body, "utf-8");
console.log("Escritos", ids.length, "ids");
'
```

Salida esperada: `Escritos 230 ids`

- [ ] **Step 2: Escribir el test de no-regresión**

Agregá al final de `shared/src/catalog/exercises.test.ts`:

```ts
import { FROZEN_CATALOG_IDS } from "./catalogIds.frozen";

test("no-regresión: ningún id congelado desapareció del catálogo", () => {
  const actuales = new Set(EXERCISE_CATALOG.map((e) => e.id));
  const perdidos = FROZEN_CATALOG_IDS.filter((id) => !actuales.has(id));
  expect(perdidos).toEqual([]);
});
```

Nota: el `import` va arriba con los demás imports del archivo, no en el medio.

- [ ] **Step 3: Correr el test y verificar que pasa**

Run: `cd /Users/kilo/desarrollo26/pulsia && bun test shared/src/catalog/exercises.test.ts`
Expected: PASS (todos los tests del archivo en verde)

- [ ] **Step 4: Verificación por mutación**

Borrá a mano una entrada cualquiera de `exercises.data.ts` (por ejemplo el objeto completo de
`barbell_bench_press`), corré el test de nuevo y confirmá que **falla** con ese id en `perdidos`.
Después **deshacé el borrado** con `git checkout shared/src/catalog/exercises.data.ts` y confirmá
que vuelve a pasar.

Expected tras mutar: FAIL, con `["barbell_bench_press"]` en el array de perdidos.

- [ ] **Step 5: Commit**

```bash
git add shared/src/catalog/catalogIds.frozen.ts shared/src/catalog/exercises.test.ts
git commit -S -m "test(catálogo): congelar los ids actuales como red de seguridad"
```

---

## Task 2: Test de los ejercicios básicos que faltan (RED)

Ahora sí, el test que define lo que queremos. Va a fallar, y está bien.

**Files:**
- Modify: `shared/src/catalog/exercises.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregá a `shared/src/catalog/exercises.test.ts`:

```ts
test("el catálogo incluye los ejercicios básicos de gimnasio", () => {
  const nombres = EXERCISE_CATALOG.map((e) => e.garminName.toLowerCase());
  const basicos = [
    "leg press",
    "seated cable row",
    "goblet squat",
    "barbell front squat",
    "dumbbell flye",
    "cable crossover",
    "t bar row",
    "wide grip lat pulldown",
    "dumbbell shoulder press",
    "dumbbell hammer curl",
  ];
  const faltantes = basicos.filter((b) => !nombres.includes(b));
  expect(faltantes).toEqual([]);
});
```

- [ ] **Step 2: Correr el test y verificar que FALLA**

Run: `cd /Users/kilo/desarrollo26/pulsia && bun test shared/src/catalog/exercises.test.ts`
Expected: FAIL. El array `faltantes` debería listar varios (entre ellos `leg press` y
`seated cable row`). Anotá cuáles, sirve de referencia para el paso siguiente.

- [ ] **Step 3: Commit del test en rojo**

```bash
git add shared/src/catalog/exercises.test.ts
git commit -S -m "test(catálogo): fijar que los ejercicios básicos deben estar (falla)"
```

---

## Task 3: Lista curada en el generador

**Files:**
- Modify: `shared/scripts/generate-catalog.ts`

Todos los `camelName` de abajo fueron verificados contra el SDK el 2026-07-18: existen.

- [ ] **Step 1: Agregar la constante `MUST_INCLUDE`**

En `shared/scripts/generate-catalog.ts`, justo después de la declaración de `BUCKET_PRIORITY`,
agregá:

```ts
// ── Ejercicios básicos garantizados ──────────────────────────────────────────
// El criterio de selección (menos palabras, alfabético) no sabe qué ejercicio es importante:
// deja entrar "Barbell Stepover" y descarta el leg press. Estos entran SIEMPRE, sin competir
// por el cap. Claves = sdkKey de CATEGORIES; valores = camelName exacto del SDK de Garmin.
const MUST_INCLUDE: Record<string, string[]> = {
  benchPressExerciseName: ["inclineDumbbellBenchPress", "closeGripBarbellBenchPress"],
  rowExerciseName: ["seatedCableRow", "tBarRow", "oneArmBentOverRow", "chestSupportedDumbbellRow"],
  pullUpExerciseName: ["pullUp", "wideGripLatPulldown", "closeGripLatPulldown"],
  squatExerciseName: ["legPress", "gobletSquat", "barbellFrontSquat", "dumbbellSplitSquat", "barbellHackSquat"],
  flyeExerciseName: ["dumbbellFlye", "cableCrossover", "inclineDumbbellFlye"],
  curlExerciseName: ["dumbbellHammerCurl", "ezBarPreacherCurl"],
  tricepsExtensionExerciseName: ["lyingEzBarTricepsExtension"],
  shoulderPressExerciseName: ["dumbbellShoulderPress", "barbellShoulderPress", "arnoldPress"],
  deadliftExerciseName: ["romanianDeadlift", "sumoDeadlift", "barbellDeadlift"],
};
```

- [ ] **Step 2: Forzar la lista en la selección**

En la función `generate()`, localizá este bloque (está después de ordenar los buckets):

```ts
    // Round-robin selection across buckets in priority order
    const bucketPointers = new Map<EquipmentVal, number>();
    for (const b of BUCKET_PRIORITY) bucketPointers.set(b, 0);

    const selected: Candidate[] = [];
    let added = true;
    while (selected.length < cap && added) {
      added = false;
      for (const bucket of BUCKET_PRIORITY) {
        if (selected.length >= cap) break;
        const list = bucketMap.get(bucket);
        if (!list) continue;
        const ptr = bucketPointers.get(bucket)!;
        if (ptr >= list.length) continue;
        selected.push(list[ptr]);
        bucketPointers.set(bucket, ptr + 1);
        added = true;
      }
    }
```

y reemplazalo **entero** por:

```ts
    // Los básicos entran primero y no consumen cupo del cap.
    const mustCamel = new Set(MUST_INCLUDE[cfg.sdkKey] ?? []);
    const forced = candidates.filter((c) => mustCamel.has(c.camelName));

    // Guarda: si un nombre de MUST_INCLUDE no llegó a candidatos (tipeo, o lo filtró isExcluded),
    // reventamos. Si no, un tipeo no hace nada y nadie se entera.
    if (forced.length !== mustCamel.size) {
      const encontrados = new Set(forced.map((c) => c.camelName));
      const perdidos = [...mustCamel].filter((n) => !encontrados.has(n));
      throw new Error(
        `MUST_INCLUDE[${cfg.sdkKey}]: estos nombres no existen en el SDK o los filtró isExcluded/isLegitBodyweight: ${perdidos.join(", ")}`,
      );
    }

    // Round-robin selection across buckets in priority order
    const bucketPointers = new Map<EquipmentVal, number>();
    for (const b of BUCKET_PRIORITY) bucketPointers.set(b, 0);

    const selected: Candidate[] = [...forced];
    const target = cap + forced.length;
    let added = true;
    while (selected.length < target && added) {
      added = false;
      for (const bucket of BUCKET_PRIORITY) {
        if (selected.length >= target) break;
        const list = bucketMap.get(bucket);
        if (!list) continue;
        const ptr = bucketPointers.get(bucket)!;
        if (ptr >= list.length) continue;
        const cand = list[ptr];
        bucketPointers.set(bucket, ptr + 1);
        added = true;
        if (mustCamel.has(cand.camelName)) continue; // ya entró como forzado
        selected.push(cand);
      }
    }
```

- [ ] **Step 3: Verificar la guarda (mutación del mecanismo)**

Cambiá temporalmente `"legPress"` por `"legPressXX"` en `MUST_INCLUDE` y corré:

Run: `cd /Users/kilo/desarrollo26/pulsia && bun run shared/scripts/generate-catalog.ts`
Expected: revienta con `MUST_INCLUDE[squatExerciseName]: estos nombres no existen en el SDK ...: legPressXX`

Volvé a dejar `"legPress"` antes de seguir.

- [ ] **Step 4: Commit**

```bash
git add shared/scripts/generate-catalog.ts
git commit -S -m "feat(catálogo): lista curada de ejercicios básicos en el generador"
```

---

## Task 4: Regenerar el catálogo

**Files:**
- Modify: `shared/src/catalog/exercises.data.ts` (regenerado, nunca a mano)

- [ ] **Step 1: Regenerar**

Run: `cd /Users/kilo/desarrollo26/pulsia && bun run shared/scripts/generate-catalog.ts`
Expected: imprime `Final CAP = ...` con el total nuevo (esperable ~255) y los conteos por categoría.
Anotá el total, lo necesitás en la Tarea 6.

**Si revienta con el error de `MUST_INCLUDE`** y estás seguro de que el nombre existe en el SDK
(están todos verificados al 2026-07-18), entonces lo filtró `isExcluded()` o `isLegitBodyweight()`
antes de llegar a candidatos. El caso más probable es `pullUp`, que cae en el bucket bodyweight.
Qué hacer: leé esas dos funciones, decidí si el filtro está de más para ese caso puntual y
relajalo, **o** sacá ese nombre de `MUST_INCLUDE` si el filtro tiene razón. No desactives la guarda.

- [ ] **Step 2: Revisar el diff con ojo crítico**

Run: `git diff --stat shared/src/catalog/exercises.data.ts`

Después mirá el diff completo y confirmá tres cosas:
1. Las entradas nuevas son las esperadas (los básicos).
2. **Ninguna entrada preexistente cambió de `id`.**
3. No aparecieron ejercicios absurdos por efecto colateral del `target` más grande.

**Esperá entradas de más en algunas categorías, y es correcto.** El `target` es `cap + forzados`,
así que una categoría con 3 forzados termina con 11 en vez de 8 — incluso si alguno de esos 3 ya
iba a entrar por su cuenta (`romanianDeadlift` y `barbellDeadlift` ya estaban en el catálogo). La
semántica es "cada categoría conserva sus `cap` elegidos por el algoritmo, más los básicos
garantizados". Es predecible; no lo trates como un bug.

Si algo no cuadra, pará y reportalo antes de seguir. No lo arregles a mano en el `.data.ts`.

- [ ] **Step 3: Correr el test de no-regresión de ids**

Run: `cd /Users/kilo/desarrollo26/pulsia && bun test shared/src/catalog/exercises.test.ts`
Expected: el test de ids congelados PASA. El de básicos ahora PASA. **El de tamaño (150-250)
probablemente FALLA** — se arregla en la Tarea 6, es esperado.

- [ ] **Step 4: Commit**

```bash
git add shared/src/catalog/exercises.data.ts
git commit -S -m "feat(catálogo): regenerar con los ejercicios básicos"
```

---

## Task 5: Traducciones al español de los nuevos

El test de cobertura de `exercises.es.test.ts` está fallando ahora mismo: exige traducción para
todos los ids. Eso es a propósito.

**Files:**
- Modify: `shared/src/catalog/exercises.es.ts`

- [ ] **Step 1: Confirmar qué falta**

Run: `cd /Users/kilo/desarrollo26/pulsia && bun test shared/src/catalog/exercises.es.test.ts`
Expected: FAIL, con el array `faltantes` listando los ids nuevos sin traducción.

- [ ] **Step 2: Agregar las traducciones**

En `shared/src/catalog/exercises.es.ts`, agregá cada id faltante **en la sección de su categoría**
(el archivo está agrupado por comentarios `// ROW`, `// SQUAT`, etc.), en español natural de
gimnasio. Referencia para los básicos de este cambio:

```ts
  // ROW
  seated_cable_row: "Remo bajo sentado en polea",
  t_bar_row: "Remo en barra T",
  one_arm_bent_over_row: "Remo a una mano inclinado",
  chest_supported_dumbbell_row: "Remo con mancuernas con pecho apoyado",

  // SQUAT
  leg_press: "Prensa de piernas",
  goblet_squat: "Sentadilla goblet",
  barbell_front_squat: "Sentadilla frontal con barra",
  dumbbell_split_squat: "Zancada estática con mancuernas",
  barbell_hack_squat: "Sentadilla hack con barra",

  // FLYE
  dumbbell_flye: "Aperturas con mancuernas",
  cable_crossover: "Cruces en poleas",
  incline_dumbbell_flye: "Aperturas inclinadas con mancuernas",

  // PULL_UP
  pull_up: "Dominadas",
  wide_grip_lat_pulldown: "Jalón al pecho agarre ancho",
  close_grip_lat_pulldown: "Jalón al pecho agarre cerrado",

  // SHOULDER_PRESS
  dumbbell_shoulder_press: "Press de hombros con mancuernas",
  barbell_shoulder_press: "Press de hombros con barra",
  arnold_press: "Press Arnold",

  // CURL
  dumbbell_hammer_curl: "Curl martillo con mancuernas",
  ez_bar_preacher_curl: "Curl predicador con barra Z",

  // BENCH_PRESS
  incline_dumbbell_bench_press: "Press inclinado con mancuernas",
  close_grip_barbell_bench_press: "Press de banca agarre cerrado",

  // TRICEPS_EXTENSION
  lying_ez_bar_triceps_extension: "Extensión de tríceps tumbado con barra Z",

  // DEADLIFT
  sumo_deadlift: "Peso muerto sumo",
```

**Importante:** los ids reales los dicta el generador (`slug()` del camelName), y puede haber
colisiones que agreguen un prefijo de categoría. Usá los ids **exactos** que reporta el test que
falla, no los de esta lista si difieren. Si un id de arriba ya existía en el archivo, no lo
dupliques.

- [ ] **Step 3: Correr los tests**

Run: `cd /Users/kilo/desarrollo26/pulsia && bun test shared/src/catalog/`
Expected: `exercises.es.test.ts` PASA. El de tamaño puede seguir fallando (Tarea 6).

- [ ] **Step 4: Verificación por mutación**

Comentá una de las traducciones que acabás de agregar, corré `bun test shared/src/catalog/exercises.es.test.ts`
y confirmá que **falla** nombrando ese id. Descomentala y confirmá que vuelve a pasar.

- [ ] **Step 5: Commit**

```bash
git add shared/src/catalog/exercises.es.ts
git commit -S -m "feat(catálogo): traducciones al español de los ejercicios básicos"
```

---

## Task 6: Ajustar la cota de tamaño

El test `"el catálogo tiene un tamaño razonable (150-250)"` fue escrito cuando el catálogo tenía
230. Ahora es más grande. La cota existe para detectar una explosión accidental, así que se sube,
no se borra.

**Files:**
- Modify: `shared/src/catalog/exercises.test.ts:34-37`

- [ ] **Step 1: Actualizar la cota**

Reemplazá:

```ts
test("el catálogo tiene un tamaño razonable (150-250)", () => {
  expect(EXERCISE_CATALOG.length).toBeGreaterThanOrEqual(150);
  expect(EXERCISE_CATALOG.length).toBeLessThanOrEqual(250);
});
```

por:

```ts
test("el catálogo tiene un tamaño razonable (150-300)", () => {
  // La cota alta subió de 250 a 300 al sumar los básicos de MUST_INCLUDE (2026-07-18).
  // Sigue existiendo para atajar una explosión accidental del generador.
  expect(EXERCISE_CATALOG.length).toBeGreaterThanOrEqual(150);
  expect(EXERCISE_CATALOG.length).toBeLessThanOrEqual(300);
});
```

Si el total que anotaste en la Tarea 4 supera 300, **pará y reportalo**: significa que el mecanismo
agregó más de lo previsto y hay que revisar `MUST_INCLUDE` antes de subir la cota.

- [ ] **Step 2: Correr toda la suite de shared**

Run: `cd /Users/kilo/desarrollo26/pulsia && bun test shared`
Expected: PASS, todo verde.

- [ ] **Step 3: Commit**

```bash
git add shared/src/catalog/exercises.test.ts
git commit -S -m "test(catálogo): subir la cota de tamaño a 300"
```

---

## Task 7: Verificar backend y móvil

El catálogo alimenta el prompt de la IA y el seed de la DB. Hay que confirmar que crecer no rompe
nada.

**Files:**
- Verificar (sin modificar salvo que falle): `backend/src/db/seed.ts`, `backend/src/ai/prompt.ts`

- [ ] **Step 1: Correr backend y móvil**

Run: `cd /Users/kilo/desarrollo26/pulsia && bun test shared backend`
Expected: PASS

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && npm test -- --runInBand`
Expected: PASS (`--runInBand` es obligatorio: en paralelo da timeouts flaky)

- [ ] **Step 2: Confirmar que el seed tolera ejercicios nuevos**

El contenedor corre `db:migrate && db:seed && start` en cada deploy, así que el seed va a
encontrarse con filas nuevas contra una tabla que ya tiene las viejas. Leé `backend/src/db/seed.ts`
y confirmá que hace upsert (`onConflictDo...`) y no un insert pelado que reviente por clave
duplicada.

Si hace insert pelado, **pará y reportalo**: es un bug de deploy y necesita su propia tarea, no un
parche acá.

- [ ] **Step 3: Medir el impacto en el prompt**

Run:

```bash
cd /Users/kilo/desarrollo26/pulsia/shared && bun -e '
import { EXERCISE_CATALOG, catalogForEquipment } from "./src/catalog/exercises";
const gym = catalogForEquipment(["barbell","dumbbell","cable_machine","machine","kettlebell","bodyweight","pull_up_bar","resistance_band","trx"]);
console.log("catálogo total:", EXERCISE_CATALOG.length);
console.log("visibles con equipo completo de gym:", gym.length);
console.log("caracteres aprox. en el prompt:", gym.map(e=>e.garminName).join(", ").length);
'
```

Anotá los números en el PR. No hay umbral que rompa nada acá; es para que quede registrado cuánto
creció el prompt de generación.

- [ ] **Step 4: Commit si hubo cambios**

Si no hiciste cambios, no hay nada que commitear. Seguí a la Tarea 8.

---

## Task 8: PR

- [ ] **Step 1: Push**

```bash
cd /Users/kilo/desarrollo26/pulsia && git push -u origin feat/gifs-ejercicios
```

- [ ] **Step 2: Abrir el PR**

```bash
gh pr create --title "feat(catálogo): recuperar los ejercicios básicos que el generador descartaba" --body "$(cat <<'EOF'
## Qué

El catálogo no tenía leg press, remo bajo sentado, aperturas, sentadilla frontal ni jalón con
agarre ancho. El generador elige por categoría con un cap de 8, ordenando por cantidad de palabras
y alfabético — un criterio que no sabe qué ejercicio es importante. En SQUAT sobrevivían "Barbell
Stepover" y "Kettlebell Swing Overhead", pero no el leg press.

Se agrega `MUST_INCLUDE`: una lista curada que entra siempre, sin competir por el cap, con una
guarda que revienta la generación si un nombre no existe en el SDK.

Disparador: al preparar las demostraciones animadas de ejercicios se detectó que faltaba el "low
row". Ver `docs/superpowers/specs/2026-07-18-gifs-ejercicios-design.md`.

## Seguridad de los datos

Los programas guardados referencian ejercicios por `catalogId`. `catalogIds.frozen.ts` congela los
230 ids previos y un test falla si alguno desaparece. Verificado por mutación.

## Verificación

- `bun test shared backend` verde
- `npm test -- --runInBand` en mobile verde
- Cada test nuevo verificado por mutación
EOF
)"
```

- [ ] **Step 3: Pedir review**

```bash
gh pr comment --body "@claude review"
```

Esperá el review y aplicá lo que pida. Menores → arreglar y mergear. Mayores → arreglar y **pedir
un review nuevo**. Nunca mergear sin al menos un review.

---

## Limitaciones conocidas (no son bugs de este cambio)

- **La extensión de cuádriceps en máquina no existe como tal en el SDK.** La categoría `LEG_CURL`
  de Garmin está poblada casi entera de good mornings; el leg extension solo aparece bajo
  `bandedExercisesExerciseName` (con banda) y `crunchExerciseName` (otro movimiento). No se fuerza
  ninguno de los dos porque ninguno es el ejercicio de máquina que uno esperaría.
- **`MUST_INCLUDE` es una lista curada a mano.** Va a quedar incompleta; se le agregan ejercicios a
  medida que se detecten faltantes. Esa es la naturaleza del mecanismo, no un defecto a resolver.
- Este plan cubre solo la Pieza 0 del spec. Las demostraciones animadas (Piezas 1-4) van en un plan
  aparte, una vez que el catálogo esté firme.
