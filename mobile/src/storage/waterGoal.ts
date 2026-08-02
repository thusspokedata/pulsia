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
  if (ml == null || !Number.isFinite(ml) || ml <= 0) {
    await AsyncStorage.removeItem(KEY);
    return;
  }
  await AsyncStorage.setItem(KEY, String(Math.round(ml)));
}
