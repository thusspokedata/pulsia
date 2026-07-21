# Semáforo nutricional en el catálogo de alimentos — diseño

Fecha: 2026-07-21

## Problema

El catálogo de alimentos (`mobile/app/nutricion/catalogo.tsx`) muestra los micronutrientes como una
línea de texto densa:

```
299 kcal · P3 C79 G0,5 /100g · azúc 59 · fibra 3.7 · sat 0.06 · sal 0.03
```

Para saber si las pasas de uva tienen mucha azúcar hay que leer el número, recordar qué es "mucho"
para el azúcar, y hacerlo alimento por alimento. El dato está, pero no responde la pregunta que uno
tiene al decidir qué comer: **¿esto es alto en algo que me importa?**

El usuario pidió que el catálogo lo muestre de forma gráfica, nombrando el colesterol primero.

## Decisión de base: por 100 g, no por porción

Un semáforo necesita una referencia, y hay dos candidatas incompatibles.

Las referencias que ya existen en `shared/src/nutrition/references.ts` (`NUTRIENT_REFERENCES`) son
**diarias**: 50 g de azúcar, 300 mg de colesterol, por día. Compararlas contra el valor por 100 g del
catálogo pinta casi todo de rojo — las pasas tienen 59 g de azúcar por 100 g, o sea 118% de la
referencia diaria, pero nadie come 100 g de pasas de una sentada.

La alternativa es colorear según la porción real, que requiere un campo de porción típica que hoy no
existe (`unitWeightG` es nullable y significa otra cosa: cuánto pesa una unidad contable).

**Decisión: umbrales por 100 g / 100 ml.** Miden la densidad intrínseca del alimento, que es
exactamente lo que uno quiere saber al elegir. Es la misma base que usan las etiquetas frontales
europeas.

**Limitación conocida, aceptada:** por densidad las pasas (59 g/100 g) quedan peor que la Coca-Cola
(10,6 g/100 ml), pero un vaso de 330 ml aporta más azúcar que un puñado de pasas. El semáforo
responde "¿qué tan concentrado está?", no "¿cuánto me va a sumar hoy?". La segunda pregunta ya la
responde el dashboard del día. Un color por porción es un v2 posible, y requeriría el campo nuevo.

## Umbrales y sus fuentes

Se mezclan dos esquemas oficiales porque ninguno solo cubre lo que hace falta. **Esto tiene que
quedar escrito en el código**, con la fuente al lado de cada constante.

### FSA (Reino Unido) — grasa, saturadas, azúcares, sal

Guía de etiquetado frontal FSA/DoH. Tiene dos escalas y la elección depende del campo `basis` que el
alimento ya guarda: `per_100g` → sólidos, `per_100ml` → bebidas.

Sólidos (por 100 g):

| Nutriente | Bajo | Alto |
|---|---|---|
| Grasa | ≤ 3,0 g | > 17,5 g |
| Saturadas | ≤ 1,5 g | > 5,0 g |
| Azúcares | ≤ 5,0 g | > 22,5 g |
| Sal | ≤ 0,3 g | > 1,5 g |

Bebidas (por 100 ml):

| Nutriente | Bajo | Alto |
|---|---|---|
| Grasa | ≤ 1,5 g | > 8,75 g |
| Saturadas | ≤ 0,75 g | > 2,5 g |
| Azúcares | ≤ 2,5 g | > 11,25 g |
| Sal | ≤ 0,3 g | > 0,75 g |

Lo que cae entre ambos umbrales es **medio**. Los bordes son asimétricos a propósito: bajo usa `≤` y
alto usa `>`, así que 5,0 g de azúcar en un sólido es **bajo**, y 22,5 g es **medio**, no alto.

### FDA (Estados Unidos) — colesterol y fibra

El FSA no cubre el colesterol, que es el dato que más le importa al usuario. La FDA sí tiene anclas
citables vía %DV (21 CFR 101.54 y 101.62):

| Nutriente | Bajo | Alto |
|---|---|---|
| Colesterol | ≤ 20 mg | ≥ 60 mg |
| Fibra | < 2,8 g | ≥ 5,6 g |

Colesterol: "low cholesterol" = ≤20 mg; "alto en" = ≥20% del DV de 300 mg = 60 mg.
Fibra: DV de 28 g; ≥20% (5,6 g) es "excellent source" y 10% (2,8 g) es el piso de "good source".
Los dos umbrales de fibra usan `≥` porque acá pasarse es lo bueno — es la asimetría inversa a la de
los nutrientes `max`.

