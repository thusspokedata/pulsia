import AsyncStorage from "@react-native-async-storage/async-storage";
import { WorkoutSessionSchema, type WorkoutSession } from "@pulsia/shared";

const KEY = "pulsia.activeSession";

export async function getActiveSession(): Promise<WorkoutSession | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = WorkoutSessionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function setActiveSession(session: WorkoutSession): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(session));
}

export async function clearActiveSession(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
