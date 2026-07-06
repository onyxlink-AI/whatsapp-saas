/**
 * AES-256-GCM symmetric encryption helper.
 * Key is loaded from ENCRYPTION_KEY env var (base64-encoded 32-byte key).
 * Key version is loaded from ENCRYPTION_KEY_VERSION (default: "v1").
 *
 * Usage:
 *   const cipher = await encrypt("plaintext")
 *   const plain  = await decrypt(cipher)
 */

const ALG = "AES-GCM";
const IV_BYTES = 12; // 96-bit IV recommended for GCM
const KEY_VERSION = process.env.ENCRYPTION_KEY_VERSION ?? "v1";

/** Copy a Buffer/Uint8Array into a plain ArrayBuffer so crypto.subtle accepts it. */
function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
}

function getKeyMaterial(): ArrayBuffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY env var is not set");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32)
    throw new Error(
      `ENCRYPTION_KEY must be 32 bytes (got ${buf.length}). Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  return toArrayBuffer(buf);
}

let _cryptoKey: CryptoKey | null = null;

async function getCryptoKey(): Promise<CryptoKey> {
  if (_cryptoKey) return _cryptoKey;
  const raw = getKeyMaterial();
  _cryptoKey = await crypto.subtle.importKey("raw", raw, { name: ALG }, false, [
    "encrypt",
    "decrypt",
  ]);
  return _cryptoKey;
}

/** Encrypts a UTF-8 string and returns a base64-encoded ciphertext (iv:ciphertext:version). */
export async function encrypt(plaintext: string): Promise<string> {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: ALG, iv },
    key,
    encoded,
  );
  const ivB64 = Buffer.from(iv).toString("base64");
  const ctB64 = Buffer.from(cipherBuf).toString("base64");
  return `${ivB64}:${ctB64}:${KEY_VERSION}`;
}

/** Decrypts a base64-encoded ciphertext produced by {@link encrypt}. */
export async function decrypt(ciphertext: string): Promise<string> {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("Invalid ciphertext format");
  const [ivB64, ctB64] = parts;
  const key = await getCryptoKey();
  const iv = toArrayBuffer(Buffer.from(ivB64, "base64"));
  const ct = toArrayBuffer(Buffer.from(ctB64, "base64"));
  const plainBuf = await crypto.subtle.decrypt({ name: ALG, iv }, key, ct);
  return new TextDecoder().decode(plainBuf);
}

// Matches this module's `${iv}:${ciphertext}:${version}` format (base64 + a
// version tag) so decryptCredentials can tell an already-encrypted value
// apart from legacy plaintext.
const CIPHERTEXT_SHAPE = /^[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*:v\d+$/;

/**
 * Encrypts every string value of a credentials record (e.g. an
 * `integrations.credentials` JSONB blob). Non-string values pass through
 * unchanged; empty strings are left empty (nothing to protect).
 */
export async function encryptCredentials(
  creds: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(creds)) {
    if (typeof value === "string" && value.length > 0) {
      out[key] = await encrypt(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Decrypts every string value of a credentials record. Values that don't
 * match the ciphertext shape are returned as-is — this makes the change
 * backward-compatible with rows saved before encryption was wired in: old
 * plaintext keeps working and gets encrypted the next time it's saved.
 */
export async function decryptCredentials(
  creds: Record<string, unknown> | null | undefined,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(creds ?? {})) {
    if (typeof value !== "string" || value.length === 0) continue;
    if (CIPHERTEXT_SHAPE.test(value)) {
      try {
        out[key] = await decrypt(value);
        continue;
      } catch {
        // Fall through to plaintext pass-through below.
      }
    }
    out[key] = value;
  }
  return out;
}
