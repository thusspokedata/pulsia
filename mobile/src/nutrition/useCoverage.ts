import { useEffect, useRef, useState } from "react";
import { coveragePeriod, type CoverageResult, type ReferencePerson, type ReportKind } from "@pulsia/shared";
import { getBackendUrl } from "../storage/config";
import { getProfile } from "../storage/profile";
import { listMeals } from "../api/nutrition";
import { getRangeNutrientsDaily } from "../api/supplements";
import { periodFor } from "../reports/periods";
import { mealsToPerDayNutrients, suppPerDayToNutrients } from "./coverageData";
import { coverageEvolution, filterByPeriod, windowBounds, type CoveragePoint } from "./coverageEvolution";
import { dayBoundsFromKey } from "./dayBounds";

const WINDOW = 8; // períodos hacia atrás para la evolución

export interface Coverage {
  current: CoverageResult | null;
  evolution: CoveragePoint[];
  loading: boolean;
}

function sexOf(s: string | undefined): ReferencePerson["sex"] {
  return s === "male" || s === "female" || s === "other" || s === "prefer_not_to_say" ? s : undefined;
}

export function useCoverage(kind: ReportKind, offset: number, now: number = Date.now()): Coverage {
  const [state, setState] = useState<Coverage>({ current: null, evolution: [], loading: true });
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      try {
        const [url, profile] = await Promise.all([getBackendUrl(), getProfile()]);
        const person: ReferencePerson = { sex: sexOf(profile?.sex), age: profile?.age };
        const { from, to } = windowBounds(kind, offset, WINDOW, now);
        // Ventana completa en ms (00:00 del from → 23:59 del to) para listMeals.
        const fromMs = dayBoundsFromKey(from).from;
        const toMs = dayBoundsFromKey(to).to;
        const [meals, daily] = await Promise.all([
          listMeals(url, fromMs, toMs),
          getRangeNutrientsDaily(url, from, to),
        ]);
        if (id !== reqId.current) return;
        const perFood = mealsToPerDayNutrients(meals);
        const perSupp = suppPerDayToNutrients(daily.perDay);
        const period = periodFor(kind, offset, now);
        const N = Math.round((period.end - period.start) / 86_400_000);
        const opts = { minDataDays: Math.max(3, Math.ceil(N / 4)) };
        const current = coveragePeriod(filterByPeriod(perFood, period), filterByPeriod(perSupp, period), person, opts);
        const evolution = coverageEvolution(kind, offset, WINDOW, perFood, perSupp, person, opts, now);
        setState({ current, evolution, loading: false });
      } catch {
        if (id === reqId.current) setState({ current: null, evolution: [], loading: false });
      }
    })();
  }, [kind, offset, now]);

  return state;
}
