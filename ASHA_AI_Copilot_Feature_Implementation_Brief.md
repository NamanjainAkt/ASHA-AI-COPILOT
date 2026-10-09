# ASHA AI Copilot — Feature Implementation Brief

**Features:** Confidence-Aware Extraction, Smart Offline Sync Status, Follow-up Task Management  
**Purpose:** Implementation planning document for the existing ASHA AI Copilot codebase  
**Status:** Proposed enhancements — confirm current code behavior before implementation

---

## 1. Project Context

ASHA AI Copilot is an offline-first, Hindi voice-enabled assistant for ASHA and frontline community healthcare workers.

### Existing documented architecture

- **Mobile:** React Native + Expo + TypeScript
- **Speech-to-text:** Whisper Tiny Hindi, running locally
- **Structured extraction:** Cactus Needle 2
- **Validation:** Physiological/range and schema validation
- **Screening logic:** Deterministic TypeScript rule engine
- **Summary:** Qwen3-1.7B, producing a simple Hindi explanation
- **Local persistence:** Expo SQLite
- **Synchronization backend:** FastAPI
- **Cloud database:** SQLite / Supabase PostgreSQL options are documented; verify the active configuration
- **Supervisor dashboard:** Web dashboard served through the backend

### Core safety principle

AI extracts and explains information; **configured deterministic rules determine screening flags**, and the ASHA worker reviews and confirms the record. These enhancements must not introduce autonomous diagnosis or let model confidence override clinical rules.

### Implementation guidance

This document describes desired behavior, acceptance criteria, and suggested implementation considerations. It does not assume that every suggested field, state, or behavior already exists. Inspect the current schema, repositories, orchestrator, rule engine, sync queue, API contracts, and dashboard before modifying them.

---

# Feature 1 — Confidence-Aware Extraction

## 1.1 Objective

Make uncertain or incomplete speech-extracted values visible to the ASHA worker so that questionable data is reviewed before a screening record is confirmed.

This is particularly important for blood pressure, glucose, age, pregnancy danger signs, and Hindi/Hinglish numeric speech on Android.

## 1.2 User problem

Speech recognition and structured extraction may mishear a number, omit a field, or produce an ambiguous value. If the app silently accepts it, validation and protocol rules may operate on incorrect data.

## 1.3 Proposed user experience

1. The worker records speech.
2. The app displays the transcript for review.
3. Needle 2 extracts structured fields.
4. The validation layer checks type, range, completeness, and contradictions.
5. The app labels fields as **Needs review**, **Missing**, **Invalid**, or **Ready to confirm**.
6. The worker edits any incorrect value and confirms the record.
7. Deterministic rules evaluate the validated values; each triggered flag shows its reason.
8. The app saves the confirmed record locally.

### Example

Spoken input: “बीपी एक सौ साठ बटा एक सौ है और शुगर दो सौ दस है।”

Expected structured values:
- Blood pressure: systolic `160`, diastolic `100`
- Random blood glucose: `210` mg/dL

If Android extracts `160/10`, omits glucose, or returns an invalid value, the relevant field should be highlighted and require review. The app must not silently replace a questionable value with a guessed value.

## 1.4 Field review states

Use a small, explicit set of states. Adapt names to existing domain types where possible.

| State | Meaning | Suggested UI behavior |
|---|---|---|
| `ready` | Value is present and passes validation | Display normally; worker still reviews the record |
| `needs_review` | Value is ambiguous, has low/unknown extraction confidence, or needs human verification | Highlight the field and ask the worker to verify it |
| `missing` | Expected value was not extracted or the test was not recorded | Show a missing-field prompt; do not invent a value |
| `invalid` | Value fails schema, range, or consistency checks | Explain the validation problem and require correction or an explicit allowed disposition |

A value being within a plausible range does **not** prove it was transcribed correctly. For safety-critical fields, consider requiring explicit worker review even if the model provides no reliable confidence score.

## 1.5 Confidence handling

