import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getToken, clearToken } from "../storage/authToken";
import { setUnauthorizedHandler } from "./unauthorized";

export type AuthStatus = "loading" | "in" | "out";
type AuthValue = { status: AuthStatus; refresh: () => Promise<void>; signOut: () => Promise<void> };

const AuthCtx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");

  async function refresh() {
    const t = await getToken();
    setStatus(t ? "in" : "out");
  }
  async function signOut() {
    await clearToken();
    setStatus("out");
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    setUnauthorizedHandler(() => { void signOut(); });
    return () => setUnauthorizedHandler(null);
  }, []);

  return <AuthCtx.Provider value={{ status, refresh, signOut }}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth fuera de AuthProvider");
  return v;
}
