import { apiFetch } from "./client";
import type { TrainingProfile } from "@pulsia/shared";

// Sube el perfil al backend (upsert por usuario). Fuente de verdad para la web.
export async function putProfile(baseUrl: string, profile: TrainingProfile): Promise<void> {
  const res = await apiFetch(baseUrl, "/profile", { method: "PUT", body: JSON.stringify(profile) });
  if (!res.ok) throw new Error("No se pudo sincronizar el perfil");
}

// Lee el perfil del backend. 404 (sin perfil) → null; otros errores lanzan.
export async function getBackendProfile(baseUrl: string): Promise<TrainingProfile | null> {
  const res = await apiFetch(baseUrl, "/profile");
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("No se pudo leer el perfil del backend");
  return (await res.json()) as TrainingProfile;
}
