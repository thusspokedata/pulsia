import { test, expect } from "bun:test";
import { createApp } from "../app";
import { food, meal, mealItem, waterLog, bodyMetric, supplementPlanItem, supplementAdjustment } from "../db/schema";

const KEY = "a".repeat(64);
const FOOD_ID = "11111111-1111-4111-8111-111111111111";
const IMG_BASE64 = Buffer.from("fake jpeg bytes").toString("base64");

const bananaRow = {
  id: FOOD_ID, userId: "single-user", name: "Banana", basis: "per_100g",
  kcal: 89, proteinG: 1.1, carbsG: 23, fatG: 0.3, unitWeightG: 120, createdAt: new Date(0),
  sourceMacros: "ai", sourceMicros: null, usdaFdcId: null,
  saturatedFatG: 0.1, sugarsG: 12, fiberG: 2.6, sodiumMg: 0,
};

function fakeDb(opts: {
  foods?: any[]; meals?: any[]; items?: any[]; foodRow?: any; mealFull?: any; water?: any[]; goal?: any;
  settingsRow?: any; report?: any; sessions?: any[]; metrics?: any[];
  planRow?: any | null; planItemRows?: any[];
} = {}) {
  const inserts: any[] = [];
  const db: any = {
    _inserts: inserts,
    insert: (table: any) => ({
      values(v: any) {
        const rows = (Array.isArray(v) ? v : [v]).map((r, i) => ({ id: r.id ?? `${FOOD_ID.slice(0, -1)}${i}`, createdAt: new Date(0), ...r }));
        inserts.push({ table, rows });
        const p: any = Promise.resolve(rows);
        p.returning = async () => rows;
        // onConflictDoUpdate puede encadenar .returning() (upsertReport) o awaitearse directo
        // (upsertAdjustment/goal) — devolvemos algo que soporta ambos usos.
        p.onConflictDoUpdate = () => {
          const p2: any = Promise.resolve(rows);
          p2.returning = async () => rows;
          return p2;
        };
        return p;
      },
    }),
    update: () => ({ set: () => ({ where: () => { const p: any = Promise.resolve([]); p.returning = async () => (opts.foodRow ? [opts.foodRow] : []); return p; } }) }),
    delete: () => ({ where: () => { const p: any = Promise.resolve(undefined); p.returning = async () => [{ id: FOOD_ID }]; return p; } }),
    // select().from(table)[.innerJoin(...)].where()[.orderBy()] — table-aware (mismo patrón que
    // supplements.test.ts): cada tabla real del collect de informes necesita su propio balde de
    // filas para no pisarse entre sí (meals/water/metrics/plan/catálogo son independientes).
    select: (_fields?: any) => ({
      from: (table: any) => {
        let joins = 0;
        const chain: any = {
          innerJoin: () => {
            joins++;
            return chain;
          },
          where: () => {
            let rows: any[];
            if (table === food) rows = opts.foods ?? [];
            else if (table === meal) rows = opts.meals ?? [];
            else if (table === mealItem) rows = opts.items ?? [];
            else if (table === waterLog) rows = opts.water ?? [];
            else if (table === bodyMetric) rows = opts.metrics ?? [];
            else if (table === supplementPlanItem) rows = joins === 1 ? (opts.planItemRows ?? []) : [];
            else rows = []; // incluye `supplement` (catálogo): no lo necesitan los tests actuales
            const p: any = Promise.resolve(rows);
            p.orderBy = async () => rows;
            return p;
          },
        };
        return chain;
      },
    }),
    transaction: async (fn: any) => fn(db),
    query: {
      food: { findFirst: async () => opts.foodRow ?? null },
      meal: { findFirst: async () => opts.mealFull ?? (opts.meals?.[0] ? { userId: opts.meals[0].userId } : null) },
      settings: { findFirst: async () => opts.settingsRow ?? { aiApiKeyEncrypted: null } },
      nutritionGoal: { findFirst: async () => opts.goal ?? null },
      report: { findFirst: async () => opts.report ?? null },
      supplementPlan: { findFirst: async () => opts.planRow ?? null },
      workoutSession: { findMany: async () => opts.sessions ?? [] },
    },
  };
  return db;
}

