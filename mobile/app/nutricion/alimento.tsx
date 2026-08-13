import { useCallback, useState } from "react";
import { ScrollView, View, Text, Pressable, ActivityIndicator } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import type { Food } from "@pulsia/shared";
import {
  getFood, getUsdaEntry, proposeUsdaRefresh, applyUsdaRefresh, assembleUsdaFood,
  proposeAiMicros, applyAiMicros,
  type UsdaEntry, type UsdaRefreshProposal, type AiMicrosProposal,
} from "../../src/api/nutrition";
import { getBackendUrl } from "../../src/storage/config";
import { buildNutrientRows, filaDeSal, sustituirSodioPorSal } from "../../src/nutrition/nutrientRows";
import { NutrientList } from "../../src/nutrition/NutrientList";
import { SourceChip } from "../../src/nutrition/SourceChip";
import { UsdaCorrector } from "../../src/nutrition/UsdaCorrector";
import { Card, SectionTitle } from "../../src/nutrition/tabs/ui";
import { colors, radius, spacing } from "../../src/theme/tokens";
import { useScreenPadding } from "../../src/theme/screen";

const baseLabel = (food: Food) => (food.basis === "per_100ml" ? "100 ml" : "100 g");

/**
 * El aviso que hace segura esta feature: aplicar re-snapshotea las comidas que usan el alimento,
 * o sea que cambia kcal y macros de días que el usuario YA miró. Saber cuántos son antes de tocar
 * "Aplicar" es la condición con la que se aceptó el diseño, así que el número va arriba del botón.
 */
function avisoComidas(cuantas: number): string {
  if (cuantas <= 0) return "Ninguna comida usa este alimento: no se toca ningún día.";
  if (cuantas === 1) return "Se va a recalcular 1 comida que ya usa este alimento.";
  return `Se van a recalcular ${cuantas} comidas que ya usan este alimento.`;
}

// La fila de USDA que se va a aplicar. `entrada` puede faltar (un `chosen` que no está entre los
// candidatos), y ahí se cae al número: feo, pero verificable. `kcal` son las de la propuesta, para
// mostrar contra las actuales qué cambiaría.
type Elegida = { fdcId: number; entrada: UsdaEntry | null; kcal: number };

