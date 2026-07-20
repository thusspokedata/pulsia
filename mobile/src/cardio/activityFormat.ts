import type { CardioActivity } from "@pulsia/shared";

export type Tile = { label: string; value: string; unit?: string };
export type Line = { label: string; value: string };

// mm:ss (el detalle de una actividad se lee mejor así que en horas).
export function fmtDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const n1 = (v: number) => (Math.round(v * 10) / 10).toString();

// Un tile por dato PRESENTE. Una actividad manual solo tiene duración y quizá kcal: la pantalla
// no debe mostrar tiles vacíos ni "—" por todos lados.
export function buildTiles(a: CardioActivity): Tile[] {
  const t: Tile[] = [{ label: "Duración", value: fmtDuration(a.durationMs), unit: "min" }];
  const add = (label: string, v: number | null | undefined, unit: string, fmt: (n: number) => string = String) => {
    if (v != null) t.push({ label, value: fmt(v), unit });
  };
  add("Calorías", a.kcal, "kcal");
  add("FC media", a.avgHr, "ppm");
  add("FC máx", a.maxHr, "ppm");
  add("Cadencia media", a.avgCadence, "rpm", n1);
  add("Cadencia máx", a.maxCadence, "rpm", n1);
  add("Ciclos totales", a.totalCycles, "");
  add("Efecto aeróbico", a.trainingEffectAerobic, "/5", n1);
  add("Carga entren.", a.trainingLoad, "", n1);
  add("Frec. respirat.", a.avgRespiration, "rpm", n1);
  return t;
}

// Snapshot del atleta que guardó el reloj. El NOMBRE se omite a propósito: no le aporta nada al
// dueño del teléfono y evita que aparezca si comparte una captura de pantalla.
export function athleteLines(athlete: Record<string, unknown> | undefined): Line[] {
  if (!athlete) return [];
  const out: Line[] = [];
  const num = (k: string) => (typeof athlete[k] === "number" ? (athlete[k] as number) : null);
  const w = num("weight"), h = num("height"), rhr = num("restingHeartRate");
  if (w != null) out.push({ label: "Peso", value: `${n1(w)} kg` });
  // 2 decimales: el reloj guarda la altura en metros y un float crudo se vería como "1.7500000001 m".
  if (h != null) out.push({ label: "Altura", value: `${h.toFixed(2)} m` });
  if (rhr != null) out.push({ label: "FC en reposo", value: `${rhr} ppm` });
  return out;
}
