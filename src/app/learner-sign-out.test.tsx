import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { LearnerSignOut } from "./learner-sign-out";
import { readDeviceAccess } from "@/lib/device-access";

const sdk = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("@/lib/supabase/browser", () => ({ getBrowserSupabaseClient: () => ({ auth: sdk }) }));
vi.mock("@/lib/supabase/config", () => ({ readSupabasePublicEnvironment: () => ({ url: "https://fixture.supabase.co", publishableKey: "fixture" }) }));

it("clears only local project credentials before an SDK logout error, then leaves the page", async () => {
  const navigate = vi.fn(), originalWindow = window;
  vi.stubGlobal("window", new Proxy(originalWindow, { get: (target, key) => key === "location" ? { replace: navigate } : Reflect.get(target, key) }));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.setItem("meta-shadowing:device-access:v1", JSON.stringify({ accountId: "account-a", epoch: "epoch-a" }));
  document.cookie = "sb-fixture-auth-token.0=fixture; Path=/";
  document.cookie = "sb-unrelated-auth-token=keep; Path=/";
  sdk.signOut.mockImplementation(async () => {
    expect(readDeviceAccess()).toBeNull();
    expect(document.cookie).not.toContain("sb-fixture-auth-token");
    throw new TypeError("Auth SDK network unavailable");
  });
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(LearnerSignOut)));
    await act(async () => host.querySelector("button")!.click());
    expect(sdk.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(navigate).toHaveBeenCalledWith("/login");
    expect(readDeviceAccess()).toBeNull();
    expect(document.cookie).toContain("sb-unrelated-auth-token=keep");
  } finally {
    await act(async () => root.unmount()); host.remove();
    localStorage.clear(); document.cookie = "sb-unrelated-auth-token=; Max-Age=0; Path=/";
    vi.unstubAllGlobals(); vi.restoreAllMocks();
  }
});
