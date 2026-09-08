import { act, createElement, Suspense, use, useState, type ComponentType, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ErrorBoundaryHandler, type ErrorInfo } from "next/dist/client/components/error-boundary";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { lessons } from "@/lib/lessons";
import LearnerLayout from "./(learner)/layout";
import BrowseError from "./(learner)/error";
import AppError from "./error";
import AppLoading from "./loading";

const catalog = vi.hoisted(() => ({ unavailable: true, waitFor: Promise.resolve() }));
vi.mock("@/lib/server-auth", () => ({ requireLearner: async () => undefined }));
vi.mock("@/lib/published-lessons", () => ({
  listPublishedLessons: async () => {
    await catalog.waitFor;
    if (catalog.unavailable) throw new Error("Catalog database unavailable");
    return lessons;
  }
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/languages",
  useSearchParams: () => new URLSearchParams()
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  catalog.unavailable = true;
  catalog.waitFor = Promise.resolve();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(console, "error").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function LayoutResult({ result }: { result: Promise<ReactNode> }) {
  return use(result);
}

function CatalogRequest({ fallback }: { fallback: ComponentType<ErrorInfo> }) {
  const request = () => LearnerLayout({ children: createElement("h1", null, "Recovered learner screen") });
  const [result, setResult] = useState(request);
  const router: AppRouterInstance = {
    bfcacheId: "catalog-boundary-test",
    back() {}, forward() {}, push() {}, replace() {}, prefetch() {},
    refresh() { setResult(request()); }
  };
  return createElement(AppRouterContext.Provider, { value: router },
    createElement(ErrorBoundaryHandler, { pathname: "/languages", errorComponent: fallback },
      createElement(Suspense, { fallback: createElement(AppLoading) },
        createElement(LayoutResult, { result }))));
}

async function recover(fallback: ComponentType<ErrorInfo>) {
  await act(async () => root.render(createElement(CatalogRequest, { fallback })));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("화면을 불러오지 못했습니다.");
  expect(container.textContent).not.toContain("Catalog database unavailable");
  catalog.unavailable = false;
  await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
  expect(container.querySelector("h1")?.textContent).toBe("Recovered learner screen");
  expect(container.querySelector('[role="alert"]')).toBeNull();
}

it("places a usable retry boundary above the learner layout's rejected catalog request", async () => {
  await recover(AppError);
});

it("refetches server content when retrying the existing learner fallback", async () => {
  await recover(BrowseError);
});

it("provides loading UI above the async learner layout", async () => {
  catalog.unavailable = false;
  const pending = Promise.withResolvers<void>();
  catalog.waitFor = pending.promise;
  await act(async () => root.render(createElement(CatalogRequest, { fallback: AppError })));
  expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  expect(container.querySelector("h1")).toBeNull();
  await act(async () => pending.resolve());
  expect(container.querySelector("h1")?.textContent).toBe("Recovered learner screen");
  expect(container.querySelector('[aria-busy="true"]')).toBeNull();
});
