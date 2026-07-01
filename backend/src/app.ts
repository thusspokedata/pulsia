import { Hono } from "hono";
import type { Db } from "./db/client";
import type { AiClient } from "./ai/client";
import { settingsRoutes } from "./routes/settings";
import { programsRoutes } from "./routes/programs";
import { authRoutes } from "./routes/auth";
import { profileRoutes } from "./routes/profile";
import { requireAuth } from "./auth/middleware";

export interface AppConfig {
  encryptionKey: string;
  defaultModel: string;
  inviteCode: string;
  sessionTtlDays: number;
}

export interface AppDeps {
  db: Db;
  config: AppConfig;
  aiClient: AiClient;
}

export function createApp(deps: AppDeps) {
  const app = new Hono<{ Variables: { userId: string } }>();
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.route("/auth", authRoutes(deps));
  const auth = requireAuth(deps.db, deps.config.sessionTtlDays);
  app.use("/settings", auth);
  app.use("/settings/*", auth);
  app.use("/programs", auth);
  app.use("/programs/*", auth);
  app.use("/profile", auth);
  app.use("/profile/*", auth);
  app.route("/settings", settingsRoutes(deps));
  app.route("/programs", programsRoutes(deps));
  app.route("/profile", profileRoutes(deps));
  return app;
}
