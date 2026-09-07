"use client";

import { useEffect } from "react";

export function ScreenWake({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active || !navigator.wakeLock) return;
    let disposed = false;
    let generation = 0;
    let lock: WakeLockSentinel | undefined;

    function release() {
      generation++;
      const previous = lock;
      lock = undefined;
      void previous?.release().catch(() => {});
    }

    async function acquire() {
      if (disposed || document.hidden || lock) return;
      const request = ++generation;
      try {
        const acquired = await navigator.wakeLock.request("screen");
        // A permission request can settle after pause, navigation, or a visibility change.
        if (disposed || document.hidden || request !== generation) {
          await acquired.release();
          return;
        }
        lock = acquired;
        acquired.addEventListener("release", () => {
          if (lock !== acquired) return;
          lock = undefined;
        });
      } catch {
        // Screen wake is best-effort; denial must not interrupt practice.
      }
    }

    function visibilityChanged() {
      // Both players pause in the background. Only an explicit resume may reacquire.
      if (document.hidden) release();
    }
    void acquire();
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", visibilityChanged);
      release();
    };
  }, [active]);

  return null;
}
