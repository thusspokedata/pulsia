import { Hono } from "hono";
import { serveStatic } from "hono/bun";
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
import { appReleaseRoutes } from "./routes/appRelease";
import { metricsRoutes } from "./routes/metrics";
import { ecgRoutes } from "./routes/ecg";
import { progressRoutes } from "./routes/progress";
import { nutritionRoutes } from "./routes/nutrition";
import { cardioRoutes } from "./routes/cardio";
import { downloadRoutes } from "./routes/download";
import { SINGLE_USER_ID } from "./constants";

export interface AppConfig {
  encryptionKey: string;
  defaultModel: string;
  inviteCode: string;
  sessionTtlDays: number;
  singleUserMode: boolean;
  // Token de admin/ops para escribir la release (PUT /app/latest). Si no está seteado, el PUT se
  // rechaza (fail-closed). Se setea en app.env de la Pi tras cada build.
  adminToken?: string;
  defaultAiApiKey?: string;
  // Dir del build de la SPA (web/dist). Si está seteado, se sirve como estáticos con
  // fallback a index.html. En dev suele estar ausente (la web corre con `vite dev`).
  webDistDir?: string;
}

export interface AppDeps {
  db: Db;
  config: AppConfig;
  aiClient: AiClient;
}

export function createApp(deps: AppDeps) {
  const app = new Hono<{ Variables: { userId: string } }>();
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.route("/download", downloadRoutes(deps)); // PÚBLICA: fuera del middleware `auth`
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
  app.use("/app", auth);
  app.use("/app/*", auth);
  app.use("/sessions", auth);
  app.use("/sessions/*", auth);
  app.use("/metrics", auth);
  app.use("/metrics/*", auth);
  app.use("/ecg", auth);
  app.use("/ecg/*", auth);
  app.use("/progress", auth);
  app.use("/progress/*", auth);
  app.use("/nutrition", auth);
  app.use("/nutrition/*", auth);
  app.use("/cardio", auth);
  app.use("/cardio/*", auth);
  app.route("/settings", settingsRoutes(deps));
  app.route("/programs", programsRoutes(deps));
  app.route("/profile", profileRoutes(deps));
  app.route("/sessions", sessionsRoutes(deps));
  app.route("/memory", memoryRoutes(deps));
  app.route("/app", appReleaseRoutes(deps));
  app.route("/metrics", metricsRoutes(deps));
  app.route("/ecg", ecgRoutes(deps));
  app.route("/progress", progressRoutes(deps));
  app.route("/nutrition", nutritionRoutes(deps));
  app.route("/cardio", cardioRoutes(deps));
  if (deps.config.webDistDir) {
    const root = deps.config.webDistDir;
    // Estáticos (assets con extensión) y fallback SPA a index.html para el resto.
    app.get("/assets/*", serveStatic({ root }));
    // serveStatic hace next() cuando el archivo no existe; sin esto, un asset inexistente
    // caía al catch-all de abajo y devolvía index.html con 200 en vez de 404.
    app.get("/assets/*", (c) => c.text("Not found", 404));
    app.get("*", async (c, next) => {
      // No tapar las rutas de API ya registradas: si el método no es GET o ya hubo match, seguir.
      const html = Bun.file(`${root}/index.html`);
      if (await html.exists()) return c.html(await html.text());
      return next();
    });
  }
  return app;
}
