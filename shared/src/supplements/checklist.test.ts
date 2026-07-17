import { test, expect } from "bun:test";
import { frequencyAppliesOn, resolveDayChecklist } from "./checklist";

const SUP_MG = "11111111-1111-4111-8111-111111111111";
const SUP_ZN = "22222222-2222-4222-8222-222222222222";
const ITEM_MG = "33333333-3333-4333-8333-333333333333";
const ITEM_ZN = "44444444-4444-4444-8444-444444444444";

const mgItem = { id: ITEM_MG, supplementId: SUP_MG, slot: "antes_de_dormir" as const, frequency: { type: "daily" as const }, dose: "2 cápsulas", reason: "el magnesio ayuda al descanso", supplementName: "Magnesio" };
const znItem = { id: ITEM_ZN, supplementId: SUP_ZN, slot: "desayuno" as const, frequency: { type: "every_other_day" as const, anchorDate: "2026-07-15" }, dose: "1 tableta", reason: null, supplementName: "Zink" };

test("frequencyAppliesOn: daily siempre; every_other_day por paridad desde anchorDate (cruza meses)", () => {
  expect(frequencyAppliesOn({ type: "daily" }, "2026-07-16")).toBe(true);
  expect(frequencyAppliesOn({ type: "every_other_day", anchorDate: "2026-07-15" }, "2026-07-15")).toBe(true);
  expect(frequencyAppliesOn({ type: "every_other_day", anchorDate: "2026-07-15" }, "2026-07-16")).toBe(false);
  expect(frequencyAppliesOn({ type: "every_other_day", anchorDate: "2026-07-15" }, "2026-07-17")).toBe(true);
  // cruce de mes: 2026-07-31 → +1 = 2026-08-01
  expect(frequencyAppliesOn({ type: "every_other_day", anchorDate: "2026-07-31" }, "2026-08-01")).toBe(false);
  expect(frequencyAppliesOn({ type: "every_other_day", anchorDate: "2026-07-31" }, "2026-08-02")).toBe(true);
  // anchor en el futuro respecto del día consultado: paridad igual (valor absoluto)
  expect(frequencyAppliesOn({ type: "every_other_day", anchorDate: "2026-07-17" }, "2026-07-15")).toBe(true);
});

test("frequencyAppliesOn: weekdays por día de semana (0=domingo, convención getDay)", () => {
  // 2026-07-15 es miércoles (getDay 3); 2026-07-19 es domingo (0)
  expect(frequencyAppliesOn({ type: "weekdays", days: [3] }, "2026-07-15")).toBe(true);
  expect(frequencyAppliesOn({ type: "weekdays", days: [1, 5] }, "2026-07-15")).toBe(false);
  expect(frequencyAppliesOn({ type: "weekdays", days: [0] }, "2026-07-19")).toBe(true);
});

test("resolveDayChecklist filtra por frecuencia y agrupa en el orden canónico de franjas", () => {
  const out = resolveDayChecklist({ planItems: [mgItem, znItem], adjustments: [], takes: [], date: "2026-07-16" });
  // el 16 el zinc NO toca (día por medio anclado al 15); el magnesio sí
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({ planItemId: ITEM_MG, slot: "antes_de_dormir", supplementName: "Magnesio", dose: "2 cápsulas", status: null });

  const out15 = resolveDayChecklist({ planItems: [mgItem, znItem], adjustments: [], takes: [], date: "2026-07-15" });
  expect(out15).toHaveLength(2);
  // orden canónico: desayuno antes que antes_de_dormir
  expect(out15[0].slot).toBe("desayuno");
  expect(out15[1].slot).toBe("antes_de_dormir");
});

test("ajuste skip marca la entrada (no la borra) y reduce cambia la dosis efectiva", () => {
  const adjustments = [
    { supplementId: SUP_MG, action: "skip" as const, reason: "ayer comiste rico en magnesio" },
    { supplementId: SUP_ZN, action: "reduce" as const, dose: "media tableta", reason: "dosis alta acumulada" },
  ];
  const out = resolveDayChecklist({ planItems: [mgItem, znItem], adjustments, takes: [], date: "2026-07-15" });
  const mg = out.find((e) => e.planItemId === ITEM_MG)!;
  expect(mg.adjusted?.action).toBe("skip");
  // Igualdad exacta: el fixture tiene DOS textos con "magnesio" (el motivo del ajuste y el del
  // ítem del plan), así que /magnesio/ no distinguía mostrarle al usuario la explicación equivocada.
  expect(mg.adjusted?.reason).toBe("ayer comiste rico en magnesio");
  expect(mg.dose).toBe("2 cápsulas"); // skip no toca la dosis
  const zn = out.find((e) => e.planItemId === ITEM_ZN)!;
  expect(zn.adjusted).toMatchObject({ action: "reduce" });
  expect(zn.dose).toBe("media tableta");      // dosis efectiva
  expect(zn.plannedDose).toBe("1 tableta");   // la del plan se conserva
});

test("ajuste para un suplemento que no toca ese día se ignora en silencio", () => {
  const adjustments = [{ supplementId: SUP_ZN, action: "skip" as const, reason: "x" }];
  const out = resolveDayChecklist({ planItems: [mgItem, znItem], adjustments, takes: [], date: "2026-07-16" });
  expect(out).toHaveLength(1);
  expect(out[0].adjusted ?? null).toBeNull();
});

test("mergea tomas registradas por planItemId (estado + dosis real + nota)", () => {
  const takes = [{ planItemId: ITEM_MG, status: "deviated" as const, actualDose: "1 cápsula", note: "me quedaban pocas" }];
  const out = resolveDayChecklist({ planItems: [mgItem], adjustments: [], takes, date: "2026-07-16" });
  expect(out[0]).toMatchObject({ status: "deviated", actualDose: "1 cápsula", note: "me quedaban pocas" });
});

test("plan vacío o día sin ítems → lista vacía", () => {
  expect(resolveDayChecklist({ planItems: [], adjustments: [], takes: [], date: "2026-07-16" })).toEqual([]);
});
