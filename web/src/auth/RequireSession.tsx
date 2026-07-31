import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { LoginPage } from "./LoginPage";

// Guard de la app: mientras chequea, nada; sin sesión, login; con sesión, el contenido.
export function RequireSession({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "checking") return null;
  if (status === "anon") return <LoginPage />;
  return <>{children}</>;
}
