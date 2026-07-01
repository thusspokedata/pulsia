module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest-setup.ts"],
  // Patrón compatible con el store de Bun (node_modules/.bun/<pkg>@<ver>/node_modules/...):
  // se transpila cualquier archivo cuyo path CONTENGA uno de estos paquetes, sin importar el prefijo.
  transformIgnorePatterns: [
    "node_modules/(?!.*(?:(jest-)?react-native|@react-native|expo|@expo|react-navigation|@react-navigation|@unimodules|unimodules|sentry-expo|native-base|@tanstack))",
  ],
};
