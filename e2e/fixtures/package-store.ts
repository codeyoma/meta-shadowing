import { buildSync } from "esbuild";
import type { Page } from "@playwright/test";
import type * as Store from "../../src/lib/lesson-package-store";
import type * as Downloader from "../../src/lib/lesson-package-downloader";
import type * as DeviceStore from "../../src/lib/device-learning-store";
import type * as DeviceAccess from "../../src/lib/device-access";
import type * as PackageModel from "../../src/lib/lesson-package";

declare global { interface Window {
  packageStore: typeof Store; packageDownloader: typeof Downloader; deviceStore: typeof DeviceStore;
  deviceAccess: typeof DeviceAccess;
  packageModel: typeof PackageModel;
  packageTask: Promise<string>; downloadManager: ReturnType<typeof Downloader.createLessonPackageDownloader>;
  packageTicket: Store.PackageInstall;
} }
/** Exercise public production modules in Chromium's real IndexedDB, without a test route. */
export async function loadPackageModules(page: Page) {
  const result = buildSync({ stdin: { contents: 'import * as store from "./src/lib/lesson-package-store"; import * as downloader from "./src/lib/lesson-package-downloader"; import * as device from "./src/lib/device-learning-store"; import * as access from "./src/lib/device-access"; import * as packageModel from "./src/lib/lesson-package"; window.packageStore = store; window.packageDownloader = downloader; window.deviceStore = device; window.deviceAccess = access; window.packageModel = packageModel;', resolveDir: process.cwd() }, bundle: true, write: false, platform: "browser", format: "iife" });
  await page.addScriptTag({ content: result.outputFiles[0].text });
}
