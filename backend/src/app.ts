import { Hono } from "hono";
import type { Db } from "./db/client";
import type { AiClient } from "./ai/client";
import { settingsRoutes } from "./routes/settings";
import { programsRoutes } from "./routes/programs";
import { authRoutes } from "./routes/auth";
import { profileRoutes } from "./routes/profile";
import type { MiddlewareHandler } from "hono";
import { requireAuth } from "./auth/middleware";
import { sessionsRoutes } from "./routes/sessions";
import { memoryRoutes } from "./routes/memory";
import { SINGLE_USER_ID } from "./constants";

export interface AppConfig {
  encryptionKey: string;
  defaultModel: string;
  inviteCode: string;
  sessionTtlDays: number;
  singleUserMode: boolean;
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
  // En modo single-user se saltea el login y se usa el usuario por defecto; si no,
  // se exige un token de sesión válido (multi-usuario).
  const auth: MiddlewareHandler = deps.config.singleUserMode
    ? async (c, next) => {
        c.set("userId", SINGLE_USER_ID);
        await next();
      }
    : requireAuth(deps.db, deps.config.sessionTtlDays);
  app.use("/settings", auth);
  app.use("/settings/*", auth);
  app.use("/programs", auth);
  app.use("/programs/*", auth);
  app.use("/profile", auth);
  app.use("/profile/*", auth);
  app.use("/memory", auth);
  app.use("/memory/*", auth);
  app.route("/settings", settingsRoutes(deps));
  app.route("/programs", programsRoutes(deps));
  app.route("/profile", profileRoutes(deps));
  app.route("/sessions", sessionsRoutes(deps));
  app.route("/memory", memoryRoutes(deps));
  return app;
}
