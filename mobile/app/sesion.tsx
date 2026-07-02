import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { WorkoutSession } from "@pulsia/shared";
import { getStoredProgram } from "../src/storage/program";
import { getStoredProgramId } from "../src/storage/programId";
import { getBackendUrl } from "../src/storage/config";
import { getActiveSession, setActiveSession, clearActiveSession } from "../src/storage/activeSession";
import { enqueueSession } from "../src/storage/pendingSessions";
import { syncPending } from "../src/sync/syncSessions";
import { startSession, tapRep, endSet, editSet, skipExercise, finishSession } from "../src/session/engine";
import { newSessionId } from "../src/session/id";
import { colors, radius, spacing } from "../src/theme/tokens";

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function SesionScreen() {
  const params = useLocalSearchParams<{ week: string; dayLabel: string; location: string }>();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [weight, setWeight] = useState("");
  const [rpe, setRpe] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const started = useRef(false);
  const setStartRef = useRef(Date.now());

  function apply(next: WorkoutSession) {
    setSession(next);
    void setActiveSession(next);
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const active = await getActiveSession();
      if (active) {
        setSession(active);
        return;
      }
      const program = await getStoredProgram();
      if (!program) {
        router.replace("/");
        return;
      }
      const programId = (await getStoredProgramId()) ?? "00000000-0000-4000-8000-000000000000";
      const s = startSession({
        program,
        programId,
        weekNumber: Number(params.week ?? 1),
        dayLabel: String(params.dayLabel),
        location: params.location === "home" ? "home" : "gym",
        id: newSessionId(),
        nowMs: Date.now(),
      });
      setStartRef.current = Date.now();
      apply(s);
    })();
  }, [params.week, params.dayLabel, params.location]);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const input = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.sm,
    color: colors.text,
    minWidth: 70,
    textAlign: "center",
  } as const;

  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.textMuted }}>Preparando la sesión…</Text>
      </View>
    );
  }

  const sess = session; // narrowed a WorkoutSession (los handlers son closures y no estrechan `session`)
  const current =
    sess.exercises.find((e) => !e.skipped && e.sets.filter((s) => s.endedAt != null).length < e.planned.sets) ??
    sess.exercises.find((e) => !e.skipped);
  const openSet = current?.sets.find((s) => s.endedAt == null);
  const doneSets = current ? current.sets.filter((s) => s.endedAt != null).length : 0;
  const doneList = current ? current.sets.filter((s) => s.endedAt != null) : [];

  function onTap() {
    if (!current) return;
    if (!openSet) setStartRef.current = Date.now();
    apply(tapRep(sess, { exerciseOrder: current.order, setStartMs: setStartRef.current, nowMs: Date.now() }));
  }

  function onEndSet() {
    if (!current) return;
    apply(
      endSet(sess, {
        exerciseOrder: current.order,
        weightKg: weight ? Number(weight) : null,
        rpe: rpe ? Number(rpe) : null,
        nowMs: Date.now(),
      }),
    );
    setWeight("");
    setRpe("");
  }

  function onSkip() {
    if (!current) return;
    apply(skipExercise(sess, { exerciseOrder: current.order }));
  }

  async function onFinish() {
    const done = finishSession(sess, { nowMs: Date.now() });
    await setActiveSession(done);
    await enqueueSession(done);
    await clearActiveSession();
    const url = await getBackendUrl();
    if (url) void syncPending(url); // fire-and-forget; si falla queda en cola
    router.replace("/");
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.xl, gap: spacing.md }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{session.dayLabel}</Text>
        <Text style={{ color: colors.text, fontSize: 12 }}>⏱ {fmt(nowMs - session.startedAt)}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm }}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>♥ HR</Text>
        <Text testID="hr-value" style={{ color: colors.textMuted, fontSize: 16 }}>—</Text>
      </View>

      {current ? (
        <>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "600" }}>{current.garminName}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Serie {doneSets + 1} de {current.planned.sets}</Text>
          <View style={{ alignSelf: "flex-start", backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: spacing.sm }}>
            <Text style={{ color: colors.accentText, fontSize: 11 }}>Objetivo {current.planned.sets}×{current.planned.reps} · {current.planned.targetLoad} · desc {current.planned.restSeconds}s</Text>
          </View>

          <Pressable
            testID="tap-rep"
            onPress={onTap}
            accessibilityRole="button"
            style={{ alignSelf: "center", width: 150, height: 150, borderRadius: 75, borderWidth: 3, borderColor: colors.accent, alignItems: "center", justifyContent: "center", marginVertical: spacing.md }}
          >
            <Text testID="rep-count" style={{ color: colors.text, fontSize: 44, fontWeight: "700" }}>{openSet?.reps ?? 0}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10 }}>TOCÁ EN CADA REP</Text>
          </Pressable>

          <View style={{ flexDirection: "row", gap: spacing.sm, justifyContent: "center", alignItems: "center" }}>
            <TextInput testID="weight" style={input} placeholder="kg" keyboardType="numeric" value={weight} onChangeText={setWeight} />
            <TextInput testID="rpe" style={input} placeholder="RPE" keyboardType="numeric" value={rpe} onChangeText={setRpe} />
          </View>

          <Pressable testID="end-set" onPress={onEndSet} style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
            <Text style={{ color: "#fff" }}>Terminar serie</Text>
          </Pressable>
          <Pressable testID="skip" onPress={onSkip} style={{ alignItems: "center" }}>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Saltar ejercicio</Text>
          </Pressable>

          {doneList.length > 0 && (
            <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Series hechas (tocá para corregir)</Text>
              {doneList.map((s) => (
                <View key={s.setNumber} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <Text style={{ color: colors.textMuted, fontSize: 12, width: 52 }}>Serie {s.setNumber}</Text>
                  <TextInput
                    testID={`edit-reps-${s.setNumber}`}
                    style={input}
                    keyboardType="numeric"
                    defaultValue={String(s.reps)}
                    onEndEditing={(e) => apply(editSet(sess, { exerciseOrder: current.order, setNumber: s.setNumber, reps: Number(e.nativeEvent.text) || 0 }))}
                  />
                  <TextInput
                    testID={`edit-weight-${s.setNumber}`}
                    style={input}
                    keyboardType="numeric"
                    defaultValue={s.weightKg == null ? "" : String(s.weightKg)}
                    onEndEditing={(e) => apply(editSet(sess, { exerciseOrder: current.order, setNumber: s.setNumber, weightKg: e.nativeEvent.text ? Number(e.nativeEvent.text) : null }))}
                  />
                </View>
              ))}
            </View>
          )}
        </>
      ) : (
        <Text style={{ color: colors.textMuted }}>No hay más ejercicios pendientes.</Text>
      )}

      <Pressable testID="finish" onPress={onFinish} style={{ borderWidth: 1, borderColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center", marginTop: spacing.lg }}>
        <Text style={{ color: colors.accentText }}>Terminar entrenamiento</Text>
      </Pressable>
    </ScrollView>
  );
}
