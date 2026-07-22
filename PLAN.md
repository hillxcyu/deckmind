# Plan - Model Update & Cloud Run Redeployment

**Date:** Wednesday, 22 July 2026

## Objective
Update the main and flash model configuration to use `gemini-3.6-flash` and `gemini-3.5-flash-lite` respectively, and then trigger a deployment to Cloud Run.

---

## 1. Research Phase (Complete)
- [x] Inspected `cloudbuild.yaml` to identify where model environment variables/substitutions are defined.
- [x] Inspected `src/utils/env.ts` to identify default model fallback settings.
- [x] Searched the codebase to ensure no other occurrences of the old model names exist that would override our new defaults.

---

## 2. Plan (Complete)

### Step 1: Update Model Configurations (Complete)
- [x] Modify `cloudbuild.yaml` substitutions:
  - Change `_MAIN_MODEL` from `gemini-3.1-pro-preview` to `gemini-3.6-flash`.
  - Change `_FLASH_MODEL` from `gemini-3.1-flash-lite-preview` to `gemini-3.5-flash-lite`.
- [x] Modify `src/utils/env.ts` fallback defaults:
  - Change `getMainModel` default fallback to `gemini-3.6-flash`.
  - Change `getFlashModel` default fallback to `gemini-3.5-flash-lite`.

### Step 2: Local Verification (Complete)
- [x] Run compilation/linting to make sure the project builds and compiles cleanly locally (e.g., `npm run build` or `tsc --noEmit`).

### Step 3: Trigger Cloud Build & Cloud Run Deploy (Complete)
- [x] Execute `gcloud builds submit --config cloudbuild.yaml .` to run the deployment pipeline on Google Cloud Platform.
- [x] Verify that the deployment completes successfully.
