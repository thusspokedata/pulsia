import { test, expect } from "bun:test";
import { getWorkObjective, upsertWorkObjective, MAX_OBJECTIVE_CHARS } from "./repository";

function fakeDb(initial: string | null) {
  let row = initial == null ? null : { userId: "u1", content: initial };
  return {
    _get: () => row,
    query: { workObjective: { findFirst: async () => row } },
    insert: () => ({
      values: (v: any) => ({
        onConflictDoUpdate: async ({ set }: any) => { row = { userId: v.userId, content: set.content }; },
      }),
    }),
  } as any;
}

test("getWorkObjective devuelve '' cuando no hay fila", async () => {
  expect(await getWorkObjective(fakeDb(null), "u1")).toBe("");
});

test("getWorkObjective devuelve el contenido guardado", async () => {
  expect(await getWorkObjective(fakeDb("bajar grasa manteniendo fuerza"), "u1")).toBe("bajar grasa manteniendo fuerza");
});

test("upsertWorkObjective persiste el contenido", async () => {
  const db = fakeDb(null);
  await upsertWorkObjective(db, "u1", "recomposición 12 semanas");
  expect(db._get().content).toBe("recomposición 12 semanas");
});

test("upsertWorkObjective trunca contenido excesivamente largo (cota defensiva)", async () => {
  const db = fakeDb(null);
  await upsertWorkObjective(db, "u1", "x".repeat(10000));
  expect(db._get().content.length).toBeLessThanOrEqual(MAX_OBJECTIVE_CHARS);
});
