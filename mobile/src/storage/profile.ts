import AsyncStorage from "@react-native-async-storage/async-storage";
import { TrainingProfileSchema, type TrainingProfile } from "@pulsia/shared";

const KEY = "pulsia.profile";

export async function getProfile(): Promise<TrainingProfile | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = TrainingProfileSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function setProfile(profile: TrainingProfile): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(profile));
}
