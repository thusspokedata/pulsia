// Handler global que se dispara cuando una request autenticada recibe 401 (token vencido).
// Lo registra el AuthProvider; apiFetch lo invoca. Evita acoplar el api client al contexto de React.
let handler: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void { handler = fn; }
export function notifyUnauthorized(): void { handler?.(); }
