---
type: analysis
created: 2026-10-07
updated: 2026-10-07
sources: [sources/mobile-ui-navigation.md, sources/monorepo-overview.md, sources/tests-and-tooling.md]
tags: [bug, crash, navigation, release-blocker, root-cause]
---

# Release Navigation Crash — `getPathDataFromState`

**Filed:** 2026-10-06 · **Severity:** release-blocking · **Status:** root cause *not* confirmed,
leading hypothesis identified with a falsification test.

The `dist/ASHA-AI-Copilot-v1.0.0-release.apk` **cannot navigate past the home screen.** Every
cross-route push from Home kills the app. Home and the Follow-ups/Home tab switch work fine.

## Observed evidence

Device: Pixel_5 AVD, Android 13 (`sdk_gphone64_x86_64`), emulator-5554. APK installed via
`adb`/`agent-device`, verified `org.health.asha.aicopilot` v1.0.0.

Four FATAL exceptions, all identical:

```text
FATAL EXCEPTION: mqt_native_modules
Process: org.health.asha.aicopilot, PID: 5850
com.facebook.react.common.JavascriptException: TypeError: undefined is not a function

This error is located at:
    in BaseNavigationContainer
    in NavigationContainerInner
    in ContextNavigator
    in ExpoRoot
    in App
AppContainer, js engine: hermes, stack:
  _loop@1:1093204
  getPathDataFromState@1:1091812
  anonymous@1:1072269
  getRouteInfoFromState@1:1086038
  getRouteInfo@1:1072164
  updateState@1:1072083
  ...
  commitPassiveMountOnFiber
```

Timestamps: `21:44:11.680` (PID 5850), `21:44:58.017` (6411), `21:45:51.951` (6554),
`21:49:48.765` (6765).

### Reproduction matrix

| Action | Result |
| :--- | :--- |
| Cold start, no interaction | ✅ Home renders, process alive 30 s (pid 6765) |
| Tap Follow-ups tab | ✅ screen renders, 4 follow-up cards, call + complete actions present |
| Tap Home tab | ✅ returns to dashboard |
| **Tap Patients tile** | ❌ **crash** (×2 on separate process instances) |
| **Tap "Start Field Visit"** | ❌ **crash** |

The 4th crash is the controlled one: the *same* pid 6765 that survived 30 s untouched and two tab
switches died on the Patients tap. `adb shell pidof` returned empty afterwards. So the trigger is
navigation, not time, load, or startup.

Crashing transitions, both from inside the nested `(tabs)` navigator:

- `/(tabs)` → `/patients` — `router.push('/patients')`, string form, `(tabs)/index.tsx:209`
- `/(tabs)` → `/screening/voice-capture` — `router.push({pathname, params})`, object form,
  `(tabs)/index.tsx:100-103`

## Where the crash lives

`getPathDataFromState` is **not** in `@react-navigation/core`. It is expo-router's own fork:

- defined at `node_modules/expo-router/build/fork/getPathFromState.js:76`
- called from `node_modules/expo-router/build/global-state/router-store.js:176`, inside
  `getRouteInfo`, which runs on **every** navigation state update

The call chain in the stack matches exactly: `updateState → getRouteInfo →
getRouteInfoFromState → getPathDataFromState → _loop`.

Installed versions: `expo-router` **4.0.22**, `@react-navigation/core` **7.23.0**, `expo` 52.0.49,
`react-native` 0.76.9, `react` 18.3.1. Only one copy of each `@react-navigation/*` package
exists — no version shadowing.

## Reading the error message — the decisive detail

`TypeError: undefined is not a function` means **something was called that is `undefined`.** It is
not a property read of `undefined` (which would say *"Cannot read properties of undefined"*).

This rules out the most obvious-looking explanation. A state-desync — `state.index >= state.routes.length`
making `state.routes[state.index]` `undefined`, then reading `.state` off it — produces
`Cannot read properties of undefined (reading 'state')`. **That is not what the device reported.**
The inner frame `_loop` is a nested helper inside the serializer, and it is *calling* something
absent.

What is available to be called inside that loop? `queryString.stringify`.

## Leading hypothesis

`apps/mobile/package.json:24` declares **`query-string: ^9.5.1`**. expo-router 4.0.22 calls
`queryString.stringify(...)` directly. `scripts/patch-expo-router.js` exists solely to rewrite
those calls defensively, in exactly three files:

| File | Patched lines |
| :--- | :--- |
| `expo-router/build/fork/getPathFromState.js` | `:262-263` |
| `expo-router/build/fork/getPathFromState-forks.js` | `:57-58` |
| `expo-router/build/global-state/routeInfo.js` | `:50-51` |

The replacement (`patch-expo-router.js:17-18`) is exactly a "is it a function?" guard:

```js
const stringifyFn = queryString.stringify || queryString.default?.stringify;
const query = typeof stringifyFn === 'function' ? stringifyFn(focusedParams, { sort: false }) : '';
```

**Verified: this patch IS applied in the local `node_modules`** — `getPathFromState.js:262-263`
contains the patched form.

**And it is never run automatically.** The root `package.json` declares exactly four scripts —
`start:mobile`, `start:dashboard`, `test`, `api:start` (`package.json:10-16`) — and **no
`postinstall`**. `scripts/patch-expo-router.js` must be invoked by hand.

So: **a dev machine has a patched dependency tree; an EAS build gets a fresh, unpatched one.**
`apps/mobile/eas.json:15-17` sets the `production` profile to `android.buildType: apk`, which is
what produced `dist/`. With the unpatched direct `queryString.stringify(...)` and a
`query-string` v9 namespace shape where `.stringify` is not a callable under
`__importStar(require("query-string"))`, that call throws
`TypeError: undefined is not a function` — inside `getPathDataFromState`'s loop, on every
navigation state update, in a release Hermes bundle with no dev-time fallback.

