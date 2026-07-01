import { test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { sessions } from "../db/schema";
import { createSession, validateSession, deleteSession } from "./sessions";

function fakeDb(initial?: { token: string; userId: string; expiresAt: Date }) {
  let row: { token: string; userId: string; expiresAt: Date } | undefined = initial;
  return {
    _row: () => row,
    query: {
      sessions: {
        findFirst: async (_opts: any) => (row ? { ...row } : undefined),
      },
    },
    insert: (_table: typeof sessions) => ({
      values: async (v: { token: string; userId: string; expiresAt: Date }) => {
        row = { ...v };
      },
    }),
    update: (_table: typeof sessions) => ({
      set: (v: { expiresAt: Date }) => ({
        where: async (_cond: ReturnType<typeof eq>) => {
          if (row) row = { ...row, expiresAt: v.expiresAt };
        },
      }),
    }),
    delete: (_table: typeof sessions) => ({
      where: async (_cond: ReturnType<typeof eq>) => {
        row = undefined;
      },
    }),
  };
}

test("createSession devuelve un token largo y guarda el userId", async () => {
  const db = fakeDb();
  const token = await createSession(db as any, "user-1", 4);
  expect(token.length).toBeGreaterThan(20);
  expect(db._row()?.userId).toBe("user-1");
});

test("validateSession devuelve el userId y extiende expiresAt", async () => {
  const db = fakeDb();
  const token = await createSession(db as any, "user-1", 4);
  const before = db._row()!.expiresAt.getTime();

  const userId = await validateSession(db as any, token, 4);

  expect(userId).toBe("user-1");
  expect(db._row()!.expiresAt.getTime()).toBeGreaterThanOrEqual(before);
});

test("validateSession devuelve null si la sesión ya expiró", async () => {
  const db = fakeDb({
    token: "expired-token",
    userId: "user-2",
    expiresAt: new Date(Date.now() - 1000),
  });

  const userId = await validateSession(db as any, "expired-token", 4);

  expect(userId).toBeNull();
});

test("deleteSession elimina la sesión", async () => {
  const db = fakeDb({
    token: "some-token",
    userId: "user-3",
    expiresAt: new Date(Date.now() + 1000),
  });

  await deleteSession(db as any, "some-token");

  expect(db._row()).toBeUndefined();
});