- Do not assume Needle 2 provides calibrated confidence scores unless its actual output/API confirms that.
- If a reliable confidence score is available, store it with its source and version.
- If no score is available, use transparent review signals instead: missing value, validation failure, contradictory fields, uncertain transcript, or field-specific review requirements.
- Do not invent numerical confidence values or present heuristic scores as model probabilities.
- Do not use confidence to set clinical risk flags. Only the deterministic rule engine should evaluate configured protocols.

## 1.6 Suggested data contract

Adapt this concept to the existing shared types rather than duplicating the data model.

```ts
type ReviewState =
  | "ready"
  | "needs_review"
  | "missing"
  | "invalid";

interface ExtractedField<T> {
  value: T | null;
  reviewState: ReviewState;
  reviewReason?: string;
  confidence?: number; // only if genuinely supplied by the model
  source: "model" | "worker";
  workerEdited?: boolean;
}
```

Keep the final, validated domain record separate from temporary extraction metadata if that better fits the current schema. Avoid breaking API or SQLite compatibility without a migration plan.

## 1.7 Acceptance criteria

- [ ] Every supported extracted field can be reviewed and corrected.
- [ ] Missing values are represented explicitly, not silently replaced.
- [ ] Invalid or contradictory values are visibly identified.
- [ ] Low/unknown confidence does not produce false precision.
- [ ] Worker edits are retained in the final record and are distinguishable from original extraction where auditability is required.
- [ ] The worker must complete required review before confirming a record.
- [ ] Deterministic rules run on validated values and never on unreviewed guesses.
- [ ] Each screening flag continues to show its configured rule and reason.
- [ ] Tests cover normal, missing, malformed, ambiguous, and worker-corrected values.
- [ ] Desktop and Android use the same evaluation test cases, with platform-specific inference differences measured separately.

## 1.8 Suggested tests

1. Correct BP and glucose extraction.
2. Incorrect BP format or incomplete BP components.
3. Missing glucose.
4. Numeric transcript ambiguity.
5. Value outside configured physiological/plausibility bounds.
6. Contradictory values across transcript and extracted fields, if contradiction detection is implemented.
7. Worker edits an extracted value before confirmation.
8. Missing or unsupported model-confidence metadata.
9. Verify that changing confidence metadata alone never changes a clinical flag.
10. Verify that invalid or unreviewed data cannot bypass the confirmation flow.

---

# Feature 2 — Smart Offline Sync Status

## 2.1 Objective

Give the ASHA worker clear, trustworthy visibility into which records are saved locally, waiting to sync, successfully synchronized, or need attention.

## 2.2 User problem

Field work may happen without internet. A record can be safely saved on the device but not yet available to the supervisor. The UI must make that distinction obvious and must not imply that a record has reached the server before the backend confirms it.

## 2.3 Proposed user experience

Display a sync summary on the home screen and a detailed queue screen.

### Suggested statuses

| Status | Meaning | Suggested UI |
|---|---|---|
| `saved_locally` | The record is committed to local SQLite but has not been uploaded | “Saved on this device” |
| `pending` | Record is queued for synchronization | “Waiting to sync” |
| `syncing` | An upload attempt is in progress | “Syncing…” |
| `synced` | Server has acknowledged successful ingestion | “Synced” with timestamp |
| `retry_scheduled` | A transient failure occurred and the record is eligible for retry | “Will retry when possible” |
| `needs_attention` | Repeated/permanent failure or a record that needs user intervention | Explain the issue and offer a safe retry action |

Use existing status enums if available; avoid maintaining multiple conflicting sources of sync truth.

## 2.4 Core behavior

