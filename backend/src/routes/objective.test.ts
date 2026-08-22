import { test, expect } from "bun:test";
import { createApp } from "../app";
import { encryptSecret } from "../crypto/secrets";

const KEY = "a".repeat(64);

function fakeDb(opts: { objective?: string | null; withKey?: boolean; withProfile?: boolean } = {}) {
  const { objective = null, withKey = true, withProfile = true } = opts;
  let row = objective == null ? null : { userId: "u1", content: objective };
  return {
    _get: () => row,
    query: {
      settings: {
        findFirst: async () => withKey
          ? { aiApiKeyEncrypted: encryptSecret("sk-ant-real", KEY), aiModel: "claude-sonnet-4-6" }
          : null,
      },
      sessions: { findFirst: async () => ({ token: "t", userId: "u1", expiresAt: new Date(Date.now() + 1e9) }) },
      workObjective: { findFirst: async () => row },
      athleteMemory: { findFirst: async () => null },
      profiles: {
        findFirst: async () => withProfile
          ? { userId: "u1", data: { goal: "recomposition", experience: "intermediate", daysPerWeek: 4, sessionMinutes: 60, gymEquipment: [], homeEquipment: [], limitations: [] } }
          : null,
      },
      nutritionGoal: { findFirst: async () => ({ objective: "lose", rateKgPerWeek: 0.25, manualKcal: null }) },
    },
    insert: () => ({ values: (v: any) => ({ onConflictDoUpdate: async ({ set }: any) => { row = { userId: v.userId, content: set.content }; } }) }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
  } as any;
}

function deps(db: any, ai: any) {
  return { db, config: { encryptionKey: KEY, defaultModel: "claude-sonnet-4-6", inviteCode: "INV", sessionTtlDays: 4, singleUserMode: false }, aiClient: ai } as any;
}
const authHeader = { Authorization: "Bearer t" };

test("GET /objective devuelve el contenido", async () => {
  const app = createApp(deps(fakeDb({ objective: "mi norte" }), { generateProgram: async () => ({ name: "x", weeks: [] }) }));
  const res = await app.request("/objective", { headers: authHeader });
  expect(res.status).toBe(200);
  expect((await res.json()).content).toBe("mi norte");
});

test("PUT /objective persiste lo editado", async () => {
  const db = fakeDb({ objective: "" });
  const app = createApp(deps(db, { generateProgram: async () => ({ name: "x", weeks: [] }) }));
  const res = await app.request("/objective", { method: "PUT", headers: { ...authHeader, "content-type": "application/json" }, body: JSON.stringify({ content: "editado" }) });
  expect(res.status).toBe(200);
  expect(db._get().content).toBe("editado");
});

test("PUT /objective con content no-string devuelve 400 y NO pisa lo guardado", async () => {
  const db = fakeDb({ objective: "valor previo" });
  const app = createApp(deps(db, { generateProgram: async () => ({ name: "x", weeks: [] }) }));
  const res = await app.request("/objective", { method: "PUT", headers: { ...authHeader, "content-type": "application/json" }, body: JSON.stringify({ content: 123 }) });
  expect(res.status).toBe(400);
  expect(db._get().content).toBe("valor previo");
});

test("PUT /objective con body malformado (sin content) devuelve 400 y NO pisa lo guardado", async () => {
  const db = fakeDb({ objective: "valor previo" });
  const app = createApp(deps(db, { generateProgram: async () => ({ name: "x", weeks: [] }) }));
  const res = await app.request("/objective", { method: "PUT", headers: { ...authHeader, "content-type": "application/json" }, body: "no es json válido" });
  expect(res.status).toBe(400);
  expect(db._get().content).toBe("valor previo");
});

test("PUT /objective con content string vacío SÍ persiste (limpiar el objetivo es válido)", async () => {
  const db = fakeDb({ objective: "valor previo" });
  const app = createApp(deps(db, { generateProgram: async () => ({ name: "x", weeks: [] }) }));
  const res = await app.request("/objective", { method: "PUT", headers: { ...authHeader, "content-type": "application/json" }, body: JSON.stringify({ content: "" }) });
  expect(res.status).toBe(200);
  expect(db._get().content).toBe("");
});

test("POST /objective/draft llama a la IA y NO persiste", async () => {
  const db = fakeDb({ objective: "" });
  const ai = { generateProgram: async () => ({ name: "x", weeks: [] }), draftWorkObjective: async () => "borrador IA" };
  const app = createApp(deps(db, ai));
  const res = await app.request("/objective/draft", { method: "POST", headers: authHeader });
  expect(res.status).toBe(200);
  expect((await res.json()).content).toBe("borrador IA");
  expect(db._get().content).toBe(""); // draft no persiste
});

test("POST /objective/draft → 501 si el cliente no soporta el método", async () => {
  const app = createApp(deps(fakeDb({ objective: "" }), { generateProgram: async () => ({ name: "x", weeks: [] }) }));
  const res = await app.request("/objective/draft", { method: "POST", headers: authHeader });
  expect(res.status).toBe(501);
});

test("POST /objective/draft → 400 si no hay API key de IA configurada", async () => {
  const db = fakeDb({ objective: "", withKey: false });
  const ai = { generateProgram: async () => ({ name: "x", weeks: [] }), draftWorkObjective: async () => "borrador IA" };
  const app = createApp(deps(db, ai));
  const res = await app.request("/objective/draft", { method: "POST", headers: authHeader });
  expect(res.status).toBe(400);
});

test("POST /objective/draft → 400 si falta el perfil", async () => {
  const db = fakeDb({ objective: "", withProfile: false });
  const ai = { generateProgram: async () => ({ name: "x", weeks: [] }), draftWorkObjective: async () => "borrador IA" };
  const app = createApp(deps(db, ai));
  const res = await app.request("/objective/draft", { method: "POST", headers: authHeader });
  expect(res.status).toBe(400);
});

test("POST /objective/draft → 502 si la IA falla", async () => {
  const db = fakeDb({ objective: "" });
  const ai = { generateProgram: async () => ({ name: "x", weeks: [] }), draftWorkObjective: async () => { throw new Error("boom"); } };
  const app = createApp(deps(db, ai));
  const res = await app.request("/objective/draft", { method: "POST", headers: authHeader });
  expect(res.status).toBe(502);
});
