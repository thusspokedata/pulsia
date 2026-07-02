import { createApp } from "./app";
import { createDb } from "./db/client";
import { AnthropicAiClient } from "./ai/client";

const { db } = createDb(process.env.DATABASE_URL!);
const app = createApp({
  db,
  config: {
    encryptionKey: process.env.ENCRYPTION_KEY!,
    defaultModel: "claude-sonnet-4-6",
    inviteCode: process.env.INVITE_CODE!,
    sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 4),
  },
  aiClient: new AnthropicAiClient(),
});

const port = Number(process.env.PORT ?? 8787);
console.log(`Pulsia backend en :${port}`);
export default { port, fetch: app.fetch };
