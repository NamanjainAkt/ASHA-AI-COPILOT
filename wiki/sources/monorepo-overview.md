---
type: source
created: 2026-10-07
updated: 2026-10-07
sources: [sources/shared-package.md, sources/mobile-services.md, sources/backend-api.md]
tags: [monorepo, build, tooling]
---

# Monorepo Overview

## Shape

npm workspaces monorepo, two workspace globs (`package.json:6-9`):

```text
C:\Andy projects\Asha\
├── apps/mobile/          React Native + Expo Router 4 (Android/iOS/web target)
├── apps/dashboard/       index.html only — served BY FastAPI, not standalone-served
├── packages/shared/      @asha/shared — types, validation, clinical protocol JSON
├── services/api/         FastAPI sync server (Python)
├── services/api/asha_backend.db   server SQLite, committed next to the code
├── scripts/              patch-expo-router.js, parse_dump.js  (manual, not wired)
├── tests/                2 suites, not wired into npm test
├── dist/                 release APK (76.84 MB, v1.0.0)
├── docs/                 pre-existing human-written docs + docs/wiki/ 9 pages
└── stitch_asha_ai_copilot_ui/      design source, not compared to shipped screens
```

`apps/mobile/node_modules` also exists (npm hoisting left a local copy); most packages resolve
from the monorepo root.

## The `@asha/shared` consumption chain

This is the single most easily broken thing in the repo, and it is not wired to any script.

1. `packages/shared/src/**` is TypeScript. `packages/shared/tsconfig.json` targets
   `ES2022`/`commonjs`, `outDir: ./dist`, `declaration: true`, `resolveJsonModule: true`
   (`tsconfig.json:3-13`).
2. `packages/shared/package.json` points `main` at `dist/index.js` and `types` at
   `dist/index.d.ts` (`package.json:4-5`). **No `exports` field.**
3. `apps/mobile/package.json:12` declares `"@asha/shared": "*"` → resolved as a workspace symlink.
4. Consequence: **the mobile app loads compiled CommonJS from `dist/`, never the TS sources.**
   A source edit without `npm run build --workspace=@asha/shared` is invisible to the app.
5. `resolveJsonModule` is what copies the protocol JSON into `dist/protocols/` (`dist/protocols/ncd-demo.json`,
   `dist/protocols/pregnancy-demo.json` are present). There is no explicit copy step.

The clinical test suite has the same dependency — `tests/clinical_rules_test.js:5-7` requires
`../packages/shared/dist/validation` and the JSON out of `dist/`. So **the tests can pass
against a stale build** and there is no CI step that rebuilds first.

## Run / test commands

| Purpose | Command | Notes |
| :--- | :--- | :--- |
| Backend | `python -m services.api.main` | The documented `python services/api/main.py` **fails** — see [[sources/backend-api]] |
| Mobile (dev) | `npm run start:mobile` | → `expo start` in `apps/mobile` |
| Mobile (Android) | `npm run android` or `npx expo run:android apps/mobile` | The positional directory is required when invoking Expo directly from the monorepo root; bare `npx expo run:android` targets the root project. |
| Shared build | `npm run build --workspace=@asha/shared` | Must be run manually after editing `packages/shared/src` |
| Clinical tests | `node tests/clinical_rules_test.js` | Runs against `dist/` |
| Sync tests | `python tests/sync_idempotency_test.py` | Needs `httpx`, which is missing from `requirements.txt` |
| Typecheck | `npx tsc --noEmit --project apps/mobile/tsconfig.json` | Verified clean 2026-10-06 |

The root `android` npm script delegates to `@asha/mobile` (`package.json:16`), but a direct
`npx expo run:android` starts Expo in the current directory and bypasses that script. The mobile
workspace declares `index.js` as its entry point (`apps/mobile/package.json:4`), which loads
Expo Router (`apps/mobile/index.js:1`); pass `apps/mobile` to the direct CLI command so it uses
that project instead of the monorepo root.

