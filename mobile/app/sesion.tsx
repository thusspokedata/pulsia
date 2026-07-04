import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { WorkoutSession, SessionExercise } from "@pulsia/shared";
import { getStoredProgram } from "../src/storage/program";
import { getStoredProgramId } from "../src/storage/programId";
import { getBackendUrl } from "../src/storage/config";
import { getActiveSession, setActiveSession, clearActiveSession } from "../src/storage/activeSession";
import { getPauseState, setPauseState, clearPauseState } from "../src/storage/pauseState";
import { enqueueSession } from "../src/storage/pendingSessions";
import { syncPending } from "../src/sync/syncSessions";
import { startSession, tapRep, adjustReps, endSet, editSet, skipExercise, finishSession, closeOpenSets } from "../src/session/engine";
import { newSessionId } from "../src/session/id";
import { useHeartRate } from "../src/ble/useHeartRate";
import { aggregateHr } from "../src/ble/hrAggregate";
import { getSoundsEnabled } from "../src/storage/sounds";
import { useAudioPlayer } from "expo-audio";
import { colors, radius, spacing } from "../src/theme/tokens";
import { summarize } from "../src/session/summary";
import { SessionSummary } from "../src/components/SessionSummary";

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function hrLabel(status: string): string {
  if (status === "no-band") return "sin banda";
  if (status === "connecting") return "buscando…";
  if (status === "disconnected") return "sin señal";
  return "—";
}

// Parseo numérico NaN-safe: texto vacío o no numérico → null (no guarda "NaN").
function parseNum(text: string): number | null {
  if (!text) return null;
  const n = Number(text);
  return Number.isNaN(n) ? null : n;
}

// Primer ejercicio no saltado con series incompletas (o undefined si no hay ninguno).
function firstIncomplete(s: WorkoutSession): SessionExercise | undefined {
  return s.exercises.find(
    (e) => !e.skipped && e.sets.filter((x) => x.endedAt != null).length < e.planned.sets,
  );
}

// Orden del primer ejercicio incompleto; 0 si no hay ninguno.
function firstIncompleteOrder(s: WorkoutSession): number {
  return firstIncomplete(s)?.order ?? 0;
}

