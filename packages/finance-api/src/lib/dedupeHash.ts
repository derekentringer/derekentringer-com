import crypto from "crypto";

export function generateDedupeHash(
  accountId: string,
  date: Date,
  description: string,
  amount: number,
): string {
  const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
  const descNormalized = description.toLowerCase().trim();
  const amountStr = amount.toFixed(2);
  const input = `${accountId}|${dateStr}|${descNormalized}|${amountStr}`;
  return crypto.createHash("sha256").update(input).digest("hex");
}
