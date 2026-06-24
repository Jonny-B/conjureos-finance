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

/** Handler for a single registered action: receives params, returns a result. */
export type HostActionHandler = (params: unknown) => unknown | Promise<unknown>;

interface ConjureOSActionsBridge {
  /**
   * Register handlers for the actions declared in this app's manifest. The
   * kernel validates the names against the manifest (every declared action
   * needs a handler, no extras). See ConjureOS src/kernel/actionRegistry.ts.
   */
  register: (handlers: Record<string, HostActionHandler>) => Promise<void>;
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
  actions?: ConjureOSActionsBridge;
  notify?: (input: { title: string; body?: string }) => void | Promise<void>;
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

/**
 * Fire a ConjureOS notification (e.g. a low-balance or over-budget alert).
 * No-op when standalone or when the host hasn't granted `notify`. This is the
 * FOREGROUND delivery path; true background/push (firing while the app is
 * closed) needs Plaid webhooks → an edge function → notify, which is the
 * mocked-out backend seam.
 */
export function hostNotify(title: string, body?: string): void {
  const b = bridge();
  if (!b?.notify) return;
  try {
    void b.notify({ title, ...(body && { body }) });
  } catch {
    /* notifications are best-effort */
  }
}

/**
 * Register cross-app action handlers with the ConjureOS host, so the OS
 * orchestrator can drive this app (e.g. "do February's budget and categorize
 * everything"). No-op when running standalone (no host bridge) or if the host
 * rejects the registration (manifest mismatch) — the in-app UI still works.
 */
export async function registerHostActions(
  handlers: Record<string, HostActionHandler>,
): Promise<boolean> {
  const b = bridge();
  if (!b?.actions) return false;
  try {
    await b.actions.register(handlers);
    return true;
  } catch {
    return false;
  }
}
