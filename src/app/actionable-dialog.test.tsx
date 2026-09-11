import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ActionableDialogProvider, useActionableDialog } from "./actionable-dialog";
import { LocalSaveFailure } from "./player/local-learning-player";
import { OfflineShellRegistration, requestOfflineReadiness } from "./offline-shell-registration";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
let root: ReturnType<typeof createRoot>;
afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.innerHTML = ""; });
it("deduplicates dismissed background problems, serializes dialogs, and permits explicit retries", async () => {
  let dialogs!: ReturnType<typeof useActionableDialog>;
  function Consumer() { dialogs = useActionableDialog(); return <button>Origin</button>; }
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<ActionableDialogProvider><Consumer /></ActionableDialogProvider>));
  const origin = container.querySelector("button")!; origin.focus();
  const problem = { scope: "a", key: "save", title: "Save failed", description: "Retry saving", action: { label: "Retry", run: () => {} } };
  await act(async () => dialogs.show(problem));
  expect(document.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
  expect(document.querySelector('[data-slot="dialog-overlay"]')?.className).toContain("backdrop-blur-sm");
  expect(document.activeElement?.textContent).toBe("닫기");
  await act(async () => { dialogs.show(problem); dialogs.show({ ...problem, key: "other", title: "Other problem" }); });
  expect(document.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
  await act(async () => (document.activeElement as HTMLButtonElement).click());
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("Other problem");
  await act(async () => (document.activeElement as HTMLButtonElement).click());
  await act(async () => dialogs.show(problem));
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  await act(async () => dialogs.show({ ...problem, explicit: true }));
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("Save failed");
  await act(async () => dialogs.clearScope("a"));
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
});

it("presents a local save failure centrally and dismissal never retries or releases its caller", async () => {
  let retries = 0;
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<ActionableDialogProvider><LocalSaveFailure retry={() => retries++} /></ActionableDialogProvider>));
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("기기에 학습을 저장하지 못했습니다");
  await act(async () => (document.activeElement as HTMLButtonElement).click());
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(retries).toBe(0);
  expect(document.activeElement?.textContent).toBe("기기 저장 재시도");
  expect(document.activeElement?.tagName).toBe("BUTTON");
});

it("does not announce background offline-shell preparation failures", async () => {
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<ActionableDialogProvider><OfflineShellRegistration /></ActionableDialogProvider>));
  expect(document.querySelector('[role="alert"], [role="status"], [role="alertdialog"]')).toBeNull();
  await act(async () => requestOfflineReadiness());
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("오프라인 화면을 준비하지 못했습니다");
});
