import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { BrowseShell, useBrowse } from "./browse-shell";
import { lessons } from "@/lib/lessons";
let pathname = "/lessons", query = "language=japanese";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useSearchParams: () => new URLSearchParams(query) }));
vi.mock("./device-access-provider", () => ({ DeviceAccessProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("./device-settings-provider", () => ({ DeviceSettingsProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("./lesson-packages-provider", () => ({ LessonPackagesProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("./learner-top-navigation", () => ({ LearnerTopNavigation: () => null }));
vi.mock("./bottom-navigation", () => ({ BottomNavigation: () => null }));
vi.mock("./cloud-preferences-provider", () => ({ CloudPreferencesProvider: ({ children }: { children: React.ReactNode }) => children,
  useCloudPreferences: () => ({ loading: true, profile: { revision: 1, selection: { language: "english", lessonId: lessons[0].id } }, visitRoute: () => false }) }));
let root: ReturnType<typeof createRoot>;
afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
it("renders URL-selected usable catalog through stalled cloud preferences and remembers selection in this account shell", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div"); document.body.append(node); root = createRoot(node);
  function Child() { const { selection } = useBrowse(); return <p>{selection.language}</p>; }
  const render = () => root.render(<BrowseShell catalog={lessons} accountId="a" profile={{ name: "Test", image: null }}><Child /></BrowseShell>);
  await act(async () => render());
  expect(node.textContent).toContain("japanese");
  expect(node.querySelector('[hidden], [style*="display: none"]')).toBeNull();
  pathname = "/languages"; query = "";
  await act(async () => render());
  expect(node.textContent).toContain("japanese");
});
