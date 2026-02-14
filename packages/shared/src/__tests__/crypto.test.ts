import { describe, it, expect } from "vitest";
import { randomBytes } from "crypto";
import { encrypt, decrypt } from "../crypto/index.js";

describe("crypto", () => {
  const key = randomBytes(32);

  it("encrypts and decrypts a string", () => {
    const plaintext = "sensitive financial data";
    const ciphertext = encrypt(plaintext, key);
    const decrypted = decrypt(ciphertext, key);

    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const plaintext = "same input";
    const ciphertext1 = encrypt(plaintext, key);
    const ciphertext2 = encrypt(plaintext, key);

    expect(ciphertext1).not.toBe(ciphertext2);
  });

  it("fails to decrypt with a different key", () => {
    const plaintext = "secret";
    const ciphertext = encrypt(plaintext, key);
    const wrongKey = randomBytes(32);

    expect(() => decrypt(ciphertext, wrongKey)).toThrow();
  });

  it("handles empty string", () => {
    const plaintext = "";
    const ciphertext = encrypt(plaintext, key);
    const decrypted = decrypt(ciphertext, key);

    expect(decrypted).toBe(plaintext);
  });

  it("handles unicode content", () => {
    const plaintext = "Balance: $1,234.56 \u2014 Account #\u00e9\u00e8";
    const ciphertext = encrypt(plaintext, key);
    const decrypted = decrypt(ciphertext, key);

    expect(decrypted).toBe(plaintext);
  });
});
