import { test, expect } from "bun:test";
import { runEcgAnalysis } from "./analyze";

function fakeDeps(opts: { interpret?: any; pdf?: Buffer } = {}) {
  const updates: any[] = [];
  const db = {
    query: {
      ecgRecording: { findFirst: async () => ({ id: "e1", userId: "u1", pdf: opts.pdf ?? Buffer.from("%PDF-1.4\nx"), status: "pending" }), findMany: async () => [] },
      settings: { findFirst: async () => ({ kardiaPwEncrypted: null, aiApiKeyEncrypted: null }) },
    },
    update: () => ({ set: (v: any) => ({ where: async () => { updates.push(v); } }) }),
  } as any;
  const aiClient = { interpretEcg: opts.interpret ?? (async () => ({ kardiaVerdict: "Normal", avgHeartRate: 60, recordedAt: "2026-07-01", interpretation: "ok" })) } as any;
  return { deps: { db, aiClient, config: { encryptionKey: "a".repeat(64), defaultAiApiKey: "sk-x" } } as any, updates };
}

test("done + campos cuando interpretEcg anda", async () => {
  const { deps, updates } = fakeDeps();
  await runEcgAnalysis(deps, "e1", "u1");
  expect(updates.at(-1)).toMatchObject({ status: "done", kardiaVerdict: "Normal" });
});
test("failed + error cuando interpretEcg tira (no propaga)", async () => {
  const { deps, updates } = fakeDeps({ interpret: async () => { throw new Error("boom"); } });
  await runEcgAnalysis(deps, "e1", "u1"); // no throw
  expect(updates.at(-1)).toMatchObject({ status: "failed" });
  expect(updates.at(-1).error).toContain("boom");
});
