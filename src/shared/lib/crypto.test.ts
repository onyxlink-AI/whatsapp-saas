import { randomBytes } from "node:crypto";
import { beforeAll, describe, it, expect } from "vitest";
import {
  encrypt,
  decrypt,
  encryptCredentials,
  decryptCredentials,
} from "./crypto";

beforeAll(() => {
  // A fresh valid 32-byte key for this test run — never the real production key.
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("encrypt / decrypt", () => {
  it("round-trips a plaintext string", async () => {
    const plain = "yk_super_secret_ycloud_key";
    const ciphertext = await encrypt(plain);
    expect(await decrypt(ciphertext)).toBe(plain);
  });

  it("produces a different ciphertext each time (random IV) but both still decrypt", async () => {
    const plain = "same-secret";
    const a = await encrypt(plain);
    const b = await encrypt(plain);
    expect(a).not.toBe(b);
    expect(await decrypt(a)).toBe(plain);
    expect(await decrypt(b)).toBe(plain);
  });

  it("rejects a malformed ciphertext", async () => {
    await expect(decrypt("not-a-real-ciphertext")).rejects.toThrow();
  });
});

describe("encryptCredentials / decryptCredentials", () => {
  it("round-trips a full credentials record", async () => {
    const creds = {
      ycloud_api_key: "yk_abc123",
      webhook_signing_secret: "whsec_xyz789",
    };
    const encrypted = await encryptCredentials(creds);
    expect(encrypted.ycloud_api_key).not.toBe(creds.ycloud_api_key);

    const decrypted = await decryptCredentials(encrypted);
    expect(decrypted).toEqual(creds);
  });

  it("passes legacy plaintext through unchanged (backward-compatible migration)", async () => {
    // Real production shape before Issue 7 was fixed — no iv:ciphertext:version.
    const legacy = { ycloud_api_key: "plain-text-key-from-before-encryption" };
    const result = await decryptCredentials(legacy);
    expect(result).toEqual(legacy);
  });

  it("leaves empty strings and non-string values alone when encrypting", async () => {
    const creds = { empty: "", count: 3 as unknown as string };
    const encrypted = await encryptCredentials(creds);
    expect(encrypted.empty).toBe("");
    expect(encrypted.count).toBe(3);
  });

  it("skips null/undefined input gracefully", async () => {
    expect(await decryptCredentials(null)).toEqual({});
    expect(await decryptCredentials(undefined)).toEqual({});
  });
});
