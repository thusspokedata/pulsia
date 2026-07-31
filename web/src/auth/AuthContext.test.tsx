import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./AuthContext";

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrap(ui: React.ReactNode, qc: QueryClient) {
  return <QueryClientProvider client={qc}><AuthProvider>{ui}</AuthProvider></QueryClientProvider>;
}

function Probe() {
  const { status, login, logout } = useAuth();
  return (
    <div>
      <span>estado:{status}</span>
      <button onClick={() => login("a@b.com", "password123")}>entrar</button>
      <button onClick={() => { logout().catch(() => {}); }}>salir</button>
    </div>
  );
}

test("empieza autenticado si /health-auth responde ok, si no anónimo", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
  render(wrap(<Probe />, makeClient()));
  await waitFor(() => expect(screen.getByText("estado:anon")).toBeInTheDocument());
});

test("login exitoso pasa a autenticado", async () => {
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) }) // check inicial
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ token: "t" }) })); // login
  render(wrap(<Probe />, makeClient()));
  await waitFor(() => screen.getByText("estado:anon"));
  await userEvent.click(screen.getByRole("button", { name: "entrar" }));
  await waitFor(() => expect(screen.getByText("estado:auth")).toBeInTheDocument());
});

test("si el logout falla, el estado NO pasa a anon (la sesión sigue viva)", async () => {
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) }) // check inicial -> auth
    .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "boom" }) })); // logout falla
  render(wrap(<Probe />, makeClient()));
  await waitFor(() => screen.getByText("estado:auth"));
  await userEvent.click(screen.getByRole("button", { name: "salir" }));
  // Se le da tiempo al click a resolver; el estado debe seguir en auth.
  await waitFor(() => expect(screen.getByText("estado:auth")).toBeInTheDocument());
});

test("logout exitoso pasa a anon y limpia la cache de queries", async () => {
  const qc = makeClient();
  const clearSpy = vi.spyOn(qc, "clear");
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) }) // check inicial -> auth
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })); // logout ok
  render(wrap(<Probe />, qc));
  await waitFor(() => screen.getByText("estado:auth"));
  await userEvent.click(screen.getByRole("button", { name: "salir" }));
  await waitFor(() => expect(screen.getByText("estado:anon")).toBeInTheDocument());
  expect(clearSpy).toHaveBeenCalled();
});
