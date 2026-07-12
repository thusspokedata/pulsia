import { apiFetch } from "./client";

export interface SettingsInput {
  // Todos opcionales: el backend no sobrescribe campos ausentes. `aiApiKey` es
  // opcional para poder togglear ECG sin mandar una api key vacía.
  aiApiKey?: string;
  aiModel?: string;
  ecgEnabled?: boolean;
  kardiaPdfPassword?: string;
}

export interface SettingsStatus {
  hasApiKey: boolean;
  aiModel: string;
  ecgEnabled: boolean;
  hasKardiaPw: boolean;
}

export async function saveSettings(baseUrl: string, input: SettingsInput): Promise<void> {
  const res = await apiFetch(baseUrl, "/settings", { method: "POST", body: JSON.stringify(input) });
  if (!res.ok) throw new Error("No se pudo guardar la configuración");
}

export async function getSettings(baseUrl: string): Promise<SettingsStatus> {
  const res = await apiFetch(baseUrl, "/settings");
  if (!res.ok) throw new Error("No se pudo obtener la configuración");
  return res.json();
}
