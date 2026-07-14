# Nutrición — Detalle del día + card más clara

> Diseño. Fecha: 2026-07-14. Fix de claridad sobre la card de totales del tab de Nutrición (post #2a). Motivado por uso real: los rótulos **P/C/G** son ambiguos ("G" de Grasa se confunde con "g" de gramos), la card queda apretada, y **no se distingue cuándo estás excedido** (la barra llena en verde se ve igual estés justo o pasado). Solución: card más clara y **clickeable → pantalla de detalle** explícita, con estado "excedido" en ámbar. Mobile-only, OTA a vc10. La "pieza c" (dashboard MFP con pestañas + tortas) queda para más adelante.

## Objetivo

1. **Card del tab** más clara: rótulos con nombre corto sin ambigüedad (**Prot/Carb/Gras**), **toda la card tocable** → detalle del día, y las barras de macro en **ámbar cuando te pasás** de la meta (hoy siempre van en teal).
2. **Pantalla "Detalle del día"**: una sola vista con scroll, todo con **nombres completos** y una leyenda: Calorías (Meta/Comido/Restante), Macros (Proteína/Carbohidratos/Grasa con barra + gramos comido/meta/restante), Otros nutrientes (Azúcares/Fibra/Grasas saturadas/Sal), Colesterol (ref 300 mg) y Líquido.
3. **Estado "excedido" uniforme**: cualquier métrica por encima de su meta → barra **ámbar llena** + texto "X de más" (con ⚠); por debajo → teal + "faltan X"; en la meta → "meta cumplida".

## No-objetivos (YAGNI)

- **No** dashboard con pestañas (Resumen/Calorías/Nutrientes/Macros) ni tortas/donas: es la **pieza c**, aparte.
- **No** coloreo nutriente-aware (verde para proteína/fibra al superarlas): el usuario eligió **ámbar parejo** para todo lo que se pase; el matiz lo hará el agente de consejos (#4).
- **No** editar/registrar desde el detalle (es read-only; para editar se usan las pantallas ya existentes).
- **No** backend ni migración.

## Diseño

### Bloque 1 — Estado "excedido" en la lógica compartida (`goalView`)

En `mobile/src/nutrition/goalView.ts`, extender `MacroBar` (y el bloque `kcal`) con un flag `over` (comido > meta):
- `MacroBar`: agregar `over: boolean` (= `restante < 0`).
- `kcal`: agregar `over: boolean`.
- `pct` sigue clampeado 0–100. `restante` sigue pudiendo ser negativo.

La UI deriva de `over`:
- **color** de la barra: `over ? colors.warning : colors.accent`.
- **ancho**: `over ? "100%" : \`${pct}%\``.
- **texto**: `restante > 0 → "faltan {restante}"`, `restante === 0 → "meta cumplida"`, `restante < 0 → "{-restante} de más"` (en `colors.warning`, con ⚠).

### Bloque 2 — Resumen del día como función pura (`buildNutritionDaySummary`)

Nueva función pura `mobile/src/nutrition/daySummary.ts` (testeable), que hoy vive inline en el tab:
```ts
buildNutritionDaySummary(meals: Meal[], water: WaterLog[]): {
  dayTotals: { kcal; protein_g; carbs_g; fat_g; sugars_g; fiber_g; saturated_fat_g; salt_g };  // micros null-safe (sumNullableMicro)
  cholesterolMg: number | null;
  liquid: { total: number; drank: number; fromFood: number };
}
```
Reemplaza los cálculos de `items`/`dayTotals`/`cholesterolMg`/`waterFromFood`/`waterDrank`/`liquidTotal` que hoy están duplicables en el tab. Se testea aparte.

### Bloque 3 — Hook `useNutritionDay(offset)`

Nuevo hook `mobile/src/nutrition/useNutritionDay.ts` que **de-duplica** el fetch + cómputo entre el tab y el detalle (atiende el nit del review de #2a; le sirve también a #2b). Encapsula lo que hoy hace `load` en el tab:
- Resuelve `baseUrl`, calcula `dayBounds(offset)`.
- `Promise.all([listMeals, listWater, getNutritionGoal, getProfile])` + `getLatestMetrics` para el peso (fallback `profile.weightKg`).
- Computa `summary = buildNutritionDaySummary(meals, water)`, `goalResult = computeNutritionGoal({...perfil, weightKg, ...goalInput})`, `goalView = buildGoalView(goalResult, summary.dayTotals)`.
- Recarga en foco (`useFocusEffect`) y cuando cambia `offset`.
- Devuelve: `{ error, meals, water, summary, goalResult, goalView, baseUrl, reload }`.

`baseUrl`/`reload` los usa el tab para sus handlers de mutación (borrar comida, +agua, deshacer). El detalle es read-only.

### Bloque 4 — Tab de Nutrición (`nutricion.tsx`) refactor + card

- Reemplazar el `load` + los cálculos inline por `useNutritionDay(offset)`.
- Los handlers `remove`/`addWater`/`undoLastWater` pasan a usar `baseUrl` + `reload()` del hook (en vez de `setMeals`/`load` locales). `mlInput` y `offset` siguen locales.
- **Card**: envolver el contenido de la tarjeta de totales en un `Pressable` → `router.push(\`/nutricion/detalle?offset=${offset}\`)`. El botón **Objetivo ⚙** queda como `Pressable` anidado (maneja su propio toque). Agregar un `Text` tenue **"toca para ver el detalle ›"** abajo.
- **Barras de macro**: color y ancho según `m.over` (Bloque 1); rótulos **Prot/Carb/Gras**; texto de restante según estado.
- El restante de kcal ya se muestra en ámbar si es negativo (queda igual, ahora vía `goalView.kcal.over`).
- Micros, colesterol y la tarjeta de líquido quedan como están (siguen visibles en el tab).

### Bloque 5 — Pantalla "Detalle del día" (`mobile/app/nutricion/detalle.tsx`, nueva)

Lee `offset` de los query params, usa `useNutritionDay(offset)`. Scroll con:
- **Leyenda** (tenue): "Comido = lo registrado · Meta = tu objetivo · Restante = Meta − Comido. Todavía no incluye el gasto del ejercicio."
- **Calorías**: `Comido / Meta` grande + restante ("te quedan X" / "X de más" en ámbar) + barra (según `over`). Si `goalView` es `incomplete`, mostrar lo comido + CTA a Objetivo/Perfil (igual que el tab).
- **Macros**: filas Proteína/Carbohidratos/Grasa con nombre completo, `Comido X g · Meta Y g` + estado (faltan/de más), barra según `over`.
- **Otros nutrientes**: tabla Azúcares/Fibra/Grasas saturadas/Sal con su valor en g (los que tengan dato; ocultar los null).
- **Colesterol**: `Comido / 300 mg` + barra (ámbar si > 300).
- **Líquido**: total + "tomada X · aporte de alimentos Y".

## Casos borde

- Perfil incompleto → `goalView.status === "incomplete"`: tanto la card como el detalle muestran lo comido + CTA (no barras de meta). Las secciones de micros/colesterol/líquido igual se muestran (no dependen de la meta).
- Día sin comidas → totales en 0, secciones vacías o en 0; el detalle se abre igual.
- Métrica sin meta calculable (incompleto) pero con datos comidos → mostrar el comido sin barra de progreso.
- `Pressable` anidado (card + Objetivo ⚙): el botón interno maneja su `onPress` y no dispara la navegación de la card (comportamiento estándar RN).

## Testabilidad

- **`daySummary.test.ts`**: `buildNutritionDaySummary` suma kcal/macros, micros null-safe, colesterol, y el líquido (tomada + aporte), con casos de micros ausentes.
- **`goalView.test.ts`** (extender): el flag `over` es true cuando comido > meta (macros y kcal), false si está por debajo o justo.
- El detalle y el hook son glue de UI/fetch → verificación por typecheck + sweep de tests + prueba en device (no se agregan tests de `renderHook` para evitar el flake conocido; la lógica pura ya está cubierta).

## Entrega

- **Mobile, todo JS, sin dep nativa** → **OTA a vc10** (`784872cb…`; `eas update --branch preview --environment preview`). Sin backend, sin migración.
