import { useLocalSearchParams, Stack } from "expo-router";
import { ExerciseDetail } from "../../src/components/ExerciseDetail";

export default function EjercicioScreen() {
  const { catalogId } = useLocalSearchParams<{ catalogId: string }>();
  return (
    <>
      <Stack.Screen options={{ title: "Cómo se hace" }} />
      <ExerciseDetail catalogId={String(catalogId)} />
    </>
  );
}