const baseConfig = { encryptionKey: KEY, defaultModel: "claude-sonnet-4-6", inviteCode: "x", sessionTtlDays: 4, singleUserMode: true, defaultAiApiKey: "sk-x" };
const aiClient = {
  generateProgram: async () => ({ name: "x", weeks: [] }),
  extractFood: async () => ({ name: "Banana", basis: "per_100g", kcal: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3, unitWeightG: 120, sourceMacros: "ai", sourceMicros: null }),
  describeFood: async () => ({
    name: "Almendra", basis: "per_100g" as const, kcal: 579, protein_g: 21, carbs_g: 22, fat_g: 50,
    saturated_fat_g: 3.8, sugars_g: 4.4, fiber_g: 12.5, sodium_mg: 0, cholesterol_mg: 0, water_ml: 4,
    unitWeightG: 1.2, sourceMacros: "ai" as const, sourceMicros: null,
  }),
};
const deps = (db: any, aiClientOverride: any = aiClient): any => ({ db, config: baseConfig, aiClient: aiClientOverride });

test("POST /nutrition/foods/extract → devuelve la extracción sin persistir", async () => {
  const app = createApp(deps(fakeDb()));
  const res = await app.request("/nutrition/foods/extract", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageBase64: IMG_BASE64, mediaType: "image/jpeg" }),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ name: "Banana", sourceMacros: "ai", sourceMicros: null });
});

test("POST /nutrition/foods/extract rechaza mediaType inválido", async () => {
  const app = createApp(deps(fakeDb()));
  const res = await app.request("/nutrition/foods/extract", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageBase64: IMG_BASE64, mediaType: "application/pdf" }),
  });
  expect(res.status).toBe(400);
});

test("POST /nutrition/foods crea un alimento con micros", async () => {
  const db = fakeDb();
  const app = createApp(deps(db));
  const res = await app.request("/nutrition/foods", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Muesli", basis: "per_100g", kcal: 442, protein_g: 9.9, carbs_g: 63, fat_g: 14.8, unitWeightG: null, sourceMacros: "label", sourceMicros: "usda", usdaFdcId: 168871, saturated_fat_g: 4.2, sugars_g: 14, fiber_g: 8.4, sodium_mg: 80, zinc_mg: 1.9 }),
  });
  expect(res.status).toBe(200);
  // el insert recibió los micros mapeados a las columnas drizzle
  const inserted = db._inserts.at(-1).rows[0];
  expect(inserted).toMatchObject({
    sugarsG: 14, fiberG: 8.4, saturatedFatG: 4.2, sodiumMg: 80, zincMg: 1.9,
    sourceMacros: "label", sourceMicros: "usda", usdaFdcId: 168871,
  });
});

test("POST /nutrition/meals snapshotea macros desde el catálogo (ignora los del cliente)", async () => {
  const db = fakeDb({ foods: [bananaRow] });
  const app = createApp(deps(db));
  const res = await app.request("/nutrition/meals", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ eatenAt: 1_700_000_000_000, items: [{ foodId: FOOD_ID, quantity: 1, quantityUnit: "unit" }] }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.items[0]).toMatchObject({ foodName: "Banana", grams: 120, kcal: 107 });
  expect(body.items[0]).toMatchObject({ sugars_g: 14.4, fiber_g: 3.1 }); // 12/2.6 * 1.2
});

test("POST /nutrition/meals 409 si el foodId no es del usuario", async () => {
  const app = createApp(deps(fakeDb({ foods: [] }))); // catálogo vacío → food no encontrado
  const res = await app.request("/nutrition/meals", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ eatenAt: 1, items: [{ foodId: FOOD_ID, quantity: 1, quantityUnit: "unit" }] }),
  });
  expect(res.status).toBe(409);
});

const MEAL_ID = "22222222-2222-4222-8222-222222222222";
const validMealBody = JSON.stringify({ eatenAt: 1, items: [{ foodId: FOOD_ID, quantity: 1, quantityUnit: "unit" }] });

// El contrato nuevo: PATCH /meals ya no pre-chequea getMealOwner (evita fuga 409 vs 404);
// updateMeal devuelve null para comida inexistente o de otro usuario → 404 uniforme.
test("PATCH /nutrition/meals/:id 404 si la comida no existe", async () => {
  const app = createApp(deps(fakeDb())); // sin meals → getMealOwner null → updateMeal null
  const res = await app.request(`/nutrition/meals/${MEAL_ID}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: validMealBody,
  });
  expect(res.status).toBe(404);
});

test("PATCH /nutrition/meals/:id 404 si la comida es de otro usuario (no filtra existencia)", async () => {
  const app = createApp(deps(fakeDb({ meals: [{ userId: "otro-usuario" }] })));
  const res = await app.request(`/nutrition/meals/${MEAL_ID}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: validMealBody,
  });
  expect(res.status).toBe(404); // NO 409 — mismo status que "no existe"
});

