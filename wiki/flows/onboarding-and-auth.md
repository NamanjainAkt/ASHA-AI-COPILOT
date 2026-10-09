---
type: flow
created: 2026-10-07
updated: 2026-10-07
sources: [sources/mobile-ui-navigation.md, entities/local-sqlite-store.md]
tags: [flow, auth, onboarding, securestore]
---

# Flow — First Launch, Onboarding, Authentication

How a device becomes usable, and why the gate is effectively open.

```text
splash ──no has_onboarded──▶ onboarding (4 steps) ──▶ /(tabs)
       ──has session_active──▶ /(tabs)
       ──otherwise──────────▶ login ──correct PIN──▶ /(tabs)
```

## Splash decision table

`app/splash.tsx:13-41`: `await getDatabase()` (`:17`) → read `has_onboarded` (`:20`) → read
`session_active` (`:21`) → 1200 ms → route.

| Condition | Action | Line |
| :--- | :--- | :--- |
| `!hasOnboarded` (null or `''`) | `replace('/onboarding')` | `:25` |
| `session_active === 'true'` | `replace('/(tabs)')` | `:27` |
| otherwise | `replace('/login')` | `:29` |
| **any throw** | **`replace('/(tabs)')`** | `:34-36` |

## SecureStore key inventory

| Key | Written | Read |
| :--- | :--- | :--- |
| `has_onboarded` | `onboarding/index.tsx:63` | `splash.tsx:20` |
| `session_active` | `onboarding/index.tsx:64`, `login.tsx:67` | `splash.tsx:21` |
| `worker_auth_pin` | `onboarding/index.tsx:65` (**plaintext**) | `login.tsx:63` |
| `user_language` | `onboarding/index.tsx:66`, `LanguageContext.tsx:34` | `LanguageContext.tsx:25` |
| `worker_profile` | `onboarding/index.tsx:67-77` (JSON) | `login.tsx:39`, `(tabs)/index.tsx:52`, `(tabs)/profile.tsx:40`, `patients/new.tsx:34`, `village/index.tsx:31` |

`expo-secure-store` is Android Keystore-backed, so the *at-rest* protection is reasonable. The
weakness is not storage — it is that the value read back is a plaintext PIN used for a bare
equality check, and that check is bypassed anyway (below).

## Onboarding (4 steps)

`onboarding/index.tsx`: language (`:125-176`), profile (`:179-244`), PIN create+confirm
(`:247-283`), confirm (`:286-315`).

Every field is **pre-filled** — `name 'सुनीता देवी'` (`:27`), `workerId 'ASHA-UP-402'` (`:28`),
`village 'रामपुर'` (`:29`), `phone '9876543210'` (`:31`), and **`pin`/`confirmPin` both `'1234'`**
(`:34-35`). A worker can complete onboarding without typing anything, and the PIN they "set" is
the one already shown.

Validation is partial:

| Field | Validated |
| :--- | :--- |
| language | **no guard** — advancing is unconditional (`:57`) |
| name | yes (`:39-42`) |
| workerId | yes (`:43-46`) |
| PIN length 4, matches | yes (`:48-55`) |
| **village** | **no** — labelled required with ` *` (`:213`) but never checked |
| subCenter, phone | **no** |

`village` is `NOT NULL` in the `workers` table (`database.ts:34`), so an empty village either
throws at insert or persists a blank.

Completion writes the 5 SecureStore keys, inserts the worker with
`INSERT OR REPLACE INTO workers (id, name, phone, role, village, sub_center, created_at)`
(`:85`), then an Alert whose OK button does `router.replace('/(tabs)')` (`:88-92`). There is no
path back to `/login` from onboarding, and no role gate.

### The worker-row collision

`database.ts:120-123` seeds only when `SELECT COUNT(*) FROM workers` is 0, and the seeded worker
is `worker-001`. So:

- user who onboards → `ASHA-UP-402` inserted (seed already ran at first open) → **two worker rows**
- user who skips onboarding and lands on `/login` → keeps `worker-001`

`worker_profile` in SecureStore says `ASHA-UP-402` while the `workers` table's first row is
`worker-001`. Nothing reconciles them, and `syncService.workerId` is hard-coded to `'worker-001'`
(`syncService.ts:18`) regardless.

## Login

```ts
const savedPin = await SecureStore.getItemAsync('worker_auth_pin');   // :63
const expectedPin = savedPin || '1234';                               // :64
if (pin === expectedPin || pin === '1234') {                         // :66
  await SecureStore.setItemAsync('session_active', 'true');           // :67
  router.replace('/(tabs)');                                          // :68
}
```

### Four bypasses

| # | Mechanism | Line |
| :--- | :--- | :--- |
| 1 | `savedPin \|\| '1234'` — no PIN stored ⇒ `1234` works | `login.tsx:64` |
| 2 | `pin === '1234'` — **unconditional**, bypasses a real PIN | `login.tsx:66` |
| 3 | `catch → replace('/(tabs)')` — any SecureStore throw logs in | `login.tsx:73` |
| 4 | `catch → replace('/(tabs)')` — any splash throw skips login | `splash.tsx:34-36` |

Plus the master PIN is **printed on screen**: `मास्टर पिन: 1234` / `Master PIN: 1234`
(`login.tsx:160`).

#2 is the severe one. #1 and #3 could be defended as demo conveniences. #2 is a hard-coded
credential that overrides a worker-chosen one, which means a worker who sets a PIN in good faith
has secured nothing. #3/#4 fail **open**, on the theory that a field worker must never be locked
out of a device carrying unsynced records — a defensible product instinct, implemented in the
wrong direction (fail *closed* into a retry screen, or a documented recovery PIN).

`selectedRole` (ASHA vs Supervisor, `:23`, `:99-127`) is **never persisted and never read** —
purely cosmetic. There is no role-based gating anywhere.

### The "verified" badge is decorative

`login.tsx:134-147` renders a static `t.verified` pill next to the worker name loaded from
`worker_profile` (`:39-47`, with hard-coded fallbacks). Nothing is verified against the database —
the badge asserts a fact the code never checked.

## Logout

`(tabs)/profile.tsx:75-91`: confirm Alert → `deleteItemAsync('session_active')` (`:85`) →
`replace('/login')` (`:86`).

`has_onboarded`, `worker_auth_pin` and `worker_profile` are **not** cleared, so logout is a
session reset, not a full sign-out. Re-login still requires the PIN — but since `pin === '1234'`
always works, "signing back in" is a formality.

## Full device reset

```powershell
adb shell "pm clear org.health.asha.aicopilot"
```

Wipes `asha_copilot.db` and `expo-secure-store` together, returning the device to first-launch
onboarding ([[sources/tests-and-tooling]]).

## What this flow should be

The product instinct is defensible — a frontline worker with unsynced clinical records must never
be locked out of the device. The implementation loses that safety anyway, because the four
bypasses above mean there is no lock to be locked out of. The shape to aim for: a worker-chosen
PIN enforced unconditionally, a documented recovery path for a forgotten PIN that **surfaces the
records** rather than bypassing the gate, and offline rate-limiting rather than offline bypass.

## Related

- [[sources/mobile-ui-navigation]] · [[entities/local-sqlite-store]]
- [[concepts/silent-failure-pattern]] · [[concepts/offline-first-invariants]]
- [[flows/voice-screening-journey]] · [[sources/tests-and-tooling]]
- [[analyses/release-readiness-2026-10]]