- Show counts for pending, syncing, synced, and failed/needs-attention records.
- Display the last successful sync time.
- Indicate connectivity separately from sync state. Being online does not mean records are synced.
- Trigger synchronization on reconnection, using the existing network monitor where available.
- Provide a manual **Sync now** action when online.
- Retry transient errors with bounded backoff; do not retry continuously in a tight loop.
- Preserve unsynced records across app restarts.
- Use client-generated stable UUIDs and backend idempotency so retries do not create duplicates.
- Mark a record `synced` only after the backend acknowledges it.
- Show actionable, non-technical error messages; keep detailed technical diagnostics out of patient-facing text.
- Do not block offline screening merely because sync is unavailable.

## 2.5 Suggested queue item information

Adapt to the current schema and avoid storing unnecessary personal or health information in logs.

- Record/client UUID
- Record type or non-sensitive display label
- Created/updated timestamp
- Sync status
- Attempt count and last-attempt timestamp, if supported
- Last error category, sanitized
- Server acknowledgement/synced timestamp

## 2.6 Error handling

Classify failures rather than treating all errors identically.

- **No network / timeout / temporary server error:** retain record and retry later.
- **Authentication or permission error:** pause automatic retries as appropriate and show that attention is needed.
- **Validation/schema rejection:** preserve the local record, report a clear actionable issue, and avoid endless retries without correction.
- **Duplicate/idempotent acknowledgement:** treat as success only if the backend confirms that the same logical record already exists.
- **Partial batch failure:** update each queue item based on its individual result; do not mark the entire batch as synced if some items failed.

Never delete a local record merely because an upload attempt failed. Define any post-sync retention policy separately.

## 2.7 Acceptance criteria

- [ ] UI distinguishes locally saved, pending, syncing, synced, and needs-attention states.
- [ ] Counts and status are derived from the persistent queue, not only in-memory state.
- [ ] Last successful sync time is visible when available.
- [ ] Offline records survive app restart.
- [ ] Reconnection initiates or schedules sync without duplicate records.
- [ ] Manual sync gives visible progress and result feedback.
- [ ] Transient errors retry safely; permanent errors do not loop indefinitely.
- [ ] Partial batch results are reflected per record.
- [ ] Server acknowledgement is required before marking an item synced.
- [ ] Existing screening and patient workflows remain usable offline.
- [ ] Tests cover reconnect, timeout, duplicate retry, app restart, and partial failure.

## 2.8 Suggested tests

1. Save a record with network disabled.
2. Restart the app and confirm the record remains pending.
3. Reconnect and confirm successful synchronization.
4. Retry the same upload and confirm no duplicate is created.
5. Simulate timeout or server error and verify bounded retry.
6. Simulate server validation rejection and verify the record is preserved.
7. Simulate a batch where one item succeeds and another fails.
8. Verify the last successful sync timestamp changes only after a confirmed success.
9. Verify online-but-pending and offline-but-already-synced states display correctly.
10. Verify the dashboard only displays records actually received by the backend.

---

# Feature 3 — Follow-up Task Management

## 3.1 Objective

Turn confirmed screening outcomes and configured workflow requirements into trackable follow-up tasks, so workers and supervisors can see what needs to happen next and whether it was completed.

This feature tracks workflow; it does not prescribe treatment or independently create clinical recommendations.

## 3.2 User problem

A screening flag alone does not guarantee that a follow-up visit or referral is completed. Workers need a simple way to record the required next step, due date when defined by an approved protocol, and completion status.

## 3.3 Proposed user experience

1. The worker completes and confirms a screening.
2. The deterministic rules engine emits configured flags and workflow requirements.
3. The app creates a follow-up task only when a configured rule or worker action calls for one.
4. The task appears in the worker’s **Follow-ups** list and, after sync, on the supervisor dashboard.
5. The worker opens the task, reviews its reason and due date, records the visit/referral outcome, and marks the task complete or records a permitted outcome.
6. Updates are saved locally first and synchronized later.

### Example task

- **Reason:** Follow-up required for a screening result under the configured NCD protocol.
- **Status:** Pending
- **Due date:** Only if specified by the configured protocol or entered by an authorized worker.
- **Outcome:** Completed, visit not completed, or another explicitly supported outcome.

