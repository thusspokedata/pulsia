import * as SecureStore from "expo-secure-store";

const KEY = "pulsia.authToken";

export async function getToken(): Promise<string | null> {
  try { return await SecureStore.getItemAsync(KEY); } catch { return null; }
}
export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, token);
}
export async function clearToken(): Promise<void> {
  try { await SecureStore.deleteItemAsync(KEY); } catch { /* best-effort */ }
}
