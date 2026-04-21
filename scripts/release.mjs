#!/usr/bin/env node
// Release helper — invoked as `npm run release -- <major.minor.patch>`.
//
// Why this exists:
//   - Railway's shallow clone can't resolve `git describe`, so ns-web
//     falls back to `packages/ns-web/package.json` for the version it
//     shows in Settings → About. That file has to be bumped BEFORE the
//     tag lands, or prod will keep showing the prior version.
//   - Every release also wants: an annotated tag on main, a push of
//     both main and the tag, and a main→develop merge so gitflow stays
//     aligned. Collapsing those 5 steps into one command removes the
//     "I forgot to bump ns-web" failure mode.
//
// Flow:
//   1. Verify we're on main, clean, and in sync with origin/main.
//   2. Verify the target tag doesn't already exist.
//   3. Bump packages/ns-web/package.json.
//   4. Commit the bump.
//   5. Create annotated tag v<version>.
//   6. Push main + the tag.
//   7. Merge main back into develop, push.
//   8. Leave the working tree back on main.
//
// Desktop is intentionally untouched — its build scripts already sync
// tauri.conf.json from the git tag at build time (and tauri dev via
// the new predev hook), so tagging is all the desktop lane needs.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const VERSION = process.argv[2];

if (!VERSION || !/^\d+\.\d+\.\d+$/.test(VERSION)) {
  console.error("Usage: npm run release -- <major.minor.patch>");
  console.error("Example: npm run release -- 2.39.0");
  process.exit(1);
}

const TAG = `v${VERSION}`;

function sh(cmd) {
  execSync(cmd, { stdio: "inherit", cwd: repoRoot });
}
function shOut(cmd) {
  return execSync(cmd, { cwd: repoRoot }).toString().trim();
}

// ── Preflight ────────────────────────────────────────────────────

const branch = shOut("git rev-parse --abbrev-ref HEAD");
if (branch !== "main") {
  console.error(`Release must run on main (currently on: ${branch}).`);
  console.error("Typical flow: merge your develop→main PR, switch to main, pull, then re-run.");
  process.exit(1);
}

const dirty = shOut("git status --porcelain");
if (dirty.length > 0) {
  console.error("Working tree isn't clean. Commit or stash first.\n");
  console.error(dirty);
  process.exit(1);
}

sh("git fetch origin main");
const localSha = shOut("git rev-parse HEAD");
const remoteSha = shOut("git rev-parse origin/main");
if (localSha !== remoteSha) {
  console.error("Local main is not in sync with origin/main. Pull (or check what's ahead) and re-run.");
  process.exit(1);
}

const existingTags = shOut("git tag").split("\n").filter(Boolean);
if (existingTags.includes(TAG)) {
  console.error(`Tag ${TAG} already exists. Bump to a new version or delete the stale tag.`);
  process.exit(1);
}

// ── Bump ns-web package.json ─────────────────────────────────────

const pkgPath = path.join(repoRoot, "packages/ns-web/package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const prevVersion = pkg.version;

if (prevVersion === VERSION) {
  console.error(`ns-web package.json is already at ${VERSION}. Did you mean a newer version?`);
  process.exit(1);
}

pkg.version = VERSION;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`ns-web: ${prevVersion} → ${VERSION}`);

// ── Commit + tag + push ──────────────────────────────────────────

sh(`git add ${path.relative(repoRoot, pkgPath)}`);
sh(`git commit -m "chore: bump ns-web to ${VERSION} for release"`);
sh(`git tag -a ${TAG} -m "${TAG}"`);
sh("git push origin main");
sh(`git push origin ${TAG}`);

// ── Sync main back into develop ──────────────────────────────────

console.log("\nMerging main back into develop...");
sh("git fetch origin develop");
sh("git checkout develop");
sh("git pull origin develop");
sh(`git merge main --no-ff -m "chore: merge main ${TAG} back into develop"`);
sh("git push origin develop");

// Return the user to main.
sh("git checkout main");

console.log(`\n✓ Released ${TAG}.`);
console.log("  Railway will auto-deploy ns-web with the bumped version.");
console.log("  Desktop builds (`cd packages/ns-desktop && npm run tauri:build[:prod]`) will stamp");
console.log("  the tag into tauri.conf.json automatically.");
