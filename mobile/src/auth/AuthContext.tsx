import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getToken, clearToken } from "../storage/authToken";

type Status = "loading" | "in" | "out";
type AuthValue = { status: Status; refresh: () => Promise<void>; signOut: () => Promise<void> };

const AuthCtx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");

  async function refresh() {
    const t = await getToken();
    setStatus(t ? "in" : "out");
  }
  async function signOut() {
    await clearToken();
    setStatus("out");
  }
  useEffect(() => { void refresh(); }, []);

  return <AuthCtx.Provider value={{ status, refresh, signOut }}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth fuera de AuthProvider");
  return v;
}
