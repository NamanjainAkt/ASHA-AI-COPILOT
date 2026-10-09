---
type: source
created: 2026-10-07
updated: 2026-10-07
sources: [analyses/release-readiness-2026-10.md]
tags: [tests, tooling, build, qa]
---

# Tests & Tooling

## The two test suites

Both run clean as of 2026-10-06. Neither is wired into `npm test` (`package.json:13` delegates
to `--workspaces --if-present`, and no workspace defines a `test` script), so they must be
invoked directly — as `README.md:70` and `:73` document.

### `tests/clinical_rules_test.js` — 13/13 PASS (was 5/5 at first audit; Test 12 bleeding-ternary and Test 13 fasting/random branching added since)

Plain Node + `assert`, no test runner. **Exercises compiled output, not source**:
`require('../packages/shared/dist/validation')` plus both protocol JSONs (`:5-7`). A stale
`dist/` therefore passes silently, and nothing in CI rebuilds it first.

| # | Asserts |
| :--- | :--- |
| 1 | `validateScreeningData` accepts 165/105 + glucose 140; `field_status.bp_systolic === 'present'` (`:14-27`) |
| 2 | BP 120/140 → `isValid === false`, `issues[0].code === 'CONTRADICTION'` (`:29-42`) |
| 3 | male + `pregnancy_status: 'pregnant'` → invalid, `CONTRADICTION` (`:44-57`) |
| 4 | `blood_glucose: null` → `field_status.blood_glucose === 'missing'` (`:59-72`) |
| 5 | protocol thresholds: 140/90/180 and `vaginal_bleeding.priority === 'high'` (`:74-81`) |

**Coverage gaps.** It loads the protocol JSON only to assert hard-coded numbers — it **never
runs `evaluateRules`**. It never calls `validatePatient`. There is **no `OUT_OF_RANGE` test at
all**, despite that being the most common validation path
([[concepts/silent-failure-pattern]]). Nothing tests the rule engine, the orchestrator, the
repos, or any screen.

Both suites print a **hard-coded success banner** (`clinical_rules_test.js:84`,
`sync_idempotency_test.py:67`) rather than deriving it from assertions — the banners claim
"ALL … PASSED" unconditionally, so they are not evidence on their own.

### `tests/sync_idempotency_test.py` — 3/3 PASS

Bootstraps `sys.path` with the repo root (`:1-3`), imports `services.api.main:app`, and drives
it through `fastapi.testclient.TestClient` (`:6-9`) — so it exercises the real app, the real
`asha_backend.db`, and (via the import-time seeder) real seed mutation.

| Step | Asserts |
| :--- | :--- |
| 1 | first push → 200, `success is True`, `processed[0].status == "created"` (`:38-42`) |
| 2 | patient count identical before/after an identical duplicate push (`:46-56`) |
| 3 | `GET /sync/pull` contains the pushed `client_record_id` (`:59-64`) |

This is a genuine idempotency test of `INSERT OR REPLACE` keyed on the client id. It does **not**
cover: `sync_events` growth on replay, the `worker` entity gap, `delete` operations, or
`pending`/`failed` transitions — all of which are real gaps ([[sources/backend-api]]).

Running it prints a `StarletteDeprecationWarning` about `httpx` on stderr; harmless, but it
drowns the first lines of output.

## Android release artifact

`dist/ASHA-AI-Copilot-v1.0.0-release.apk`, built 2026-10-09
(whisper.cpp STT: `libwhisper_asha.so` arm64 + WhisperCppModule; Cactus kept for
Qwen/Needle; tag `2026-10-09-whispercpp`, bundle-verified).
SHA-256: `EC907A1EA61372EEE27EF933E21ACC678F0AB1C0643F872241CA7DB3350F980B`.
Previous (Cactus STT, tag urifix): SHA-256
`3418B4607D38F2EA5B7F17E413A028512D235A6AF95B1D199B2BE90639CAA0FE`.
Previous artifact (2026-10-07): 151,475,376 bytes, SHA-256
`58EF2A5F98F085601E83274ED4FB037DDFF2C02081BD0585305F6EB492A661C1`.
Older: 76.86 MB (80,595,975 bytes), built 2026-10-07 17:14 (pre-ONNX).

Verified with the Android SDK build-tools 35 available locally:

