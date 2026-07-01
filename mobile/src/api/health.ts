import { apiFetch } from "./client";

export async function testConnection(baseUrl: string): Promise<boolean> {
  try {
    const res = await apiFetch(baseUrl, "/health");
    return res.ok;
  } catch {
    return false;
  }
}
