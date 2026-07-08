import { test, expect } from "bun:test";
import { claimSingleUser } from "./claim-single-user";
import { SINGLE_USER_ID } from "../constants";

// Fake db que registra los .update(table) y responde vacío a los selects de colisión.
function fakeDb() {
  const updates: string[] = [];
  const nameOf = (t: any) => t?._?.name ?? t?.name ?? "unknown";
  return {
    _updates: updates,
    select: () => ({ from: (_t: any) => ({ where: () => ({ limit: async () => [] }) }) }),
    update: (t: any) => ({ set: (_v: any) => ({ where: async () => { updates.push(nameOf(t)); } }) }),
  } as any;
}

test("aborta si el destino es el usuario por defecto", async () => {
  await expect(claimSingleUser(fakeDb(), SINGLE_USER_ID)).rejects.toThrow();
});

test("reasigna las 5 tablas al usuario destino", async () => {
  const db = fakeDb();
  await claimSingleUser(db, "11111111-1111-4111-8111-111111111111");
  expect(db._updates.length).toBe(5);
});
