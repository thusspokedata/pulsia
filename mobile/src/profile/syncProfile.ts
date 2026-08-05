import { getProfile } from "../storage/profile";
import { getBackendProfile, putProfile } from "../api/profile";

// Backfill de una vía: si hay perfil local pero el backend no tiene ninguno, lo sube. Si el
// backend ya tiene, no toca nada (los cambios posteriores viajan por putProfile en el guardado).
// Best-effort: cualquier error se traga (offline / backend no configurado).
export async function syncProfileToBackend(baseUrl: string): Promise<void> {
  try {
    const local = await getProfile();
    if (!local) return;
    const remote = await getBackendProfile(baseUrl);
    if (remote == null) await putProfile(baseUrl, local);
  } catch {
    /* offline o backend caído: se reintenta en el próximo arranque */
  }
}
