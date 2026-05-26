import { useNavigate } from "react-router-dom";
import { useHostUser } from "../platform/useHostUser";

function initial(email: string | undefined): string {
  return email?.trim()?.[0]?.toUpperCase() ?? "?";
}

/** Compact account chip for the sidebar footer. Click → Settings → Account. */
export function UserBadge() {
  const { user, hasBridge, loading } = useHostUser();
  const navigate = useNavigate();

  const signedIn = Boolean(user);
  const label = loading
    ? "Checking session…"
    : signedIn
      ? (user!.email ?? "Signed in")
      : hasBridge
        ? "Signed out"
        : "Standalone";

  return (
    <button
      className="user-badge"
      onClick={() => navigate("/settings")}
      title={signedIn ? `Signed in as ${user!.email ?? user!.id}` : "Account & privacy"}
    >
      <span className={`avatar${signedIn ? " on" : ""}`} aria-hidden>
        {loading ? "…" : signedIn ? initial(user!.email) : "👤"}
      </span>
      <span className="user-badge-text">
        <span className="user-badge-name">{label}</span>
        <span className="user-badge-sub">
          {signedIn ? "ConjureOS SSO" : hasBridge ? "Not signed in" : "Local / mock data"}
        </span>
      </span>
    </button>
  );
}
