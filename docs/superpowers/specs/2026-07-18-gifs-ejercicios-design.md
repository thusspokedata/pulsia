# Demostraciones animadas de ejercicios (GIFs) + huecos del catálogo — Diseño

**Fecha:** 2026-07-18
**Rama:** `feat/gifs-ejercicios` (desde `origin/main` tras #157)
**Dominio:** 1 — Entrenamiento

## Objetivo

Que el usuario pueda tocar cualquier ejercicio y ver **cómo se hace**: una demostración animada
más cues de técnica. Hoy el ejercicio no es clickeable en ninguna pantalla, y el único dato que
se muestra es el nombre.

Se resuelve además un problema anterior que sale a la luz al inventariar el catálogo: **faltan
ejercicios comunes** (el disparador fue el "low row"), recortados por el generador.

## Hallazgo bloqueante: la fuente que proponía el backlog no se puede usar

El §8 del ONBOARDING propone *"[Fase 4] Detalle de ejercicio (imágenes free-exercise-db + cues)"*.
**Esa fuente queda descartada.** `free-exercise-db` se publica bajo Unlicense / dominio público,
pero el repo del que deriva declara en su `CONTRIBUTING.md`:

> "Currently all exercises have two images, these have been scrapped off the internet, therefore l
> do not own the copy right for these images and would advise against using them in comercial
> projects."

— <https://raw.githubusercontent.com/wrkout/exercises.json/master/CONTRIBUTING.md>

(cita verificada textualmente el 2026-07-18; el "l do not own" es un tipeo del original)

Y el mantenedor de `free-exercise-db`, en el issue #2 de su repo:

> "I actually have no idea where the images are from or if they are royalty free so usage would be
> at your own risk"

— <https://github.com/yuhonas/free-exercise-db/issues/2>

El rastro lleva a Bodybuilding.com, cuyos términos prohíben la reproducción. Es una **licencia
lavada**: un sello de dominio público sobre fotos de estudio con modelos identificables. Falla dos
veces (copyright de la imagen + derecho de imagen del modelo). Sus **datos** son buenos; sus
**imágenes** no son usables, y menos con una eventual salida comercial en el horizonte.

El patrón se repite en el ecosistema: licencias de código (MIT/AGPL) puestas sobre media de
terceros no otorgan derechos sobre esa media. Descartados también los datasets de Kaggle y wger
sin filtrar (87 de 360 imágenes de wger tienen `license_author` vacío → la atribución CC-BY-SA es
imposible de cumplir).

## Fuente elegida: Everkinetic (CC-BY-SA-4.0)

<https://github.com/everkinetic/data>

- **Ilustración de línea B/N dibujada a mano, no fotos** → sin exposición por derecho de imagen.
- 293 ejercicios; 248 con exactamente 2 cuadros (`-relaxation` / `-tension` = inicio y fin del
  movimiento), animables por cross-fade. SVG y PNG disponibles.
- Procedencia verificada de forma independiente por tres vías (GitHub, Wikimedia Commons, wger,
  todos acreditando a Greg Priday / Everkinetic) — una cesión genuina, a diferencia de los sets
  lavados.
- ~40 KB por PNG → ~18 MB para nuestros ejercicios; convertidos a **WebP** bastante menos.

Sobre el ShareAlike, el mantenedor (`solygen`) lo resolvió en
<https://github.com/everkinetic/data/issues/7> (verificado vía API de GitHub el 2026-07-18):

> "You could use it commercially but you have to give credit. In case you change or transform parts
> of it you have to share them (and only them, not you rwhole software) under the same license."

(el "you rwhole" es un tipeo del original)

Por lo tanto: se usan **sin modificar** (la conversión de formato se hace en el build, no se
publican derivados), el código sigue siendo propio, y se agrega una pantalla de créditos.

**Aclaración sobre "Not recommended for software".** El `LICENSE.md` de Everkinetic incluye esa
frase y ya asustó a otro usuario en el mismo issue. Es el texto estándar de Creative Commons, que
desaconseja usar sus licencias **para licenciar código fuente** (para eso existen GPL, MIT, etc.).
No dice nada en contra de **usar media CC dentro de** una app, que es exactamente nuestro caso.

**Limitación aceptada:** son 2 cuadros, no un GIF completo del movimiento. Muestran el recorrido y
las posiciones clave. Decisión del usuario: arrancar así y evaluar con el uso real.

**Camino de salida si queda corto:** packs pagos de una vez — GymVisual (~175-800 USD para 230
ejercicios; su licencia nombra explícitamente apps móviles) o Gym-Animations (199-599 USD, 3D,
masculino y femenino, 7000+ ejercicios). Ambos cubrirían además los ~30-70 ejercicios raros
(carries, chops, TRX) que **ninguna** fuente gratuita cubre. Si se compra, confirmar por escrito la
cláusula de productos destinados a reventa antes de pagar.

## Alcance

### Pieza 0 — Huecos del catálogo (va primero, PR aparte)

Regenerar el catálogo cambia la lista de ejercicios a cubrir. Mapear assets contra una lista que va
a cambiar es trabajo tirado, así que esto antecede a todo lo demás.

`shared/src/catalog/exercises.data.ts` está marcado `AUTO-GENERATED ... do not edit by hand`, así
que **no se edita a mano**: se corrige la selección en `shared/scripts/generate-catalog.ts` y se
regenera.

Verificado contra el SDK: el FIT SDK expone **53 variantes de ROW** y nuestro catálogo se quedó con
8. Entre las descartadas están `seatedCableRow` (el "low row" pedido), `wideGripSeatedCableRow`,
`seatedUnderhandGripCableRow`, `vGripCableRow` y `singleArmCableRow`. La causa es el `cap` y los
filtros de selección del generador, no una ausencia en el SDK.

- Revisar los criterios de selección para que sobrevivan los ejercicios de gimnasio comunes.
- Auditar las demás categorías con el mismo método (no asumir que ROW es la única afectada).
- El catálogo puede crecer por encima de 230; el `cap` se ajusta con criterio, no se elimina sin
  medir el impacto en el prompt de generación.
- `EXERCISE_NAMES_ES` (`exercises.es.ts`) es un archivo **separado y editado a mano** justamente
  para que regenerar no lo pise: hay que agregar la traducción de cada ejercicio nuevo.

### Pieza 1 — Media y cues (shared)

**`shared/src/catalog/exerciseMedia.ts`** — módulo puro, sin React ni filesystem:

```ts
interface ExerciseMedia {
  frames: [string, string];  // claves de asset: inicio, tensión
  cues: string[];            // 3-5 puntos de ejecución, en español
}
function exerciseMediaFor(catalogId: string): ExerciseMedia | undefined;
```

**Esta es la costura de la que cuelga todo.** Si más adelante se compra GymVisual, se reemplaza el
contenido de este módulo y ningún consumidor se entera.

**`shared/scripts/fetch-exercise-media.ts`** — script de ingesta versionado: baja de Everkinetic,
mapea nombres Garmin → slugs de Everkinetic, convierte a WebP y escribe los assets más el mapa. El
**output se commitea**, para que el build no dependa de que un repo ajeno siga vivo.

**La fuente se fija a una revisión inmutable.** El script apunta a un **commit SHA o tag concreto**
de `everkinetic/data`, nunca a `main` ni a una rama. Además, antes de regenerar valida:

- el **hash de cada archivo** descargado contra un manifiesto commiteado (`media.lock.json`), y
- que el `LICENSE.md` del upstream **siga siendo CC-BY-SA-4.0** en esa revisión.

Si algo no coincide, la ingesta **aborta** en vez de escribir assets. El motivo no es solo
reproducibilidad: un repo ajeno puede cambiar de licencia, reemplazar imágenes o desaparecer, y
nosotros estamos redistribuyendo ese contenido en una app con posible salida comercial. Enterarse
de un cambio de licencia por un hash que no matchea es mucho mejor que no enterarse. Es la misma
lógica que la guarda dura de `MUST_INCLUDE` en el generador del catálogo: preferimos reventar a
fallar en silencio.

**Cues: NO se generan con IA.** (Corrección del 2026-07-19, tras inspeccionar la fuente real.)
Everkinetic trae un campo **`steps`** por ejercicio con la técnica paso a paso, bajo la misma
licencia CC-BY-SA, y **los 93 ejercicios mapeados lo tienen**. Se **traducen al español** una vez y
quedan commiteados como datos estáticos; no hay llamada a la IA en runtime.

Traducir es sustancialmente más seguro que generar: una indicación técnica inventada puede hacer
que alguien se lesione, y un cue traducido conserva la responsabilidad editorial de la fuente. La
traducción sí puede hacerla la IA, porque el error posible ahí es de redacción, no de contenido.
Un ejercicio sin cues muestra solo la animación.

### Pieza 2 — Detalle del ejercicio (mobile)

**`mobile/app/ejercicio/[catalogId].tsx`** — una sola ruta, dos presentaciones: navegación normal
desde Programa y Buscador; `presentation: "modal"` desde la sesión.

**El modal no es cosmético.** Con un modal, `sesion.tsx` queda montada abajo en el stack y no se
desmonta. Dado el historial de esta app con la atribución de tiempo al remontar (#145) y las pausas
mid-serie (#147), sacar al usuario de la pantalla de sesión con una serie abierta es exactamente el
tipo de cambio que reabre esos bugs. El modal lo evita por construcción.

**`mobile/src/components/ExerciseDetail.tsx`** — el componente único que renderiza:
animación cross-fade (~1.2 s por ciclo, toque para pausar), nombre español grande + inglés chico,
chips de músculo primario/secundario, equipo, y cues numerados. Tokens de `theme/tokens.ts`, sin
colores nuevos.

**Assets bundleados**, no servidos desde la Pi: el caso hostil es el gimnasio sin señal. No agrega
dependencia nativa → el **fingerprint `784872cb` no cambia y sigue siendo OTA-safe**, sin APK nuevo.
`expo-updates` baja los assets de forma incremental.

### Pieza 3 — Los cuatro accesos (mobile)

| Dónde | Cambio |
|---|---|
| **Programa** | `WorkoutDayCard` pasa a `Pressable` → navega al detalle. **El nombre sigue en inglés**: es deliberado, sirve para buscar el ejercicio en el reloj (corregido por el owner el 2026-07-19) |
| **Sesión** | Tocar el nombre del ejercicio activo abre el modal. Cambio mínimo en `sesion.tsx` (ya tiene 40 KB; no es el momento de refactorizarlo) |
| **Alternativas** | Cada opción del picker gana acceso al detalle, sin abandonar la elección |
| **Buscador** | Pantalla nueva `mobile/app/ejercicios.tsx`: los ~230 con búsqueda por texto y filtro por músculo/equipo |

### Pieza 4 — Créditos

Pantalla (o sección en Configuración) acreditando a Everkinetic / Greg Priday bajo CC-BY-SA-4.0,
con enlace a la licencia. Es la condición de uso de la fuente.

## Cobertura y huecos

`exerciseMediaFor` devuelve `undefined` y la UI **no muestra el bloque de animación**. Sin
placeholders, sin pantallas rotas. Decisión del usuario: cubrir lo que se pueda y completar con el
tiempo, sin podar el catálogo ni bloquear el lanzamiento.

**Números MEDIDOS (2026-07-19), no estimados.** La estimación previa de ~67 % era optimista:

- **93** ejercicios del catálogo tienen mapeo curado a mano (`exerciseMedia.slugs.ts`).
- De esos, **86 tienen los dos cuadros disponibles** en el repo de Everkinetic: 79 en `dist/png/`
  y **7 que hay que sacar de `src/images-ai/`**, donde el naming es `-F`/`-S` en vez de
  `-relaxation`/`-tension`. Verificado visualmente que `-F`/`-S` son **los mismos dos cuadros del
  movimiento** (no dos ángulos de cámara), solo en mayor resolución.
- **7 mapeos apuntan a ejercicios sin assets** en ninguna carpeta del repo: `bent-over-row-with-barbell`,
  `push-up-feet-elevated-2`, `incline-inner-biceps-curl-with-dumbbell`,
  `standing-one-arm-triceps-extension-with-dumbbell`, `standing-calf-raise-with-dumbbell` (usado por
  dos ejercicios nuestros) y `wide-grip-lat-pull-down`. La ingesta los debe **detectar y reportar**,
  no fallar en silencio.

→ **Cobertura final: 86 de 273 (32 %).** Los huecos se concentran en abdominales, glúteos, cuerpo
completo, kettlebell, TRX y todo lo colgado de barra.

**Peso:** 7,7 MB en PNG original para los 86 (~40 KB por cuadro); a WebP se espera 2-3 MB.

**Revisión a fijar:** `6f3ce86eb79b17e7bbaf588b7960149725bc8fc7` (último commit del repo, de
**febrero de 2022** — la fuente está quieta, lo que juega a favor de la estabilidad).

## Testing

Convenciones del repo: TDD, y **verificación por mutación de cada test nuevo** (romper el código a
propósito y confirmar que el test se queja) antes de darlo por bueno.

**shared** (`bun test`):
- `exerciseMediaFor`: hit, miss, id inexistente, id heredado del prototipo (`toString`) — el mismo
  guard de own-property que ya tiene `exerciseNameEs`.
- Mapeo de nombres Garmin → Everkinetic del script de ingesta: es la lógica riesgosa.
- Pieza 0: test de regresión que fija que `seated_cable_row` está en el catálogo y que los
  ejercicios preexistentes **no cambiaron de id** (un id que cambia rompe los programas guardados).

**mobile** (`npm test -- --runInBand`):
- El detalle renderiza cues y animación; un ejercicio sin media no rompe.
- La card del programa navega con el `catalogId` correcto.
- **No-interferencia:** abrir el detalle durante una sesión no altera `setStartRef` ni `restUntil`.

## Riesgos

- **Ids del catálogo al regenerar.** Si un id cambia, los programas ya guardados quedan
  apuntando a ejercicios inexistentes. Mitigado con el test de regresión de ids.
- **Peso del bundle.** ~18 MB en PNG. Mitigado con WebP; medir el tamaño real del OTA antes de
  publicar.
- **Calidad de 2 cuadros.** Aceptada explícitamente; reevaluar con uso real.
- **ShareAlike.** Se usan imágenes sin modificar y se acredita. No aplicar DRM a los assets.

## Fuera de alcance (YAGNI)

Historial del ejercicio en el detalle, favoritos, video real, descarga de assets on-demand desde la
Pi, y edición de cues por el usuario.
