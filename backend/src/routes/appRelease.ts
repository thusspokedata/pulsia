import { Hono } from "hono";
import { z } from "zod";
import { getLatestRelease, setLatestRelease } from "../appRelease/repository";
import type { AppDeps } from "../app";

const PutSchema = z.object({ versionCode: z.number().int().positive(), apkUrl: z.string().url(), label: z.string().optional() });

export function appReleaseRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: { userId: string } }>();
  r.get("/latest", async (c) => c.json({ release: await getLatestRelease(deps.db) }));
  r.put("/latest", async (c) => {
    const parsed = PutSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    await setLatestRelease(deps.db, parsed.data);
    return c.json({ release: await getLatestRelease(deps.db) });
  });
  return r;
}
