import { putSession } from "../api/sessions";
import { getPendingSessions, removePendingSession } from "../storage/pendingSessions";
import { SyncError } from "./errors";

export interface SyncResult {
  synced: number;
  remaining: number;
  lastError: SyncError | null;
}

// Barrido real de la cola (una pasada). NUNCA descarta data: las que fallan quedan en la cola
// para el próximo flush (idempotente por id). Reporta el resultado en vez de tragarse el error.
async function flushOnce(baseUrl: string): Promise<SyncResult> {
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

// Mutex a nivel módulo: serializa TODOS los llamadores (hook de foreground + onFinish +
// saveFinishedNotes) para que nunca haya dos barridos de la cola en vuelo a la vez
// (evita PUTs concurrentes y que un remove borre un payload más nuevo por el mismo id).
let chain: Promise<unknown> = Promise.resolve();

export function syncPending(baseUrl: string): Promise<SyncResult> {
  const run = chain.then(() => flushOnce(baseUrl), () => flushOnce(baseUrl));
  // el siguiente llamador espera a que ESTE termine (éxito o error), sin propagar el rechazo a la cadena
  chain = run.then(() => undefined, () => undefined);
  return run;
}
