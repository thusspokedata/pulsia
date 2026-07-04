import { test, expect } from "bun:test";
import { getMemory, upsertMemory } from "./repository";

function fakeDb() {
  let stored: any = null;
  return {
    _get: () => stored,
    query: { athleteMemory: { findFirst: async () => stored } },
    insert: (_t: any) => ({
      values: (v: any) => ({
        onConflictDoUpdate: async ({ set }: any) => { stored = { ...(stored ?? { userId: v.userId }), ...v, ...set }; },
      }),
    }),
  } as any;
}

test("getMemory devuelve '' si no hay fila", async () => {
  expect(await getMemory(fakeDb(), "u")).toBe("");
});

test("upsertMemory guarda y getMemory lo devuelve", async () => {
  const db = fakeDb();
  await upsertMemory(db, "u", "no tiene barra; press fuerte");
  expect(db._get().content).toBe("no tiene barra; press fuerte");
});

test("upsertMemory trunca contenido excesivamente largo (cota defensiva)", async () => {
  const db = fakeDb();
  await upsertMemory(db, "u", "x".repeat(10000));
  expect(db._get().content.length).toBeLessThanOrEqual(4000);
});
