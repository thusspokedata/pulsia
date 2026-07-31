# Cobertura de micros por período: comida vs suplemento

> Spec de diseño. Fecha: **2026-07-31**. Estado: **aprobado por el owner**, listo para plan.

## 1. La idea

El owner quiere, **semanal / quincenal / mensualmente**, un resumen **en gráficos** que muestre, para
cada vitamina y mineral:

- cuáles cubre **bien desde la comida**,
- cuáles cubre **solo gracias a la ayuda del suplemento**,
- cuáles **no cubre** ni con suplemento.

El objetivo (su norte): **aprender a comer para ir dejando la suplementación**. El resumen tiene que
hacer visible *qué micro trabajar desde la dieta*, y medir si esa dependencia del suplemento baja con
el tiempo.

Disparador textual: *"me gustaría semanal, quincenal y mensualmente un resumen (en gráficos) que me
muestre qué vitaminas y minerales he cubierto bien desde lo alimenticio, cuáles han sido cubiertas
gracias a la ayuda de suplementos… y así ajustar la alimentación. La idea es que al aprender a comer,
ir dejando de usar suplementación."*

### 1.1 Idea hermana, DIFERIDA (no entra en este spec)

En el mismo mensaje el owner planteó una segunda idea: un sector de **"reservas"** — si un día cubre
la Vitamina D al 2500 %, no necesitaría tomarla por varios días. Se **difirió** en el brainstorming
porque:

- El "banqueo" solo es real para **liposolubles (A, D, E, K) + B12**; las hidrosolubles (C y las B
  salvo B12) casi no se almacenan y "tomé 300 % hoy → salteo mañana" es **falso** para ellas.
- El modelo de datos **no** tiene vidas medias, límites superiores (UL) ni distinción
  liposoluble/hidrosoluble.
- "Salteá Vitamina D 12 días" es **dosificación** (consejo médico cuantitativo), terreno que la app
  evita por diseño (es no-diagnóstica).

Queda para otra sesión, probablemente como "promedio móvil multi-día vs referencia" y/o una "reserva
estimada" claramente etiquetada, restringida a liposolubles. **Este spec cubre solo el resumen
periódico comida-vs-suplemento.**

## 2. Decisiones del owner (cerradas en el brainstorming)

| Decisión | Resolución |
|---|---|
| **Dónde vive** | **Bloque nuevo en la pantalla de Informes** (`mobile/app/nutricion/informes.tsx`), arriba del texto del agente IA. Reusa el selector de período (Semana/Quincena/Mes) que ya existe ahí. |
| **Con o sin IA** | **Sin IA.** El bloque es **determinístico e instantáneo**: se calcula del range de comida + suplemento. No se mete detrás del botón "generar informe" (que sí cuesta tokens). |
| **Layout** | **Cabecera "C" + detalle "A" al desplegar.** Cabecera: dona de los 3 estados + métrica del norte + mini-gráfico de evolución. Detalle (colapsable): barras por micro agrupadas por estado. |
| **Métrica del norte** | **"% de micros cubiertos solo con comida"**, con **delta vs el período previo** y un **mini-gráfico de evolución** de esa métrica en los últimos ~8 períodos del tipo elegido. |
| **Tendencia** | Se computa **al vuelo** desde una ventana de días agrupada por período — **sin persistir** una serie histórica. |
| **Qué micros entran** | Solo los de **piso** (ver §3). Los de **techo** (sodio, azúcar, saturadas, colesterol) NO. |
| **Drill-down** | Tocar un micro abre la pantalla que **ya existe** (`nutricion/nutriente.tsx`): su evolución + "alimentos con más X". No se construye nada nuevo ahí. |

## 3. Alcance de nutrientes: solo pisos

"Cubrir" solo tiene sentido para un **piso a alcanzar**, no para un límite a no pasar. El bloque
incluye exactamente los nutrientes con referencia `kind: "min"`:

- **14 vitaminas** (A, B1, B2, B3, B5, B6, B7, B9, B12, C, D, E, K, colina) — referencia vía
  `referenceFor` (EFSA, `shared/src/nutrition/references.efsa.ts`).
- **8 minerales**: calcio, hierro, magnesio, yodo, fósforo, potasio, selenio, zinc — misma fuente.
- **Fibra** (`fiber_g`) — piso vía `NUTRIENT_REFERENCES` (30 g) / `NUTRIENT_REFERENCE_KIND`.

**Excluidos** (son techos, o no tienen piso transcribible):
- **Sodio/sal, azúcares, grasas saturadas, colesterol** → `kind: "max"`. Ya viven en el semáforo y el
  diario; meterlos acá sería contradecir su semántica.
