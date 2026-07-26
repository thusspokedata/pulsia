import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import type { NutrientGroup } from "@pulsia/shared";
import { colors, spacing } from "../theme/tokens";
import { Bar } from "./tabs/ui";
import type { NutrientRow, NutrientRowKey, NutrientSection } from "./nutrientRows";

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

// Total REALMENTE consumido: comida + suplemento. "Cuenta en todo" — el excedente y el % no
// pueden mirar solo la comida cuando el mismo nutriente también entró por un suplemento, porque
// el cuerpo no distingue el origen. `supplement` en null (comida/catálogo, superficies que no
// trackean suplementos) se comporta como 0: sin cambio de comportamiento ahí.
// "Hay suplemento" también es dato acá: sin esto, un suplemento tomado sin ningún alimento que
// declare el nutriente (`value: null`) nunca dispararía el aviso de excedente, aunque el
// suplemento solo ya se haya pasado del límite.
function totalConsumido(r: NutrientRow): number | null {
  const haySuplemento = r.supplement != null && r.supplement > 0;
  if (r.value == null && !haySuplemento) return null;
  return (r.value ?? 0) + (r.supplement ?? 0);
}

// `over` solo aplica a los techos: pasarse de un piso (fibra, hierro) es BUENO y no se avisa.
function seExcedio(r: NutrientRow): boolean {
  const total = totalConsumido(r);
  return total != null && r.ref != null && r.kind === "max" && total > r.ref;
}

// Una fila "tiene dato" con comida (value != null) O con un suplemento efectivamente tomado
// (supplement > 0): "hay suplemento" también es dato, aunque esa comida no haya declarado nada.
function tieneDato(r: NutrientRow): boolean {
  return r.value != null || (r.supplement != null && r.supplement > 0);
}

function textoConteo(rows: NutrientRow[]): string {
  const conDato = rows.filter(tieneDato).length;
  return conDato === 0 ? "sin datos" : `${conDato} de ${rows.length} con dato`;
}

function Fila({ row, onPress }: { row: NutrientRow; onPress?: (key: NutrientRowKey) => void }) {
  const over = seExcedio(row);
  const haySuplemento = row.supplement != null && row.supplement > 0;
  const sinDato = row.value == null && !haySuplemento;
  return (
    // Pressable siempre (no un View cuando no hay `onPress`) para que el testID y la estructura
    // no cambien según la pantalla: sin dato queda deshabilitado igual, porque no hay nada que
    // desglosar y una lista vacía no es una respuesta.
    <Pressable
      testID={`nutr-${row.key}-row`}
      accessibilityRole={onPress != null && !sinDato ? "button" : undefined}
      disabled={onPress == null || sinDato}
      onPress={() => onPress?.(row.key)}
      style={{ gap: 4, marginTop: 4 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: spacing.sm }}>
        <Text style={{ color: sinDato ? colors.textMuted : colors.text, fontSize: 14, flex: 1 }}>{row.label}</Text>
        <Text
          testID={`nutr-${row.key}-amount`}
          style={{ color: over ? colors.warning : colors.textMuted, fontSize: 13 }}
        >
          {row.value == null && !haySuplemento ? (
            "sin dato"
          ) : row.value == null ? (
            // Sin comida pero con suplemento: se muestra SOLO el aporte del suplemento, sin un
            // número de comida que no existe (sería mostrar un 0 que nadie midió).
            <>
              <Text style={{ color: colors.supplementText }}>+{fmt(row.supplement!)}</Text>
              {row.ref != null ? ` / ${fmt(row.ref)} ${row.unit}` : ` ${row.unit}`}
            </>
          ) : (
            <>
              {row.partial ? "≥ " : ""}
              {fmt(row.value)}
              {row.supplement != null && row.supplement > 0 && (
                <Text style={{ color: colors.supplementText }}>+{fmt(row.supplement)}</Text>
              )}
              {row.ref != null ? ` / ${fmt(row.ref)} ${row.unit}` : ` ${row.unit}`}
            </>
          )}
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
      {(row.value != null || haySuplemento) && row.ref != null && (
        <Bar
          value={row.value ?? 0}
          supplement={row.supplement ?? 0}
          target={row.ref}
          kind={row.kind === "min" ? "floor" : "limit"}
          testID={`nutr-${row.key}-bar`}
        />
      )}
    </Pressable>
  );
}

export function NutrientList({
  sections,
  onPressRow,
}: {
  sections: NutrientSection[];
  onPressRow?: (key: NutrientRowKey) => void;
}) {
  const [abiertos, setAbiertos] = useState<Partial<Record<NutrientGroup, boolean>>>({});

  return (
    <View style={{ gap: spacing.md }}>
      {sections.map((s) => {
        const abierto = abiertos[s.group] ?? ABIERTOS_POR_DEFECTO[s.group] ?? true;
        // Un excedente dentro de un grupo CERRADO quedaría invisible: la sal, que hoy avisa de
        // una en la pestaña del día, vive en Minerales y arranca colapsado. El aviso sube al
        // encabezado para que colapsar no esconda información, solo detalle.
        const hayExcedente = s.rows.some(seExcedio);
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
                {hayExcedente && (
                  <Text testID={`nutr-grupo-${s.group}-alerta`} style={{ color: colors.warning, fontSize: 12 }}>
                    te pasaste
                  </Text>
                )}
                <Text testID={`nutr-grupo-${s.group}-conteo`} style={{ color: colors.textMuted, fontSize: 12 }}>
                  {textoConteo(s.rows)}
                </Text>
                {/* Signo en texto y no un ícono: el estado también viaja en accessibilityState. */}
                <Text style={{ color: colors.icon, fontSize: 13 }}>{abierto ? "−" : "+"}</Text>
              </View>
            </Pressable>
            {abierto && s.rows.map((r) => <Fila key={r.key} row={r} onPress={onPressRow} />)}
          </View>
        );
      })}
    </View>
  );
}
