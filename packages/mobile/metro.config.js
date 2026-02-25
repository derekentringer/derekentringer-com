const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

console.log("[metro.config.js] __dirname:", __dirname);
console.log("[metro.config.js] projectRoot:", projectRoot);
console.log("[metro.config.js] resolved projectRoot:", path.resolve(projectRoot));
console.log("[metro.config.js] workspaceRoot:", workspaceRoot);

const config = getDefaultConfig(projectRoot);
console.log("[metro.config.js] config.projectRoot:", config.projectRoot);

// Only watch specific workspace directories needed for development,
// NOT the entire workspace root (which confuses metro's entry point resolution
// when the mobile package is nested under packages/).
config.watchFolders = [
  path.resolve(workspaceRoot, "packages/shared"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Resolve modules from both local and root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

config.resolver.disableHierarchicalLookup = false;

module.exports = config;
