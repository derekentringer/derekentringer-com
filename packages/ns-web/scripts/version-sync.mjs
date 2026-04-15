#!/usr/bin/env node
/**
 * Syncs package.json version from the latest git tag.
 * Falls back gracefully if git tags are unavailable (e.g., Railway shallow clone).
 * Runs before Vite build so the version is available at build time.
 */
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_PATH = resolve(__dirname, "../package.json");

try {
  const version = execSync("git describe --tags --abbrev=0").toString().trim().replace(/^v/, "");
  const pkg = JSON.parse(readFileSync(PKG_PATH, "utf-8"));
  if (pkg.version !== version) {
    pkg.version = version;
    writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + "\n");
    console.log(`[version-sync] Updated package.json to ${version}`);
  } else {
    console.log(`[version-sync] Already at ${version}`);
  }
} catch {
  console.log("[version-sync] Git tags unavailable, keeping current package.json version.");
}
