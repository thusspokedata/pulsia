import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "pulsia.backendUrl";

export async function getBackendUrl(): Promise<string | null> {
  return AsyncStorage.getItem(KEY);
}

export async function setBackendUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(KEY, url);
}
