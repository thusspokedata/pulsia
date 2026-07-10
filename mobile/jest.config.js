module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest-setup.ts"],
  // Patrón compatible con el store de Bun (node_modules/.bun/<pkg>@<ver>/node_modules/...):
  // se transpila cualquier archivo cuyo path CONTENGA uno de estos paquetes, sin importar el prefijo.
  transformIgnorePatterns: [
    "node_modules/(?!.*(?:(jest-)?react-native|@react-native|expo|@expo|react-navigation|@react-navigation|@unimodules|unimodules|sentry-expo|native-base|@tanstack))",
  ],
  // `@pulsia/shared` vive fuera de mobile/node_modules (workspace en ../shared/src).
  // Babel inyecta helpers de @babel/runtime (p.ej. destructuring de arrays en algunos
  // schemas de zod con .refine()) que Node no puede resolver desde esa ruta con el
  // layout de store de Bun (no es ancestro de mobile/node_modules). Se fuerza la
  // resolución al @babel/runtime de mobile explícitamente.
  moduleNameMapper: {
    "^@babel/runtime/(.*)$": "<rootDir>/node_modules/@babel/runtime/$1",
  },
};
