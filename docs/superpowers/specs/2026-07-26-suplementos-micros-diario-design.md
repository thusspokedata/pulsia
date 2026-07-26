# Suplementos: sus micros en el diario de nutrientes (en otro color)

> Spec de diseño. Fecha: **2026-07-26**. Estado: **aprobado por el owner**, listo para plan.

## 1. El problema

El diario de nutrientes del día (pestaña **Nutrientes**) suma **solo comida**. Se arma 100 % desde
los `meals`:

- Móvil: `buildNutritionDaySummary` (`mobile/src/nutrition/daySummary.ts`) → `buildDayNutrientRows`
  (`mobile/src/nutrition/dayNutrientRows.ts`) → barras contra referencias EFSA/OMS.
- Ranking "qué alimentos aportan cada nutriente": `foodsHighestIn`
  (`shared/src/nutrition/breakdown.ts`).

Los **suplementos** son un dominio aparte: catálogo + plan IA + checklist de tomas
(`taken`/`deviated`/`skipped`). Hoy solo aparecen **descriptivamente** en el informe de la IA
(`backend/src/reports/collect.ts`), nunca en el conteo de vitaminas/minerales del día. Un usuario que
toma Magnesio 300 mg y Vitamina D 25 µg ve esos micros en `null`/piso-sin-cubrir aunque los haya tomado.

### Corrección de premisa (importante)

El onboarding decía que "los suplementos no guardan cantidades cuantificadas, solo un campo `info`".
**No es exacto.** `SupplementComponentSchema` (`shared/src/schemas/supplements.ts:18`) **ya** guarda,
por componente, `{ name, amount, unit }` cuantificado (la IA lo extrae de la etiqueta;
`backend/src/ai/supplements.ts:14` fuerza "cantidad POR PORCIÓN"). Lo que falta **de verdad**:

1. El `name` del componente es **texto libre** ("Magnesio (citrato)", "Vitamina D3"), no una de las 30
   claves canónicas de `NUTRIENTS` (`magnesium_mg`, `vitamin_d_mcg`, …). No existe ningún mapeo
   componente→`NutrientKey` en el repo (verificado).
2. El `unit` es texto libre y hay que normalizarlo a la unidad canónica (µg↔mg, UI→µg de vit D).
3. Muchos componentes **no tienen** clave canónica (creatina, CoQ10, L-teanina, probióticos…):
   simplemente no suman, pero hay que degradar limpio.

Entonces el bloqueante no es "capturar cantidades" (ya están), sino **mapear cada componente a un
nutriente canónico + normalizar unidades**, y **cuantificar la toma del día**.

## 2. Decisiones del owner (cerradas en el brainstorming)

| Decisión | Resolución |
|---|---|
| **Mapeo componente→nutriente** | La **IA en el alta**: al extraer/actualizar el suplemento de la foto, emite por componente su `nutrientKey` canónico (o `null`) y la cantidad normalizada. |
| **Qué toma cuenta y cuánto** | Se **mantiene el modelo de tomas intacto** (`taken`/`deviated`/`skipped` + `actualDose`). El owner entendió que **`deviated` ES el mecanismo** que pedía para ajustar la dosis ("tomé 1 pastilla, no 3"). El diario **deriva** la cantidad de lo ya guardado. **No se toca el flujo de Desvío.** |
| **Pisos vs límites** | El aporte del suplemento **cuenta en TODO** (pisos y techos por igual). Si un efervescente aporta sodio, ese sodio cuenta contra el límite: el diario refleja lo que entró al cuerpo. El color distinto deja claro el origen. |
| **Informe IA** | **En v1**: `collect.ts` suma el aporte cuantificado con la **misma** función de shared que el diario móvil. |
| **Color del suplemento** | Violeta `#7F77DD` (familia púrpura), distinto del teal (comida) y el ámbar (excedente). |

## 3. Modelo de datos (cambios aditivos)

### 3.1 Componente — sin perder el texto de etiqueta

`SupplementComponentSchema` (`shared/src/schemas/supplements.ts`) agrega:

```ts
nutrientKey: z.enum(NUTRIENT_KEYS).nullable(),  // clave canónica, o null si no mapea
amountPerUnit: z.number().nonnegative().nullable(),  // micro normalizado a la unidad canónica del
                                                     // nutriente, POR UNIDAD CONTABLE (cápsula/
                                                     // comprimido/scoop), no por porción
```

- Se **conservan** `name`/`amount`/`unit` (texto de etiqueta, para mostrar). `amountPerUnit` es el
  derivado normalizado que usa la matemática.
- `null` en cualquiera de los dos = "no aporta al diario" (componente sin clave canónica, o alta vieja
  sin backfillear). Se **saltea** en la suma.
- `components` es una columna **JSONB** (`backend/src/db/schema.ts:239`, `$type<SupplementComponent[]>`),
  así que agregar estos campos **NO necesita migración SQL** — solo el tipo Zod/TS + el backfill (§6).

### 3.2 Suplemento — la unidad que habla el `dose`

`SupplementExtractionSchema` / `SupplementInputSchema` agregan:

