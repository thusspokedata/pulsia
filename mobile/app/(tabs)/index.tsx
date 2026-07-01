import { useCallback, useMemo, useRef, useState } from "react";
import { ScrollView, View, Text } from "react-native";
import { Link, useFocusEffect } from "expo-router";
import { getStoredProgram } from "../../src/storage/program";
import type { Program } from "@pulsia/shared";
import { WeekTabs } from "../../src/components/WeekTabs";
import { SegmentToggle } from "../../src/components/SegmentToggle";
import { WorkoutDayCard } from "../../src/components/WorkoutDayCard";
import { colors, spacing } from "../../src/theme/tokens";

export default function ProgramaScreen() {
  const [program, setProgram] = useState<Program | null>(null);
  const [week, setWeek] = useState(1);
  const [location, setLocation] = useState("gym");
  const lastLoaded = useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getStoredProgram().then((p) => {
        if (!active) return;
        const serialized = p ? JSON.stringify(p) : null;
        if (serialized === lastLoaded.current) return;
        lastLoaded.current = serialized;
        setProgram(p);
        if (p && !p.weeks.some((w) => w.weekNumber === week)) setWeek(p.weeks[0]?.weekNumber ?? 1);
      });
      return () => {
        active = false;
      };
    }, [week]),
  );

  const currentWeek = useMemo(() => program?.weeks.find((w) => w.weekNumber === week), [program, week]);
  const days = useMemo(() => currentWeek?.workouts.filter((w) => w.location === location) ?? [], [currentWeek, location]);

  if (!program) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.md }}>
        <Text style={{ fontSize: 20, fontWeight: "500", color: colors.text }}>Programa</Text>
        <Text style={{ color: colors.textMuted }}>Todavía no hay un programa. Configurá el backend y generá uno desde Perfil.</Text>
        <Link href="/configuracion" style={{ color: colors.accent }}><Text>Ir a configuración</Text></Link>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
      <Text style={{ fontSize: 20, fontWeight: "500", color: colors.text }}>{program.name}</Text>
      <WeekTabs weeks={program.weeks.map((w) => w.weekNumber)} selected={week} onSelect={setWeek} />
      <SegmentToggle options={[{ value: "gym", label: "Gimnasio" }, { value: "home", label: "Casa" }]} value={location} onChange={setLocation} />
      {days.length === 0 ? (
        <Text style={{ color: colors.textMuted }}>No hay días para esta selección.</Text>
      ) : (
        days.map((w, i) => <WorkoutDayCard key={`${w.dayLabel}-${i}`} workout={w} />)
      )}
    </ScrollView>
  );
}
