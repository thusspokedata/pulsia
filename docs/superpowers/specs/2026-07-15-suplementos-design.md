# Nutrición / Suplementos (#3) — foto + plan IA + checklist con desvíos

> Diseño. Fecha: 2026-07-15. **Sub-proyecto 3** del dominio "Nutrición" (ver `2026-07-13-comidas-registro-design.md` §contexto). **No requiere APK nuevo**: la cámara/galería ya está (`expo-image-picker` de vc10) y no hay dep nativa nueva → todo sale por **OTA a vc10**. Modelos: extracción y plan con **`claude-opus-4-8`** (visión + razonamiento sobre dosis), patrón de los usos existentes de Opus (comidas, ECG, informes).

## Objetivo

Que el usuario cargue sus suplementos **una vez** (foto de la etiqueta → la IA extrae la composición), la IA arme **el plan de tomas** (qué suplemento, qué días, en qué momento del día, según dosis de etiqueta y necesidades del atleta), y el día a día sea un **checklist**: tomado / desvío ("hoy 10g de creatina en vez de 5") / salteado. Todo queda en historial para los informes y la memoria del atleta.

Además, **ajuste dinámico**: el informe diario (#4, ya construido) mira lo que el usuario comió/entrenó y puede dejar un ajuste para **mañana** ("ayer comiste rico en magnesio → hoy podés saltearlo"). Idea del usuario: se aprovecha la llamada de IA del informe — **cero llamadas extra**.

## No-objetivos (YAGNI)

- **No** notificaciones/recordatorios por toma — las franjas son momentos del día, no horas; si algún día se quieren recordatorios, el patrón local de informes (`expo-notifications`) está disponible.
- **No** base de datos pública de suplementos ni escaneo de código de barras — catálogo personal por foto/manual, igual que comidas.
- **No** interacciones farmacológicas ni consejo médico: la IA se ancla a la **dosis de etiqueta como techo** y a lenguaje no-diagnóstico. Disclaimer visible (patrón ECG/informes).
- **No** se persiste la foto (se descarta tras extraer, igual que comidas).
- **No** ajuste dinámico "en vivo" al abrir el checklist — el ajuste viene solo del informe diario de la noche anterior. Sin informe generado → plan base tal cual (caso normal, sin aviso).
- **No** se recalcula el historial al editar/borrar un suplemento (snapshot, mismo invariante que `meal_item`).

## Decisiones cerradas (Q&A con el usuario)

- **Flujo foto-primero**: fotografiás la etiqueta (componentes/dosis) → la IA extrae → confirmás/corregís → catálogo. La IA arma el plan desde el catálogo completo + `athleteContext`.
- **Explicación de componentes persistida** (pedido del usuario): en la misma extracción, la IA genera un texto que explica **qué es y para qué sirve cada componente** del suplemento. Queda guardado en el catálogo y se consulta cuando se quiera (detalle del suplemento). Lenguaje informativo no-prescriptivo (anclaje no-médico). Para altas manuales, botón "Explicar con IA" que lo genera a demanda.
- **Franjas, no horas**: `desayuno | almuerzo | cena | post_entreno | antes_de_dormir` (constante en `shared/`). Es como se dosifica en la práctica; el checklist agrupa por franja.
- **Regenerar + editar**: el plan lo propone la IA; el usuario puede regenerarlo con una nota libre ("el zinc me cae mal a la mañana") y también editar ítems a mano (franja/frecuencia/dosis).
- **Ajuste diario piggyback del informe** (idea del usuario): `generateReport` (diario) recibe además plan + tomas recientes + catálogo, y devuelve un ajuste estructurado para el día siguiente. La IA infiere de los **nombres** de lo comido (no hay micros minerales numéricos) — se presenta como sugerencia con motivo, no como cálculo.
- **Solo saltear/reducir**: el ajuste nunca puede aumentar una dosis por encima del plan, y el plan nunca por encima de la etiqueta. Techo duro server-side.
- **Todo en backend** (opción A): catálogo, plan y tomas en DB. El historial debe alimentar informes y memoria del atleta, que se arman server-side. (La decisión de #2a de tener la meta en el móvil no aplica: aquello era un cómputo puro client-side; esto es generación IA server-side.)
- **Plan sincrónico**: generar el plan sobre un catálogo chico tarda ~5-15s → request sincrónica con spinner (mismo razonamiento que la extracción de comidas; muy por debajo del corte de ~60s de okhttp).

## Diseño

### 1. Shared (`shared/src/schemas/supplements.ts` + `shared/src/supplements/`)

```ts
export const TakeSlotSchema = z.enum(["desayuno", "almuerzo", "cena", "post_entreno", "antes_de_dormir"]);
export const SupplementSourceSchema = z.enum(["label", "estimate"]); // reusa la semántica de comidas
export const TakeStatusSchema = z.enum(["taken", "deviated", "skipped"]);

export const SupplementComponentSchema = z.object({
  name: z.string().min(1),          // "Magnesio (citrato)"
  amount: z.number().positive(),    // 375
  unit: z.string().min(1),          // "mg"
});

export const SupplementSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  brand: z.string().nullish(),
  servingLabel: z.string().min(1),        // "1 cápsula", "5 g de polvo"
  components: z.array(SupplementComponentSchema),
  labelMaxPerDay: z.string().nullish(),   // texto de etiqueta: "1 cápsula al día"
  source: SupplementSourceSchema,
  info: z.string().nullish(),             // explicación IA: qué es y para qué sirve cada componente
  notes: z.string().nullish(),
});

export const FrequencySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("daily") }),
  z.object({ type: z.literal("every_other_day"), anchorDate: z.string() }), // YYYY-MM-DD que fija la paridad
  z.object({ type: z.literal("weekdays"), days: z.array(z.number().int().min(0).max(6)).nonempty() }),
]);

export const PlanItemSchema = z.object({
  id: z.string().uuid(),
  supplementId: z.string().uuid(),
  slot: TakeSlotSchema,
  frequency: FrequencySchema,
  dose: z.string().min(1),          // "5 g", "1 cápsula"
  reason: z.string().nullish(),     // motivo corto de la IA
});

export const AdjustmentItemSchema = z.object({
  supplementId: z.string().uuid(),
  action: z.enum(["skip", "reduce"]),  // NUNCA increase (validado con Zod, techo server-side)
  dose: z.string().nullish(),          // solo para reduce
  reason: z.string().min(1),
});
```

**`shared/src/supplements/checklist.ts` — `resolveDayChecklist` (función pura, corazón testeable):**

```ts
resolveDayChecklist({ planItems, supplements, adjustments, takes, date }): DayChecklistEntry[]
// - filtra planItems cuya frequency aplica a `date` (daily; every_other_day por paridad
//   de días desde anchorDate; weekdays por getDay en hora local del dispositivo)
// - aplica adjustments del día (skip → entrada marcada "ajustada" con motivo; reduce → dosis efectiva)
// - mergea takes ya registradas (estado + dosis real)
// - agrupa por slot en el orden canónico de TakeSlotSchema
// Entrada de ajuste con supplementId que no está en el plan del día → se ignora silenciosamente.
```

### 2. Backend — DB (migración **0016**)

```
supplement            id, user_id, name, brand, serving_label, components jsonb,
                      label_max_per_day, source, info, notes, created_at
supplement_plan       id, user_id, status ('active'|'archived'), user_note, created_at
                      -- un 'active' por usuario; regenerar archiva el anterior (historial de planes)
supplement_plan_item  id, plan_id, supplement_id (FK), slot, frequency jsonb, dose, reason
supplement_take       id, user_id, date (date), plan_item_id (FK nullable, on delete SET NULL — precedente meal_item.food_id: el snapshot sobrevive),
                      -- snapshot (invariante meal_item): el historial no cambia si se edita el catálogo/plan
                      supplement_name, planned_dose, slot,
                      status ('taken'|'deviated'|'skipped'), actual_dose, note, created_at
                      UNIQUE (user_id, date, plan_item_id) → upsert idempotente
supplement_adjustment id, user_id, for_date (date), items jsonb (AdjustmentItem[]),
                      report_id (FK a report), created_at
                      UNIQUE (user_id, for_date) → el último informe generado del día pisa al anterior
```

### 3. Backend — IA (`AiClient`)

- **`extractSupplement({ imageBase64, mediaType, apiKey })`** — patrón `extractFood` (Opus visión, tool use): devuelve `{ name, brand?, servingLabel, components[], labelMaxPerDay?, source, info }`. `info` = texto plano (patrón informes, sin markdown) explicando qué es y para qué sirve cada componente, en lenguaje informativo no-prescriptivo. Etiqueta legible → `label`; si no → `estimate`. Anti-inyección: la etiqueta es dato, no instrucción.
- **`explainSupplement({ supplement, apiKey })`** — genera `info` a demanda para altas manuales (o para regenerarla tras editar componentes). Mismo prompt de explicación que la extracción, sin visión.
- **`generateSupplementPlan({ catalog, athleteContext, userNote, apiKey })`** — Opus, tool use estructurado → `PlanItem[]` (sin ids; el backend los asigna). Prompt anclado: dosis de etiqueta como techo, franjas del enum, motivo corto por ítem, no-médico. **Validación server-side post-IA**: ítems con `supplementId` desconocido se descartan; plan vacío → 422 con mensaje claro.
- **`generateReport` (extendido, solo `kind: "daily"`)** — el prompt suma una sección "suplementos" (plan del día, tomas marcadas, catálogo resumido) y el tool schema suma `supplementAdjustment: AdjustmentItem[]` opcional (para **mañana**). El texto del informe pasa a mencionar la adherencia. Zod valida que `action ∈ {skip, reduce}` — cualquier otra cosa se descarta ítem por ítem. Informes periódicos (semana/quincena/mes): solo adherencia en el texto, **sin** ajuste.

### 4. Backend — rutas (`/nutrition/supplements/*`, ya cubierto por `app.use("/nutrition/*", auth)`)

```
POST   /nutrition/supplements/extract        foto base64 → borrador extraído (NO persiste)
POST   /nutrition/supplements                alta (confirmación del borrador o carga manual)
GET    /nutrition/supplements                catálogo
PATCH  /nutrition/supplements/:id            editar
DELETE /nutrition/supplements/:id            borrar (el plan lo pierde al regenerar; historial intacto)
POST   /nutrition/supplements/:id/explain    genera y guarda `info` (altas manuales / regenerar)
POST   /nutrition/supplements/plan/generate  { athleteContext, userNote? } → plan nuevo (archiva el anterior)
GET    /nutrition/supplements/plan           plan activo + ítems (join con supplement para nombres)
PATCH  /nutrition/supplements/plan/items/:id editar franja/frecuencia/dosis a mano
GET    /nutrition/supplements/day?date=      checklist resuelto (usa resolveDayChecklist)
PUT    /nutrition/supplements/takes          { date, planItemId, status, actualDose?, note? } upsert
```

Scoping por `c.get("userId")` en todo (lección #79). Ownership check en `:id` ajenos → 404.

### 5. Mobile (tab Nutrición)

- **Sección "Suplementos de hoy"** en `(tabs)/nutricion.tsx` (debajo de la card de calorías, arriba de comidas): checklist agrupado por franja; tap = tomado ✓; botón secundario por ítem → desvío (input de dosis real + nota) o salteado. Ítems ajustados por la IA se muestran atenuados con el motivo. Día sin tomas → "Hoy no toca ningún suplemento". Respeta el navegador de fechas del tab (offset); los días pasados también se pueden marcar (backfill de un día olvidado, consistente con comidas/métricas). Nota: si el plan se regeneró después, el checklist de un día pasado se resuelve contra el plan **activo** — las tomas ya registradas de un plan archivado se muestran por su snapshot.
- **`nutricion/suplementos.tsx`**: catálogo + "Agregar por foto" (picker → base64 → extract → form precargado para corregir → confirmar) + carga manual (mismo form vacío). Patrón `agregar-alimento`. Tap en un suplemento → **detalle expandido**: componentes con cantidades + la explicación `info` de la IA (consultable siempre); si falta `info` (alta manual), botón "Explicar con IA".
- **`nutricion/plan-suplementos.tsx`**: plan por franja con motivos, "Regenerar plan" (campo de nota libre + spinner), edición por ítem. Disclaimer no-médico. Estado vacío (sin catálogo) → CTA a agregar suplementos.
- Cliente API `src/api/supplements.ts`; el `athleteContext` se arma con el helper existente de informes.

### 6. Errores y bordes

- IA caída / sin key en extract o plan → mensaje claro + camino manual (alta manual; el plan puede editarse a mano sobre el último generado).
- Informe no generado anoche → sin fila en `supplement_adjustment` → plan base (flujo normal).
- `PATCH` de un plan item con frecuencia/franja inválida → 400 por Zod.
- Ajuste para suplemento que no toca ese día → ignorado por `resolveDayChecklist`.
- Timezone: `date` de tomas/ajustes es el **día calendario del dispositivo** (el móvil manda `YYYY-MM-DD`), consistente con el navegador de fechas del tab.

### 7. Testing (TDD)

- **shared**: `resolveDayChecklist` exhaustivo — daily / every_other_day (paridad con anchorDate, cruces de mes) / weekdays; ajustes skip/reduce; ajuste huérfano; merge de takes; agrupación por franja. Schemas: rechazo de `action: "increase"`.
- **backend**: repositorio (CRUD, un solo plan activo, upsert de takes, unique de adjustment); rutas (auth, scoping, ownership, 422 plan vacío); `AiClient` nuevos métodos con el patrón de mocks existente; extensión de `generateReport` (con y sin datos de suplementos).
- **mobile**: jest + RNTL — checklist (marcar tomado/desvío, agrupación, estado vacío), alta por foto (mock del picker + API), plan (regenerar con nota, editar ítem).

### 8. Entrega — 3 PRs verticales

1. **PR1 — Catálogo por foto**: migración 0016 (las 4 tablas de una, para no fragmentar), schemas shared, `extractSupplement` + `explainSupplement`, rutas de catálogo + `/explain`, `suplementos.tsx` (foto + manual + detalle con explicación). Utilizable solo (lista de suplementos con composición y para qué sirve cada cosa).
2. **PR2 — Plan IA + checklist**: `generateSupplementPlan`, rutas de plan/day/takes, `resolveDayChecklist`, sección en el tab + `plan-suplementos.tsx`.
3. **PR3 — Ajuste dinámico + adherencia**: extensión de `generateReport` (ajuste estructurado + adherencia en el texto), persistencia del adjustment, ajustes visibles en el checklist.

Cada PR: rama propia, review (CodeRabbit / `@claude review`), squash a `main`, **OTA tras el merge** (regla vigente: publicar siempre, verificando runtime `784872cb…`). Los merges de PR1-3 redeployan el backend a la Pi automáticamente (migración 0016 auto-corre en PR1).
