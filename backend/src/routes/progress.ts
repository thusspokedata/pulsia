import { Hono } from "hono";
import { computePerformanceTrends } from "@pulsia/shared";
import { getRecentSessions } from "../sessions/repository";
import type { AppDeps } from "../app";

const PROGRESS_SESSION_LIMIT = 200; // cota superior: todo el historial razonable para charts

export function progressRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: { userId: string } }>();

  r.get("/performance", async (c) => {
    const sessions = await getRecentSessions(deps.db, c.get("userId"), PROGRESS_SESSION_LIMIT);
    return c.json(computePerformanceTrends(sessions));
  });

  return r;
}
