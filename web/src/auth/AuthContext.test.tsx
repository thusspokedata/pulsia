import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "./AuthContext";

function Probe() {
  const { status, login } = useAuth();
  return (
    <div>
      <span>estado:{status}</span>
      <button onClick={() => login("a@b.com", "password123")}>entrar</button>
    </div>
  );
}

test("empieza autenticado si /health-auth responde ok, si no anónimo", async () => {
  // La sesión se prueba pidiendo un endpoint autenticado liviano; 200 = con sesión, 401 = sin.
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByText("estado:anon")).toBeInTheDocument());
});

test("login exitoso pasa a autenticado", async () => {
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) }) // check inicial
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ token: "t" }) })); // login
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => screen.getByText("estado:anon"));
  await userEvent.click(screen.getByRole("button", { name: "entrar" }));
  await waitFor(() => expect(screen.getByText("estado:auth")).toBeInTheDocument());
});
