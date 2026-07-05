import { Hono } from "hono";
import { z } from "zod";
import { createHash, timingSafeEqual } from "node:crypto";
import { getLatestRelease, setLatestRelease } from "../appRelease/repository";
import type { AppDeps } from "../app";

const PutSchema = z.object({ versionCode: z.number().int().positive(), apkUrl: z.string().url(), label: z.string().optional() });

// Comparación timing-safe sobre hashes SHA-256 (largo constante → no filtra la longitud del token).
function tokenMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function appReleaseRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: { userId: string } }>();

  // GET abierto: la app lo consulta para saber si hay una versión nueva.
  r.get("/latest", async (c) => c.json({ release: await getLatestRelease(deps.db) }));

  // PUT solo ops/admin: escribe el singleton global (`app_release`), consumido por TODOS los clientes.
  // Requiere `X-Admin-Token` == `ADMIN_TOKEN`. Fail-closed: si el token no está configurado, se rechaza.
  r.put("/latest", async (c) => {
    const expected = deps.config.adminToken;
    const provided = c.req.header("x-admin-token") ?? "";
    if (!expected || !tokenMatches(provided, expected)) {
      return c.json({ error: "no autorizado (se requiere X-Admin-Token)" }, 403);
    }
    const parsed = PutSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    await setLatestRelease(deps.db, parsed.data);
    return c.json({ release: await getLatestRelease(deps.db) });
  });

  return r;
}
