# Live generation acceptance plan

**Goal:** Verify the application with actual paid upstream jobs, distinguish API reliability from artistic and identity quality, and retain reproducible evidence.

**Architecture:** Use the existing local application HTTP endpoints and the existing dev-user-1 account. Every mutation receives a persistent operation key before submission. State, task IDs, responses and downloaded outputs are saved under artifacts/live-acceptance-20260930. Authentication remains in .secrets. Do not automatically resubmit unknown paid operations. Retain test projects for inspection; do not overwrite the user's published MV.

**Scope from user:** Real lyrics LLM actions, music capabilities, photo-based moving/singing MV, song/lyrics/person alignment, foreground vocals, subtitles, automated full workflow; testing credits are authorized.

## Work

- [ ] Record current catalogs, readiness, existing song and reference assets.
- [ ] Execute all seven enabled AI actions through /api/ai/assist; verify meaningful text, structure, continuity/translation, acceptance persistence, and replay without extra calls.
- [ ] Execute simple/custom/instrumental music, sound, extend, cover, remaster, upload/import, upload-extend, whole-song, crop, speed, aligned lyrics, native music video, WAV/MP3/M4A. Test standard and max separately where enabled. Track provider terminal state and private media validity.
- [ ] Execute one bounded shot per enabled video model using the user-provided photo, plus audio-reference singing. Verify private downloads, dimensions, duration, movement, subtitle and source-song relation. Record provider/model failures without replacing evidence with mocks.
- [ ] Inspect generated lyrics and representative decoded video frames; measure audio energy, duration and clipping. Explicitly leave listening quality and exact lip sync unconfirmed if no direct evaluation is available.
- [ ] Fix reproducible application faults with targeted regression tests, rerun affected real operations once, and save original failures.
- [ ] Produce a matrix with per-operation/model receipts, actual costs where observable, outputs, limitations and reproduction commands.