**La fibra es un piso, no un techo** — coherente con `NUTRIENT_REFERENCE_KIND`, donde la fibra ya es
el único `"min"` del set. Mucha fibra es bueno y se pinta verde.

## Arquitectura

### Capa pura: `shared/src/nutrition/nutrientLevel.ts`

Vive en `shared/` junto a `references.ts` y `macros.ts`, por el mismo motivo que
`foodMacrosForQuantity`: las tres pantallas que lo consumen tienen que sacar el mismo veredicto del
mismo alimento, y si mañana el backend necesita el flag (un informe que diga "comés muchos alimentos
altos en sal") lo tiene disponible sin duplicar umbrales.

**La separación clave es entre medir y juzgar**, que espeja el `NUTRIENT_REFERENCE_KIND` existente:

```ts
type NutrientLevel = "low" | "medium" | "high" | "unknown";
type NutrientSentiment = "bad" | "warn" | "good" | "neutral" | "unknown";
type FlaggedNutrient =
  | "fat_g" | "saturated_fat_g" | "sugars_g" | "salt_g" | "cholesterol_mg" | "fiber_g";

// Cuánto hay, contra los umbrales. No opina.
nutrientLevel(nutrient: FlaggedNutrient, value: number | null, basis: FoodBasis): NutrientLevel

// Si eso es bueno o malo. Acá vive la dirección min/max.
nutrientSentiment(nutrient: FlaggedNutrient, level: NutrientLevel): NutrientSentiment

// Los seis nutrientes de un alimento, listos para pintar.
foodFlags(food: Food): FoodFlags
```

Sin esta separación, "fibra alta" tendría que ser un caso especial en el componente de UI. Con ella,
la UI pinta por `sentiment` y nunca pregunta qué nutriente es.

Mapeo de sentiment:
- Nutrientes `max` (los cinco negativos): `high` → `bad`, `medium` → `warn`, `low` → `neutral`
- Fibra (`min`): `high` → `good`, `medium`/`low` → `neutral`
- Cualquiera con `unknown` → `unknown`

`foodFlags` devuelve:

```ts
type FoodFlags = {
  notable: NutrientFlag[];   // sentiment bad | warn | good, ordenados
  unknown: FlaggedNutrient[]; // los que no tienen dato
  all: NutrientFlag[];        // los seis, para la vista de detalle
};
```

**Orden de `notable`:** primero por rango de sentiment (`bad` > `warn` > `good`), y dentro del mismo
rango por el orden fijo de la tabla de nutrientes. Determinista, así que es testeable sin depender de
cómo el motor de JS ordena empates.

### El cuarto estado: `unknown`

Los cinco micros (`saturated_fat_g`, `sugars_g`, `fiber_g`, `salt_g`, `cholesterol_mg`) son
`nullable().optional()` en `FoodSchema`. `fat_g` no: es un macro obligatorio, así que la grasa
siempre tiene dato.

**Un valor `null` produce `unknown`, jamás `low`.** Un alimento sin dato de azúcar no puede verse
igual que uno con azúcar bajo: sería afirmar algo que no sabemos, con cara de certeza. Esta es la
regla que más fácil se rompe en un refactor, así que tiene test propio y explícito.

## UI

### Componente: `mobile/src/nutrition/NutrientFlags.tsx`

Dos variantes, un solo componente, consumido por las tres pantallas.

**`variant="compact"`** — chips con la palabra escrita (`azúcar alto`, `buena fibra`), tomados de
`flags.notable`, **capados en 3** con un `+N` si hay más. Un alimento sin nada notable y con todos los
datos no muestra ningún chip: el silencio significa "nada que reportar".

El chip gris de datos faltantes es **uno solo, aparte del cap de 3, y siempre al final**: el cap
ordena por severidad, así que si compitiera con los otros, un alimento con tres alarmas escondería el
aviso de que además hay datos que no tenemos. Su texto nombra hasta dos nutrientes
(`sin datos de azúcar y sal`) y a partir del tercero resume (`sin datos de 4 nutrientes`).

El nivel va **escrito en el texto**, no solo en el color, así que la información no depende de
distinguir rojo de ámbar.

**`variant="full"`** — los seis nutrientes de `flags.all` con su valor, su umbral y la fuente
(FSA / FDA) escrita. Para la pantalla de detalle.

### Colores

Tokens existentes de `mobile/src/theme/tokens.ts`, con fondo tintado:

| Sentiment | Texto | Fondo |
|---|---|---|
| `bad` | `colors.danger` | tinte rojo claro |
| `warn` | `colors.warning` | tinte ámbar claro |
| `good` | `colors.successText` | `colors.successSoft` |
| `unknown` | `colors.textMuted` | `colors.surfaceMuted` |

**Nota deliberada:** `danger` está documentado en `tokens.ts` como "rojo semántico (errores)", y que
un alimento tenga azúcar no es un error. Se reutiliza igual porque es la lectura universal de un
semáforo y evita tocar la identidad visual, que es una decisión que el owner se reservó. Si más
adelante se agrega un rojo propio, menos agresivo, el cambio es de una línea en el mapa de colores.

### Superficies

1. **`mobile/app/nutricion/catalogo.tsx`** — chips `compact` en cada fila.
2. **`mobile/app/nutricion/nueva-comida.tsx`** — chips `compact` en el buscador de alimentos
   (línea ~101). Es el momento real de decisión: estás por elegir qué comés. Si el semáforo solo
   viviera en el catálogo, llegaría tarde.
3. **`mobile/app/nutricion/agregar-alimento.tsx`** (modo edición) — variante `full`.

## Filtro por nutriente

Fila de chips arriba de la lista del catálogo: grasa · saturadas · azúcar · sal · colesterol · fibra.
Selección única, se destoca tocando de nuevo.

Con un nutriente seleccionado:
- Quedan los alimentos cuyo sentiment para ese nutriente es `bad` (o `good`, si es fibra)
- Ordenados de mayor a menor por el valor de ese nutriente
- Se combina con el buscador de texto existente con AND

**Los alimentos con `unknown` en ese nutriente van a un grupo aparte al final**, bajo un
encabezado "Sin datos de …", nunca descartados en silencio. Si filtro por colesterol y desaparece un
alimento que simplemente no tiene el dato cargado, el filtro me está afirmando que no es alto, y no
lo sabe. Es la misma regla del estado `unknown`, aplicada a la lista.

La lógica de filtrado y orden es una **función pura** (`filterFoodsByNutrient`) en `shared/`, no
lógica suelta dentro del componente, para poder testearla sin renderizar.

## Tests

En `shared/` (bun test):
- Bordes exactos de cada umbral, en ambas direcciones: 5,0 g de azúcar es `low`, 5,01 es `medium`,
  22,5 es `medium`, 22,6 es `high`
- El mismo número da distinto nivel según `basis`: 10 g de azúcar es `medium` en `per_100g` y `high`
  en `per_100ml`
- `null` → `unknown` para los cinco micros nullables
- Fibra invertida: `high` → sentiment `good`
- Orden determinista de `notable` con empates
- `filterFoodsByNutrient`: filtra, ordena desc, y separa los `unknown` en vez de tirarlos

En `mobile/` (jest, `--runInBand`):
- Un alimento con `sugars_g: null` **no** renderiza un chip verde ni "azúcar bajo"
- El capado a 3 chips muestra `+N`
- Las tres pantallas renderizan los chips

**Cada test nuevo se verifica por mutación** antes de darlo por bueno, como pide la convención del
proyecto: romper el código a propósito y confirmar que el test se queja. Precedente directo: en este
repo aparecieron 27 tests falsos en una sola auditoría, y tres más en la feature de animaciones,
todos en verde.

## Fuera de alcance

- Color por porción (decidido: por 100 g). Requeriría un campo de porción típica.
- Letra compuesta tipo Nutri-Score. Responde "¿qué tan sano es en general?", no "¿qué tiene de
  más?", que es la pregunta del usuario.
- Avisos sobre totales estimados (Pieza 2 del backlog): es un problema distinto, sobre los totales
  del día, no sobre el alimento individual.

## Entrega

**Cero migración, cero cambio de backend, cero dependencia nativa.** Todo se deriva de campos que ya
están persistidos, con componentes que ya existen.

Es JS + shared, así que se entrega por **OTA a vc10** sin APK nuevo. Verificar que el `eas update`
reporte runtime android `784872cb…` antes de darlo por entregado.
