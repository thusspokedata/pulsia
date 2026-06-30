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
  await db.insert(users).values({ id: SINGLE_USER_ID }).onConflictDoNothing();
  console.log(`Seeded default user ${SINGLE_USER_ID}`);
  const rows = buildCatalogRows();
  await db.insert(exerciseCatalog).values(rows).onConflictDoNothing();
  console.log(`Seeded ${rows.length} exercises`);
  await sql.end();
}
