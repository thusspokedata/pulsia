import { EXERCISE_CATALOG } from "@pulsia/shared";
import { createDb } from "./client";
import { exerciseCatalog, users } from "./schema";
import { SINGLE_USER_ID } from "../constants";

export function buildCatalogRows() {
  return EXERCISE_CATALOG.map((e) => ({
    id: e.id,
    garminCategory: e.garminCategory,
    garminName: e.garminName,
    displayName: e.displayName,
    primaryMuscles: e.primaryMuscles,
    secondaryMuscles: e.secondaryMuscles,
    equipment: e.equipment,
  }));
}

// Usuario por defecto para el flujo single-user (todavía sin login). email/passwordHash
// son placeholders; se reemplazan cuando entre el auth real.
export function buildDefaultUserRow() {
  return { id: SINGLE_USER_ID, email: "default@pulsia.local", passwordHash: "unused" };
}

// Inserta el usuario por defecto y el catálogo (idempotente). Devuelve la cantidad de
// ejercicios sembrados. Recibe `db` para poder testear sin una DB real.
export async function seed(db: ReturnType<typeof createDb>["db"]): Promise<number> {
  await db.insert(users).values(buildDefaultUserRow()).onConflictDoNothing();
  const rows = buildCatalogRows();
  await db.insert(exerciseCatalog).values(rows).onConflictDoNothing();
  return rows.length;
}

if (import.meta.main) {
  const { db, sql } = createDb(process.env.DATABASE_URL!);
  const count = await seed(db);
  console.log(`Seeded default user + ${count} exercises`);
  await sql.end();
}
