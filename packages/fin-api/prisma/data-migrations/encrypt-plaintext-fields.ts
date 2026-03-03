/**
 * One-time data migration: encrypt previously-plaintext Account and Transaction fields.
 *
 * Fields encrypted:
 *   Account: name, institution
 *   Transaction: description, notes
 *
 * Usage:
 *   ENCRYPTION_KEY=<hex> DATABASE_URL=<url> npx tsx prisma/data-migrations/encrypt-plaintext-fields.ts
 *
 * Safe to re-run: already-encrypted values will fail decryption and be skipped.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client.js";
import { initEncryptionKey, encryptField } from "../../src/lib/encryption.js";
import { decrypt } from "@derekentringer/shared";

const DATABASE_URL = process.env.DATABASE_URL;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!DATABASE_URL || !ENCRYPTION_KEY) {
  console.error("DATABASE_URL and ENCRYPTION_KEY env vars are required");
  process.exit(1);
}

initEncryptionKey(ENCRYPTION_KEY);

const keyBuf = Buffer.from(ENCRYPTION_KEY, "hex");

function isAlreadyEncrypted(value: string): boolean {
  try {
    decrypt(value, keyBuf);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const adapter = new PrismaPg(DATABASE_URL!);
  const prisma = new PrismaClient({ adapter });

  console.log("Migrating Account name & institution...");
  const accounts = await prisma.account.findMany();
  let accountCount = 0;

  for (const acct of accounts) {
    const updates: Record<string, string> = {};

    if (!isAlreadyEncrypted(acct.name)) {
      updates.name = encryptField(acct.name);
    }
    if (!isAlreadyEncrypted(acct.institution)) {
      updates.institution = encryptField(acct.institution);
    }

    if (Object.keys(updates).length > 0) {
      await prisma.account.update({
        where: { id: acct.id },
        data: updates,
      });
      accountCount++;
    }
  }

  console.log(`  Encrypted ${accountCount}/${accounts.length} accounts`);

  console.log("Migrating Transaction description & notes...");
  const transactions = await prisma.transaction.findMany();
  let txnCount = 0;

  for (const txn of transactions) {
    const updates: Record<string, string> = {};

    if (!isAlreadyEncrypted(txn.description)) {
      updates.description = encryptField(txn.description);
    }
    if (txn.notes && !isAlreadyEncrypted(txn.notes)) {
      updates.notes = encryptField(txn.notes);
    }

    if (Object.keys(updates).length > 0) {
      await prisma.transaction.update({
        where: { id: txn.id },
        data: updates,
      });
      txnCount++;
    }
  }

  console.log(`  Encrypted ${txnCount}/${transactions.length} transactions`);

  await prisma.$disconnect();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
