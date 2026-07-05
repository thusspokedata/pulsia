import AsyncStorage from "@react-native-async-storage/async-storage";
import { ProgramSchema, type Program } from "@pulsia/shared";

const PROGRAM_KEY = "pulsia.oneOffProgram";
const ID_KEY = "pulsia.oneOffProgramId";

export async function getStoredOneOffProgram(): Promise<Program | null> {
  const raw = await AsyncStorage.getItem(PROGRAM_KEY);
  if (!raw) return null;
  try {
    const parsed = ProgramSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function setStoredOneOffProgram(program: Program): Promise<void> {
  await AsyncStorage.setItem(PROGRAM_KEY, JSON.stringify(program));
}

export async function getStoredOneOffProgramId(): Promise<string | null> {
  return AsyncStorage.getItem(ID_KEY);
}

export async function setStoredOneOffProgramId(id: string): Promise<void> {
  await AsyncStorage.setItem(ID_KEY, id);
}

export async function clearOneOff(): Promise<void> {
  await AsyncStorage.multiRemove([PROGRAM_KEY, ID_KEY]);
}
