import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, Pressable, Alert } from "react-native";
import { router, useFocusEffect } from "expo-router";
import type { CardioActivity, WorkoutSession } from "@pulsia/shared";
import { getSessions, getSessionById, deleteSessionById, putSession, type SessionListItem } from "../../src/api/sessions";
import { listCardio, deleteCardio } from "../../src/api/cardio";
import { getBackendUrl } from "../../src/storage/config";
import { buildTimeline, type TimelineItem } from "../../src/session/timeline";
import { summarize } from "../../src/session/summary";
import { SessionSummary } from "../../src/components/SessionSummary";
import { NotesEditor } from "../../src/components/NotesEditor";
import { TimelineRow } from "../../src/components/TimelineRow";
import { colors, spacing, radius } from "../../src/theme/tokens";

export default function HistorialScreen() {
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [selected, setSelected] = useState<WorkoutSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailNotes, setDetailNotes] = useState("");
  const lastLoaded = useRef<string | null>(null);
  const baseUrl = useRef<string | null>(null);

  useEffect(() => {
    if (selected) setDetailNotes(selected.notes);
  }, [selected]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const url = await getBackendUrl();
        if (!active) return;
        baseUrl.current = url;
        if (!url) {
          if (lastLoaded.current !== "no-url") {
            lastLoaded.current = "no-url";
            setError("Configurá el backend");
            setTimeline([]);
            setLoading(false);
          }
          return;
        }
        try {
          // Ambas fuentes en paralelo: un fallo en cualquiera cae al canal `error` de la lista.
          const [sessions, cardios] = await Promise.all([getSessions(url), listCardio(url)]);
          if (!active) return;
          const merged = buildTimeline(sessions, cardios);
          const serialized = JSON.stringify(merged);
          if (serialized === lastLoaded.current) return;
          lastLoaded.current = serialized;
          setError(null);
          setTimeline(merged);
          setLoading(false);
        } catch {
          if (active && lastLoaded.current !== "error") {
            lastLoaded.current = "error";
            setError("No se pudo cargar el historial");
            setLoading(false);
          }
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  async function onOpen(item: SessionListItem) {
    const url = baseUrl.current;
    if (!url) return;
    // Error separado del de la lista: si falla abrir una sesión NO debe ocultar el historial.
    setDetailError(null);
    setDetailLoading(true);
    try {
      const full = await getSessionById(url, item.id);
      setSelected(full);
    } catch {
      setDetailError("No se pudo abrir el entrenamiento");
    } finally {
      setDetailLoading(false);
    }
  }

  function onOpenCardio(activity: CardioActivity) {
    router.push(`/cardio?id=${activity.id}`);
  }

  async function saveDetailNotes() {
    const url = baseUrl.current;
    if (!url || !selected) return;
    const updated = { ...selected, notes: detailNotes };
    setSelected(updated);
    setDetailError(null); // limpiar cualquier error previo antes de reintentar
    try {
      await putSession(url, updated);
    } catch {
      setDetailError("No se pudo guardar la nota");
    }
  }

  function confirmDelete(item: SessionListItem) {
    Alert.alert("Eliminar entrenamiento", "Se borrará de la base de datos. ¿Seguro?", [
      { text: "No", style: "cancel" },
      { text: "Sí, eliminar", style: "destructive", onPress: () => onDeleteSession(item) },
    ]);
  }

  function confirmDeleteCardio(activity: CardioActivity) {
    Alert.alert("Eliminar actividad", "Se borrará de la base de datos. ¿Seguro?", [
      { text: "No", style: "cancel" },
      { text: "Sí, eliminar", style: "destructive", onPress: () => onDeleteCardio(activity) },
    ]);
  }

  async function onDeleteSession(item: SessionListItem) {
    const url = baseUrl.current;
    if (!url) return;
    setDetailError(null); // limpiar cualquier error previo antes de reintentar
    try {
      await deleteSessionById(url, item.id);
      setTimeline((prev) => {
        const next = prev.filter((x) => !(x.kind === "session" && x.id === item.id));
        // Actualizar el dedupe del focus-effect para que no reintroduzca el item borrado.
        lastLoaded.current = JSON.stringify(next);
        return next;
      });
    } catch {
      setDetailError("No se pudo eliminar");
    }
  }

  async function onDeleteCardio(activity: CardioActivity) {
    const url = baseUrl.current;
    if (!url) return;
    setDetailError(null); // limpiar cualquier error previo antes de reintentar
    try {
      await deleteCardio(url, activity.id);
      setTimeline((prev) => {
        const next = prev.filter((x) => !(x.kind === "cardio" && x.id === activity.id));
        // Igual que la sesión: sincronizar el dedupe para que el focus-effect no lo reintroduzca.
        lastLoaded.current = JSON.stringify(next);
        return next;
      });
    } catch {
      setDetailError("No se pudo eliminar");
    }
  }

  if (selected != null) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
        <Pressable testID="hist-back" onPress={() => setSelected(null)} style={{ paddingVertical: spacing.xs }}>
          <Text style={{ color: colors.accentText, fontSize: 14, fontWeight: "600" }}>← Volver al historial</Text>
        </Pressable>
        <NotesEditor value={detailNotes} onChangeText={setDetailNotes} onBlur={saveDetailNotes} />
        {detailError && <Text testID="hist-detail-error" style={{ color: colors.danger, fontSize: 12 }}>{detailError}</Text>}
        <SessionSummary summary={summarize(selected)} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
      {detailLoading && <Text testID="hist-opening" style={{ color: colors.textMuted, fontSize: 12 }}>Abriendo…</Text>}
      {detailError && <Text testID="hist-detail-error" style={{ color: colors.danger, fontSize: 12 }}>{detailError}</Text>}
      {error ? (
        <Text style={{ color: colors.textMuted }}>{error}</Text>
      ) : loading ? (
        <Text style={{ color: colors.textMuted }}>Cargando…</Text>
      ) : (
        <>
          <Pressable
            testID="cardio-add"
            onPress={() => router.push("/cardio")}
            style={{
              backgroundColor: colors.accent,
              borderRadius: radius.md,
              paddingVertical: spacing.md,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>Registrar actividad</Text>
          </Pressable>
          {timeline.length === 0 ? (
            <Text style={{ color: colors.textMuted }}>Todavía no hay actividad</Text>
          ) : (
            timeline.map((it) => (
              <TimelineRow
                key={`${it.kind}-${it.id}`}
                item={it}
                disabled={detailLoading}
                onOpenSession={onOpen}
                onDeleteSession={confirmDelete}
                onOpenCardio={onOpenCardio}
                onDeleteCardio={confirmDeleteCardio}
              />
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}
