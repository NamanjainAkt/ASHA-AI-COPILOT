# Qwen3 0.6B Model Download, Packaging & APK Strategy Analysis

**Date:** 2026-10-09  
**Status:** Resolved & Verified  
**Affected Subsystems:** `apps/mobile/services/ai/modelManager.ts`, `apps/mobile/app/(tabs)/profile.tsx`, `services/api/main.py`, `dist/ASHA-AI-Copilot-v1.0.0-release.apk`

---

## 1. Problem Statement & User Investigation

Frontline mobile testers encountered failures when attempting to download the **Qwen3 0.6B** clinical summarization model from the app's Profile screen (`apps/mobile/app/(tabs)/profile.tsx:157-183`). The download failed immediately or mid-transfer, reporting `"Could not download model. Check server and network"`.

Suspecting an invalid or broken download endpoint, an end-to-end audit was conducted across:
1. The remote Hugging Face origin repository.
2. The Expo `FileSystem.createDownloadResumable` transport layer.
3. The HTTP response status validations.
4. The production APK packaging strategy and offline clinical fallback.

---

## 2. Root Cause Analysis

### A. Upstream Origin vs. Strict Status Check
- **Configured Endpoint:** `https://huggingface.co/Cactus-Compute/Qwen3-0.6B/resolve/main/weights/qwen3-0.6b-int4.zip` (`apps/mobile/services/ai/modelManager.ts:73`).
- **Origin Verification:** Live probing confirmed the Hugging Face repository exists, is public, and holds the INT4 model weights (size: **376,414,357 bytes**).
- **HTTP 302 / 206 Behavior:** Hugging Face issues an HTTP `302 Found` redirect to AWS CloudFront (`https://us.aws.cdn.hf.co/...`). During chunked or resumed downloads, the CDN returns **HTTP `206 Partial Content`**.
- **Flaw:** `modelManager.ts:385` strictly checked `result.status === 200`. A `206 Partial Content` response caused `downloadSuccess` to evaluate to `false`, discarding the download and setting `model.status = 'error'`.

### B. Error Masking in UI
- In `profile.tsx:173-176`, when `downloadModel` returned `false`, the UI presented a generic message: `"Could not download model. Check server and network."` (`"मॉडल डाउनलोड नहीं हो सका। कृपया सर्वर और नेटवर्क जांचें।"`).
- The actual underlying diagnostic in `model.error` was swallowed, misleading developers into assuming the server URL was incorrect.

### C. APK Packaging vs. On-Demand Staging Architecture
- **Release APK Footprint:** The release APK (`dist/ASHA-AI-Copilot-v1.0.0-release.apk`) is **~86.0 MB**.
- **Packaging Invariant:** The 376 MB neural weights are **intentionally not bundled inside the APK**. Bundling would balloon the APK to > 460 MB, violating Play Store deployment guidelines and exhausting internal storage on low-cost rural devices (16–32 GB storage, 2–3 GB RAM).
- **Offline Invariant Preservation:** When neural models are not downloaded or fail to load, the system seamlessly falls back to `deterministicSummary()` (`apps/mobile/services/ai/cactusDriver.ts:74`). Clinical triage (`evaluateRules()`) remains 100% functional and offline.

---

## 3. Implemented Fixes

1. **HTTP Status Validation:**
   - Modified `apps/mobile/services/ai/modelManager.ts` to accept all successful HTTP status codes in the 200–299 range:
     ```typescript
     if (result && result.status >= 200 && result.status < 300) {
       downloadSuccess = true;
     } else if (result) {
       transportError = `HTTP ${result.status}`;
     }
     ```
   - Captured transport and network exceptions in `model.error`.

2. **UI Diagnostics Surface:**
   - Updated `apps/mobile/app/(tabs)/profile.tsx` to display `modelManager.getModel(id)?.error` in the failure alert, providing instant clarity on connection timeouts, disk space, or HTTP status codes.

3. **Backend Seed & Test Limit Resilience:**
   - Updated `tests/sync_idempotency_test.py:163-170` to query with `limit=500` to prevent pagination clipping across repeated test database executions.

---

## 4. Verification

- All 82 automated test gates across 6 test suites passed:
  - `tests/clinical_rules_test.js`: 13/13 passed.
  - `tests/model_harness_test.js`: 32/32 passed.
  - `tests/edge_cases_test.js`: 15/15 passed.
  - `tests/qwen_summary_test.js`: 6/6 passed.
  - `tests/route_smoke_test.js`: 4/4 passed.
  - `tests/sync_idempotency_test.py`: 12/12 passed.
- Mobile TypeScript typecheck clean (`npx tsc --noEmit --project apps/mobile/tsconfig.json` -> 0 errors).
- Shared package rebuilt (`npm run build --workspace=@asha/shared`).
