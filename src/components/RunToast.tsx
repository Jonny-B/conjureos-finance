import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useFinance } from "../store/FinanceContext";
import { summarizeRun } from "../orchestrator";
import { Icon, faRobot, faXmark } from "../lib/icons";

// App-level confirmation that a categorization run happened — the visible
// counterpart to the OS orchestrator driving the app from outside ("do
// February's budget and categorize everything"). Without this, the data just
// changes silently and the user can't tell the command landed.
//
// Auto-dismisses when there's nothing to act on; stays put (until dismissed)
// when there are transactions waiting for review, since that needs a decision.
const AUTO_DISMISS_MS = 7000;

export function RunToast() {
  const { runAnnouncement, dismissRun } = useFinance();
  const navigate = useNavigate();
  const needsReview = runAnnouncement?.result.needsReview ?? 0;

  useEffect(() => {
    if (!runAnnouncement) return;
    if (needsReview > 0) return; // keep it: there's a decision to make
    const t = setTimeout(dismissRun, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [runAnnouncement, needsReview, dismissRun]);

  if (!runAnnouncement) return null;
  const { result, source } = runAnnouncement;

  return (
    <div className="toast" role="status" aria-live="polite">
      <span className="toast-mark"><Icon icon={faRobot} /></span>
      <div className="toast-body">
        <div className="toast-title">
          {source === "orchestrator" ? "ConjureOS categorized for you" : "Categorization complete"}
        </div>
        <div className="toast-text">{summarizeRun(result)}</div>
        {needsReview > 0 && (
          <button
            className="cui-button cui-button--primary btn-sm"
            style={{ marginTop: 8 }}
            onClick={() => {
              navigate("/review");
              dismissRun();
            }}
          >
            Review {needsReview} →
          </button>
        )}
      </div>
      <button className="toast-close" onClick={dismissRun} aria-label="Dismiss">
        <Icon icon={faXmark} />
      </button>
    </div>
  );
}
