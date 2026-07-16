import type { ReactNode } from "react";
import { View } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";

export interface PieSlice {
  label: string;
  value: number;
  color: string;
}

interface Props {
  data: PieSlice[];
  size: number;
  innerRadius?: number; // 0 (default) = torta; > 0 = dona
  center?: ReactNode; // contenido del centro de la dona
}

// Punto del borde a `radius` del centro, en el ángulo dado en grados. -90 arranca a las 12 en punto.
function polar(cx: number, cy: number, radius: number, angle: number): [number, number] {
  const rad = ((angle - 90) * Math.PI) / 180;
  return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
}

// Porción de torta (inner = 0) o de anillo (inner > 0), entre dos ángulos en grados.
function arcPath(cx: number, cy: number, r: number, inner: number, a0: number, a1: number): string {
  const large = a1 - a0 > 180 ? 1 : 0;
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  if (inner <= 0) return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
  const [xi1, yi1] = polar(cx, cy, inner, a1);
  const [xi0, yi0] = polar(cx, cy, inner, a0);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${xi1} ${yi1} A ${inner} ${inner} 0 ${large} 0 ${xi0} ${yi0} Z`;
}

// Torta/dona. Los colores los pasa el que llama (desde theme/tokens): el componente no elige paleta.
// La leyenda va aparte, en cada tab, porque el formato del valor cambia (kcal vs %).
export function PieChart({ data, size, innerRadius = 0, center }: Props) {
  const slices = data.filter((d) => d.value > 0);
  const total = slices.reduce((a, d) => a + d.value, 0);
  if (total <= 0) return null;

  const c = size / 2;
  const r = size / 2;
  let acc = 0;
  const arcs = slices.map((d) => {
    const a0 = (acc / total) * 360;
    acc += d.value;
    return { d, a0, a1: (acc / total) * 360 };
  });

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        {arcs.length === 1 ? (
          // Un arco de 360° degenera: los dos extremos coinciden y el path no dibuja nada.
          innerRadius > 0 ? (
            <Circle
              testID="pie-arc-0"
              cx={c}
              cy={c}
              r={(r + innerRadius) / 2}
              stroke={arcs[0].d.color}
              strokeWidth={r - innerRadius}
              fill="none"
            />
          ) : (
            <Circle testID="pie-arc-0" cx={c} cy={c} r={r} fill={arcs[0].d.color} />
          )
        ) : (
          arcs.map((a, i) => (
            <Path key={a.d.label} testID={`pie-arc-${i}`} d={arcPath(c, c, r, innerRadius, a.a0, a.a1)} fill={a.d.color} />
          ))
        )}
      </Svg>
      {center}
    </View>
  );
}
