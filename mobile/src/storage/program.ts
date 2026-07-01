import AsyncStorage from "@react-native-async-storage/async-storage";
import { ProgramSchema, type Program } from "@pulsia/shared";

const KEY = "pulsia.program";

export async function getStoredProgram(): Promise<Program | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  const parsed = ProgramSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

export async function setStoredProgram(program: Program): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(program));
}
