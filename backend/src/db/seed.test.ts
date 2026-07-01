import { test, expect } from "bun:test";
import { EXERCISE_CATALOG } from "@pulsia/shared";
import { buildCatalogRows, buildDefaultUserRow, seed } from "./seed";
import { users, exerciseCatalog } from "./schema";
import { SINGLE_USER_ID } from "../constants";

test("convierte el catálogo a filas insertables", () => {
  const rows = buildCatalogRows();
  expect(rows.length).toBe(EXERCISE_CATALOG.length);
  const bench = rows.find((r) => r.id === "barbell_bench_press");
  expect(bench?.garminName).toBe("Barbell Bench Press");
  expect(Array.isArray(bench?.primaryMuscles)).toBe(true);
});

test("el usuario por defecto usa el SINGLE_USER_ID", () => {
  const row = buildDefaultUserRow();
  expect(row.id).toBe(SINGLE_USER_ID);
  expect(row.email).toBe("default@pulsia.local");
});

// Fake db que registra la cadena insert(table).values(v).onConflictDoNothing().
function makeFakeDb() {
  const calls: Array<{ table: unknown; values: unknown; onConflict: boolean }> = [];
  const db = {
    insert(table: unknown) {
      const call = { table, values: undefined as unknown, onConflict: false };
      calls.push(call);
      const chain = {
        values(v: unknown) {
          call.values = v;
          return chain;
        },
        onConflictDoNothing() {
          call.onConflict = true;
          return Promise.resolve();
        },
      };
      return chain;
    },
  };
  return { db, calls };
}

test("seed inserta el usuario por defecto y el catálogo con onConflictDoNothing", async () => {
  const { db, calls } = makeFakeDb();
  const n = await seed(db as never);

  expect(n).toBe(EXERCISE_CATALOG.length);

  // Primer insert: el usuario por defecto, con onConflictDoNothing.
  expect(calls[0].table).toBe(users);
  expect(calls[0].values).toMatchObject({ id: SINGLE_USER_ID, email: "default@pulsia.local" });
  expect(calls[0].onConflict).toBe(true);

  // Segundo insert: las filas del catálogo, con onConflictDoNothing.
  expect(calls[1].table).toBe(exerciseCatalog);
  expect(Array.isArray(calls[1].values)).toBe(true);
  expect((calls[1].values as unknown[]).length).toBe(EXERCISE_CATALOG.length);
  expect(calls[1].onConflict).toBe(true);
});
