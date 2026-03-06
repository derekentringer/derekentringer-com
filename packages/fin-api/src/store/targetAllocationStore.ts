import type { TargetAllocation } from "@derekentringer/shared";
import { getPrisma } from "../lib/prisma.js";
import {
  decryptTargetAllocation,
  encryptTargetAllocationForCreate,
} from "../lib/mappers.js";

export async function setTargetAllocations(
  userId: string,
  accountId: string | null,
  allocations: Array<{ assetClass: string; targetPct: number }>,
): Promise<TargetAllocation[]> {
  const prisma = getPrisma();

  // Transaction: delete existing allocations for this scope, then create new ones
  const result = await prisma.$transaction(async (tx) => {
    // Delete existing (scoped to userId)
    await tx.targetAllocation.deleteMany({
      where: { userId, accountId: accountId ?? null },
    });

    // Create new ones (include userId)
    const created = [];
    for (const alloc of allocations) {
      const encrypted = encryptTargetAllocationForCreate({
        accountId,
        assetClass: alloc.assetClass,
        targetPct: alloc.targetPct,
      });
      const row = await tx.targetAllocation.create({
        data: { ...encrypted, userId },
      });
      created.push(decryptTargetAllocation(row));
    }
    return created;
  });

  return result;
}

export async function listTargetAllocations(
  userId: string,
  accountId?: string | null,
): Promise<TargetAllocation[]> {
  const prisma = getPrisma();
  const where: Record<string, unknown> = { userId };

  if (accountId !== undefined) {
    where.accountId = accountId ?? null;
  }

  const rows = await prisma.targetAllocation.findMany({ where });
  return rows.map(decryptTargetAllocation);
}