`npm test` (`package.json:13`) runs `npm run test --workspaces --if-present`, which covers
**neither** suite — no workspace defines a `test` script.

## Three manual, unwired steps

The recurring structural weakness of this repo. Each is required for correct behaviour and none
is automated:

1. **`scripts/patch-expo-router.js` — wired to `postinstall` since 2026-10-07, execution in EAS
   builds unverified.** Root `package.json:15` now declares the hook (it did not exist in an
   earlier read of the same file, which showed 28 lines and four scripts). The patch exists
   because `apps/mobile/package.json:24` declares `query-string: ^9.5.1` against expo-router 4's
   `queryString.stringify(...)` call shape. It rewrites three files under `node_modules/expo-router/build/` to guard the call
   (`patch-expo-router.js:16-18,29-30,41-42`). It is applied in the local tree
   (`node_modules/expo-router/build/fork/getPathFromState.js:262-263` shows the patched form).
   **What remains:** confirm the hook runs in EAS cloud builds (check logs for
   `Patched … successfully`) — a fresh `npm ci` with `--ignore-scripts`, or an EAS step that
   skips it, still ships unpatched. This is the leading cause of the release crash ([[analyses/navigation-crash-2026-10-06]]). The patch also
   `console.log`s success without failing loudly when its target string is absent
   (`patch-expo-router.js:19-23`).
2. **`packages/shared` build** — see above.
3. **Python package layout** — `services/__init__.py` and `services/api/__init__.py` do not
   exist; only `__pycache__` is present. Namespace packages (PEP 420) make
   `python -m services.api.main` work and force `tests/sync_idempotency_test.py:3` to
   `sys.path.insert` the repo root, but break script-path invocation.

## Dependency versions (declared vs installed)

| Package | Declared | Installed |
| :--- | :--- | :--- |
| `expo` | `^52.0.0` (`apps/mobile/package.json:14`) | 52.0.49 |
| `expo-router` | `~4.0.9` (`:20`) | **4.0.22** |
| `react-native` | `0.76.9` exact (`:26`) | 0.76.9 |
| `react` | `18.3.1` exact (`:25`) | 18.3.1 |
| `react-native-screens` | `~4.4.0` (`:28`) | 4.4.0 |
| `react-native-safe-area-context` | `4.12.0` exact (`:27`) | 4.12.0 |
| `query-string` | `^9.5.1` (`:24`) | see patch above |
| `@react-navigation/*` | **not declared at all** | transitive via expo-router; `core` resolves to 7.23.0 |

The app has **no direct `@react-navigation/*` dependency**. Its API surface (`getPathFromState`,
`useNavigationBuilder`, `BaseNavigationContainer`, …) is whatever expo-router 4.0.22's transitive
resolution produces — unpinned and unversioned by this repo.

## Android build configuration

- `apps/mobile/app.json`: `android.package` and `ios.bundleIdentifier` both
  `org.health.asha.aicopilot` (`:18`, `:28`); `newArchEnabled: false` (`:10`);
  `userInterfaceStyle: light` (`:9`); plugins include `expo-router`, `expo-sqlite`,
  `expo-secure-store`, and `expo-av` with a microphone permission string (`:40-50`).
- `apps/mobile/eas.json`: `preview` and `production` both `android.buildType: apk`
  (`:10-17`). The shipped `dist/` artifact is a **production-profile APK**, i.e. a
  release/minified Hermes build — which is exactly why a bundler-time difference from the dev
  tree matters.
- Entry point is `apps/mobile/index.js:1` → `import 'expo-router/entry';`, while
  `apps/mobile/package.json:4` sets `"main": "index.js"`. Consistent.

## Related

- [[sources/mobile-ui-navigation]] · [[sources/mobile-services]] · [[sources/shared-package]]
- [[sources/backend-api]] · [[sources/tests-and-tooling]]
- [[analyses/navigation-crash-2026-10-06]] · [[analyses/release-readiness-2026-10]]
