# Define - Tasks List

**Date:** Friday, 14 August 2026

Below is the decomposed task list for updating the model configurations.

- [x] **[frontend] [config]** Update default model fallback for `getMainModel` to `'gemini-3.7-flash'` in `src/utils/env.ts`.
- [x] **[frontend] [config]** Update default model fallback for `getFlashModel` to `'gemini-3.7-flash'` in `src/utils/env.ts`.
- [x] **[backend] [config]** Update `_MAIN_MODEL` substitution to `'gemini-3.7-flash'` in `cloudbuild.yaml`.
- [x] **[backend] [config]** Update `_FLASH_MODEL` substitution to `'gemini-3.7-flash'` in `cloudbuild.yaml`.
- [x] **[build]** Run local build and type checks to ensure there are no compilation or runtime syntax errors.
