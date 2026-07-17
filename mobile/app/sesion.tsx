import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { WorkoutSession, SessionExercise, Equipment } from "@pulsia/shared";
import { alternativesFor, exerciseNameEs } from "@pulsia/shared";
import { getStoredProgram, setStoredProgram } from "../src/storage/program";
import { getStoredProgramId } from "../src/storage/programId";
import { getStoredOneOffProgram, getStoredOneOffProgramId, clearOneOff } from "../src/storage/oneOffProgram";
import { getBackendUrl } from "../src/storage/config";
import { getProfile } from "../src/storage/profile";
import { getLastWeights } from "../src/api/sessions";
import { getActiveSession, setActiveSession, clearActiveSession } from "../src/storage/activeSession";
import { getPauseState, setPauseState, clearPauseState, startPause, endPause, isPaused, totalPausedMs, type OpenPauseInterval } from "../src/storage/pauseState";
import { enqueueSession } from "../src/storage/pendingSessions";
import { syncPending } from "../src/sync/syncSessions";
import { startSession, tapRep, adjustReps, endSet, editSet, skipExercise, finishSession, closeOpenSets, discardOpenSets, setNotes, substituteExercise, substituteInProgram } from "../src/session/engine";
import { newSessionId } from "../src/session/id";
import { useHeartRate } from "../src/ble/useHeartRate";
import { aggregateHr } from "../src/ble/hrAggregate";
import { buildHrSeries } from "../src/session/hrSeries";
import { getSoundsEnabled } from "../src/storage/sounds";
import { restNotificationPlan, scheduleRestBell, cancelRestBell } from "../src/session/restNotification";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import { parsePlannedReps } from "../src/session/plannedReps";
import { colors, radius, spacing } from "../src/theme/tokens";
import { summarize } from "../src/session/summary";
import { SessionSummary } from "../src/components/SessionSummary";
import { NotesEditor } from "../src/components/NotesEditor";

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

// Fin de la última serie terminada de TODA la sesión (0 si no hay ninguna). Global y no por
// ejercicio: el usuario puede alternar entre ejercicios y una serie nueva nunca puede empezar
// antes de que haya terminado la anterior, sea del ejercicio que sea.
function lastSetEnd(s: WorkoutSession): number {
  return s.exercises.reduce(
    (acc, ex) => ex.sets.reduce((a, x) => (x.endedAt != null && x.endedAt > a ? x.endedAt : a), acc),
    0,
  );
}

// Instante en que nace una serie nueva. El modelo es "una serie empieza cuando termina el
// descanso anterior" (o al arrancar la sesión) → `ref` es setStartRef, que se actualiza en cada
// fin de descanso. El clamp contra la última serie terminada cubre el caso en que el usuario NO
// esperó la campana y tocó "Terminar serie" con el descanso todavía corriendo: ahí `ref` todavía
// apunta al descanso ANTERIOR, y sin el clamp la serie nueva re-contaría la serie previa entera
// más su descanso. Con el clamp, el descanso cortado a mano se atribuye a trabajo: la app no
// puede saber qué parte de esa ventana fue trabajo real, y el usuario demostró no estar
// descansando (completó una serie). Nunca inventa tiempo: Trabajo + Descanso = Total igual, ya
// que el descanso se deriva restando el trabajo del total (ver summary.ts).
function setStartFor(s: WorkoutSession, ref: number): number {
  return Math.max(ref, lastSetEnd(s));
}