const MEAL_ID2 = "44444444-4444-4444-8444-444444444444";

test("GET /nutrition/foods/:id → 200 con el alimento", async () => {
  const app = createApp(deps(fakeDb({ foodRow: bananaRow })));
  const res = await app.request(`/nutrition/foods/${FOOD_ID}`);
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ id: FOOD_ID, name: "Banana", sugars_g: 12 });
});

test("GET /nutrition/foods/:id → 404 si no existe", async () => {
  const res = await createApp(deps(fakeDb())).request(`/nutrition/foods/${FOOD_ID}`);
  expect(res.status).toBe(404);
});

test("PATCH /nutrition/foods/:id → 200 con el alimento actualizado", async () => {
  const app = createApp(deps(fakeDb({ foodRow: { ...bananaRow, name: "Banana madura" } })));
  const res = await app.request(`/nutrition/foods/${FOOD_ID}`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Banana madura", basis: "per_100g", kcal: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3, unitWeightG: 120, sourceMacros: "ai", sourceMicros: null, sugars_g: 15 }),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ name: "Banana madura" });
});

test("PATCH /nutrition/foods/:id → 404 si no existe", async () => {
  const res = await createApp(deps(fakeDb())).request(`/nutrition/foods/${FOOD_ID}`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "X", basis: "per_100g", kcal: 1, protein_g: 0, carbs_g: 0, fat_g: 0, unitWeightG: null, sourceMacros: "ai", sourceMicros: null }),
  });
  expect(res.status).toBe(404);
});

test("PATCH /nutrition/foods/:id → 400 con body inválido", async () => {
  const res = await createApp(deps(fakeDb({ foodRow: bananaRow }))).request(`/nutrition/foods/${FOOD_ID}`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "", basis: "per_100g", kcal: 1, protein_g: 0, carbs_g: 0, fat_g: 0, unitWeightG: null, sourceMacros: "ai", sourceMicros: null }),
  });
  expect(res.status).toBe(400);
});

test("GET /nutrition/meals/:id → 200 con la comida", async () => {
  const app = createApp(deps(fakeDb({ mealFull: { id: MEAL_ID2, userId: "single-user", eatenAt: 123, mealType: "desayuno", note: null }, foods: [] })));
  const res = await app.request(`/nutrition/meals/${MEAL_ID2}`);
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ id: MEAL_ID2, eatenAt: 123, mealType: "desayuno", items: [] });
});

test("GET /nutrition/meals/:id → 404 si no existe", async () => {
  const res = await createApp(deps(fakeDb())).request(`/nutrition/meals/${MEAL_ID2}`);
  expect(res.status).toBe(404);
});

test("POST /nutrition/water registra agua y devuelve la fila", async () => {
  const db = fakeDb();
  const app = createApp(deps(db));
  const res = await app.request("/nutrition/water", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ml: 250, loggedAt: 1_700_000_000_000 }),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ ml: 250, loggedAt: 1_700_000_000_000 });
});

test("POST /nutrition/water rechaza ml <= 0", async () => {
  const res = await createApp(deps(fakeDb())).request("/nutrition/water", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ml: 0, loggedAt: 1 }),
  });
  expect(res.status).toBe(400);
});

test("GET /nutrition/water lista las cargas del rango", async () => {
  const db = fakeDb({ water: [{ id: "w1", ml: 250, loggedAt: 1_700_000_000_000 }] });
  const res = await createApp(deps(db)).request("/nutrition/water?from=0&to=9999999999999");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual([{ id: "w1", ml: 250, loggedAt: 1_700_000_000_000 }]);
});

test("DELETE /nutrition/water/:id → 200", async () => {
  const res = await createApp(deps(fakeDb())).request("/nutrition/water/11111111-1111-4111-8111-111111111111", { method: "DELETE" });
  expect(res.status).toBe(200);
});

test("GET /nutrition/goal devuelve mantenimiento por defecto", async () => {
  const res = await createApp(deps(fakeDb())).request("/nutrition/goal");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ objective: "maintain", rateKgPerWeek: 0, manualKcal: null });
});

