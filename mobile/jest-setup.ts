// RNTL v14 trae los matchers integrados (ya no existe el subpath /extend-expect).

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
