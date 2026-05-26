// Bridge to the ConjureOS host (the OS shell that runs this app in a sandboxed
// iframe). ConjureOS injects `window.__conjureos` and — for DEFAULT/built-in
// apps only — an `auth` object that reuses the OS's signed-in Supabase session
// (single sign-on). See ConjureOS src/kernel/sandbox.ts (authBridge).
//
// Everything here degrades gracefully: when the app runs standalone (e.g. plain
// `npm run dev`, or as a non-default app), the bridge is absent and these
// resolve to "signed out", so the app stays on its local/mock path.

export interface HostUser {
  id: string;
  email?: string;
}

interface ConjureOSGlobal {
  signedIn?: boolean;
  isAdmin?: boolean;
  auth?: {
    getUser: () => Promise<HostUser | null>;
    getAccessToken: () => Promise<string | null>;
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
