# Define - Tasks List

**Date:** Wednesday, 22 July 2026

Below is the decomposed task list for updating the model configurations and triggering the deployment.

- [x] **[backend] [config]** Update model substitutions in `cloudbuild.yaml` (main: `gemini-3.6-flash`, flash: `gemini-3.5-flash-lite`).
- [x] **[frontend] [backend] [config]** Update default model fallbacks in `src/utils/env.ts` to match.
- [x] **[build]** Run local verification (TypeScript check & project compilation) to ensure no errors.
- [x] **[deploy]** Trigger Cloud Build and deploy to Cloud Run via `gcloud builds submit --config cloudbuild.yaml .`.
