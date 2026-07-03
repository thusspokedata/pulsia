// mobile/src/storage/pairedBand.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "pulsia.pairedBand";

export interface PairedBand {
  deviceId: string;
  name: string;
}

export async function getPairedBand(): Promise<PairedBand | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (p && typeof p.deviceId === "string" && typeof p.name === "string") return p;
    return null;
  } catch {
    return null;
  }
}

export async function setPairedBand(band: PairedBand): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(band));
}

export async function clearPairedBand(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
