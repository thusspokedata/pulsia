/*
 * Pulsia — compañero de salud y entrenamiento self-hosted.
 * Copyright (C) 2026 thusspokedata
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
import { createApp } from "./app";
import { createDb } from "./db/client";
import { AnthropicAiClient } from "./ai/client";
import { loadServerEnv } from "./config";
import { cargarUsdaSiHaceFalta } from "./usda/loader";

const { databaseUrl, config } = loadServerEnv();
const { db } = createDb(databaseUrl);
const app = createApp({
  db,
  config,
  aiClient: new AnthropicAiClient(),
});

// Se corre después de las migraciones (ya aplicadas por `db:migrate` antes de `bun run start`,
// ver Dockerfile). Se espera antes de aceptar tráfico (tarda ~1-2s, ver medición en el commit),
// pero si falla NO bloquea el arranque: ver el comentario en usda/loader.ts.
await cargarUsdaSiHaceFalta(db);

const port = Number(process.env.PORT ?? 8787);
console.log(`Pulsia backend en :${port}`);
export default { port, fetch: app.fetch };