That predicts **exactly** the observed signature: navigation-only, release-only, and identical on
both a string-form and an object-form push (because `getPathDataFromState` walks the whole state
tree on *every* update, regardless of which route is being pushed).

*This is an inference, not a confirmed root cause.* Falsification test below.

## Contributing app-side factors

Ranked by plausibility, all secondary to the above:

1. **No `app/index.tsx` and no `initialRouteName`** — the initial path is derived from
   `require.context` ordering and resolves to `/splash`. Everything downstream is a `replace`
   from there (`splash.tsx:25/27/29`).
2. **`patients/[id]` is registered before its static siblings** (`_layout.tsx:32` vs `:52`, `:58`,
   `:65`), so `patients/:id` precedes `patients/index` and `patients/high-risk` in the
   alphabetical linking config — both `/patients/high-risk` and `/patients/index` then have a
   competing `:id` pattern. **Independent evidence this already bit the app:** the detail screen
   defends against it explicitly — `if (!id || id === 'high-risk')` at `patients/[id].tsx:33-36`.
   That guard should not be necessary.
3. **Mixed navigation argument styles** on the same routes: string form for `/patients` and
   `/patients/${id}` (`(tabs)/index.tsx:209`, `patients/index.tsx:167`,
   `patients/high-risk.tsx:130`), object form for `/screening/voice-capture` and every
   `/screening/summary` push. Two different state shapes for one stack.
4. **Both crashing routes are `presentation: 'modal'`** root-Stack destinations pushed from a
   nested Tabs navigator (`_layout.tsx:36`, `:61`).
5. **A latent data-corruption bug in the same family.** `(tabs)/index.tsx:283-289` passes
   `screeningId: isHighRisk ? 's-001' : undefined`. The forked serializer coerces with
   `String(value)` (`getPathFromState-forks.js:43-44`), so `undefined` becomes the **string
   `'undefined'`** in `route.params`. `summary.tsx:131` does
   `params.screeningId || \`screen-${Date.now()}\`` — `'undefined'` is truthy, so it persists
   **`id = 'undefined'`** as a `screenings` primary key. Not the crash, but the same serializer
   and the same "unvalidated param" failure mode.

## Verification plan

1. **Confirm or kill the hypothesis.** Run the same flow against a **debug** build
   (`npx expo run:android`, or the `development` profile). If it does not crash, the difference is
   the bundle/dependency tree, not the app code — which localises it to the patch.
2. **Decisive, cheap check:** `npm ci` in a clean checkout, then grep
   `node_modules/expo-router/build/fork/getPathFromState.js` for `stringifyFn`. Absent ⇒ the patch
   does not survive a fresh install.
3. **Directly verify the call shape:**
   `node -e "const qs=require('query-string'); console.log(typeof qs.stringify, typeof qs.default?.stringify)"`.
4. **Confirm in the shipped bundle:** extract `assets/index.android.bundle` from the APK and grep
   for `stringifyFn`. Absent ⇒ the release APK shipped unpatched, and the hypothesis is confirmed.
5. **Independent confirmation:** dump the sourcemapped Hermes stack. The `_loop` frame's offset
   (`@1:1093204`) maps to an exact source line, which will name the call site directly.

## Fixes, in order of cost

| # | Fix | Cost |
| :--- | :--- | :--- |
| 1 | ~~Add `"postinstall": "node scripts/patch-expo-router.js"` to root `package.json`~~ — **done 2026-10-07** (`package.json:15`). Now verify it executes in the EAS build (check logs for `Patched … successfully`); consider `patch-package`, which EAS honours deterministically | minutes |
| 2 | Make the patch **fail loudly** — `throw` when a target string is absent, instead of `console.log`-ing success (`patch-expo-router.js:19-23`) | minutes |
| 3 | **Pin `query-string` to the version expo-router 4 actually expects**, and drop the patch entirely if possible | minutes |
| 4 | Add an `app/index.tsx` or `initialRouteName="splash"` so the initial path is deterministic | small |
| 5 | Reorder `_layout.tsx` so `patients/index` precedes `patients/[id]`; then re-check whether `patients/[id].tsx:33-36`'s `'high-risk'` guard becomes dead code | small |
| 6 | Unify push argument style across the app | moderate |
| 7 | Fix `screeningId: … : undefined` → omit the key, so `summary.tsx:131` can't persist `'undefined'` | minutes |
| 8 | Pin `@react-navigation/*` explicitly — the app currently declares none and inherits whatever expo-router resolves | small |

## Open questions

- Does the **dev client** (`expo run:android`) crash? Untested — this is the single most
  informative experiment available and it is cheap.
- Why do tab switches *within* `(tabs)` work? If `getPathDataFromState` runs on every state
  update, tab switches should also serialise a path. Either those transitions skip the stringify
  branch, or the crash is not the stringify call. **This is the strongest reason to hold the
  hypothesis provisional.**
- Is `_loop` the `while (current)` loop body in expo-router's fork, or a helper in
  `@react-navigation/core`? The sourcemap answers it.
- Do `/patients/[id]`, `/screening/summary`, `/patients/high-risk`, `/screening/manual-entry` and
  `/village` crash too? All are unreachable from Home once the first crash occurs, so they are
  **untested**.

## Related

- [[analyses/release-readiness-2026-10]] · [[sources/tests-and-tooling]] · [[sources/monorepo-overview]]
- [[sources/mobile-ui-navigation]] · [[concepts/silent-failure-pattern]]
- [[flows/voice-screening-journey]] · [[entities/screening-orchestrator]]
