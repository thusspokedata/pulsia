# Pulsia — Onboarding / Handoff

> Documento de contexto para retomar el proyecto en una sesión nueva. Última actualización: **2026-07-22** (sesión **EL CARDIO ENTRA A PROGRESO**: "Días entrenados" y "Tiempo por día" ignoraban las caminatas y los `.FIT` —la misma actividad existía en el Historial y no en Progreso—; ahora el color mide **gasto calórico** (fuerza + cardio) con escala por cuartiles del historial. De yapa se corrigió un **doble conteo del BMR**: las kcal del reloj son brutas y se contaban contra una meta que ya incluye el basal. [#181](https://github.com/thusspokedata/pulsia/pull/181), mergeado + backend deployado + **OTA a vc10 publicado** (runtime `784872cb` verificado). Detalle en **§0-CARDIO-PROGRESO**, incluidos **seis defectos del plan que ninguna lectura encontró** y una **verificación empírica que no servía**.)
>
> Actualización previa: **2026-07-22** (sesión **BARRAS EN DOS COLORES + EL EJERCICIO SUBE LA META DE CARBOS**: pasarte de un macro ya no borra cuánto llevabas —la barra se parte en la línea de la meta, turquesa hasta ahí y ámbar el excedente—, y las kcal quemadas entrenando ahora suben la meta de **carbos**, no solo el restante de kcal. El principio que ordena todo: **las metas de energía escalan con el gasto, los límites de salud no** — el colesterol sigue en 300 mg entrenes o no. [#179](https://github.com/thusspokedata/pulsia/pull/179), mergeado + backend deployado + **OTA a vc10 publicado** (runtime `784872cb` verificado). Detalle en **§0-BARRAS**, incluidos **tres bugs que ninguna lectura del diff encontró** y un **test falso que vino del propio plan**.)
>
> Actualización previa: **2026-07-21** (sesión **SEMÁFORO NUTRICIONAL**: el catálogo de alimentos ahora dice de un vistazo qué alimento es alto en grasa, saturadas, azúcar, sal o colesterol, y cuál es buena fuente de fibra — con umbrales de la **FSA** británica y la **FDA**, más un filtro "mostrame los altos en colesterol". [#176](https://github.com/thusspokedata/pulsia/pull/176), mergeado + **OTA a vc10 publicado** (runtime `784872cb` verificado). Detalle en **§0-SEMAFORO**, incluida la tanda de **3 bugs que pasaban CI y fallaban en el teléfono** y los **6 errores del plan** que encontró el proceso.)
>
> Actualización previa (mismo día): sesión **TRILOGÍA DEL `.FIT`**: cerraron las fases **2 (visualización)** y **3 (reprocesamiento)** de la captura total — [#167](https://github.com/thusspokedata/pulsia/pull/167) y [#173](https://github.com/thusspokedata/pulsia/pull/173) —, más el fix [#172](https://github.com/thusspokedata/pulsia/pull/172) de un bug **que ningún test veía**: `buildFitActivity` descartaba en silencio los 15 campos del parser. Todo LIVE y **verificado por el usuario en prod**. Detalle en **§0-ULTIMO**. ⚠️ Lección transversal: **unidades en verde ≠ sistema sano** — el cliente que arma el payload también se testea ([[testear-la-costura]]).) 
>
> Actualización previa: **2026-07-20** (sesión **DEMOSTRACIONES ANIMADAS**: la feature está **COMPLETA y en prod** — tocás un ejercicio y ves cómo se hace, con animación y cues de técnica en español, desde cuatro lugares de la app. **86 de 273 ejercicios** cubiertos. Cuatro PRs (#166, #168, #169, #170), cada uno con review, merge y OTA; fingerprint `784872cb` verificado en los cuatro. Detalle en **§0-AHORA**, incluida la lección de los **tres tests falsos** que salieron de mis propios planes.) Antes, mismo ciclo: el catálogo pasó de 230 a 273 ejercicios (**§0-ANTES-HOY**), y hay 8 PRs de otras sesiones en **§0-INTERMEDIAS**.
>
> Actualización previa: **2026-07-17** (sesión **CARDIO fase 1 + fix tiempo de trabajo + research Garmin**: arrancó el **DOMINIO cardio/actividades** — hoy la app NO registraba caminata/running/elíptica, solo fuerza. Fase 1 (modelo + backend) mergeada en [#141](https://github.com/thusspokedata/pulsia/pull/141): tabla `cardio_activity` (migración **0017**), MET por tipo, gasto `dayExerciseBurn`, CRUD bajo auth — **nadie lo consume aún** (móvil/import/balance son fases 2-4). Además fix del bug **Trabajo 0:14** ([#140](https://github.com/thusspokedata/pulsia/pull/140), regresión del #101) entregado por **OTA a vc10**. Detalle en §0-HOY). Sesión previa (mismo día): DOMINIO 2 — NUTRICIÓN COMPLETO — §0-HOY-PREVIA. Todo en `main`, backend deployado, **APK vc10** activado, todo lo nuevo por **OTA a vc10**. **Fingerprint vc10 = `784872cb…`** confirmado de nuevo en el OTA de esta sesión (ver [[ota-fingerprint-gotcha]]). **#140 y #141 mergeados**; queda **#116** (bump Dependabot, sin tocar). **Prod sano.** **Update (misma fecha): [#147](https://github.com/thusspokedata/pulsia/pull/147) (pausa MID-SERIE) y [#145](https://github.com/thusspokedata/pulsia/pull/145) (tiempo al REANUDAR / resume-remount) — ambos mergeados; también aterrizó [#149](https://github.com/thusspokedata/pulsia/pull/149) (cardio fase 2 móvil). **OTA a vc10 publicado** (runtime android `784872cb` confirmado en la salida del `eas update`) → los tres cambios ya están en los teléfonos. Ver §0-HOY-2, §0-HOY-3, [[session-pause-attribution-status]] y [[resume-remount-status]].**

## 0. Estado en una línea

**Pulsia está EN INTERNET, multi-usuario, con login.** Backend en **`https://pulsia.lahuelladelcaminante.de`** (VPS nginx → Wireguard → Pi:3011, HTTPS por certbot, rate-limit en `/auth/`). La app (Android, **APK vc10**; todo lo nuevo llega por **OTA** a vc10) tiene 3 dominios grandes: **(1) Entrenamiento** — genera programas async, registra/resume/revisa sesiones, HR por banda BLE, resumen con mapa corporal + FC, español+inglés, memoria del atleta, entreno puntual, **cardio/actividades** (manual o import `.FIT`, ya entra al balance de nutrición, con **pantalla de detalle** —tiles, gráficos de FC/cadencia/respiración/Body Battery y tiempo en zonas— y **reprocesamiento** del `.FIT` guardado), y un **catálogo de 273 ejercicios** (auto-generado del SDK de Garmin) con **demostraciones animadas + cues de técnica** en 86 de ellos, accesibles desde el Programa, la sesión, un buscador y el selector de alternativas; **(2) Nutrición** (tab "Nutrición", **COMPLETO** — ver §0-HOY-PREVIA): alta de alimentos por **foto + IA** (Opus visión) **o escribiendo el nombre** ("almendra") → catálogo personal (con chip **etiqueta/estimado** y **semáforo nutricional** por alimento: chips de alto/medio en grasa, saturadas, azúcar, sal y colesterol, fibra como positivo, con filtro "mostrame los altos en X" — ver §0-SEMAFORO) → registrar en gramos/ml/unidad con snapshot de macros/micros/colesterol/agua, **metas calóricas + de macros** desde el perfil (BMR Mifflin-St Jeor + objetivo + gasto de entrenamiento = **net calories**; el gasto además **sube la meta de carbos**, nunca la de proteína/grasa ni ningún límite de salud — ver §0-BARRAS), **barras que al pasarte muestran turquesa hasta la meta y ámbar solo el excedente**, **dashboard del día con 4 pestañas** (Resumen / Calorías con torta por comida / Nutrientes vs referencias OMS / Macros con dona), **qué alimentos aportan cada nutriente** + **su evolución en el tiempo**, **suplementos** (catálogo por foto + plan IA semanal + checklist + ajuste dinámico), tracker de líquido, y un **agente de informes** (diario/semanal/quincenal/mensual con consejos, opt-in); **(3) Progreso/Salud** — seguimiento cuantitativo (composición/presión/actividad/bienestar con backfill) + tendencias + heatmap, y **ECG (KardiaMobile)** (interpretación IA no-diagnóstica). **La IA observa** (progreso, ECG, y ahora los informes de nutrición → memoria del atleta). Owner: la cuenta principal. La familia baja el APK **vc10** desde **`pulsia.lahuelladelcaminante.de/download`** (QR) + se registra con el **`INVITE_CODE`** (valor real solo en `/home/kilo/pulsia/deploy/app.env` de la Pi). Un merge a `main` **auto-deploya el backend a la Pi**.

## 0-CARDIO-PROGRESO. ✅ HECHO (2026-07-22): EL CARDIO ENTRA A PROGRESO + kcal del reloj NETAS

Disparador del usuario: *"creo q la app en la parte de 'días entrenados' y 'tiempo por día (últimas
4 semanas)' no está contemplando el tiempo entrenado q es subido a través de los archivos .fit"*.

Tenía razón, y el hueco era más ancho. **LIVE**: [#181](https://github.com/thusspokedata/pulsia/pull/181)
mergeado (`13d9c93`), backend deployado (`/health` OK), **OTA a vc10 publicado** con runtime android
`784872cb…` verificado. Spec y plan en `docs/superpowers/{specs,plans}/2026-07-22-gasto-por-dia-progreso*`.

### El bug: la app se contradecía a sí misma

Las dos secciones se alimentaban **solo** de `getSessions` (tabla `workout_session`, 100% fuerza).
El cardio vive en `cardio_activity` y se trae con `listCardio`, que esa pantalla nunca llamaba. Pero
el **Historial sí unía las dos fuentes** (`buildTimeline`), así que la misma caminata aparecía en una
pantalla y no existía en la otra. Residuo histórico: el heatmap es del 2026-07-10 (#93) y el dominio
cardio llegó una semana después.

### 🧭 Por qué el color pasó de minutos a kcal

Sumar cardio a la escala de minutos rompe el significado: `levelFor` pintaba el máximo a los **90
min**, así que una caminata tranquila de 2 h se vería **más intensa** que una sesión de pesas de 50
min. Decisión del owner: el color mide **gasto calórico**, justificada en que entrena siempre con
banda o transmitiendo FC desde el Garmin.

Los niveles salen de **cuartiles de TODO el historial**, con fallback fijo (200/400/600) bajo 20
días registrados. **Nunca por año mostrado**: con cuartiles por año el mismo día cambia de color al
cambiar de año en el selector y dos años dejan de ser comparables — que es para lo que existe un
heatmap anual.

### ⚠️ El doble conteo del BMR (cambia los números de Nutrición)

`estimateSessionBurn` restaba el BMR (**neto**) pero `estimateCardioBurn` devolvía las kcal del reloj
**verbatim** (**bruto**). La meta diaria ya incluye el BMR de las 24 h, así que el basal de la
actividad se contaba **dos veces** — y desde #179 eso además subía la meta de carbos.

**Confirmado que Garmin reporta bruto:** define `Total Calories = Active + Resting`, y las calorías
de una actividad incluyen el basal del intervalo. Cronometer, que importa de Garmin, lo resta
explícitamente (*"imports active calories only. Which are activity − BMR"*; en su ejemplo, Garmin 638
→ Cronometer 517). Ahora `estimateCardioBurn` resta `bmr/1440 × minutos` con clamp a 0.

**Aproximación aceptada:** Garmin usa **RMR**, no BMR, y el RMR es algo mayor → restar Mifflin-St
Jeor sub-resta levemente. Corregirlo exigiría inventar una constante para un sesgo de segundo orden.

### ⚠️ La verificación empírica que yo mismo diseñé NO servía

El spec proponía validar "¿el reloj manda bruto?" comparando las kcal contra Keytel/MET. **Da
resultados contradictorios**: contra Keytel el reloj queda siempre por debajo (parece neto), contra
MET queda muy por encima en elíptica (parece bruto). Las dos referencias son demasiado ruidosas —
Keytel sobreestima a FC alta y `MET_BY_CARDIO.elliptical = 5.0` es bajo para FC 150+.

**Lección:** no se valida una hipótesis contra una fórmula que no es lo bastante confiable para ser
referencia. Lo resolvió la documentación del proveedor y el comportamiento de terceros que importan
sus datos, no la aritmética sobre datos propios.

### Qué NO tocar

- **`buildDailyBurn` usa los mismos primitivos que `dayExerciseBurn`**, con un **test de invariante**
  que exige que el total por día coincida exactamente. Es lo que impide que Progreso y Nutrición
  muestren cifras distintas del mismo día. Si alguien "optimiza" una de las dos, ese test se pone rojo.
- **Sin peso/edad en el perfil el gasto es 0**, así que la grilla saldría **vacía** para quien no
  completó el perfil (regresión: antes andaba solo con la duración). Por eso hay un mensaje explícito
  con acceso al perfil, **con test**. La familia en Argentina es el caso real.
- **`availableYears` recibe sesiones Y actividades.** Sin eso, quien solo hace cardio no tiene años
  en el selector y su historial es inalcanzable.
- **El heatmap NO distingue tipo por color.** Se evaluó y se descartó: 3 familias × 4 niveles = 12
  tonos en celdas de ~10 px. El desglose fuerza/cardio aparece **al tocar**, debajo de la grilla.

### ⚠️ Lección: SEIS defectos en mi plan, los seis encontrados EJECUTANDO

Ninguno se veía leyendo el diff. Cuatro eran **tests que pasaban con la feature rota** —el patrón ya
crónico de este repo (§0-BARRAS, §0-SEMAFORO, §0-AHORA)— pero dos eran peores:

1. **Off-by-one en el cuartil** (`Math.floor` en vez de nearest-rank): repartía los niveles desparejo.
2. **Test de umbrales falso**: con un solo día por año caía en el fallback fijo, o sea los mismos
   umbrales del input. El implementador lo **demostró empíricamente** inyectando la mutación.
3. **Test de ventana que no mordía**: aserción `kcal === 900` bajo una mutación que devolvía 999.
4. **`toHaveTextContent` con string exige match exacto** en este repo, no substring.
5. **`availableYears` sin cardio en el call-site** — **bug funcional real**, no un test flojo.
6. **Tres tests de `progreso.tsx` vacíos por accidente** (mockeaban `getSessions` a `[]`, así que la
   celda no existía igual con la feature rota).

**Lo nuevo respecto de sesiones anteriores:** el #5 muestra que el plan no solo genera tests falsos
sino **agujeros de comportamiento**, y que los implementadores los encuentran únicamente si se les
pide explícitamente verificar en vez de copiar. Los prompts de esta sesión les decían el número de
defectos ya encontrados; a partir del tercero, todos empezaron a agregar mutaciones propias.

### Pendiente

1. **Pieza C — que la IA vea el cardio.** `buildProgressSummary` (`backend/src/ai/progress.ts`)
   **sigue sin mirar `cardio_activity`**: la IA no sabe que el usuario corrió al generar programas ni
   al refrescar la memoria del atleta. Toca el prompt de generación → **spec propio**, no hecho.
2. **Verificar en el teléfono** la escala relativa con un año que mezcle fuerza y cardio, y el área
   táctil de las celdas (~10 px con `hitSlop`, nunca medida en device).
3. **`MET_BY_CARDIO.elliptical = 5.0` subestima** la elíptica a FC alta. Solo afecta el fallback sin
   FC. Detectado de paso.

## 0-BARRAS. ✅ HECHO (2026-07-22): BARRAS EN DOS COLORES + EL EJERCICIO SUBE LA META DE CARBOS

Disparador: el usuario mandó una captura de la card de Nutrición y pidió dos cosas. Que al pasarse
de un macro se siga viendo el turquesa hasta la meta y solo el excedente en ámbar. Y preguntó algo
más de fondo: *"si hago ejercicio, ¿no debería agregarse esas calorías como necesidad? ¿de qué tipo?
¿grasas, carbos, proteínas? ¿qué pasa con el colesterol cuando se hace ejercicio?"*.

**Estado:** [#179](https://github.com/thusspokedata/pulsia/pull/179) mergeado, backend deployado
(`/health` OK) y **OTA a vc10 publicado** (runtime android `784872cb` verificado en la salida del
`eas update`). Spec en `docs/superpowers/specs/2026-07-21-macros-ejercicio-barras-design.md`,
plan en `docs/superpowers/plans/2026-07-21-macros-ejercicio-barras.md`.

### El problema real: había DOS presupuestos en la misma tarjeta

El gasto de ejercicio entraba **solo** al restante de kcal; las metas de macros salían de
`computeNutritionGoal` y **no veían el ejercicio en absoluto**. Con 1667 kcal quemadas, la card decía
"te quedan 1692 kcal" arriba y pintaba los macros en ámbar abajo. No era un bug puntual: era una
contradicción **por construcción**.

### 🧭 El principio rector (esto es lo que hay que recordar)

> **Las metas de energía escalan con el gasto. Los límites de salud no.**

| | ¿Escala? | Por qué |
|---|---|---|
| Carbohidratos | **Sí** | El glucógeno es el combustible del entrenamiento. El bonus va **entero** acá. |
| Proteína | No | Se fija **por peso corporal** (2.0 g/kg en déficit), no por gasto. Quemar 1667 kcal no duplica la necesidad proteica. |
| Grasa | No | Tiene piso por función hormonal, pero el ejercicio no la "pide". |
| **Colesterol, saturadas, sal, azúcares** | **No** | Son **límites de salud**, no presupuestos. El ejercicio mejora el perfil lipídico en sangre, pero eso no habilita a comer más colesterol. |

**Decisión del owner:** el bonus va entero a carbos, no repartido proporcional. Repartir habría hecho
que la card "cierre" (nada en ámbar) a costa de afirmar que hacen falta 236 g de proteína, que es falso.

### ⚠️ La trampa: `exerciseAdjustedTargets` NO puede mutar el `goal`

La implementación obvia —inflar `goal.kcal` y devolver el mismo tipo— **rompe el colesterol**.
`saturatedFatRefG(goalKcal)` deriva el techo de saturadas como el 10% de esa cifra, así que inflarla
subiría un límite de salud por haber salido a correr. Por eso la función devuelve una estructura
aparte y **`GoalView.kcal.meta` sigue siendo la meta BASE** (es la que consume `NutrientesTab`).
Hay un test de invariante, un test estructural sobre las claves que devuelve, y un test de no-mutación.
**Si algún día alguien "unifica" esto por consistencia, esos tres son los que se ponen en rojo.**

### Cómo quedó en pantalla

```text
2087 / 2112 kcal          +1667 por ejercicio
Carb 198 / 254 g +417 ejercicio · faltan 473
Gras 119 / 63 g · 56 de más        ← turquesa 53% + naranja 47%
Colesterol 254 / 300 mg            ← sin cambios, entrene o no
```

Base + bonus etiquetado, nunca un `671 g` pelado: sin explicación parece un error y esconde la meta
real de un día de descanso. El sufijo aparece **solo** si hubo ejercicio.

### Qué NO tocar

- **`Bar` recibe `{ value, target, kind, height }`, no `{ pct, over }`.** Antes cada call-site
  calculaba los dos por separado, que es la forma que permite que el color y el texto se contradigan.
  Ahora el estado inconsistente no es representable. **No vuelvas a pasarle porcentajes ya calculados.**
- **`kind="floor"` existe por la fibra.** Es un piso: pasarse de 30 g es bueno y nunca se avisa. Una
  barra que solo mire `value` y `target` no puede saberlo.
- **Los dos segmentos tienen clamps simétricos** (`[1, 99]`): sin ellos, un excedente de 0.4%
  redondea el ámbar a 0% y uno de 200× redondea el turquesa a 0%. En ambos casos la barra vuelve a
  ser de un solo color y se pierde justo lo que el rediseño vino a mostrar.

### ⚠️ Lección: tres bugs que ninguna lectura del diff encontró

La suite estaba verde y el diff se leía bien. Los tres salieron de **ejecutar hipótesis contra el
código**, no de mirarlo:

1. **El restante de kcal no saneaba el gasto.** Con `exercise` negativo —alcanzable, porque
   `estimateCardioBurn` pasa las kcal del `.FIT` verbatim— **le restaba meta al usuario**. Los macros
   sí se protegían; las kcal no, porque el guard vivía en un solo lado de un cálculo duplicado.
2. **Tres aserciones de `detalle.test.tsx` no podían fallar con nada.** El `testID` que miraban pasó
   a ser siempre el segmento turquesa. La peor tapaba el borde "tocar el límite no es pasarse": se
   comprobó poniendo sal **20× por encima** del límite y el test siguió verde.
3. **Un excedente sub-0.5% desaparecía de la barra** mientras el texto avisaba en ámbar (colesterol
   301/300) — exactamente la contradicción color/texto que el PR venía a eliminar.

### ⚠️ Lección: el test falso vino del PLAN, no de la implementación

Escribí en el plan una aserción **tautológica** (`saturatedFatRefG(okGoal.kcal)` comparado consigo
mismo) que pasaba con la feature borrada entera. El implementador la escribió tal cual, porque hizo
lo que se le pidió. La destapó la **verificación por mutación**, no la review.

**El plan como origen ya es un patrón establecido, no una novedad**: §0-AHORA se titula "tres tests
falsos, todos salidos de MIS planes" y §0-ULTIMO dice "la causa raíz fue del plan, no del
implementador". Lo que agrega este caso es el mecanismo más directo de todos — no un requisito
omitido ni un test que no discrimina, sino **una aserción literal escrita en el plan y copiada
verbatim**, que un implementador cuidadoso no tiene por qué cuestionar.

**Un plan detallado da confianza de que los tests prueban lo que dicen, y esa confianza no está
justificada.** El código del plan se verifica por mutación igual que el que sale de la implementación.

### Pendiente del owner

1. **Verlo en el teléfono un día de entrenamiento fuerte.** La fila `Carb 198 / 254 g +417 ejercicio`
   es la más larga de la card y en 320 px esta app ya tuvo texto cortándose.
2. **Decidir si acreditar el 100% del gasto es correcto.** Hoy se acredita entero, y con 1667 kcal la
   meta de carbos casi se triplica. Todo el diseño descansa en que ese número sea confiable: si viene
   de un `.FIT` con kcal del reloj, bien; si es un estimado MET/Keytel, un error del 30% mueve la meta
   ~125 g. Achicarlo a una fracción es **una línea** de `exerciseAdjustedTargets`.

## 0-SEMAFORO. ✅ HECHO (2026-07-21): SEMÁFORO NUTRICIONAL EN EL CATÁLOGO

Disparador del usuario: *"el catálogo debería mostrar cuáles alimentos tienen mucho colesterol, o muchas grasas o mucha azúcar, pero de una manera más gráfica — la persona al pensar qué va a comer, por ejemplo pasas de uva, ya sabe que tienen mucha azúcar"*.

**LIVE**: [#176](https://github.com/thusspokedata/pulsia/pull/176) mergeado (`caf07967`), deploy verde, **OTA a vc10 publicado** con runtime android `784872cb…` verificado en la salida del `eas update`. Spec y plan en `docs/superpowers/{specs,plans}/2026-07-21-semaforo-nutricional*`.

Chips en la fila del alimento (`azúcar alto`, `buena fibra`, `sin datos de azúcar y sal`) en **tres pantallas**: catálogo, buscador de nueva comida y detalle del alimento. Más un **filtro por nutriente** en el catálogo.

### La decisión que define la feature: por 100 g, no por porción

Las referencias de `references.ts` son **diarias** (50 g de azúcar, 300 mg de colesterol). Compararlas contra el valor por 100 g pinta casi todo de rojo: las pasas tienen 59 g de azúcar por 100 g = 118% de la referencia diaria, pero nadie come 100 g de pasas de una sentada.

Los umbrales son **por 100 g / 100 ml** — densidad intrínseca, que es lo que uno quiere saber al elegir. **Limitación aceptada:** por densidad las pasas (59 g/100 g) quedan peor que la Coca-Cola (10,6 g/100 ml), aunque un vaso de 330 ml aporte más azúcar que un puñado de pasas. El semáforo responde "¿qué tan concentrado está?"; el "¿cuánto me suma hoy?" ya lo responde el dashboard del día. **Un color por porción es un v2 posible y necesitaría un campo de porción típica que hoy no existe.**

### Dos esquemas oficiales mezclados, y por qué

- **FSA (Reino Unido)** para grasa, saturadas, azúcares y sal, con escala aparte para bebidas → el campo `basis` dejó de ser cosmético y ahora decide el color.
- **FDA (%DV)** para colesterol (≤20 bajo, ≥60 alto) y fibra (≥5,6 g buena fuente), porque **el FSA no cubre el colesterol**, que es el dato prioritario del usuario.

**No usan los mismos operadores**: FSA define "alto" como `>` (22,5 g de azúcar es medio), FDA como `>=` (60 mg ya es alto), y la fibra usa `<` para el bajo. Por eso cada umbral lleva `lowInclusive`/`highInclusive` explícitos en vez de depender de recordarlo en cada comparación.

### Qué NO tocar

- **`nutrientLevel()` mide, `nutrientSentiment()` juzga.** El segundo es el único lugar que sabe que la fibra es piso y los otros cinco son techos, espejando `NUTRIENT_REFERENCE_KIND`. Sin esa separación, "fibra alta" sería un caso especial dentro del componente de UI.
- **`null` da `unknown`, jamás `low`.** Los cinco micros son nullable. Un alimento sin dato de azúcar no puede verse igual que uno con azúcar bajo. La misma regla vale en el filtro: los sin-dato van a un grupo aparte, nunca desaparecen — si desaparecieran, el filtro afirmaría "no es alto en colesterol" sin tener con qué saberlo.
- **El nivel va ESCRITO en el chip, no solo en el color.** Y las frases están escritas enteras, no compuestas: el español concuerda en género y componer daría "grasa alto".
- El rojo reusa `colors.danger`, que en `tokens.ts` significa "error". Que un alimento tenga azúcar no es un error; se reusó igual para no tocar la identidad visual. **Si algún día se agrega un rojo propio menos agresivo, es una línea en `CHIP_STYLE`.**

### ⚠️ Tres bugs que pasaban CI y fallaban en el teléfono

Los encontró una revisión que **ejecutó** la cadena real. `@claude review` los leyó estáticamente y no los vio (su sandbox no le dio permisos de Bash), así que aprobó un PR con los tres adentro.

1. **`num("")` es `0`, no `NaN`.** El panel afirmaba "grasa 0 g · ok" en un formulario vacío — la falsedad exacta que el spec quería evitar, colándose porque `fat_g` es el único macro no-nullable. Arreglado gateando por `foodId` (el spec ya decía "modo edición").
2. **`NaN` se renderizaba como "NaN mg"** mientras se tipeaba. `"-"`, `"."`, `"1e"` son alcanzables con teclado numérico, y `typeof NaN === "number"` pasaba el filtro. Arreglado en las dos capas.
3. **Un test falso más**: "el filtro se combina con el buscador" no ejercía el AND, porque el texto `"queso"` ya eliminaba al otro alimento por sí solo. **Con el filtro desactivado por completo seguía en verde.**

### ⚠️ Lección: seis errores en un plan detallado, cuatro de ellos en los tests

El plan traía código completo paso por paso y aun así tenía seis errores, que fueron encontrando los implementadores al ejecutarlo:

1. Un test afirmaba que 10 g de azúcar por 100 ml es `"low"` cuando es `"medium"` — y el comentario del mismo test decía "alto".
2. `render()` de RNTL devuelve Promise en este repo; sin `await`, `getByText` queda `undefined`.
3. `queryByText(/azúcar/)` se contradecía con la línea siguiente, porque `"sin datos de azúcar y sal"` matchea el regex sin anclar. **Test falso.**
4. `FSA_DRINK.saturated_fat_g` sin ninguna cobertura: se podía tipear mal un umbral de salud y los 91 tests seguían verdes.
5. Un paso pedía implementar antes de escribir el test, invirtiendo TDD.
6. `fireEvent` también necesita `await`; sin él los tests fallaban de forma engañosa (parecía que el filtro no andaba).

Refuerza [[testear-la-costura]] y la lección de las animaciones: **un plan detallado da confianza pero no garantiza que los tests prueben lo que dicen.** Lo que los sacó a la luz fue, en todos los casos, la verificación por mutación y ejecutar el código de verdad.

### ⚠️ Dónde NO están los chips, y por qué NO es un bug

En **`nueva-comida.tsx` los chips aparecen solo en los resultados del buscador**, mientras tipeás. Apenas agregás el alimento, la tarjeta del ítem (con la cantidad y las kcal) y la tarjeta de **Total** no los muestran. Si mirás esa pantalla con una comida ya armada, parece que faltan. **Está así a propósito, revisado con el owner el 2026-07-21.**

La tarjeta del **ítem** sí podría llevarlos sin problema conceptual: sigue siendo el mismo alimento y la densidad por 100 g aplica igual. Es trabajo chico si alguna vez se decide hacerlo.

El **Total NO puede llevar los mismos chips**, y esta es la parte que importa entender antes de "arreglarlo":

> `azúc 12.2g` en el total **no es una densidad por 100 g**: es la cantidad real que la persona se va a comer. Los umbrales del FSA miden concentración ("¿qué tan cargado está este alimento?"), y aplicarlos a un total contestaría una pregunta que nadie hizo. Diría "azúcar medio" sobre un número que no es comparable con esos umbrales, y el mismo color significaría dos cosas distintas en dos tarjetas de la misma pantalla.

La comparación que **sí** significa algo para un total es contra las **referencias diarias** que ya existen en `NUTRIENT_REFERENCES` (50 g de azúcar, 300 mg de colesterol, sal <5 g, fibra ≥30 g): *"azúcar 12,2 g · 24% del día"*. Se evaluó, el owner decidió **no hacerlo por ahora** y dejar la pantalla como está.

Si algún día se hace, **el patrón ya existe y no hay que inventarlo**: `mobile/src/nutrition/tabs/NutrientesTab.tsx` compara `dayTotals` contra `NUTRIENT_REFERENCES` nutriente por nutriente. Sería reusar eso a escala de comida, no escribir algo nuevo.

**Regla general que se desprende:** el semáforo responde *"¿qué tan concentrado está?"* y vive en el **alimento**. El *"¿cuánto me suma hoy?"* vive en el **dashboard del día** y se mide contra referencias diarias. No mezclar los dos vocabularios en la misma tarjeta.

### Pendiente del owner

1. **Decidir si el orden del filtro está bien.** Hoy ordena por valor crudo de mayor a menor, que mezcla `per_100g` con `per_100ml` en una misma lista. Es coherente y es lo que el spec promete, pero ordenar por severidad relativa al umbral sería otra opción. **Es una decisión de producto, por eso no la tomé.**
2. **Ver en el teléfono si los chips saturan la fila.** Están capados en 3 + `+N`, pero el queso crema dispara cuatro y nunca se midió en device.
3. **El detalle muestra "según FSA/FDA" genérico** en vez de los umbrales numéricos concretos de cada nutriente.

## 0-ULTIMO. ✅ HECHO (2026-07-20/21): TRILOGÍA DEL `.FIT` COMPLETA — visualización + reprocesamiento

Cierre de la captura total del `.FIT` que arrancó en [#160](https://github.com/thusspokedata/pulsia/pull/160). **Las 3 fases están LIVE y verificadas por el usuario en prod.** Ver [[fit-captura-total-status]].

- **Fase 2 — visualización** ([#167](https://github.com/thusspokedata/pulsia/pull/167)): pantalla `mobile/app/actividad.tsx` de **solo lectura**. Antes, tocar una actividad en el historial abría el **formulario de edición** y todo lo capturado en la fase 1 era invisible. Ahora: tiles, 4 gráficos (FC, cadencia, respiración, Body Battery), tiempo en zonas Z1–Z5 y detalles técnicos; el botón "Editar" lleva al formulario de siempre. **Cero backend nuevo** — `getCardioById` ya devolvía todo.
- **Fase 3 — reprocesamiento** ([#173](https://github.com/thusspokedata/pulsia/pull/173)): `reprocessActivity` relee el `.FIT` **crudo ya guardado** y rellena los derivados sin reimportar. Botón en el detalle (si `source==='fit' && hasFitFile && !samples`) + acción masiva en Configuración. Endpoints `POST /cardio/:id/reprocess` y `/cardio/reprocess-all`.

**Tres decisiones de honestidad en la UI** (fase 2): el campo `143` se muestra como **"Body Battery (inferido)"** con nota al pie —Garmin no lo documenta, lo dedujimos del comportamiento—; la respiración **se filtra, no se interpola** (aparece en ~1 de cada 3 muestras, interpolar dibujaría valores que el reloj nunca midió); y el **nombre del atleta NO se muestra** aunque `fitExtras.athlete` lo trae, con test explícito que lo fija.

### ⚠️ El bug que ningún test veía: la costura

[#172](https://github.com/thusspokedata/pulsia/pull/172). El usuario reportó "no veo los 4 gráficos". **`buildFitActivity` (móvil) descartaba en silencio los 15 campos** que el parser extraía: llegaban NULL a la base.

**Todos los tests estaban en verde, y cada pieza funcionaba de verdad**: el parser extraía ✓, el repositorio persistía ✓, la ruta aceptaba ✓. Pero el test de la ruta **armaba la actividad a mano**, ya con los campos puestos. Nadie probaba `preview → buildFitActivity → POST`, que es donde se perdían. **La causa raíz fue del plan, no del implementador:** la tarea de móvil decía "mandá el `fitBase64`" y nunca "propagá los campos parseados".

El fix trae un test **estructural** (recorre `Object.keys(preview)` y falla si alguno no sobrevive), así que un campo futuro sin propagar falla solo. Lección completa en [[testear-la-costura]].

**Y el diagnóstico costó de más por mi culpa:** le dije al usuario dos veces que era esperable ("son actividades viejas") cuando eran de ese mismo día. Lo destapó **consultar `cardio_activity` en prod** y ver `samples`/`fit_extras` en NULL. Regla: ante un "no veo X", mirar los datos de producción **antes** de explicar por qué es normal.

### Lo que atraparon los reviews de `@claude`

Tres bugs reales que mis tests no veían, todos de la misma forma —cada pieza correcta, el problema en cómo se tocan—:

1. **`listCardio` mandaba los jsonb pesados** (`samples`/`fitExtras`) en **cada** fetch del historial sin que nada los consuma. El PR predicaba separar el binario en otra tabla y después los arrastraba igual. Ahora proyecta columnas explícitas; el detalle es el único que trae lo pesado.
2. **Las zonas de FC estaban corridas un escalón** (ver gotcha en §7): se inventaban una Z0 y una Z6, y Z1 mostraba `116–141` en vez de `0–116`.
3. **El reproceso refrescaba `kcal` sin re-derivar `kcalSource`**, dejando un valor medido por el reloj marcado como estimado. Se arregló metiendo `kcalSource` **dentro** del tipo `FitDerived`: al volverlo obligatorio, TypeScript falló en un test que no lo pasaba — el tipo dejó de ser documentación y pasó a ser guardia.

### Decisiones de diseño que conviene no re-litigar

- **`FitDerived` es la frontera del reproceso.** NUNCA toca `type`/`durationMs`/`distanceM`/`avgHr`/`notes` —lo que el formulario puede editar—, así una corrección manual sobrevive a cualquier reproceso futuro. Es la misma costura que sobreescribe `buildFitActivity`.
- **El error del reproceso necesita su PROPIO estado.** Reusar el `error` de carga dispara el early-return que reemplaza toda la pantalla: un reproceso fallido te borraba el detalle que estabas mirando. Con test de regresión.
- **`/reprocess-all` se registra ANTES de `/:id`** o el router lo captura como un id. Con test de esa garantía.

## 0-AHORA. ✅ HECHO (2026-07-20): DEMOSTRACIONES ANIMADAS DE EJERCICIOS — COMPLETO

**Tocás un ejercicio y ves cómo se hace.** Animación de dos cuadros (cross-fade, toque para pausar) más los cues de técnica en español, alcanzable desde **cuatro lugares**: card del Programa, ejercicio activo de la sesión, buscador nuevo del catálogo (`app/ejercicios.tsx`) y selector de alternativas.

**Cuatro PRs, cada uno con review, merge y OTA** (runtime android `784872cb` verificado en los cuatro): [#166](https://github.com/thusspokedata/pulsia/pull/166) capa de datos · [#168](https://github.com/thusspokedata/pulsia/pull/168) pantalla de detalle · [#169](https://github.com/thusspokedata/pulsia/pull/169) los cuatro accesos · [#170](https://github.com/thusspokedata/pulsia/pull/170) créditos. Plan: `docs/superpowers/plans/2026-07-19-animaciones-ejercicios.md`.

**Cobertura: 86 de 273 ejercicios (32%).** El acceso es **condicional**: el afford solo aparece donde hay animación, así que nunca hay un toque que no lleva a nada. La excepción es el buscador, donde la fila navega siempre porque ahí explorar el catálogo es el objetivo. 164 assets WebP, **2,4 MB**.

### Cómo funciona, y qué NO tocar

- **`shared/src/catalog/exerciseMedia.ts` es la COSTURA.** `exerciseMediaFor(id)` / `hasExerciseMedia(id)`. Si algún día se compra un pack pago de animaciones, se reemplaza `exerciseMedia.data.ts` y **ningún consumidor se entera**.
- **`shared/scripts/fetch-exercise-media.ts`** baja de Everkinetic con la revisión **fijada** a `6f3ce86`, **valida licencia e integridad ANTES de escribir un solo archivo**, y convierte a WebP. Si el `LICENSE.md` del upstream deja de decir Attribution-ShareAlike, **aborta**: estamos redistribuyendo contenido ajeno en un repo público.
- **`sharp` es devDependency de `shared`.** Si termina en `dependencies` se re-basa el fingerprint y **el OTA deja de llegarle a nadie**. Verificado en las cuatro entregas.
- **`exerciseAssets.ts` se regenera A MANO** tras la ingesta. Hay un test que exige que todo frame de los datos exista en el mapa: sin él, un olvido daba `<Image source={undefined}>` **en el teléfono** en vez de fallar en CI.
- **Los cues se TRADUCEN, no se generan.** Everkinetic trae el campo `steps` bajo la misma licencia. Es el único contenido de la app que le dice a alguien **cómo mover su cuerpo con peso encima**: una indicación inventada puede lesionar. Están en `exerciseCues.es.ts`, curado a mano y separado del archivo generado.
- **La ruta del detalle es MODAL a propósito.** `presentation: "modal"` mantiene `sesion.tsx` montada abajo en el stack. Esta app pagó dos veces ese error (#145 y #147). **No lo cambies a `push`.**
- **En el selector de alternativas los `Pressable` son HERMANOS, no anidados.** React Native resuelve el toque por negociación de responder, no por bubbling: `stopPropagation()` **no** garantizaría que mirar el dibujo no te cambie el ejercicio.
- **Los créditos de Configuración son obligatorios.** CC-BY-SA exige atribución: sin esa sección no tenemos derecho a usar los assets. Tiene test propio para que un refactor no la borre en silencio.

### ⚠️ Lección: tres tests falsos, todos salidos de MIS planes

La verificación por mutación volvió a pagar, y esta vez contra mi propio trabajo:

1. **El test de "no altera el timing" hacía `set` y `get` sin nada en el medio.** Pasaba con el código roto y habría pasado antes de que la feature existiera.
2. **La mutación del anidamiento no discriminaba.** `fireEvent.press` despacha sobre el elemento que se le pasa y **no simula la negociación de responder de RN**: al anidar los `Pressable` a propósito, los **cinco** tests de comportamiento siguieron en verde. Hizo falta un test **estructural** (recorrer los ancestros del ojo) para cubrirlo.
3. **El buscador no tenía puerta de entrada.** Escribí la tarea sin incluir el punto de navegación: la pantalla existía y era **inalcanzable**, o sea código muerto anunciado como uno de los "cuatro accesos".

Los tres los encontró el review, no yo. Moraleja: un plan detallado da confianza pero **no garantiza que los tests prueben lo que dicen**.

### Pendiente del owner (no lo puede cerrar un agente)

1. **Probar en el teléfono el ojo 👁 del selector de alternativas**: tocarlo debe abrir el detalle y, al volver, el ejercicio de la sesión NO debe haber cambiado. La negociación táctil real solo se ve en device.
2. **Decidir los chips de músculo en inglés** (`chest`, `quads`) del detalle. Acá el inglés **no** tiene la justificación que sí tiene el Programa.
3. **Evaluar si el 32% alcanza.** Los huecos están en abdominales, glúteos y cuerpo completo. Si queda corto, el camino es un pack pago (~200-600 USD, pago único) y la costura está puesta para que el cambio no toque nada más.

## 0-ANTES-HOY. ✅ HECHO (2026-07-18/19): CATÁLOGO ILUSTRADO — ejercicios básicos recuperados + spec de las animaciones

Disparador: el usuario pidió **GIFs que enseñen cómo se hace cada ejercicio** y, de paso, preguntó si faltaba el "low row". Faltaba. Y al tirar de ese hilo apareció un problema bastante más grande.

**Estado:** [#158](https://github.com/thusspokedata/pulsia/pull/158) **mergeado, deployado y con OTA publicado** (runtime android `784872cb` confirmado) y [#162](https://github.com/thusspokedata/pulsia/pull/162) **mergeado** (review de `@claude` y CodeRabbit sin observaciones bloqueantes). **Falta publicar el OTA de #162.** Spec en `docs/superpowers/specs/2026-07-18-gifs-ejercicios-design.md`, plan en `docs/superpowers/plans/2026-07-18-catalogo-staples.md`.

### 🐛 El generador descartaba los ejercicios básicos (#158, catálogo 230 → 253)

`shared/scripts/generate-catalog.ts` elige **8 por categoría** ordenando por (cantidad de palabras ASC, alfabético ASC) y repartiendo round-robin entre buckets de equipamiento. Ese criterio es puramente mecánico y **no tiene noción de qué ejercicio es importante**: en `SQUAT` dejaba entrar "Barbell Stepover" y "Kettlebell Swing Overhead" pero **descartaba el leg press**; en `ROW` el SDK tiene **53 variantes** y sobrevivían 8, sin el remo bajo sentado.

**Solución: `MUST_INCLUDE`** — lista curada, por categoría, de `camelName` del SDK que entran **siempre**, sin competir por el cap (`target = cap + forzados`). Con una **guarda que revienta la generación** si un nombre no existe en el SDK: sin eso, un tipeo no hace nada y nadie se entera.

**Tres bugs que aparecieron al implementarlo, ninguno previsto en el plan:**
- **El auto-ajuste del cap habría borrado 24 ids congelados.** Al superar los 250 el generador bajaba el cap a 7 y se llevaba puesto el 8º de cada categoría. Ahora hay `MIN_CAP = 8` y `MAX_TOTAL = 300` con guarda dura. **La red de seguridad (`catalogIds.frozen.ts`) hizo exactamente su trabajo.**
- **Un fix previo vivía SOLO en el archivo auto-generado.** El commit `3ef1fa4` (dominadas asistidas con banda requieren también `pull_up_bar`) se había aplicado **a mano** sobre `exercises.data.ts` → **cualquier regeneración lo borraba en silencio**. Llevaba meses siendo una bomba de tiempo. Ahora está en el generador. **Lección: si arreglás algo en `exercises.data.ts` a mano, lo perdés.**
- **`inferEquipment` es poco fiable** (ver abajo).

### ⚠️ `inferEquipment` falla de tres maneras distintas — usar `MUST_EQUIPMENT`

Deduce el equipamiento del **nombre** del ejercicio, y se equivoca sistemáticamente. Como `catalogForEquipment()` exige **TODO** el equipamiento listado y alimenta el prompt de la IA, cada error tiene consecuencia real:

| Patrón de fallo | Ejemplo | Consecuencia |
|---|---|---|
| El nombre no menciona el implemento | `leg_press`, `goblet_squat` → `bodyweight` | La IA le receta **prensa de piernas a alguien entrenando en casa sin equipo** |
| Hereda mal el de su categoría | los lat pulldown → `pull_up_bar` | Jalones a quien solo tiene barra fija |
| El nombre engaña a la heurística | `dumbbell_hammer_curl` → `machine` (por *hammer* = Hammer Strength) | El curl martillo **invisible** para quien solo tiene mancuernas |

Aparecieron **9 casos en dos PRs** (4 en #158, 5 en #162). Los dos últimos eran **preexistentes**, no introducidos por estos PRs. El escape es `MUST_EQUIPMENT` en el generador. **Al agregar ejercicios, revisar SIEMPRE el equipamiento del regenerado antes de commitear.**

### 💡 Agregar ejercicios que YA vienen ilustrados (#162, catálogo 253 → 273)

Idea del usuario, y salió muy bien: en vez de preguntar "¿qué ejercicios nuestros tienen dibujo?", preguntar **"¿qué dibujos hay que no estamos usando?"**. Everkinetic ilustra 293 ejercicios y solo 73 tenían equivalente → **~220 sin usar**. Los que además existen en el SDK entran por `MUST_INCLUDE` y **llegan con la ilustración puesta**.

De 66 candidatos por similitud de nombre quedaron **20** tras curarlos a mano. Llenan huecos reales: **no había NINGÚN pushdown de tríceps**, ni fondos en paralelas, ni press inclinado con barra, ni subidas al cajón, ni deltoides posterior.

**Los rechazos importan más que las altas.** El caso a recordar: `legExtensions` parecía el hallazgo del día (la extensión de cuádriceps que dábamos por perdida) pero en la taxonomía de Garmin vive bajo **`crunchExerciseName`: es un ejercicio de abdominales**, un homónimo. Otros: opuestos (`Narrow Stance` matcheaba con `wideStanceBarbellSquat`), categorías que el generador **no procesa** (`sidePlank` está en `suspension` → un `MUST_INCLUDE` ahí sería un **no-op silencioso**), y 9 curls de bíceps cuando ya había 10.

### 📐 Spec de las animaciones: fuente decidida, cobertura medida

- **⚠️ La fuente que proponía el backlog NO se puede usar.** El §8 sugería `free-exercise-db`. Se publica como Unlicense pero el repo del que deriva dice textualmente que las imágenes fueron *"scrapped off the internet"* y desaconseja el uso comercial; el rastro lleva a Bodybuilding.com. Es **licencia lavada**: dominio público estampado sobre fotos de estudio con modelos identificables. Falla por copyright **y** por derecho de imagen.
- **Fuente elegida: Everkinetic** (CC-BY-SA-4.0), **ilustración de línea, no fotos** → sin exposición por derecho de imagen. Son **2 cuadros** (inicio/tensión), animables por cross-fade, no un GIF completo. El mantenedor confirmó el uso comercial con atribución (verificado vía API de GitHub, no por scraping: **el HTML de los issues se come los comentarios**).
- **Cobertura REAL medida, no estimada: 93 de 273 (34%).** Muy despareja: tríceps/gemelos/bíceps/pecho 54-78%, pero **abdominales 8%, glúteos 5%, cuerpo completo 0%**. Familias enteras sin nada: kettlebell, TRX, face pulls, plancha frontal, todo lo colgado de barra, **y el remo con mancuerna**.
- **El mapeo curado está commiteado** en `shared/src/catalog/exerciseMedia.slugs.ts` (93 entradas validadas: 0 ids inexistentes, 0 slugs inexistentes). Se curó **ejercicio por ejercicio a mano**, NO por similitud de nombre — es el trabajo caro de reproducir, por eso vive en el repo.
- **Decisión del usuario:** construir con **acceso condicional** — el afford de "ver cómo se hace" aparece **solo** en los ejercicios que tienen animación, para que nunca haya un toque que no lleva a nada.

**Pendiente: las Piezas 1-4 (la feature en sí) NO tienen plan todavía.** El spec las define (módulo `exerciseMedia.ts` como costura, pantalla de detalle única con modal desde la sesión, 4 accesos, créditos). Arrancan desde 34%.

### Limitaciones conocidas (no son bugs)

- **La extensión de cuádriceps en máquina no existe en el SDK** en ninguna categoría que procesemos: la categoría `LEG_CURL` de Garmin está poblada casi entera de good mornings.
- **`MUST_INCLUDE` es una lista curada a mano**: va a quedar incompleta y se le suman ejercicios a medida que se detecten faltantes. Es la naturaleza del mecanismo.
- `EXOTIC_KEYWORDS` filtra a propósito swiss ball, bosu, medicine ball, sandbag, sled, tire. Es una decisión de producto previa: **respetarla**, no relajar el filtro para colar un ejercicio.

## 0-INTERMEDIAS. Otras sesiones (2026-07-17/18) — registro factual

PRs mergeados por **otras sesiones** entre la actualización anterior y esta. Se listan para que el doc no mienta por omisión; el detalle está en cada PR y en las memorias enlazadas.

- [#151](https://github.com/thusspokedata/pulsia/pull/151) bump `@anthropic-ai/sdk` 0.110 → 0.111 (era el #116 que figuraba pendiente).
- [#152](https://github.com/thusspokedata/pulsia/pull/152) **cardio fase 3**: import `.FIT`. [#154](https://github.com/thusspokedata/pulsia/pull/154) **fase 4**: wiring del gasto de cardio al balance de nutrición → el **dominio cardio quedó COMPLETO** ([[cardio-feature-status]]).
- [#153](https://github.com/thusspokedata/pulsia/pull/153) **el repo adoptó AGPL-3.0** + README.
- [#155](https://github.com/thusspokedata/pulsia/pull/155) import de CSV de **sueño** de Garmin ([[sleep-csv-import-status]]); [#156](https://github.com/thusspokedata/pulsia/pull/156) índice único en `body_metric` para idempotencia; [#157](https://github.com/thusspokedata/pulsia/pull/157) import de **Weight y Steps** + corrección de mediodía local ([[weight-steps-import-status]], [[metric-daily-noon-writes]]).
- [#159](https://github.com/thusspokedata/pulsia/pull/159) se quitó el email del owner de los docs; [#161](https://github.com/thusspokedata/pulsia/pull/161) **se reemplazaron datos de salud reales por sintéticos** ([[nunca-datos-reales-en-el-repo]] — el repo es público).
- [#160](https://github.com/thusspokedata/pulsia/pull/160) **captura total del `.FIT` fase 1** ([[fit-captura-total-status]]).

⚠️ **Estas sesiones corrieron en el MISMO working tree**, y eso mordió de verdad: al mergear #158 el árbol quedó parado en la rama de otra sesión. **El OTA hubo que publicarlo desde un worktree aislado en `main`** para no mandar trabajo ajeno en curso a los teléfonos. Ver [[git-snapshot-stale-concurrent-session]]: **verificar `git branch --show-current` antes de ramificar o publicar**, nunca confiar en el snapshot del arranque.

## 0-HOY. ✅ HECHO (2026-07-17): CARDIO fase 1 + fix Trabajo 0:14 + research Garmin/Coros

Todo mergeado en `main`, backend deployado, fix del móvil por **OTA a vc10** (runtime android `784872cb…` confirmado en la salida del `eas update`). **0 PRs de esta sesión abiertos** (#140 y #141 mergeados); queda #116 (Dependabot). Specs/planes en `docs/superpowers/{specs,plans}/2026-07-17-cardio-*`. Ejecución **subagent-driven en worktrees aislados** (uno por rama, un implementador escribiendo a la vez — ver [[subagent-parallel-writes]]), TDD con **verificación por mutación** de cada test nuevo.

- **🔬 Research Garmin/Coros → import `.FIT` es el camino** ([[garmin-coros-api-research]]). Deep-research verificado contra fuentes primarias: el Garmin Connect Developer Program es **"business only"** (hasta una LLC fue rechazada), Coros selecciona por tamaño de mercado, y los wrappers no oficiales (garth/python-garminconnect) están **bloqueados por 429 server-side desde marzo 2026** (riesgo de bloqueo de la cuenta). **Health Connect NO es viable en GrapheneOS** (el permiso queda "Not allowed"), pero **la app de Garmin Connect SÍ corre en GrapheneOS** → el camino robusto y privado es **importar archivos `.FIT`** (export del reloj → parsear en la Pi, cero terceros). Esto motivó el dominio cardio. Disparador original: el usuario preguntó si el Strava MCP le servía (no, para el producto: los términos de Strava prohíben usar sus datos en IA/ML).

- **#DOMINIO CARDIO — fase 1 (shared + backend), MERGEADA** ([#141](https://github.com/thusspokedata/pulsia/pull/141), migración **0017**). Actividades de cardio (caminata/running/elíptica/bici/natación/remo/otro), que **no existían** — el modelo era 100% fuerza. **Decisión clave: tabla propia `cardio_activity`, NO extender `workout_session`** (esa exige `program_id` FK a `programs`, `week_number`, `day_label` — una caminata no cuelga de un programa). `CARDIO_TYPES`/`CARDIO_LABELS` (`satisfies`, exhaustividad). **Las kcal del reloj mandan** (`kcalSource: device|estimate`, **forzado por el server**, patrón del `/foods/describe`). `estimateCardioBurn`/`dayExerciseBurn` en `shared/src/nutrition/exerciseBurn.ts`. **🐛 Fix de paso:** `MET_STRENGTH = 5` era el único fallback sin FC → sobrestimaba ~40% una caminata (MET 3.5) y subestimaba a la mitad un running (9.8); ahora **MET por tipo** (`MET_BY_CARDIO`), con test de regresión que fija que **fuerza no cambia**. Rutas CRUD bajo `auth` (las **dos** líneas `/cardio` + `/cardio/*`, lección del #79), scoping por `userId`, dedupe por segundo **solo en el import** (`secondWindow`, fuente única), pre-check de colisión de `id` (id ajeno → 409, re-POST propio → 200 idempotente, como `sessions.ts`). **⚠️ Nadie consume el cardio todavía** — es la fundación.
- **🐛 Fix del bug "Trabajo 0:14"** ([#140](https://github.com/thusspokedata/pulsia/pull/140), OTA). El resumen mostraba **Trabajo 0:14 / Descanso 42:52** en una sesión de 43 min con 232 reps. **Causa raíz = regresión del fix #101:** en el camino "serie instantánea" de `onEndSet`, la serie **nacía y moría en el mismo milisegundo** (`setStartRef=Date.now()` seguido de `endSet` con ese mismo `Date.now()`) → `durationMs ≈ 0`; y como `restMs = total − workMs`, el descanso se tragaba todo. **Fix:** "una serie empieza cuando termina el descanso anterior" (`setStartFor(s, ref) = Math.max(ref, lastSetEnd(s))`, usando `restUntil` no `Date.now()`). **+ fix de un solape cross-exercise** (Major de CodeRabbit): cambiar de ejercicio con una serie abierta la hacía abarcar hasta el finish → `workMs > total`; ahora `closeOpenSetBeforeLeaving()` la cierra en el instante del cambio.

**Pendiente del dominio cardio (próximas fases, cada una con su plan):**
- **Fase 2 — móvil, registro manual + historial unificado — HECHO en [#149](https://github.com/thusspokedata/pulsia/pull/149)** (mergeado + en el OTA de esta tanda; pendiente su §0-HOY propio por quien la hizo): pantalla `cardio.tsx` (alta manual: tipo/duración/distancia/FC) + el Historial pasa a línea de tiempo de TODO (fuerza + cardio) con `buildTimeline` puro.
- **Fase 3 — import `.FIT`**: parser en el backend (`@garmin/fitsdk`) + `POST /cardio/parse` (preview, no persiste) + confirmación en el móvil. Reusa `expo-document-picker`/`expo-file-system` (del ECG) → **OTA-safe, sin APK nuevo**.
- **Fase 4 — wiring del balance #2b**: migrar los dos call-sites (`mobile/src/nutrition/useNutritionDay.ts` + `backend/src/reports/collect.ts`) de `sumDayExerciseBurn` a `dayExerciseBurn`, **borrar `sumDayExerciseBurn`**, corregir el texto de la UI del "Ejercicio".

**Follow-ups de sesión en curso (arrancados en sesiones aparte):** dos edge cases de atribución de tiempo que la nueva precisión del fix del 0:14 destapó — **(a) pausa en medio de una serie** cuenta como trabajo en vez de descontarse → **HECHO en [#147](https://github.com/thusspokedata/pulsia/pull/147)** (ver §0-HOY-2); **(b) resume tras remount** de la app no restaura `setStartRef` y subestima el trabajo de la próxima serie (Major de CodeRabbit, diferido con OK del owner) → **HECHO en [#145](https://github.com/thusspokedata/pulsia/pull/145)** (ver §0-HOY-3).

## 0-HOY-2. ✅ HECHO (2026-07-17): fix atribución PAUSA MID-SERIE ([#147](https://github.com/thusspokedata/pulsia/pull/147))

Follow-up (a) del fix del 0:14. **Mergeado a `main` + backend deployado** (deploy `8a1f7cd` OK, migración `0018` auto-aplicada por el CMD del contenedor). **OTA publicado** (entregado junto con #145 en el mismo `eas update`, runtime android `784872cb`). Spec/plan en `docs/superpowers/{specs,plans}/2026-07-17-session-pause-attribution*`. Ejecución **subagent-driven** (9 tasks, un implementador a la vez), TDD + **verificación por mutación** + revisión en dos etapas (spec + calidad) por task, más un review holístico final con Opus. Detalle vivo en [[session-pause-attribution-status]].

- **🐛 El bug:** pausar **en medio de una serie** (no durante el descanso) contaba ese tiempo como **Trabajo**. Como `durationMs = endedAt − startedAt` (reloj de pared) y la pausa no tocaba esos timestamps, el tiempo de pausa quedaba dentro de la serie. `Trabajo + Descanso = Total` seguía cerrando (el descanso se deriva restando), pero mal repartido; en el extremo, Trabajo podía superar al Total. Pausar **durante el descanso** ya estaba bien a nivel sesión.
- **La solución = intervalos de pausa como ÚNICA fuente de verdad.** Se guardan en `PauseState` (el último puede estar abierto, `endedAt: null` → tipo `OpenPauseInterval`), se adjuntan a la `WorkoutSession` en `finishSession`, y de ahí se derivan el total y la corrección por serie. **La corrección es CANÓNICA** (el resultado de `finishSession` es lo que se persiste → llega a la DB, al resumen y al historial), no display-only. `overlapMs(a0,a1,b0,b1)` = helper puro reutilizado en `finishSession` (resta a cada serie el solape con `[startedAt,endedAt]`) y en `summarize` (descuenta el solape del **descanso por-fila** — modelo general de "tiempo muerto"). Ventanas de serie `[s,e]` y de hueco `[e,next]` son **disjuntas** → sin doble-resta. **Efecto de yapa:** `exerciseBurn` (kcal por `durationMs`) ahora usa tiempo activo, más correcto.
- **Persistencia:** campo opcional `pauseIntervals` en el schema shared (siempre cerrado, `endedAt: number`) + **columna `pause_intervals` (jsonb) en `workout_session`** (mapeada igual que `hrSeries`), para que el rest por-fila corregido sobreviva el round-trip y el Historial muestre lo mismo que la pantalla de fin. Migración **`0018_strong_nocturne`** (`ADD COLUMN`, nullable).
- **⚠️ Lección (refuerza la de §0-HOY-PREVIA): la mutación atrapó un test falso en MI PROPIO plan.** El caso "pausa que excede la serie clampea a 0" **no ejercitaba el clamp**: una sola pausa nunca puede solapar más que la duración de su propia serie, así que `durationMs − solape` nunca da negativo. Se reemplazó por **dos intervalos solapados** cuya suma sí excede la serie. Sin la mutación, ese test quedaba verde sin probar nada.
- **⚠️ Gotcha de proceso (ramas concurrentes + drizzle):** al ir a mergear, `main` había avanzado (cardio fase 1 + fix 0:14) y **cardio ya se había quedado con el número de migración `0017` (`0017_cold_chamber`)**, chocando con mi `0017`. El código (`sesion.tsx`, `schema.ts`) auto-mergeó limpio; **el único conflicto fue la metadata de drizzle** (`meta/_journal.json` + `0017_snapshot.json`). Resolución correcta: quedarse con la `0017` de main, **borrar mi `.sql` y regenerar con `bun run db:generate` → renumera a `0018`** (diff contra el snapshot mergeado → solo la columna nueva). No editar el journal a mano.
- **Reviews:** `@claude review` LGTM sin cambios; CodeRabbit solo un nitpick de markdownlint (lenguaje en bloques del spec), resuelto. Post-merge todo verde: mobile **487** + tsc, shared+backend **559**.

## 0-HOY-3. ✅ HECHO (2026-07-17): fix atribución al REANUDAR / resume-remount ([#145](https://github.com/thusspokedata/pulsia/pull/145))

Follow-up (b) del fix del 0:14 — el Major de CodeRabbit que estaba diferido. **Mergeado a `main` + OTA a vc10 publicado** (runtime android `784872cb` confirmado en la salida del `eas update`; el mismo OTA entregó también #147 y #149). Ejecución **subagent-driven** (store y wiring en tasks separadas, un implementador a la vez), TDD + **verificación por mutación** de cada test nuevo, **3 rondas de `@claude review`**. Detalle vivo en [[resume-remount-status]].

- **🐛 El bug:** al **reanudar** una sesión (banner "continuar" tras cerrar/reabrir la app), la rama de resume restauraba pausa/sesión/orden pero **nunca `setStartRef`** (init a `Date.now()` del remontaje). Sobre el modelo de #140 (`setStartRef` persiste entre series; ya no se resetea en cada tap/end), la serie siguiente arrancaba en el instante del remontaje → **subconteo** del trabajo. Claro al reanudar **antes de la 1ª serie** o **durante el descanso**.
- **La solución = rehidratar el timing efímero, análogo a `pauseState`.** Store nuevo `mobile/src/storage/restState.ts` → `{ sessionId, setStart, restUntil, restRemaining }`. Se persiste donde cambian los valores (inicio de sesión, fin de serie, saltar descanso, pausar, reanudar) y se limpia al terminar/cancelar. Al reanudar se restaura: `setStartRef` vuelve al boundary real; si había descanso en curso se re-arma `restUntil` (el tick de #140 fija el fin exacto, incluso si venció con la app cerrada); fallback a `startedAt` para sesiones previas. Como `endSet` no acota `durationMs`, re-armar el descanso también evita duraciones negativas.
- **🐛 Segundo hallazgo de `@claude` (Major, arreglado en el mismo PR):** pausar **durante el descanso** + remount + reanudar daba **sobreconteo** (peor que antes del fix): el remanente del descanso vivía solo en `restRemainingRef` (`useRef` en memoria), se perdía en el remontaje y la serie siguiente caía en el clamp `lastSetEnd` contando descanso + pausa + downtime como trabajo. Fix: persistir `restRemaining` y restaurarlo al reanudar pausada → "Reanudar" re-arma la cuenta regresiva en vez de perderla.
- **⚠️ Colisión con #147 (resuelta en rebase):** #147 aterrizó primero y **refactorizó `pauseState` al modelo de intervalos** (`isPaused`/`startPause`/`endPause`/`totalPausedMs`). #145 se rebasó encima; `resumedPaused` pasó a derivarse de `isPaused(ps.intervals)`. Los dos fixes son **ortogonales** (intervalos de pausa vs. timing de descanso) y componen. Verificado tras el rebase: mobile **522/522** + tsc. **Nota:** `restState` es un store nuevo aparte de `pauseState`; el remanente del descanso congelado (`restRemaining`) vive ahí, no en los intervalos de pausa.

## 0-HOY-PREVIA. ✅ HECHO (2026-07-16/17): DOMINIO 2 — NUTRICIÓN COMPLETO

Todo mergeado en `main`, backend deployado, entregado por **OTA a vc10** (runtime `784872cbc4d3628548bb75567f088dec209dcf87`, **estable** — nada de esto agregó una dep nativa). Specs/planes en `docs/superpowers/{specs,plans}/2026-07-1{5,6,7}-*`.

- **#3 Suplementos — COMPLETO** ([#128](https://github.com/thusspokedata/pulsia/pull/128)/[#130](https://github.com/thusspokedata/pulsia/pull/130)/[#132](https://github.com/thusspokedata/pulsia/pull/132)/[#133](https://github.com/thusspokedata/pulsia/pull/133), migración **0016**). Catálogo por foto (con `info` = qué es y para qué sirve cada componente, persistido) + plan semanal armado por IA + checklist diario (tomado/desvío/salteado) + **ajuste dinámico**: el informe diario mira lo que comiste y puede decir "mañana saltealo". Detalle en [[nutrition-comidas-status]].
- **Pieza C — dashboard estilo MFP** ([#134](https://github.com/thusspokedata/pulsia/pull/134) + [#135](https://github.com/thusspokedata/pulsia/pull/135)). `detalle.tsx` pasa de 5 cards apiladas a **shell con 4 pestañas**: Resumen / Calorías (torta por comida) / Nutrientes (los 5 micros vs **referencias OMS**) / Macros (dona real vs meta). Un solo componente `PieChart` cubre torta y dona (`innerRadius`). Tocar un nutriente abre **"alimentos con más X"** con selector Día/7/30, mostrando los **gramos comidos** además del aporte (sin eso no se puede decidir entre bajar la porción y sacar el alimento).
- **Evolución del nutriente en el tiempo** ([#136](https://github.com/thusspokedata/pulsia/pull/136)). Curva diaria arriba del ranking, con la referencia OMS dibujada. `LineChart` ganó un prop `refLine` opcional (y la referencia **entra al dominio del eje Y**, si no quedaba fuera del gráfico justo cuando vas bien).
- **Alta de alimentos por texto** ([#137](https://github.com/thusspokedata/pulsia/pull/137)). Escribir "almendra" → `POST /nutrition/foods/describe` → la IA estima, sin foto ni tokens de visión. `buildFoodPrompt(mode)` comparte las reglas nutricionales entre foto y texto para que **no puedan divergir**. Chip **etiqueta/estimado** en el catálogo y el alta.

**Invariantes que NO hay que romper** (todos con test):
- **La fibra es un PISO** (≥30 g, pasarse es bueno → nunca ámbar); los otros 4 micros son LÍMITES. Está en `NUTRIENT_REFERENCE_KIND` (`shared/src/nutrition/references.ts`).
- Las **saturadas dependen de la meta de kcal** (10% de la energía), así que sin perfil completo no se muestra su referencia.
- Los arcos de torta/dona se dibujan con **kcal**, nunca con los `pct` (que se redondean por separado y pueden sumar 99/101). `macroSplit` **deriva** las kcal de los gramos (4/4/9), NO de `dayTotals.kcal` (difieren por redondeos de etiqueta).
- **Un día sin registrar NO genera punto** en la curva: no es lo mismo "comí 0" que "no sé". Por eso al lado del promedio va "N de 30 días con registro" — sin ese número no se sabe cuánto vale la curva.
- **El server fuerza `source: "estimate"`** en `/foods/describe`: por texto no hay etiqueta que leer, y no se le pide al prompt que no mienta, se pisa. Mismo patrón que el disclaimer del ECG.
- `MEAL_LABELS` usa `satisfies Record<MealType, string>`: agregar una variante al enum **rompe la compilación** en los 3 workspaces en vez de tirar esas kcal en silencio.

**⚠️ "estimado" NO significa "lo estimó la IA".** `source` tiene 2 valores pero hay **3** formas de cargar un alimento: foto de etiqueta → `label`; foto de alimento suelto o texto → `estimate`; **carga a mano → `estimate` también** (el form arranca así y no hay control para cambiarlo). O sea que un dato copiado de un envase real con los propios ojos se marca igual que uno inventado: la app no puede distinguirlos, no vio la etiqueta. El chip se lee como **"la app no verificó esto contra una etiqueta"** — es lo único que el dato respalda. Se sacó un texto viejo de la pantalla de alta que decía "estimado por IA", que era **falso** en ese caso.

**⚠️ Lección: los tests verdes mienten.** Esta sesión aparecieron **5 tests que no probaban lo que decían**, todos en verde, y **2 estaban en `main` desde hacía meses** (`/mg/` matcheaba dentro de `cholesterol_mg`; `/estimate/`, cuyo comentario decía "estimado → español", matcheaba el literal de otra regla). Ninguno lo encontró un review — los encontró **romper el código a propósito y ver si el test se quejaba**. Cuesta ~30 segundos por test. Desde ahora, cada test nuevo se verifica por mutación antes de darlo por bueno. Ver también [[subagent-parallel-writes]] y [[git-reset-hard-onboarding]], dos errores de proceso de esta sesión.

## 0-ANTES. ✅ HECHO (2026-07-14/15): DOMINIO 2 — NUTRICIÓN (el resto)

Todo mergeado en `main`, backend deployado, entregado por **OTA a vc10** (runtime android `784872cbc4d3628548bb75567f088dec209dcf87`, **estable** — todo lo de esta sesión fue JS+shared, sin dep nativa nueva). **0 PRs abiertos, prod sano.** Todo el dominio vive en el tab **"Nutrición"** (`mobile/app/(tabs)/nutricion.tsx` + `mobile/app/nutricion/*`) y `backend/src/{nutrition,reports}/`. Diseño **Fable 5 → spec**, implementación **Opus 4.8 subagent-driven + TDD + @claude review** por PR. Specs/planes en `docs/superpowers/{specs,plans}/2026-07-1{3,4}-*`.

**Sub-proyectos del dominio Nutrición (descompuesto en 4 + extras):**
- **#1 Registro de comidas (foto + IA + gramos)** — la fundación (#114, migración **0010**: `food`/`meal`/`meal_item`). `AiClient.extractFood` (Opus visión) extrae macros por 100g/ml de una foto (etiqueta → `source:label` preciso; suelto → `estimate`). Catálogo personal (se sube el alimento UNA vez), después se elige + cantidad (g/ml/unidad con `unitWeightG`). **Snapshot de macros por ítem** en `meal_item` → editar/borrar un alimento no cambia el historial. `foodMacrosForQuantity` (`shared/src/nutrition/macros.ts`) = fuente única del escalado (móvil preview + backend snapshot).
- **Campos nutricionales completos + naming original** (#117, migración **0012**): saturadas/azúcares/fibra/sal opcionales por 100 (nullable, `sumNullableMicro`); la IA guarda el **nombre impreso original** (etiquetas) y traduce solo los estimados. **Colesterol (mg) + agua (`water_ml`)** (#120, migración **0013**): colesterol del día con **ref fija 300 mg** (ámbar si se pasa) + **tracker de líquido** (aporte de alimentos + agua tomada, tabla `water_log`, botón vaso/ml + deshacer).
- **Edición** (#118): editar comida (tap → precargada → `PATCH /meals/:id`) + editar alimento del catálogo (`PATCH /foods/:id`); invariante snapshot intacto; casos borde (alimento borrado / unidad incompatible). #119: borrar comida desde la edición + estado sin alimentos.
- **#2 Balance energético** (descompuesto en #2a + #2b): **#2a metas** (#121, migración **0014** `nutrition_goal`): `activityLevel` en el perfil (semilla TDEE, "sin contar entrenamientos") + objetivo nutri (perder/mantener/ganar + ritmo) + `computeNutritionGoal` (`shared/src/nutrition/goal.ts`: BMR Mifflin-St Jeor × actividad + objetivo → kcal + macros; proteína por peso, grasa 27%, carbos resto; piso 1500; override manual). Vista **Meta/Comido/Restante** + barras por macro. **#2b net calories** (#123): `estimateSessionBurn`/`sumDayExerciseBurn` (`shared/src/nutrition/exerciseBurn.ts`: Keytel por FC con promedio para "otro", fallback MET 5, gasto **neto** restando BMR); backend `listSessions` expone `avgHr`; `Restante = Meta − Comido + Ejercicio`. **⚠️ DECISIÓN CLAVE de arquitectura: el perfil/meta viven en el MÓVIL (AsyncStorage), no en el backend** → el móvil computa la meta client-side y manda `athleteContext` en los requests; el backend arma el resto de la DB.
- **Detalle del día + card clara** (#122): la card del tab pasa a **Prot/Carb/Gras** (adiós P/C/G ambiguo), **clickeable → pantalla de detalle** explícita, y estado **"excedido" en ámbar** ("X de más"). Refactor: hook **`useNutritionDay(offset)`** + funciones puras `daySummary`/`goalView` compartidas por tab y detalle.
- **#4 Informes del agente** (estado holístico): **diario** (#124, migración **0015** `report` + `settings.reports_enabled`) + **periódicos** (#125, semanal desde lunes / quincenal 1-15,16-fin / mensual). `AiClient.generateReport` (Opus, patrón `interpretEcg`, **texto plano** sin markdown) genera resumen + 2-4 consejos desde datos **holísticos** (comidas/agua/metas/gasto/sesiones/métricas de Progreso); **opt-in** por usuario (switch en Config, default OFF, patrón `ecgEnabled`) + **recordatorio local** diario (default 21:30, `expo-notifications`, sin cron ni push); aporta hasta 2 observaciones a la **memoria del atleta** (`appendMemory` recorta desde el FRENTE, no pierde lo nuevo). Generación **lazy al abrir** (guardado, botón Regenerar). Anti-inyección + anclaje no-médico (por el colesterol). Pantalla `informes.tsx` con selector Día/Semana/Quincena/Mes.
- **🐛 Fix de bug pre-existente**: el navegador de fechas del tab de Nutrición tenía las **flechas invertidas** (◀ iba a mañana; días pasados inalcanzables desde #114). Unificado en la convención de `dayAtNoon`/`dayLabel` (offset positivo = pasado) en tab + Informes + `periods.ts`.

**Pendiente del dominio Nutrición** — movido al **§0-BACKLOG** (abajo del todo de esta sección). #3 Suplementos y la Pieza C, que estaban acá, **están hechos** (ver §0-HOY-PREVIA).

**Gotcha de tooling nuevo (2026-07-14):** la `eas-cli` en modo no-interactivo ahora EXIGE `--environment <preview|production|development>` además de `--branch`. Usar `bunx --bun eas-cli@16.20.4 update --branch preview --environment preview --message "..." --non-interactive`.

**Gotcha de tooling (2026-07-17):** si `bunx eas-cli` explota con `Cannot find package 'wrap-ansi'`, es la **caché de bunx corrupta**, no la versión. Borrar `/private/var/folders/**/bunx-501-eas-cli@<ver>` y reintentar. (`npx` en esta máquina resuelve a `npm` y no sirve de alternativa.)

## 0-BACKLOG. Lo que queda pendiente (2026-07-17)

**Decisiones tuyas (bloqueadas, no las voy a tomar solo):**
- **Paleta categórica para la torta de Calorías.** Hoy reusa tokens semánticos: desayuno y snack quedan en **dos teales casi idénticos**, y **la cena usa `colors.warning` (ámbar), que en el resto de la app significa "te pasaste de un límite"** — la porción de la cena se lee como una alerta que no existe. Lo marcaron los 2 reviewers. Arreglarlo bien = agregar colores nuevos a `tokens.ts`, o sea tocar la identidad visual.
- **Verificar en device el `SegmentToggle` de 4 pestañas**: estimado que "Nutrientes" entra con ~17% de margen en 320px, pero **nunca se midió de verdad**, y ya hubo un bug de texto cortándose en esta app.

**Piezas con tamaño propio (merecen spec):**
- ~~**Demostraciones animadas de ejercicios — Piezas 1-4.** Falta el plan de implementación.~~ →
  **HECHO y en prod** (2026-07-20, cuatro PRs). Ver **§0-AHORA**. Lo que sigue vivo de este tema es
  ampliar la cobertura más allá del 32%: se forkeó `everkinetic/data` a
  [thusspokedata/everkinetic-data](https://github.com/thusspokedata/everkinetic-data) para dibujar
  los que faltan (los SVG son vectores editables, así que se puede derivar de los existentes).
- **Revisar `inferEquipment` de raíz.** Ya van 9 correcciones vía `MUST_EQUIPMENT` por tres patrones
  distintos de fallo (§0-ANTES-HOY). La heurística por nombre es más excepción que regla; en algún
  momento conviene rehacerla en vez de seguir parchando caso por caso.
- **`CURL` clasifica los wrist curl como `biceps`.** `barbell_wrist_curl` y `dumbbell_wrist_curl`
  trabajan antebrazo, y el modelo tiene el grupo `forearms`. Lo detectó de paso la curación del
  mapeo de ilustraciones. Chico, pero ensucia el mapa corporal del resumen.
- **Pieza 2 — avisos sobre totales estimados.** Que el detalle del día, las referencias OMS y los informes de la IA aclaren cuando lo que mirás está armado mayormente con estimaciones. **Más urgente desde hoy**, porque el alta por texto volvió al estimado el camino de menor esfuerzo. **La arruga**: los micros son null-safe **por ítem** (`sumNullableMicro`), así que un total de colesterol puede mezclar un dato de etiqueta, uno estimado y uno ausente tratado como 0. "Estimado" **no es una propiedad del total: es una mezcla**, y decirlo bien requiere definir qué se mide (¿% de las kcal del día? ¿por nutriente?) antes de dibujar ningún badge.
- **Pasarle mutación a los tests que YA existen.** De los 5 tests falsos que aparecieron hoy, **2 estaban en `main` desde hacía meses** y salieron de casualidad porque toqué esos archivos. Nadie sabía cuántos más había. Ver la lección en §0-HOY-PREVIA. **HECHO en gran parte (2026-07-17):**
  - **[#139](https://github.com/thusspokedata/pulsia/pull/139):** auditadas por mutación las **~167 aserciones laxas** de toda la suite (`toMatch(/regex corto/)` + `toContain("literal corto")`, la clase donde vivían los falsos) → **27 falsas encontradas y arregladas**, cada una verificada en las dos direcciones (falla bajo su mutación, pasa en limpio). Diff **100% tests**, ninguna fuente de producción cambió. Patrón único: **el literal aparece en el output por más de un camino, y la aserción matchea el eco** (regex cortos que saltan de una regla a otra del prompt; fixtures que repiten el mismo valor en varios campos). **El hallazgo grave:** la línea **anti-prompt-injection de `report.ts` no estaba protegida por nada** (`/DATOS/` matcheaba el encabezado `"DATOS DEL PERÍODO:"`, así que la defensa entera se podía borrar con los 12 tests en verde); ahora borrarla rompe 2. **El único de los 27 que tapaba un bug de usuario real:** `configuracion-banda` asertaba sobre el JSON crudo → una banda guardada con `deviceId` vacío (impareable, no reconecta) pasaba en verde. El resto eran reglas de prompt y formato. Review `@claude` LGTM + CodeRabbit sin comentarios.
  - **[#142](https://github.com/thusspokedata/pulsia/pull/142):** auditado además `shared/src/supplements/` — ahí no había falsos sino **4 huecos de cobertura** (lógica que ningún test ejercitaba: el invariante `SCAN_DAYS=14` = LCM de los períodos de frecuencia, la guarda de clave vacía en `overlap.ts`, `SupplementSchema.id` como UUID, y 9 de los 11 prefijos de `GENERIC_PREFIXES`). Cerrados con 12 tests, cada uno verificado por mutación.
  - **Falta:** los **~400 tests con `toBe`/`toEqual`** no se auditaron (fuera del alcance elegido: se cubrió la clase laxa, que es donde estaban los falsos conocidos). Lección de proceso al pasar: **el snapshot de git del arranque miente si hay otra sesión en el mismo working tree** — verificar `git branch --show-current` antes de `git checkout -b`, y ramificar explícito desde `main` (ver [[git-snapshot-stale-concurrent-session]]).
- ~~**Garmin como fuente de gasto**~~ **HECHO**: el import `.FIT` trae las kcal medidas por el reloj (`kcalSource: "device"`) y el cardio ya entra al balance de nutrición. Sigue sin haber **sync automático**: el archivo se importa a mano. Ver [[garmin-activities-idea]], [[cardio-feature-status]].
- **Identificar los campos `135`, `136` y `144` del `.FIT`.** Se guardan crudos desde la fase 1. `144` duplica `heartRate` y `136` parece FC suavizada, pero **sin confirmar**. Cuando se identifiquen, el reproceso masivo (§0-ULTIMO) backfillea el histórico sin que el usuario reimporte nada — para eso se guarda el archivo crudo.
- **El reproceso masivo es secuencial** (2 queries por actividad en un solo request HTTP). Aceptable con el volumen actual y siendo on-demand; si crece, paralelizar con límite de concurrencia o moverlo a un job en background. Lo marcó el review de [#173](https://github.com/thusspokedata/pulsia/pull/173).

**Follow-ups chicos:**
- **Un tercer valor para `source`** que separe "lo estimó la IA" de "lo cargó el usuario a mano" (hoy los dos son `estimate`, ver §0-HOY-PREVIA). Toca el schema compartido, la extracción, la edición y los datos ya guardados: solo vale la pena si con el uso resulta que la distinción importa.
- `foodsHighestIn` **agrupa por `foodName`, no por `foodId`**: dos entradas de catálogo homónimas se fusionan en una fila. Es deliberado ("¿cuánto queso comí?"), pero si aparecen nombres duplicados hay que revisarlo.
- **Flake en `mobile/__tests__/ecg.test.tsx`**: apareció 2 veces en la sesión (warning de `act`), nunca reproducible aislado. Hipótesis: contención de CPU con varios agentes corriendo la suite a la vez. Sin diagnosticar.
- Menores de PRs anteriores: mostrar colesterol/agua en el catálogo; test de render de las flechas; agregación por-día con TZ para "días sobre/bajo meta" exactos en periódicos; `listSessions` con rango SQL (perf); recolorear `MuscleMap`/`SessionIndicator`; tabs con íconos; borrar los usuarios ops descartables (`ops-releases-vc8/9/10@pulsia.internal`).
- **PR [#116](https://github.com/thusspokedata/pulsia/pull/116) abierto** (Dependabot, bump del SDK de Anthropic 0.110→0.111). Es backend, no toca el fingerprint del OTA. Sin decidir.

## 0-ARCHIVO-1. ✅ HECHO (2026-07-13): fix ECG (qpdf) + peso single-source + registro diario + REDISEÑO visual

Todo mergeado en `main`, backend deployado, entregado por OTA a vc9 (runtime `410b46bf…` **confirmado**). **0 PRs abiertos, prod sano.**

- **ECG — el descifrado fallaba SIEMPRE (#108, deployado + verificado E2E):** el bug NO era ninguna de las hipótesis del handoff anterior (%PDF, timeout, red). Era la invocación de `qpdf`: se le pasaba `-` como input (stdin), que **qpdf NO soporta** (`open -: No such file or directory`, exit 2), y el `catch` lo reportaba engañosamente como "¿contraseña incorrecta?". Rompía TODO PDF cifrado de Kardia (análisis + "Ver PDF"). **Fix (`backend/src/ecg/decryptPdf.ts`):** escribir el PDF a un **archivo temporal** (mode `0600`, dato médico) y pasar el path como input; la salida sí va a stdout (`-`). Verificado en vivo (contenedor con `qpdf` 12.2, round-trip cifrar→descifrar) + **E2E con el PDF real** del usuario → "Normal Sinus Rhythm", FC 85, guardado. **Diagnóstico por evidencia** (el `pulsia_timed.log` de nginx mostró **400 consistente en ~110ms**, descarta timeout/499/502; repro en el contenedor), NO adivinando. **Gotcha:** los PDFs de Kardia **requieren la contraseña** guardada en Configuración (`qpdf --requires-password` → sí); con el fix + password correcta anda. Ver [[ecg-feature-status]].
- **#109 resumen longitudinal de ECG con FC:** `buildEcgSummary` ahora incluye la **FC media** por lectura + ordena por `createdAt` (antes por `recordedAt`, texto libre de Opus que NO ordena cronológico). El prompt ya pedía notar tendencias de frecuencia pero el dato no llegaba.
- **#110 peso del perfil single-source:** "Peso inicial" leía del **AsyncStorage local** y no coincidía con "Valores actuales" (métrica `weight_kg` del backend). El #103 solo **relabeló** (prometía un sync inexistente). Ahora el perfil carga la última medición del backend (relabel **"Peso actual"**); editarlo **registra una medición** → fuente única. Helper puro `weightToRecordOnSave`. Review encontró un **race** (el fetch async tardío pisaba lo tipeado) → guard `weightEdited`.
- **#112 registro diario — prefill por día:** al retroceder en el navegador de fechas de Progreso a un día con datos, los inputs de Actividad/"Cómo te sentís" **se precargan** (antes: siempre vacíos). Cachea `FLOW_METRIC_TYPES`, helper puro `valuesForDay` (match por día calendario).
- **REDISEÑO visual — nueva identidad "clínico fresco" (#111 + #113):** el usuario no quería seguir con el **terracota** (parecido a otra app suya). Nueva paleta **teal + slate sobre gris frío** en `mobile/src/theme/tokens.ts` (`accent #0E7C86`, `bg #F4F7FA`, `surface` blanco; tokens nuevos `success`/`successSoft`/`successText`/`surfaceMuted`/`icon`/`radius.lg`). Como casi todo referencia `tokens.ts`, recolorea las ~13 pantallas de una. **Progreso (#113):** gráficos con **ejes** (helper `chartAxis`: `niceTicks`/`innerTicks`/`shortDate`/`fmtNum`; `LineChart`/`MultiLineChart` con Y ticks+gridlines + X fechas), **secciones en tarjetas** (componente `Section` + `surfaceMuted` en tiles internos), paleta consistente (presión teal/azul/ámbar, `YearHeatmap` rampa teal). Borró `scalePoints` (`chart.ts`) + `multiChart.ts` (código muerto). Reviews de Claude atendidas: bug del punto medio X (usaba índice-medio, ahora **punto medio temporal** como MultiLineChart) + flat-X por span (`maxX===minX`, cubre mismo-día).
- **OTA fingerprint CONFIRMADO:** vc9 Android = **`410b46bfe3162b4562fc7c42737b455d824a885c`** (el `88cc46dd` del handoff previo era una **predicción errada**). Verificado: los `eas update` lo reportaron y **le llegaron al teléfono** (el usuario vio los cambios aplicados). Ver [[ota-fingerprint-gotcha]].

### Pendiente (próxima pasada)
- Recolorear `MuscleMap` (coral `#F0B79A`) y `SessionIndicator` — están en la pantalla de **sesión**, no en Progreso, así que siguen cálidos.
- Tabs con **íconos** (Fase 2 del mockup original; hoy la nav sigue con labels de texto).
- **ECG follow-ups:** validar base64 **vacío** en la app antes de subir (el `too_small` intermitente de los primeros intentos — el archivo no materializado / placeholder de nube); mostrar en Configuración si ya hay **contraseña de Kardia** guardada (`hasKardiaPw` existe en `GET /settings`, la pantalla no lo usa).

## 0-hoy. ✅ HECHO sesión previa (2026-07-12): feature ECG (KardiaMobile) → APK vc9

Todo mergeado en `main`, backend deployado, **APK vc9 released + activado**. Spec/plan en `docs/superpowers/` (`2026-07-12-ecg-kardiamobile-*`). **0 PRs abiertos, prod sano.**

- **ECG backend (#104):** subir PDF en base64 (`POST /ecg` bajo `auth`), guardado como `bytea` (tabla `ecg_recording`, **migración 0009** con CHECK de status). **PDFs con contraseña:** `qpdf` on-demand (agregado al `backend/Dockerfile`) usando la contraseña de Kardia guardada (encriptada en `settings.kardia_pw_encrypted`); el blob se guarda tal cual (los protegidos conservan su cifrado; los demás en claro — DB en la Pi privada single-tenant, decisión del usuario). **Interpretación:** `AiClient.interpretEcg` con **`claude-opus-4-8`** — le manda el **PDF directo** (content block `document`, visión), extrae el veredicto de Kardia + FC + fecha, y da una lectura **no-diagnóstica anclada al veredicto de Kardia** + **disclaimer forzado server-side** + **anti prompt-injection** (PDF/historial = datos, no instrucciones) + **tendencias longitudinales** (recibe el historial). Runner async `runEcgAnalysis` (floating promise, nunca throwea; timeouts en la IA 120s y en qpdf 30s). Rutas: subir/listar/ver/`GET /:id/pdf` (desbloqueado; 422 si falta contraseña, 500 infra)/borrar. Settings `ecgEnabled` + contraseña; `aiApiKey`/`aiModel` ahora opcionales (togglear sin pisar). `buildEcgSummary` alimenta la **generación** (contexto SOLO informativo, no prescriptivo) y la **memoria del atleta** ([[athlete-ai-memory]] — registro longitudinal, norte del producto).
- **ECG mobile (#105 → vc9):** deps nativas `expo-document-picker` + `expo-file-system` + `expo-sharing` (→ re-basan el fingerprint). Cliente API `src/api/ecg.ts`. **Configuración:** toggle "ECG / Corazón" (oculto por defecto, setting por-usuario) + campo de contraseña de Kardia (secure) + acceso a la pantalla. **Pantalla `app/ecg.tsx`:** "Subir ECG" (document-picker → base64 → upload) → **pollea** el análisis (cota de 40 intentos + guard de solapamiento) mostrando "Analizando…"; lista (fecha · veredicto Kardia destacado · interpretación); tap → detalle + "Ver PDF" (descarga con Bearer → share-sheet, chequea status 200) + borrar; **disclaimer médico** siempre visible.
- **Build/activación vc9:** local ([[local-android-build]]; `eas build --local` camino primario), cert `0470…769f7` (update sobre vc8), versionCode 9, **fingerprint `410b46bfe3162b4562fc7c42737b455d824a885c`** (⚠️ no se dejó extraer del APK con aapt — confirmar al primer `eas update` a vc9; ver [[ota-fingerprint-gotcha]]). Release público `mobile-vc9`. `PUT /app/latest` versionCode 9 hecho (usuario ops nuevo `ops-releases-vc9@pulsia.internal`). `/download` sirve vc9.
- **Reviews:** CodeRabbit — backend 16 Major→resueltos (disclaimer server-side, anti-inyección, timeouts, /pdf error, etc.), mobile 6→resueltos (hidratación de toggle, password sin trim, error/timeout/overlap en polling, status del PDF). ~565 tests verdes.
- **Falta (paso del usuario):** instalar vc9 + probar la sección ECG (subir un PDF del KardiaMobile, con y sin contraseña, ver la interpretación).

### Futuro / backlog (post-ECG)
- **Comidas** (dominio 2 del roadmap): la infra de subir archivos de ECG **la habilita** (foto + IA visión).
- **Coros / push a relojes** (decidido futuro): nombres Coros + mandar el programa al reloj (Garmin Training API / Coros Training Hub API, requieren partner/dev). Los nombres del catálogo ya son estándar.
- **Datos de salud — Next:** nutrición numérica, auto-captura vía Health Connect/Garmin/Coros, HRV + readiness score compuesto.
- **Menores:** borrar los usuarios ops (`ops-releases@pulsia.internal`, `ops-releases-vc9@pulsia.internal`); upsert-por-día de métricas diarias.

## 0a. Estado de la sesión 2026-07-10/11 (sesión PREVIA — la MÁS reciente es §0-hoy, arriba)

> Contexto de la sesión anterior (progreso cuantitativo Fase 1, presión, HR, visualizaciones). El estado actual/último está en **§0a-next**. Ojo: acá se habla de vc7/`aeaa36d9…`, ya superado por vc8/`88cc46dd…`.

**Todo mergeado en `main`, backend deployado, y entregado por OTA a vc7** (runtime `aeaa36d9…`). **0 PRs abiertos, prod sano.**

### Seguimiento de progreso cuantitativo (Fase 1) — norte [[athlete-ai-memory]], [[progress-tracking-status]]
Spec `docs/superpowers/specs/2026-07-10-seguimiento-progreso-design.md`, plan `docs/.../plans/2026-07-10-seguimiento-progreso.md`.
- **#86 backend datos & tendencias** — tabla tipada `body_metric` (migración **0007**), endpoints bajo `auth` `POST/GET /metrics`, `/metrics/latest`, `DELETE /metrics/:id`, `GET /progress/performance`. Cómputo **puro en `shared/`** (`computePerformanceTrends`: 1RMe Epley, volumen/sesión, PRs).
- **#87 la IA observa el progreso** — `buildProgressSummary` (deltas ~8 sem por **fecha** vía `getSessionsSince`, IMC derivado, fuerza top-5, volumen) inyectado en el prompt de generación + refresh de memoria — **solo al generar/refrescar, NUNCA reactivo** (cargar datos NO regenera). Ambos caminos (`/generate` sync + async).
- **#88 tab "Progreso" móvil** — `app/(tabs)/progreso.tsx`: valores actuales, chart de tendencia, fuerza (1RMe) top-5, volumen, form de carga. Charts SVG.
- **Modelo tipado extensible** = clave: sumar métricas nuevas = sumar tipos en `shared/src/schemas/metrics.ts` (`BODY_METRIC_TYPES` + `BP_METRIC_TYPES`), sin migración de columnas.

### Presión arterial (#94) — [[progress-tracking-status]]
`bp_systolic`/`bp_diastolic`/`bp_pulse` (mmHg/bpm). El backend redeployó para aceptarlos (modelo genérico, sin cambio de código). Sección propia en Progreso: carga agrupada "120/80@bpm" + `MultiLineChart` combinado (2 líneas). Refine cruzado: alta > baja.

### HR #9 (ambas partes) — [[progress-tracking-status]]
- **(a) #97 FC por ejercicio** en el resumen (roll-up de `hrAvg`/`hrMax` por serie → por ejercicio en `summary.ts` + sección "Por ejercicio" en `SessionSummary.tsx`).
- **(b) #98 curva de FC de toda la sesión** — captura **continua** (incl. descansos): `useHeartRate` guarda `fullLogRef` (sobrevive los resets por-serie); `buildHrSeries` downsamplea a buckets de 5s; se sube en `hr_series` jsonb (**migración 0008**) y se muestra como curva (`LineChart`) en el resumen. El `LineChart` ahora muestra **escala** (mín/máx + unidad).

### Visualizaciones (Batch 2)
- **#93** heatmap anual estilo GitHub ("Días entrenados", intensidad = minutos/día, selector de año) + barras de tiempo por día (últimas 4 semanas). Mobile-only (datos de `GET /sessions`). En el tab Progreso.
- **#95/#96** el heatmap **no muestra días futuros** del año en curso (la grilla se recorta a la semana de hoy, solo el año en curso) y **arranca scrolleado a lo reciente** (auto-scroll al final).

### Arreglos de sesión en vivo (Batch 1, #91)
#1 la campana ya no pausa música/podcast (`setAudioModeAsync mixWithOthers`); #4 cambiar de ejercicio NO corta el descanso; #5 auto-reanuda al tocar reps si estaba pausado; #3 la burbuja de reps arranca con las reps del plan (`parsePlannedReps`), el tap sigue +1.

### ⚠️ GOTCHA CRÍTICO — OTA fingerprint (memoria [[ota-fingerprint-gotcha]])
Bumpear CUALQUIER dep del móvil (hasta un devDep) cambia el `runtimeVersion` (fingerprint) y **rompe el OTA hacia el APK instalado**. **ACTUALIZADO (vc10, CONFIRMADO 2026-07-14):** la versión activa es **vc10 = `784872cbc4d3628548bb75567f088dec209dcf87`** (re-basado por `expo-image-picker` nativo, feature de comidas). **Verificar SIEMPRE** que `eas update` reporte runtime android **`784872cb…`** (ya NO `410b46bf` de vc9). Todas las OTAs de esta sesión (nutrición) lo reportaron y llegaron al teléfono. `.github/dependabot.yml` ignora las deps del móvil (typescript, react, react-native-*, expo*, async-storage, babel major, jest major). Historial: vc7 `aeaa36d9`, vc8 `88cc46dd`, vc9 `410b46bf`, **vc10 `784872cb` (actual)**.

### Dependabot (limpio)
#73 (checkout 4→7) + #83 (grouping + `@anthropic-ai/sdk` 0.110) mergeados; #78 + #84 (@babel/runtime 8, HOLD tras eval empírica en worktree) cerrados; #89 (ignore babel-major) mergeado; #85→#90 (typescript 7) **revertido** por el fingerprint. Sin PRs de dependabot abiertos.

### ⚠️ Lección: subagentes que re-delegan (memoria [[execution-subagent-driven]])
En #98 un subagente `general-purpose` con tarea multi-capa **re-delegó en cadena** → los hijos corrieron en el MISMO working tree en paralelo con el controlador (commits/amends/pushes/checkouts cruzados). Convergió bien pero es peligroso. Para tareas multi-archivo: inline, o **un subagente por capa** (shared/backend/mobile secuenciales), o `isolation:"worktree"`. Siempre verificar el estado real (git log/tests), no el reporte.

## 0a-next. ✅ HECHO esta sesión (2026-07-11/12): vc8 + /download + fixes de sesión + español + datos de salud

Todo mergeado en `main`, backend deployado, y entregado (APK vc8 + OTAs). Specs/planes en `docs/superpowers/` (fechados 2026-07-10/11). **0 PRs abiertos, prod sano.**

- **#100 campana en background** — `expo-notifications` (NATIVO → forzó vc8): notif local al fin del descanso (`mobile/src/session/restNotification.ts` + `src/notifications/setup.ts` con handler que suprime el sonido en foreground → sin doble campana; la campana JS de `expo-audio` sigue para foreground). Atada al ciclo de vida de `restUntil` (skip/pausa/reanudar/terminar cancelan; cambiar de ejercicio la mantiene). Incluye el bump **TS7 en el móvil** (esta vez a propósito; el build nativo re-basa el fingerprint igual). Limitación: force-stop/swipe-away puede matar la alarma en algunos OEMs.
- **APK vc8** — buildeado local (método [[local-android-build]]; `eas build --local` anduvo por el camino primario), cert `0470…769f7` (instala como update sobre vc7), versionCode 8, fingerprint `88cc46dd…`. Release público `mobile-vc8`: `https://github.com/thusspokedata/pulsia/releases/download/mobile-vc8/pulsia-vc8.apk`. Activado con `PUT /app/latest`.
  - **Gotcha de activación:** `/app/latest` está detrás de `auth` → el PUT necesita **token de sesión válido ADEMÁS** del `X-Admin-Token`. Vía usada: registrar un **usuario ops descartable** (`POST /auth/register` con `INVITE_CODE` → token) + `X-Admin-Token` de `deploy/app.env`. Usuario ops creado: **`ops-releases@pulsia.internal`** (el usuario pidió DEJARLO para futuras activaciones). Alternativa más limpia a futuro: sacar el PUT de `auth`.
- **#99 página `/download` con QR** — ruta pública en el backend (registrada FUERA de `auth` en `app.ts`), lee `app_release`, renderiza HTML self-contained + **QR SVG** (`qrcode`) al APK directo. En vivo: `pulsia.lahuelladelcaminante.de/download`. Escapa/valida `apkUrl` (solo http/https; anti-XSS aunque sea admin-only).
- **#101 fixes de sesión (OTA)** — "Terminar serie" **guarda directo** con las reps del plan (antes había que tocar +1/−1: `endSet` era no-op sin serie abierta → ahora `onEndSet` materializa la serie); el "Sugerido" ya no desalinea el input RPE (`alignItems: flex-start`). CodeRabbit encontró un bug real (la notif nativa disparaba en la pantalla de resumen porque `onFinish` no limpiaba `restUntil`) → arreglado.
- **#102 nombres de ejercicios en español (OTA)** — mapa `EXERCISE_NAMES_ES` (230, en `shared/src/catalog/exercises.es.ts`, **separado del catálogo auto-generado** para que regenerarlo no lo pise) + helper `exerciseNameEs` (con guard de own-property). La sesión muestra **español (principal) + inglés (secundario)**; el inglés estándar sirve para buscar en el reloj.
- **#103 datos de actividad/salud (OTA + deploy)** — métricas nuevas SIN migración (modelo tipado extensible): `steps`/`floors`/`sleep_hours`/`sleep_quality`/`resting_hr` (`ACTIVITY_METRIC_TYPES`) + `stress`/`mood`/`energy` (`SUBJECTIVE_METRIC_TYPES`), en `shared/src/schemas/metrics.ts`. Progreso: **dos secciones nuevas** + **selector de fecha JS puro** (`◀ día ▶` + "Hoy", mediodía como `measuredAt`, sin días futuros) para **backfillear días olvidados** — SIN dep nativa (OTA-safe; `MetricReading.measuredAt` ya lo soportaba). `buildProgressSummary` ahora separa **tendencia** (delta, composición/presión) de **flujo diario** (`FLOW_METRIC_TYPES` → promedio últimos 7 días + alertas: `3 de 7 noches < 6 h`, `días < 8.000` pasos; umbrales como constantes en `progress.ts`). **Peso single-source**: sacado del prompt (`prompt.ts`), el perfil queda como semilla/fallback en `buildProgressSummary`. **Sexo** opcional en el perfil (`sex` enum en `TrainingProfileSchema`, chips en `perfil.tsx`, una línea en el prompt).

### Coros / push a relojes (decidido: FUTURO, spec propio)
El usuario quiere a futuro (a) que los nombres coincidan con Coros cuando use Coros y (b) mandar el programa al reloj. Investigado: **viable** para ambos (Garmin Training API / Coros Training Hub API — hasta hay un [MCP comunitario que empuja fuerza a Coros](https://github.com/cygnusb/coros-mcp)), pero requiere **acceso de partner/dev + OAuth** → proyecto propio, no ahora. Los nombres del catálogo ya son estándar (Coros los reconoce), por eso NO se armó un catálogo Coros.

### Backlog / próximo
- **Datos de salud — Next** (un agente hizo un catálogo priorizado, ver la conversación): seguir con **nutrición** numérica (protein/kcal/agua como métricas, antes del pipeline de fotos — fase 2); a futuro **auto-captura** vía Health Connect / Garmin / Coros (las métricas manuales se auto-llenan, misma tabla) + HRV + **readiness score** compuesto (norte [[athlete-ai-memory]]); check-in subjetivo ya está.
- **Menores pendientes:** mostrar el último peso de Progreso EN el perfil (se relabeló el campo pero no se muestra el valor live); upsert-por-día de métricas diarias (hoy append); escalas 1–5 con selector visual; extender el selector de fecha a composición corporal/presión.
- **Batch 3 — rutinas propias:** constructor manual (elegir ejercicios del catálogo + series/reps/descanso). Feature grande, spec propio.
- **Fases de progreso:** Fase 2 = comidas (foto + IA); Fase 3 = respiración/relajación + coach proactivo.

## 0b. Estado de la sesión 2026-07-09 (leer primero)

Arranque: la app era single-user (`SINGLE_USER_MODE=true`), solo LAN (`http://192.168.178.47:3011`), sin login. Esta sesión la llevó a **producción multi-usuario en internet**. Todo mergeado en `main` (con review CodeRabbit; `@claude` si throttled) y deployado.

**Mergeado esta sesión, en orden:**
- **Entreno puntual expandido** (#71 backend + #72 mobile): el one-off pasó de 1 músculo + gym/casa a **multi-músculo + tiempo elegible (chips+custom) + equipo explícito (multi-select sembrado por lugar) + notas libres** ("me duele la cintura"). `OneOffRequestSchema` tolerante a version-skew; `buildOneOffPrompt` expandido. Spec/plan `2026-07-06-oneoff-expanded-*`.
- **Feature de updates in-app ACTIVADO**: deps+config (`expo-updates`, `expo-application`, app.json updates url + `runtimeVersion` fingerprint, eas.json `channel:preview` + `autoIncrement`) + primer APK OTA-capable buildeado/hosteado. `GET/PUT /app/latest` (PUT con `X-Admin-Token` = `ADMIN_TOKEN`, timing-safe). **OJO:** la UI de "buscar actualización" NO se mergeó (solo deps+config) → el OTA llega por **auto-check nativo al abrir** (cerrar/reabrir la app 2x).
- **Auto-deploy a la Pi**: `.github/workflows/deploy.yml` ACTIVO (push a `main` → runner self-hosted `pi-nextcloud-pulsia` → rsync + `docker compose up -d --build` + health check). Un merge a `main` **deploya solo el backend**.
- **Fix del banner de sesión en curso** (#75, entregado por **OTA**): estaba bajo la barra de estado (intocable) → safe-area + botón claro + días no-activos deshabilitados.
- **MULTI-USUARIO GO-LIVE** (lo grande):
  - #76 backend: key de IA **del server** (`ANTHROPIC_API_KEY`) con override por usuario (`resolveAiKey`, en `backend/src/ai/resolveKey.ts`); script `backend/src/scripts/claim-single-user.ts <email>` (migra los datos del usuario por defecto al owner, atómico).
  - #77 mobile: **login/registro/logout** (token en `expo-secure-store`, `Authorization: Bearer` en `apiFetch`, guard en `app/_layout.tsx`, manejo de 401 vía `src/auth/unauthorized.ts`), URL default `https://pulsia...`, `usesCleartextTraffic:false`. → **APK vc7**.
  - **Cutover**: `SINGLE_USER_MODE=false` + `ANTHROPIC_API_KEY` en `deploy/app.env` de la Pi → redeploy; el owner se registró + se corrió `claim-single-user` (6 programas + 3 sesiones migrados); exposición a internet (ver §9).
- **Fix de seguridad de `/sessions`** (#79): estaba FUERA del middleware `auth` (público al exponer) + usaba `SINGLE_USER_ID` hardcodeado (el historial daba vacío tras migrar). Ahora `app.use("/sessions", auth)` + `c.get("userId")` + 409 si el id de sesión es de otro usuario. **LECCIÓN**: al salir de single-user, revisar que TODOS los routes estén en `auth` y usen `c.get("userId")`, no `SINGLE_USER_ID`.
- **Generación asíncrona** (#80 parcial → #81 backend + #82 mobile, definitivo): generar daba "no se pudo conectar" en el móvil (la request de ~60-130s la cortaba okhttp/NAT → **HTTP 499**). Solución: `POST /programs/generate-async` → `{jobId}` al instante + genera en background (`runGenerationJob`, floating promise) + `GET /programs/generate-async/:jobId` para pollear (valida UUID + stale-job fallback >10min). Mobile: `generando.tsx` pollea cada 3s (resiliente a blips), entregado por **OTA**. El `POST /programs/generate` sync quedó por back-compat. Spec/plan `2026-07-09-async-generation-*`.

**Distribución de la app:** APK **vc7** con login en el release `mobile-vc7`: `https://github.com/thusspokedata/pulsia/releases/download/mobile-vc7/pulsia-vc7-login.apk` (versionCode 7, firmado con keystore EAS, canal `preview`, runtime `aeaa36d9d2804bb839034776f9929c94bfca26d0`). Cambios de **JS puro → OTA**; cambios nativos → build nuevo (ver gotcha de build local). La familia: ese APK + el `INVITE_CODE`.

**Pendientes / decisiones abiertas:** (a) "recuperar el programa viejo" — al borrar datos de la app se pierde el plan local; no hay `GET /programs/latest` para re-bajarlo del backend → hoy la vía es regenerar. (b) Async para `/programs/generate-oneoff` (mismo patrón, YAGNI hasta que moleste). (c) `/app/latest` quedó detrás de `auth` (solo post-login) y apuntando a vc4 — un PUT a vc7 requiere token de sesión además del `X-Admin-Token`.

> Working tree: ` M .gitignore` (`.superpowers/`, modif PRE-EXISTENTE del usuario) y ` M ONBOARDING.md`
> (este doc) — **NO commitear** (dejar como working-tree). Rama al cerrar: `main`. **Sin PRs abiertos.**

**Gotchas de tooling (vigentes 2026-07-09):**
- **`eas-cli` + red flaky (importante):** `bunx eas-cli` (corre bajo Node) falla intermitente con
  `GraphQL request failed` / `ETIMEDOUT` — IPv6 roto a `api.expo.dev` (curl y bun andan por IPv4).
  Usar **`bunx --bun eas-cli`** (runtime bun) para `update`/`whoami`. Para `build --local` bajo bun
  rompe el spawn del plugin → **build 100% offline con gradle** (extraer el keystore de EAS del job spec
  + prebuild + `gradlew assembleRelease` con firma inyectada). Todo el método en la memoria
  [[local-android-build]] (incluye el fix `~/.gradle/gradle.properties` con `MaxMetaspaceSize=1536m` sin
  el cual el build revienta por Metaspace, y restringir ABIs a `arm64-v8a,armeabi-v7a`). Build local gratis
  = bypass de la cuota de EAS cloud. Cuenta EAS: `belregistro`.
- **OTA (JS puro):** publicar con `cd mobile && bunx --bun eas-cli update --branch preview --environment
  preview --message "..." --non-interactive`. El **runtime version del update debe matchear el fingerprint
  del APK instalado** (vc7 = `aeaa36d9…`); un cambio JS-only NO cambia el fingerprint. No hay UI de
  "buscar actualización" → el usuario **cierra/reabre la app 2 veces** (chequeo nativo al abrir: 1ra baja,
  2da aplica). Ver [[update-feature-status]].
- **usesCleartextTraffic ahora FALSE** (vc7): la app habla **HTTPS** a `pulsia.lahuelladelcaminante.de`.
  Al upgradear desde un APK viejo puede quedar una URL LAN `http://192.168.178.47:3011` guardada en
  AsyncStorage → error "CLEARTEXT communication not permitted" y no se puede cambiar (login bloquea
  Configuración) → **borrar datos de la app** (o reinstalar). Instalación fresca no lo sufre.
- **Generaciones largas de la IA:** ya NO se hacen síncronas desde la app (async con polling). El límite
  no era nginx (`proxy_read_timeout 300s`) sino el cliente móvil (okhttp/NAT cortan a ~60s → 499).
- **CodeRabbit / review (memorias [[coderabbit-rate-limits]], [[code-review-polling]], [[workflow-prs-coderabbit]]):**
  `.coderabbit.yaml` con `auto_incremental_review: false` → tras un push nuevo, `@coderabbitai review`
  dispara el review incremental. **Severidad**: menores → fix + merge; **mayores → fix + NUEVO review**.
  `@claude review` si CodeRabbit está caído. Nunca mergear sin al menos un review. Un review limpio no
  deja el marcador "Actionable comments posted".
- **Deploy:** un merge a `main` **auto-deploya el backend a la Pi** (workflow `deploy.yml`; el contenedor
  auto-migra: CMD `db:migrate && db:seed && start`). Tras mergear un PR de backend, verificar la salud del
  deploy (`ssh nextcloud 'curl -s localhost:3011/health'` o por el VPS: `ssh vps 'curl -s http://10.8.0.2:3011/health'`).
  La Pi (`ssh nextcloud`) a veces da "Host is down" transitorio → reintentar. Ver [[autonomous-deploy-boundary]].
- **Firma de la app:** todos los builds (vc4/vc6/vc7) usan el **mismo keystore de EAS** (cert SHA-256
  `0470…769f7`) → instalan como update uno sobre otro. Mantenerlo.

## 1. Qué es Pulsia

App para registrar actividad física y de vida, integrada con Garmin/Polar. **Foco actual:
entrenamiento** (generador de rutinas con IA + registro de sesión en vivo). El generador, a partir
de un perfil, arma un programa de gimnasio + su equivalente para casa, con nombres de ejercicios
compatibles con Garmin.

**Roadmap del producto (orden del usuario, guardado en memoria `product-roadmap`):**
1. **Entrenamiento** (foco actual). 2. **Comidas** (foto + IA). 3. **Estrés** (meditación/respiración
+ métricas de estrés de Garmin). 4. **Estado holístico** — cruzar todos los datos y sacar
conclusiones. Todo converge en un registro por día/sesión reutilizable por el análisis.

El usuario (kilo) es dev, hostea en su Raspberry propia (`nextcloud`, acceso por LAN/VPN WireGuard),
prefiere control y privacidad (NO exponer la Mac). Posible salida comercial a futuro. Tiene Android.

## 2. Arquitectura (monorepo Bun)

Workspaces en `/Users/kilo/desarrollo26/pulsia`:
- **`shared/`** (`@pulsia/shared`): schemas Zod (fuente de verdad): `TrainingProfileSchema`,
  `ProgramSchema`, **`WorkoutSessionSchema`/`SessionExerciseSchema`/`SetLogSchema`** (registro de
  sesión), catálogo `EXERCISE_CATALOG` (~230, generado del FIT SDK). Tests `bun test`. Ojo: `zod` NO
  se resuelve directo desde `mobile/` (usar los schemas de `@pulsia/shared`, no `import { z }`).
- **`backend/`** (`@pulsia/backend`): Hono + Bun + Postgres (pgvector) + Drizzle. Genera programas
  con Claude (`claude-sonnet-4-6`, tool use, `max_tokens` 16000, ~60-130s) — la generación es
  **asíncrona** (`POST /programs/generate-async` → job + polling, tabla `generation_jobs`; el POST sync
  sigue por back-compat). Auth multi-usuario con sesiones + `requireAuth` (ver §3). **Dockerizado**
  (`backend/Dockerfile`, `deploy/`; auto-migra al arrancar). Tests `bun test`.
- **`mobile/`** (`@pulsia/mobile`): Expo SDK 57 + expo-router + TanStack Query + AsyncStorage. Target
  **Android** (APK vía EAS). Tests con **jest** (`jest-expo`), correr con `--runInBand` (en paralelo
  da timeouts flaky por contención). Identidad visual **"clínico fresco"** (teal `#0E7C86` + slate sobre gris frío, desde 2026-07-13; antes coral `#D85A30`), tokens en `mobile/src/theme/tokens.ts`.

## 3. Estado actual (todo en `main`)

- **Generador** funcional end-to-end (probado en vivo desde el teléfono).
- **Mobile**: config (URL+API key), perfil, generación (timeout cliente **240s**, ver #29), **viewer
  del programa** (#28: semanas, toggle gym/casa, ejercicios, "Copiar a Garmin").
- **Sub-proyecto A — registro de entrenamiento (COMPLETO):**
  - **#31 backend**: tablas `workout_session`/`session_exercise`/`set_log` (cascade), endpoints
    `PUT /sessions/:id` (upsert idempotente) + `GET`. `hr_avg`/`hr_max` por serie reservados (nulos)
    para el sub-proyecto B.
  - **#32 mobile datos**: `putSession`, storage (sesión activa + cola de pendientes upsert-por-id),
    **motor puro** (`src/session/engine.ts`: tapRep/tempo, endSet, editSet, skip, finish), flush de sync.
  - **#35 mobile UI**: pantalla `app/sesion.tsx` (Layout A — tap por rep, timers, peso/RPE, editar
    series, terminar → persist + sync), entrada "Empezar entrenamiento" + banner de resume, seam
    `newSessionId` (expo-crypto), y `programId` guardado al generar.
  - Diseño offline-first: se captura en el teléfono, se sincroniza al reconectar (idempotente por id).
- **Auth MULTI-USUARIO: LIVE (2026-07-09).** Backend: sesiones + `requireAuth` en
  `/settings`/`/programs`/`/profile`/`/memory`/`/app`/**`/sessions`**, `/auth/register|login|logout`
  (registro con `INVITE_CODE`), scoping por usuario. Mobile (vc7): login/registro/logout, token en
  `expo-secure-store`, guard en el layout, manejo de 401. **`SINGLE_USER_MODE=false`** en la Pi (el flag
  sigue en `config.ts`/`app.ts` por si se quiere volver a single-user en dev). Key de IA: del server
  (`ANTHROPIC_API_KEY`) con override por usuario (`resolveAiKey`). Ver §0b + memoria [[multiuser-auth-status]].

## 4. Rumbo vigente

- **App en producción multi-usuario en internet: LOGRADO.** El owner y la familia la usan por
  `https://pulsia.lahuelladelcaminante.de` con el APK vc7.
- **HR en vivo por banda BLE: HECHO** (sub-proyecto B, avg/max por serie, verificado en device).
- **Próximo (a elección del usuario):** (a) "recuperar programa" (endpoint + carga desde backend);
  (b) v-next de la **memoria del atleta** (estructurada/edición/Garmin, ver [[athlete-ai-memory]]);
  (c) **PT agent** conversacional; o (d) **dominio 2 del roadmap: Comidas** (foto + IA). Ver §8 y
  memoria [[product-roadmap]].

## 5. Cómo correr / operar

**Dev local** (Mac, con `export PATH="$HOME/.bun/bin:$PATH"`):
```bash
docker compose up -d                         # Postgres+pgvector dev (raíz)
cd backend && bun run db:migrate && bun run db:seed && bun run start   # :8787
cd mobile && bunx expo start --host lan --clear   # NO --localhost (bindea IPv6)
```
Tests: root `bun test shared backend`; mobile `cd mobile && npm test -- --runInBand`.

**Producción (internet, YA desplegado):** ver §9. Backend público en
**`https://pulsia.lahuelladelcaminante.de`** (multi-usuario, HTTPS). Auto-deploy en push a `main`.

**APK Android (vc7 con login):** config EAS en `mobile/` (`eas.json` perfil `preview` → APK; `app.json`
con `android.package` + `projectId` + `usesCleartextTraffic:false` + `updates.url` + `runtimeVersion`
fingerprint + `channel:preview`). La app ya trae la URL de prod por default (`src/config/backend.ts`);
el usuario solo se registra con el `INVITE_CODE`. Build local gratis (bypass cuota EAS): ver
[[local-android-build]]. Cambios de JS puro se entregan por **OTA** (no requieren build).

**Dev build (necesario para BLE / sub-proyecto B):** el APK `preview` no incluye BLE. Para HR por
banda hace falta un dev client:
`cd mobile && bunx eas-cli build -p android --profile development` → instalar el APK →
`bunx expo start --dev-client`. Emparejar la banda en Configuración → "Banda de pulso".

## 6. Convenciones (IMPORTANTE)

- **Flujo por PRs revisados por CodeRabbit.** Rama por PR; NUNCA commitear features directo a `main`.
- **Auto-merge autorizado** (dado por el usuario esta sesión): tras review REAL de CodeRabbit (no
  solo el aviso de rate-limit) y sin comentarios/threads abiertos, **mergear solo (squash)**. Siempre
  aplicar primero los cambios que pida. Si un PR nuevo no recibe review (rate-limit), **`@coderabbitai
  review`** en el PR lo destraba. (Ver memoria `workflow-prs-coderabbit`.)
- **Ejecución subagent-driven siempre** (memoria `execution-subagent-driven`). **NUNCA preguntar qué modo
  de ejecución** — arrancar directo subagent-driven (pedido explícito del usuario, 2026-07-12). Nota: los
  subagentes a veces re-delegan y no terminan → verificar el estado real (git log/tests) y completar directo si hace falta.
- **Commits firmados `git commit -S`.** NUNCA atribución a Claude/Anthropic ni Co-Authored-By.
- **TDD** siempre, con **verificación por mutación de cada test nuevo** (romper el código a propósito
  y confirmar que el test se queja). Specs en `docs/superpowers/specs/`, planes en `docs/superpowers/plans/`.
- **Los nombres en inglés NO son un bug.** La app mezcla español e inglés **a propósito** según la
  pantalla: la sesión muestra español (principal) + inglés (secundario), y la card del Programa
  muestra el nombre **en inglés**, porque el nombre estándar de Garmin es el que sirve para buscar
  el ejercicio **en el reloj**. Si ves `garminName` sin pasar por `exerciseNameEs`, **no lo
  "arregles"**: está así queriendo (confirmado por el owner el 2026-07-19, después de que un plan
  lo propusiera como fix).
- **El catálogo de ejercicios es AUTO-GENERADO.** `shared/src/catalog/exercises.data.ts` se regenera
  con `bun run shared/scripts/generate-catalog.ts`. **Nunca editarlo a mano**: un fix a mano se pierde
  en la próxima regeneración, y eso ya pasó (§0-ANTES-HOY). Para forzar un ejercicio usar `MUST_INCLUDE`;
  para corregir su equipamiento, `MUST_EQUIPMENT`. Las traducciones (`exercises.es.ts`) SÍ son a mano
  y están separadas a propósito. Tras regenerar: revisar el equipamiento de los nuevos y que no se
  haya perdido ningún id congelado (`catalogIds.frozen.ts`).

## 7. Gotchas de tooling (ya resueltos)

- **Bun + jest + RN:** `jest` pinneado a 29; `transformIgnorePatterns` al store de Bun. Correr jest
  **`--runInBand`** (en paralelo, timeouts flaky). Tests en `mobile/__tests__/`, NUNCA en `mobile/app/`.
- **Worktrees no comparten `node_modules`** → `bun install --force` en cada worktree nuevo antes de tests/eas.
- Tests que importan `expo-router` → `jest.mock`; vars dentro de `jest.mock()` con prefijo `mock`.
- **`zod` no resuelve desde `mobile/`** (layout del store de Bun) → validar con `WorkoutSessionSchema.safeParse`, no `import { z }`.
- **Android bloquea HTTP cleartext** en release. Ahora la app va por HTTPS (`usesCleartextTraffic:false`
  en vc7). Si se necesita apuntar a un backend LAN `http://` en dev, hay que volver a poner `true` + rebuild.
- **Backend requiere `INVITE_CODE`** (auth) al boot → está en `app.env` de la Pi.
- `z.string().uuid()` de zod 4 exige UUID RFC 4122 válido (los ids de sesión son v4 de `expo-crypto`).
- **El SDK de Garmin descarta en silencio los campos que no reconoce.** Hay que pasarle
  `read({ includeUnknownData: true })` para que exponga los de clave numérica (`135`, `136`, `143`, `144`).
  **`143` es Body Battery** (decrece de forma monótona durante la sesión); `144` duplica `heartRate`.
  Se guardan crudos, **sin interpretar**. Y el `Encoder` del SDK **no puede sintetizarlos** (resuelve por
  nombre de perfil), así que esa cobertura se testea contra records armados a mano.
- **Las zonas de FC del `.FIT` NO están alineadas índice a índice.** `secondsPerZone` tiene 2 entradas
  más que zonas (la 0 es "por debajo de Z1", la última "por encima") y `hrZoneHighBoundary` tiene 1 más
  (termina en la FC máx). La zona `n` (1-based) usa `secondsPerZone[n]` y va de `highBoundary[n-2] ?? 0`
  a `highBoundary[n-1]`. Mapearlos 1:1 inventa una Z0 y una Z6 y corre cada rango un escalón.
  Ver `buildZoneRows` en `mobile/app/actividad.tsx` (exportada y testeada).
- **`timeInZoneMesgs` trae DOS entradas** (una por `session`, otra por `lap`): filtrar por
  `referenceMesg === "session"`, no tomar `[0]`.
- **El `.FIT` trae su propia zona horaria** (`activityMesgs.localTimestamp − timestamp`). Para cardio se
  usa ésa y NO el offset del cliente: sigue siendo correcta aunque importes desde otro huso.
- **`LineChart` renderiza "Sin datos todavía." con `data` vacío** → no montarlo para canales sin datos,
  en vez de dejar ese texto suelto.

## 8. Backlog (pendientes / ideas)

> ⚠️ **Muchos ítems de abajo ya están HECHOS** (C5 entero, sub-proyecto C, memoria del atleta v1, %
> cumplimiento, sugerencia de peso, C6/entreno puntual **expandido**, sub-proyecto B/BLE, feature de
> **updates in-app**, **generación async**, **auth multi-usuario + exposición a internet**). **El estado
> real 2026-07-09 está en §0b** — esta lista quedó desactualizada; usar §0b como fuente de verdad.

- **[Sub-proyecto B — HECHO ✓]** HR en vivo por banda BLE (perfil estándar 0x180D), avg/max por
  serie. Verificado en dispositivo (preview build + banda Polar/Garmin).
- **[Backlog B]** curva de HR completa (serie temporal), HRV/RR por PMD Polar (dominio estrés),
  marca de calidad de cobertura del dato. Ver spec 2026-07-03-hr-ble-banda-design.md §9.
- **[Polish pass + Sesión v2 — HECHO ✓ en `main`]** (#47, + fixes de review en #49). Polish: permiso
  BLE runtime automático; escaneo con feedback/timeout; ⚙ Configuración al header; íconos de tabs; sin
  botón "Copiar a Garmin". Sesión v2: ejercicio activo explícito + lista con ✓; botones ±1/±5 reps;
  rótulos Peso(kg)/RPE; descanso con cuenta regresiva + campana; **Cancelar** con confirmación.
- **[Sub-proyecto C — experiencia de sesión y post-entrenamiento]** (orden acordado):
  - **C2 — Resumen post-entrenamiento — HECHO ✓ en `main`** (#48): `src/session/summary.ts` (puro) +
    `components/SessionSummary.tsx`. Tiempo/work/rest, % cumplimiento, series/reps/volumen, carga,
    avg/max HR, por músculo, tabla por serie. (El % NO está en la lista del historial todavía — la
    proyección liviana no lo trae; incremento chico de backend si se quiere.)
  - **C3 — Mapa corporal — HECHO ✓ en `main`** (#55): `src/session/muscleMap.ts` (puro, `MUSCLE_MAP`
    `Record<MuscleGroup,…>` exhaustivo sobre los **12** grupos — ojo `forearms`) + silueta con
    `react-native-body-highlighter`/`react-native-svg` dentro del `SessionSummary` (reemplaza la lista
    "por músculo"). Nativo → requiere nuevo preview build para verlo.
  - **C1 — Pausar + indicador global — HECHO ✓ en `main`** (#56): Pausar/Reanudar (el timer no cuenta
    el descanso; el countdown respeta la pausa vía `restRemainingRef`), estado en `storage/pauseState.ts`,
    banner global `components/SessionIndicator.tsx`. (Cancelar la sesión ya estaba en Sesión v2.)
  - **C4 — Historial — HECHO ✓ en `main`** (#50) + **eliminar HECHO ✓** (#52). Lista → tap → resumen.
    Backend `GET /sessions` (liviano) y `GET /sessions/:id` (completo). ⚠️ Fix del cartel "No se pudo
    eliminar" SIN commitear (ver §0b).
  - **C5 — Notas de sesión → IA**: espacio de anotaciones por sesión (el campo `notes` de
    `WorkoutSession` ya existe, sin UI). Las notas recientes deben **alimentar la generación** del
    próximo plan (backend incluye notas + datos reales en el prompt de Claude). Se solapa con el
    ítem de backlog "[PT agent] entrenador conversacional". Toca mobile + backend.
  - **C6 — Entrenamiento puntual (one-off)**: generar un entreno de **un día** eligiendo músculos +
    gym/casa (mismo cuestionario de equipo), **sin tocar el plan vigente**. Para viaje/vacaciones.
    Nuevo flujo/endpoint de generación acotado. Toca mobile + backend.
- **[Deployment] CI para la Pi**: `deploy.yml` (self-hosted runner en `/home/kilo/actions-runner`,
  deploy en push a `main`) + `ci.yml`. Hoy el deploy es **manual** (rsync + `docker compose up -d --build`).
- **[Deployment] Backup de la DB de Pulsia a la pi-respaldo** (pedido del usuario, sin apuro): job
  cron con `pg_dump` → comprimir → `rsync/scp` a la pi-respaldo, con rotación (tipo `nc-db-backup`).
- **[Integración Garmin] Ingesta de datos pasivos**: sueño, composición corporal (balanza Index),
  HRV, FC en reposo, **estrés** → Garmin Health API (OAuth; ⚠️ requiere aprobación del programa dev).
  Alternativa: import `.FIT`. Transversal a entrenamiento/estrés/estado holístico.
- **[Integración Garmin] Empujar workouts (Training API)**: el botón "Copiar a Garmin" (copiaba
  nombres al portapapeles) **se elimina** — Garmin Connect NO permite pegar/importar un entreno, así
  que no servía. El camino real para mandar el programa al reloj es la **Garmin Training API** (OAuth
  + aprobación del dev program). Proyecto aparte, v-next.
- **[FEATURE] Sugerencia de peso inicial por ejercicio**: sobre el historial de kg reales (depende
  del registro A). v1 regla determinista → v2 contexto (RPE/descanso) → v3 IA.
- **[PT agent] Entrenador conversacional** sobre Claude: ajusta el plan según sesiones reales,
  sugiere pesos, responde técnica. Se apoya en A + Garmin. v-next.
- **[Memoria del atleta — NORTE DE PRODUCTO]** La IA debe **construir y persistir en la DB una
  "memoria" evolutiva de la persona** (no el perfil estático): acumular conocimiento real del atleta
  a partir de notas + rendimiento + Garmin, **actualizarla con el tiempo** y usarla en cada generación,
  para tener conocimiento real de la persona. La app debe tener un **botón/pantalla para que el usuario
  vea esa memoria** ("qué sabe la IA de mí"). **C5 (notas + rendimiento reciente → prompt) es el primer
  paso** hacia esto; la memoria persistente/resumida es el sub-proyecto siguiente (tabla de memoria +
  proceso de actualización/summarización periódica + UI de lectura). Se solapa con [PT agent].
- **[Comidas]** dominio 2 del roadmap: registrar alimentación con foto + IA.
- **[Estrés]** dominio 3: meditación/respiración + métricas de estrés de Garmin.
- **[Backend] Generación async/streaming**: hoy síncrona ~130-150s. Spec escrito
  (`docs/.../specs/2026-07-01-generacion-async-jobs-design.md`) — jobs persistidos + polling + barra
  por tiempo. Rama local `docs/generacion-async-spec` (sin PR).
- **[Auth] Mobile de auth**: login/registro (con `INVITE_CODE`), token en secure-store, navegación
  gateada → apaga `SINGLE_USER_MODE`. Spec `2026-07-01-auth-multiusuario-design.md`.
- **[Backend] max_tokens/nº de semanas configurable** en el perfil.
- **[UX] Feedback al guardar perfil** ("Perfil guardado ✓"). **[Cosmético] Ícono/logo** (hoy
  placeholder de Expo).
- ~~**[Fase 4] Detalle de ejercicio** (imágenes free-exercise-db + cues)~~ → **REEMPLAZADO**. La
  feature sigue viva (spec `2026-07-18-gifs-ejercicios-design.md`, §0-ANTES-HOY) pero **`free-exercise-db`
  quedó DESCARTADA**: sus imágenes son scrapeadas y su licencia no es válida. No usarla.
- **[Datos ambientales]** temp/humedad/presión/luna por sesión → estudio de rendimiento (merece spec).
- **[Historial visual — heatmap anual]** Grilla estilo "contribuciones de GitHub": todos los
  entrenamientos realizados **por año**, con **selector de año**. Cada celda = un día; intensidad por
  volumen/series (o simplemente hecho/no). Vista de la constancia de un vistazo. (Pedido del usuario
  con captura de referencia.)

## 9. Deployment en la Pi (HECHO — deploy manual v1)

La Pi es `nextcloud` en `~/.ssh/config` (`ssh nextcloud`, aarch64, user `kilo`, Docker 29 + Compose v5,
SSH por on-disk keys). Corre apps como docker-compose en `/home/kilo/<app>/`. Tiene un GitHub Actions
self-hosted runner (`/home/kilo/actions-runner`).

**Pulsia desplegado en `/home/kilo/pulsia/`:**
- `deploy/docker-compose.yml`: `backend` (build `backend/Dockerfile`, Bun arm64, **usuario no-root**)
  + `db` (pgvector, healthcheck, volumen `deploy_pulsia_pgdata`, 5432 NO expuesto). Publica **`3011`**.
- `deploy/app.env` (solo en la Pi, no versionado): `DATABASE_URL` (host `db`), `ENCRYPTION_KEY`
  (`openssl rand -hex 32`), `PORT=8787`, `INVITE_CODE`, **`SINGLE_USER_MODE=false`**,
  **`ANTHROPIC_API_KEY`** (key del server, fallback si el usuario no cargó la suya), **`ADMIN_TOKEN`**
  (para `PUT /app/latest`). Cada usuario puede overridear su key de IA desde la app (encriptada en la DB).
- **Deploy: automático** en push a `main` (`.github/workflows/deploy.yml`, runner self-hosted en la Pi).
  Manual (fallback): `rsync` del repo (sin `mobile`/`node_modules`, sin pisar `app.env`) →
  `cd ~/pulsia && docker compose -f deploy/docker-compose.yml up -d --build`. El contenedor auto-migra.
- La DB es **separada de la de Nextcloud** (esa es MariaDB `nextcloud-db-1`); Pulsia usa su propia Postgres.

**Exposición a internet (2026-07-09, HECHO):** el backend es público en
`https://pulsia.lahuelladelcaminante.de`. Patrón (reusa el de las otras apps de la Pi): **VPS** (`ssh vps`,
`187.33.155.194`, Ubuntu) corre **nginx** público (:80/:443) que hace `proxy_pass http://10.8.0.2:3011`
(la Pi por **Wireguard**) + **HTTPS por certbot** (Let's Encrypt, auto-renueva) + `limit_req` en `/auth/`.
Site en `/etc/nginx/sites-available/pulsia.lahuelladelcaminante.de` en el VPS. **Firewall de la Pi**:
`/usr/local/sbin/wg0-firewall.sh` (systemd `wg0-firewall.service`) permite wireguard solo a los puertos
`3006:3011` (se extendió de `3006:3010` para incluir el 3011 de Pulsia; persiste en reboot). DNS:
`pulsia.lahuelladelcaminante.de` → `187.33.155.194` (en clouding.io). La app usa esa URL HTTPS por default.
(Quedó `so_keepalive=20s` en el listen 443 y un `pulsia_timed.log` — instrumentación de diagnóstico, inofensivos.)

## 10. Índice de docs

- Specs (`docs/superpowers/specs/`): los viejos (generador, app-mobile, auth-multiusuario, registro) +
  los de esta sesión: **`2026-07-05-app-updates-design`**, **`2026-07-06-oneoff-expanded-design`**,
  **`2026-07-07-multiuser-auth-design`**, **`2026-07-09-async-generation-design`**.
- Planes (`docs/superpowers/plans/`): los correspondientes (`2026-07-06-oneoff-expanded`,
  `2026-07-07-multiuser-auth`, `2026-07-09-async-generation`, etc.). `docs/deploy-ci-setup.md` = setup del
  runner de auto-deploy.

## 11. Memoria persistente (fuera del repo)

`~/.claude/projects/-Users-kilo-desarrollo26-pulsia/memory/` → `MEMORY.md` (índice). Revisar al arrancar:
`workflow-prs-coderabbit` (PRs + CodeRabbit), `execution-subagent-driven`, `product-roadmap`
(entrenamiento → comidas → estrés → estado holístico), `coderabbit-rate-limits`, `athlete-ai-memory`
(norte: memoria evolutiva del atleta), `code-review-polling` (timer + escalar a `@claude` + severidad),
`autonomous-deploy-boundary`, **`multiuser-auth-status`** (estado del multi-usuario + exposición + async
+ el bug de `/sessions`), **`local-android-build`** (build offline gratis + gotcha de red de eas-cli),
**`update-feature-status`** (APK vc4→vc7, OTA, `/app/latest`).
