import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ActionableDialogProvider } from "./actionable-dialog";
import { DeviceLearningSyncProvider } from "./device-learning-sync-provider";
const fixture = vi.hoisted(() => ({ publish: (_problem: string | null) => {} }));
vi.mock("@/lib/device-learning-sync", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/device-learning-sync")>(),
  createDeviceLearningSync: (_access: unknown, publish: typeof fixture.publish) => {
    fixture.publish = publish;
    return { dispose: () => {}, flush: () => Promise.reject(new Error("still full")) };
  },
}));
let root: ReturnType<typeof createRoot>;
afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
it("reopens an explicitly retried terminal failure without reopening a dismissed background problem", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div"); document.body.append(node); root = createRoot(node);
  await act(async () => root.render(<ActionableDialogProvider><DeviceLearningSyncProvider access={{ accountId: "a", epoch: "one" }}><button>Learn</button></DeviceLearningSyncProvider></ActionableDialogProvider>));
  await act(async () => fixture.publish("merge-limit"));
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  const retry = [...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')].find(button => button.textContent === "동기화 재시도")!;
  await act(async () => retry.click());
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  await act(async () => (document.querySelector('[role="alertdialog"] button') as HTMLButtonElement).click());
  await act(async () => fixture.publish("merge-limit"));
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
});
