import type { AuthStatus } from "./AuthContext";

// A dónde mandar al usuario según el estado de auth, como decisión PURA (sin router ni hooks) para
// poder testearla sin montar la navegación.
//
// La clave del diseño: separar el "landing inicial" del "home" `/`.
//   - El landing inicial (abrir la app, o recién logueado) va a Nutrición, que es la pestaña que
//     más se usa.
//   - `/` sigue significando Programa: otros flujos (terminar una sesión, generar un programa)
//     hacen `replace("/")` para volver ahí, y NO deben terminar en Nutrición.
// Por eso, una vez hecho el landing inicial (`alreadyLanded`), esta función deja de redirigir:
// respeta dónde esté el usuario (incluido Programa tras un entreno).
//
// LIMITACIÓN CONOCIDA (latente hoy): el aterrizaje inicial va a Nutrición mire a donde mire
// `segments`. Hoy nada abre la app en una ruta puntual (no hay deep links / share links / taps de
// notificación que naveguen), así que no molesta. Cuando se agregue deep linking, este primer
// aterrizaje debería respetar la ruta entrante (no pisarla hacia Nutrición) — gatear con un
// "abrió en la raíz" contra la forma real de `segments`, verificada en el device.
export const NUTRICION_ROUTE = "/(tabs)/nutricion" as const;
export const LOGIN_ROUTE = "/login" as const;

export type Landing = typeof NUTRICION_ROUTE | typeof LOGIN_ROUTE | null;

export function authLanding(args: {
  status: AuthStatus;
  inAuth: boolean; // el usuario está parado en una pantalla de login/registro
  alreadyLanded: boolean; // ya se hizo el landing inicial en esta corrida de la app
}): Landing {
  const { status, inAuth, alreadyLanded } = args;
  if (status === "loading") return null;
  // Sin sesión: a login, salvo que ya esté en una pantalla de auth.
  if (status === "out") return inAuth ? null : LOGIN_ROUTE;
  // Con sesión y parado en login/registro → recién entró: a Nutrición.
  if (inAuth) return NUTRICION_ROUTE;
  // Con sesión, fuera de auth: solo el PRIMER aterrizaje va a Nutrición (arranque en frío). Después
  // no tocamos nada, para no pisar el `replace("/")` (Programa) de otros flujos.
  return alreadyLanded ? null : NUTRICION_ROUTE;
}
