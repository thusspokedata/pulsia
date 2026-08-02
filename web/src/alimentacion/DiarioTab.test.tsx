import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DateRangeProvider } from "../dashboard/DateRangeContext";
import { DiarioTab } from "./DiarioTab";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}><DateRangeProvider>{ui}</DateRangeProvider></QueryClientProvider>;
}

test("muestra las comidas del día con consumido y semáforo", async () => {
  const item = { id: "i1", foodId: null, foodName: "Panceta", quantity: 1, quantityUnit: "g", grams: 100, kcal: 500, protein_g: 10, carbs_g: 1, fat_g: 40 };
  const meals = [{ id: "m1", eatenAt: Date.UTC(2026, 6, 10, 12), mealType: "almuerzo", note: null, items: [item] }];
  vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
    if (url.includes("/nutrition/meals")) return Promise.resolve({ ok: true, status: 200, json: async () => meals });
    return Promise.resolve({ ok: false, status: 404, json: async () => ({ error: "x" }) }); // sin perfil/goal → sin meta
  }));
  render(wrap(<DiarioTab />));
  await waitFor(() => expect(screen.getByText("Panceta")).toBeInTheDocument());
  expect(screen.getByText("500")).toBeInTheDocument();       // consumido (exacto)
  expect(screen.getByText(/grasa/i)).toBeInTheDocument();    // chip de semáforo (fat 40/100g → alto)
});
