import { eq } from "drizzle-orm";
import { createDb, type Db } from "../db/client";
import { users, settings, profiles, athleteMemory, programs, workoutSession } from "../db/schema";
import { SINGLE_USER_ID } from "../constants";

// Reasigna todos los datos del usuario por defecto (single-user) a `targetUserId`.
// Tablas con PK = user_id (settings/profiles/athlete_memory): aborta si el destino ya tiene fila.
// Los hijos (session_exercise/set_log) cuelgan de workout_session por session_id → no se tocan.
export async function claimSingleUser(db: Db, targetUserId: string): Promise<void> {
  if (targetUserId === SINGLE_USER_ID) {
    throw new Error("El usuario destino no puede ser el usuario por defecto");
  }
  await db.transaction(async (tx) => {
    const pkTables = [
      { t: settings, name: "settings" },
      { t: profiles, name: "profiles" },
      { t: athleteMemory, name: "athlete_memory" },
    ] as const;
    for (const { t, name } of pkTables) {
      const existing = await tx.select().from(t).where(eq(t.userId, targetUserId)).limit(1);
      if (existing.length > 0) throw new Error(`El usuario destino ya tiene filas en ${name}; abortando`);
    }
    await tx.update(settings).set({ userId: targetUserId }).where(eq(settings.userId, SINGLE_USER_ID));
    await tx.update(profiles).set({ userId: targetUserId }).where(eq(profiles.userId, SINGLE_USER_ID));
    await tx.update(athleteMemory).set({ userId: targetUserId }).where(eq(athleteMemory.userId, SINGLE_USER_ID));
    await tx.update(programs).set({ userId: targetUserId }).where(eq(programs.userId, SINGLE_USER_ID));
    await tx.update(workoutSession).set({ userId: targetUserId }).where(eq(workoutSession.userId, SINGLE_USER_ID));
  });
}

async function main(): Promise<void> {
  const email = process.argv[2]?.trim();
  if (!email) {
    console.error("Uso: bun run src/scripts/claim-single-user.ts <email>");
    process.exit(1);
  }
  const { db, sql } = createDb(process.env.DATABASE_URL!);
  try {
    const user = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (!user) {
      console.error(`No existe un usuario con email ${email}`);
      process.exitCode = 1;
      return;
    }
    await claimSingleUser(db, user.id);
    console.log(`Datos del usuario por defecto reasignados a ${email} (${user.id})`);
  } finally {
    await sql.end();
  }
}

if (import.meta.main) {
  await main();
}
