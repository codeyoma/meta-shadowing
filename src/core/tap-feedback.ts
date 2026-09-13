type Feedback = { active(): boolean; haptic(): void | Promise<void> };

export function allowsTapFeedback(pathname: string, enabled = true) {
  return enabled && pathname !== '/player-options' && pathname !== '/languages'
    && pathname !== '/settings' && !pathname.startsWith('/settings/');
}

export function createTapFeedback(feedback: Feedback, now = Date.now) {
  let lastTap = -Infinity;
  return (enabled = true) => {
    if (!enabled || !feedback.active()) return;
    const time = now();
    if (time - lastTap < 90) return;
    lastTap = time;
    // Cosmetic feedback must never delay or reject the actual navigation/learning action.
    try { void Promise.resolve(feedback.haptic()).catch(() => {}); } catch { /* Optional hardware. */ }
  };
}
