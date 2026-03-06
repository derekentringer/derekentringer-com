import bcrypt from "bcryptjs";
import { getPrisma } from "../lib/prisma.js";

const BCRYPT_ROUNDS = 12;

export async function createUser(data: {
  email: string;
  password: string;
  displayName?: string;
  role?: string;
}): Promise<{
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  totpEnabled: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
}> {
  const prisma = getPrisma();
  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

  return prisma.user.create({
    data: {
      email: data.email.toLowerCase(),
      passwordHash,
      displayName: data.displayName ?? null,
      role: data.role ?? "user",
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      totpEnabled: true,
      mustChangePassword: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getUserById(id: string) {
  const prisma = getPrisma();
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      passwordHash: true,
      totpEnabled: true,
      totpSecret: true,
      backupCodes: true,
      mustChangePassword: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getUserByEmail(email: string) {
  const prisma = getPrisma();
  return prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      passwordHash: true,
      totpEnabled: true,
      totpSecret: true,
      backupCodes: true,
      mustChangePassword: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function updateUser(
  id: string,
  data: {
    email?: string;
    passwordHash?: string;
    displayName?: string | null;
    totpSecret?: string | null;
    totpEnabled?: boolean;
    backupCodes?: unknown;
    mustChangePassword?: boolean;
  },
) {
  const prisma = getPrisma();
  const updateData: Record<string, unknown> = {};

  if (data.email !== undefined) updateData.email = data.email.toLowerCase();
  if (data.passwordHash !== undefined) updateData.passwordHash = data.passwordHash;
  if (data.displayName !== undefined) updateData.displayName = data.displayName;
  if (data.totpSecret !== undefined) updateData.totpSecret = data.totpSecret;
  if (data.totpEnabled !== undefined) updateData.totpEnabled = data.totpEnabled;
  if (data.backupCodes !== undefined) updateData.backupCodes = data.backupCodes;
  if (data.mustChangePassword !== undefined) updateData.mustChangePassword = data.mustChangePassword;

  return prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      totpEnabled: true,
      mustChangePassword: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function listUsers() {
  const prisma = getPrisma();
  return prisma.user.findMany({
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      totpEnabled: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function deleteUser(id: string): Promise<boolean> {
  const prisma = getPrisma();
  try {
    await prisma.user.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}
