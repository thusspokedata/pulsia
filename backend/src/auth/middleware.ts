import type { MiddlewareHandler } from "hono";
import type { Db } from "../db/client";
import { validateSession } from "./sessions";

type Validator = (db: Db, token: string, ttlDays: number) => Promise<string | null>;

export function requireAuth(db: Db, ttlDays: number, validate: Validator = validateSession): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header("Authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return c.json({ error: "No autorizado" }, 401);
    const userId = await validate(db, token, ttlDays);
    if (!userId) return c.json({ error: "Sesión inválida o expirada" }, 401);
    c.set("userId", userId);
    await next();
  };
}
