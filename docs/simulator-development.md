# iPhone Simulator development

Work in the native rebuild checkout (`codex/native-iphone-rebuild`). The retired
web checkout is a separate recovery copy. This loop uses the controlled sample,
local files and SQLite; no phone, Expo account, signing team or hosted backend is
required.

## First session: Expo Go

Optional basic smoke test only. The full 0.25–3× playback range requires our
local Debug app below: Expo Go cannot include the project's native audio patch
and retains a 2× iOS cap. `npm ci` applies the patch; see `patches/README.md`.

1. Install Xcode and an iOS Simulator runtime in Xcode Settings → Components.
   Open Simulator and choose an available **iPhone**, not a physical device.
2. From the native checkout, install the locked dependencies and check the code:

   ```sh
   npm ci
   npm run check
   npx expo-doctor
   ```

3. Start Metro with IPv4-first localhost resolution:

   ```sh
   NODE_OPTIONS=--dns-result-order=ipv4first npx expo start --go --localhost
   ```

   Keep that terminal running. Press **i** to open Expo Go; **Shift+i** selects
   the simulator. Expo CLI installs the SDK-compatible simulator Expo Go when
   needed. Allow the first simulator boot and bundle compilation to finish.
4. Dismiss Expo Go's developer-menu introduction. Install the sample from its
   library book card, open the stage path, then choose Stage 1 and the popup's
   start action (or use the current-stage card).
   The first sentence is “I opened the window to let in the morning air.” with
   “아침 공기를 들이려고 창문을 열었어요.” After the one-second entry delay,
   playback should end with the footer's **말했어요, 다음 사이클** action enabled
   (accessible name). The three cycle circles remain unchecked until confirmation.

The install button becomes the lesson-open button only after all twelve stored
speech files pass validation. Expo Go has its own app storage: installing the
sample there does not install it in our separately built app.

## Our own local Debug app

Install CocoaPods if it is unavailable (`pod --version` checks it). Stop the
Expo Go Metro terminal with Control+C, then start the native development session:

```sh
NODE_OPTIONS=--dns-result-order=ipv4first npx expo start --dev-client --localhost
```

In a second terminal in the same checkout:

```sh
npx expo run:ios --device "iPhone 17 Pro" --configuration Debug --no-bundler
```

Choose an installed iPhone simulator name if yours differs. Expo generates the
native project when absent, installs its native dependencies, builds and installs
the app. Repeat the sample-install and first-playback steps inside **Meta
Shadowing**, not Expo Go. Never select a connected physical phone for this loop.

For Xcode inspection, open the generated `ios/app.xcworkspace`, choose
the **app** scheme, **Debug**, and the same iPhone Simulator. Expo uses this ASCII
project fallback for the 쇄도잉 display name; the bundle identity is unchanged. Generated
native projects and build output stay ignored; app configuration belongs in
`app.json` and supported config plugins.

## Edit, refresh, rebuild

- For a visible text change, edit the library heading in `src/app/(tabs)/index.tsx` and
  save. Fast Refresh should update the open app without a native build. Revert
  the temporary label after the check. Press **r** in Metro for a full JS reload.
- Native dependencies, config plugins, permissions and native configuration need
  a new native build; Fast Refresh cannot apply them:

  ```sh
  npx expo prebuild --platform ios --no-clean
  npx expo run:ios --device "iPhone 17 Pro" --configuration Debug --no-bundler
  ```

  Review generated changes before rebuilding. In SDK 57, plain `expo prebuild`
  defaults to deleting and recreating the native folders; `--no-clean` explicitly
  applies changes to the existing project. Preserve hand-written native work
  before regeneration, and do not approve a malformed-project deletion prompt
  without inspecting its target. Ordinary source edits need neither regeneration
  nor deletion of app data.
- `npm run check` validates the domain and types; `npm run bundle:ios` validates
  the JS/Hermes export. Neither substitutes for launching the native app.

## Recovery and acceptance boundaries

- **Cannot connect:** verify Metro is running in the native checkout. Test
  `curl http://127.0.0.1:8081/status`; expect `packager-status:running`. On the
  tested Node 26 setup, plain `--localhost` bound only to IPv6 while Expo Go
  advertised IPv4. The IPv4-first command above fixes that mismatch.
- **First launch times out:** wait for Simulator to reach its Home Screen,
  restart Metro if it exited, then press **i** again. Keep an already working
  Metro session alive; do not erase the simulator as the first recovery step.
- **Port occupied:** stop only the identified development session using that
  port. Do not kill unrelated servers or change repositories silently.
- **Native module missing:** check `npx expo install --check`, then rebuild our
  app after updating generated native configuration. Expo Go cannot load custom
  native modules absent from its SDK-compatible binary.
- **Native build:** use the workspace, not the project file, once dependencies
  have been installed. First-time dependency downloads and compilation are much
  slower than Fast Refresh. An automation response timeout does not necessarily
  stop Xcode: check whether the original build is still running before starting
  another one. A path to an unfinished `.app` directory is not a successful build.
- **Offline launch:** both Expo Go and our Debug build use Metro for development
  JavaScript. Neither proves launch without a server. Ticket #42 covers a local
  Release build with its embedded bundle and installed sample; airplane-mode
  acceptance must not be inferred from a Debug build.
- **Sound:** Simulator routes playback through the Mac's output. Check output
  volume/device when auditing audibility; do not request microphone permission
  for this playback-only app. A completed playback event is not a listening-quality
  assessment or evidence for phone calls, Bluetooth or physical-device behavior.

Actual run results and outstanding checks are recorded in
[verification](verification.md). Simulator evidence does not close the later
physical-iPhone acceptance gate.
