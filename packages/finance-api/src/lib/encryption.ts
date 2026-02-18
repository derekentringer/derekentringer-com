import { encrypt, decrypt } from "@derekentringer/shared";

let encryptionKey: Buffer | null = null;

export function initEncryptionKey(keyHex: string): void {
  const buf = Buffer.from(keyHex, "hex");
  if (buf.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)",
    );
  }
  encryptionKey = buf;
}

function getKey(): Buffer {
  if (!encryptionKey) {
    throw new Error(
      "Encryption key not initialized. Call initEncryptionKey() first.",
    );
  }
  return encryptionKey;
}

export function encryptField(value: string): string {
  return encrypt(value, getKey());
}

export function decryptField(ciphertext: string): string {
  return decrypt(ciphertext, getKey());
}

export function encryptNumber(value: number): string {
  return encryptField(String(value));
}

export function decryptNumber(ciphertext: string): number {
  return Number(decryptField(ciphertext));
}

export function encryptOptionalField(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  return encryptField(value);
}

export function decryptOptionalField(
  ciphertext: string | null | undefined,
): string | undefined {
  if (ciphertext == null) return undefined;
  return decryptField(ciphertext);
}
