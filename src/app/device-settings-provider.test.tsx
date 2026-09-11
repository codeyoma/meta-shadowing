import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DeviceSettingsProvider, useDeviceSettings } from "./device-settings-provider";
import { ActionableDialogProvider } from "./actionable-dialog";
const fixture = vi.hoisted(() => ({ access: { accountId: "a", epoch: "one" }, fail: true, writes: [] as number[] }));
vi.mock("./device-access-provider", () => ({ useDeviceAccess: () => fixture.access }));
vi.mock("./lesson-packages-provider", () => ({ useLessonPackages: () => null, PackageDownloads: () => null }));
vi.mock("./account-snapshot-controls", () => ({ AccountSnapshotControls: () => null }));
vi.mock("./learner-sign-out", () => ({ LearnerSignOut: () => null }));
vi.mock("@/lib/device-learning-store", () => ({ readDeviceLearningState: async () => ({ record: null, writer: { accountId: "a", epoch: "one", generation: "first" } }),
  subscribeDeviceSnapshot: () => () => {}, writeDeviceLearningSettings: async (_id: string, _level: number, settings: { speed: number }) => {
    if (fixture.fail) throw new DOMException("Full", "QuotaExceededError"); fixture.writes.push(settings.speed);
  } }));
let root: ReturnType<typeof createRoot>;
afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
it("retries the unsaved settings value and keeps fields blocked until it commits", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div"); document.body.append(node); root = createRoot(node);
  function Open() { const settings = useDeviceSettings(); return <button onClick={() => settings.openSettings()}>Open</button>; }
  await act(async () => root.render(<ActionableDialogProvider><DeviceSettingsProvider accountId="a" profile={{ name: "Test", image: null }}><Open /></DeviceSettingsProvider></ActionableDialogProvider>));
  await act(async () => node.querySelector("button")!.click());
  const speed = document.querySelector<HTMLSelectElement>('#device-audio-speed, select[aria-label="재생속도"]') ?? [...document.querySelectorAll("select")].find(select => select.value === "1" && [...select.options].some(option => option.value === "1.5"))!;
  await act(async () => { speed.value = "2"; speed.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("기기 설정을 읽거나 저장하지 못했습니다");
  expect(speed.closest("fieldset")?.disabled).toBe(true);
  fixture.fail = false;
  const retry = [...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')].find(button => button.textContent === "다시 시도")!;
  await act(async () => retry.click());
  expect(fixture.writes).toEqual([2]);
  expect(speed.value).toBe("2");
});