test("PUT /nutrition/goal guarda y devuelve el objetivo", async () => {
  const res = await createApp(deps(fakeDb())).request("/nutrition/goal", {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ objective: "lose", rateKgPerWeek: 0.5, manualKcal: null }),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ objective: "lose", rateKgPerWeek: 0.5 });
});

test("PUT /nutrition/goal rechaza objetivo inválido", async () => {
  const res = await createApp(deps(fakeDb())).request("/nutrition/goal", {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ objective: "bulk", rateKgPerWeek: 0.5 }),
  });
  expect(res.status).toBe(400);
});

// ---- Informes del agente (#4) ----

test("POST /nutrition/reports/generate 403 si reportsEnabled=false", async () => {
  const app = createApp(deps(fakeDb({ settingsRow: { reportsEnabled: false, aiApiKeyEncrypted: null } })));
  const res = await app.request("/nutrition/reports/generate", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "daily", periodStart: 0, periodEnd: 10, athleteContext: { goal: { status: "incomplete" } } }),
  });
  expect(res.status).toBe(403);
});

test("POST /nutrition/reports/generate devuelve el existente sin llamar a la IA", async () => {
  const existing = { id: "r1", kind: "daily", periodStart: 0, periodEnd: 10, content: "viejo", createdAt: new Date(0) };
  const app = createApp(deps(fakeDb({ settingsRow: { reportsEnabled: true, aiApiKeyEncrypted: null }, report: existing })));
  const res = await app.request("/nutrition/reports/generate", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "daily", periodStart: 0, periodEnd: 10, athleteContext: { goal: { status: "incomplete" } } }),
  });
  expect(res.status).toBe(200);
  expect((await res.json()).content).toBe("viejo");
});

// ---- PR3: persistencia del ajuste de suplementos tras el informe diario ----

const SUP_ID = "77777777-7777-4777-8777-777777777777";
const SUP_UNKNOWN = "88888888-8888-4888-8888-888888888888";
const REPORT_PLAN_ID = "66666666-6666-4666-8666-666666666666";
const REPORT_ITEM_ID = "99999999-9999-4999-8999-999999999999";

// 1 sesión dentro del período (0..10) alcanza para que hasAnyData() sea true y el flujo
// llegue a llamar a la IA (el resto de listas/metrics quedan vacías por defecto en fakeDb).
const oneSession = [{ id: "sess1", programId: null, weekNumber: 1, dayLabel: "A", location: "gym", startedAt: 1, endedAt: 2, totalDurationMs: 3600000, notes: null }];
const activePlanRow = { id: REPORT_PLAN_ID, userNote: null, createdAt: new Date(0) };
const activePlanItemRows = [{
  id: REPORT_ITEM_ID, planId: REPORT_PLAN_ID, supplementId: SUP_ID,
  slot: "desayuno", frequency: { type: "daily" }, dose: "1 cápsula", reason: null,
  supplementName: "Zinc",
}];

function reportsEnabledDb(overrides: any = {}) {
  return fakeDb({ settingsRow: { reportsEnabled: true, aiApiKeyEncrypted: null }, sessions: oneSession, ...overrides });
}

function generateReportBody(overrides: any = {}) {
  return JSON.stringify({
    kind: "daily", periodStart: 0, periodEnd: 10,
    athleteContext: { goal: { status: "incomplete" } },
    ...overrides,
  });
}

test("POST /nutrition/reports/generate (daily + adjustmentForDate): ajuste válido → upsertAdjustment con forDate + reportId + el item", async () => {
  const adjustment = [{ supplementId: SUP_ID, action: "skip", reason: "comiste rico en zinc" }];
  const genAiClient = { ...aiClient, generateReport: async () => ({ content: "informe", memoryNotes: [], supplementAdjustment: adjustment }) };
  const db = reportsEnabledDb({ planRow: activePlanRow, planItemRows: activePlanItemRows });
  const app = createApp(deps(db, genAiClient));
  const res = await app.request("/nutrition/reports/generate", {
    method: "POST", headers: { "content-type": "application/json" },
    body: generateReportBody({ adjustmentForDate: "2026-07-16" }),
  });
  expect(res.status).toBe(200);
  const saved = await res.json();
  const insertedAdjustment = db._inserts.find((i: any) => i.table === supplementAdjustment);
  expect(insertedAdjustment).toBeDefined();
  expect(insertedAdjustment.rows[0]).toMatchObject({
    userId: "00000000-0000-0000-0000-000000000001", forDate: "2026-07-16", reportId: saved.id, items: adjustment,
  });
});

