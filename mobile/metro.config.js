const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// NO deshabilitamos hierarchical lookup: con el store de Bun (node_modules/.bun/<pkg>@<ver>/...)
// Metro necesita poder subir por el árbol para resolver deps transitivas anidadas.

module.exports = config;
