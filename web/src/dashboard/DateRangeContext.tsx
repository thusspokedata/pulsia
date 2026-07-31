import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface RangeValue {
  fromMs: number;
  toMs: number;
  days: number;
  setDays: (d: number) => void;
}
const Ctx = createContext<RangeValue | null>(null);
const DAY = 24 * 3600 * 1000;

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [days, setDays] = useState(90);
  const value = useMemo<RangeValue>(() => {
    const toMs = Date.now();
    return { days, setDays, toMs, fromMs: toMs - days * DAY };
  }, [days]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDateRange(): RangeValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDateRange fuera de DateRangeProvider");
  return v;
}
