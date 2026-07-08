import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_BACKEND_URL } from "../config/backend";

const KEY = "pulsia.backendUrl";

export async function getBackendUrl(): Promise<string | null> {
  const stored = await AsyncStorage.getItem(KEY);
  return stored ?? DEFAULT_BACKEND_URL;
}

export async function setBackendUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(KEY, url);
}
