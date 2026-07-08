import { test, expect } from "bun:test";
import { claimSingleUser } from "./claim-single-user";
import { SINGLE_USER_ID } from "../constants";

// Fake db que ejecuta la callback de `transaction(fn)` con un `tx` que registra los
// .update(table) y responde a los selects de colisión. `collision` hace que el select
// devuelva una fila (destino ya ocupado). `throwOnUpdate` fuerza que el n-ésimo update
// lance, para ejercitar el rollback (el error se propaga desde la tx).
function fakeDb(opts?: { collision?: boolean; throwOnUpdate?: number }) {
  const updates: string[] = [];
  let n = 0;
  const tx = {
    select: () => ({ from: (_t: any) => ({ where: () => ({ limit: async () => (opts?.collision ? [{}] : []) }) }) }),
    update: (_t: any) => ({
      set: (_v: any) => ({
        where: async () => {
          n++;
          if (opts?.throwOnUpdate === n) throw new Error("db caída");
          updates.push("u");
        },
      }),
    }),
  };
  return { _updates: updates, transaction: async (fn: any) => fn(tx) } as any;
}

test("aborta si el destino es el usuario por defecto", async () => {
  await expect(claimSingleUser(fakeDb(), SINGLE_USER_ID)).rejects.toThrow();
});

test("reasigna las 5 tablas al usuario destino", async () => {
  const db = fakeDb();
  await claimSingleUser(db, "11111111-1111-4111-8111-111111111111");
  expect(db._updates.length).toBe(5);
});

test("aborta si el destino ya tiene filas (colisión de PK)", async () => {
  await expect(
    claimSingleUser(fakeDb({ collision: true }), "11111111-1111-4111-8111-111111111111"),
  ).rejects.toThrow(/ya tiene filas/);
});

test("propaga el error (rollback) si un update de la transacción falla", async () => {
  const db = fakeDb({ throwOnUpdate: 2 });
  await expect(claimSingleUser(db, "11111111-1111-4111-8111-111111111111")).rejects.toThrow();
});