export default function AlimentoDetalleScreen() {
  const screenPad = useScreenPadding(spacing.lg);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [food, setFood] = useState<Food | null>(null);
  const [entradaUsda, setEntradaUsda] = useState<UsdaEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);

  // ---- Estado del "Actualizar" ----
  // `propuesta` en null = el panel está cerrado. `elegida` en null con el panel abierto = no hubo
  // match: se avisa y NO se ofrece aplicar.
  const [propuesta, setPropuesta] = useState<UsdaRefreshProposal | null>(null);
  const [elegida, setElegida] = useState<Elegida | null>(null);
  const [cargandoPropuesta, setCargandoPropuesta] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [remezclando, setRemezclando] = useState(false);
  // Separado del `error` de la carga: que falle actualizar contra USDA no es que falle la pantalla.
  const [errorRefresh, setErrorRefresh] = useState<string | null>(null);

  // ---- Estado del "Completar con IA" ----
  const [propuestaIA, setPropuestaIA] = useState<AiMicrosProposal | null>(null);
  const [cargandoIA, setCargandoIA] = useState(false);
  const [aplicandoIA, setAplicandoIA] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const url = await getBackendUrl();
      setBaseUrl(url);
      const f = await getFood(url, id);
      setFood(f); setError(null);
      // La descripción de la entrada de USDA NO viaja con el alimento (el alimento guarda solo el
      // `usdaFdcId`): se resuelve aparte. Va en su propio catch porque es un adorno: si el backend
      // no la resuelve, la pantalla muestra el alimento entero y cae al número, en vez de
      // convertir un dato de contexto en un error de carga.
      setEntradaUsda(f.usdaFdcId == null ? null : await getUsdaEntry(url, f.usdaFdcId).catch(() => null));
    } catch (e) { setError((e as Error).message); }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  /** Paso 1: la propuesta. NO escribe nada — solo dice qué encontró y cuántas comidas tocaría. */
  async function pedirPropuesta() {
    // Son DOS llamadas a la IA (la frase de búsqueda en inglés y la elección del candidato): el
    // botón queda ocupado mientras tanto para que tocarlo de nuevo no dispare una segunda tanda.
    // `baseUrl` ya está: el botón solo se renderiza con el alimento cargado, y cargarlo lo setea.
    if (!id || !baseUrl || cargandoPropuesta) return;
    setErrorRefresh(null);
    setCargandoPropuesta(true);
    try {
      const p = await proposeUsdaRefresh(baseUrl, id);
      setPropuesta(p);
      setElegida(p.chosen == null
        ? null
        : { fdcId: p.chosen, entrada: p.candidates.find((c) => c.fdcId === p.chosen) ?? null, kcal: p.proposal.kcal });
      setCorrigiendo(false);
    } catch (e) {
      setErrorRefresh((e as Error).message);
    } finally {
      setCargandoPropuesta(false);
    }
  }

  /**
   * El usuario dijo "no es este" y eligió otra fila. Se re-mezcla contra la identificación de la
   * propuesta para mostrar los valores de ESA fila; lo que se persiste lo re-arma el backend al
   * aplicar, así que de acá solo sobrevive el `fdcId`.
   */
  async function elegirEntradaUsda(entrada: UsdaEntry) {
    if (propuesta == null || !baseUrl) return;
    setErrorRefresh(null);
    setRemezclando(true);
    try {
      const ex = await assembleUsdaFood(baseUrl, propuesta.identification, entrada.fdcId);
      setElegida({ fdcId: entrada.fdcId, entrada, kcal: ex.kcal });
      setCorrigiendo(false);
    } catch (e) {
      // El backend no degrada a "sin micros" cuando el fdcId no existe, y acá tampoco: se avisa y
      // sigue vigente la fila anterior.
      setErrorRefresh((e as Error).message);
    } finally {
      setRemezclando(false);
    }
  }

  /** Paso 2: aplicar. Escribe el alimento y re-snapshotea sus comidas, en una transacción. */
  async function aplicar() {
    if (!id || propuesta == null || elegida == null || !baseUrl || aplicando) return;
    setErrorRefresh(null);
    setAplicando(true);
    try {
      await applyUsdaRefresh(baseUrl, id, propuesta.identification, elegida.fdcId);
      cerrarPanel();
      // Se recarga desde la base y no se pinta la propuesta: lo que quedó guardado es lo que el
      // backend re-armó server-side, que puede no ser exactamente lo que viajó en la propuesta.
      await load();
    } catch (e) {
      // El panel queda abierto a propósito: el usuario puede reintentar o elegir otra fila, y
      // recargar acá mostraría el alimento "actualizado" cuando en la base no cambió nada.
      setErrorRefresh((e as Error).message);
    } finally {
      setAplicando(false);
    }
  }

  function cerrarPanel() {
    setPropuesta(null); setElegida(null); setCorrigiendo(false);
  }

  /** Completar con IA (paso 1): estima los micros del alimento guardado. NO escribe. */
  async function pedirPropuestaIA() {
    if (!id || !baseUrl || cargandoIA) return;
    setErrorRefresh(null);
    setCargandoIA(true);
    try {
      setPropuestaIA(await proposeAiMicros(baseUrl, id));
    } catch (e) {
      setErrorRefresh((e as Error).message);
    } finally {
      setCargandoIA(false);
    }
  }

  /** Completar con IA (paso 2): aplica el estimado y re-snapshotea las comidas. */
  async function aplicarIA() {
    if (!id || propuestaIA == null || !baseUrl || aplicandoIA) return;
    setErrorRefresh(null);
    setAplicandoIA(true);
    try {
      await applyAiMicros(baseUrl, id, propuestaIA.proposal);
      setPropuestaIA(null);
      await load(); // se relee de la base: lo guardado es lo que el backend escribió
    } catch (e) {
      setErrorRefresh((e as Error).message);
    } finally {
      setAplicandoIA(false);
    }
  }

  // `persona` en null = modo catálogo. Un alimento del catálogo son valores POR 100 g: compararlos
  // contra una referencia DIARIA diría "el 30 % de tu hierro del día" de algo que nadie come en
  // porciones de 100 g necesariamente. La referencia personal aparece en el detalle de la comida,
  // donde sí hay una cantidad real.
  // La fila del sodio se muestra como SAL, la misma unidad que la comida, el día, el campo del
  // alta y el semáforo del catálogo (ver filaDeSal). Sin referencia: por 100 g no hay ninguna.
  const secciones = food
    ? sustituirSodioPorSal(buildNutrientRows(food, null), filaDeSal(food.sodium_mg ?? null, null))
    : [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.md }}>
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      {!food && !error && <ActivityIndicator color={colors.accent} />}

      {food && (
        <>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" }}>
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text, flex: 1 }}>{food.name}</Text>
            {/* El catálogo es COMPARTIDO: los controles que MUTAN el alimento (Actualizar, Completar
                con IA, Editar) solo van en los propios. Ajeno = `mine === false`; con `mine` true o
                undefined (backend viejo) se muestran, por retrocompat. */}
            {food.mine !== false && (
              <>
                {/* Trae las vitaminas y minerales de USDA. Los ~80 alimentos cargados antes de la copia
                    local no los tienen, y sin este botón la única forma de conseguirlos era darlos de
                    alta de nuevo (perdiendo el historial de comidas que los referencia). */}
                <Pressable
                  testID="alimento-actualizar"
                  accessibilityRole="button"
                  onPress={() => void pedirPropuesta()}
                  disabled={cargandoPropuesta}
                  style={{ backgroundColor: colors.accentSoft, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, opacity: cargandoPropuesta ? 0.6 : 1 }}
                >
                  <Text style={{ color: colors.accentText, fontWeight: "600" }}>{cargandoPropuesta ? "Buscando…" : "Actualizar"}</Text>
                </Pressable>
                <Pressable
                  testID="alimento-completar-ia"
                  accessibilityRole="button"
                  onPress={() => void pedirPropuestaIA()}
                  disabled={cargandoIA}
                  style={{ backgroundColor: colors.accentSoft, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, opacity: cargandoIA ? 0.6 : 1 }}
                >
                  <Text style={{ color: colors.accentText, fontWeight: "600" }}>{cargandoIA ? "Estimando…" : "Completar con IA"}</Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push(food.recipe ? `/nutricion/crear-comida?id=${food.id}` : `/nutricion/agregar-alimento?foodId=${food.id}`)}
                  style={{ backgroundColor: colors.accentSoft, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}
                >
                  <Text style={{ color: colors.accentText, fontWeight: "600" }}>Editar</Text>
                </Pressable>
              </>
            )}
          </View>
          <SourceChip sourceMacros={food.sourceMacros} sourceMicros={food.sourceMicros} />

          {cargandoPropuesta && (
            <View testID="refresh-cargando" style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
              <ActivityIndicator color={colors.accent} />
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>Buscando este alimento en USDA…</Text>
            </View>
          )}
          {errorRefresh && <Text style={{ color: colors.danger }}>{errorRefresh}</Text>}

          {/* La confirmación previa. Todo lo que el usuario necesita para decidir está acá: qué
              fila encontró, qué le pasaría a las kcal, cuántas comidas se reescriben, y cómo
              corregir el match antes de que nada de eso pase. */}
          {propuesta && (
            <View testID="refresh-panel" style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm }}>
              {elegida ? (
                <Text testID="refresh-entrada" style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
                  {`USDA · ${elegida.entrada?.description ?? `entrada ${elegida.fdcId}`}`}
                </Text>
              ) : (
                <Text testID="refresh-sin-match" style={{ color: colors.text, fontSize: 13 }}>
                  No se encontró ninguna entrada de USDA para este alimento. No se cambió nada.
                </Text>
              )}

              {elegida && (
                <Text testID="refresh-cambios" style={{ color: colors.textMuted, fontSize: 12 }}>
                  {`Calorías por ${baseLabel(food)}: ${food.kcal} → ${elegida.kcal}`}
                </Text>
              )}

              <Text testID="refresh-comidas" style={{ color: colors.textMuted, fontSize: 12 }}>
                {avisoComidas(propuesta.mealsAffected)}
              </Text>

              <Pressable testID="refresh-no-es-este" accessibilityRole="button" onPress={() => setCorrigiendo((v) => !v)}>
                <Text style={{ color: colors.accentText, fontSize: 12, fontWeight: "600" }}>
                  {elegida ? "¿no es este?" : "elegir a mano"}
                </Text>
              </Pressable>

              {/* Montarlo y desmontarlo es lo que limpia su búsqueda (ver UsdaCorrector). */}
              {corrigiendo && (
                <UsdaCorrector
                  baseUrl={baseUrl}
                  candidatos={propuesta.candidates}
                  fdcIdVigente={elegida?.fdcId ?? null}
                  ocupado={remezclando}
                  onElegir={(entrada) => void elegirEntradaUsda(entrada)}
                  onError={setErrorRefresh}
                  ayuda="Elegí la entrada de USDA que corresponde. Se aplican los valores de esa fila."
                />
              )}

              <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
                {/* Sin match no hay nada que aplicar: escribir el alimento tal cual y reescribir
                    sus comidas no ganaría un solo nutriente. El "elegir a mano" sigue disponible. */}
                {elegida && (
                  <Pressable
                    testID="refresh-aplicar"
                    accessibilityRole="button"
                    onPress={() => void aplicar()}
                    disabled={aplicando}
                    style={{ backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, opacity: aplicando ? 0.6 : 1 }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{aplicando ? "Aplicando…" : "Aplicar"}</Text>
                  </Pressable>
                )}
                <Pressable testID="refresh-cancelar" accessibilityRole="button" onPress={cerrarPanel} disabled={aplicando}>
                  <Text style={{ color: colors.accentText, fontSize: 13, fontWeight: "600" }}>Cancelar</Text>
                </Pressable>
              </View>
            </View>
          )}

          {propuestaIA && (
            <View testID="ia-panel" style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm }}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>Micronutrientes estimados por IA</Text>
              <Text testID="ia-cambios" style={{ color: colors.textMuted, fontSize: 12 }}>
                {`Calorías por ${baseLabel(food)}: ${food.kcal} → ${propuestaIA.proposal.kcal}`}
              </Text>
              <Text testID="ia-comidas" style={{ color: colors.textMuted, fontSize: 12 }}>{avisoComidas(propuestaIA.mealsAffected)}</Text>
              <Text style={{ color: colors.icon, fontSize: 12 }}>
                Son estimaciones del modelo, no valores de laboratorio de USDA. Quedan marcados como «estimado por IA».
              </Text>
              <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
                <Pressable
                  testID="ia-aplicar" accessibilityRole="button" onPress={() => void aplicarIA()} disabled={aplicandoIA}
                  style={{ backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, opacity: aplicandoIA ? 0.6 : 1 }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{aplicandoIA ? "Aplicando…" : "Aplicar"}</Text>
                </Pressable>
                <Pressable testID="ia-cancelar" accessibilityRole="button" onPress={() => setPropuestaIA(null)} disabled={aplicandoIA}>
                  <Text style={{ color: colors.accentText, fontSize: 13, fontWeight: "600" }}>Cancelar</Text>
                </Pressable>
              </View>
            </View>
          )}

          <Card>
            <Text testID="alimento-base" style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>
              {`Valores por ${baseLabel(food)}`}
            </Text>
            <Text testID="alimento-macros" style={{ color: colors.textMuted, fontSize: 13 }}>
              {`${food.kcal} kcal · P${food.protein_g} C${food.carbs_g} G${food.fat_g}`}
            </Text>
            {food.unitWeightG != null && (
              <Text style={{ color: colors.icon, fontSize: 12 }}>
                {`1 unidad ≈ ${food.unitWeightG} ${food.basis === "per_100ml" ? "ml" : "g"}`}
              </Text>
            )}
            {/* De qué fila de USDA salieron las vitaminas y minerales. Se muestra la DESCRIPCIÓN
                de esa fila (en inglés, tal como la publica USDA) y no el nombre del alimento
                propio: el punto es que el usuario pueda desconfiar del match ("le puse 'lentejas'
                pero USDA matcheó 'Lentils, sprouted, raw'"). Con el nombre propio el chequeo sería
                imposible, y con el fdcId crudo, ilegible. Si no se pudo resolver, queda el número:
                es feo pero verificable. */}
            {food.usdaFdcId != null && (
              <Text testID="alimento-usda" style={{ color: colors.icon, fontSize: 12 }}>
                {entradaUsda != null
                  ? `Vitaminas y minerales de «${entradaUsda.description}» (USDA)`
                  : `Vitaminas y minerales de la entrada ${food.usdaFdcId} de USDA`}
              </Text>
            )}
          </Card>

          <Card>
            <SectionTitle>{`Nutrientes por ${baseLabel(food)}`}</SectionTitle>
            <NutrientList sections={secciones} />
          </Card>

          <Pressable onPress={() => router.back()}>
            <Text style={{ color: colors.accentText, fontSize: 13, fontWeight: "600" }}>← Volver</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}
