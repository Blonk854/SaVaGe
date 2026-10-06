import { useSyncExternalStore } from "react";
import { subscribeVisualFixtureReady, visualFixtureReady } from "./visualFixtureName";

export function VisualFixtureStatus() {
  const name = useSyncExternalStore(subscribeVisualFixtureReady, visualFixtureReady, () => null);
  if (!name) return null;
  return (
    <div className="sr-only" role="status">
      {`savage-visual-${name}`}
    </div>
  );
}