test("POST /nutrition/reports/generate: ítem con supplementId desconocido se filtra (no está en el plan activo)", async () => {
  const adjustment = [
    { supplementId: SUP_ID, action: "skip", reason: "comiste rico en zinc" },
    { supplementId: SUP_UNKNOWN, action: "skip", reason: "alucinado" },
  ];
  const genAiClient = { ...aiClient, generateReport: async () => ({ content: "informe", memoryNotes: [], supplementAdjustment: adjustment }) };
  const db = reportsEnabledDb({ planRow: activePlanRow, planItemRows: activePlanItemRows });
  const app = createApp(deps(db, genAiClient));
  const res = await app.request("/nutrition/reports/generate", {
    method: "POST", headers: { "content-type": "application/json" },
    body: generateReportBody({ adjustmentForDate: "2026-07-16" }),
  });
  expect(res.status).toBe(200);
  const insertedAdjustment = db._inserts.find((i: any) => i.table === supplementAdjustment);
  expect(insertedAdjustment).toBeDefined();
  expect(insertedAdjustment.rows[0].items).toEqual([{ supplementId: SUP_ID, action: "skip", reason: "comiste rico en zinc" }]);
});

test("POST /nutrition/reports/generate: todos los supplementId desconocidos → nada se persiste", async () => {
  const adjustment = [{ supplementId: SUP_UNKNOWN, action: "skip", reason: "alucinado" }];
  const genAiClient = { ...aiClient, generateReport: async () => ({ content: "informe", memoryNotes: [], supplementAdjustment: adjustment }) };
  const db = reportsEnabledDb({ planRow: activePlanRow, planItemRows: activePlanItemRows });
  const app = createApp(deps(db, genAiClient));
  const res = await app.request("/nutrition/reports/generate", {
    method: "POST", headers: { "content-type": "application/json" },
    body: generateReportBody({ adjustmentForDate: "2026-07-16" }),
  });
  expect(res.status).toBe(200);
  expect(db._inserts.find((i: any) => i.table === supplementAdjustment)).toBeUndefined();
});

test("POST /nutrition/reports/generate: dos items con el mismo supplementId (skip + reduce) → solo persiste el primero", async () => {
  const adjustment = [
    { supplementId: SUP_ID, action: "skip", reason: "comiste rico en zinc" },
    { supplementId: SUP_ID, action: "reduce", dose: "media dosis", reason: "contradictorio" },
  ];
  const genAiClient = { ...aiClient, generateReport: async () => ({ content: "informe", memoryNotes: [], supplementAdjustment: adjustment }) };
  const db = reportsEnabledDb({ planRow: activePlanRow, planItemRows: activePlanItemRows });
  const app = createApp(deps(db, genAiClient));
  const res = await app.request("/nutrition/reports/generate", {
    method: "POST", headers: { "content-type": "application/json" },
    body: generateReportBody({ adjustmentForDate: "2026-07-16" }),
  });
  expect(res.status).toBe(200);
  const insertedAdjustment = db._inserts.find((i: any) => i.table === supplementAdjustment);
  expect(insertedAdjustment).toBeDefined();
  expect(insertedAdjustment.rows[0].items).toEqual([{ supplementId: SUP_ID, action: "skip", reason: "comiste rico en zinc" }]);
});

test("POST /nutrition/reports/generate: kind weekly con ajuste en el output de la IA → NO persiste", async () => {
  const adjustment = [{ supplementId: SUP_ID, action: "skip", reason: "comiste rico en zinc" }];
  const genAiClient = { ...aiClient, generateReport: async () => ({ content: "informe", memoryNotes: [], supplementAdjustment: adjustment }) };
  const db = reportsEnabledDb({ planRow: activePlanRow, planItemRows: activePlanItemRows });
  const app = createApp(deps(db, genAiClient));
  const res = await app.request("/nutrition/reports/generate", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "weekly", periodStart: 0, periodEnd: 10,
      athleteContext: { goal: { status: "incomplete" } }, adjustmentForDate: "2026-07-16",
    }),
  });
  expect(res.status).toBe(200);
  expect(db._inserts.find((i: any) => i.table === supplementAdjustment)).toBeUndefined();
});

