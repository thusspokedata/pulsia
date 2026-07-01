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

if (import.meta.main) {
  const { db, sql } = createDb(process.env.DATABASE_URL!);
  // Usuario por defecto para el flujo single-user (todavía sin login). email/passwordHash
  // son placeholders; se reemplazan cuando entre el auth real.
  await db
    .insert(users)
    .values({ id: SINGLE_USER_ID, email: "default@pulsia.local", passwordHash: "unused" })
    .onConflictDoNothing();
  const rows = buildCatalogRows();
  await db.insert(exerciseCatalog).values(rows).onConflictDoNothing();
  console.log(`Seeded default user + ${rows.length} exercises`);
  await sql.end();
}
