import { test, expect } from "bun:test";
import { createApp } from "../app";

function fakeDb(stored: any = null) {
  return {
    query: {
      sessions: { findFirst: async () => null },
      appRelease: { findFirst: async () => stored },
    },
  } as any;
}
function deps(db: any) {
  return {
    db,
    config: { encryptionKey: "a".repeat(64), defaultModel: "claude-sonnet-4-6", inviteCode: "INV", sessionTtlDays: 4, adminToken: "admintok" },
    aiClient: { generateProgram: async () => ({ name: "x", weeks: [] }) },
  };
}

test("GET /download es PÚBLICO (sin auth) y renderiza la versión + apkUrl + QR", async () => {
  const app = createApp(deps(fakeDb({ id: "singleton", versionCode: 8, apkUrl: "https://x.test/p-vc8.apk", label: "vc8" })) as any);
  const res = await app.request("/download");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
  const html = await res.text();
  expect(html).toContain('Última versión: <span class="ver">vc8</span>'); // no el "vc8" del apkUrl/label/title
  expect(html).toContain("https://x.test/p-vc8.apk");
  expect(html).toContain("<svg");
});

test("GET /download sin release → 200 con mensaje amable", async () => {
  const app = createApp(deps(fakeDb(null)) as any);
  const res = await app.request("/download");
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("Aún no hay");
});