```ts
unitLabel: z.string().trim().min(1).nullish(),  // "cápsula", "comprimido", "scoop"
```

- Documenta en qué unidad se interpreta el número del `dose`/`actualDose`, y alimenta el placeholder
  del Desvío ("Dosis real, p.ej. 2 cápsulas").
- Nueva columna `unit_label text` (nullable) en `supplement` → **migración 0026** (una sola columna).

### 3.3 Tomas y plan — NO se tocan

`supplement_take` (status/`actualDose`/`plannedDose`), `supplement_plan_item` (`dose` texto libre) y
todo el flujo de checklist/Desvío quedan **exactamente como están**. La cuantificación del diario es
**puramente derivada y aditiva** sobre estos campos existentes.

## 4. Cuantificación de la toma (shared, puro)

Módulo nuevo `shared/src/nutrition/supplementBreakdown.ts`. Idea: por cada toma del día, calcular
**cuántas unidades** se tomaron y multiplicar por `amountPerUnit` de cada componente mapeado.

### 4.1 Cantidad tomada por toma

```
unidades(toma) =
  status === "skipped"  → 0
  status === "deviated" → parseLeadingNumber(actualDose)  (fallback: parseLeadingNumber(plannedDose))
  status === "taken"    → parseLeadingNumber(plannedDose)
  (si nada parsea)      → 1   // fallback honesto: una unidad, no rompe
```

- `parseLeadingNumber("1 cápsula") = 1`, `("3 comprimidos") = 3`, `("según necesidad") = null`.
  Acepta coma decimal (es-AR): `"1,5 g"` → `1.5`. Se **clampa** a `>= 0`.
- El caso del owner: plan "3 cápsulas", Desvío "1 cápsula" → 1 unidad → el diario suma 1 pastilla de
  magnesio, no 3. ✔
- **Riesgo conocido y aceptado**: si el `dose` viniera en masa ("375 mg") en vez de en unidades, el
  número parseado no sería "unidades" y el aporte quedaría mal. Mitigación: `ai/supplements.ts`
  instruye a la IA a emitir el `dose` del plan **siempre en unidades** (cápsulas/comprimidos),
  consistente con `unitLabel`. El Desvío es del usuario: el placeholder lo guía a escribir unidades.

### 4.2 Agregación del día

`supplementMicros(takenTakes, catalogById): { totals: Partial<Record<NutrientKey, number>>, byNutrient: Record<NutrientKey, SupplementRank[]> }`

- `totals[nutrientKey] += amountPerUnit × unidades`, sumando sobre todas las tomas del día y sus
  componentes con `nutrientKey != null`. (Una toma con `deviated` que aporta un techo, ej. sodio,
  también suma — coherente con "cuenta en todo".)
- `byNutrient[nutrientKey]` = lista de `{ supplementName, amount }` para el ranking (§5.2).
- Respeta los `decimals` de cada nutriente (mismo criterio que `sumNutrientByKey`).
- **Una sola fuente**: la consumen el móvil (diario) y el backend (informe). Sin duplicar la cuenta.

### 4.3 Sal / sodio

El diario habla en **sal** pero persiste **sodio** (`saltGFromSodiumMg`). Si un componente mapea a
`sodium_mg`, su aporte se suma al sodio del día **antes** de convertir a sal una sola vez al final
(mismo criterio que `daySummary.ts`/`breakdown.ts`). El módulo trabaja en las claves canónicas
(`sodium_mg`); la conversión a sal vive donde ya vive.

## 5. Superficies (móvil)

### 5.1 Pestaña Nutrientes — barra de 3 segmentos

- `daySummary` gana `supplementNutrients: Partial<Record<NutrientKey, number>>` junto a `nutrients`
  (comida). El total mostrado por nutriente = comida + suplemento.
