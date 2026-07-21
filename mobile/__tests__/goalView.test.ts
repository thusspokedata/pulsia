import { buildGoalView, macroTargetLabel } from "../src/nutrition/goalView";
import type { NutritionGoalResult } from "@pulsia/shared";

const comido = { kcal: 1200, protein_g: 90, carbs_g: 120, fat_g: 40 };

test("ok: arma meta/comido/restante + barras por macro", () => {
  const goal: NutritionGoalResult = { status: "ok", source: "auto", kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60, bmr: 1600, tdee: 2000 };
  const v = buildGoalView(goal, comido);
  expect(v.status).toBe("ok");
  expect(v.kcal).toEqual({ meta: 2000, comido: 1200, exercise: 0, restante: 800, over: false });
  const prot = v.macros!.find((m) => m.key === "protein")!;
  expect(prot).toMatchObject({ comido: 90, meta: 150, restante: 60 });
});

test("restante negativo si comido supera la meta", () => {
  const goal: NutritionGoalResult = { status: "ok", source: "auto", kcal: 1000, protein_g: 50, carbs_g: 100, fat_g: 30, bmr: 900, tdee: 1000 };
  const v = buildGoalView(goal, comido);
  expect(v.kcal!.restante).toBe(-200);
  expect(v.macros!.find((m) => m.key === "protein")!.over).toBe(true);
});

test("incompleto propaga missing", () => {
  const v = buildGoalView({ status: "incomplete", missing: ["edad", "peso"] }, comido);
  expect(v.status).toBe("incomplete");
  expect(v.missing).toEqual(["edad", "peso"]);
});

import { buildGoalView as bgv, remainingLabel } from "../src/nutrition/goalView";

test("over=true cuando comido supera la meta (macro y kcal)", () => {
  const goal = { status: "ok", source: "auto", kcal: 1000, protein_g: 50, carbs_g: 100, fat_g: 30, bmr: 900, tdee: 1000 } as const;
  const v = bgv(goal, { kcal: 1200, protein_g: 90, carbs_g: 40, fat_g: 40 });
  expect(v.kcal!.over).toBe(true);                                   // 1200 > 1000
  expect(v.macros!.find((m) => m.key === "protein")!.over).toBe(true); // 90 > 50
  expect(v.macros!.find((m) => m.key === "carbs")!.over).toBe(false);  // 40 < 100
});