Do not hard-code clinical timelines without a verified source and explicit project configuration.

## 3.4 Suggested task fields

Fit these into the existing `Followup` shared type and database schema where possible.

```ts
type FollowUpStatus =
  | "pending"
  | "completed"
  | "overdue"
  | "cancelled";

interface FollowUpTask {
  id: string;                // stable UUID
  patientId: string;
  screeningId?: string;
  reason: string;
  status: FollowUpStatus;
  createdAt: string;
  dueAt?: string;            // only when defined/entered
  completedAt?: string;
  outcome?: string;
  notes?: string;
  createdBy?: string;
  updatedAt: string;
  syncStatus: string;        // reuse the project's canonical sync type
}
```

This is a proposed contract, not a claim that the current schema uses these exact fields. Prefer shared types and existing status conventions; use a migration if persistent schemas need to change.

## 3.5 Workflow and rules

- Create tasks from explicit deterministic rule outputs or a worker-confirmed action.
- Each task must have a traceable reason and, where relevant, a link to its originating screening.
- Do not create duplicate tasks every time the same screening is reprocessed or synchronized.
- Derive `overdue` from a valid due date and current date/time; do not store conflicting overdue truth if it can be computed consistently.
- If no approved due date is available, keep the task pending without inventing a deadline.
- Completion should record who completed it, when, and the outcome where available.
- Preserve task updates offline and synchronize them idempotently.
- Ensure supervisor changes and worker changes follow an explicit conflict policy. Do not silently overwrite completion outcomes.
- Restrict task details to authorized users and avoid unnecessary sensitive information in notifications.

## 3.6 Mobile UI

Suggested Follow-ups screen sections:

- **Due / overdue** — tasks requiring attention, where due dates exist.
- **Pending** — tasks awaiting action.
- **Completed** — tasks with recorded outcomes.
- **Task details** — reason, source screening, due date if defined, status, and completion action.
- **Offline/sync indicator** — clearly show whether task changes are still local.

Keep the list lightweight, searchable, and usable on small Android screens.

## 3.7 Supervisor dashboard

Extend the existing dashboard to show:

- Pending and overdue task counts.
- Tasks by status and worker, subject to authorization.
- Task reason and originating screening.
- Completion time and outcome.
- Unsynced updates separately from server-confirmed updates.

Do not describe an unsynced local change as visible to the supervisor until it has reached the backend.

## 3.8 Acceptance criteria

- [ ] A follow-up task can be created from an explicit configured workflow or worker-confirmed action.
- [ ] Every task has a stable ID and traceable reason.
- [ ] Tasks can be listed and filtered by status.
- [ ] Due dates are not invented; overdue status is computed consistently.
- [ ] Workers can record completion and a supported outcome.
- [ ] Tasks and status updates persist offline and survive app restart.
- [ ] Sync retries do not create duplicate tasks or completion events.
- [ ] The supervisor sees updates only after backend acknowledgement.
- [ ] Conflicting updates are handled using a documented policy.
- [ ] Authorization prevents unrelated users from viewing or changing task details.
- [ ] Tests cover task creation, completion, due dates, offline updates, duplicate sync, and conflicts.

## 3.9 Suggested tests

1. Create a task from a configured rule output.
2. Verify no task is created when no configured workflow requires one.
3. Verify repeated processing does not create duplicate tasks.
4. Verify missing due date does not automatically make a task overdue.
5. Verify due/overdue calculations at date boundaries.
6. Complete a task offline, restart, reconnect, and verify synchronization.
7. Retry the same task upload and verify idempotency.
8. Test conflicting worker/supervisor updates according to the chosen policy.
9. Verify completed tasks retain completion timestamp and outcome.
10. Verify unauthorized users cannot access task details.

---

# 4. Integration Plan

Implement incrementally to avoid destabilizing the current working flow.

## Phase 0 — Inspect the existing code

Before coding, inspect and document:

