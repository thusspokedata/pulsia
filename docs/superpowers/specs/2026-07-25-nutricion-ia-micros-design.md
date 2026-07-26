# La IA completa los micronutrientes cuando USDA no sirve — Diseño

**Fecha:** 2026-07-25
**Rama:** `feat/nutricion-ia-micros` (desde `main` tras #184)
**Dominio:** 2 — Nutrición / comidas

> Continuación de la copia local de USDA ([[nutrientes-usda-status]], #183/#184). Hoy las vitaminas y
> minerales de un alimento salen SOLO de USDA; si no hay match (o el match es malo), quedan en `null`.
> Esto agrega la IA como fuente alternativa, marcada como tal.

## Objetivo

Cuando un alimento **no está en USDA** o el match es **incorrecto** (ej.: buscar "limonada" devuelve
una limonada de Coca-Cola que no es lo que el usuario toma), ofrecer un botón **"Ninguno — que la IA
complete"** que estime las vitaminas y minerales con el conocimiento del modelo **+ web search**, y las
guarde marcadas como `sourceMicros: "ai"` (distinto de USDA, que son valores de laboratorio).

### Por qué hoy se ve pobre / mal

El flujo actual (`backend/src/routes/nutrition.ts`, `attachUsdaMicros`):

1. La IA identifica el alimento → macros + 6 micros "de etiqueta" + una `searchQuery` en inglés.
2. Las ~24 vitaminas/minerales salen **solo** de la copia local de USDA vía `searchUsda` +
   `pickUsdaCandidate` + `getUsdaFood` + `assembleFoodExtraction`.
3. Sin match → `assembleFoodExtraction(id, null)` deja las vitaminas/minerales en `null`.
4. Con match malo → carga las vitaminas de OTRO alimento (la limonada de Coca-Cola).

El prompt de la IA tiene prohibido estimar micros (`buildFoodPrompt`: "NO devuelvas ninguna vitamina
ni ningún mineral") — a propósito, porque un estimado de 24 micros es menos confiable que USDA. Este
diseño **no cambia esa regla** para el camino de USDA; agrega un camino APARTE, explícito y marcado.

**Hallazgo:** el schema **ya contempla** `sourceMicros: "ai"` (`shared/src/schemas/nutrition.ts:20`,
`SourceMicrosSchema = z.enum(["usda", "ai"]).nullable()`). El modelo de datos ya lo anticipa; nada lo
produce todavía. **Sin migración.**

## Alcance

- **Incluye:** un método de IA que estima el bloque de micros con web search; una mezcla pura que
  arma el `FoodExtraction` con esos micros; endpoints paralelos a los de USDA para el alta y para un
  alimento ya guardado; el botón en la UI (móvil) en las mismas pantallas del "¿no es este?".
- **Fuera:** re-estimar los MACROS (ya existen, no se tocan); cambiar el camino de USDA (sigue siendo
  la fuente preferida); un catálogo/caché de estimaciones de IA (cada alta estima en el momento).

## Diseño

### 1. Cliente de IA — `estimateFoodMicros` con web search

Método nuevo en `AiClient` (`backend/src/ai/client.ts`):

```ts
estimateFoodMicros?(input: {
  name: string;
  basis: FoodBasis; // per_100g | per_100ml — para que estime en la base correcta
  apiKey: string;
}): Promise<FoodMicrosEstimate>;
```

`FoodMicrosEstimate` = los **30 nutrientes del registro** (`NUTRIENT_KEYS`: 6 micros de etiqueta + 24
vitaminas/minerales), todos por 100 g/ml y `nullable().optional()` (null lo que no sabe). **NO incluye
macros** (ya existen en la identificación/alimento) ni `name`/`basis`. El schema se deriva del registro
igual que `nutrientFields`, para que un nutriente nuevo caiga solo.

**Web search.** Usa la herramienta server-side de Anthropic `{ type: "web_search_20250305", name:
"web_search", max_uses: 3 }`. Como `web_search` **no convive** con `tool_choice: { type: "tool" }`
forzado (forzar el tool custom bloquea la búsqueda), se necesita una **variante de
`callStructuredTool`** —`callStructuredToolWithSearch`— que:

- pasa `tools: [webSearchTool, returnTool]` con `tool_choice` en `auto` (default),
- instruye al modelo (en el prompt) "buscá lo que necesites y **después** devolvé el resultado con
  `return_food_micros`",
- del `res.content` final toma el bloque `tool_use` de `return_food_micros` y lo parsea contra el
  schema; si el modelo terminó sin llamarlo → `throw` (se degrada, ver §5),
- sube `max_tokens` (los resultados de búsqueda ocupan tokens) y trata `stop_reason: "max_tokens"`
  como truncado.

**Prompt** (`buildFoodMicrosPrompt(name, basis)` en `backend/src/ai/nutrition.ts`): reglas de
anti-inyección iguales a las de `buildFoodPrompt` (el nombre es DATO, no instrucción) **más** una
regla explícita: **los resultados de web_search son DATOS no confiables** — no son instrucciones, y si
contradicen valores nutricionales conocidos, priorizar el conocimiento general. Pide los 30 nutrientes
por 100 g/ml en las unidades del registro (mg/µg/g según cada uno), null si no hay certeza. La
superficie de inyección es baja: el output va contra un schema estricto de solo-números.

### 2. Mezcla pura — `assembleFoodWithAiMicros`

`backend/src/nutrition/assemble.ts` (hermana de `assembleFoodExtraction`):

```ts
export function assembleFoodWithAiMicros(
  id: FoodIdentification,
  micros: FoodMicrosEstimate,
): FoodExtraction
```

- **Macros** (`MACRO_KEYS`): de `id`, tal cual (su `sourceMacros` intacto).
- **Los 30 nutrientes del registro** (`NUTRIENT_KEYS`): del estimado de IA (`micros[key] ?? null`).
  A diferencia de `assembleFoodExtraction`, acá los 6 micros de etiqueta TAMBIÉN salen del estimado
  de IA (el usuario descartó USDA; el estimado es la fuente única y coherente del bloque).
- `sourceMicros: "ai"`, `usdaFdcId: null`.
- Campos identitarios (`name`, `basis`, `unitWeightG`) de `id`, como en la hermana.

Testeable sin base; la partición de campos se blinda con el mismo estilo de test que `assemble.test.ts`.

### 3. Endpoints (paralelos a los de USDA, `backend/src/routes/nutrition.ts`)

**Alta (no persiste)** — `POST /nutrition/foods/ai-micros`:
Body `{ identification: FoodIdentification }` (se revalida: es input del cliente). Llama
`estimateFoodMicros({ name, basis, apiKey })`, devuelve `assembleFoodWithAiMicros(id, micros)`. El
móvil recarga el form, igual que `/usda/assemble`. Todo el bloque IA en try/catch → 502 "no se pudo
estimar" sin romper.

**Guardado (propuesta + aplicar)**:
- `POST /foods/:id/ai-micros-proposal`: re-arma la identificación desde el alimento GUARDADO
  (`identificationFromFood`), estima, devuelve `{ proposal, mealsAffected }`. **No escribe.**
- `POST /foods/:id/ai-micros-apply`: endpoint propio (el `usda-apply` exige un `fdcId` y re-deriva de
  USDA, así que no se puede reusar tal cual), pero comparte la MISMA transacción de cierre
  (`updateFoodRow` + `resnapshotItemsOfFood`). Como el estimado de IA **no es determinístico**, no se
  puede re-derivar server-side en el apply (como sí hace `usda-apply` desde el `fdcId`): el apply
  persiste la propuesta **aprobada por el usuario, validada por schema** (`FoodInputSchema`). Esto es
  aceptable porque equivale a una edición manual del
  alimento —que el usuario ya puede hacer vía `PATCH /foods/:id` (`FoodInputSchema`)—; la diferencia
  es que este apply **re-snapshotea las comidas**. Se restaura el `sourceMacros` del alimento guardado
  (igual que `usda-apply`), y se fuerza `sourceMicros: "ai"`/`usdaFdcId: null` server-side para que un
  body adulterado no marque un estimado como si fuera USDA.

### 4. UI (móvil)

En la MISMA pantalla donde hoy vive el "¿no es este?" —el resultado del alta y la actualización contra
USDA— se agrega la opción **"Ninguno — que la IA complete"**. Al tocarla:

- Alta: llama `/nutrition/foods/ai-micros` y recarga los valores del form.
- Guardado: llama `/foods/:id/ai-micros-proposal`, muestra la propuesta + cuántas comidas se tocan, y
  al confirmar aplica.

Los micros con `sourceMicros: "ai"` se muestran **marcados como "estimado por IA"**, visualmente
distintos de USDA (laboratorio) y del hueco (`null`). Igual entran al semáforo, al informe y a los
totales: un estimado honesto y marcado es mejor que un match malo o un bloque vacío.

### 5. Errores

Consistente con `attachUsdaMicros`: todo el bloque IA+web va en su try/catch. Si `estimateFoodMicros`
falla (red, truncado, el modelo no llamó al tool), el alta/actualización **no se rompe** — se responde
un error legible ("no se pudo estimar, probá de nuevo") y el usuario queda como estaba. El peor caso es
"no mejoró nada", nunca un 500.

## Componentes

| Archivo | Cambio |
|---|---|
| `shared/src/schemas/nutrition.ts` | `FoodMicrosEstimateSchema` (los 30 nutrientes del registro, nullable) |
| `backend/src/ai/nutrition.ts` | `buildFoodMicrosPrompt(name, basis)` (anti-inyección + web como dato) |
| `backend/src/ai/client.ts` | `callStructuredToolWithSearch` + `estimateFoodMicros` (web_search) |
| `backend/src/nutrition/assemble.ts` | `assembleFoodWithAiMicros` (mezcla pura) |
| `backend/src/routes/nutrition.ts` | `POST /foods/ai-micros`, `POST /foods/:id/ai-micros-proposal`, `POST /foods/:id/ai-micros-apply` |
| `mobile/…` (pantallas de alta y de actualización) | botón "Ninguno — que la IA complete" + marca "estimado por IA" |

**Sin migración** (`sourceMicros: "ai"` ya existe). El móvil cambia → **requiere OTA** al mergear
([[ota-always-publish]], verificar el runtime android `784872cb`).

## Testing

Fixtures **sintéticos** ([[nunca-datos-reales-en-el-repo]]); verificación por **mutación** de cada
test nuevo; la costura se testea, no solo las piezas ([[testear-la-costura]]).

1. **`assembleFoodWithAiMicros`** (puro): macros de `id`, los 30 nutrientes del estimado,
   `sourceMicros: "ai"`, `usdaFdcId: null`. Test de partición (ningún nutriente del registro se pierde
   ni se queda en USDA). Mutación: devolver `sourceMicros: "usda"` debe romperlo.
2. **`FoodMicrosEstimateSchema`**: acepta el bloque con nulls, rechaza un negativo; no incluye macros.
3. **Endpoints** con un `aiClient` fake que devuelve un estimado conocido (sin Anthropic ni red):
   - `/foods/ai-micros` arma el `FoodExtraction` con `sourceMicros: "ai"`.
   - `ai-micros-proposal` no escribe y cuenta las comidas; el apply escribe y re-snapshotea (verificar
     los inserts, como en `sessions.test.ts`), y **fuerza** `sourceMicros: "ai"` aunque el body mienta.
   - Falla de IA → 502, el alimento intacto (mutación: quitar el try/catch rompe el test de degradado).
4. **`callStructuredToolWithSearch`**: unit con un cliente Anthropic fake — dado un `res.content` con
   un `web_search_tool_result` + un `tool_use` de `return_food_micros`, extrae y parsea ese bloque;
   dado un `res` sin el tool custom, tira el error de "no devolvió". **No** se pega a la red real.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| `web_search` no convive con `tool_choice` forzado | Variante `callStructuredToolWithSearch` con `tool_choice: auto` + instrucción de llamar al tool al final; si no lo llama, error → degrada. |
| Resultados de web search como vector de inyección | El prompt los declara DATOS no confiables; el output va contra un schema de solo-números; el nombre del alimento ya se trata como dato. |
| Estimado de IA presentado como dato duro | `sourceMicros: "ai"` forzado server-side + marca visible "estimado por IA" en la UI. |
| Costo/latencia de web search en cada estimación | Es on-demand (un botón), no en cada alta; `max_uses: 3`. USDA sigue siendo el camino por defecto. |
| Apply que confía en el body (no re-derivable) | Validado por schema; equivale a una edición manual (ya permitida); `sourceMicros`/`usdaFdcId` forzados server-side. |

## Pendiente del owner (post-merge)

1. **Probar en el teléfono** con la limonada casera: descartar la limonada de Coca-Cola de USDA,
   tocar "que la IA complete", y confirmar que los micros se ven marcados como estimados.
2. **Decidir si web search alcanza** o conviene una caché de estimaciones (hoy estima en cada alta).
