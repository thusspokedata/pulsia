import type { Point } from "./toSeries";

// Media móvil CENTRADA: suaviza la tendencia sin los saltos diarios.
// Para cada punto i promediamos la ventana [i-r, i+r] con r = floor(ventana/2),
// recortándola contra los bordes para que la línea cubra TODO el rango (sin huecos).
export function mediaMovil(points: Point[], ventana = 7): Point[] {
  // ventana <= 1 no suaviza nada: devolvemos una copia para no mutar la entrada.
  if (ventana <= 1) return points.map((p) => ({ ...p }));
  const r = Math.floor(ventana / 2);
  return points.map((p, i) => {
    const desde = Math.max(0, i - r);
    const hasta = Math.min(points.length - 1, i + r);
    let suma = 0;
    for (let j = desde; j <= hasta; j++) suma += points[j].v;
    const n = hasta - desde + 1;
    return { t: p.t, v: suma / n };
  });
}
