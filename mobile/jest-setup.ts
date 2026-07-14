// RNTL v14 trae los matchers integrados (ya no existe el subpath /extend-expect).

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// `expo-secure-store` es un módulo nativo: en jest no existe. Mock por defecto (sin token);
// los tests que necesiten un token mockean directamente `src/storage/authToken`.
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

// Safe-area: sin provider nativo en jest. El mock oficial devuelve insets en cero,
// así que las pantallas que usan useScreenPadding renderizan sin depender de un provider.
jest.mock("react-native-safe-area-context", () =>
  require("react-native-safe-area-context/jest/mock").default,
);
