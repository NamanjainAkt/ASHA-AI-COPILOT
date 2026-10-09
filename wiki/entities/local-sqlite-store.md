---
type: entity
created: 2026-10-07
updated: 2026-10-07
sources: [sources/mobile-services.md]
tags: [sqlite, persistence, offline]
---

# Local SQLite Store — `asha_copilot.db`

`services/db/database.ts` (374 lines) plus four repositories. This is the substrate for the
Field Invariant: every clinical record the worker creates lives here first
([[concepts/offline-first-invariants]]).

## The singleton

```ts
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;   // :6

export function getDatabase(): Promise<SQLite.SQLiteDatabase> { // :8-23
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const db = await SQLite.openDatabaseAsync(DB_NAME);   // 'asha_copilot.db', :4
        await initDatabase(db);
        return db;
      } catch (err) {
        dbPromise = null;   // reset so the next call retries — a rejected promise is never cached
        throw err;
      }
    })();
  }
  return dbPromise;
}
```

It memoises the **promise**, not the handle, so concurrent first callers share one open and one
`initDatabase` — the documented fix for a `SQLiteException: database is locked` crash
(`docs/wiki/troubleshooting-and-debugging.md:82-107`). Because `initDatabase` runs *inside* the
memoised closure, DDL and seeding execute exactly once per successful open.

Two entry points await it: `splash.tsx:17` (blocking, the real gate) and the root layout
(`_layout.tsx:10-15`, fire-and-forget with a `console.warn`). Nothing wraps the splash await in
a timeout, so a stalled open stalls first launch.

## Schema — 6 tables (`:27-98`)

One `execAsync` batch, `PRAGMA foreign_keys = ON` first (`:27`).

| Table | Key columns | Line |
| :--- | :--- | :--- |
| `workers` | `id` PK, `name`, `role`, `phone`, `village`, `sub_center`, `created_at` | `:29-38` |
| `patients` | `id` PK, `name`, `age`, `sex`, `phone`, `village`, `household_id`, `created_at`, `updated_at`, `sync_status` | `:40-51` |
| `screenings` | `id` PK, `patient_id` FK, `screening_type`, `transcript`, `structured_data` (JSON), `rule_results` (JSON), `summary`, `confirmed`, timestamps, `sync_status` | `:53-67` |
| `followups` | `id` PK, `patient_id` FK, `screening_id`, `reason`, `priority`, `due_date`, `status`, timestamps, `sync_status` | `:69-81` |
| `sync_queue` | `id` PK, `entity_type`, `entity_id`, `operation`, `payload` (JSON), `attempts`, `last_error`, timestamps | `:83-92` |
| `app_state` | `key` PK, `value` | `:94-97` |

Structural notes:

- **`app_state` is dead** — created and never read or written anywhere.
- **`followups.screening_id` has no FK** to `screenings` (`:71`), so deleting a screening leaves
  dangling references.
- **`sync_queue` has no FK and no indexes** — none on `created_at` despite `getPending()`
  ordering by it, none on `(entity_type, entity_id)`.
- `sync_status` is `TEXT NOT NULL` with **no CHECK constraint** against the
  `'synced'|'pending'|'failed'` union (`types.ts:1`).
- `confirmed` is a boolean stored as INTEGER, converted at `screeningRepo.ts:71`, `:107`.

## Migration: one, and it is dead

```ts
try {
  await db.execAsync('ALTER TABLE workers ADD COLUMN sub_center TEXT;');  // :102
} catch { /* Column already exists or schema up to date */ }
```

This is the only migration — no version table, no `user_version` pragma, no ordered list. Because
the DDL at `:36` **already declares** `sub_center`, this `ALTER` throws "duplicate column name"
on every freshly created database and the error is swallowed. It only ever does anything for a
database created before that column was added to the DDL.

## Legacy-name repair pass (`:107-117`)

```sql
UPDATE patients SET name = 'सुनीता देवी', village = 'रामपुर' WHERE id = 'p-001' AND name LIKE '%(%';
-- … 4 more patients, plus workers for 'worker-001'
```

An idempotent repair for a past bug where seed names carried English parens, using `LIKE '%(%'`
as the sentinel. Runs unconditionally on every open inside an empty `catch {}`. It is harmless
but it is also a **hard-coded coupling to demo fixture ids** that lives in the production
migration path.

## Seed gate and fixtures

```ts
const workerCount = await db.getFirstAsync<{count:number}>('SELECT COUNT(*) as count FROM workers');
if (!workerCount || workerCount.count === 0) {
  await seedDemoData(db);      // :119-123
}
```

Gated on `workers` being empty **only**. Since `worker-001` is the very first insert in
`seedDemoData` (`:131-135`), a crash *after* that insert leaves a partially-seeded database that
the gate will never repair — a permanent half-demo state.

