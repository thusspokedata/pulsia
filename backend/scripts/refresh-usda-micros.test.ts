import { expect, test } from "bun:test";
import { planRefresh, type RefreshFood } from "./refresh-usda-micros";
import type { UsdaFoodRow } from "../src/usda/matcher";

// La fila de USDA guarda las columnas en camelCase (como Drizzle); nutrientsFromRow las mapea al
// snake_case del registro. Por eso el mock setea `monounsaturatedFatG`, no `monounsaturated_fat_g`.
function row(fdcId: number, over: Record<string, number | undefined> = {}): UsdaFoodRow {
  return {
    fdcId,
    description: `row ${fdcId}`,
    dataType: "sr_legacy",
    monounsaturatedFatG: 3.1,
    polyunsaturatedFatG: 1.2,
    transFatG: 0.05,
    ...over,
  } as UsdaFoodRow;
}
const f = (id: string, name: string, usdaFdcId: number): RefreshFood => ({ id, name, usdaFdcId });

test("re-deriva mono/poli/trans desde la fila de USDA (camelCase → snake_case)", () => {
  const plan = planRefresh([f("id1", "Almendra", 1)], (id) => row(id));
  expect(plan.toUpdate).toHaveLength(1);
  const v = plan.toUpdate[0].values as Record<string, number | null>;
  expect(v.monounsaturated_fat_g).toBe(3.1);
  expect(v.polyunsaturated_fat_g).toBe(1.2);
  expect(v.trans_fat_g).toBe(0.05);
  expect(plan.missingUsda).toHaveLength(0);
});

test("sin fila USDA → va a missingUsda, no a toUpdate", () => {
  const plan = planRefresh([f("id9", "Fantasma", 999)], (id) => (id === 999 ? null : row(id)));
  expect(plan.missingUsda.map((x) => x.name)).toEqual(["Fantasma"]);
  expect(plan.toUpdate).toHaveLength(0);
});

test("una columna ausente en la fila queda null, no 0", () => {
  const plan = planRefresh([f("id2", "Aceite", 2)], () => row(2, { transFatG: undefined }));
  const v = plan.toUpdate[0].values as Record<string, number | null>;
  expect(v.trans_fat_g).toBeNull();
  expect(v.monounsaturated_fat_g).toBe(3.1); // las demás siguen presentes
});
