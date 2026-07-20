import type { CardioSamples } from "@pulsia/shared";
import type { XY } from "../session/chart";

export type ChannelKey = "hr" | "cad" | "resp" | "bodyBattery";
export type HrPoint = { t: number; bpm: number };

// El .FIT trae campos que el SDK no sabe nombrar, con clave numérica. El 143 decrece de forma
// monótona durante la sesión, patrón que coincide con Body Battery — pero Garmin no lo documenta,
// así que se muestra como INFERIDO y nunca como un hecho.
const BODY_BATTERY_FIELD = "143";

export const CHANNELS: { key: ChannelKey; label: string; unit: string }[] = [
  { key: "hr", label: "Frecuencia cardíaca", unit: "ppm" },
  { key: "cad", label: "Cadencia", unit: "rpm" },
  { key: "resp", label: "Respiración", unit: "rpm" },
  { key: "bodyBattery", label: "Body Battery (inferido)", unit: "" },
];

type Source = { samples?: CardioSamples; hrSeries?: HrPoint[] };

function rawChannel(samples: CardioSamples | undefined, key: ChannelKey): (number | null)[] | undefined {
  if (!samples) return undefined;
  if (key === "bodyBattery") return samples.unknown?.[BODY_BATTERY_FIELD];
  return samples[key as "hr" | "cad" | "resp"];
}

// Puntos {x,y} de un canal. Los canales son DISPERSOS (la respiración aparece en ~1 de cada 3
// muestras), así que se descartan los huecos en vez de interpolar: dibujar valores que el reloj
// nunca midió sería inventar. Solo `hr` cae a `hrSeries` (actividades previas a la Fase 1).
export function channelPoints(a: Source, key: ChannelKey): XY[] {
  const t = a.samples?.t;
  const ch = rawChannel(a.samples, key);
  if (t && ch) {
    const points: XY[] = [];
    for (let i = 0; i < t.length; i++) {
      const v = ch[i];
      if (v != null) points.push({ x: t[i], y: v });
    }
    if (points.length > 0) return points;
  }
  if (key === "hr" && a.hrSeries?.length) return a.hrSeries.map((p) => ({ x: p.t, y: p.bpm }));
  return [];
}
