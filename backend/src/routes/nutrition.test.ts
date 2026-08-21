import { test, expect } from "bun:test";
import { createApp } from "../app";
import { food, meal, mealItem, waterLog, bodyMetric, supplementPlanItem, supplementAdjustment, usdaFood } from "../db/schema";
import { SINGLE_USER_ID } from "../constants";

const KEY = "a".repeat(64);
const FOOD_ID = "11111111-1111-4111-8111-111111111111";
const IMG_BASE64 = Buffer.from("fake jpeg bytes").toString("base64");

const bananaRow = {
  id: FOOD_ID, userId: SINGLE_USER_ID, name: "Banana", basis: "per_100g",
  kcal: 89, proteinG: 1.1, carbsG: 23, fatG: 0.3, unitWeightG: 120, createdAt: new Date(0),
  sourceMacros: "ai", sourceMicros: null, usdaFdcId: null,
  saturatedFatG: 0.1, sugarsG: 12, fiberG: 2.6, sodiumMg: 0,
};

// El `where` de drizzle es un objeto SQL; un `eq(col, v)` viaja como [Columna, " = ", Param]
// dentro de `queryChunks`, y un `and(...)` los anida. Se leen las igualdades para que el fake
// pueda FILTRAR de verdad en vez de devolver siempre lo mismo: sin esto, un handler que ignorara
// el fdcId del body —o que se olvidara del `meal.user_id` del join— pasaría los tests igual.
interface Igualdad { tabla: string; columna: string; valor: unknown }

function igualdadesDeWhere(cond: any, out: Igualdad[] = []): Igualdad[] {
  const chunks: any[] = cond?.queryChunks ?? [];
  for (let i = 0; i < chunks.length; i++) {
    const k = chunks[i];
    if (Array.isArray(k?.queryChunks)) { igualdadesDeWhere(k, out); continue; }
    const tabla = k?.table?.[Symbol.for("drizzle:Name")];
    if (typeof tabla !== "string" || typeof k?.name !== "string") continue;
    // La columna viene seguida de " = " y del Param con el valor.
    const param = chunks.slice(i + 1, i + 4).find((c: any) => "value" in (c ?? {}) && c?.constructor?.name === "Param");
    if (param) out.push({ tabla, columna: k.name, valor: param.value });
  }
  return out;
}

function valorDe(cond: any, tabla: string, columna: string): unknown {
  return igualdadesDeWhere(cond).find((i) => i.tabla === tabla && i.columna === columna)?.valor;
}

function fdcIdDelWhere(cond: any): number | null {
  const v = valorDe(cond, "usda_food", "fdc_id");
  return typeof v === "number" ? v : null;
}

// `usdaRows` (mapa fdcId → fila) manda sobre `usdaRow` (fila única, ignora el id pedido).
function filasUsda(opts: { usdaRow?: any; usdaRows?: Record<number, any> }, cond: any): any[] {
  if (opts.usdaRows) {
    const fdcId = fdcIdDelWhere(cond);
    const fila = fdcId == null ? undefined : opts.usdaRows[fdcId];
    return fila ? [fila] : [];
  }
  return opts.usdaRow ? [opts.usdaRow] : [];
}

