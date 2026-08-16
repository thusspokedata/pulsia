import AsyncStorage from "@react-native-async-storage/async-storage";
import { TrainingProfileSchema, profileWithDerivedAge, type TrainingProfile } from "@pulsia/shared";

const KEY = "pulsia.profile";

export async function getProfile(): Promise<TrainingProfile | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = TrainingProfileSchema.safeParse(JSON.parse(raw));
    // Deriva la edad desde birthDate en la lectura: todo consumidor del perfil (perfil, progreso,
    // gasto) ve la edad fresca sin recalcularla en cada sitio.
    return parsed.success ? profileWithDerivedAge(parsed.data) : null;
  } catch {
    return null;
  }
}

export async function setProfile(profile: TrainingProfile): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(profile));
}
