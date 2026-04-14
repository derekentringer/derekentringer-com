#!/usr/bin/env node
/**
 * Generates/updates RELEASE_NOTES.md by prepending new version entries
 * from git history. Runs automatically during Vite build.
 *
 * Format matches the existing hand-written style:
 *   ## vX.Y.Z
 *   - **Short description** — Details from commit message
 */
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NOTES_PATH = resolve(__dirname, "../public/RELEASE_NOTES.md");

function git(cmd) {
  return execSync(cmd, { encoding: "utf-8" }).trim();
}

function getTags() {
  try {
    return git("git tag --sort=-version:refname")
      .split("\n")
      .filter((t) => /^v\d+\.\d+\.\d+$/.test(t));
  } catch {
    return [];
  }
}

function getCommitsBetween(from, to) {
  const range = from ? `${from}..${to}` : to;
  try {
    return git(`git log ${range} --pretty=format:"%s" --no-merges`)
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

function formatCommit(msg) {
  // Parse conventional commit: type(scope): description
  const match = msg.replace(/^"/, "").replace(/"$/, "").match(/^(\w+)(?:\(([^)]+)\))?\s*:\s*(.+)$/);
  if (!match) return `- ${msg.replace(/^"|"$/g, "")}`;

  const [, type, , description] = match;
  const desc = description.charAt(0).toUpperCase() + description.slice(1);

  const typeLabels = {
    feat: "New",
    fix: "Fix",
    refactor: "Refactor",
    docs: "Docs",
    chore: "Chore",
    perf: "Perf",
    style: "Style",
    test: "Test",
  };

  const label = typeLabels[type] || type;
  return `- **${label}** — ${desc}`;
}

function parseExistingVersions(content) {
  const versions = new Set();
  const re = /^## v(\d+\.\d+\.\d+)/gm;
  let m;
  while ((m = re.exec(content)) !== null) {
    versions.add(`v${m[1]}`);
  }
  return versions;
}

function main() {
  let existing = "";
  try {
    existing = readFileSync(NOTES_PATH, "utf-8");
  } catch {
    existing = "# What's New\n";
  }

  const existingVersions = parseExistingVersions(existing);
  const tags = getTags();

  if (tags.length === 0) {
    console.log("[release-notes] No tags found, skipping.");
    return;
  }

  // Find the latest version already in the file to avoid adding old history
  const latestExisting = tags.find((t) => existingVersions.has(t));

  // Build new entries only for tags newer than the latest existing one
  const newEntries = [];
  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    if (existingVersions.has(tag)) break; // stop at first known version
    if (latestExisting && tag === latestExisting) break;

    const prevTag = tags[i + 1] || null;
    const commits = getCommitsBetween(prevTag, tag);
    if (commits.length === 0) continue;

    const lines = commits.map(formatCommit);
    newEntries.push(`## ${tag}\n\n${lines.join("\n")}`);
  }

  if (newEntries.length === 0) {
    console.log("[release-notes] No new versions to add.");
    return;
  }

  // Insert new entries after the "# What's New" header
  const headerLine = "# What's New";
  const headerIdx = existing.indexOf(headerLine);
  if (headerIdx === -1) {
    // No header — prepend everything
    const content = `${headerLine}\n\n${newEntries.join("\n\n")}\n\n${existing}`;
    writeFileSync(NOTES_PATH, content);
  } else {
    const afterHeader = headerIdx + headerLine.length;
    const before = existing.slice(0, afterHeader);
    const after = existing.slice(afterHeader);
    const content = `${before}\n\n${newEntries.join("\n\n")}${after}`;
    writeFileSync(NOTES_PATH, content);
  }

  console.log(`[release-notes] Added ${newEntries.length} new version(s).`);
}

main();
