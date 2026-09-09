// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { PracticeFailure } from "./use-cloud-recording";

it.each(["ownership-lost", "session-busy"])("blocks the player with a non-dismissible ownership dialog for %s", async error => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const navigate = vi.fn();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  try {
    await act(async () => root.render(createElement(PracticeFailure, { error, navigate })));
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("다른 기기");
    expect(dialog?.querySelector('[data-slot="dialog-close"]')).toBeNull();
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector('[role="dialog"]')).toBe(dialog);
    const button = dialog!.querySelector("button")!;
    expect(button.textContent).toBe("레슨으로 돌아가기");
    await act(async () => button.click());
    expect(navigate).toHaveBeenCalledWith("/lessons");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
