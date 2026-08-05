import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConsistencyCard } from "./ConsistencyCard";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

function mockFetch(opts: { sessions?: unknown[]; cardio?: unknown[]; profile?: unknown | null } = {}) {
  const sessions = opts.sessions ?? [];
  const cardio = opts.cardio ?? [];
  const profile = opts.profile;
  const goalInput = { objective: "maintain", rateKgPerWeek: 0, manualKcal: null };
  vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
    if (url.includes("/sessions")) return Promise.resolve({ ok: true, status: 200, json: async () => sessions });
    if (url.includes("/cardio")) return Promise.resolve({ ok: true, status: 200, json: async () => cardio });
    if (url.includes("/nutrition/goal")) return Promise.resolve({ ok: true, status: 200, json: async () => goalInput });
    if (url.includes("/profile")) return profile
      ? Promise.resolve({ ok: true, status: 200, json: async () => profile })
      : Promise.resolve({ ok: false, status: 404, json: async () => ({ error: "sin perfil" }) });
    return Promise.resolve({ ok: true, status: 200, json: async () => null });
  }));
}

test("título es exactamente 'Días entrenados y gasto'", async () => {
  mockFetch({
    sessions: [{ id: "1", startedAt: new Date(2025, 2, 10).getTime(), totalDurationMs: 3600000, avgHr: null, completionPct: 100 }],
    cardio: [],
    profile: { sex: "male", age: 30, weightKg: 80 },
  });
  render(wrap(<ConsistencyCard />));
  await waitFor(() => expect(screen.getByRole("heading")).toHaveTextContent("Días entrenados y gasto"));
});

test("con perfil completo, muestra el contador X/NNN y colorea la celda entrenada", async () => {
  mockFetch({
    sessions: [{ id: "1", startedAt: new Date(2025, 2, 10).getTime(), totalDurationMs: 3600000, avgHr: null, completionPct: 100 }],
    cardio: [],
    profile: { sex: "male", age: 30, weightKg: 80 },
  });
  render(wrap(<ConsistencyCard />));
  await waitFor(() => expect(screen.getByText("1/365 días")).toBeInTheDocument());
  expect(screen.getByTitle(/2025-03-10: 400 kcal/)).toBeInTheDocument();
});

test("sin peso/edad en el perfil, muestra el empty state y no calcula gasto", async () => {
  mockFetch({
    sessions: [{ id: "1", startedAt: new Date(2025, 2, 10).getTime(), totalDurationMs: 3600000, avgHr: null, completionPct: 100 }],
    cardio: [],
    profile: { sex: "male" },
  });
  render(wrap(<ConsistencyCard />));
  await waitFor(() =>
    expect(screen.getByText("Completá peso y edad en tu perfil para ver el gasto.")).toBeInTheDocument(),
  );
  expect(screen.queryByText(/días$/)).toBeNull();
});
