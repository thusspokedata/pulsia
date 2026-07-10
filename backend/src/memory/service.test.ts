import { test, expect } from "bun:test";
import { refreshAthleteMemory } from "./service";

function fakeDb(memory: string) {
  const upserts: any[] = [];
  return {
    _upserts: upserts,
    query: {
      athleteMemory: { findFirst: async () => ({ userId: "u", content: memory }) },
      workoutSession: { findMany: async () => [] },
      profiles: { findFirst: async () => null },
    },
    select: () => ({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) }),
    insert: () => ({ values: (v: any) => ({ onConflictDoUpdate: async () => { upserts.push(v); } }) }),
  } as any;
}

test("refreshAthleteMemory llama updateMemory con la memoria previa y persiste el resultado", async () => {
  const db = fakeDb("memoria vieja");
  let seen: any = null;
  const ai: any = { updateMemory: async (input: any) => { seen = input; return "memoria nueva"; } };
  const out = await refreshAthleteMemory(db, ai, "u", "sk", "model");
  expect(out).toBe("memoria nueva");
  expect(seen.current).toBe("memoria vieja");
  expect(db._upserts[0].content).toBe("memoria nueva");
});

test("refreshAthleteMemory lanza si no hay updateMemory", async () => {
  const db = fakeDb("x");
  await expect(refreshAthleteMemory(db, {} as any, "u", "sk", "model")).rejects.toThrow();
});

test("refreshAthleteMemory reusa current/historySummary/progressSummary de opts sin re-fetchear", async () => {
  // recent (sesiones) se busca siempre (se usa para las tendencias si progressSummary no viene dado);
  // sin select ni query.profiles: si el servicio intentara re-computar el progreso, rompería.
  const upserts: any[] = [];
  const db: any = {
    query: { workoutSession: { findMany: async () => [] } },
    insert: () => ({ values: (v: any) => ({ onConflictDoUpdate: async () => { upserts.push(v); } }) }),
  };
  let seen: any = null;
  const ai: any = { updateMemory: async (input: any) => { seen = input; return "nueva"; } };
  const out = await refreshAthleteMemory(db, ai, "u", "sk", "model", {
    current: "prev",
    historySummary: "HS-Día-1",
    progressSummary: "PS-x",
  });
  expect(out).toBe("nueva");
  expect(seen.current).toBe("prev");
  expect(seen.historySummary).toBe("HS-Día-1");
  expect(seen.progressSummary).toBe("PS-x");
  expect(upserts[0].content).toBe("nueva");
});
