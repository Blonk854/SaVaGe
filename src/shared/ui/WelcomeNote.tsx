import { useSyncExternalStore } from "react";
import { dismissWelcome, isWelcomeDismissed, subscribeWelcome } from "./firstRun";

export function useWelcomeVisible(): boolean {
  const dismissed = useSyncExternalStore(subscribeWelcome, isWelcomeDismissed, () => true);
  return !dismissed;
}

export function WelcomeNote() {
  return (
    <p className="welcome-note">
      Convert an image, or draw on the artboard. Ctrl+K searches commands. Help lists the shortcuts.
      <button type="button" onClick={() => dismissWelcome()}>
        Dismiss tips
      </button>
      <style>{`
        .welcome-note {
          margin: 0;
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.45rem 0.7rem;
          align-items: center;
          color: var(--fg-1);
          font-size: var(--text-sm);
        }
        .welcome-note button {
          border: 1px solid var(--border);
          background: transparent;
          border-radius: 8px;
          padding: 0.2rem 0.45rem;
          color: var(--fg-0);
        }
      `}</style>
    </p>
  );
}