- Omega-3/6 → EFSA no da un gramaje de piso → sin referencia → fuera.

> ⚠️ **Piso sin referencia por perfil.** `referenceFor` puede devolver `null` para un nutriente con un
> perfil dado. Algunos (B1, B3) son **proporcionales a la energía** y hoy devuelven `null` sin la meta
> de kcal. Un nutriente **sin referencia numérica** para el usuario **no se clasifica** (no cuenta en
> la dona ni en el denominador del %): no se puede decir "cubierto" sin un piso contra el cual medir.
> Se listan aparte como "sin referencia" o simplemente se omiten (decidir en el plan; preferencia:
> omitir del bloque, para no ensuciar la métrica del norte).

## 4. La lógica de clasificación

Para el período elegido, por cada nutriente de §3:

1. **Promedio diario de comida** `foodAvg` = suma de los totales diarios de comida ÷ **días con
   registro de comida** (misma convención que `dailyNutrientSeries.average`, que promedia sobre los
   días CON dato, no sobre el calendario).
2. **Promedio diario de suplemento** `suppAvg` = ídem, desde el aporte por-día de las tomas.
3. **Referencia** `ref` = `referenceFor(key, person)` (personalizada por sexo/edad del perfil).

Estado del nutriente (con **banda de tolerancia del 10 %**: `>= 0.9 * ref` cuenta como alcanzado):

| Estado | Regla | Color | Significado |
|---|---|---|---|
| 🟢 **Desde la comida** | `foodAvg >= 0.9 * ref` | teal | bien cubierto comiendo; no necesita suplemento |
| 🟣 **Gracias al suplemento** | `foodAvg < 0.9 * ref` **y** `foodAvg + suppAvg >= 0.9 * ref` | violeta | **candidato a mejorar la dieta** |
| 🔴 **Sin cubrir** | `foodAvg + suppAvg < 0.9 * ref` | rojo | falta real, ni con suplemento |
| ⚪ **Pocos datos** | `< D` días con dato para ese nutriente en el período | gris | *falta de dato*, no de ingesta |

### 4.1 Honestidad del dato (importa)

- **"X de N días registrados"** siempre visible en la cabecera (N = días del período; X = días con
  cualquier registro de nutrición). Con pocos días registrados el promedio es poco confiable y el
  usuario tiene que saberlo.
- **`null` ≠ 0.** Muchos alimentos no declaran cada micro; un día sin ningún ítem que declare, p.ej.,
  Vitamina K **no aporta un punto** para K (misma regla que `dailyNutrientSeries`). Un nutriente con
  **menos de `D` días con dato** cae en **"pocos datos"** (gris), NO en "sin cubrir": no confundir
  *no sé* con *no comí*. Valor de `D` a fijar en el plan (propuesta: `D = max(3, ceil(N/4))`).
- El aporte de suplemento sí es "dato" aunque no haya comida (lección de #192: `value: null` de comida
  no debe esconder un `suppAvg > 0`).

## 5. La métrica del norte + evolución

- **`onlyFoodPct`** del período = (nº de nutrientes en estado 🟢 "Desde la comida") ÷ (nº de nutrientes
  **clasificables**, es decir con referencia y con dato suficiente). Es el número grande de la
  cabecera: sube a medida que el usuario depende menos del suplemento.
- **Delta** vs el período inmediatamente previo del mismo tipo (`▲ 6 pts` / `▼ …`).
- **Mini-gráfico de evolución**: `onlyFoodPct` de los últimos **~8 períodos** del tipo elegido
  (8 semanas / 8 quincenas / 8 meses), dibujado con el `LineChart` que ya usa `nutriente.tsx`. Un
  período con **muy pocos días registrados** se omite del punto (o se marca) para no meter ruido.

## 6. UI / componentes

Orden vertical del bloque (ver mockup `assembled.html` del brainstorming):

1. **Selector de período** — el `ChipGroup` que ya existe en `informes.tsx` (Semana/Quincena/Mes). El
   bloque respeta el `kind` + `offset` actuales de la pantalla. *(El "Día" del selector de informes
   no aplica al bloque de cobertura — decidir en el plan: ocultar el bloque en modo diario o mostrar
   el día como período de 1.)*
2. **Título + "X de N días registrados".**
3. **Dona** de los 3 estados (conteo por estado). Colores: teal/violeta/rojo; "pocos datos" en gris,
   fuera de la dona o como segmento tenue.