- Shared types for patient, screening, follow-up, and sync.
- SQLite schema and migrations.
- Repositories and transaction boundaries.
- Screening orchestrator and extraction/validation contracts.
- Deterministic rule output structure.
- Sync queue worker, network listener, API contracts, idempotency handling.
- Current Follow-ups screen and supervisor dashboard.
- Existing automated tests and actual Android device behavior.

Reuse existing components where possible. Avoid building duplicate queues, enums, or repositories.

## Phase 1 — Confidence-aware extraction

1. Define field review states using existing domain types.
2. Connect extraction output to validation and review UI.
3. Require review of missing, invalid, ambiguous, or otherwise configured critical fields.
4. Ensure only validated values reach deterministic rules.
5. Add unit and Android integration tests.

**Exit condition:** The worker can detect and correct extraction errors before confirming a record.

## Phase 2 — Smart offline sync status

1. Define a single canonical source of sync status.
2. Derive counts and per-record states from persistent SQLite queue data.
3. Add last-successful-sync information and manual sync feedback.
4. Harden retry, partial batch handling, and idempotency.
5. Add offline/reconnect/restart/failure tests.

**Exit condition:** Workers can tell which records are local, pending, synced, or need attention without losing data.

## Phase 3 — Follow-up task management

1. Confirm task triggers from existing rule outputs and approved workflows.
2. Extend shared types and schema only where needed.
3. Implement task repository methods and migrations.
4. Build the worker Follow-ups list and task detail/completion flow.
5. Add task sync and supervisor visibility.
6. Test duplicate prevention, offline completion, due dates, and conflict handling.

**Exit condition:** A configured follow-up can be tracked from creation through completion, including offline use and eventual supervisor visibility.

---

# 5. Cross-Feature Safety and Performance Requirements

- Core screening, review, task access, and local persistence must not require network access.
- None of these features should require loading another AI model.
- Keep clinical rules deterministic and independent of LLM-generated confidence or explanations.
- Never silently replace missing or ambiguous clinical values with guesses.
- Save records and task changes transactionally where appropriate.
- Keep model execution off the UI thread and retain the existing sequential model-loading strategy.
- Use stable IDs and idempotent APIs for records, tasks, and updates.
- Avoid patient-identifiable data in technical logs.
- Do not claim a task is synced until the backend acknowledges it.
- Test on the actual target Android device; desktop tests alone are insufficient.
- Keep synthetic/demo data in hackathon demonstrations.

---

# 6. Definition of Done — Combined Checklist

## Confidence-aware extraction
- [ ] Uncertain, missing, invalid, and review-ready values are visibly distinguishable.
- [ ] Worker can correct values before confirmation.
- [ ] Clinical rules use validated values only.
- [ ] No invented confidence score or autonomous risk decision.
- [ ] Tests cover extraction errors and corrections.

## Smart offline sync status
- [ ] Local, pending, syncing, synced, and needs-attention states are visible.
- [ ] Last successful sync is accurate.
- [ ] Records survive restart and network failures.
- [ ] Retry and idempotency tests pass.
- [ ] Partial failures are represented per record.

## Follow-up task management
- [ ] Tasks have stable IDs, traceable reasons, and explicit statuses.
- [ ] Due dates come from configured protocols or authorized entry.
- [ ] Completion and outcome can be recorded offline.
- [ ] Task updates sync without duplication.
- [ ] Supervisor dashboard shows server-confirmed task updates.
- [ ] Authorization and conflict behavior are tested.

---

## 7. Recommended Implementation Order

**Recommended order:**
1. Confidence-aware extraction — directly supports the existing Android accuracy and clinical-safety goals.
2. Smart offline sync status — builds on the current persistent sync queue.
3. Follow-up task management — uses the existing screening flags, follow-up model, local database, and dashboard.

Keep each feature independently testable and mergeable. After each phase, run the existing test suite and an end-to-end Android test before proceeding.

**Guiding principle:** Make the existing workflow trustworthy first, make its offline state visible second, and make its follow-up actions trackable third.
