export type SyncErrorKind =
  | "network" | "auth" | "validation" | "conflict" | "server" | "unknown";

const MESSAGES: Record<SyncErrorKind, string> = {
  network: "Sin conexión",
  auth: "Sesión vencida",
  validation: "Datos inválidos",
  conflict: "Conflicto de datos",
  server: "Error del servidor",
  unknown: "No se pudo sincronizar",
};

const RETRYABLE: Record<SyncErrorKind, boolean> = {
  network: true, server: true,
  auth: false, validation: false, conflict: false, unknown: false,
};

export class SyncError extends Error {
  readonly kind: SyncErrorKind;
  readonly status?: number;
  readonly userMessage: string;
  readonly retryable: boolean;
  constructor(kind: SyncErrorKind, status?: number) {
    super(`${kind}${status ? ` (${status})` : ""}`);
    this.name = "SyncError";
    this.kind = kind;
    this.status = status;
    this.userMessage = MESSAGES[kind];
    this.retryable = RETRYABLE[kind];
  }
}

export function syncErrorFromResponse(res: Pick<Response, "status">): SyncError {
  const s = res.status;
  if (s === 401 || s === 403) return new SyncError("auth", s);
  if (s === 400 || s === 422) return new SyncError("validation", s);
  if (s === 409) return new SyncError("conflict", s);
  if (s >= 500) return new SyncError("server", s);
  return new SyncError("unknown", s);
}

export function syncErrorFromThrown(_e: unknown): SyncError {
  return new SyncError("network");
}
