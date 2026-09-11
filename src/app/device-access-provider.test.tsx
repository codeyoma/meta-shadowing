import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ActionableDialogProvider } from "./actionable-dialog";
import { DeviceAccessProvider } from "./device-access-provider";
const fixture = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("@/lib/device-access", () => ({ readDeviceAccess: () => null, subscribeDeviceAccess: () => () => {}, verifyDeviceAccess: fixture.verify }));
vi.mock("./device-learning-sync-provider", () => ({ DeviceLearningSyncProvider: ({ children }: { children: ReactNode }) => children }));
let root: ReturnType<typeof createRoot>;
afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
for (const outcome of ["verified", "unavailable", "storage-error"] as const) it(`waits quietly for first online verification then settles ${outcome}`, async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let finish!: (value: { accountId: string; epoch: string } | null) => void, fail!: () => void;
  fixture.verify.mockReturnValue(new Promise((resolve, reject) => { finish = resolve; fail = () => reject(new Error("Denied")); }));
  const node = document.createElement("div"); document.body.append(node); root = createRoot(node);
  await act(async () => root.render(<ActionableDialogProvider><DeviceAccessProvider accountId="a"><button>Learn</button></DeviceAccessProvider></ActionableDialogProvider>));
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(node.textContent).toContain("기기 계정을 확인하고 있어요");
  await act(async () => { if (outcome === "storage-error") fail(); else finish(outcome === "verified" ? { accountId: "a", epoch: "one" } : null); });
  if (outcome === "verified") { expect(node.textContent).toContain("Learn"); expect(document.querySelector('[role="alertdialog"]')).toBeNull(); }
  else expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(outcome === "unavailable" ? "온라인 로그인이 필요합니다." : "기기 계정 저장 공간을 확인해 주세요.");
});
