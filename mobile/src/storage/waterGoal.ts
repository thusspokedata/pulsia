import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "pulsia.waterGoalOverrideMl";

/** Override manual de la meta de agua (ml). `null` = usar el cálculo automático. */
export async function getWaterGoalOverride(): Promise<number | null> {
  const v = await AsyncStorage.getItem(KEY);
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function setWaterGoalOverride(ml: number | null): Promise<void> {
  // Persistir solo un entero >= 1: un valor sub-1 (que redondearía a "0") equivale a "sin
  // override" y se borra, para no guardar un "0" que `get` leería de vuelta como null.
  const rounded = ml != null && Number.isFinite(ml) ? Math.round(ml) : 0;
  if (rounded < 1) {
    await AsyncStorage.removeItem(KEY);
    return;
  }
  await AsyncStorage.setItem(KEY, String(rounded));
}
