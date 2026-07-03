import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "pulsia.soundsEnabled";

export async function getSoundsEnabled(): Promise<boolean> {
  const v = await AsyncStorage.getItem(KEY);
  if (v == null) return true; // default: sonidos habilitados
  return v === "1";
}

export async function setSoundsEnabled(v: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY, v ? "1" : "0");
}
