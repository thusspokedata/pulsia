import AsyncStorage from "@react-native-async-storage/async-storage";
import { WorkoutSessionSchema, type WorkoutSession } from "@pulsia/shared";

const KEY = "pulsia.pendingSessions";

// Nota: se parsea manualmente item por item (en vez de z.array(...)) porque
// el import directo de "zod" no resuelve en el entorno jest de mobile
// (zod solo está hoisteado dentro de shared/node_modules, no en mobile/node_modules).
export async function getPendingSessions(): Promise<WorkoutSession[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const json = JSON.parse(raw);
    if (!Array.isArray(json)) return [];
    const result: WorkoutSession[] = [];
    for (const item of json) {
      const parsed = WorkoutSessionSchema.safeParse(item);
      if (!parsed.success) return [];
      result.push(parsed.data);
    }
    return result;
  } catch {
    return [];
  }
}

// Upsert por id: un único snapshot por sesión (reintentos/ediciones pisan, no duplican).
export async function enqueueSession(session: WorkoutSession): Promise<void> {
  const pend = await getPendingSessions();
  const next = [...pend.filter((s) => s.id !== session.id), session];
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

export async function removePendingSession(id: string): Promise<void> {
  const pend = await getPendingSessions();
  await AsyncStorage.setItem(KEY, JSON.stringify(pend.filter((s) => s.id !== id)));
}
