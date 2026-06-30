import { Hono } from "hono";
import type { Db } from "./db/client";
import type { AiClient } from "./ai/client";
import { settingsRoutes } from "./routes/settings";

export interface AppConfig {
  encryptionKey: string;
  defaultModel: string;
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
  return app;
}
