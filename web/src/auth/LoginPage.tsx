import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthContext";
import { ApiError } from "../api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle role="heading" aria-level={2} className="text-center text-xl">Pulsia</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} aria-label="login" className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="rounded-md border px-3 py-2 text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-sm">Contraseña
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="rounded-md border px-3 py-2 text-sm" />
            </label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
