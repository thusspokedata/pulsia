import { createApp } from "./app";
import { createDb } from "./db/client";
import { AnthropicAiClient } from "./ai/client";
import { loadServerEnv } from "./config";

const { databaseUrl, config } = loadServerEnv();
const { db } = createDb(databaseUrl);
const app = createApp({
  db,
  config,
  aiClient: new AnthropicAiClient(),
});

const port = Number(process.env.PORT ?? 8787);
console.log(`Pulsia backend en :${port}`);
export default { port, fetch: app.fetch };
