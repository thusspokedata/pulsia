import { test, expect } from "bun:test";
import { getMemory, upsertMemory, appendMemory, MAX_MEMORY_CHARS } from "./repository";

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

test("appendMemory anexa a lo existente", async () => {
  const db = fakeDb();
  await upsertMemory(db, "u", "observación vieja");
  await appendMemory(db, "u", "[2026-07-14] observación nueva");
  expect(db._get().content).toBe("observación vieja\n[2026-07-14] observación nueva");
});

test("appendMemory recorta desde el FRENTE (conserva lo nuevo) si excede el cap", async () => {
  const db = fakeDb();
  await upsertMemory(db, "u", "V".repeat(MAX_MEMORY_CHARS)); // memoria vieja al tope
  await appendMemory(db, "u", "[2026-07-14] NOTA NUEVA IMPORTANTE");
  const content = db._get().content;
  expect(content.length).toBeLessThanOrEqual(MAX_MEMORY_CHARS);
  expect(content).toContain("NOTA NUEVA IMPORTANTE"); // la nota nueva SOBREVIVE
});
