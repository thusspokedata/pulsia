import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing } from "./tokens";

// Padding de contenido para pantallas SIN header (Stack con headerShown:false):
// su contenido arranca en y=0, o sea debajo de la barra de estado arriba y de la
// barra de navegación abajo. Suma los insets del dispositivo al padding base para
// que nada quede tapado. Usar en el contentContainerStyle de un ScrollView headerless.
export function useScreenPadding(base: number = spacing.lg) {
  const insets = useSafeAreaInsets();
  return {
    paddingTop: base + insets.top,
    paddingBottom: base + insets.bottom,
    paddingHorizontal: base,
  } as const;
}
