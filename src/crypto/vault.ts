// Holds the derived encryption key in memory only (never persisted). The vault
// is "locked" until the user enters their passphrase. The salt/verifier are the
// only crypto-related values that may be persisted (they're not secret).

import { deriveKey, keyVerifier, newSalt } from "./crypto";

export interface VaultMeta {
  salt: string;
  verifier: string;
}

const META_KEY = "conjure.finance.vaultMeta";

export class Vault {
  private key: CryptoKey | null = null;

  get isUnlocked(): boolean {
    return this.key !== null;
  }

  getKey(): CryptoKey {
    if (!this.key) throw new Error("vault is locked");
    return this.key;
  }

  loadMeta(): VaultMeta | null {
    const raw = localStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as VaultMeta) : null;
  }

  /** First-time setup: derive a key from a new passphrase and persist meta. */
  async initialize(passphrase: string): Promise<void> {
    const salt = newSalt();
    const key = await deriveKey(passphrase, salt);
    const verifier = await keyVerifier(key);
    localStorage.setItem(META_KEY, JSON.stringify({ salt, verifier } satisfies VaultMeta));
    this.key = key;
  }

  /** Unlock an existing vault. Returns false on wrong passphrase. */
  async unlock(passphrase: string): Promise<boolean> {
    const meta = this.loadMeta();
    if (!meta) throw new Error("no vault to unlock");
    const key = await deriveKey(passphrase, meta.salt);
    const verifier = await keyVerifier(key);
    if (verifier !== meta.verifier) return false;
    this.key = key;
    return true;
  }

  lock(): void {
    this.key = null;
  }
}
