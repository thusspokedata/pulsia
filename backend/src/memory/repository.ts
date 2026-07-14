import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { athleteMemory } from "../db/schema";

export async function getMemory(db: Db, userId: string): Promise<string> {
  const row = await db.query.athleteMemory.findFirst({ where: eq(athleteMemory.userId, userId) });
  return row?.content ?? "";
}

// Cota defensiva: el prompt pide ~1500 chars, pero si el modelo no cumple, cada refresh reinyecta la
// memoria previa y podría crecer sin límite. Truncamos al guardar para acotar el crecimiento.
export const MAX_MEMORY_CHARS = 4000;

export async function upsertMemory(db: Db, userId: string, content: string): Promise<void> {
  const capped = content.length > MAX_MEMORY_CHARS ? content.slice(0, MAX_MEMORY_CHARS) : content;
  await db
    .insert(athleteMemory)
    .values({ userId, content: capped })
    .onConflictDoUpdate({ target: athleteMemory.userId, set: { content: capped, updatedAt: new Date() } });
}

// Anexa observaciones a la memoria existente (para los informes del agente, #4). A diferencia de
// upsertMemory (que trunca la cola, pensado para el refresh que reescribe todo), acá recortamos desde
// el FRENTE si excede el cap: las notas NUEVAS son las que importan, no las viejas. Se descarta la
// primera línea parcial para no dejar una observación cortada por la mitad.
export async function appendMemory(db: Db, userId: string, addition: string): Promise<void> {
  const current = await getMemory(db, userId);
  const combined = current ? `${current}\n${addition}` : addition;
  let capped = combined;
  if (combined.length > MAX_MEMORY_CHARS) {
    capped = combined.slice(combined.length - MAX_MEMORY_CHARS);
    const nl = capped.indexOf("\n");
    if (nl >= 0) capped = capped.slice(nl + 1);
  }
  await db
    .insert(athleteMemory)
    .values({ userId, content: capped })
    .onConflictDoUpdate({ target: athleteMemory.userId, set: { content: capped, updatedAt: new Date() } });
}
