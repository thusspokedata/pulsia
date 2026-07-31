import { NavLink, Outlet } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { useDateRange } from "../dashboard/DateRangeContext";

const RANGES = [30, 90, 365];

export function AppLayout() {
  const { logout } = useAuth();
  const { days, setDays } = useDateRange();
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside style={{ width: 200, background: "#0f172a", color: "#e2e8f0", padding: 16 }}>
        <div style={{ color: "#5eead4", fontWeight: 700, marginBottom: 16 }}>Pulsia</div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <NavLink to="/">Dashboard</NavLink>
          <NavLink to="/subir">Subir archivos</NavLink>
        </nav>
        <button onClick={() => { logout().catch(() => {}); }} style={{ marginTop: 24 }}>Salir</button>
      </aside>
      <main style={{ flex: 1, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 16 }}>
          {RANGES.map((d) => (
            <button key={d} onClick={() => setDays(d)} aria-pressed={days === d}>
              {d === 365 ? "1 año" : `${d} días`}
            </button>
          ))}
        </div>
        <Outlet />
      </main>
    </div>
  );
}
