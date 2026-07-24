import { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { searchUsdaFoods, type UsdaEntry } from "../api/nutrition";
import { colors, radius, spacing } from "../theme/tokens";

/**
 * El panel del "¿no es este?": las OTRAS filas de USDA que matchearon, más una búsqueda manual
 * para cuando la correcta no está entre ellas.
 *
 * Lo comparten las dos pantallas que eligen una fila de USDA — el alta/edición de un alimento
 * (`agregar-alimento.tsx`) y el botón "Actualizar" del detalle (`alimento.tsx`)—, y por eso vive
 * acá y no en ninguna de las dos. Lo que hacen con la fila elegida es distinto (una recarga el
 * formulario, la otra la propuesta de actualización), así que eso queda en `onElegir`: el
 * componente elige la fila, no decide qué significa elegirla.
 *
 * La búsqueda (texto, resultados, spinner) es estado propio y se pierde al cerrar: al reabrir, la
 * lista arranca limpia. Es a propósito — los candidatos filtran la fila vigente pero los
 * resultados de una búsqueda vieja no, y dejarlos haría clickeable la fila que ya está elegida.
 *
 * ⚠️ Por eso el panel cerrado NO se renderiza acá con un `if (!abierto) return null`: un componente
 * que devuelve `null` sigue MONTADO y conserva su estado, así que la búsqueda vieja reaparecía al
 * reabrir. Quien lo usa lo monta y lo desmonta (`{abierto && <UsdaCorrector … />}`), y desmontarlo
 * es lo que limpia la búsqueda.
 */
export function UsdaCorrector({
  baseUrl, candidatos, fdcIdVigente, ocupado, onElegir, onError, ayuda,
}: {
  baseUrl: string | null;
  candidatos: UsdaEntry[];
  fdcIdVigente: number | null;
  ocupado: boolean;
  onElegir: (entrada: UsdaEntry) => void;
  onError: (mensaje: string) => void;
  ayuda: string;
}) {
  const [busqueda, setBusqueda] = useState("");
  // `null` = todavía no se buscó; `[]` = se buscó y no hubo nada. Un "sin resultados" mostrado
  // antes de buscar diría que USDA no tiene el alimento, que es otra cosa.
  const [resultados, setResultados] = useState<UsdaEntry[] | null>(null);
  const [buscando, setBuscando] = useState(false);

  async function buscar() {
    const q = busqueda.trim();
    if (q.length < 2 || !baseUrl) return;
    setBuscando(true);
    try {
      setResultados(await searchUsdaFoods(baseUrl, q));
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBuscando(false);
    }
  }

  // Una fila elegible de USDA. La descripción va en inglés, tal como la publica USDA: traducirla
  // impediría el chequeo que el usuario está haciendo justamente acá (ver "fried egg" →
  // "Fried eggplant", que es el error que este bloque existe para corregir).
  const fila = (entrada: UsdaEntry, prefijo: string) => (
    <Pressable
      key={`${prefijo}-${entrada.fdcId}`}
      testID={`usda-${prefijo}-${entrada.fdcId}`}
      accessibilityRole="button"
      disabled={ocupado}
      onPress={() => onElegir(entrada)}
      style={{ paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }}
    >
      <Text style={{ color: colors.text, fontSize: 13 }}>{entrada.description}</Text>
    </Pressable>
  );

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{ayuda}</Text>
      {/* La vigente no se lista: "¿no es este?" es la lista de las OTRAS, y volver a elegir la
          misma sería una llamada al backend que no cambia nada. */}
      {candidatos.filter((c) => c.fdcId !== fdcIdVigente).map((c) => fila(c, "candidato"))}

      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: spacing.md }}>¿No está el que buscás?</Text>
      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs }}>
        <TextInput
          testID="usda-buscar-input"
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Buscar en USDA (en inglés)"
          placeholderTextColor={colors.icon}
          style={{ flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.sm, color: colors.text }}
        />
        <Pressable
          testID="usda-buscar-submit"
          onPress={() => void buscar()}
          disabled={buscando || busqueda.trim().length < 2}
          style={{ backgroundColor: colors.accentSoft, borderRadius: radius.sm, paddingHorizontal: spacing.md, justifyContent: "center", opacity: buscando || busqueda.trim().length < 2 ? 0.5 : 1 }}
        >
          <Text style={{ color: colors.accentText, fontWeight: "600", fontSize: 13 }}>Buscar</Text>
        </Pressable>
      </View>
      {resultados != null && resultados.length === 0 && !buscando && (
        <Text testID="usda-sin-resultados" style={{ color: colors.textMuted, fontSize: 12, marginTop: spacing.sm }}>
          No hay entradas de USDA para esa búsqueda.
        </Text>
      )}
      {(resultados ?? []).map((c) => fila(c, "resultado"))}
      {ocupado && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.sm }} />}
    </View>
  );
}
