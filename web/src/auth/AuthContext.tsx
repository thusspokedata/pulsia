import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api/client";

type Status = "checking" | "auth" | "anon";
interface AuthValue {
  status: Status;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const queryClient = useQueryClient();

  // Al montar, se prueba la sesión pidiendo un endpoint autenticado liviano. La cookie httpOnly
  // no es legible desde JS, así que "¿tengo sesión?" solo se sabe preguntándole al server.
  useEffect(() => {
    apiFetch("/metrics/latest")
      .then(() => setStatus("auth"))
      .catch(() => setStatus("anon"));
  }, []);

  async function login(email: string, password: string) {
    await apiFetch("/auth/login", { method: "POST", body: { email, password } });
    setStatus("auth");
  }
  async function logout() {
    // Sin catch acá: si el logout falla, la promesa debe rechazar y NO pasar a "anon" —
    // la sesión sigue viva del lado del server, así que el estado local no debe mentir.
    await apiFetch("/auth/logout", { method: "POST" });
    queryClient.clear();
    setStatus("anon");
  }

  return <Ctx.Provider value={{ status, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth fuera de AuthProvider");
  return v;
}
