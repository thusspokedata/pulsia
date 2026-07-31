import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

export const SESSION_COOKIE = "pulsia_session";

// httpOnly → el JS de la página no la puede leer (a prueba de robo por XSS).
// Secure → solo por HTTPS (los browsers hacen excepción para http://localhost en dev).
// SameSite=Strict → no viaja en requests cross-site (base de la defensa CSRF).
export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export function readSessionCookie(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}
