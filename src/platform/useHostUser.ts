import { useEffect, useState } from "react";
import { getHostUser, hasHostAuth, signedInHint, type HostUser } from "./host";

export interface HostUserState {
  /** the signed-in OS user, or null when signed out / standalone */
  user: HostUser | null;
  /** whether the SSO bridge exists (i.e. we're a default app inside ConjureOS) */
  hasBridge: boolean;
  loading: boolean;
}

// Cache the in-flight/resolved lookup so the icon and Settings don't each do a
// separate postMessage round-trip to the host.
let cached: Promise<HostUser | null> | null = null;
function loadUser(): Promise<HostUser | null> {
  if (!cached) cached = getHostUser();
  return cached;
}

export function useHostUser(): HostUserState {
  const bridge = hasHostAuth();
  const [user, setUser] = useState<HostUser | null>(null);
  const [loading, setLoading] = useState(bridge);

  useEffect(() => {
    if (!bridge) {
      // No SSO bridge: best-effort hint only, no user object available.
      setUser(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadUser()
      .then((u) => !cancelled && setUser(u))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  return { user, hasBridge: bridge, loading };
}

export { signedInHint };
