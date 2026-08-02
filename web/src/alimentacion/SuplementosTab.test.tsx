import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DateRangeProvider } from "../dashboard/DateRangeContext";
import { SuplementosTab } from "./SuplementosTab";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}><DateRangeProvider>{ui}</DateRangeProvider></QueryClientProvider>;
}

test("muestra la cobertura comida vs suplemento por nutriente", async () => {
  const item = { id: "i1", foodId: null, foodName: "x", quantity: 1, quantityUnit: "g", grams: 100, kcal: 100, protein_g: 5, carbs_g: 5, fat_g: 2, iron_mg: 5 };
  const meals = [{ id: "m1", eatenAt: Date.UTC(2026, 6, 10, 12), mealType: null, note: null, items: [item] }];
  const perDay = { "2026-07-10": { totals: { iron_mg: 5 }, byNutrient: {} } };
  vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
    if (url.includes("range-nutrients-daily")) return Promise.resolve({ ok: true, status: 200, json: async () => ({ perDay }) });
    if (url.includes("/nutrition/meals")) return Promise.resolve({ ok: true, status: 200, json: async () => meals });
    if (url.includes("/profile")) return Promise.resolve({ ok: true, status: 200, json: async () => ({ sex: "male", age: 30, daysPerWeek: 3, sessionMinutes: 60 }) });
    return Promise.resolve({ ok: true, status: 200, json: async () => null });
  }));
  render(wrap(<SuplementosTab />));
  await waitFor(() => expect(screen.getByText(/hierro/i)).toBeInTheDocument());
  expect(screen.getAllByText(/suplemento/i).length).toBeGreaterThan(0);
});
