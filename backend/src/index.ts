import { createApp } from "./app";
import { createDb } from "./db/client";
import type { AiClient } from "./ai/client";

// TODO(PR5): replace with the real AnthropicAiClient once generation lands.
const stubAiClient: AiClient = {
  generateProgram: async () => {
    throw new Error("Generación de programa aún no implementada (PR5)");
  },
};

const { db } = createDb(process.env.DATABASE_URL!);
const app = createApp({
  db,
  config: {
    encryptionKey: process.env.ENCRYPTION_KEY!,
    defaultModel: "claude-sonnet-4-6",
  },
  aiClient: stubAiClient,
});

const port = Number(process.env.PORT ?? 8787);
console.log(`Pulsia backend en :${port}`);
export default { port, fetch: app.fetch };
