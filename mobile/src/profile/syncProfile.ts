import { getProfile } from "../storage/profile";
import { getBackendProfile, putProfile } from "../api/profile";

// Backfill de una vía: si hay perfil local pero el backend no tiene ninguno, lo sube. Si el
// backend ya tiene, no toca nada (los cambios posteriores viajan por putProfile en el guardado).
// Best-effort: cualquier error se traga (offline / backend no configurado).
export async function syncProfileToBackend(baseUrl: string): Promise<void> {
  try {
    if (!(await getProfile())) return;
    const remote = await getBackendProfile(baseUrl);
    if (remote != null) return;
    // Re-leemos el local JUSTO antes de escribir. Si el usuario guardó un perfil nuevo mientras
    // el read del backend estaba en vuelo (su onSave ya lo persistió local + PUT), subimos ESE
    // valor y no el snapshot viejo — así el backfill no pisa un guardado más nuevo con datos
    // rancios. (Este backfill solo dispara cuando el backend está en 404: una vez por usuario.)
    const current = await getProfile();
    if (current) await putProfile(baseUrl, current);
  } catch {
    /* offline o backend caído: se reintenta en el próximo arranque */
  }
}
