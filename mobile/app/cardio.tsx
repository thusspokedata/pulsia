import { useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, Pressable, TextInput, ActivityIndicator, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { CardioActivitySchema, CARDIO_TYPES, CARDIO_LABELS, type CardioActivity, type CardioType, type CardioFitPreview } from "@pulsia/shared";
import { createCardio, getCardioById, updateCardio, deleteCardio, parseFitCardio } from "../src/api/cardio";
import { buildFitActivity } from "../src/cardio/buildFitActivity";
import { getBackendUrl } from "../src/storage/config";
import { newSessionId } from "../src/session/id";
import { dayAtNoon, dayLabel } from "../src/session/metricDate";
import { parseDecimal } from "../src/cardio/parseInput";
import { ChipGroup } from "../src/components/ChipGroup";
import { colors, radius, spacing } from "../src/theme/tokens";
import { useScreenPadding } from "../src/theme/screen";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

// Convierte un número a texto para precargar un input, sin ceros/decimales sobrantes.
function numText(n: number): string {
  return String(n);
}

const inputStyle = {
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.sm,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  color: colors.text,
  backgroundColor: colors.surface,
} as const;

export default function CardioScreen() {
  const screenPad = useScreenPadding(spacing.xl);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = typeof id === "string" && id.length > 0;

  const baseUrl = useRef<string | null>(null);

  const [type, setType] = useState<CardioType>("walk");
  const [durationText, setDurationText] = useState("");
  const [distanceText, setDistanceText] = useState("");
  const [hrText, setHrText] = useState("");
  const [notes, setNotes] = useState("");
  const [dayOffset, setDayOffset] = useState(0);

  // Import de .FIT (solo en alta): el preview parseado del reloj y el flag de carga del picker/parseo.
  const [fitPreview, setFitPreview] = useState<CardioFitPreview | null>(null);
  const [importing, setImporting] = useState(false);

  // En modo edición guardamos la actividad cargada para mostrar los campos NO
  // editables (fecha, FC media) como solo-lectura: updateCardio solo parchea
  // type/durationMs/distanceM/notes, así que dejarlos editar sería silencioso.
  const [loaded, setLoaded] = useState<CardioActivity | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const url = await getBackendUrl();
      if (!active) return;
      baseUrl.current = url;
      if (!url) {
        setError("Configurá el backend");
        setLoading(false);
        return;
      }
      if (!isEdit) return;
      try {
        const a = await getCardioById(url, id as string);
        if (!active) return;
        setLoaded(a);
        setType(a.type);
        setDurationText(numText(a.durationMs / 60000));
        setDistanceText(a.distanceM != null ? numText(a.distanceM / 1000) : "");
        // La FC es solo-lectura en edición (el patch no incluye avgHr), así que no
        // precargamos hrText: sería estado muerto (solo se renderiza en alta).
        setNotes(a.notes);
      } catch {
        if (active) setError("No se pudo cargar la actividad");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, isEdit]);

  // Deriva y valida los campos numéricos comunes a alta/edición. Devuelve null y
  // deja el error seteado si la duración no es un número > 0.
  function readNumericFields(): { durationMs: number; distanceM: number | null; avgHr: number | null } | null {
    const minutes = parseDecimal(durationText);
    if (minutes == null || minutes <= 0) {
      setError("Ingresá una duración en minutos mayor a 0");
      return null;
    }
    const km = parseDecimal(distanceText);
    const hr = parseDecimal(hrText);
    return {
      durationMs: Math.round(minutes * 60000),
      distanceM: km == null ? null : Math.round(km * 1000),
      avgHr: hr == null ? null : Math.round(hr),
    };
  }

  async function onImportFit() {
    const url = baseUrl.current;
    if (!url) {
      setError("Configurá el backend");
      return;
    }
    setError(null);
    let picked;
    try {
      // `.fit` no tiene MIME estándar registrado → hay que abrir "*/*".
      picked = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
    } catch {
      setError("No se pudo abrir el selector de archivos");
      return;
    }
    if (picked.canceled || !picked.assets || picked.assets.length === 0) return;
    setImporting(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(picked.assets[0].uri, { encoding: "base64" });
      const preview = await parseFitCardio(url, base64);
      setFitPreview(preview);
      // Prefill de los campos editables con lo que midió el reloj.
      setType(preview.type);
      setDurationText(numText(Math.round(preview.durationMs / 60000)));
      setDistanceText(preview.distanceM != null ? numText(preview.distanceM / 1000) : "");
      setHrText(preview.avgHr != null ? String(preview.avgHr) : "");
    } catch (e) {
      setError((e as Error).message || "No se pudo leer el archivo .FIT");
    } finally {
      setImporting(false);
    }
  }

  async function onCreate() {
    const url = baseUrl.current;
    if (!url) {
      setError("Configurá el backend");
      return;
    }
    setError(null);
    const fields = readNumericFields();
    if (!fields) return;
    // Si venimos de un import .FIT, confirmamos ese preview (source:"fit", kcal/FC del reloj).
    if (fitPreview) {
      const activity = buildFitActivity(
        fitPreview,
        { type, durationMs: fields.durationMs, distanceM: fields.distanceM, avgHr: fields.avgHr, notes },
        newSessionId(),
      );
      const parsed = CardioActivitySchema.safeParse(activity);
      if (!parsed.success) {
        setError("Datos inválidos, revisá los campos");
        return;
      }
      setSaving(true);
      try {
        await createCardio(url, parsed.data);
        router.back();
      } catch (e) {
        setError((e as Error).message || "No se pudo guardar la actividad");
      } finally {
        setSaving(false);
      }
      return;
    }
    const activity = {
      id: newSessionId(),
      type,
      startedAt: dayAtNoon(dayOffset, Date.now()),
      durationMs: fields.durationMs,
      distanceM: fields.distanceM,
      avgHr: fields.avgHr,
      maxHr: null,
      elevationGainM: null,
      kcal: null,
      kcalSource: "estimate" as const,
      source: "manual" as const,
      notes,
    };
    const parsed = CardioActivitySchema.safeParse(activity);
    if (!parsed.success) {
      setError("Datos inválidos, revisá los campos");
      return;
    }
    setSaving(true);
    try {
      await createCardio(url, parsed.data);
      router.back();
    } catch (e) {
      setError((e as Error).message || "No se pudo guardar la actividad");
    } finally {
      setSaving(false);
    }
  }

  async function onUpdate() {
    const url = baseUrl.current;
    if (!url || !isEdit || !loaded) return;
    setError(null);
    const fields = readNumericFields();
    if (!fields) return;
    // Validamos el shape completo (loaded + ediciones) para atajar valores negativos
    // antes de mandar el patch, reusando el schema en vez de chequeos ad-hoc.
    const merged = { ...loaded, type, durationMs: fields.durationMs, distanceM: fields.distanceM, notes };
    const parsed = CardioActivitySchema.safeParse(merged);
    if (!parsed.success) {
      setError("Datos inválidos, revisá los campos");
      return;
    }
    setSaving(true);
    try {
      await updateCardio(url, id as string, {
        type,
        durationMs: fields.durationMs,
        distanceM: fields.distanceM,
        notes,
      });
      router.back();
    } catch (e) {
      setError((e as Error).message || "No se pudo actualizar la actividad");
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert("Borrar actividad", "Se borrará de la base de datos. ¿Seguro?", [
      { text: "No", style: "cancel" },
      { text: "Sí, borrar", style: "destructive", onPress: onDelete },
    ]);
  }

  async function onDelete() {
    const url = baseUrl.current;
    if (!url || !isEdit) return;
    setError(null);
    setSaving(true);
    try {
      await deleteCardio(url, id as string);
      router.back();
    } catch (e) {
      setError((e as Error).message || "No se pudo borrar la actividad");
      setSaving(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.lg }}>
      <Pressable onPress={() => router.back()} style={{ paddingVertical: spacing.xs }}>
        <Text style={{ color: colors.accentText, fontSize: 14, fontWeight: "600" }}>← Volver</Text>
      </Pressable>

      <Text style={{ fontSize: 20, fontWeight: "500", color: colors.text }}>
        {isEdit ? "Editar actividad" : "Nueva actividad de cardio"}
      </Text>

      {loading ? (
        <Text style={{ color: colors.textMuted }}>Cargando…</Text>
      ) : (
        <>
          {/* Importar .FIT: solo en alta (no en edición) */}
          {!isEdit && (
            <>
              <Pressable
                testID="cardio-import-fit"
                onPress={onImportFit}
                disabled={importing}
                style={{
                  borderWidth: 1,
                  borderColor: colors.accent,
                  borderRadius: radius.md,
                  paddingVertical: spacing.md,
                  alignItems: "center",
                  opacity: importing ? 0.6 : 1,
                }}
              >
                {importing ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <Text style={{ color: colors.accentText, fontWeight: "600" }}>Importar archivo .FIT</Text>
                )}
              </Pressable>
              {fitPreview && (
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Importado del reloj{fitPreview.kcal != null ? ` · ${fitPreview.kcal} kcal medidas` : ""}. Revisá el tipo y confirmá.
                </Text>
              )}
            </>
          )}

          {/* Tipo */}
          <View style={{ gap: spacing.sm }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>Tipo</Text>
            <ChipGroup
              single
              options={CARDIO_TYPES.map((t) => ({ value: t, label: CARDIO_LABELS[t] }))}
              selected={[type]}
              onChange={(next) => setType(next[0] as CardioType)}
            />
          </View>

          {/* Duración */}
          <View style={{ gap: spacing.sm }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>Duración (minutos)</Text>
            <TextInput
              testID="cardio-duration"
              keyboardType="decimal-pad"
              value={durationText}
              onChangeText={setDurationText}
              placeholder="30"
              placeholderTextColor={colors.textMuted}
              style={inputStyle}
            />
          </View>

          {/* Distancia */}
          <View style={{ gap: spacing.sm }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>Distancia (km, opcional)</Text>
            <TextInput
              testID="cardio-distance"
              keyboardType="decimal-pad"
              value={distanceText}
              onChangeText={setDistanceText}
              placeholder="—"
              placeholderTextColor={colors.textMuted}
              style={inputStyle}
            />
          </View>

          {/* FC media: editable solo en alta (el patch de edición no incluye avgHr) */}
          {isEdit ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              FC media: {loaded?.avgHr != null ? `${loaded.avgHr} lpm` : "—"}
            </Text>
          ) : (
            <View style={{ gap: spacing.sm }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>FC media (lpm, opcional)</Text>
              <TextInput
                testID="cardio-hr"
                keyboardType="number-pad"
                value={hrText}
                onChangeText={setHrText}
                placeholder="—"
                placeholderTextColor={colors.textMuted}
                style={inputStyle}
              />
            </View>
          )}

          {/* Fecha: navegador editable en alta manual; solo-lectura en edición y en import
              (el .FIT trae su propia fecha — buildFitActivity usa preview.startedAt, así que el
              navegador ahí sería engañoso: el cambio se descartaría en silencio). */}
          <View style={{ gap: spacing.sm }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>Fecha</Text>
            {isEdit || fitPreview ? (
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                {(loaded ?? fitPreview) != null ? fmtDate((loaded ?? fitPreview)!.startedAt) : "—"}
              </Text>
            ) : (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: colors.surfaceMuted,
                  borderRadius: radius.md,
                  padding: spacing.sm,
                }}
              >
                <Pressable
                  testID="date-prev"
                  onPress={() => setDayOffset((o) => o + 1)}
                  style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: radius.sm, backgroundColor: colors.surface }}
                >
                  <Text style={{ color: colors.text, fontSize: 18 }}>◀</Text>
                </Pressable>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <Text testID="date-label" style={{ color: colors.text, fontWeight: "600" }}>
                    {dayLabel(dayOffset, Date.now())}
                  </Text>
                  {dayOffset !== 0 ? (
                    <Pressable
                      testID="date-hoy"
                      onPress={() => setDayOffset(0)}
                      style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.accent }}
                    >
                      <Text style={{ color: "#fff", fontSize: 12 }}>Hoy</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Pressable
                  testID="date-next"
                  onPress={() => setDayOffset((o) => Math.max(0, o - 1))}
                  disabled={dayOffset === 0}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 14,
                    borderRadius: radius.sm,
                    backgroundColor: colors.surface,
                    opacity: dayOffset === 0 ? 0.4 : 1,
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 18 }}>▶</Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Notas */}
          <View style={{ gap: spacing.sm }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>Notas (opcional)</Text>
            <TextInput
              testID="cardio-notes"
              multiline
              value={notes}
              onChangeText={setNotes}
              placeholder="—"
              placeholderTextColor={colors.textMuted}
              style={{ ...inputStyle, minHeight: 72, textAlignVertical: "top" }}
            />
          </View>

          {error && <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text>}

          <Pressable
            testID="cardio-save"
            onPress={isEdit ? onUpdate : onCreate}
            disabled={saving || importing}
            style={{
              backgroundColor: colors.accent,
              borderRadius: radius.md,
              paddingVertical: spacing.md,
              alignItems: "center",
              opacity: saving || importing ? 0.6 : 1,
            }}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "600" }}>{isEdit ? "Guardar cambios" : "Guardar"}</Text>
            )}
          </Pressable>

          {isEdit && (
            <Pressable
              testID="cardio-delete"
              onPress={confirmDelete}
              disabled={saving}
              style={{
                borderWidth: 1,
                borderColor: colors.danger,
                borderRadius: radius.md,
                paddingVertical: spacing.md,
                alignItems: "center",
                opacity: saving ? 0.6 : 1,
              }}
            >
              <Text style={{ color: colors.danger, fontWeight: "600" }}>Borrar</Text>
            </Pressable>
          )}
        </>
      )}
    </ScrollView>
  );
}
