import { putSession } from "../api/sessions";
import { getPendingSessions, removePendingSession } from "../storage/pendingSessions";

// Sube las sesiones pendientes. Devuelve cuántas se sincronizaron con éxito.
// Las que fallan quedan en la cola para el próximo intento (idempotente por id).
export async function syncPending(baseUrl: string): Promise<number> {
  const pending = await getPendingSessions();
  let synced = 0;
  for (const session of pending) {
    try {
      await putSession(baseUrl, session);
      await removePendingSession(session.id);
      synced++;
    } catch {
      // se reintenta en el próximo flush
    }
  }
  return synced;
}