function fakeDb(opts: {
  foods?: any[]; meals?: any[]; items?: any[]; foodRow?: any; mealFull?: any; water?: any[]; goal?: any;
  settingsRow?: any; report?: any; sessions?: any[]; metrics?: any[];
  planRow?: any | null; planItemRows?: any[];
  // USDA: `usdaCandidates` son las filas crudas (snake_case) que devuelve el SELECT de searchUsda;
  // `usdaRow` es la fila completa (camelCase) que devuelve getUsdaFood; `usdaExecuteThrows` simula
  // la tabla vacía/rota (searchUsda tira).
  usdaCandidates?: any[]; usdaRow?: any; usdaRows?: Record<number, any>; usdaExecuteThrows?: boolean;
  // El alimento se lee OK pero el UPDATE no encuentra la fila: simula que se borró entre el
  // chequeo de existencia y la escritura (la ventana que el 404 de `usda-apply` cubre).
  foodDesaparecidoEnUpdate?: boolean;
} = {}) {
  const inserts: any[] = [];
  const updates: any[] = [];
  // El UPDATE de un ítem devuelve lo que la base "escribió": la fila del id pedido, o nada si ese
  // id no está. Sin esto, contar comidas tocadas sobre el `returning` daría el mismo número
  // aunque el UPDATE apuntara a filas que no existen.
  const filaItemDelWhere = (cond: any) => {
    const id = valorDe(cond, "meal_item", "id");
    const it = (opts.items ?? []).find((x: any) => x.id === id);
    return it ? [{ id: it.id, mealId: it.mealId }] : [];
  };
  const db: any = {
    _inserts: inserts,
    _updates: updates,
    // searchUsda usa db.execute(sql`...`). Devuelve las filas crudas o tira si la tabla está rota.
    execute: async () => {
      if (opts.usdaExecuteThrows) throw new Error("relation usda_food does not exist");
      return opts.usdaCandidates ?? [];
    },
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
    update: (table: any) => ({
      set: (values: any) => ({
        where: (cond?: any) => {
          updates.push({ table, values, cond });
          // `returning()` devuelve la fila YA actualizada, no la vieja: el re-snapshot se calcula
          // con la fila que salió del UPDATE, y con la vieja los ítems quedarían sin micros.
          const escritas = table === mealItem
            ? filaItemDelWhere(cond)
            : (opts.foodRow && !opts.foodDesaparecidoEnUpdate ? [{ ...opts.foodRow, ...values }] : []);
          const p: any = Promise.resolve([]);
          p.returning = async () => escritas;
          return p;
        },
      }),
    }),
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
          // listFoods hace `.from(food).orderBy(...)` SIN `.where()`: el catálogo compartido no
          // filtra por usuario. Sin este hermano de `where`, la lista compartida no tendría de dónde
          // salir.
          orderBy: async () => (table === food ? (opts.foods ?? []) : []),
          where: (cond?: any) => {
            let rows: any[];
            if (table === food) {
              // Honra el `user_id` del where igual que `query.food.findFirst`: los lookups del
              // catálogo (createMeal/updateMeal) ya no lo pasan (catálogo compartido), pero si algún
              // camino lo pasara, el fake debe filtrar de verdad en vez de devolver siempre todo.
              const userIdPedido = valorDe(cond, "food", "user_id");
              rows = (opts.foods ?? []).filter((f: any) => userIdPedido === undefined || f.userId === userIdPedido);
            }
            else if (table === meal) rows = opts.meals ?? [];
            // meal_item JOIN meal: el fake APLICA el join de verdad. Si lo resolviera devolviendo
            // `opts.items` tal cual, un handler que se olvidara del `meal.user_id` —o del join
            // entero— pasaría el test de aislamiento entre usuarios sin merecerlo.
            else if (table === mealItem && joins > 0) {
              const porId = new Map((opts.meals ?? []).map((m: any) => [m.id, m]));
              const foodIdPedido = valorDe(cond, "meal_item", "food_id");
              const userIdPedido = valorDe(cond, "meal", "user_id");
              rows = (opts.items ?? []).filter((it: any) => {
                const m = porId.get(it.mealId);
                if (!m) return false; // join INTERNO: un ítem sin comida no sale
                if (foodIdPedido !== undefined && it.foodId !== foodIdPedido) return false;
                if (userIdPedido !== undefined && m.userId !== userIdPedido) return false;
                return true;
              });
            }
            else if (table === mealItem) rows = opts.items ?? [];
            else if (table === waterLog) rows = opts.water ?? [];
            else if (table === bodyMetric) rows = opts.metrics ?? [];
            else if (table === supplementPlanItem) rows = joins === 1 ? (opts.planItemRows ?? []) : [];
            else if (table === usdaFood) rows = filasUsda(opts, cond); // getUsdaFood
            else rows = []; // incluye `supplement` (catálogo): no lo necesitan los tests actuales
            const p: any = Promise.resolve(rows);
            p.orderBy = async () => rows;
            p.limit = async (n: number) => rows.slice(0, n); // getUsdaFood hace .where().limit(1)
            return p;
          },
        };
        return chain;
      },
    }),
    transaction: async (fn: any) => fn(db),
    query: {
      // Honra el `user_id` del where: el alimento de OTRO usuario tiene que dar null (404), y un
      // handler que se olvidara de pasar el userId a getFood se vería.
      food: {
        findFirst: async ({ where }: any = {}) => {
          const row = opts.foodRow ?? null;
          if (!row) return null;
          const userIdPedido = valorDe(where, "food", "user_id");
          if (userIdPedido !== undefined && row.userId !== undefined && row.userId !== userIdPedido) return null;
          return row;
        },
      },
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
  extractFood: async () => ({ name: "Banana", basis: "per_100g", kcal: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3, unitWeightG: 120, sourceMacros: "ai", searchQuery: "banana raw" }),
  describeFood: async () => ({
    name: "Almendra", basis: "per_100g" as const, kcal: 579, protein_g: 21, carbs_g: 22, fat_g: 50,
    saturated_fat_g: 3.8, sugars_g: 4.4, fiber_g: 12.5, sodium_mg: 0, cholesterol_mg: 0, water_ml: 4,
    unitWeightG: 1.2, sourceMacros: "ai" as const, searchQuery: "almonds raw",
  }),
  // Por defecto no matchea ningún candidato (los tests que sí matchean pasan su propio mock).
  pickUsdaCandidate: async () => null,
  estimateFoodMicros: async () => ({ vitamin_c_mg: 8, iron_mg: 0.3, calcium_mg: 12 }),
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

// CR-4: el server re-deriva la per-100g de una receta desde sus ingredientes REALES en vez de
// confiar en lo que mandó el cliente. `bananaRow` hace de ingrediente (89 kcal/100g); el body
// manda un kcal deliberadamente mentiroso (9999) para que el test falle si el server lo persistiera tal cual.
test("POST /nutrition/foods con recipe re-deriva la per-100g en el server (ignora el kcal del cliente)", async () => {
  const db = fakeDb({ foods: [bananaRow] });
  const app = createApp(deps(db));
  const res = await app.request("/nutrition/foods", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Ensalada de banana", basis: "per_100g", kcal: 9999, protein_g: 1, carbs_g: 1, fat_g: 1,
      unitWeightG: null, sourceMacros: "recipe", sourceMicros: "ai",
      recipe: { items: [{ foodId: FOOD_ID, quantity: 100, unit: "g" }], cookedWeightG: null },
    }),
  });
  expect(res.status).toBe(200);
  const inserted = db._inserts.at(-1).rows[0];
  // 100g de banana (89 kcal/100g) sobre un peso efectivo de 100g → 89 kcal/100g derivado.
  expect(inserted.kcal).toBe(89);
  expect(inserted.kcal).not.toBe(9999);
  expect(inserted.sourceMacros).toBe("recipe");
  expect(inserted.sourceMicros).toBeNull(); // forzado por ser receta, aunque el body mandó "ai"
});

test("POST /nutrition/foods con recipe y un ingrediente inexistente → 400 (no 500)", async () => {
  const db = fakeDb({ foods: [] }); // catálogo vacío: el ingrediente referenciado no existe
  const app = createApp(deps(db));
  const res = await app.request("/nutrition/foods", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Ensalada fantasma", basis: "per_100g", kcal: 100, protein_g: 1, carbs_g: 1, fat_g: 1,
      unitWeightG: null, sourceMacros: "recipe", sourceMicros: null,
      recipe: { items: [{ foodId: FOOD_ID, quantity: 100, unit: "g" }], cookedWeightG: null },
    }),
  });
  expect(res.status).toBe(400);
  expect(db._inserts).toHaveLength(0);
});

// F5: al EDITAR una receta, el catálogo que consulta `resolveFoodInput` viene de una query SIN
// excluir el id que se está editando — la fila pre-update de `bananaRow` (id=FOOD_ID) sale en el
// `select` como si fuera un ingrediente cualquiera. Sin excluirla, una receta que se lista a sí
// misma como ingrediente derivaría "bien" (contra su propio snapshot viejo) en vez de 400.
test("PATCH /nutrition/foods/:id con recipe que se referencia a sí misma → 400, no persiste", async () => {
  const db = fakeDb({ foodRow: bananaRow, foods: [bananaRow] });
  const app = createApp(deps(db));
  const res = await app.request(`/nutrition/foods/${FOOD_ID}`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Receta autorreferenciada", basis: "per_100g", kcal: 100, protein_g: 1, carbs_g: 1, fat_g: 1,
      unitWeightG: null, sourceMacros: "recipe", sourceMicros: null,
      recipe: { items: [{ foodId: FOOD_ID, quantity: 100, unit: "g" }], cookedWeightG: null },
    }),
  });
  expect(res.status).toBe(400);
  expect(db._updates).toHaveLength(0);
});

// Contraprueba de F5: una receta que referencia a OTRO alimento (no a sí misma) se sigue pudiendo
// editar y re-deriva su per-100g en el server, igual que en el alta (F4).
test("PATCH /nutrition/foods/:id con recipe que referencia OTRO alimento → 200, re-deriva", async () => {
  const RECETA_ID = "22222222-2222-4222-8222-222222222222";
  const recetaRow = { ...bananaRow, id: RECETA_ID, name: "Ensalada de banana" };
  const db = fakeDb({ foodRow: recetaRow, foods: [bananaRow] }); // bananaRow (FOOD_ID) es el ingrediente, distinto de RECETA_ID
  const app = createApp(deps(db));
  const res = await app.request(`/nutrition/foods/${RECETA_ID}`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Ensalada de banana", basis: "per_100g", kcal: 9999, protein_g: 1, carbs_g: 1, fat_g: 1,
      unitWeightG: null, sourceMacros: "recipe", sourceMicros: null,
      recipe: { items: [{ foodId: FOOD_ID, quantity: 100, unit: "g" }], cookedWeightG: null },
    }),
  });
  expect(res.status).toBe(200);
  const updated = await res.json();
  expect(updated.kcal).toBe(89); // derivado de bananaRow (89 kcal/100g), no del 9999 mentiroso del cliente
  expect(updated.sourceMacros).toBe("recipe");
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

