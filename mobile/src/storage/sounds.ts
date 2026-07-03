import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "pulsia.soundsEnabled";

export async function getSoundsEnabled(): Promise<boolean> {
  const v = await AsyncStorage.getItem(KEY);
  // Default a true: solo el valor explícito "0" deshabilita. Un valor corrupto
  // (ni "0" ni "1") cae al default habilitado en vez de silenciar por error.
  if (v === "0") return false;
  return true;
}

export async function setSoundsEnabled(v: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY, v ? "1" : "0");
}
