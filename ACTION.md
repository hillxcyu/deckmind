# Action Log

## 2026-08-14 - Update Model Configuration to gemini-3.7-flash
*   [x] **Update src/utils/env.ts:** Update default fallbacks for `getMainModel` and `getFlashModel` to `'gemini-3.7-flash'`.
*   [x] **Update cloudbuild.yaml:** Update `_MAIN_MODEL` and `_FLASH_MODEL` to `'gemini-3.7-flash'`.
*   [x] **Local Verification:** Run `npm run build` or `tsc` to verify no compilation errors.

## 2026-07-22 - Model Update & Redeployment
*   [x] **Update cloudbuild.yaml:** Update main model to `gemini-3.6-flash` and flash model to `gemini-3.5-flash-lite` in substitutions.
*   [x] **Update src/utils/env.ts:** Update default fallbacks to match.
*   [x] **Local Verification:** Verify that local build succeeds (`npm run build` succeeds).
*   [x] **Redeploy:** Triggered GCP Cloud Build (`gcloud builds submit`), which successfully compiled, packaged, and redeployed `deckmind-app` to Cloud Run.
*   [x] **Backup Branch:** Create `main-backup` branch for safety.
*   [x] **Filter Branch:** Remove `application_default_credentials.json` from git history.
*   [x] **Gitignore Update:** Add `application_default_credentials.json` to `.gitignore`.
*   [x] **Push:** Push rewritten history to remote.

## 2025-12-17
*   [x] **Update Model:** Changed Main Agent model to `gemini-3-pro-preview` in `src/services/agentSystem.ts`.
*   [x] **UI Update:** Renamed "Start Composing" to "Apply" in `src/components/StyleConfig.tsx`.
*   [x] **Verification:** Verified build with `npm run build`. Confirmed logic flow for style application.
*   [x] **Apply Style to Slides:** Updated `handleStyleSet` in `src/App.tsx` to recalculate and update `imagePrompt` for all existing slides using the new style.
*   [x] **Mitigate Style Bleed:** Updated `constructImagePrompt` in `src/services/gemini.ts` to prioritize Style Context over Visual Description details. Updated `deck_agent` in `src/services/agentSystem.ts` to request style-neutral visual descriptions.
*   [x] **Strict Style Enforcement (REVERTED):** Removed the strict rules from `constructImagePrompt` as per user request.
*   [x] **Rewrite Visual Descriptions (REPLACED):** Removed the manual batch rewrite function.
*   [x] **Agent-Based Regeneration:** Updated `handleStyleSet` in `src/App.tsx`.
*   [x] **Full Deck Rebuild:** Further updated `handleStyleSet` prompt to instruct the Main Agent to delegate to `deck_agent` for a *full rebuild* of the deck.
*   [x] **Model Swap & Detail Update:**
    *   **Main Agent:** Reverted to `gemini-2.5-flash` for speed/cost.
    *   **Deck Agent:** Upgraded to `gemini-3-pro-preview` for higher quality creative output.
    *   **Instructions:** Updated `deck_agent` instructions to demand highly detailed, concrete visual descriptions focusing on objects, interactions, and diagrams to assist the image generator.
*   [x] **Enable Multimodal Input:**
    *   Modified `src/lib/adk.ts` to update the `Agent` interface and `LlmAgent.run` method to accept and correctly handle multimodal input (text and `inlineData`).
    *   Confirmed that `src/services/gemini.ts` passes the full `message` object to `mainAgent.run`.
    *   **Backend Fix:** Updated `server.ts` to correctly handle multimodal payloads (attachments) in the `/api/chat` route, preventing the server from discarding attached files before they reached the agent.
    *   **Backend Array Handling:** Further refined `server.ts` to correctly parse the array-based message format sent by the frontend into the object format expected by `LlmAgent`.
    *   **Fix SDK Usage:** Corrected the `chat.sendMessage` call in `src/lib/adk.ts` to pass the `parts` array directly, resolving the "ContentUnion is required" error.
*   [x] **Fix Excessive Logging:**
    *   Modified `src/lib/adk.ts` to truncate base64 data in logs, preventing console flooding.
    *   Improved robustness of `text` part construction (ensuring it's never empty) and added validation for `inlineData` structure.
