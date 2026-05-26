// Client-side end-to-end encryption primitives.
//
// The user's data is encrypted in the browser with a key derived from their
// passphrase (PBKDF2 -> AES-GCM-256). Only ciphertext + a random IV ever leave
// the device, so the Supabase backend stores blobs it cannot read. This is the
// mechanism behind "encrypted so I can't see any data server-side".

const PBKDF2_ITERATIONS = 310_000; // OWASP-recommended floor for PBKDF2-SHA256
const KEY_LENGTH = 256;

const enc = new TextEncoder();
const dec = new TextDecoder();

// TS 5.6's lib types Uint8Array as generic over ArrayBufferLike, which the
// WebCrypto BufferSource overloads reject. Our buffers are always plain
// ArrayBuffer-backed, so narrow at the call site.
const bs = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

export function randomBytes(len: number): Uint8Array {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return arr;
}

/** A per-user salt is generated once and stored (it is not secret). */
export function newSalt(): string {
  return toBase64(randomBytes(16));
}

export async function deriveKey(passphrase: string, saltB64: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    bs(enc.encode(passphrase)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: bs(fromBase64(saltB64)),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

export interface Sealed {
  ciphertext: string; // base64
  iv: string; // base64 (12 bytes)
}

export async function encryptJSON(key: CryptoKey, value: unknown): Promise<Sealed> {
  const iv = randomBytes(12);
  const plaintext = enc.encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(iv) }, key, bs(plaintext));
  return { ciphertext: toBase64(ct), iv: toBase64(iv) };
}

export async function decryptJSON<T>(key: CryptoKey, sealed: Sealed): Promise<T> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bs(fromBase64(sealed.iv)) },
    key,
    bs(fromBase64(sealed.ciphertext)),
  );
  return JSON.parse(dec.decode(pt)) as T;
}

/**
 * Produces a stable verifier so the app can tell "wrong passphrase" from "no
 * data yet" without ever storing the key. Stored alongside the salt. Uses a
 * fixed IV + constant plaintext so the same key always yields the same value;
 * this IV is used ONLY for the verifier probe, never for real data.
 */
const VERIFIER_IV = new Uint8Array(12); // all-zero, probe-only
export async function keyVerifier(key: CryptoKey): Promise<string> {
  const pt = enc.encode("conjure-finance-verifier-v1");
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(VERIFIER_IV) }, key, bs(pt));
  return toBase64(ct);
}
