# Actualizar un alimento del catálogo contra USDA

**Fecha:** 2026-07-24
**Estado:** diseño aprobado, pendiente de plan de implementación
**Depende de:** [#183](https://github.com/thusspokedata/pulsia/pull/183) (nutrientes completos con copia local de USDA), ya en producción.

## 1. Disparador

Los alimentos del catálogo **cargados antes** de la feature de nutrientes completos no tienen
vitaminas ni minerales: la migración los dejó en `null` a propósito (spec
`2026-07-22-nutrientes-completos-design.md` §4.5, que ya preveía que el re-match del catálogo
fuera una **acción explícita del usuario, nunca automática**).

Estado real medido en producción el 2026-07-24: **81 alimentos, 80 sin micros**.

Se reparten en tres grupos, y los tres se benefician:

| Grupo | Aprox. | Ejemplos | Qué gana |
|---|---|---|---|
| **Simples** | ~30 | Almendra, Banana, Huevo duro, Zanahoria, Palta, Miel | Todo: matchean bien contra USDA |
| **Con etiqueta** | ~20 | Cashewkerne, Bio Joghurt, Olivenöl, Leibniz, ESN whey | Solo vitaminas y minerales: **la etiqueta sigue ganando en los macros** |
| **Elaborados** | ~30 | Empanada de pollo, Quiche de zucchini, Pizza napolitana | Poco o nada; algunos matchean vía FNDDS, los platos compuestos no |

## 2. Decisiones tomadas

| # | Decisión | Alternativas descartadas |
|---|---|---|
| 1 | **Un botón "Actualizar" por alimento**, en su pantalla de detalle | Job de backfill masivo con clasificación por confianza (ver §2.1) |
| 2 | Actualizar un alimento **también re-snapshotea sus comidas** | Una acción global "recalcular mis comidas" aparte |
| 3 | **Re-snapshot completo**, no solo relleno de `null` | Rellenar solo los campos vacíos; no tocar el pasado |
| 4 | Los dudosos se corrigen con el **"¿no es este?" que ya existe** | Pantalla de revisión dedicada |
| 5 | Confirmación previa que anuncia **cuántas comidas se van a tocar** | Aplicar directo |

### 2.1 Por qué se descartó el backfill masivo

El diseño previo proponía un job asíncrono que recorriera los 80 alimentos, generara las frases de
búsqueda en lote, y **clasificara cada match por confianza** (la IA eligió + piso de similitud +
delta de kcal ≤15%) para auto-aplicar los seguros y encolar los dudosos.

Toda esa maquinaria existe **solo para ahorrar ~20 toques**, y trae su propio riesgo: un match malo
auto-aplicado corrompe datos en silencio, que es justo lo que se quería evitar. El criterio de
confianza era un sustituto pobre del ojo del usuario.

**Con un botón por alimento, cada aplicación está revisada por definición** — el usuario está
mirando ese alimento cuando lo actualiza. Eso elimina la heurística entera.

Costo aceptado: revisar ~80 alimentos de a uno. Es menor de lo que parece — ~30 son elaborados que
no van a matchear igual, y en la práctica importan los que se comen seguido (15-20). Los que nunca
se abren tampoco pesan en los días.

### 2.2 Por qué el re-snapshot completo, y qué cambia de verdad

El owner lo pidió con este argumento: **los informes de 7 y 30 días miran hacia atrás**. Si el
historial reciente queda con datos peores, las conclusiones salen de datos peores; rellenar solo
hacia adelante hace que la feature tarde un mes en servir.

Es correcto, y el riesgo es menor de lo que sugiere la frase "reescribir el pasado", porque el
re-snapshot usa **la misma regla de mezcla** que el alta:

- Alimento con **etiqueta**: la etiqueta gana en los campos que cubre → **los macros no cambian**.
- Alimento **estimado por IA**: USDA gana donde tiene dato → los macros mejoran (dato de
  laboratorio contra estimación de un modelo).
- **Las cantidades nunca cambian**: 150 g de almendras siguen siendo 150 g. Solo cambia la
  densidad de nutrientes.

**Consecuencias que el owner acepta explícitamente:**

1. **Las kcal y macros de días ya vistos pueden cambiar** (solo en alimentos estimados por IA).
2. **Un match malo hace más daño que en un relleno de `null`**: no solo mete vitaminas
   equivocadas, también corrompe kcal de un día que estaba bien. Es lo que mitiga la confirmación
   previa y el "¿no es este?".
3. **Los informes ya generados van a citar números que dejan de coincidir con los datos.** No se
   invalidan ni se regeneran solos; el usuario puede regenerarlos cuando quiera
   (`POST /nutrition/reports/generate` ya existe).

## 3. Flujo

### Paso 1 — Propuesta (no escribe nada)

```
POST /nutrition/foods/:id/usda-proposal
```

1. Carga el alimento guardado del usuario.
2. **Genera la frase de búsqueda en inglés** con la IA, a partir del nombre. Los alimentos
   existentes **no tienen `searchQuery` persistido** — se genera en el momento y vive lo que dura
   la pantalla. (No se agrega una columna: ver §6.)
3. `searchUsda` → candidatos rankeados.
4. `pickUsdaCandidate` → la IA elige uno, o **"ninguno"**.
5. Construye un `FoodIdentification` **desde el alimento guardado** (`name`, `basis`,
   `unitWeightG`, los 4 macros, los 6 micros de etiqueta, `sourceMacros`) más la `searchQuery`.
6. `assembleFoodExtraction(identification, filaUsda)` → propuesta.

Devuelve: `{ identification, candidates, chosen, proposal, mealsAffected }`.
**`mealsAffected`** = cuántas comidas del usuario tienen un ítem que referencia este alimento.

### Paso 2 — Confirmación (en la app)

Muestra la entrada elegida (`USDA · Almonds, raw`), qué cambia, y el aviso de cuántas comidas se
van a tocar. El **"¿no es este?"** ya está implementado y funciona acá sin cambios: usa
`POST /nutrition/usda/assemble` con la `identification` que devolvió el paso 1.

### Paso 3 — Aplicar

```
POST /nutrition/foods/:id/usda-apply    body: { identification, fdcId }
```

1. Re-arma la propuesta server-side (**no se confía en valores mandados por el cliente**).
2. Guarda el alimento.
3. **Re-snapshotea sus ítems de comida** reusando `snapshotItems`
   (`backend/src/nutrition/repository.ts`), que es puro y es **la misma función que creó los
   snapshots originales**. Cada ítem se recalcula como
   `foodMacrosForQuantity(alimentoActualizado, item.quantity, item.quantityUnit)`.
4. Todo en **una transacción**.

Devuelve `{ mealsUpdated, itemsUpdated }`.

⚠️ `snapshotItems` también reescribe `foodName` en el ítem. Es correcto (si el alimento se
renombró, el snapshot se pone al día), pero hay que decirlo porque no es obvio.

## 4. Errores y degradación

| Situación | Comportamiento |
|---|---|
| No hay candidatos, o la IA dice "ninguno" | **No se toca nada** (ni el alimento ni las comidas). Se informa. |
| Falla la IA | Igual: nada cambia. Se ofrecen los candidatos si los hubo. |
| `usda_food` vacía | Igual. |
| El alimento no existe o no es del usuario | 404 |
| `fdcId` inexistente en el apply | 404 |

**El peor caso de esta feature es "no mejoró nada", nunca "empeoró algo".**

## 5. Testing

TDD con verificación por mutación de cada test nuevo, como el resto del repo.

Casos obligatorios:

1. **Re-snapshot con los mismos gramos**: 150 g de almendras siguen siendo 150 g; cambian los
   nutrientes, no la cantidad.
2. **Un alimento con etiqueta conserva sus macros** después de actualizar (solo gana vitaminas).
3. **Sin match, nada cambia**: ni el alimento ni sus comidas.
4. **Las comidas de otros alimentos quedan intactas.**
5. **`mealsAffected` del paso 1 coincide con `mealsUpdated` del paso 3.**
6. **Un ítem huérfano (`food_id = null`) no se toca.** Vamos desde el alimento hacia sus ítems, así
   que no debería aparecer — pero es justo la fila que un `UPDATE` mal escrito barre, y su snapshot
   es el único registro que queda de un alimento borrado.
7. **El apply no confía en el cliente**: mandar una propuesta adulterada no persiste esos valores.

> ⚠️ El caso 5 se pasa en verde con las dos cifras calculadas por el mismo código. El test tiene
> que **contar las comidas realmente modificadas en la base**, no reusar el número de la propuesta.

## 6. Fuera de alcance

| Tema | Por qué |
|---|---|
| **Persistir `usda_search_query`** | La frase se genera al momento. Persistirla es la vía para el "¿no es este?" en modo edición (follow-up abierto aparte); esta feature no lo necesita. |
| **Backfill masivo** | Descartado, §2.1. |
| **Regenerar los informes** afectados | El usuario puede hacerlo a mano; automatizarlo es otra discusión. |
| **Filtro "sin vitaminas" en el catálogo** | Ayudaría a encontrar qué falta actualizar. Barato (el catálogo ya tiene filtros por el semáforo), pero es una feature propia. |

## 7. Referencias

- Spec base: `docs/superpowers/specs/2026-07-22-nutrientes-completos-design.md`
- Código que se reusa: `backend/src/usda/matcher.ts` (`searchUsda`, `getUsdaFood`),
  `backend/src/nutrition/assemble.ts` (`assembleFoodExtraction`),
  `backend/src/nutrition/repository.ts` (`snapshotItems`),
  `backend/src/ai/client.ts` (`pickUsdaCandidate`),
  `mobile/app/nutricion/alimento.tsx`, y el "¿no es este?" de `agregar-alimento.tsx`.
