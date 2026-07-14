import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScreenPadding } from "../src/theme/screen";
import { spacing } from "../src/theme/tokens";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: jest.fn() }));

const mockInsets = useSafeAreaInsets as jest.Mock;

// Ejecuta el hook fuera de un render: `useSafeAreaInsets` está mockeado como una
// función pura, así que el hook no depende de las reglas de hooks de React acá.
function callHook(base: number) {
  return useScreenPadding(base);
}

test("suma los insets del dispositivo al padding base (status bar arriba, nav bar abajo)", () => {
  mockInsets.mockReturnValue({ top: 48, bottom: 24, left: 0, right: 0 });
  const pad = callHook(spacing.lg);
  expect(pad.paddingTop).toBe(spacing.lg + 48);
  expect(pad.paddingBottom).toBe(spacing.lg + 24);
  // El padding lateral no depende de los insets verticales.
  expect(pad.paddingHorizontal).toBe(spacing.lg);
});

test("sin insets (pantalla completa sin barras) queda solo el padding base", () => {
  mockInsets.mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 });
  const pad = callHook(spacing.xl);
  expect(pad.paddingTop).toBe(spacing.xl);
  expect(pad.paddingBottom).toBe(spacing.xl);
});
