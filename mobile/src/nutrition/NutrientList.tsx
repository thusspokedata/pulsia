import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import type { NutrientGroup } from "@pulsia/shared";
import { colors, spacing } from "../theme/tokens";
import { Bar } from "./tabs/ui";
import type { NutrientRow, NutrientSection } from "./nutrientRows";

/**
 * Lista de nutrientes agrupada. Recibe las secciones ya armadas y NADA más: no sabe si lo que
 * muestra es una comida, un alimento del catálogo o el total de un día. Por eso sirve en las tres
 * pantallas sin ramificar por superficie.
 *
 * No se envuelve en `Card` a propósito: cada pantalla decide su contenedor y su título (la
 * pestaña del día ya tiene el suyo).
 */

// Vitaminas y minerales arrancan cerrados: son 23 de las 30 filas y desplegadas empujan fuera de
// la pantalla todo lo que va debajo (en el detalle de comida, los ingredientes). El encabezado
// dice cuántas tienen dato, así que se puede decidir si vale la pena abrirlo sin abrirlo.
const ABIERTOS_POR_DEFECTO: Record<NutrientGroup, boolean> = {
  grasas: true,
  carbohidratos: true,
  vitaminas: false,
  minerales: false,
};

/**
 * Cuántos decimales mostrar. Fijo no sirve: 750 µg de vitamina A con dos decimales es ruido y
 * 0,8 µg de B12 redondeado a entero pasa a ser 1 (o peor, 0). Se elige por magnitud.
 */
function fmt(n: number): string {
  const abs = Math.abs(n);
  const decimales = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return String(Number(n.toFixed(decimales)));
}

function textoCantidad(r: NutrientRow): string {
  if (r.value == null) return "sin dato";
  if (r.ref == null) return `${fmt(r.value)} ${r.unit}`;
  return `${fmt(r.value)} / ${fmt(r.ref)} ${r.unit}`;
}

function textoConteo(rows: NutrientRow[]): string {
  const conDato = rows.filter((r) => r.value != null).length;
  return conDato === 0 ? "sin datos" : `${conDato} de ${rows.length} con dato`;
}

function Fila({ row }: { row: NutrientRow }) {
  // `over` solo aplica a los techos: pasarse de un piso (fibra, hierro) es BUENO y no se avisa.
  const over = row.value != null && row.ref != null && row.kind === "max" && row.value > row.ref;
  const sinDato = row.value == null;
  return (
    <View testID={`nutr-${row.key}-row`} style={{ gap: 4, marginTop: 4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: spacing.sm }}>
        <Text style={{ color: sinDato ? colors.textMuted : colors.text, fontSize: 14, flex: 1 }}>{row.label}</Text>
        <Text
          testID={`nutr-${row.key}-amount`}
          style={{ color: over ? colors.warning : colors.textMuted, fontSize: 13 }}
        >
          {textoCantidad(row)}
        </Text>
        {row.pct != null && (
          <Text
            testID={`nutr-${row.key}-pct`}
            style={{ color: over ? colors.warning : colors.textMuted, fontSize: 13, minWidth: 44, textAlign: "right" }}
          >
            {`${row.pct} %`}
          </Text>
        )}
      </View>
      {row.value != null && row.ref != null && (
        <Bar
          value={row.value}
          target={row.ref}
          kind={row.kind === "min" ? "floor" : "limit"}
          testID={`nutr-${row.key}-bar`}
        />
      )}
    </View>
  );
}

export function NutrientList({ sections }: { sections: NutrientSection[] }) {
  const [abiertos, setAbiertos] = useState<Partial<Record<NutrientGroup, boolean>>>({});

  return (
    <View style={{ gap: spacing.md }}>
      {sections.map((s) => {
        const abierto = abiertos[s.group] ?? ABIERTOS_POR_DEFECTO[s.group] ?? true;
        return (
          <View key={s.group} style={{ gap: 2 }}>
            <Pressable
              testID={`nutr-grupo-${s.group}`}
              accessibilityRole="button"
              accessibilityState={{ expanded: abierto }}
              onPress={() => setAbiertos((prev) => ({ ...prev, [s.group]: !abierto }))}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: spacing.sm,
                paddingVertical: spacing.xs,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{s.label}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Text testID={`nutr-grupo-${s.group}-conteo`} style={{ color: colors.textMuted, fontSize: 12 }}>
                  {textoConteo(s.rows)}
                </Text>
                {/* Signo en texto y no un ícono: el estado también viaja en accessibilityState. */}
                <Text style={{ color: colors.icon, fontSize: 13 }}>{abierto ? "−" : "+"}</Text>
              </View>
            </Pressable>
            {abierto && s.rows.map((r) => <Fila key={r.key} row={r} />)}
          </View>
        );
      })}
    </View>
  );
}