export default function SesionScreen() {
  const params = useLocalSearchParams<{ week: string; dayLabel: string; location: string; oneOff?: string }>();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [weight, setWeight] = useState("");
  const [rpe, setRpe] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [finishError, setFinishError] = useState(false);
  const [finishedSession, setFinishedSession] = useState<WorkoutSession | null>(null);
  const [finishedNotes, setFinishedNotes] = useState("");
  const [activeOrder, setActiveOrder] = useState<number | null>(null);
  const [restUntil, setRestUntil] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickChoice, setPickChoice] = useState<{ catalogId: string; garminName: string } | null>(null);
  const [changeNote, setChangeNote] = useState("");
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [lastWeights, setLastWeights] = useState<Record<string, number>>({});
  const intervalsRef = useRef<OpenPauseInterval[]>([]); // intervalos de pausa (fuente de verdad)
  const restRemainingRef = useRef<number | null>(null); // ms restantes de descanso congelados al pausar
  const started = useRef(false);
  const oneOffRef = useRef(false);
  const setStartRef = useRef(Date.now());
  const mounted = useRef(true);
  const soundsEnabledRef = useRef(true);
  const [soundsEnabled, setSoundsEnabled] = useState(true);
  const [soundsLoaded, setSoundsLoaded] = useState(false);
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

  // La campana debe sonar POR ENCIMA de la música/podcast sin pausarlos (mixWithOthers), no
  // pedir foco exclusivo. Best-effort: si el modo de audio no se puede configurar, no bloquea
  // la sesión (la campana simplemente puede llegar a interrumpir el audio externo).
  useEffect(() => {
    void (async () => {
      try {
        await setAudioModeAsync({ interruptionMode: "mixWithOthers", playsInSilentMode: true });
      } catch {
        // ver comentario arriba
      }
    })();
  }, []);

  useEffect(() => {
    if (finishedSession) setFinishedNotes(finishedSession.notes);
  }, [finishedSession]);

  useEffect(() => {
    void getProfile().then((p) => {
      if (p) setEquipment(session?.location === "home" ? p.homeEquipment : p.gymEquipment);
    });
  }, [session?.location]);

  useEffect(() => {
    void getBackendUrl().then((url) => {
      if (url) getLastWeights(url).then(setLastWeights).catch(() => {});
    });
  }, []);

  // Al cambiar de ejercicio activo, cerrar y limpiar el picker de cambio: evita arrastrar una
  // alternativa/nota elegida para otro ejercicio y sustituir el equivocado.
  useEffect(() => {
    setShowPicker(false);
    setPickChoice(null);
    setChangeNote("");
  }, [activeOrder]);

  function apply(next: WorkoutSession) {
    setSession(next);
    void setActiveSession(next);
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    oneOffRef.current = params.oneOff === "true";
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
            intervalsRef.current = ps.intervals;
            setPaused(isPaused(ps.intervals));
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
      const program = oneOffRef.current ? await getStoredOneOffProgram() : await getStoredProgram();
      if (!mounted.current) return;
      if (!program) {
        router.replace("/");
        return;
      }
      // Sin programId real la sesión no puede sincronizar (FK en el backend). Volvemos a la home.
      const programId = oneOffRef.current ? await getStoredOneOffProgramId() : await getStoredProgramId();
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
      hr.resetFullLog(); // arranca el log de FC de sesión limpio (sobrevive los resets por-serie)
      setStartRef.current = Date.now();
      setActiveOrder(firstIncompleteOrder(s));
      apply(s);
    })();
  }, [params.week, params.dayLabel, params.location]);

  // Preferencia de sonidos: la leemos una vez al montar a un ref (sin re-render por tick).
  useEffect(() => {
    void getSoundsEnabled().then((v) => {
      soundsEnabledRef.current = v;
      setSoundsEnabled(v);
      setSoundsLoaded(true);
    });
  }, []);

  // Notif nativa de fin de descanso (suena con la app en background). Atada a `restUntil`:
  // se programa al haber descanso futuro y se cancela en el cleanup (skip/pausa/terminar/reprogramar).
  // Cambiar de ejercicio NO toca `restUntil` → la notif sobrevive (fix #4).
  useEffect(() => {
    // No programar hasta cargar la preferencia de sonidos: el default `true` podría agendar una
    // campana para un usuario que la tiene apagada durante la ventana async del getSoundsEnabled().
    if (!soundsLoaded) return;
    const plan = restNotificationPlan({ restUntil, soundsEnabled, now: Date.now() });
    if (!plan.schedule) return;
    let id: string | null = null;
    let cancelled = false;
    // Llamadas nativas best-effort: si programar/cancelar falla, la campana JS en foreground
    // sigue siendo el fallback; no dejamos una promesa rechazada sin manejar.
    void scheduleRestBell(plan.date)
      .then((nid) => {
        if (cancelled) void cancelRestBell(nid).catch(() => {});
        else id = nid;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (id) void cancelRestBell(id).catch(() => {});
    };
  }, [restUntil, soundsEnabled, soundsLoaded]);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Cuando el descanso cruza 0: limpiar y sonar la campana UNA sola vez (restDoneRef).
  useEffect(() => {
    if (restUntil == null) return;
    if (nowMs >= restUntil && !restDoneRef.current) {
      restDoneRef.current = true;
      // Fin del descanso = nacimiento de la serie siguiente. Usamos `restUntil` y no Date.now():
      // el descanso terminó exactamente ahí, mientras que el tick que lo detecta puede llegar
      // hasta 1s tarde (o mucho más si la app estuvo en background).
      setStartRef.current = restUntil;
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
        <NotesEditor value={finishedNotes} onChangeText={setFinishedNotes} onBlur={saveFinishedNotes} />
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
  // Nombre en español (principal) con fallback al inglés.
  const esName = (catalogId: string, en: string) => exerciseNameEs(catalogId) ?? en;
  // Ejercicio activo explícito: NO auto-avanza. Al terminar la última serie el ejercicio
  // sigue activo (editable). El avance es tocar otro ejercicio en la lista de abajo.
  const fallback = firstIncomplete(sess);
  const current =
    activeOrder != null ? sess.exercises.find((e) => e.order === activeOrder) ?? fallback : fallback;
  const openSet = current?.sets.find((s) => s.endedAt == null);
  const doneSets = current ? current.sets.filter((s) => s.endedAt != null).length : 0;
  const doneList = current ? current.sets.filter((s) => s.endedAt != null) : [];

  function onTap() {
    resumeIfPaused();
    if (!current) return;
    // Ejercicio ya completo (todas las series planificadas hechas y sin serie abierta):
    // no crear una serie fantasma. Para corregir están las filas "Series hechas".
    if (!openSet && doneSets >= current.planned.sets) return;
    // La serie ya nació cuando terminó el descanso anterior (setStartRef): NO pisar ese valor acá,
    // solo reiniciar los samples de HR de la serie nueva.
    if (!openSet) {
      hr.resetSamples();
    }
    apply(
      tapRep(sess, {
        exerciseOrder: current.order,
        setStartMs: setStartFor(sess, setStartRef.current),
        nowMs: Date.now(),
        initialReps: parsePlannedReps(current.planned.reps),
      }),
    );
  }

  function onEndSet() {
    resumeIfPaused();
    if (!current) return;
    // Sin serie abierta y ejercicio ya completo: no crear una serie fantasma.
    if (!openSet && doneSets >= current.planned.sets) return;
    // Si no se tocó ninguna rep, materializar la serie con las reps mostradas (las planificadas)
    // para que "Terminar serie" guarde directo (antes había que tocar +1/−1 primero).
    let base = sess;
    if (!openSet) {
      hr.resetSamples(); // serie instantánea: no arrastrar HR de la serie/descanso previos
      // La serie nació al terminar el descanso anterior (setStartRef); acá solo la materializamos.
      base = adjustReps(sess, {
        exerciseOrder: current.order,
        setStartMs: setStartFor(sess, setStartRef.current),
        delta: 0,
        initialReps: parsePlannedReps(current.planned.reps),
      });
    }
    // Aggregar DESPUÉS del reset: en el path instantáneo la serie queda sin HR (samples limpios).
    const { hrAvg, hrMax } = aggregateHr(hr.getSamples());
    apply(
      endSet(base, {
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
    resumeIfPaused();
    if (!current) return;
    // Ejercicio ya completo: no-op (mismo criterio que onTap).
    if (!openSet && doneSets >= current.planned.sets) return;
    // Igual que onTap: la serie ya empezó al terminar el descanso; solo reiniciamos el HR.
    if (!openSet) {
      hr.resetSamples();
    }
    apply(
      adjustReps(sess, {
        exerciseOrder: current.order,
        setStartMs: setStartFor(sess, setStartRef.current),
        delta,
        initialReps: parsePlannedReps(current.planned.reps),
      }),
    );
  }

  function onSkip() {
    if (!current) return;
    apply(skipExercise(sess, { exerciseOrder: current.order }));
  }

  // Cierra la serie abierta del ejercicio que se está dejando, en el instante del cambio.
  // Invariante que protege: las series no se solapan → workMs ≤ totalDurationMs.
  // Sin esto, una serie abandonada de A queda con endedAt=null y closeOpenSets (al finalizar) le
  // pone endedAt=finishTime: su durationMs abarca toda la sesión y se solapa con las series de B,
  // haciendo que el trabajo (suma de durationMs) supere el total. Elegimos la Opción A —cerrar
  // acá— antes que bloquear el tap en B: refleja la realidad (dejaste de trabajar en A al pasar a
  // B) sin taps muertos, y la duración de A queda tap→cambio, sin inventar tiempo. `openSet`/
  // `current` en este handler son los del ejercicio ACTIVO previo (el que se abandona).
  function closeOpenSetBeforeLeaving() {
    if (!current || !openSet) return;
    // Serie sin reps (caso borde: reps planificadas no parseables): descartar la serie fantasma.
    if (openSet.reps <= 0) {
      apply(discardOpenSets(sess, { exerciseOrder: current.order }));
      return;
    }
    // Con reps: cerrarla con peso/RPE/HR visibles (son del ejercicio que se deja) en este instante.
    const { hrAvg, hrMax } = aggregateHr(hr.getSamples());
    hr.resetSamples(); // el próximo ejercicio arranca con HR limpio
    apply(endSet(sess, { exerciseOrder: current.order, weightKg: parseNum(weight), rpe: parseNum(rpe), nowMs: Date.now(), hrAvg, hrMax }));
    setWeight("");
    setRpe("");
  }

  async function confirmChange() {
    if (!current || !pickChoice) return;
    apply(
      substituteExercise(sess, {
        order: current.order,
        newCatalogId: pickChoice.catalogId,
        newGarminName: pickChoice.garminName,
        note: changeNote,
      }),
    );
    // En un entreno puntual NO tocar el plan vigente: la sustitución vale solo para esta sesión
    // (el programa one-off se descarta al terminar/cancelar vía clearOneOff).
    if (!oneOffRef.current) {
      const prog = await getStoredProgram();
      if (prog) await setStoredProgram(substituteInProgram(prog, current.catalogId, pickChoice, changeNote));
    }
    setShowPicker(false);
    setPickChoice(null);
    setChangeNote("");
  }

  // Reanuda si la sesión estaba pausada (no-op si no lo estaba). Extraído del botón "Reanudar"
  // para poder dispararlo también desde cualquier interacción con las reps (tap/±reps/terminar
  // serie) mientras está pausada, sin duplicar la lógica.
  function resumeIfPaused() {
    if (!paused) return;
    const now = Date.now();
    intervalsRef.current = endPause(intervalsRef.current, now);
    setPaused(false);
    // Retomar el descanso con lo que le quedaba (el contador estaba congelado).
    if (restRemainingRef.current != null) {
      restDoneRef.current = false; // permitir que la campana suene una vez al cruzar 0
      setRestUntil(now + restRemainingRef.current);
      restRemainingRef.current = null;
    }
    void setPauseState({ sessionId: sess.id, intervals: intervalsRef.current });
  }

  function onPauseToggle() {
    if (paused) {
      resumeIfPaused();
      return;
    }
    // Pausar: abrir un intervalo nuevo.
    const now = Date.now();
    intervalsRef.current = startPause(intervalsRef.current, now);
    setPaused(true);
    // Congelar el descanso activo: guardar lo que resta y frenar el contador (así la campana
    // no dispara mientras está pausado).
    if (restUntil != null && restUntil > now) {
      restRemainingRef.current = restUntil - now;
      setRestUntil(null);
    }
    void setPauseState({ sessionId: sess.id, intervals: intervalsRef.current });
  }

  async function onFinish() {
    // Ninguna serie debe quedar con endedAt=null en el payload (ver closeOpenSets en el motor).
    const { hrAvg, hrMax } = aggregateHr(hr.getSamples());
    const now = Date.now();
    // Al terminar: cortar el descanso para que el efecto cancele la notif nativa programada
    // (el resumen se muestra en este mismo componente, no hay unmount que dispare el cleanup).
    restDoneRef.current = true;
    setRestUntil(null);
    // Cerrar el intervalo abierto (si la sesión estaba pausada) en `now`, y usarlo como fuente.
    const pauseIntervals = endPause(intervalsRef.current, now);
    const s = closeOpenSets(sess, { activeOrder: current?.order ?? null, weightKg: parseNum(weight), rpe: parseNum(rpe), nowMs: now, hrAvg, hrMax });
    // Curva de FC de toda la sesión (descansos incluidos): downsample del log completo del
    // BLE, adjuntado ANTES de finishSession para que sobreviva el spread de {...session}.
    const fullLog = hr.getFullLog();
    const sWithHr = fullLog.length > 0 ? { ...s, hrSeries: buildHrSeries(fullLog, s.startedAt) } : s;
    const done = finishSession(sWithHr, { nowMs: now, pauseIntervals });
    try {
      await enqueueSession(done);
      await clearActiveSession();
      await clearPauseState();
      if (oneOffRef.current) await clearOneOff();
    } catch {
      if (mounted.current) setFinishError(true);
      return; // no navegamos; la sesión sigue en activeSession para reintentar
    }
    const url = await getBackendUrl();
    if (url) void syncPending(url); // fire-and-forget; si falla queda en la cola
    // No navegamos: mostramos el resumen; "Listo" navega a la home.
    setFinishedSession(done);
  }

  async function saveFinishedNotes() {
    if (!finishedSession) return;
    const updated = setNotes(finishedSession, finishedNotes);
    setFinishedSession(updated);
    await enqueueSession(updated);
    const url = await getBackendUrl();
    if (url) void syncPending(url);
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
            if (oneOffRef.current) await clearOneOff();
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
            ⏱ {fmt(nowMs - session.startedAt - totalPausedMs(intervalsRef.current, nowMs))}
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
                  // Cambiar de ejercicio activo NO corta el descanso/campana en curso: el usuario
                  // puede navegar entre ejercicios mientras descansa y la cuenta regresiva (y su
                  // campana) siguen corriendo en segundo plano.
                  // Antes de cambiar: cerrar la serie abierta del ejercicio que se deja, para que no
                  // se solape con lo que se trabaje en el siguiente (ver closeOpenSetBeforeLeaving).
                  if (current && e.order !== current.order) closeOpenSetBeforeLeaving();
                  setActiveOrder(e.order);
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
                  {esName(e.catalogId, e.garminName)}
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
          <Pressable
            testID="skip-rest"
            onPress={() => {
              restDoneRef.current = true;
              // Saltar el descanso lo termina ahora → la serie siguiente nace en este instante.
              setStartRef.current = Date.now();
              setRestUntil(null);
            }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Saltar descanso</Text>
          </Pressable>
        </View>
      )}

      {current ? (
        <>
          <Text testID="active-exercise-name" style={{ color: colors.text, fontSize: 18, fontWeight: "600" }}>
            {esName(current.catalogId, current.garminName)}
          </Text>
          {esName(current.catalogId, current.garminName) !== current.garminName && (
            <Text testID="active-exercise-name-en" style={{ color: colors.textMuted, fontSize: 12 }}>{current.garminName}</Text>
          )}
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
            <Text testID="rep-count" style={{ color: colors.text, fontSize: 44, fontWeight: "700" }}>{openSet?.reps ?? parsePlannedReps(current.planned.reps)}</Text>
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

          <View style={{ flexDirection: "row", gap: spacing.sm, justifyContent: "center", alignItems: "flex-start" }}>
            <View style={{ alignItems: "center", gap: 2 }}>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>Peso (kg)</Text>
              <TextInput testID="weight" style={input} placeholder="kg" keyboardType="numeric" value={weight} onChangeText={setWeight} />
              {current && lastWeights[current.catalogId] != null && (
                <Pressable
                  testID="weight-suggestion"
                  onPress={() => setWeight(String(lastWeights[current.catalogId]))}
                  hitSlop={6}
                >
                  <Text style={{ color: colors.accentText, fontSize: 12 }}>Sugerido: {lastWeights[current.catalogId]} kg</Text>
                </Pressable>
              )}
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
          <Pressable
            testID="cambiar-ejercicio"
            onPress={() => setShowPicker((v) => !v)}
            style={{ alignItems: "center", paddingVertical: spacing.sm }}
          >
            <Text style={{ color: colors.accentText, fontSize: 13, fontWeight: "600" }}>Cambiar ejercicio</Text>
          </Pressable>
          {showPicker && (
            <View style={{ gap: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.sm }}>
              {(() => {
                const alts = alternativesFor(current.catalogId, equipment);
                if (alts.length === 0) {
                  return <Text style={{ color: colors.textMuted, fontSize: 12 }}>No hay alternativas con tu equipo — podés saltar el ejercicio.</Text>;
                }
                return alts.map((e) => (
                  <Pressable
                    key={e.id}
                    testID={`alt-${e.id}`}
                    onPress={() => setPickChoice({ catalogId: e.id, garminName: e.garminName })}
                    style={{ paddingVertical: spacing.xs }}
                  >
                    <Text style={{ color: pickChoice?.catalogId === e.id ? colors.accent : colors.text, fontSize: 14 }}>
                      {esName(e.id, e.garminName)}
                    </Text>
                  </Pressable>
                ));
              })()}
              <TextInput
                testID="cambio-nota"
                value={changeNote}
                onChangeText={setChangeNote}
                placeholder="Motivo (ej.: no tengo barra)"
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={300}
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.sm, color: colors.text, minHeight: 44 }}
              />
              <Pressable
                testID="confirmar-cambio"
                disabled={!pickChoice}
                onPress={confirmChange}
                style={{ backgroundColor: pickChoice ? colors.accent : colors.border, borderRadius: radius.sm, paddingVertical: spacing.sm, alignItems: "center" }}
              >
                <Text style={{ color: "#fff", fontWeight: "600" }}>Confirmar cambio</Text>
              </Pressable>
            </View>
          )}

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

      <NotesEditor value={sess.notes} onChangeText={(t) => apply(setNotes(sess, t))} />

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
