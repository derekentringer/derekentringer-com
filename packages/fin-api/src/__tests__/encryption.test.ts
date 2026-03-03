import { describe, it, expect, beforeAll } from "vitest";
import {
  initEncryptionKey,
  encryptField,
  decryptField,
  encryptNumber,
  decryptNumber,
  encryptOptionalField,
  decryptOptionalField,
} from "../lib/encryption.js";
import { randomBytes } from "crypto";

const TEST_KEY = randomBytes(32).toString("hex");

describe("encryption", () => {
  beforeAll(() => {
    initEncryptionKey(TEST_KEY);
  });

  describe("initEncryptionKey", () => {
    it("throws on invalid key length", () => {
      expect(() => initEncryptionKey("abcd")).toThrow(
        "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)",
      );
    });
  });

  describe("encryptField / decryptField", () => {
    it("round-trips a string value", () => {
      const original = "Hello, World!";
      const encrypted = encryptField(original);
      expect(encrypted).not.toBe(original);
      expect(decryptField(encrypted)).toBe(original);
    });

    it("produces different ciphertext for same input (random IV)", () => {
      const original = "same-value";
      const a = encryptField(original);
      const b = encryptField(original);
      expect(a).not.toBe(b);
      expect(decryptField(a)).toBe(original);
      expect(decryptField(b)).toBe(original);
    });

    it("round-trips an empty string", () => {
      const encrypted = encryptField("");
      expect(decryptField(encrypted)).toBe("");
    });
  });

  describe("encryptNumber / decryptNumber", () => {
    it("round-trips a positive number", () => {
      const encrypted = encryptNumber(1234.56);
      expect(decryptNumber(encrypted)).toBe(1234.56);
    });

    it("round-trips zero", () => {
      const encrypted = encryptNumber(0);
      expect(decryptNumber(encrypted)).toBe(0);
    });

    it("round-trips a negative number", () => {
      const encrypted = encryptNumber(-99.99);
      expect(decryptNumber(encrypted)).toBe(-99.99);
    });
  });

  describe("encryptOptionalField / decryptOptionalField", () => {
    it("returns null for null input", () => {
      expect(encryptOptionalField(null)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(encryptOptionalField(undefined)).toBeNull();
    });

    it("returns undefined for null ciphertext", () => {
      expect(decryptOptionalField(null)).toBeUndefined();
    });

    it("returns undefined for undefined ciphertext", () => {
      expect(decryptOptionalField(undefined)).toBeUndefined();
    });

    it("round-trips a non-null value", () => {
      const encrypted = encryptOptionalField("secret");
      expect(encrypted).not.toBeNull();
      expect(decryptOptionalField(encrypted)).toBe("secret");
    });
  });
});
