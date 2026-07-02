import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { users } from "../db/schema";
import { hashPassword, verifyPassword } from "../auth/passwords";
import { createSession, deleteSession } from "../auth/sessions";
import type { AppDeps } from "../app";

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  inviteCode: z.string().min(1),
});
const LoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export function authRoutes(deps: AppDeps) {
  const r = new Hono();

  r.post("/register", async (c) => {
    const parsed = RegisterSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    if (parsed.data.inviteCode !== deps.config.inviteCode) return c.json({ error: "Código de invitación inválido" }, 403);
    const existing = await deps.db.query.users.findFirst({ where: eq(users.email, parsed.data.email) });
    if (existing) return c.json({ error: "Ese email ya está registrado" }, 409);
    const passwordHash = await hashPassword(parsed.data.password);
    const inserted = await deps.db.insert(users).values({ email: parsed.data.email, passwordHash }).returning();
    const token = await createSession(deps.db, inserted[0].id, deps.config.sessionTtlDays);
    return c.json({ token });
  });

  r.post("/login", async (c) => {
    const parsed = LoginSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    const user = await deps.db.query.users.findFirst({ where: eq(users.email, parsed.data.email) });
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return c.json({ error: "Email o contraseña incorrectos" }, 401);
    }
    const token = await createSession(deps.db, user.id, deps.config.sessionTtlDays);
    return c.json({ token });
  });

  r.post("/logout", async (c) => {
    const header = c.req.header("Authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (token) await deleteSession(deps.db, token);
    return c.json({ ok: true });
  });

  return r;
}
