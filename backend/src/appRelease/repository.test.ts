import { test, expect } from "bun:test";
import { getLatestRelease, setLatestRelease } from "./repository";

function fakeDb() {
  let stored: any = null;
  return {
    _get: () => stored,
    query: { appRelease: { findFirst: async () => stored } },
    insert: (_t: any) => ({
      values: (v: any) => ({
        onConflictDoUpdate: async ({ set }: any) => { stored = { ...(stored ?? { id: v.id }), ...v, ...set }; },
      }),
    }),
  } as any;
}

test("getLatestRelease devuelve null si no hay fila", async () => {
  expect(await getLatestRelease(fakeDb())).toBeNull();
});

test("setLatestRelease guarda y getLatestRelease lo devuelve", async () => {
  const db = fakeDb();
  await setLatestRelease(db, { versionCode: 5, apkUrl: "https://x.test/a.apk", label: "v5" });
  expect(await getLatestRelease(db)).toEqual({ versionCode: 5, apkUrl: "https://x.test/a.apk", label: "v5" });
});

test("setLatestRelease sin label usa string vacío por defecto", async () => {
  const db = fakeDb();
  await setLatestRelease(db, { versionCode: 7, apkUrl: "https://x.test/b.apk" });
  expect(await getLatestRelease(db)).toEqual({ versionCode: 7, apkUrl: "https://x.test/b.apk", label: "" });
});
