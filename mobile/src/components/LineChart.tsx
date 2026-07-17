import { View, Text } from "react-native";
import Svg, { Path, Circle, Line, G, Text as SvgText } from "react-native-svg";
import { toPath, type XY } from "../session/chart";
import { innerTicks, shortDate, fmtNum } from "../session/chartAxis";
import { colors, spacing } from "../theme/tokens";

const W = 320;
const GL = 34; // gutter izquierdo (etiquetas del eje Y)
const GR = 8; // gutter derecho
const GT = 14; // gutter superior (deja lugar a la unidad)
const GB = 16; // gutter inferior (fechas del eje X)

// Gráfico de línea con ejes: gridlines + valores en Y, fechas en X. Marca fina en color de acento.
export function LineChart({
  data,
  height = 176,
  unit = "",
  refLine,
}: {
  data: XY[];
  height?: number;
  unit?: string;
  refLine?: { value: number; label: string };
}) {
  if (data.length === 0) {
    return <Text style={{ color: colors.textMuted, padding: spacing.md }}>Sin datos todavía.</Text>;
  }
  const ys = data.map((d) => d.y);
  const xs = data.map((d) => d.x);
  // La referencia entra al dominio del eje: si los datos están muy por debajo (colesterol 100 vs
  // ref 300), sin esto la línea caería fuera del área dibujada, que es justo cuando más importa.
  const refY = refLine ? [refLine.value] : [];
  const minY = Math.min(...ys, ...refY), maxY = Math.max(...ys, ...refY);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const spanY = maxY - minY;
  const plotH = height - GT - GB;
  const plotW = W - GL - GR;
  const flatX = maxX === minX; // un solo punto O varios con el mismo timestamp (p.ej. mismo día)

  const yPix = (v: number) => (spanY === 0 ? GT + plotH / 2 : GT + (1 - (v - minY) / spanY) * plotH);
  const xPix = (x: number) => (flatX ? GL + plotW / 2 : GL + ((x - minX) / (maxX - minX)) * plotW);

  const pts = data.map((d) => ({ x: xPix(d.x), y: yPix(d.y) }));
  const ticks = innerTicks(minY, maxY, 4);

  const xLabels: { x: number; ts: number; anchor: "start" | "middle" | "end"; testID?: string }[] = flatX
    ? [{ x: xPix(minX), ts: minX, anchor: "middle" }]
    : [
        { x: GL, ts: minX, anchor: "start" },
        ...(data.length >= 3
          ? [{ x: GL + plotW / 2, ts: minX + (maxX - minX) / 2, anchor: "middle" as const, testID: "linechart-xmid" }]
          : []),
        { x: W - GR, ts: maxX, anchor: "end" },
      ];

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`}>
        {unit ? <SvgText x={2} y={9} fontSize={10} fill={colors.textMuted}>{unit}</SvgText> : null}

        <G>
          <Line x1={GL} y1={yPix(maxY)} x2={W - GR} y2={yPix(maxY)} stroke={colors.border} strokeWidth={1} />
          <SvgText testID="linechart-max" x={GL - 4} y={yPix(maxY) + 3} fontSize={10} fill={colors.textMuted} textAnchor="end">
            {fmtNum(maxY)}
          </SvgText>
        </G>

        {ticks.map((v, i) => (
          <G key={`tick-${i}`}>
            <Line x1={GL} y1={yPix(v)} x2={W - GR} y2={yPix(v)} stroke={colors.border} strokeWidth={1} opacity={0.5} />
            <SvgText x={GL - 4} y={yPix(v) + 3} fontSize={10} fill={colors.textMuted} textAnchor="end">{fmtNum(v)}</SvgText>
          </G>
        ))}

        {spanY !== 0 ? (
          <G>
            <Line x1={GL} y1={yPix(minY)} x2={W - GR} y2={yPix(minY)} stroke={colors.border} strokeWidth={1} />
            <SvgText testID="linechart-min" x={GL - 4} y={yPix(minY) + 3} fontSize={10} fill={colors.textMuted} textAnchor="end">
              {fmtNum(minY)}
            </SvgText>
          </G>
        ) : null}

        {xLabels.map((l, i) => (
          <SvgText key={`x-${i}`} testID={l.testID} x={l.x} y={height - 3} fontSize={10} fill={colors.textMuted} textAnchor={l.anchor}>
            {shortDate(l.ts)}
          </SvgText>
        ))}

        {refLine && (
          <G>
            <Line
              testID="linechart-refline"
              x1={GL}
              y1={yPix(refLine.value)}
              x2={W - GR}
              y2={yPix(refLine.value)}
              stroke={colors.textMuted}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            <SvgText
              testID="linechart-reflabel"
              x={W - GR}
              y={yPix(refLine.value) - 3}
              fontSize={10}
              fill={colors.textMuted}
              textAnchor="end"
            >
              {refLine.label}
            </SvgText>
          </G>
        )}

        <Path d={toPath(pts)} stroke={colors.accent} strokeWidth={2} fill="none" />
        {pts.map((p, i) => (
          <Circle key={`p-${i}`} cx={p.x} cy={p.y} r={3} fill={colors.accent} />
        ))}
      </Svg>
    </View>
  );
}
