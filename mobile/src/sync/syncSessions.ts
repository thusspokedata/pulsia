import { putSession } from "../api/sessions";
import { getPendingSessions, removePendingSession } from "../storage/pendingSessions";
import { SyncError } from "./errors";

export interface SyncResult {
  synced: number;
  remaining: number;
  lastError: SyncError | null;
}

// Sube las sesiones pendientes. NUNCA descarta data: las que fallan quedan en la cola
// para el próximo flush (idempotente por id). Reporta el resultado en vez de tragarse el error.
export async function syncPending(baseUrl: string): Promise<SyncResult> {
  const pending = await getPendingSessions();
  let synced = 0;
  let lastError: SyncError | null = null;
  for (const session of pending) {
    try {
      await putSession(baseUrl, session);
      await removePendingSession(session.id);
      synced++;
    } catch (e) {
      lastError = e instanceof SyncError ? e : new SyncError("unknown");
    }
  }
  return { synced, remaining: pending.length - synced, lastError };
}
