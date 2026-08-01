import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DateRangeProvider } from "../dashboard/DateRangeContext";
import { CaloriasCard } from "./CaloriasCard";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}><DateRangeProvider>{ui}</DateRangeProvider></QueryClientProvider>;
}

function mockFetch(profile: unknown | null) {
  const item = { id: "i1", foodId: null, foodName: "x", quantity: 1, quantityUnit: "unit", grams: 100, kcal: 600, protein_g: 40, carbs_g: 50, fat_g: 20 };
  const meals = [{ id: "m1", eatenAt: Date.UTC(2026, 6, 10, 12), mealType: null, note: null, items: [item] }];
  vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
    if (url.includes("/nutrition/meals")) return Promise.resolve({ ok: true, status: 200, json: async () => meals });
    if (url.includes("/nutrition/goal")) return Promise.resolve({ ok: true, status: 200, json: async () => ({ objective: "maintain", rateKgPerWeek: 0, manualKcal: null }) });
    if (url.includes("/profile")) return profile
      ? Promise.resolve({ ok: true, status: 200, json: async () => profile })
      : Promise.resolve({ ok: false, status: 404, json: async () => ({ error: "sin perfil" }) });
    return Promise.resolve({ ok: true, status: 200, json: async () => null });
  }));
}

test("con perfil, muestra el promedio de kcal y la meta", async () => {
  mockFetch({ sex: "male", age: 30, heightCm: 180, weightKg: 80, activityLevel: "moderate", daysPerWeek: 3, sessionMinutes: 60 });
  render(wrap(<CaloriasCard />));
  await waitFor(() => expect(screen.getByText(/kcal\/día promedio/i)).toBeInTheDocument());
  expect(screen.getByText(/meta/i)).toBeInTheDocument();
});

test("sin perfil, muestra el consumo sin meta", async () => {
  mockFetch(null);
  render(wrap(<CaloriasCard />));
  await waitFor(() => expect(screen.getByText(/kcal\/día promedio/i)).toBeInTheDocument());
  expect(screen.queryByText(/meta/i)).toBeNull();
});
