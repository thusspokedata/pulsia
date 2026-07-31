import { render, screen } from "@testing-library/react";
import { App } from "./App";

test("renderiza el nombre de la app", async () => {
  // Sin sesión (el check inicial da 401) → RequireSession muestra el LoginPage, que titula "Pulsia".
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Pulsia" })).toBeInTheDocument();
});