`seedDemoData` (`:126-374`) fixtures:

| Entity | Rows |
| :--- | :--- |
| worker | `worker-001` / `सुनीता दीदी` / asha / `+91 9876543210` / `रामपुर` (`:131-135`) |
| patients | `p-001` सुनीता देवी 48 F `HH-101` रामपुर · `p-002` मीना कुमारी 24 F `HH-104` रामपुर · `p-003` रमेश कुमार 56 M `HH-202` शिवपुर · `p-004` आशा शर्मा 32 F `HH-108` रामपुर · `p-005` मनोज वर्मा 62 M `HH-305` कासिमपुर (`:138-192`) |
| screenings | `s-001` NCD hypertension Sunita 165/105, glucose 142, `medication_adherence: false` (`:194-255`) · `s-002` pregnancy Meena 28 wks, bleeding + abdominal pain + swelling + headache (`:257-316`) |
| followups | `f-001` Sunita high BP re-check, `f-002` Meena **emergency maternal referral**, `f-003` Ramesh medium diabetes annual, `f-004` Asha low immunisation, `f-005` Manoj low geriatric — **already `completed`** (`:318-373`) |

Patients are inserted with `sync_status='synced'` **hard-coded in the SQL literal** (`:189`)
rather than parameterised — so demo data never appears in the sync queue, which is why the Sync
tab shows 0 pending on a fresh install.

**Seeded `rule_results` are hand-written fixtures, not engine output.** `s1Rules` (`:217-238`)
and `s2Rules` (`:278-299`) have prose that diverges from what `evaluateRules` produces for the
same data — different `ruleName`, different `reason_hi`, and `protocolSource: 'National NCD
Screening Guidelines'` where the engine emits the full protocol name. `s-002` carries only 2
pregnancy rules (both `high`) despite `severe_abdominal_pain: true` and `swelling: true`, which
the live engine would also flag. Never quote a seeded `reason_hi` as engine output.

Also date-fragile: `f-003`–`f-005` use **hard-coded absolute dates** (`2026-10-12`, `2026-10-15`,
`2026-10-18`) while `f-001`/`f-002` use `todayStr` (`:128`). On any device past Oct 2026 three of
five follow-ups are permanently overdue.

## Repositories

Four thin wrappers, no shared base. Since the round-3 fix, write methods accept an optional
tx handle (`runner = tx || getDatabase()`); seed, sync-ack, and three UI write pairs run inside
`withTransactionAsync`. The `manual-entry` and `patients/[id]` pairs remain unwrapped.

| Repo | Methods | Notable |
| :--- | :--- | :--- |
| `patientRepo.ts` | 7 (`:5-88`) | `search()` (`:22-32`) is **never called** — the directory filters in JS (`patients/index.tsx:67-81`) |
| `screeningRepo.ts` | 6 (`:13-153`) | owns `safeJsonParse` (`:4-11`); row-mapping block **duplicated** byte-identically at `:63-75` and `:99-111` |
| `followupRepo.ts` | 7 (`:4-100`) | `list()` left-joins patients for display names (`:7-12`); **no pagination/LIMIT**; uses untyped `getAllAsync<any>` (`:26`) |
| `syncQueueRepo.ts` | 6 (`:4-71`) | see [[entities/sync-engine]] |

`safeJsonParse` (the documented fix for a `SyntaxError` crash,
`docs/wiki/troubleshooting-and-debugging.md:110-126`) is **module-private to `screeningRepo.ts`**
— the other repos have no equivalent, though only `screenings` carries JSON columns.

Two durability hazards:

1. **Seeding is 13 sequential `runAsync` calls with no rollback** — combined with the
   `workers`-empty gate, a mid-seed crash permanently strands a partial dataset.
2. **`followupRepo.updateStatus` hardcodes `sync_status = 'pending'` in the params array, not the
   SQL** (`:72-75`) — a slightly surprising mechanism, but it is how an edited follow-up
   re-enters the pending state. It does **not** enqueue a queue row; both callers enqueue
   manually (`followups.tsx:46-47`, `patients/[id].tsx:71-72`).

`screeningRepo.getMetrics` computes `highRisk` by **text-matching the JSON column**
(`:133`): `rule_results LIKE '%"priority":"high"%'`. It depends on `JSON.stringify`'s exact
spacing, ignores `triggered`, and would silently return 0 if stored JSON were ever pretty-printed.

## Related

- [[entities/sync-engine]] · [[sources/mobile-services]]
- [[concepts/offline-first-invariants]] · [[concepts/silent-failure-pattern]]
- [[flows/sync-lifecycle]] · [[flows/voice-screening-journey]]
