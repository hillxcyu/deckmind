# Define: Apply Style to Existing Slides

## User Request
*   When style is updated, apply it to existing slides (update their `imagePrompt`) without regenerating images immediately.

## Tasks
- [frontend] Update `handleStyleSet` in `src/App.tsx`:
    - Iterate through the existing `slides` state.
    - Recalculate the `imagePrompt` for each slide using the `constructImagePrompt` helper and the *new* style.
    - Update the state of `slides` with the new prompt.
    - Ensure `imageUrl` and `status` remain unchanged so it doesn't trigger a re-render/fetch.
- [frontend] Import `constructImagePrompt` in `src/App.tsx`.

## Dependencies
- `constructImagePrompt` from `src/services/gemini.ts`.