| Property | Value |
| :--- | :--- |
| package | `org.health.asha.aicopilot` |
| versionCode / versionName | `1` / `1.0.0` |
| minSdk / targetSdk | `24` / `34` |
| compileSdk | `35` (Android 15) |
| signature | `apksigner verify` → **Verifies**, v2 scheme only |
| label | `ASHA AI Copilot` |

`v1` (JAR) signing is `false` and `v3` is `false` — normal for a modern Gradle release build, and
fine for direct sideloading as `apk-build-plan.md:7` intends.

Declared permissions include `RECORD_AUDIO`, `INTERNET`, `ACCESS_NETWORK_STATE`,
`MODIFY_AUDIO_SETTINGS`, `VIBRATE`, `USE_BIOMETRIC`, plus `READ/WRITE_EXTERNAL_STORAGE` and
`SYSTEM_ALERT_WINDOW` (inherited from the Expo/React Native default set, not obviously needed).

## Build commands

```powershell
# shared package must be rebuilt after editing packages/shared/src
npm run build --workspace=@asha/shared

# typecheck
npx tsc --noEmit --project apps/mobile/tsconfig.json

# release APK
cd apps\mobile\android
.\gradlew.bat assembleRelease
# → apps/mobile/android/app/build/outputs/apk/release/app-release.apk

# signature
$apksigner = Get-ChildItem "$env:ANDROID_HOME\build-tools" -Filter apksigner.bat -Recurse | Select-Object -First 1 -ExpandProperty FullName
& $apksigner verify --verbose "dist\ASHA-AI-Copilot-v1.0.0-release.apk"
```

Note `apps/mobile/android/app/build/` contains generated Gradle artifacts including
`autolinking.json` — build output, not source.

## Device-testing tooling notes (learned 2026-10-06)

Environment: Pixel_5 AVD, Android 13 / `sdk_gphone64_x86_64`, emulator-5554. Driven with
`agent-device` 0.21.0 plus `adb`.

Working pattern — dispatch each command as a **finite task** and read its output on exit:

```text
agent-device open org.health.asha.aicopilot --platform android --foreground --relaunch
agent-device snapshot -i
agent-device press @e21~s928378 --settle
```

Three traps worth remembering:

1. **The CLI hangs when stdin stays open.** Running `agent-device snapshot -i` in an
   interactive shell that keeps stdin attached never returns. Redirecting `(< NUL)` did not
   help; running it as a one-shot non-interactive command did.
2. **Refs must be copied exactly as emitted.** A bare `@e21` from a *previous* snapshot is
   rejected with "needs a complete snapshot — the current frame only authorizes its emitted
   refs"; the pinned form `@e21~s928378` from that same frame is accepted.
3. **A crash surfaces as `COMMAND_FAILED … left org.health.asha.aicopilot and foregrounded
   com.google.android.apps.nexuslauncher`**, not as a JS error. Confirm a suspected app crash
   independently with `adb shell pidof <package>` (empty = dead) and `adb logcat -d -b crash`.

Emulator boot from cold: launch `emulator.exe -avd Pixel_5 -no-boot-anim`, wait for
`adb devices` to report `device` (not `offline`), then poll
`adb shell getprop sys.boot_completed` until it returns `1` (~20–40 s here). `agent-device boot`
failed with `INVALID_ARGS` ("requires an active session or an explicit device selector"), so
booting via the SDK directly is the reliable route.

## On-device SQLite inspection

The wiki docset suggests `run-as … sqlite3` (`docs/wiki/troubleshooting-and-debugging.md:170`),
which will not work on a **release** build — `run-as` requires a debuggable APK. For the shipped
`dist/` artifact, either install the debug/dev variant or pull the DB by other means.

## Resetting state

`adb shell "pm clear org.health.asha.aicopilot"` wipes both `asha_copilot.db` and
`expo-secure-store`, returning the app to first-launch onboarding.

## Related

- [[analyses/release-readiness-2026-10]] · [[analyses/navigation-crash-2026-10-06]]
- [[sources/monorepo-overview]] · [[sources/shared-package]] · [[sources/backend-api]]
- [[entities/clinical-rule-engine]] · [[entities/sync-engine]] · [[concepts/silent-failure-pattern]]