test("labels con nombre completo", () => {
  const goal = { status: "ok", source: "auto", kcal: 1000, protein_g: 50, carbs_g: 100, fat_g: 30, bmr: 900, tdee: 1000 } as const;
  const v = bgv(goal, { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  expect(v.macros!.map((m) => m.label)).toEqual(["Proteína", "Carbohidratos", "Grasa"]);
});

test("remainingLabel: faltan / cumplida / de más", () => {
  expect(remainingLabel(45)).toBe("faltan 45");
  expect(remainingLabel(0)).toBe("meta cumplida");
  expect(remainingLabel(-36)).toBe("36 de más");
});

test("exercise suma al restante de kcal y no toca la proteína", () => {
  const goal = { status: "ok", source: "auto", kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60, bmr: 1600, tdee: 2000 } as const;
  const v = bgv(goal, { kcal: 2100, protein_g: 90, carbs_g: 120, fat_g: 40 }, 300);
  expect(v.kcal).toEqual({ meta: 2000, comido: 2100, exercise: 300, restante: 200, over: false }); // 2000-2100+300
  expect(v.macros!.find((m) => m.key === "protein")!.restante).toBe(60); // sin cambio
  expect(v.macros!.find((m) => m.key === "carbs")!.bonus).toBeGreaterThan(0); // los carbos SÍ
});

test("un gasto de ejercicio basura no corrompe el restante de kcal", () => {
  const goal = { status: "ok", source: "auto", kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60, bmr: 1600, tdee: 2000 } as const;
  for (const bad of [NaN, -500, Infinity]) {
    const v = bgv(goal, { kcal: 1000, protein_g: 0, carbs_g: 0, fat_g: 0 }, bad);
    expect(v.kcal!.restante).toBe(1000); // como si no hubiera ejercicio
    expect(v.kcal!.exercise).toBe(0);
    expect(v.kcal!.over).toBe(false);
  }
});

test("sin exercise (default 0) el comportamiento no cambia y over sigue el criterio del restante", () => {
  const goal = { status: "ok", source: "auto", kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60, bmr: 1600, tdee: 2000 } as const;
  const v = bgv(goal, { kcal: 2100, protein_g: 0, carbs_g: 0, fat_g: 0 });
  expect(v.kcal).toEqual({ meta: 2000, comido: 2100, exercise: 0, restante: -100, over: true });
  // borde .5 con exercise: 2000 - 2000.5 + 0 → restante 0 (|| 0), over false
  const v2 = bgv(goal, { kcal: 2000.5, protein_g: 0, carbs_g: 0, fat_g: 0 });
  expect(v2.kcal!.restante).toBe(0);
  expect(v2.kcal!.over).toBe(false);
});

test("over es consistente con el restante redondeado en el borde .5 (kcal y macros)", () => {
  const goal = { status: "ok", source: "auto", kcal: 2000, protein_g: 50, carbs_g: 100, fat_g: 30, bmr: 1, tdee: 1 } as const;
  // 0.5 por encima → el restante redondea a 0 → NO es "over" (evita el "0 de más" en ámbar)
  const v = bgv(goal, { kcal: 2000.5, protein_g: 50.5, carbs_g: 0, fat_g: 0 });
  expect(v.kcal!.over).toBe(false);
  expect(v.kcal!.restante).toBe(0); // normalizado, no -0
  expect(v.macros!.find((m) => m.key === "protein")!.over).toBe(false);
  // 1 por encima → sí es "over"
  const v2 = bgv(goal, { kcal: 2001, protein_g: 51, carbs_g: 0, fat_g: 0 });
  expect(v2.kcal!.over).toBe(true);
  expect(v2.kcal!.restante).toBe(-1);
  expect(v2.macros!.find((m) => m.key === "protein")!.over).toBe(true);
});

const g2112 = { status: "ok", source: "auto", kcal: 2112, protein_g: 132, carbs_g: 254, fat_g: 63, bmr: 1700, tdee: 2100 } as const;

test("con ejercicio, la meta de carbos sube y la de proteína/grasa no", () => {
  const v = bgv(g2112, { kcal: 2087, protein_g: 65, carbs_g: 198, fat_g: 119 }, 1667);
  const carbs = v.macros!.find((m) => m.key === "carbs")!;
  expect(carbs).toMatchObject({ meta: 254, bonus: 417, metaTotal: 671, restante: 473 });
  const prot = v.macros!.find((m) => m.key === "protein")!;
  expect(prot).toMatchObject({ meta: 132, bonus: 0, metaTotal: 132, restante: 67 });
  const fat = v.macros!.find((m) => m.key === "fat")!;
  expect(fat).toMatchObject({ meta: 63, bonus: 0, metaTotal: 63, restante: -56, over: true });
});

test("el ejercicio saca a los carbos de over: 198/254 con bonus ya no está excedido", () => {
  const conEjercicio = bgv(g2112, { kcal: 0, protein_g: 0, carbs_g: 300, fat_g: 0 }, 1667);
  const sinEjercicio = bgv(g2112, { kcal: 0, protein_g: 0, carbs_g: 300, fat_g: 0 }, 0);
  expect(conEjercicio.macros!.find((m) => m.key === "carbs")!.over).toBe(false); // 300 < 671
  expect(sinEjercicio.macros!.find((m) => m.key === "carbs")!.over).toBe(true);  // 300 > 254
});

test("kcal.meta sigue siendo la BASE (alimenta el techo de saturadas)", () => {
  const v = bgv(g2112, { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }, 1667);
  expect(v.kcal!.meta).toBe(2112); // NO 3779
  expect(v.kcal!.exercise).toBe(1667);
});

test("sin ejercicio, bonus 0 y metaTotal igual a meta en los tres macros", () => {
  const v = bgv(g2112, { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }, 0);
  for (const m of v.macros!) {
    expect(m.bonus).toBe(0);
    expect(m.metaTotal).toBe(m.meta);
  }
});

test("macroTargetLabel muestra el bonus solo cuando hay ejercicio", () => {
  expect(macroTargetLabel({ meta: 254, bonus: 417 })).toBe("254 g +417 ejercicio");
  expect(macroTargetLabel({ meta: 254, bonus: 0 })).toBe("254 g");
});
