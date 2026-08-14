import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "pulsia.supplementsCollapsed";

export async function getSupplementsCollapsed(): Promise<boolean> {
  const v = await AsyncStorage.getItem(KEY);
  // Default a colapsada: solo el valor explícito "0" la deja abierta. Un valor
  // corrupto (ni "0" ni "1") cae al default colapsado en vez de ocupar pantalla.
  if (v === "0") return false;
  return true;
}

export async function setSupplementsCollapsed(v: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY, v ? "1" : "0");
}
