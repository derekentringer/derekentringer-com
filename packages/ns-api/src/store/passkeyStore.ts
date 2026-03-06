import { getPrisma } from "../lib/prisma.js";

export async function createPasskey(
  userId: string,
  data: {
    credentialId: string;
    publicKey: Uint8Array;
    counter: number;
    transports: string[];
    deviceType: string | null;
    backedUp: boolean;
    friendlyName: string | null;
  },
) {
  const prisma = getPrisma();
  return prisma.passkey.create({
    data: {
      userId,
      credentialId: data.credentialId,
      publicKey: data.publicKey as Uint8Array<ArrayBuffer>,
      counter: data.counter,
      transports: data.transports,
      deviceType: data.deviceType,
      backedUp: data.backedUp,
      friendlyName: data.friendlyName,
    },
  });
}

export async function getPasskeysByUserId(userId: string) {
  const prisma = getPrisma();
  return prisma.passkey.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPasskeyByCredentialId(credentialId: string) {
  const prisma = getPrisma();
  return prisma.passkey.findUnique({
    where: { credentialId },
  });
}

export async function updatePasskeyCounter(id: string, counter: number) {
  const prisma = getPrisma();
  return prisma.passkey.update({
    where: { id },
    data: { counter, lastUsedAt: new Date() },
  });
}

export async function deletePasskey(id: string, userId: string) {
  const prisma = getPrisma();
  const passkey = await prisma.passkey.findUnique({ where: { id } });
  if (!passkey || passkey.userId !== userId) return false;
  await prisma.passkey.delete({ where: { id } });
  return true;
}
