import { test, expect } from "bun:test";
import { createApp } from "../app";

const KEY = "a".repeat(64);
const FOOD_ID = "11111111-1111-4111-8111-111111111111";
const IMG_BASE64 = Buffer.from("fake jpeg bytes").toString("base64");

const bananaRow = {
  id: FOOD_ID, userId: "single-user", name: "Banana", basis: "per_100g",
  kcal: 89, proteinG: 1.1, carbsG: 23, fatG: 0.3, unitWeightG: 120, source: "estimate", createdAt: new Date(0),
};

function fakeDb(opts: { foods?: any[]; meals?: any[]; items?: any[]; foodRow?: any } = {}) {
  const inserts: any[] = [];
  const db: any = {
    _inserts: inserts,
    insert: (table: any) => ({
      values(v: any) {
        const rows = (Array.isArray(v) ? v : [v]).map((r, i) => ({ id: r.id ?? `${FOOD_ID.slice(0, -1)}${i}`, createdAt: new Date(0), ...r }));
        inserts.push({ table, rows });
        const p: any = Promise.resolve(rows);
        p.returning = async () => rows;
        return p;
      },
    }),
    update: () => ({ set: () => ({ where: () => { const p: any = Promise.resolve([]); p.returning = async () => (opts.foodRow ? [opts.foodRow] : []); return p; } }) }),
    delete: () => ({ where: () => { const p: any = Promise.resolve(undefined); p.returning = async () => [{ id: FOOD_ID }]; return p; } }),
    select: () => ({ from: () => ({ where: () => ({ orderBy: async () => opts.foods ?? [], then: (r: any) => r(opts.foods ?? []) }) }) }),
    transaction: async (fn: any) => fn(db),
    query: {
      food: { findFirst: async () => opts.foodRow ?? null },
      meal: { findFirst: async () => (opts.meals?.[0] ? { userId: opts.meals[0].userId } : null) },
      settings: { findFirst: async () => ({ aiApiKeyEncrypted: null }) },
    },
  };
  return db;
}

const baseConfig = { encryptionKey: KEY, defaultModel: "claude-sonnet-4-6", inviteCode: "x", sessionTtlDays: 4, singleUserMode: true, defaultAiApiKey: "sk-x" };
const aiClient = {
  generateProgram: async () => ({ name: "x", weeks: [] }),
  extractFood: async () => ({ name: "Banana", basis: "per_100g", kcal: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3, unitWeightG: 120, source: "estimate" }),
};
const deps = (db: any): any => ({ db, config: baseConfig, aiClient });

test("POST /nutrition/foods/extract → devuelve la extracción sin persistir", async () => {
  const app = createApp(deps(fakeDb()));
  const res = await app.request("/nutrition/foods/extract", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageBase64: IMG_BASE64, mediaType: "image/jpeg" }),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ name: "Banana", source: "estimate" });
});

test("POST /nutrition/foods/extract rechaza mediaType inválido", async () => {
  const app = createApp(deps(fakeDb()));
  const res = await app.request("/nutrition/foods/extract", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageBase64: IMG_BASE64, mediaType: "application/pdf" }),
  });
  expect(res.status).toBe(400);
});

test("POST /nutrition/foods crea un alimento", async () => {
  const app = createApp(deps(fakeDb()));
  const res = await app.request("/nutrition/foods", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Banana", basis: "per_100g", kcal: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3, unitWeightG: 120, source: "estimate" }),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ name: "Banana", id: expect.any(String) });
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
});

test("POST /nutrition/meals 409 si el foodId no es del usuario", async () => {
  const app = createApp(deps(fakeDb({ foods: [] }))); // catálogo vacío → food no encontrado
  const res = await app.request("/nutrition/meals", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ eatenAt: 1, items: [{ foodId: FOOD_ID, quantity: 1, quantityUnit: "unit" }] }),
  });
  expect(res.status).toBe(409);
});
