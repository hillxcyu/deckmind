# Plan - Update Model Configuration to gemini-3.7-flash

**Date:** Friday, 14 August 2026

## Objective
Change both the `GEMINI_MAIN_MODEL` and `GEMINI_FLASH_MODEL` to `gemini-3.7-flash` across the codebase (specifically in defaults and deploy/substitutions configurations) to improve reasoning and speed capabilities of the deck creation system.

---

## 1. Research Phase (Complete)
- [x] Identified environment variables configuration in `src/utils/env.ts` (fallbacks for `GEMINI_MAIN_MODEL` and `GEMINI_FLASH_MODEL`).
- [x] Identified substitutions configuration in `cloudbuild.yaml` (`_MAIN_MODEL` and `_FLASH_MODEL`).
- [x] Verified that no other hardcoded values override these configurations elsewhere.

---

## 2. Proposed Plan

### Step 1: Update Configurations
- [x] Modify `src/utils/env.ts`:
  - Change default for `getMainModel()` fallback to `'gemini-3.7-flash'`.
  - Change default for `getFlashModel()` fallback to `'gemini-3.7-flash'`.
- [x] Modify `cloudbuild.yaml`:
  - Change `_MAIN_MODEL` substitution value to `'gemini-3.7-flash'`.
  - Change `_FLASH_MODEL` substitution value to `'gemini-3.7-flash'`.

### Step 2: Local Verification & Tests
- [x] Run local project verification/compilation to ensure there are no TypeScript errors or compile-time issues.
- [x] (If applicable) Run any automated test suites to ensure model configuration works as expected.

---