4. **Métrica del norte**: `onlyFoodPct` grande + delta + mini-gráfico de evolución (§5).
5. **Detalle por micro (colapsable, "A")**: barras horizontales agrupadas por estado. Cada barra
   escala a `ref` (100 %), con segmento comida (teal) + suplemento (violeta) + excedente (ámbar) y una
   **marca de referencia**. Reusa el lenguaje de `barSegments3` del diario. "Pocos datos" con barra
   tenue y etiqueta en vez de %.
6. Tocar un micro → `router.push` a `nutricion/nutriente.tsx` (ya existe).

**Reutilización:** colores/segmentos de `barSegments3`, `LineChart`, `foodsHighestIn` (en el
drill-down), `referenceFor`/`referencesFor`, `NUTRIENTS`/`nutrientsByGroup`. El componente del bloque
es nuevo pero se apoya en piezas existentes.

## 7. Datos / arquitectura

La matemática (clasificación + `onlyFoodPct` + serie de evolución) es **pura** y vive en **shared**,
para que backend/móvil/tests la compartan y no puedan contradecirse (mismo criterio que
`supplementMicros`). Firma tentativa (afinar en el plan):

```ts
// shared/src/nutrition/coverage.ts
coveragePeriod(perDayFood, perDaySupp, person, opts) -> {
  byNutrient: { key, foodAvg, suppAvg, ref, state, daysWithData }[],
  counts: { food, supplement, uncovered, fewData },
  onlyFoodPct: number | null,
  daysRegistered: number,
}
```

### 7.1 El hueco de datos: hace falta el aporte **por día**

- **Comida por día**: derivable en el **cliente** desde `useMealsRange` (los `meals` traen `eatenAt`),
  agrupando con la misma lógica de `dailyNutrientSeries`. ✅ sin backend nuevo.
- **Suplemento por día**: el endpoint actual `GET /nutrition/supplements/range-nutrients` devuelve
  **totales del rango** (`{ totals, byNutrient }`), **no por día**. Para el promedio diario correcto y
  para bucketear la evolución hace falta el aporte **por día**.

**Decisión de arquitectura (a confirmar en el plan):** agregar un endpoint
`GET /nutrition/supplements/range-nutrients-daily?from&to` (mismo guard ≤366 días) que devuelva
`{ perDay: { [YYYY-MM-DD]: SupplementNutrients } }`, reusando `takesWithComponents` +
`supplementMicros` día a día. La alternativa (bucketear en el cliente) no sirve: el cliente no tiene
las tomas crudas, solo el agregado.

- **Ventana de la evolución**: una sola llamada por la ventana completa (~8 períodos) de comida
  (`listMeals`) y de suplemento (endpoint nuevo), y se bucketiza en el cliente por `periodFor`. Acota
  el tamaño de fetch y respeta el guard de 366 días (8 meses < 366).

## 8. Qué NO entra (YAGNI)

- La **Idea 1** (reservas/carryover) — diferida (§1.1).
- Nutrientes de **techo** (sodio, azúcar, saturadas, colesterol).
- **IA** en el bloque (el texto IA del informe sigue aparte; este bloque es determinístico).
- **Persistir** la serie de evolución (se computa al vuelo).
- Recomendaciones de **cuánto** comer o **qué dejar de tomar** (dosificación).

## 9. Testing

- **shared** (`coverage.test.ts`): los 4 estados con la banda del 10 % en los bordes (89 % / 90 % /
  91 %); "pocos datos" vs "sin cubrir"; `onlyFoodPct` con denominador que excluye no-clasificables;
  `null ≠ 0` en comida sin esconder `suppAvg > 0`; promedio sobre días-con-dato, no calendario.
- **backend** (`supplements.test.ts`): el endpoint `range-nutrients-daily` — forma `perDay`, guard de
  366 días, 400 si `from > to`, aislamiento por usuario (404/vacío para otro usuario), planes
  archivados incluidos (lección de #192).
- **móvil**: el bloque clasifica bien con datos mixtos; "X de N días"; el toggle de detalle; el tap a
  un micro navega a `nutriente.tsx`; período con pocos datos degrada limpio.
- **La costura** ([[testear-la-costura]]): un test que corre el cliente que arma la ventana +
  bucketea + clasifica end-to-end, no solo las unidades puras.

## 10. Follow-ups (no bloqueantes)

- El texto del **agente IA** podría, más adelante, leer el mismo `coveragePeriod` y comentar en prosa
  "este mes cubriste B12 solo con el suplemento; probá con…" — reusando la función pura, sin recomputar.
- La **Idea 1** (reservas de liposolubles) como sesión aparte.
- Si `onlyFoodPct` resulta ruidoso mes a mes, evaluar una media móvil en la evolución.
