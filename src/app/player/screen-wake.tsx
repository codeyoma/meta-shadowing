"use client";

import { useEffect, useState } from "react";

export function ScreenWake({ active }: { active: boolean }) {
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    setUnavailable(false);
    if (!active) return;
    if (!navigator.wakeLock) {
      setUnavailable(true);
      return;
    }
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
        setUnavailable(false);
        acquired.addEventListener("release", () => {
          if (lock !== acquired) return;
          lock = undefined;
          if (!disposed && !document.hidden) setUnavailable(true);
        });
      } catch {
        if (!disposed && request === generation) setUnavailable(true);
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

  return unavailable ? <p className="wake-note" role="note" aria-label="화면 유지 안내">
    화면 자동 꺼짐을 막을 수 없습니다. 기기의 화면 꺼짐 설정을 확인해 주세요.
  </p> : null;
}
