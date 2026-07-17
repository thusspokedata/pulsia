# Alta de alimentos por texto + trazabilidad del dato — diseño

Fecha: 2026-07-17
Estado: aprobado (pendiente de plan)

## Motivación

Hoy dar de alta un alimento en el catálogo **exige una foto**: el móvil manda la imagen en base64 a
`POST /nutrition/foods/extract` y `AiClient.extractFood` la analiza con Opus visión.

Para un producto envasado eso está bien: la IA lee la tabla nutricional y los números son reales.
Para una almendra es puro gasto — sacar una foto de una almendra para que la IA conteste
"almendra" cuesta tokens de visión y un viaje de ida y vuelta, cuando alcanzaba con escribir la
palabra.

Pedido textual del usuario: *"me gustaría escribir directamente por ejemplo 'almendra' y que la IA
agregue toda la información nutricional [...] esto me evitaría el gasto de subir fotos"*.

## Alcance

**Entra:** un camino de alta por texto (escribir el nombre del alimento → la IA precarga el
formulario), y el indicador **etiqueta vs estimado** en el catálogo y en el alta.

**No entra:** cantidad en el texto ("30 almendras") ni comidas enteras en una frase ("café con
leche y dos tostadas"). Tampoco los **avisos sobre totales estimados** en el detalle del día, las
referencias OMS y los informes de la IA: es la **Pieza 2**, con spec propio (ver abajo).

## Por qué el indicador va acá y no después

El usuario pidió poder distinguir los datos estimados de los reales. La parte grande de eso
(avisar cuando un total está armado mayormente con estimaciones) es la Pieza 2. Pero el indicador
en el catálogo entra **en esta pieza**, porque es lo que hace seguro abaratar los estimados: esta
feature vuelve al estimado el camino de menor esfuerzo, así que la mayoría del catálogo va a pasar
a ser estimado. Sin el indicador, en tres meses no habría forma de saber si los 60 mg de colesterol
de un alimento salieron de un envase o de la memoria del modelo — y el colesterol es el dato
prioritario del usuario (colesterol alto + antecedentes familiares).

El dato **ya existe**: `source: "label" | "estimate"` está en `FoodSchema` desde el primer día
(`shared/src/schemas/nutrition.ts`). Se guarda y se usa en el formulario, pero **el catálogo nunca
lo mostró**. Esta pieza solo lo saca a la superficie.

## Decisiones tomadas

| Decisión | Elegido | Por qué |
| --- | --- | --- |
| Qué se escribe | Solo el alimento ("almendra") | Es el camino más corto a lo pedido y no cambia el flujo: el catálogo es por 100 g y reutilizable; la cantidad se elige después, al registrar la comida, como siempre. |
| Dónde vive el camino de texto | Método y endpoint nuevos (`describeFood`, `POST /foods/describe`) | Extender `extractFood` daría una firma `{imageBase64?, mediaType?, text?}` que se puede llamar con los dos o con ninguno, y el tipo no lo impide. Separado, cada método tiene una firma honesta. |
| El prompt | Uno solo, con un parámetro de modo | Las reglas nutricionales (por-100, micros, colesterol, agua, unidad, naming) son idénticas en los dos caminos y **no deben poder divergir**: si mañana alguien afina la regla del colesterol, la afina para los dos. |
| `source` en el camino de texto | Lo **fuerza el servidor** | Por texto no hay etiqueta que leer: es siempre una estimación. Si el modelo contestara `source: "label"` porque "sabe" la etiqueta de las almendras Marca X, el catálogo mentiría sobre la procedencia — justo lo que el indicador existe para evitar. Mismo patrón que el disclaimer del ECG, que se fuerza server-side en vez de pedírselo al prompt. |
| Texto que no es un alimento | No se blinda | Ver "Limitación conocida". |

## Arquitectura

### 1. El prompt: `backend/src/ai/nutrition.ts`

`buildFoodPrompt()` pasa a `buildFoodPrompt(mode: "photo" | "text")`.

- **Compartido** (reglas 2 a 5, sin cambios): macros por 100 g/ml y elección de `basis`; micros de
  etiqueta con la conversión sodio→sal; colesterol en mg; agua estimada siempre; `unitWeightG` para
  contables; naming (nombre impreso si es etiqueta, español si es estimación).
- **Modo `photo`** (lo de hoy): la intro habla de una foto, el anti-inyección se refiere al texto
  dentro de la imagen, y la regla 1 elige `label` o `estimate` según haya tabla nutricional visible.
- **Modo `text`**: la intro dice que recibe el **nombre** de un alimento; el anti-inyección se
  refiere al texto del usuario (es el nombre de un alimento, no instrucciones); y la regla 1 dice
  que **siempre** está estimando de tablas de referencia generales, sin etiqueta que leer.

### 2. El cliente: `AiClient.describeFood`

```ts
async describeFood({ text, apiKey }: { text: string; apiKey: string }): Promise<FoodExtraction>
```

Mismo `callStructuredTool` que `extractFood` (Opus, `FoodExtractionSchema`, tool `return_food`),
con `content` de solo texto: el nombre del alimento + `buildFoodPrompt("text")`. Sin bloque de
imagen — que es exactamente de dónde sale el ahorro.

### 3. La ruta: `POST /nutrition/foods/describe`

Mismo esqueleto que `/foods/extract`: auth, `resolveAiKey`, 400 si no hay key, 502 si la IA falla
con el mismo mensaje ("cargalo a mano"), 500 si el cliente no soporta el método.

Body: `{ text: string }`, validado con `z.string().trim().min(2).max(100)`. El tope no es
decorativo: sin él, pegar media novela se tokeniza y se paga.

**Después de la IA, el servidor pisa el `source`:**

```ts
return c.json({ ...food, source: "estimate" });
```

### 4. El móvil: `mobile/app/nutricion/agregar-alimento.tsx`

Arriba de los botones de foto, un campo de texto con un botón ("Buscar con IA"). Precarga el mismo
formulario que la foto, con el mismo repaso y el mismo guardar. **La foto no se va**: para un
producto envasado sigue siendo mejor, porque son números leídos y no estimados.

El botón se deshabilita con menos de 2 caracteres o mientras está cargando, igual que hoy hacen los
botones de foto.

### 5. El indicador

Un chip chico con dos estados, derivado de `source`:

- **"etiqueta"** — la IA leyó una tabla nutricional de una foto (`source: "label"`).
- **"estimado"** — todo lo demás (`source: "estimate"`).

**Qué significa exactamente "estimado", y por qué el chip NO dice "lo estimó la IA":** `source`
tiene dos valores, pero hay **tres** formas de dar de alta un alimento, y dos caen en `estimate`:

1. Foto de una etiqueta → `label`. La IA leyó números impresos.
2. Foto de un alimento suelto, o texto ("almendra") → `estimate`. La IA estimó de memoria.
3. **Carga a mano** → `estimate` también, porque `EMPTY` en `agregar-alimento.tsx` arranca con
   `source: "estimate"` y no hay ningún control en la UI para cambiarlo.

O sea que el caso 3 se marca igual que el 2, aunque el usuario haya copiado los números de un
envase real con sus propios ojos. La app **no puede distinguirlos**: no vio la etiqueta.

Por eso el chip se lee como **"la app no verificó esto contra una etiqueta"**, no como "la IA se lo
inventó". Es la afirmación que el dato realmente respalda. Marcar un dato copiado a mano como si
fuera invención del modelo sería una mentira distinta, en la dirección contraria.

**No se agrega un tercer valor a `source`** en esta pieza: cambiar el enum toca el schema
compartido, la extracción, la edición y los datos ya guardados, para una distinción que hoy nadie
pidió. Queda anotado como follow-up por si con el uso resulta que importa.

Va en dos lugares:
- `mobile/app/nutricion/catalogo.tsx`: uno por alimento en la lista.
- `mobile/app/nutricion/agregar-alimento.tsx`: sobre el formulario, reflejando el `source` actual
  (venga de foto, de texto o del default de la carga a mano), para que se vea antes de guardar.

Los colores salen de `theme/tokens`: `accentSoft`/`accentText` para "etiqueta" (es el dato bueno),
`surfaceMuted`/`textMuted` para "estimado" (es información, no una alarma). **No se usa `warning`**:
un estimado no es un error ni un exceso, y el ámbar ya significa "te pasaste de un límite" en el
resto de la app.

El chip vive en un componente propio, `mobile/src/nutrition/SourceChip.tsx`, porque lo usan dos
pantallas y la Pieza 2 probablemente lo reuse.

## Limitación conocida

Si el texto no describe un alimento reconocible ("asdfgh", "un martillo"), la IA **va a devolver
algo igual**: `callStructuredTool` fuerza el tool-use, así que el modelo no puede contestar "no sé"
— tiene que responder con la forma de un alimento.

**No se blinda, a propósito.** El formulario siempre se revisa antes de guardar, así que el
disparate se ve en el momento. Blindarlo exigiría un schema de salida que admita el rechazo
(`{recognized: false} | FoodExtraction`), complicando el tipo compartido para un caso que el
usuario detecta en dos segundos. Queda documentado en vez de resuelto.

## Manejo de errores

| Caso | Qué pasa |
| --- | --- |
| Texto de menos de 2 caracteres | El botón está deshabilitado; nunca sale el request. |
| Texto de más de 100 caracteres | 400 del backend (`Body inválido`), mensaje inline. |
| Sin API key de IA | 400, el mismo mensaje que ya da la foto. |
| La IA falla o devuelve algo inválido | 502 con "No se pudo analizar. Reintentá o cargá el alimento a mano." |
| El servidor no soporta `describeFood` | 500, mismo patrón que `extractFood`. |

Ninguno es código de error nuevo: son los mismos caminos que `/foods/extract` ya tiene.

## Testing

- **Backend**: tests de la ruta (`describe` feliz; texto corto/largo → 400; sin key → 400; la IA
  tira → 502; **el `source` se pisa aunque la IA devuelva `"label"`** — este es el que importa).
  `buildFoodPrompt("text")` no menciona foto y `buildFoodPrompt("photo")` sí; las reglas
  compartidas están en los dos.
- **Móvil**: el botón se deshabilita con menos de 2 caracteres; el texto precarga el formulario;
  el chip muestra "estimado" para `source: "estimate"` y "etiqueta" para `"label"`; el catálogo
  muestra el chip por alimento.
- TDD: test que falla primero, en cada tarea. Cada test nuevo se verifica **por mutación**.

## Entrega

Un PR. **Sin migración** (el campo `source` ya existe), sin dependencias nuevas. Toca backend y
móvil, así que va **deploy a la Pi** (automático al mergear a `main`) **y OTA a vc10**.

## Fuera de alcance — la Pieza 2

Los avisos sobre totales estimados (detalle del día, referencias OMS, informes de la IA) van en su
propio spec. La arruga que la hace más sutil de lo que parece y que hay que resolver ahí: hoy los
micros son **null-safe por ítem** (`sumNullableMicro`), así que un total de colesterol puede
mezclar un alimento con dato de etiqueta, uno estimado, y uno sin dato tratado como 0. "Estimado"
no es una propiedad del total: es una mezcla, y decirlo bien requiere definir qué se mide
(¿% de las kcal del día? ¿por nutriente?) antes de dibujar ningún badge.

## Follow-ups

- **Un tercer valor para `source`** que separe "lo estimó la IA" de "lo cargó el usuario a mano"
  (ver "El indicador"). Hoy los dos caen en `estimate` y el chip está redactado para no mentir
  sobre eso. Tocaría el schema compartido, la extracción, la edición y los datos ya guardados, así
  que vale la pena solo si con el uso resulta que la distinción importa.
