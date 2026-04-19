/**
 * One-time data migration: inject YAML frontmatter into existing notes.
 *
 * For each note that doesn't already have a frontmatter block, this script
 * reads the note's database metadata (title, tags, summary, favorite,
 * createdAt, updatedAt) and injects a frontmatter block at the top of the
 * content string.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/migrate-frontmatter.ts
 *   DATABASE_URL=... npx tsx scripts/migrate-frontmatter.ts --dry-run
 *
 * Safe to run multiple times — notes that already have frontmatter are skipped.
 */

import { getPrisma } from "../src/lib/prisma.js";
import { hasFrontmatter, injectFrontmatter } from "@derekentringer/shared/ns";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const prisma = getPrisma();

  console.log(dryRun ? "[DRY RUN] " : "", "Starting frontmatter migration...");

  // Fetch all notes (including soft-deleted) in batches
  const batchSize = 100;
  let skip = 0;
  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalUpdated = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const notes = await prisma.note.findMany({
      select: {
        id: true,
        title: true,
        content: true,
        tags: true,
        summary: true,
        favorite: true,
        createdAt: true,
        updatedAt: true,
      },
      skip,
      take: batchSize,
      orderBy: { createdAt: "asc" },
    });

    if (notes.length === 0) break;

    for (const note of notes) {
      totalProcessed++;

      // Skip notes that already have frontmatter
      if (hasFrontmatter(note.content)) {
        totalSkipped++;
        continue;
      }

      const tags = Array.isArray(note.tags)
        ? note.tags.filter((t): t is string => typeof t === "string")
        : [];

      const newContent = injectFrontmatter(note.content, {
        title: note.title || undefined,
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString(),
        tags: tags.length > 0 ? tags : undefined,
        summary: note.summary || undefined,
        favorite: note.favorite || undefined,
      });

      if (!dryRun) {
        await prisma.note.update({
          where: { id: note.id },
          data: { content: newContent },
        });
      }

      totalUpdated++;
    }

    skip += batchSize;
    console.log(`  Processed ${totalProcessed} notes...`);
  }

  console.log("\nMigration complete:");
  console.log(`  Total notes: ${totalProcessed}`);
  console.log(`  Already had frontmatter (skipped): ${totalSkipped}`);
  console.log(`  Updated with frontmatter: ${totalUpdated}`);
  if (dryRun) console.log("  [DRY RUN — no changes written]");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