test("POST /nutrition/reports/generate: daily SIN adjustmentForDate → NO persiste aunque la IA devuelva ajuste", async () => {
  const adjustment = [{ supplementId: SUP_ID, action: "skip", reason: "comiste rico en zinc" }];
  const genAiClient = { ...aiClient, generateReport: async () => ({ content: "informe", memoryNotes: [], supplementAdjustment: adjustment }) };
  const db = reportsEnabledDb({ planRow: activePlanRow, planItemRows: activePlanItemRows });
  const app = createApp(deps(db, genAiClient));
  const res = await app.request("/nutrition/reports/generate", {
    method: "POST", headers: { "content-type": "application/json" },
    body: generateReportBody(), // sin adjustmentForDate
  });
  expect(res.status).toBe(200);
  expect(db._inserts.find((i: any) => i.table === supplementAdjustment)).toBeUndefined();
});

test("POST /nutrition/reports/generate: daily con adjustmentForDate pero supplementAdjustment vacío → NO persiste", async () => {
  const genAiClient = { ...aiClient, generateReport: async () => ({ content: "informe", memoryNotes: [], supplementAdjustment: [] }) };
  const db = reportsEnabledDb({ planRow: activePlanRow, planItemRows: activePlanItemRows });
  const app = createApp(deps(db, genAiClient));
  const res = await app.request("/nutrition/reports/generate", {
    method: "POST", headers: { "content-type": "application/json" },
    body: generateReportBody({ adjustmentForDate: "2026-07-16" }),
  });
  expect(res.status).toBe(200);
  expect(db._inserts.find((i: any) => i.table === supplementAdjustment)).toBeUndefined();
});

test("POST /nutrition/reports/generate: daily con ajuste pero SIN plan activo → NO persiste (se ignora)", async () => {
  const adjustment = [{ supplementId: SUP_ID, action: "skip", reason: "comiste rico en zinc" }];
  const genAiClient = { ...aiClient, generateReport: async () => ({ content: "informe", memoryNotes: [], supplementAdjustment: adjustment }) };
  const db = reportsEnabledDb({ planRow: null }); // sin plan activo
  const app = createApp(deps(db, genAiClient));
  const res = await app.request("/nutrition/reports/generate", {
    method: "POST", headers: { "content-type": "application/json" },
    body: generateReportBody({ adjustmentForDate: "2026-07-16" }),
  });
  expect(res.status).toBe(200);
  expect(db._inserts.find((i: any) => i.table === supplementAdjustment)).toBeUndefined();
});

// ---- Alta por texto (#foods/describe) ----

const ALMENDRA = {
  name: "Almendra", basis: "per_100g" as const, kcal: 579, protein_g: 21, carbs_g: 22, fat_g: 50,
  saturated_fat_g: 3.8, sugars_g: 4.4, fiber_g: 12.5, sodium_mg: 0, cholesterol_mg: 0, water_ml: 4,
  unitWeightG: 1.2, sourceMacros: "ai" as const, sourceMicros: null,
};

const describePost = (app: any, text: string) =>
  app.request("/nutrition/foods/describe", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });

test("POST /nutrition/foods/describe → devuelve el alimento estimado desde el texto, sin persistir", async () => {
  const res = await describePost(createApp(deps(fakeDb())), "almendra");
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ name: "Almendra", kcal: 579 });
});

test("POST /nutrition/foods/describe: el server PISA el source aunque la IA diga 'label'", async () => {
  // Por texto no hay etiqueta que leer. Si el modelo dijera "label" porque cree saber la etiqueta
  // de una marca, el catálogo mentiría sobre la procedencia del dato.
  const mentiroso = { ...aiClient, describeFood: async () => ({ ...ALMENDRA, source: "label" as const }) };
  const res = await describePost(createApp(deps(fakeDb(), mentiroso)), "almendra");
  expect(res.status).toBe(200);
  expect((await res.json()).source).toBe("estimate");
});

test("POST /nutrition/foods/describe: texto muy corto → 400", async () => {
  expect((await describePost(createApp(deps(fakeDb())), "a")).status).toBe(400);
});

test("POST /nutrition/foods/describe: texto larguísimo → 400 (no se paga por tokenizar una novela)", async () => {
  expect((await describePost(createApp(deps(fakeDb())), "x".repeat(101))).status).toBe(400);
});

test("POST /nutrition/foods/describe: si la IA falla → 502 con el mensaje de cargarlo a mano", async () => {
  const roto = { ...aiClient, describeFood: async () => { throw new Error("boom"); } };
  const res = await describePost(createApp(deps(fakeDb(), roto)), "almendra");
  expect(res.status).toBe(502);
  expect((await res.json()).error).toMatch(/a mano/);
});
