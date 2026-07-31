import type { MiddlewareHandler } from "hono";
import type { Db } from "../db/client";
import { validateSession } from "./sessions";
import { readSessionCookie } from "./cookie";

type Validator = (db: Db, token: string, ttlDays: number) => Promise<string | null>;

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function requireAuth(db: Db, ttlDays: number, validate: Validator = validateSession): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header("Authorization") ?? "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
    const cookieToken = readSessionCookie(c);
    // Precedencia: header (móvil) sobre cookie (web).
    const token = bearer || cookieToken || "";
    const viaCookie = !bearer && !!cookieToken;
    if (!token) return c.json({ error: "No autorizado" }, 401);

    // CSRF: una request que muta y se autenticó SOLO por la cookie debe traer un header custom
    // que un <form> cross-site no puede setear. El móvil (Bearer) queda exento.
    if (viaCookie && MUTATING.has(c.req.method) && !c.req.header("X-Requested-With")) {
      return c.json({ error: "Falta cabecera anti-CSRF" }, 403);
    }

    const userId = await validate(db, token, ttlDays);
    if (!userId) return c.json({ error: "Sesión inválida o expirada" }, 401);
    c.set("userId", userId);
    await next();
  };
}