test("PATCH /nutrition/meals/:id permite reusar un alimento de OTRO usuario (catálogo compartido)", async () => {
  // La comida es del usuario actual; el alimento que agrega es de otro. Igual que en POST /meals,
  // el lookup del catálogo ya no filtra por dueño, así que debe poder (200). La comida sigue siendo suya.
  const ajeno = { ...bananaRow, userId: "otro-user" };
  const db = fakeDb({
    mealFull: { id: MEAL_ID, userId: SINGLE_USER_ID, eatenAt: 1, mealType: null, note: null },
    meals: [{ id: MEAL_ID, userId: SINGLE_USER_ID, eatenAt: 1, mealType: null, note: null }],
    foods: [ajeno],
  });
  const res = await createApp(deps(db)).request(`/nutrition/meals/${MEAL_ID}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: validMealBody,
  });
  expect(res.status).toBe(200);
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

// ---- Catálogo COMPARTIDO: lectura/reuso entre usuarios, mutación solo del creador ----

test("GET /nutrition/foods es compartido y marca mine", async () => {
  const mio = { ...bananaRow, id: FOOD_ID, userId: SINGLE_USER_ID, name: "Banana" };
  const ajeno = { ...bananaRow, id: "33333333-3333-4333-8333-333333333333", userId: "otro-user", name: "Avena" };
  const app = createApp(deps(fakeDb({ foods: [mio, ajeno] })));
  const res = await app.request("/nutrition/foods");
  expect(res.status).toBe(200);
  const list: any[] = await res.json();
  expect(list.find((f) => f.name === "Banana").mine).toBe(true);
  expect(list.find((f) => f.name === "Avena").mine).toBe(false);
});

test("GET /nutrition/foods/:id de otro usuario → 200 con mine=false", async () => {
  const app = createApp(deps(fakeDb({ foodRow: { ...bananaRow, userId: "otro-user" } })));
  const res = await app.request(`/nutrition/foods/${FOOD_ID}`);
  expect(res.status).toBe(200);
  expect((await res.json()).mine).toBe(false);
});

test("DELETE /nutrition/foods/:id ajeno → 403", async () => {
  const app = createApp(deps(fakeDb({ foodRow: { ...bananaRow, userId: "otro-user" } })));
  const res = await app.request(`/nutrition/foods/${FOOD_ID}`, { method: "DELETE" });
  expect(res.status).toBe(403);
});

test("DELETE /nutrition/foods/:id propio → 200", async () => {
  const app = createApp(deps(fakeDb({ foodRow: bananaRow })));
  const res = await app.request(`/nutrition/foods/${FOOD_ID}`, { method: "DELETE" });
  expect(res.status).toBe(200);
});

test("PATCH /nutrition/foods/:id ajeno → 403", async () => {
  const app = createApp(deps(fakeDb({ foodRow: { ...bananaRow, userId: "otro-user" } })));
  const res = await app.request(`/nutrition/foods/${FOOD_ID}`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "X", basis: "per_100g", kcal: 1, protein_g: 0, carbs_g: 0, fat_g: 0, unitWeightG: null, sourceMacros: "ai", sourceMicros: null, searchQuery: "x" }),
  });
  expect(res.status).toBe(403);
});

test("POST /nutrition/meals permite usar un alimento de OTRO usuario", async () => {
  // El alimento es de "otro-user"; el que registra es SINGLE_USER_ID. Debe poder.
  const ajeno = { ...bananaRow, userId: "otro-user" };
  const app = createApp(deps(fakeDb({ foods: [ajeno] })));
  const res = await app.request("/nutrition/meals", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ eatenAt: 1, mealType: "snack", note: null, items: [{ foodId: FOOD_ID, quantity: 100, quantityUnit: "g" }] }),
  });
  expect(res.status).toBe(200);
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
  unitWeightG: 1.2, sourceMacros: "ai" as const, searchQuery: "almonds raw",
};

// Identificación "huevo frito" (camino ai) + su candidato y fila completa de USDA, para los tests
// de match. La fila trae hierro y B12 con valores plausibles; el resto de vitaminas queda en null.
const HUEVO_ID = {
  name: "Huevo frito", basis: "per_100g" as const, kcal: 200, protein_g: 14, carbs_g: 1, fat_g: 15,
  saturated_fat_g: 4, sugars_g: 0.5, fiber_g: 0, sodium_mg: 200, cholesterol_mg: 370, water_ml: 60,
  unitWeightG: 50, sourceMacros: "ai" as const, searchQuery: "egg whole cooked fried", cookingYield: null,
};
const HUEVO_FDC = 323294;
const usdaCandidateRows = [
  { fdc_id: HUEVO_FDC, description: "Egg, whole, cooked, fried", data_type: "sr_legacy", similarity: 0.62 },
  { fdc_id: 748967, description: "Egg, whole, raw, fresh", data_type: "sr_legacy", similarity: 0.5 },
];
const usdaEggRow = {
  fdcId: HUEVO_FDC, description: "Egg, whole, cooked, fried", dataType: "sr_legacy",
  kcal: 196, proteinG: 13.6, carbsG: 0.8, fatG: 14.8, ironMg: 1.9, vitaminB12Mcg: 1.3, calciumMg: 62,
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

test("POST /nutrition/foods/describe: el server FUERZA sourceMacros='ai' aunque la IA diga 'label'", async () => {
  // Por texto no hay etiqueta que leer. Si el modelo dijera "label" porque cree saber la etiqueta
  // de una marca, el catálogo mentiría sobre la procedencia del dato.
  const mentiroso = { ...aiClient, describeFood: async () => ({ ...ALMENDRA, sourceMacros: "label" as const }) };
  const res = await describePost(createApp(deps(fakeDb(), mentiroso)), "almendra");
  expect(res.status).toBe(200);
  expect((await res.json()).sourceMacros).toBe("ai");
});

// ---- USDA: micros vía búsqueda + elección asistida por IA (Task 13) ----

test("sin match en USDA el alta NO se bloquea (describe): sourceMicros null, iron_mg null (no 0)", async () => {
  // Sin usdaCandidates → searchUsda devuelve [] → assemble(id, null).
  const res = await describePost(createApp(deps(fakeDb())), "dulce de leche");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.sourceMicros).toBe(null);
  expect(body.sourceMacros).toBe("ai");
  expect(body.iron_mg ?? null).toBe(null); // null, NO 0
});

test("con match, los micros salen de USDA: sourceMicros usda, usdaFdcId > 0, iron_mg > 0", async () => {
  const db = fakeDb({ usdaCandidates: usdaCandidateRows, usdaRow: usdaEggRow });
  const ai = { ...aiClient, describeFood: async () => ({ ...HUEVO_ID }), pickUsdaCandidate: async () => HUEVO_FDC };
  const res = await describePost(createApp(deps(db, ai)), "huevo frito");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.sourceMicros).toBe("usda");
  expect(body.usdaFdcId).toBe(HUEVO_FDC);
  expect(body.iron_mg).toBeGreaterThan(0);
  expect(body.vitamin_b12_mcg).toBeGreaterThan(0);
});

test("si la 2ª llamada de IA falla, devuelve los candidatos para elegir a mano", async () => {
  const db = fakeDb({ usdaCandidates: usdaCandidateRows, usdaRow: usdaEggRow });
  const ai = { ...aiClient, describeFood: async () => ({ ...HUEVO_ID }), pickUsdaCandidate: async () => { throw new Error("boom"); } };
  const res = await describePost(createApp(deps(db, ai)), "huevo frito");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.candidates.length).toBeGreaterThan(0);
  expect(body.sourceMicros).toBe(null);
});

test("si la 2ª llamada dice 'ninguno' (null), no matchea pero ofrece candidatos", async () => {
  const db = fakeDb({ usdaCandidates: usdaCandidateRows, usdaRow: usdaEggRow });
  const ai = { ...aiClient, describeFood: async () => ({ ...HUEVO_ID }), pickUsdaCandidate: async () => null };
  const res = await describePost(createApp(deps(db, ai)), "huevo frito");
  const body = await res.json();
  expect(body.sourceMicros).toBe(null);
  expect(body.candidates.length).toBeGreaterThan(0);
});

test("con usda_food vacía/rota (searchUsda tira), el alta cae al comportamiento actual (200, sourceMicros null)", async () => {
  const db = fakeDb({ usdaExecuteThrows: true });
  const ai = { ...aiClient, describeFood: async () => ({ ...HUEVO_ID }) };
  const res = await describePost(createApp(deps(db, ai)), "huevo frito");
  expect(res.status).toBe(200);
  expect((await res.json()).sourceMicros).toBe(null);
});

test("GET /nutrition/usda/search devuelve los candidatos rankeados", async () => {
  const db = fakeDb({ usdaCandidates: usdaCandidateRows });
  const res = await createApp(deps(db)).request("/nutrition/usda/search?q=egg%20fried");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body[0]).toMatchObject({ fdcId: HUEVO_FDC, description: "Egg, whole, cooked, fried", dataType: "sr_legacy" });
});

test("GET /nutrition/usda/search con q vacía → []", async () => {
  const res = await createApp(deps(fakeDb())).request("/nutrition/usda/search?q=");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual([]);
});

// ---- USDA: re-mezcla manual ("¿no es este?") y resolución id → descripción (Plan 2, Task 7) ----

// Una segunda fila REAL de USDA para verificar que la re-mezcla cambia de verdad: mismos campos
// que la del huevo, valores distintos. Sin dos filas, un handler que devolviera siempre la misma
// pasaría el test.
const PALTA_FDC = 171705;
const usdaPaltaRow = {
  fdcId: PALTA_FDC, description: "Avocados, raw, all commercial varieties", dataType: "sr_legacy",
  kcal: 160, proteinG: 2, carbsG: 8.5, fatG: 14.7, ironMg: 0.55, vitaminB12Mcg: 0, calciumMg: 12,
};
const dosFilasUsda = { [HUEVO_FDC]: usdaEggRow, [PALTA_FDC]: usdaPaltaRow };

test("extract/describe devuelven la identificación que usaron: sin ella no se puede re-mezclar", async () => {
  // El "¿no es este?" necesita mandarle a /usda/assemble la MISMA identificación con otro fdcId,
  // y `searchQuery` (que el schema exige) no está en el FoodExtraction. Sin este campo en la
  // respuesta, el móvil no tiene con qué llamar al endpoint: los candidatos llegarían y no se
  // podría elegir ninguno.
  const db = fakeDb({ usdaCandidates: usdaCandidateRows, usdaRows: dosFilasUsda });
  const ai = { ...aiClient, describeFood: async () => ({ ...HUEVO_ID }), pickUsdaCandidate: async () => HUEVO_FDC };
  const body = await (await describePost(createApp(deps(db, ai)), "huevo frito")).json();
  expect(body.identification).toMatchObject({ name: "Huevo frito", searchQuery: "egg whole cooked fried" });

  // Y es re-mezclable tal cual llegó: el viaje de ida y vuelta no la rompe.
  const remezcla = await assemblePost(createApp(deps(db)), { identification: body.identification, fdcId: PALTA_FDC });
  expect(remezcla.status).toBe(200);
  expect(await remezcla.json()).toMatchObject({ usdaFdcId: PALTA_FDC, iron_mg: 0.55 });
});

test("describe devuelve la identificación FORZADA a sourceMacros 'ai', no la que dijo la IA", async () => {
  // Si viajara la original ("label"), re-mezclar reintroduciría la mentira que el handler corrige.
  const mentiroso = { ...aiClient, describeFood: async () => ({ ...HUEVO_ID, sourceMacros: "label" as const }) };
  const body = await (await describePost(createApp(deps(fakeDb(), mentiroso)), "huevo frito")).json();
  expect(body.identification.sourceMacros).toBe("ai");
});

const assemblePost = (app: any, body: unknown) =>
  app.request("/nutrition/usda/assemble", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });

test("POST /nutrition/usda/assemble re-mezcla con OTRO fdcId: cambian los micros y el usdaFdcId", async () => {
  const app = createApp(deps(fakeDb({ usdaRows: dosFilasUsda })));

  const conHuevo = await assemblePost(app, { identification: HUEVO_ID, fdcId: HUEVO_FDC });
  expect(conHuevo.status).toBe(200);
  const huevo = await conHuevo.json();
  expect(huevo).toMatchObject({ usdaFdcId: HUEVO_FDC, sourceMicros: "usda", iron_mg: 1.9, calcium_mg: 62 });

  const conPalta = await assemblePost(app, { identification: HUEVO_ID, fdcId: PALTA_FDC });
  expect(conPalta.status).toBe(200);
  const palta = await conPalta.json();
  expect(palta).toMatchObject({ usdaFdcId: PALTA_FDC, sourceMicros: "usda", iron_mg: 0.55, calcium_mg: 12 });

  // La identidad la sigue poniendo el usuario, no la fila de USDA: elegir "Avocados, raw" no
  // renombra el alimento a palta.
  expect(palta.name).toBe("Huevo frito");
});

test("POST /nutrition/usda/assemble con fdcId inexistente → 404", async () => {
  const res = await assemblePost(createApp(deps(fakeDb({ usdaRows: dosFilasUsda }))), {
    identification: HUEVO_ID, fdcId: 999999,
  });
  expect(res.status).toBe(404);
});

test("POST /nutrition/usda/assemble con identification inválida → 400 (no 500)", async () => {
  const app = createApp(deps(fakeDb({ usdaRows: dosFilasUsda })));
  // Sin searchQuery: el schema lo exige y sin él la re-mezcla guardaría un alimento sin rastro.
  const { searchQuery: _omitido, ...sinQuery } = HUEVO_ID;
  expect((await assemblePost(app, { identification: sinQuery, fdcId: HUEVO_FDC })).status).toBe(400);
  // Sin fdcId, y con un fdcId que no es entero.
  expect((await assemblePost(app, { identification: HUEVO_ID })).status).toBe(400);
  expect((await assemblePost(app, { identification: HUEVO_ID, fdcId: 1.5 })).status).toBe(400);
  expect((await assemblePost(app, "no soy json de objeto")).status).toBe(400);
});

test("GET /nutrition/usda/:fdcId resuelve el id a su descripción", async () => {
  const res = await createApp(deps(fakeDb({ usdaRows: dosFilasUsda }))).request(`/nutrition/usda/${HUEVO_FDC}`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    fdcId: HUEVO_FDC, description: "Egg, whole, cooked, fried", dataType: "sr_legacy",
  });
});

test("GET /nutrition/usda/:fdcId devuelve la fila PEDIDA, no una cualquiera", async () => {
  const res = await createApp(deps(fakeDb({ usdaRows: dosFilasUsda }))).request(`/nutrition/usda/${PALTA_FDC}`);
  expect((await res.json()).description).toBe("Avocados, raw, all commercial varieties");
});

test("GET /nutrition/usda/:fdcId inexistente → 404", async () => {
  const res = await createApp(deps(fakeDb({ usdaRows: dosFilasUsda }))).request("/nutrition/usda/999999");
  expect(res.status).toBe(404);
});

test("GET /nutrition/usda/:fdcId no numérico → 400 (y no pisa a /usda/search)", async () => {
  const app = createApp(deps(fakeDb({ usdaCandidates: usdaCandidateRows, usdaRows: dosFilasUsda })));
  expect((await app.request("/nutrition/usda/abc")).status).toBe(400);
  // /usda/search sigue siendo la búsqueda, no un fdcId llamado "search".
  const busqueda = await app.request("/nutrition/usda/search?q=egg");
  expect(busqueda.status).toBe(200);
  expect(await busqueda.json()).toHaveLength(2);
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

// ---- Actualizar un alimento YA guardado contra USDA (proposal + apply) ----
//
// El fixture NO es decorativo: hay 4 comidas y 6 ítems, y solo 3 ítems en 2 comidas corresponden
// a este alimento y a este usuario. Un handler que se olvide del join, que cuente ítems en vez de
// comidas o que barra los huérfanos da otro número.

const OTRO_FOOD_ID = "33333333-3333-4333-8333-333333333333";
const OTRO_USUARIO = "00000000-0000-0000-0000-0000000000ff";
const M1 = "aaaaaaaa-1111-4111-8111-111111111111";
const M2 = "aaaaaaaa-2222-4222-8222-222222222222";
const M3 = "aaaaaaaa-3333-4333-8333-333333333333";
const M4_AJENA = "aaaaaaaa-4444-4444-8444-444444444444";
const IT_M1_A = "bbbbbbbb-1111-4111-8111-111111111111";
const IT_M1_B = "bbbbbbbb-2222-4222-8222-222222222222";
const IT_M2 = "bbbbbbbb-3333-4333-8333-333333333333";
const IT_OTRO_ALIMENTO = "bbbbbbbb-4444-4444-8444-444444444444";
const IT_HUERFANO = "bbbbbbbb-5555-4555-8555-555555555555";
const IT_AJENO = "bbbbbbbb-6666-4666-8666-666666666666";

// El alimento a actualizar: cargado antes de USDA, sin una sola vitamina.
const almendraRow = {
  id: FOOD_ID, userId: SINGLE_USER_ID, name: "Almendra", basis: "per_100g",
  kcal: 579, proteinG: 21.2, carbsG: 21.6, fatG: 49.9, unitWeightG: 1.2, createdAt: new Date(0),
  sourceMacros: "ai", sourceMicros: null, usdaFdcId: null,
  saturatedFatG: null, sugarsG: null, fiberG: null, sodiumMg: null, ironMg: null, calciumMg: null,
};

const ALMENDRA_FDC = 170567;
const usdaAlmendraRow = {
  fdcId: ALMENDRA_FDC, description: "Nuts, almonds", dataType: "sr_legacy",
  kcal: 579, proteinG: 21.15, carbsG: 21.55, fatG: 49.93,
  ironMg: 3.71, calciumMg: 269, vitaminB12Mcg: 0,
};
const usdaAlmendraCandidatos = [
  { fdc_id: ALMENDRA_FDC, description: "Nuts, almonds", data_type: "sr_legacy", similarity: 0.7 },
  { fdc_id: 172421, description: "Nuts, almonds, dry roasted", data_type: "sr_legacy", similarity: 0.6 },
];

const comidasFixture = [
  { id: M1, userId: SINGLE_USER_ID }, { id: M2, userId: SINGLE_USER_ID },
  { id: M3, userId: SINGLE_USER_ID }, { id: M4_AJENA, userId: OTRO_USUARIO },
];
const itemsFixture = [
  { id: IT_M1_A, mealId: M1, foodId: FOOD_ID, quantity: 150, quantityUnit: "g" },
  { id: IT_M1_B, mealId: M1, foodId: FOOD_ID, quantity: 10, quantityUnit: "unit" }, // 2º ítem de la MISMA comida
  { id: IT_M2, mealId: M2, foodId: FOOD_ID, quantity: 30, quantityUnit: "g" },
  { id: IT_OTRO_ALIMENTO, mealId: M3, foodId: OTRO_FOOD_ID, quantity: 100, quantityUnit: "g" },
  { id: IT_HUERFANO, mealId: M3, foodId: null, quantity: 50, quantityUnit: "g" }, // alimento borrado
  { id: IT_AJENO, mealId: M4_AJENA, foodId: FOOD_ID, quantity: 200, quantityUnit: "g" }, // MISMO alimento, OTRO usuario
];

const IDENT_ALMENDRA = {
  name: "Almendra", basis: "per_100g" as const, kcal: 579, protein_g: 21.2, carbs_g: 21.6, fat_g: 49.9,
  unitWeightG: 1.2, sourceMacros: "ai" as const, searchQuery: "almonds raw", cookingYield: null,
};

const refreshAi = { ...aiClient, usdaSearchQuery: async () => "almonds raw", pickUsdaCandidate: async () => ALMENDRA_FDC };

function refreshDb(overrides: any = {}) {
  return fakeDb({
    foodRow: almendraRow, meals: comidasFixture, items: itemsFixture,
    usdaCandidates: usdaAlmendraCandidatos, usdaRows: { [ALMENDRA_FDC]: usdaAlmendraRow },
    ...overrides,
  });
}

const postProposal = (app: any, id = FOOD_ID) =>
  app.request(`/nutrition/foods/${id}/usda-proposal`, { method: "POST" });

const postApply = (app: any, body: unknown, id = FOOD_ID) =>
  app.request(`/nutrition/foods/${id}/usda-apply`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });

const applyBody = { identification: IDENT_ALMENDRA, fdcId: ALMENDRA_FDC };
const updatesDe = (db: any, table: any) => db._updates.filter((u: any) => u.table === table);
const idsDeItemsActualizados = (db: any) =>
  updatesDe(db, mealItem).map((u: any) => valorDe(u.cond, "meal_item", "id"));

test("la propuesta NO escribe: el alimento y sus comidas quedan intactos hasta que se aplica", async () => {
  const db = refreshDb();
  const res = await postProposal(createApp(deps(db, refreshAi)));
  expect(res.status).toBe(200);
  expect((await res.json()).proposal.iron_mg).toBe(3.71); // sí propuso algo...
  expect(db._updates).toHaveLength(0); // ...pero no escribió NADA
  expect(db._inserts).toHaveLength(0);
});

test("la propuesta dice cuántas COMIDAS del usuario usan el alimento (no ítems, no las de otros)", async () => {
  // 3 ítems del alimento en 2 comidas propias; hay una 3ª comida con otro alimento + un huérfano,
  // y una 4ª comida de otro usuario que también lo usa.
  const body = await (await postProposal(createApp(deps(refreshDb(), refreshAi)))).json();
  expect(body.mealsAffected).toBe(2);
});

test("la propuesta elige un candidato y devuelve la identificación del alimento GUARDADO", async () => {
  const body = await (await postProposal(createApp(deps(refreshDb(), refreshAi)))).json();
  expect(body.chosen).toBe(ALMENDRA_FDC);
  expect(body.candidates).toHaveLength(2);
  expect(body.identification).toMatchObject({ name: "Almendra", searchQuery: "almonds raw" });
  expect(body.proposal).toMatchObject({ name: "Almendra", sourceMicros: "usda", usdaFdcId: ALMENDRA_FDC, calcium_mg: 269 });
});

test("sin match, la propuesta lo dice y no propone micros (null, no 0)", async () => {
  const sinPick = { ...refreshAi, pickUsdaCandidate: async () => null };
  const body = await (await postProposal(createApp(deps(refreshDb(), sinPick)))).json();
  expect(body.chosen).toBeNull();
  expect(body.proposal.sourceMicros).toBeNull();
  expect(body.proposal.iron_mg).toBeNull();
  expect(body.proposal.kcal).toBe(579); // el alimento tal cual
  expect(body.mealsAffected).toBe(2); // el conteo no depende de que haya match
});

test("si la IA de la frase de búsqueda falla, la propuesta degrada a 'sin match' y NUNCA tira 500", async () => {
  const roto = { ...refreshAi, usdaSearchQuery: async () => { throw new Error("boom"); } };
  const res = await postProposal(createApp(deps(refreshDb(), roto)));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.chosen).toBeNull();
  expect(body.proposal.iron_mg).toBeNull();
});

test("si usda_food está vacía/rota, la propuesta degrada a 'sin match' y NUNCA tira 500", async () => {
  const res = await postProposal(createApp(deps(refreshDb({ usdaExecuteThrows: true }), refreshAi)));
  expect(res.status).toBe(200);
  expect((await res.json()).chosen).toBeNull();
});

test("la propuesta de un alimento de OTRO usuario → 404", async () => {
  const db = refreshDb({ foodRow: { ...almendraRow, userId: OTRO_USUARIO } });
  expect((await postProposal(createApp(deps(db, refreshAi)))).status).toBe(404);
});

test("sin API key la propuesta → 400 (no se llama a la IA)", async () => {
  const db = refreshDb();
  const sinKey: any = { db, config: { ...baseConfig, defaultAiApiKey: undefined }, aiClient: refreshAi };
  expect((await postProposal(createApp(sinKey))).status).toBe(400);
});

test("aplicar guarda los micros de USDA en el alimento", async () => {
  const db = refreshDb();
  const res = await postApply(createApp(deps(db, refreshAi)), applyBody);
  expect(res.status).toBe(200);
  const guardado = updatesDe(db, food)[0].values;
  expect(guardado).toMatchObject({ ironMg: 3.71, calciumMg: 269, sourceMicros: "usda", usdaFdcId: ALMENDRA_FDC });
});

test("aplicar re-snapshotea los ítems del alimento conservando los gramos", async () => {
  const db = refreshDb();
  const body = await (await postApply(createApp(deps(db, refreshAi)), applyBody)).json();
  expect(body).toEqual({ mealsUpdated: 2, itemsUpdated: 3 });

  const porItem = new Map(updatesDe(db, mealItem).map((u: any) => [valorDe(u.cond, "meal_item", "id"), u.values]));
  const g150: any = porItem.get(IT_M1_A);
  expect(g150.grams).toBe(150); // la cantidad NO cambia
  expect(g150.quantity).toBe(150);
  expect(g150.ironMg).toBeCloseTo(5.57, 2); // 3.71 × 1.5, redondeado como el resto de los snapshots
  const unidades: any = porItem.get(IT_M1_B);
  expect(unidades.grams).toBeCloseTo(12, 6); // 10 almendras × 1.2 g
  expect(unidades.ironMg).toBeCloseTo(0.45, 2); // 3.71 × 0.12
  // snapshotItems también reescribe foodName: si el alimento se renombró, el snapshot se pone al día.
  expect(g150.foodName).toBe("Almendra");
});

test("mealsUpdated cuenta COMIDAS, no ítems: 3 ítems en 2 comidas", async () => {
  const db = refreshDb();
  const body = await (await postApply(createApp(deps(db, refreshAi)), applyBody)).json();
  // Contado sobre lo que realmente se escribió en la base, no sobre lo que dice el handler.
  const comidasTocadas = new Set(
    idsDeItemsActualizados(db).map((id: string) => itemsFixture.find((it) => it.id === id)!.mealId),
  );
  expect(comidasTocadas.size).toBe(2);
  expect(idsDeItemsActualizados(db)).toHaveLength(3);
  expect(body.mealsUpdated).toBe(comidasTocadas.size);
  expect(body.itemsUpdated).toBe(3);
});

test("aplicar NO toca las comidas de OTRO usuario aunque compartan el alimento", async () => {
  const db = refreshDb();
  await postApply(createApp(deps(db, refreshAi)), applyBody);
  expect(idsDeItemsActualizados(db)).not.toContain(IT_AJENO);
  expect(idsDeItemsActualizados(db)).toEqual([IT_M1_A, IT_M1_B, IT_M2]);
});

test("aplicar NO toca los ítems de OTROS alimentos", async () => {
  const db = refreshDb();
  await postApply(createApp(deps(db, refreshAi)), applyBody);
  expect(idsDeItemsActualizados(db)).not.toContain(IT_OTRO_ALIMENTO);
});

test("aplicar NO toca los ítems huérfanos (food_id null): su snapshot es lo único que queda del alimento borrado", async () => {
  const db = refreshDb();
  await postApply(createApp(deps(db, refreshAi)), applyBody);
  expect(idsDeItemsActualizados(db)).not.toContain(IT_HUERFANO);
});

test("el apply NO confía en el cliente: re-arma la propuesta desde el alimento guardado", async () => {
  const db = refreshDb();
  const adulterada = {
    identification: { ...IDENT_ALMENDRA, name: "HACKEADO", kcal: 99999, sourceMacros: "label" as const },
    fdcId: ALMENDRA_FDC,
  };
  const res = await postApply(createApp(deps(db, refreshAi)), adulterada);
  expect(res.status).toBe(200);
  const guardado = updatesDe(db, food)[0].values;
  expect(guardado.kcal).not.toBe(99999);
  expect(guardado.kcal).toBe(579); // el de USDA, porque el alimento guardado es sourceMacros "ai"
  expect(guardado.name).toBe("Almendra");
  // Y tampoco viaja a los ítems.
  expect(updatesDe(db, mealItem)[0].values.foodName).toBe("Almendra");
});

test("aplicar conserva los macros tipeados a mano y su procedencia 'manual'", async () => {
  // sourceMacros "manual" viaja como "label" en la mezcla (los macros del usuario ganan), pero lo
  // que se guarda sigue siendo "manual": el dato no se convierte en una etiqueta que nadie leyó.
  const db = refreshDb({ foodRow: { ...almendraRow, sourceMacros: "manual", kcal: 600 } });
  const res = await postApply(createApp(deps(db, refreshAi)), applyBody);
  expect(res.status).toBe(200);
  const guardado = updatesDe(db, food)[0].values;
  expect(guardado.sourceMacros).toBe("manual");
  expect(guardado.kcal).toBe(600); // NO los 579 de USDA
  expect(guardado.ironMg).toBe(3.71); // pero las vitaminas vacías sí se rellenan
});

test("aplicar con un fdcId inexistente → 404 y no escribe nada", async () => {
  const db = refreshDb();
  const res = await postApply(createApp(deps(db, refreshAi)), { identification: IDENT_ALMENDRA, fdcId: 99999999 });
  expect(res.status).toBe(404);
  expect(db._updates).toHaveLength(0);
});

test("aplicar sobre un alimento de OTRO usuario → 403 y no escribe nada", async () => {
  // Refinar es mutar: mismo contrato que PATCH/DELETE (403 en ajeno, no 404: el alimento es
  // visible por la lectura compartida).
  const db = refreshDb({ foodRow: { ...almendraRow, userId: OTRO_USUARIO } });
  const res = await postApply(createApp(deps(db, refreshAi)), applyBody);
  expect(res.status).toBe(403);
  expect(db._updates).toHaveLength(0);
});

// Los dos casos que HOY se confunden: ambos terminaban en un 200 `{0, 0}` indistinguible.
test("aplicar cuando el alimento se borra DENTRO de la transacción → 404, no un 200 '0 y 0'", async () => {
  // `getFood` lo encontró, pero el UPDATE ya no: la fila se fue en esa ventana.
  const db = refreshDb({ foodDesaparecidoEnUpdate: true });
  const res = await postApply(createApp(deps(db, refreshAi)), applyBody);
  expect(res.status).toBe(404);
  // Y ni se intentó re-snapshotear: sin fila nueva no hay con qué recalcular.
  expect(updatesDe(db, mealItem)).toHaveLength(0);
});

test("aplicar sobre un alimento que existe pero no está en ninguna comida → 200 con 0 y 0", async () => {
  // El caso normal de un alimento del catálogo que nunca se comió: NO es un error.
  const db = refreshDb({ meals: [], items: [] });
  const res = await postApply(createApp(deps(db, refreshAi)), applyBody);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ mealsUpdated: 0, itemsUpdated: 0 });
  expect(updatesDe(db, food)).toHaveLength(1); // el alimento SÍ se actualizó
  expect(updatesDe(db, mealItem)).toHaveLength(0);
});

test("aplicar con body inválido → 400 (no 500)", async () => {
  const db = refreshDb();
  const { searchQuery: _omitido, ...sinQuery } = IDENT_ALMENDRA;
  expect((await postApply(createApp(deps(db, refreshAi)), { identification: sinQuery, fdcId: ALMENDRA_FDC })).status).toBe(400);
  expect((await postApply(createApp(deps(db, refreshAi)), { identification: IDENT_ALMENDRA })).status).toBe(400);
  expect(db._updates).toHaveLength(0);
});

// ---- Completar con IA en el alta (POST /foods/ai-micros) ----

test("POST /nutrition/foods/ai-micros arma la extracción con micros de IA (sourceMicros ai)", async () => {
  const app = createApp(deps(fakeDb()));
  const identification = {
    name: "Limonada casera", basis: "per_100ml", kcal: 40, protein_g: 0, carbs_g: 10, fat_g: 0,
    unitWeightG: null, sourceMacros: "ai", searchQuery: "lemonade homemade", cookingYield: null,
  };
  const res = await app.request("/nutrition/foods/ai-micros", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identification }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.vitamin_c_mg).toBe(8);
  expect(body.sourceMicros).toBe("ai");
  expect(body.usdaFdcId).toBeNull();
  expect(body.kcal).toBe(40);
});

test("POST /nutrition/foods/ai-micros con la IA rota devuelve 502 y no rompe", async () => {
  const roto = { ...aiClient, estimateFoodMicros: async () => { throw new Error("boom"); } };
  const app = createApp(deps(fakeDb(), roto));
  const res = await app.request("/nutrition/foods/ai-micros", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identification: { name: "x", basis: "per_100g", kcal: 1, protein_g: 0, carbs_g: 0, fat_g: 0, unitWeightG: null, sourceMacros: "ai", searchQuery: "x", cookingYield: null } }),
  });
  expect(res.status).toBe(502);
});

// ---- Completar con IA (alimento guardado): proposal + apply ----
const postAiProposal = (app: any, id = FOOD_ID) =>
  app.request(`/nutrition/foods/${id}/ai-micros-proposal`, { method: "POST" });
const postAiApply = (app: any, foodBody: unknown, id = FOOD_ID) =>
  app.request(`/nutrition/foods/${id}/ai-micros-apply`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ food: foodBody }),
  });

// FoodInput (snake_case) para el apply; MIENTE en identidad, macros, sourceMicros y usdaFdcId a
// propósito: el server debe ignorar todo eso (identidad+macros salen del alimento guardado) y tomar
// SOLO los micros (vitamin_c_mg).
const aiFoodBody = {
  name: "HACKEADO", basis: "per_100ml", kcal: 999, protein_g: 1, carbs_g: 1, fat_g: 1,
  unitWeightG: 500, sourceMacros: "label", sourceMicros: "usda", usdaFdcId: 123, vitamin_c_mg: 8,
};

test("ai-micros-proposal estima y cuenta comidas, sin escribir", async () => {
  const db = refreshDb();
  const res = await postAiProposal(createApp(deps(db, refreshAi)));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.proposal.sourceMicros).toBe("ai");
  expect(body.proposal.vitamin_c_mg).toBe(8);
  expect(body.proposal.usdaFdcId).toBeNull();
  expect(body.mealsAffected).toBe(2);
  expect(db._updates).toHaveLength(0); // NO escribió
});

test("ai-micros-apply toma identidad+macros del guardado y SOLO los micros del body", async () => {
  const db = refreshDb();
  const res = await postAiApply(createApp(deps(db, refreshAi)), aiFoodBody);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ mealsUpdated: 2, itemsUpdated: 3 });
  const guardado = updatesDe(db, food)[0].values;
  expect(guardado.sourceMicros).toBe("ai");     // forzado, aunque el body dijo "usda"
  expect(guardado.usdaFdcId).toBeNull();         // forzado, aunque el body dijo 123
  expect(guardado.vitaminCMg).toBe(8);           // el micro SÍ sale del body (la propuesta aprobada)
  expect(guardado.name).toBe("Almendra");        // identidad del alimento guardado, NO "HACKEADO"
  expect(guardado.basis).toBe("per_100g");       // del guardado, NO "per_100ml"
  expect(guardado.kcal).toBe(579);               // macro del guardado, NO 999
  expect(guardado.sourceMacros).toBe("ai");      // del guardado (almendraRow), NO "label"
});

test("ai-micros-proposal de un alimento de OTRO usuario → 404", async () => {
  const db = refreshDb({ foodRow: { ...almendraRow, userId: OTRO_USUARIO } });
  const res = await postAiProposal(createApp(deps(db, refreshAi)));
  expect(res.status).toBe(404);
});

test("ai-micros-apply de un alimento de OTRO usuario → 403 y no escribe nada", async () => {
  // Igual que usda-apply: refinar lo ajeno se bloquea con 403 (mutación), no 404.
  const db = refreshDb({ foodRow: { ...almendraRow, userId: OTRO_USUARIO } });
  const res = await postAiApply(createApp(deps(db, refreshAi)), aiFoodBody);
  expect(res.status).toBe(403);
  expect(db._updates).toHaveLength(0);
});

// ---- Guard: ninguna de las 4 rutas de refresh/IA-micros puede tocar una RECETA ----
//
// `food.recipe != null` ⇔ es una receta: sus macros/micros se derivan de los ingredientes, no de
// una fila de USDA ni de una estimación de IA. Las 4 rutas construyen un `FoodExtraction` (que NO
// tiene `recipe`) y llaman `updateFoodRow`, que hace `recipe: input.recipe ?? null` — aplicar
// cualquiera de las 4 sobre una receta BORRARÍA sus ingredientes para siempre. `toFood` solo agrega
// la clave `recipe` cuando `row.recipe` es truthy, así que alcanza con que el fixture la tenga.
const recetaRow = {
  ...almendraRow,
  sourceMacros: "recipe",
  recipe: { items: [{ foodId: OTRO_FOOD_ID, quantity: 100, unit: "g" }], cookedWeightG: 250 },
};

// CR-5: el guard tiene que cortar ANTES de tocar la IA, no solo antes de escribir. Se cuentan las
// llamadas a los 3 métodos que este camino podría invocar (búsqueda/elección/estimación) para que
// un guard que revisara `f.recipe` DESPUÉS de llamar a la IA (desperdiciando la llamada, o peor,
// pisándola con datos que después se descartan) se vea en el test.
function spiedAi() {
  const calls = { usdaSearchQuery: 0, pickUsdaCandidate: 0, estimateFoodMicros: 0 };
  const client = {
    ...refreshAi,
    usdaSearchQuery: async () => { calls.usdaSearchQuery++; return refreshAi.usdaSearchQuery(); },
    pickUsdaCandidate: async () => { calls.pickUsdaCandidate++; return refreshAi.pickUsdaCandidate(); },
    estimateFoodMicros: async () => { calls.estimateFoodMicros++; return aiClient.estimateFoodMicros(); },
  };
  return { client, calls };
}

test("usda-proposal sobre una receta → 400, no llama a la IA de USDA", async () => {
  const db = refreshDb({ foodRow: recetaRow });
  const { client, calls } = spiedAi();
  const res = await postProposal(createApp(deps(db, client)));
  expect(res.status).toBe(400);
  expect((await res.json()).error).toMatch(/receta/i);
  expect(db._updates).toHaveLength(0);
  expect(calls.usdaSearchQuery).toBe(0);
  expect(calls.pickUsdaCandidate).toBe(0);
  expect(calls.estimateFoodMicros).toBe(0);
});

test("usda-apply sobre una receta → 400 y NO le pisa el campo recipe (no la borra)", async () => {
  const db = refreshDb({ foodRow: recetaRow });
  const res = await postApply(createApp(deps(db, refreshAi)), applyBody);
  expect(res.status).toBe(400);
  expect((await res.json()).error).toMatch(/receta/i);
  expect(db._updates).toHaveLength(0); // el UPDATE que nuelearía `recipe` nunca se disparó
});

test("ai-micros-proposal sobre una receta → 400, no llama a la IA", async () => {
  const db = refreshDb({ foodRow: recetaRow });
  const { client, calls } = spiedAi();
  const res = await postAiProposal(createApp(deps(db, client)));
  expect(res.status).toBe(400);
  expect((await res.json()).error).toMatch(/receta/i);
  expect(db._updates).toHaveLength(0);
  expect(calls.usdaSearchQuery).toBe(0);
  expect(calls.pickUsdaCandidate).toBe(0);
  expect(calls.estimateFoodMicros).toBe(0);
});

test("ai-micros-apply sobre una receta → 400 y NO le pisa el campo recipe (no la borra)", async () => {
  const db = refreshDb({ foodRow: recetaRow });
  const res = await postAiApply(createApp(deps(db, refreshAi)), aiFoodBody);
  expect(res.status).toBe(400);
  expect((await res.json()).error).toMatch(/receta/i);
  expect(db._updates).toHaveLength(0);
});
