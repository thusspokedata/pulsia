import { apiFetch } from "./client";

export interface SettingsInput {
  aiApiKey: string;
  aiModel: string;
}

export interface SettingsStatus {
  hasApiKey: boolean;
  aiModel: string;
}

export async function saveSettings(baseUrl: string, input: SettingsInput): Promise<void> {
  const res = await apiFetch(baseUrl, "/settings", { method: "POST", body: JSON.stringify(input) });
  if (!res.ok) throw new Error("No se pudo guardar la configuración");
}

export async function getSettings(baseUrl: string): Promise<SettingsStatus> {
  const res = await apiFetch(baseUrl, "/settings");
  return res.json();
}
