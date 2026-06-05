// Bridge to the ConjureOS host (the OS shell that runs this app in a sandboxed
// iframe). ConjureOS injects `window.__conjureos` and — for DEFAULT/built-in
// apps only — an `auth` object that reuses the OS's signed-in Supabase session
// (single sign-on). See ConjureOS src/kernel/sandbox.ts (authBridge).
//
// Everything here degrades gracefully: when the app runs standalone (e.g. plain
// `npm run dev`, or as a non-default app), the bridge is absent and these
// resolve to "signed out", so the app stays on its local/mock path.
//
// ConjureOS Phase 30 (cross-origin app isolation): apps now run at
// <slug>.conjureos.app and cannot read the kernel's localStorage. Identity
// reads MUST go through this bridge — no localStorage fallback exists.
// `auth.whoami()` is the new safe identity op granted to ALL apps (vs
// `getUser` / `getAccessToken` which stay built-in-only).

export interface HostUser {
  id: string;
  email?: string;
}

/**
 * ConjureOS Phase 30g — safe identity subset returned by `auth.whoami()`.
 * Every field optional except `signedIn`. Granted to ALL apps.
 */
export interface HostWhoami {
  signedIn: boolean;
  email?: string;
  persona?: string;
  isAdmin?: boolean;
}

interface ConjureOSGlobal {
  signedIn?: boolean;
  isAdmin?: boolean;
  auth?: {
    getUser: () => Promise<HostUser | null>;
    getAccessToken: () => Promise<string | null>;
    /**
     * Phase 30g — safe identity subset. Granted to ALL apps. Use this
     * instead of getUser when you only need signedIn / email / persona
     * / isAdmin and not the full user object or a token.
     */
    whoami?: () => Promise<HostWhoami>;
  };
}

function bridge(): ConjureOSGlobal | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { __conjureos?: ConjureOSGlobal }).__conjureos ?? null;
}

/** True when running inside ConjureOS with the SSO auth bridge available. */
export function hasHostAuth(): boolean {
  return Boolean(bridge()?.auth);
}

/** Best-effort signed-in flag mirrored at iframe load (no round-trip). */
export function signedInHint(): boolean {
  return Boolean(bridge()?.signedIn);
}

export function isHostAdmin(): boolean {
  return Boolean(bridge()?.isAdmin);
}

export async function getHostUser(): Promise<HostUser | null> {
  const b = bridge();
  if (!b?.auth) return null;
  try {
    return await b.auth.getUser();
  } catch {
    return null;
  }
}

export async function getHostAccessToken(): Promise<string | null> {
  const b = bridge();
  if (!b?.auth) return null;
  try {
    return await b.auth.getAccessToken();
  } catch {
    return null;
  }
}

/**
 * Phase 30g safe identity read. Returns `{ signedIn: false }` when no
 * bridge is wired (e.g., `npm run dev`, older host, or any failure).
 */
export async function whoami(): Promise<HostWhoami> {
  const b = bridge();
  const fn = b?.auth?.whoami;
  if (!fn) return { signedIn: false };
  try {
    return await fn();
  } catch {
    return { signedIn: false };
  }
}
