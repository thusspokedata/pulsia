import { createApp } from "./app";
import { createDb } from "./db/client";
import { AnthropicAiClient } from "./ai/client";

const { db } = createDb(process.env.DATABASE_URL!);
const app = createApp({
  db,
  config: {
    encryptionKey: process.env.ENCRYPTION_KEY!,
    defaultModel: "claude-sonnet-4-6",
  },
  aiClient: new AnthropicAiClient(),
});

const port = Number(process.env.PORT ?? 8787);
console.log(`Pulsia backend en :${port}`);
export default { port, fetch: app.fetch };
