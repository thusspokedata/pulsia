import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "pulsia.programId";

export async function getStoredProgramId(): Promise<string | null> {
  return AsyncStorage.getItem(KEY);
}

export async function setStoredProgramId(id: string): Promise<void> {
  await AsyncStorage.setItem(KEY, id);
}