- `Bar` (`mobile/src/nutrition/tabs/ui.tsx`) evoluciona a **3 segmentos**: comida (teal `colors.accent`)
  / suplemento (violeta, nuevo token `colors.supplement = "#7F77DD"`) / excedente (ámbar
  `colors.warning`). Se preservan los clamps simétricos del diseño de dos colores (§0-BARRAS): ningún
  segmento con valor > 0 puede redondear a 0 % y desaparecer.
  - `barSegments` se generaliza para recibir `{ food, supplement, target, kind }` y devolver
    `{ foodPct, supplementPct, overPct }`. El estado inconsistente (color que contradice el texto) no
    debe ser representable — se pasan números crudos, no porcentajes ya calculados (regla del #179).
  - `kind: "floor"` (fibra, vitaminas): nunca hay excedente ámbar; comida + suplemento apilados hasta
    llenar hacia la meta.
- Texto de la fila: `180 +300 / 350 mg`, con el `+300` en violeta (aporte del suplemento).
- Leyenda arriba de las barras: comida / suplemento / excedente.

### 5.2 "Qué alimentos aportan cada nutriente" — ranking con origen

- `FoodRank` gana `source: "food" | "supplement"`. `foodsHighestIn` (o un wrapper que combine comida
  + `supplementMicros().byNutrient`) devuelve las filas de ambos orígenes en un solo ranking ordenado.
- Las filas de suplemento: puntito violeta + chip "suplemento" (`colors.accentSoft`→ violeta soft).
  El `grams` de la fila de suplemento no aplica (es por unidades) → se muestra la dosis/nombre, no gramos.

### 5.3 Checklist — intacto

`SupplementChecklist.tsx` **no cambia**. La única mejora posible (opcional, no bloqueante) es el
placeholder del Desvío usando `unitLabel` ("Dosis real, p.ej. 2 cápsulas"). Nada del flujo
taken/deviated/skipped se toca.

## 6. Backfill de suplementos existentes

Los suplementos ya guardados no tienen `nutrientKey`/`amountPerUnit`/`unitLabel` → **no aportan** hasta
backfillearlos (degradación limpia: `null` se saltea, el diario simplemente no los cuenta todavía).

- **Endpoint admin** `POST /supplements/backfill-micros` bajo auth del owner (decidido: reusa auth +
  cliente de IA existentes, se dispara con un curl tras el deploy, sin acceso a la DB de la Pi). Por
  cada suplemento sin mapear, corre un mapeo **IA text-only** sobre el `{name, amount, unit}` ya
  guardado (no necesita la foto: es normalización texto→clave) y completa los campos.
- Idempotente: solo toca componentes con `nutrientKey === undefined` (nunca pisa un mapeo existente ni
  una edición del usuario — lección del #190: identidad/valores del alimento guardado, no del body).

## 7. Informe IA (backend)

- `collect.ts` ya trae `takes` + `catalog`. Ahora el `catalog` incluye `unitLabel` y los componentes
  con `nutrientKey`/`amountPerUnit`.
- Se calcula `supplementMicros(...)` con la **misma** función de shared y se expone en `ReportData`
  (ej. `supplementMicros: Partial<Record<NutrientKey, number>>`) para que el prompt le diga a la IA el
  aporte diario cuantificado. La IA pasa de "tomó Magnesio (citrato)" a "el magnesio quedó cubierto
  contando el suplemento". No cambia el modelo del prompt, agrega datos.

## 8. Alcance

**Dentro (v1):**
- Mapeo IA en el alta + normalización por unidad.
- Migración 0026 (`supplement.unit_label`).
- Agregación en shared (`supplementBreakdown.ts`).
- Pestaña Nutrientes (barra 3 segmentos + texto + leyenda).
- Ranking "alimentos con más X" con origen comida/suplemento.
- Informe IA (suma cuantificada).
- Backfill de suplementos existentes.

**Fuera (YAGNI / follow-up):**
- Proteína/carbos/kcal desde suplementos: **no son claves de `NUTRIENTS`** → una proteína en polvo se
  registra como alimento, no como suplemento. Los suplementos suman solo en los 30 nutrientes, nunca
  en las tortas de calorías/macros.
- Suplementos tomados **fuera del plan** (ad-hoc, sin `planItem`/take): no se cuentan. El checklist es
  plan-driven; hoy alcanza.
- Cachear el mapeo IA / re-mapear en cada edición: se mapea al alta y al actualizar, punto.
- Parseo de `dose` en masa cuando debería ser unidades: mitigado por instrucción a la IA, no resuelto
  de raíz.

## 9. Testing (dónde suele romper este repo)

- **La costura, no solo las piezas** ([[testear-la-costura]]): un test que corra el flujo real
  extracción-IA → alta → toma → diario, no objetos armados a mano. El bug clásico acá sería que el
  cliente arme el payload sin `amountPerUnit` y las unidades verdes escondan un diario en 0.
- `parseLeadingNumber`: coma decimal es-AR, texto sin número (→ null), número con unidad, negativos
  (→ clamp 0), `deviated` sin `actualDose` (→ fallback a `plannedDose`).
- `barSegments` 3-vías: clamps simétricos (ningún segmento > 0 desaparece), `floor` sin ámbar,
  comida+suplemento > meta (excedente correcto), suma de porcentajes.
- Sal/sodio: un suplemento con sodio suma al sodio del día y la sal sale de la suma, no ítem por ítem.
- `supplementMicros`: componente `nutrientKey: null` se saltea; multi-slot del mismo suplemento suma
  las dos tomas; `skipped` aporta 0.
- Backfill: idempotente, no pisa mapeos/ediciones existentes, 404 "otro usuario".
- Verificación por mutación (el plan la exige explícitamente — patrón de los tests falsos de este repo).

## 10. Riesgos / decisiones abiertas

- **`dose` en masa vs unidades** (§4.1): el mayor riesgo de números mal. Mitigado por instrucción a la
  IA + placeholder; si en device aparece un caso feo, condicionar el parseo por `unitLabel`.
- **Color violeta en modo claro "clínico fresco"**: aprobado `#7F77DD`; verificar contraste real en
  device sobre `surfaceMuted`/`surface`.
- **Backfill con IA**: costo de una llamada por suplemento existente. Aceptable (one-time, catálogo
  chico del owner).

---

Relacionado: [[nutrition-comidas-status]], [[nutrition-ia-micros-status]],
[[semaforo-nutricional-status]], [[testear-la-costura]], [[nutrientes-usda-status]].
