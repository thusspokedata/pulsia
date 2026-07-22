# El cardio entra a Progreso: de minutos a gasto calórico — Diseño

**Fecha:** 2026-07-22
**Rama:** `feat/gasto-por-dia-progreso` (desde `main` tras #179)
**Dominio:** 3 — Progreso/Salud (con efecto en 2 — Nutrición)

## Objetivo

Reporte del usuario: *"la app en la parte de 'días entrenados' y 'tiempo por día (últimas 4
semanas)' no está contemplando el tiempo entrenado que es subido a través de los archivos .fit"*.

Es correcto, y el hueco es más ancho que lo reportado.

### El problema

Las dos secciones del tab Progreso se alimentan **solo** de `sessions`
([`progreso.tsx:394`](../../../mobile/app/(tabs)/progreso.tsx) y
[`progreso.tsx:402`](../../../mobile/app/(tabs)/progreso.tsx)), que viene de `getSessions` →
tabla `workout_session`, **100% fuerza**. Las actividades de cardio viven en `cardio_activity`
y se traen con `listCardio`, que esa pantalla nunca llama.

Es residuo histórico: el heatmap es de la sesión del 2026-07-10 (#93, "Mobile-only, datos de
`GET /sessions`") y el dominio cardio llegó una semana después (#141/#149/#152/#154).

**La app hoy se contradice a sí misma:** el Historial **sí** une las dos fuentes
([`historial.tsx:50`](../../../mobile/app/(tabs)/historial.tsx) usa
`buildTimeline(sessions, cardios)`), así que la misma caminata aparece en el Historial y no
existe en "Días entrenados".

### Por qué no alcanza con sumar los minutos

Sumar cardio a la escala actual de minutos rompe el significado del color. `levelFor`
([`heatmap.ts:18`](../../../mobile/src/session/heatmap.ts)) pinta el nivel máximo a partir de
**90 minutos**: con fuerza eso es una sesión dura, pero una caminata tranquila de dos horas
también llegaría al nivel 4 y se vería **más intensa** que una sesión de pesas de 50 minutos.

**Decisión del owner: el color pasa a medir gasto calórico, no tiempo.** Justificación del
owner: entrena siempre con banda de pulso o transmitiendo FC desde el Garmin, y las actividades
que la app no contempla las toma del reloj — o sea que sus kcal están bien medidas.

## Alcance

- **Pieza A** — Progreso pasa de minutos a gasto, incluyendo cardio. Solo móvil.
- **Pieza B** — corregir el doble conteo del BMR en las kcal del reloj. En `shared/`, con
  efecto en Progreso **y** en Nutrición.
- **Fuera de alcance (Pieza C, spec propio):** que `buildProgressSummary`
  ([`backend/src/ai/progress.ts`](../../../backend/src/ai/progress.ts)) incluya el cardio. Hoy
  **la IA no sabe que el usuario corrió** al generar el próximo programa ni al refrescar la
  memoria del atleta. Toca el prompt de generación y merece su propio spec. Anotado en §8 del
  ONBOARDING.

---

## Pieza A — Progreso pasa de minutos a gasto

### A.1 Reusar `dayExerciseBurn`, no escribir lógica nueva

`shared/src/nutrition/exerciseBurn.ts` **ya resuelve** "cuánto gastó esta persona hoy entre
fuerza y cardio". Su comentario lo dice explícitamente:

> Gasto del día = fuerza + cardio. Única fuente del gasto de ejercicio: dos funciones que suman
> gasto es cómo la pantalla y los informes terminan discrepando.

Reusarla no es solo menos trabajo: es la garantía de que el número de Progreso **coincida** con
el "Ejercicio" que ya muestra Nutrición. Dos cifras distintas para el mismo día en dos pantallas
sería un bug de cara al usuario.

### A.2 `mobile/src/session/dailyBurn.ts` (nuevo, puro)

```ts
export interface DayBurn {
  kcal: number;          // total del día (fuerza + cardio)
  strengthKcal: number;
  cardioKcal: number;
  minutes: number;       // se conserva: el desglose al tocar lo muestra
}

export function buildDailyBurn(
  sessions: { startedAt: number; totalDurationMs: number | null; avgHr: number | null }[],
  activities: CardioActivity[],
  athlete: AthleteBurnArgs,
): Map<string, DayBurn>   // clave = dateKey (fecha LOCAL)
```

Agrupa por `dateKey` (fecha local, igual que hoy) y usa **los mismos primitivos** que consume
`dayExerciseBurn`: `estimateSessionBurn` y `estimateCardioBurn`.

**Invariante con test:** para cualquier input, `buildDailyBurn(...).get(d).kcal` debe dar
**exactamente** `dayExerciseBurn(sessionsDeEseDía, cardioDeEseDía, athlete)`. Se sostiene porque
`burnFrom` redondea por ítem antes de sumar, así que sumar por ítem y sumar el total dan lo
mismo. Si alguien toca una función y no la otra, el test se pone en rojo.

### A.3 Niveles por percentil sobre todo el historial

**Decisión del owner: escala relativa al propio historial**, no umbrales fijos.

```ts
export function burnThresholds(allDayKcal: number[]): [number, number, number]
```

Cuartiles sobre **todos los días con gasto > 0 de todo el historial** — no por año mostrado.

**Por qué todo el historial y no por año:** con percentiles por año, el mismo día cambia de
color al cambiar de año en el selector, y dos años dejan de ser comparables entre sí. Un heatmap
anual existe justamente para comparar; una escala que se mueve por año lo vuelve engañoso.

**Fallback:** con menos de **20 días** registrados los cuartiles son inestables (un mes flojo
pinta días normales de oscuro). Por debajo de ese umbral se usan cortes fijos de **200 / 400 /
600 kcal**, calibrados sobre una sesión típica (~30 min de fuerza ≈ 200 kcal netas, ~1 h ≈ 400,
día fuerte > 600).

**Efecto conocido y aceptado:** la escala se recalibra al acumular datos, así que un día bueno
de hace un año se aclara con el tiempo. Es el costo de la escala relativa; el owner lo eligió
sabiéndolo.

### A.4 Cambios en `heatmap.ts` y las barras

- `buildYearHeatmap` recibe el `Map<string, DayBurn>` + los umbrales, en vez de `sessions` y la
  escala de minutos hardcodeada. `HeatmapCell` pasa a llevar `kcal` además de `minutes`.
- `availableYears` recibe **sesiones + actividades**. Sin esto, un año con solo caminatas no
  aparece en el selector: el año existe en los datos pero es inalcanzable desde la UI.
- `buildDailyMinutes` (`weeklyBars.ts`) pasa a devolver kcal por día.

### A.5 Tocar una celda muestra el desglose

**Decisión del owner:** la grilla **no** distingue el tipo con color ni con marcas. El color
sigue significando una sola cosa (gasto) y el desglose aparece al tocar.

Se descartó pintar por tipo: tres familias de color × 4 niveles = 12 tonos en celdas de ~10 px,
ilegible y sin un color obvio para los días mixtos.

Al tocar, debajo de la grilla aparece una línea con: fecha, kcal totales, cuánto de fuerza y
cuánto de cardio, y minutos. **Sin modal.** Tocar la misma celda de nuevo la deselecciona.

Como las celdas son de ~10 px, el área táctil necesita `hitSlop` para ser usable con el dedo.

### A.6 Perfil incompleto — el modo de falla que este cambio introduce

**Este es el riesgo principal de la Pieza A.**

`estimateSessionBurn` devuelve `{ kcal: 0, method: "none" }` si falta el peso
([`exerciseBurn.ts:39`](../../../shared/src/nutrition/exerciseBurn.ts)). Hoy el heatmap funciona
con solo `startedAt` y `totalDurationMs` — **no necesita perfil**. Al pasar a kcal, un usuario
sin peso/edad cargados vería **la grilla entera vacía** donde antes veía sus días entrenados.

No es hipotético: la app es multi-usuario y la familia del owner (Argentina) probablemente no
tiene el perfil completo. Sería una regresión para ellos.

**Solución:** si el perfil está incompleto, las dos secciones muestran
*"Completá tu peso y edad en el perfil para ver el gasto"* con acceso directo al perfil, en vez
de una grilla vacía que se lee como un bug. Con test.

### A.7 Wiring en `progreso.tsx`

La pantalla necesita cargar dos cosas que hoy no carga: `listCardio` y el perfil + BMR. El
patrón ya existe en [`useNutritionDay.ts:66`](../../../mobile/src/nutrition/useNutritionDay.ts)
(perfil local + `getNutritionGoal` → `bmrForBurn`) y se sigue tal cual.

### A.8 Títulos

**Decisión del owner:** el heatmap pasa a **"Días entrenados y gasto"**; las barras, a
**"Gasto por día (4 sem)"**.

Se descartó usar la misma frase larga en las dos: dos tarjetas seguidas con título idéntico no
se distinguen, y en 320 px esta app ya tuvo texto cortándose.

---

## Pieza B — el doble conteo del BMR en las kcal del reloj

### B.1 El problema

El cuerpo quema ~1700 kcal/día (~1,2 kcal/min) solo por estar vivo. Hay dos formas de contestar
"cuánto quemé entrenando":

| | Qué mide | Caminata de 2 h |
|---|---|---|
| **Bruto** | Todo lo quemado durante esas 2 h | 600 kcal |
| **Neto** | Lo *extra* respecto a no haber ido | 600 − 142 = **458 kcal** |

**Para nutrición el correcto es el neto**, porque la meta diaria ya incluye el BMR de las 24 h.
Contar el BMR de esas 2 h otra vez como "gasto de ejercicio" lo cuenta **dos veces** y habilita
a comer kcal que no se ganaron.

Hoy las dos ramas no coinciden:

- **Fuerza:** `estimateSessionBurn` resta el BMR
  ([`exerciseBurn.ts:50`](../../../shared/src/nutrition/exerciseBurn.ts)) → **neto** ✓
- **Cardio del `.FIT`:** `estimateCardioBurn` devuelve las kcal del reloj **verbatim**
  ([`exerciseBurn.ts:69`](../../../shared/src/nutrition/exerciseBurn.ts)) → **bruto** ✗

Es preexistente: ya afecta al balance de Nutrición y, desde #179, también a la meta de carbos.
Pintar color con kcal simplemente lo vuelve visible.

### B.2 Paso 0 obligatorio: verificar antes de corregir

**Que el `total_calories` de Garmin sea bruto es una hipótesis, no un hecho verificado.**

Si el número del reloj ya fuera neto (Garmin distingue "Calories" de "Active Calories"),
restarle el BMR crearía un bug nuevo en la dirección contraria — subcontaría el gasto.

### RESULTADO (2026-07-22): CONFIRMADO — el reloj reporta bruto

**La verificación empírica que este spec proponía NO sirvió.** Comparar las kcal del reloj contra
Keytel/MET da resultados contradictorios: contra Keytel el reloj queda siempre por debajo
(compatible con neto), contra MET queda muy por encima en elíptica (compatible con bruto). Las dos
referencias son demasiado ruidosas para arbitrar — Keytel sobreestima a FC alta y el MET 5,0 de
elíptica es bajo para FC 150+. **Error de diseño de este spec: se propuso validar una hipótesis
contra una fórmula que no es lo bastante confiable para ser referencia.**

Lo que sí lo resolvió fue la documentación del propio Garmin y el comportamiento de terceros que
importan sus datos:

- Garmin define **Total Calories = Active + Resting**, y las calorías que muestra una **actividad**
  incluyen el metabolismo basal de ese intervalo.
- **Cronometer**, que importa actividades de Garmin, resta el basal explícitamente: *"Cronometer
  imports active calories only. Which are activity − BMR."* En su ejemplo documentado, Garmin
  reporta 638 kcal y Cronometer registra 517.

Contra los datos reales del owner el ajuste da valores plausibles: una caminata de 61 min a FC 79
pasa de 187 kcal a ~117 netas (1,9 kcal/min), coherente con 3 km en una hora.

**Matiz aceptado:** Garmin usa **RMR**, no BMR, y el RMR es algo mayor. Restar el BMR de
Mifflin-St Jeor (el que ya calcula `computeNutritionGoal`) **sub-resta levemente**. Es una
aproximación deliberada: introducir una estimación de RMR aparte agregaría una constante inventada
para corregir un sesgo de segundo orden.

→ **Se aplica B.3.**

### B.3 La corrección (condicionada a B.2)

`estimateCardioBurn` resta el BMR proporcional también en la rama `device`:

```ts
if (a.kcal != null) {
  const minutes = a.durationMs / 60000;
  const kcal = athlete.bmr != null
    ? Math.max(0, a.kcal - (athlete.bmr / 1440) * minutes)
    : a.kcal;
  return { kcal: Math.round(kcal), method: "device" };
}
```

**Efecto declarado:** baja el restante de kcal y la meta de carbos del usuario en los días que
importa del reloj. Es intencional — el owner lo aprobó sabiendo que cambia sus números.

**Se conserva `method: "device"`.** Sigue siendo el dato del reloj, solo ajustado a la misma
base que la fuerza. Cambiarlo a `"hr"`/`"met"` mentiría sobre el origen del dato.

**El `Math.max(0, ...)` no es defensivo por gusto:** §0-BARRAS documenta que `estimateCardioBurn`
puede propagar kcal negativas del `.FIT` verbatim. Sin el clamp, una actividad corta con kcal
bajas podría dar negativo y **restarle meta al usuario**.

---

## Testing

**Verificación por mutación de cada test nuevo**, sin excepción — §6 del ONBOARDING, y las
lecciones de §0-BARRAS / §0-SEMAFORO / §0-AHORA sobre tests falsos nacidos en los planes.

Casos que deben existir:

1. **Invariante con `dayExerciseBurn`** (A.2): el total por día coincide exactamente. Mutación:
   cambiar el redondeo en `buildDailyBurn` debe romperlo.
2. **Un día con solo cardio produce celda con color.** Es el bug reportado; sin este test la
   feature entera puede no existir y la suite seguir verde.
3. **Un día con fuerza + cardio suma las dos.** Mutación: ignorar una de las dos fuentes.
4. **`availableYears` incluye un año que solo tiene cardio.** Mutación: volver a la firma vieja.
5. **Umbrales: <20 días usa los fijos, ≥20 usa cuartiles.** Ambos lados del borde.
6. **Percentiles sobre todo el historial, no por año:** el mismo día debe dar el mismo nivel
   mirando 2025 o 2026. Mutación: calcular los cuartiles solo con los días del año mostrado.
7. **Perfil incompleto → mensaje, no grilla vacía** (A.6).
8. **B.3: kcal del reloj netas.** Con `bmr` presente el resultado baja; sin `bmr` queda igual.
   Y el clamp: kcal del reloj menores al BMR del intervalo dan 0, nunca negativo.

**Riesgo de test falso identificado de antemano:** el caso 3 (fuerza + cardio) pasa igual si se
suma dos veces la misma fuente, siempre que los valores de fixture coincidan. Los fixtures deben
usar **valores distintos** para fuerza y cardio, y la aserción mirar el desglose
(`strengthKcal`/`cardioKcal`), no solo el total.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Perfil incompleto vacía la pantalla (A.6) | Mensaje explícito + test |
| B.3 cambia los números de Nutrición que el owner ya usa | Declarado y aprobado; test de regresión que fija el nuevo comportamiento |
| La hipótesis de B.2 es falsa → se introduce un bug nuevo | B.2 es bloqueante: sin confirmar, B.3 no se aplica |
| La escala relativa se recalibra sola con el tiempo | Aceptado por el owner; fallback fijo bajo 20 días |
| Divergencia futura entre Progreso y Nutrición | Test de invariante (A.2) |

## Pendiente del owner (post-merge)

1. **Ver el heatmap en el teléfono** con un año que mezcle fuerza y cardio, y confirmar que la
   escala relativa se lee bien.
2. **Confirmar el área táctil** de las celdas: ~10 px con `hitSlop` nunca se midió en device.
3. **Decidir la Pieza C** (que la IA vea el cardio) — spec propio.
