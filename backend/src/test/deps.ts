import { hashPassword } from "../auth/passwords";
import { users, sessions } from "../db/schema";

const KEY = "a".repeat(64);

// DB de test en memoria: replica el patrón usado por backend/src/routes/auth.test.ts.
// Soporta lo que login/register/logout necesitan: buscar un usuario por email, insertar
// usuarios y sesiones, y borrar sesiones. No hay Postgres de por medio.
function fakeDb(seedUsers: { id: string; email: string; passwordHash: string }[] = []) {
  const allUsers = [...seedUsers];
  const sessionsStore: { token: string; userId: string; expiresAt: Date }[] = [];
  let nextId = 1;
  return {
    _users: allUsers,
    _sessions: sessionsStore,
    query: {
      users: {
        findFirst: async ({ where }: any) => {
          for (const u of allUsers) {
            if (matchesEqCondition(where, u)) return { ...u };
          }
          return undefined;
        },
      },
    },
    insert: (table: any) => ({
      values: (v: any) => {
        if (table === users) {
          const created = { id: `user-${nextId++}`, email: v.email, passwordHash: v.passwordHash };
          allUsers.push(created);
          return { returning: async () => [created] };
        }
        if (table === sessions) {
          sessionsStore.push({ token: v.token, userId: v.userId, expiresAt: v.expiresAt });
          return Promise.resolve();
        }
        throw new Error(`unexpected insert table in fakeDb: ${String(table)}`);
      },
    }),
    delete: (table: any) => ({
      where: async (where: any) => {
        if (table !== sessions) throw new Error(`unexpected delete table in fakeDb: ${String(table)}`);
        const value = extractEqValue(where);
        const idx = sessionsStore.findIndex((s) => s.token === value);
        if (idx !== -1) sessionsStore.splice(idx, 1);
      },
    }),
  };
}

// drizzle's eq() returns a SQL object; el valor del lado derecho lo lleva un `Param`
// dentro de `queryChunks`, identificable por su propiedad `brand`.
function matchesEqCondition(where: any, user: { email: string }): boolean {
  return extractEqValue(where) === user.email;
}

function extractEqValue(where: any): unknown {
  if (!where || !Array.isArray(where.queryChunks)) return undefined;
  for (const chunk of where.queryChunks) {
    if (chunk && typeof chunk === "object" && "brand" in chunk && "value" in chunk) {
      return (chunk as { value: unknown }).value;
    }
  }
  return undefined;
}

export type TestDeps = {
  db: ReturnType<typeof fakeDb>;
  config: {
    encryptionKey: string;
    defaultModel: string;
    inviteCode: string;
    sessionTtlDays: number;
  };
  aiClient: { generateProgram: () => Promise<{ name: string; weeks: never[] }> };
};

// Construye los `deps` para `createApp` con una DB de test y devuelve un `seedUser`
// para dar de alta un usuario (con la contraseña ya hasheada) antes de pegarle al login.
export async function makeTestDeps() {
  const db = fakeDb();
  const deps: TestDeps = {
    db,
    config: {
      encryptionKey: KEY,
      defaultModel: "claude-sonnet-4-6",
      inviteCode: "INV",
      sessionTtlDays: 4,
    },
    aiClient: { generateProgram: async () => ({ name: "x", weeks: [] }) },
  };

  async function seedUser(email: string, password: string): Promise<string> {
    const passwordHash = await hashPassword(password);
    const id = `user-seed-${db._users.length + 1}`;
    db._users.push({ id, email, passwordHash });
    return id;
  }

  return { deps, db, seedUser };
}