export default function SesionScreen() {
  const params = useLocalSearchParams<{ week: string; dayLabel: string; location: string }>();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [weight, setWeight] = useState("");
  const [rpe, setRpe] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [finishError, setFinishError] = useState(false);
  const [finishedSession, setFinishedSession] = useState<WorkoutSession | null>(null);
  const [activeOrder, setActiveOrder] = useState<number | null>(null);
  const [restUntil, setRestUntil] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedMsRef = useRef(0); // tiempo pausado acumulado (ms)
  const pauseStartedRef = useRef(0); // Date.now() del inicio de la pausa en curso
  const restRemainingRef = useRef<number | null>(null); // ms restantes de descanso congelados al pausar
  const started = useRef(false);
  const setStartRef = useRef(Date.now());
  const mounted = useRef(true);
  const soundsEnabledRef = useRef(true);
  const restDoneRef = useRef(false);
  const bell = useAudioPlayer(require("../assets/bell.wav"));
  const hr = useHeartRate();
  const hrStarted = useRef(false);
  useEffect(() => {
    if (hrStarted.current) return;
    hrStarted.current = true;
    void hr.connect();
  }, [hr]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function apply(next: WorkoutSession) {
    setSession(next);
    void setActiveSession(next);
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const wantDay = params.dayLabel ? String(params.dayLabel) : null;
      const wantLocation = params.location === "home" ? "home" : "gym";
      const wantWeek = params.week != null ? Number(params.week) : null;

      const active = await getActiveSession();
      if (!mounted.current) return;
      if (active) {
        // Reanudar solo si coincide con lo pedido, o si se entró sin día (banner "continuar").
        const matches =
          !wantDay ||
          (active.dayLabel === wantDay &&
            active.location === wantLocation &&
            (wantWeek == null || active.weekNumber === wantWeek));
        if (matches) {
          // Restaurar el estado de pausa persistido (sobrevive remontaje / reinicio de app):
          // si no, el tiempo fuera de la pantalla se contaría como entrenamiento activo.
          const ps = await getPauseState();
          if (!mounted.current) return;
          if (ps && ps.sessionId === active.id) {
            pausedMsRef.current = ps.pausedMs;
            if (ps.pausedAt != null) {
              // La sesión quedó pausada: el tiempo desde pausedAt hasta ahora cuenta como pausa.
              pauseStartedRef.current = ps.pausedAt;
              setPaused(true);
            } else {
              setPaused(false);
            }
          }
          setSession(active);
          setActiveOrder(firstIncompleteOrder(active));
          return;
        }
        // Hay una sesión activa de OTRO día: no la pisamos ni la resumimos en silencio.
        // Volvemos a la home, donde el banner permite continuar la que está en curso.
        router.replace("/");
        return;
      }

      // Sin un día concreto no se puede armar la sesión (deep link viejo / bug del caller).
      if (!wantDay) {
        router.replace("/");
        return;
      }
      const program = await getStoredProgram();
      if (!mounted.current) return;
      if (!program) {
        router.replace("/");
        return;
      }
      // Sin programId real la sesión no puede sincronizar (FK en el backend). Volvemos a la home.
      const programId = await getStoredProgramId();
      if (!mounted.current) return;
      if (!programId) {
        router.replace("/");
        return;
      }
      const s = startSession({
        program,
        programId,
        weekNumber: wantWeek ?? 1,
        dayLabel: wantDay,
        location: wantLocation,
        id: newSessionId(),
        nowMs: Date.now(),
      });
      setStartRef.current = Date.now();
      setActiveOrder(firstIncompleteOrder(s));
      apply(s);
    })();
  }, [params.week, params.dayLabel, params.location]);

  // Preferencia de sonidos: la leemos una vez al montar a un ref (sin re-render por tick).
  useEffect(() => {
    void getSoundsEnabled().then((v) => {
      soundsEnabledRef.current = v;
    });
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Cuando el descanso cruza 0: limpiar y sonar la campana UNA sola vez (restDoneRef).
  useEffect(() => {
    if (restUntil == null) return;
    if (nowMs >= restUntil && !restDoneRef.current) {
      restDoneRef.current = true;
      setRestUntil(null);
      if (soundsEnabledRef.current) {
        try {
          bell.seekTo(0);
          bell.play();
        } catch {
          // reproducción de audio best-effort; no bloquea la sesión
        }
      }
    }
  }, [nowMs, restUntil, bell]);

  const input = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.sm,
    color: colors.text,
    minWidth: 70,
    textAlign: "center",
  } as const;

  if (finishedSession) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
        <SessionSummary summary={summarize(finishedSession)} />
        <Pressable
          testID="summary-done"
          onPress={() => router.replace("/")}
          style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center", marginTop: spacing.md }}
        >
          <Text style={{ color: "#fff" }}>Listo</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.textMuted }}>Preparando la sesión…</Text>
      </View>
    );
  }

  const sess = session; // narrowed a WorkoutSession (los handlers son closures y no estrechan `session`)
  // Ejercicio activo explícito: NO auto-avanza. Al terminar la última serie el ejercicio
  // sigue activo (editable). El avance es tocar otro ejercicio en la lista de abajo.
  const fallback = firstIncomplete(sess);
  const current =
    activeOrder != null ? sess.exercises.find((e) => e.order === activeOrder) ?? fallback : fallback;
  const openSet = current?.sets.find((s) => s.endedAt == null);
  const doneSets = current ? current.sets.filter((s) => s.endedAt != null).length : 0;
  const doneList = current ? current.sets.filter((s) => s.endedAt != null) : [];

  function onTap() {
    if (!current) return;
    // Ejercicio ya completo (todas las series planificadas hechas y sin serie abierta):
    // no crear una serie fantasma. Para corregir están las filas "Series hechas".
    if (!openSet && doneSets >= current.planned.sets) return;
    if (!openSet) {
      setStartRef.current = Date.now();
      hr.resetSamples();
    }
    apply(tapRep(sess, { exerciseOrder: current.order, setStartMs: setStartRef.current, nowMs: Date.now() }));
  }

  function onEndSet() {
    if (!current) return;
    const { hrAvg, hrMax } = aggregateHr(hr.getSamples());
    apply(
      endSet(sess, {
        exerciseOrder: current.order,
        weightKg: parseNum(weight),
        rpe: parseNum(rpe),
        nowMs: Date.now(),
        hrAvg,
        hrMax,
      }),
    );
    setWeight("");
    setRpe("");
    // Arranca el descanso con cuenta regresiva; la campana suena al cruzar 0.
    restDoneRef.current = false;
    setRestUntil(Date.now() + current.planned.restSeconds * 1000);
  }

  function onAdjustReps(delta: number) {
    if (!current) return;
    // Ejercicio ya completo: no-op (mismo criterio que onTap).
    if (!openSet && doneSets >= current.planned.sets) return;
    if (!openSet) {
      setStartRef.current = Date.now();
      hr.resetSamples();
    }
    apply(adjustReps(sess, { exerciseOrder: current.order, setStartMs: setStartRef.current, delta }));
  }

  function onSkip() {
    if (!current) return;
    apply(skipExercise(sess, { exerciseOrder: current.order }));
  }

  function onPauseToggle() {
    const now = Date.now();
    if (paused) {
      // Reanudar: acumular la duración de la pausa en curso.
      pausedMsRef.current += now - pauseStartedRef.current;
      setPaused(false);
      // Retomar el descanso con lo que le quedaba (el contador estaba congelado).
      if (restRemainingRef.current != null) {
        restDoneRef.current = false; // permitir que la campana suene una vez al cruzar 0
        setRestUntil(now + restRemainingRef.current);
        restRemainingRef.current = null;
      }
      void setPauseState({ sessionId: sess.id, pausedMs: pausedMsRef.current, pausedAt: null });
    } else {
      // Pausar: marcar el inicio de la pausa.
      pauseStartedRef.current = now;
      setPaused(true);
      // Congelar el descanso activo: guardar lo que resta y frenar el contador (así la campana
      // no dispara mientras está pausado).
      if (restUntil != null && restUntil > now) {
        restRemainingRef.current = restUntil - now;
        setRestUntil(null);
      }
      void setPauseState({ sessionId: sess.id, pausedMs: pausedMsRef.current, pausedAt: now });
    }
  }

  async function onFinish() {
    // Ninguna serie debe quedar con endedAt=null en el payload (ver closeOpenSets en el motor).
    const { hrAvg, hrMax } = aggregateHr(hr.getSamples());
    const now = Date.now();
    // Tiempo pausado total: acumulado + una pausa en curso (si la hay) hasta ahora.
    const pausedMs = pausedMsRef.current + (paused ? now - pauseStartedRef.current : 0);
    const s = closeOpenSets(sess, { activeOrder: current?.order ?? null, weightKg: parseNum(weight), rpe: parseNum(rpe), nowMs: now, hrAvg, hrMax });
    const done = finishSession(s, { nowMs: now, pausedMs });
    try {
      await enqueueSession(done);
      await clearActiveSession();
      await clearPauseState();
    } catch {
      if (mounted.current) setFinishError(true);
      return; // no navegamos; la sesión sigue en activeSession para reintentar
    }
    const url = await getBackendUrl();
    if (url) void syncPending(url); // fire-and-forget; si falla queda en la cola
    // No navegamos: mostramos el resumen; "Listo" navega a la home.
    setFinishedSession(done);
  }

  function onCancel() {
    Alert.alert(
      "Cancelar entrenamiento",
      "¿Seguro que querés cancelarlo? Se perderá lo registrado.",
      [
        { text: "No", style: "cancel" },
        {
          text: "Sí, cancelar",
          style: "destructive",
          onPress: async () => {
            await clearActiveSession();
            await clearPauseState();
            router.replace("/");
          },
        },
      ],
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.xl, gap: spacing.md }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm }}>
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>{session.dayLabel}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flexShrink: 0 }}>
          {paused && <Text style={{ color: colors.accentText, fontSize: 12 }}>⏸ Pausado</Text>}
          <Text style={{ color: colors.text, fontSize: 12 }}>
            ⏱ {fmt(nowMs - session.startedAt - pausedMsRef.current - (paused ? nowMs - pauseStartedRef.current : 0))}
          </Text>
          <Pressable
            testID="pause-toggle"
            onPress={onPauseToggle}
            hitSlop={8}
            style={{ borderWidth: 1, borderColor: colors.accent, borderRadius: radius.sm, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm }}
          >
            <Text style={{ color: colors.accentText, fontSize: 12, fontWeight: "600" }}>{paused ? "Reanudar" : "Pausar"}</Text>
          </Pressable>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm }}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>♥ HR</Text>
        <Text testID="hr-value" style={{ color: hr.bpm != null ? colors.accent : colors.textMuted, fontSize: 16 }}>
          {hr.bpm != null ? hr.bpm : hrLabel(hr.status)}
        </Text>
      </View>

      <View style={{ gap: spacing.xs }}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>Ejercicios</Text>
        {[...sess.exercises]
          .sort((a, b) => a.order - b.order)
          .map((e) => {
            const done = e.sets.filter((s) => s.endedAt != null).length;
            const completed = done >= e.planned.sets;
            const isActive = current?.order === e.order;
            return (
              <Pressable
                key={e.order}
                testID={`ex-item-${e.order}`}
                onPress={() => {
                  setActiveOrder(e.order);
                  // Cortar el descanso/campana del ejercicio anterior al cambiar (incluido uno
                  // congelado por pausa, para que no reaparezca al reanudar).
                  setRestUntil(null);
                  restRemainingRef.current = null;
                  restDoneRef.current = true;
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderWidth: 1,
                  borderColor: isActive ? colors.accent : colors.border,
                  backgroundColor: isActive ? colors.accentSoft : colors.bg,
                  borderRadius: radius.sm,
                  padding: spacing.sm,
                }}
              >
                <Text style={{ color: isActive ? colors.accentText : colors.text, fontSize: 13, flexShrink: 1 }}>
                  {e.garminName}
                  {e.skipped ? " (saltado)" : ""}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {done}/{e.planned.sets}
                  {completed ? " ✓" : ""}
                </Text>
              </Pressable>
            );
          })}
      </View>

      {restUntil != null && restUntil > nowMs && (
        <View testID="rest-timer" style={{ alignItems: "center", backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs }}>
          <Text style={{ color: colors.accentText, fontSize: 12 }}>Descanso</Text>
          <Text style={{ color: colors.accentText, fontSize: 32, fontWeight: "700" }}>{fmt(Math.max(0, restUntil - nowMs))}</Text>
          <Pressable testID="skip-rest" onPress={() => { restDoneRef.current = true; setRestUntil(null); }}>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Saltar descanso</Text>
          </Pressable>
        </View>
      )}

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
            {[
              { label: "−5", delta: -5 },
              { label: "−1", delta: -1 },
              { label: "+1", delta: 1 },
              { label: "+5", delta: 5 },
            ].map((b) => (
              <Pressable
                key={b.label}
                testID={`reps-${b.delta}`}
                onPress={() => onAdjustReps(b.delta)}
                style={{ borderWidth: 1, borderColor: colors.accent, borderRadius: radius.sm, paddingVertical: spacing.xs, paddingHorizontal: spacing.md }}
              >
                <Text style={{ color: colors.accentText, fontSize: 16 }}>{b.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={{ flexDirection: "row", gap: spacing.sm, justifyContent: "center", alignItems: "flex-end" }}>
            <View style={{ alignItems: "center", gap: 2 }}>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>Peso (kg)</Text>
              <TextInput testID="weight" style={input} placeholder="kg" keyboardType="numeric" value={weight} onChangeText={setWeight} />
            </View>
            <View style={{ alignItems: "center", gap: 2 }}>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>RPE</Text>
              <TextInput testID="rpe" style={input} placeholder="RPE" keyboardType="numeric" value={rpe} onChangeText={setRpe} />
            </View>
          </View>

          <Pressable testID="end-set" onPress={onEndSet} style={{ backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Terminar serie</Text>
          </Pressable>
          <Pressable testID="skip" onPress={onSkip} hitSlop={8} style={{ alignItems: "center", paddingVertical: spacing.sm }}>
            <Text style={{ color: colors.accentText, fontSize: 13, fontWeight: "600" }}>Saltar ejercicio</Text>
          </Pressable>

          {doneList.length > 0 && (
            <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Series hechas (tocá para corregir)</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Text style={{ color: colors.textMuted, fontSize: 11, width: 52 }} />
                <Text style={{ color: colors.textMuted, fontSize: 11, minWidth: 70, textAlign: "center" }}>reps</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, minWidth: 70, textAlign: "center" }}>kg</Text>
              </View>
              {doneList.map((s) => (
                <View key={s.setNumber} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <Text style={{ color: colors.textMuted, fontSize: 12, width: 52 }}>Serie {s.setNumber}</Text>
                  <TextInput
                    testID={`edit-reps-${s.setNumber}`}
                    style={input}
                    placeholder="reps"
                    keyboardType="numeric"
                    defaultValue={String(s.reps)}
                    onEndEditing={(e) => apply(editSet(sess, { exerciseOrder: current.order, setNumber: s.setNumber, reps: parseNum(e.nativeEvent.text) ?? 0 }))}
                  />
                  <TextInput
                    testID={`edit-weight-${s.setNumber}`}
                    style={input}
                    placeholder="kg"
                    keyboardType="numeric"
                    defaultValue={s.weightKg == null ? "" : String(s.weightKg)}
                    onEndEditing={(e) => apply(editSet(sess, { exerciseOrder: current.order, setNumber: s.setNumber, weightKg: parseNum(e.nativeEvent.text) }))}
                  />
                </View>
              ))}
            </View>
          )}
        </>
      ) : (
        <Text style={{ color: colors.textMuted }}>No hay más ejercicios pendientes.</Text>
      )}

      {/* Acciones de sesión, separadas de las acciones de la serie en curso. */}
      <View style={{ height: 1, backgroundColor: colors.border, marginTop: spacing.lg }} />
      <Pressable testID="finish" onPress={onFinish} style={{ borderWidth: 1.5, borderColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center", marginTop: spacing.lg }}>
        <Text style={{ color: colors.accentText, fontSize: 15, fontWeight: "700" }}>Terminar entrenamiento</Text>
      </Pressable>
      {finishError && (
        <Text testID="finish-error" style={{ color: colors.danger, fontSize: 12, textAlign: "center" }}>
          No se pudo guardar la sesión. Reintentá.
        </Text>
      )}
      <Pressable testID="cancel" onPress={onCancel} hitSlop={8} style={{ alignItems: "center", paddingVertical: spacing.sm }}>
        <Text style={{ color: colors.danger, fontSize: 13, fontWeight: "600" }}>Cancelar entrenamiento</Text>
      </Pressable>
    </ScrollView>
  );
}
