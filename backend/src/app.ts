import { Hono } from "hono";
import type { Db } from "./db/client";
import type { AiClient } from "./ai/client";
import { settingsRoutes } from "./routes/settings";
import { programsRoutes } from "./routes/programs";
import { authRoutes } from "./routes/auth";
import { sessionsRoutes } from "./routes/sessions";

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
  const app = new Hono();
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.route("/settings", settingsRoutes(deps));
  app.route("/programs", programsRoutes(deps));
  app.route("/auth", authRoutes(deps));
  app.route("/sessions", sessionsRoutes(deps));
  return app;
}
