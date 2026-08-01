import { NavLink, Outlet } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { useDateRange } from "../dashboard/DateRangeContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const RANGES = [30, 90, 365];

export function AppLayout() {
  const { logout } = useAuth();
  const { days, setDays } = useDateRange();
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-52 shrink-0 flex-col gap-1 border-r bg-slate-900 p-4 text-slate-200">
        <div className="mb-4 text-lg font-medium text-teal-300">Pulsia</div>
        <nav className="flex flex-col gap-1">
          <NavLink
            to="/"
            className={({ isActive }) =>
              cn("rounded-md px-3 py-2 text-sm", isActive ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800/60")
            }
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/subir"
            className={({ isActive }) =>
              cn("rounded-md px-3 py-2 text-sm", isActive ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800/60")
            }
          >
            Subir archivos
          </NavLink>
          <NavLink
            to="/alimentacion"
            className={({ isActive }) =>
              cn("rounded-md px-3 py-2 text-sm", isActive ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800/60")
            }
          >
            Alimentación
          </NavLink>
        </nav>
        <button
          onClick={() => {
            logout().catch(() => {});
          }}
          className="mt-auto rounded-md px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800/60"
        >
          Salir
        </button>
      </aside>
      <main className="flex-1 p-6">
        <div className="mb-4 flex justify-end gap-2">
          {RANGES.map((d) => (
            <Button key={d} size="sm" variant={days === d ? "default" : "outline"} aria-pressed={days === d} onClick={() => setDays(d)}>
              {d === 365 ? "1 año" : `${d} días`}
            </Button>
          ))}
        </div>
        <Outlet />
      </main>
    </div>
  );
}
