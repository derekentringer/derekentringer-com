#!/usr/bin/env node
/**
 * Syncs package.json version to the release version at build time.
 *
 * Resolution order:
 *   1. `APP_VERSION` env var (Railway can set this from the GitHub release tag
 *      via Railway's `RAILWAY_GIT_COMMIT_SHA`-style pattern or a manual
 *      dashboard config).
 *   2. `git describe --tags --abbrev=0` (local dev + CI with full clone).
 *   3. Fall through: keep whatever's in package.json.
 *
 * The env-var fallback exists because Railway does shallow clones without
 * tags, which made (2) silently noop and stamped the UI with whatever stale
 * version happened to be committed to package.json.
 */
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_PATH = resolve(__dirname, "../package.json");

function resolveVersion() {
  const envVersion = (process.env.APP_VERSION ?? "").trim().replace(/^v/, "");
  if (envVersion) {
    console.log(`[version-sync] Using APP_VERSION env var: ${envVersion}`);
    return envVersion;
  }
  try {
    const tagVersion = execSync("git describe --tags --abbrev=0").toString().trim().replace(/^v/, "");
    console.log(`[version-sync] Using git tag: ${tagVersion}`);
    return tagVersion;
  } catch {
    console.log("[version-sync] No APP_VERSION env var and no git tags — keeping current package.json version.");
    return null;
  }
}

const version = resolveVersion();
if (version) {
  const pkg = JSON.parse(readFileSync(PKG_PATH, "utf-8"));
  if (pkg.version !== version) {
    pkg.version = version;
    writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + "\n");
    console.log(`[version-sync] Updated package.json to ${version}`);
  } else {
    console.log(`[version-sync] Already at ${version}`);
  }
}
