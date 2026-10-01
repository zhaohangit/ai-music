# MXAPI Suno V2 product contract

Audited against the live MXAPI API Test and endpoint documentation on 2026-08-26.
This is the product parity checklist for MuseFlow, not a provider credential or
an API playground. Provider identifiers are always resolved from resources
owned by the signed-in MuseFlow user. Live requests are sent to the ModelCross
Suno V2 gateway with a short-lived task token bound to the user, client,
product, resource, operation, model, maximum cost, and idempotency key.
ModelCross injects the permanent MXAPI credential and never returns it to
MuseFlow or the browser.

## Supported endpoints

| Capability | Provider endpoint | Parameters | Product surface |
| --- | --- | --- | --- |
| Generate music | `POST /api/v2/music/generate` | `gpt_description_prompt`, `prompt`, `tags`, `negative_tags`, `mv`, `title`, `make_instrumental`, `task`, `continue_clip_id`, `continue_at`, `cover_clip_id`, `metadata` (including `create_mode`, `vocal_gender`, `control_sliders`, `can_control_sliders`) | Creation workspace and source-track actions |
| Generate sound | `POST /api/v2/music/sound` | `title`, `tags`, `mv`, `tempo`, `key`, `loop` | Creation workspace |
| Query one task | `GET /api/v2/music/task` | Query: `id` | Owner-scoped task center and Worker polling |
| Query task batch | `GET /api/v2/music/tasks` | Query: `ids`, `page`, `size` | Owner-scoped task center and Worker polling |
| Upload reference audio | `POST /api/v2/music/upload` | `audio_url`, `copyrightAudio` | Private reference-audio upload workflow |
| Get whole song | `POST /api/v2/music/whole-song` | `clip_id` | Completed-track actions |
| Align lyrics | `POST /api/v2/music/aligned-lyrics` | `lyrics`, `suno_id` | Completed-track asset actions |
| Remaster | `POST /api/v2/music/upsample` | `clip_id`, `model_name`, `variation_category` | Completed-track actions (two output tasks) |
| Generate video | `POST /api/v2/music/video` | `task_id`, `suno_id` | Completed-track asset actions |
| Convert to WAV | `POST /api/v2/music/convert-wav` | `task_id`, `suno_id` | Completed-track asset actions |
| Crop music | `POST /api/v2/music/crop` | `clip_id`, `crop_start_s`, `crop_end_s` | Completed-track actions |
| Change speed | `POST /api/v2/music/speed` | `clip_id`, `speed_multiplier`, `keep_pitch`, `title` | Completed-track actions |
| Provider points balance | `GET /api/v2/points/balance` | None | Administrator provider diagnostics only |
| Provider points logs | `GET /api/v2/points/logs` | Query: `page`, `pageSize` (1–100) | Administrator provider diagnostics only |

## Generate modes

## Provider cost and ModelCross user pricing

The public MXAPI snapshot at
`GET https://open.mxapi.org/api/v2/gemini3pro/v2/channel-points` is the
provider-cost source. MuseFlow does not expose those merchant points as user
credits. ModelCross publishes the user-facing `WORK_BILLING_CATALOG_JSON`.
The deployment sync utility compiles each music operation as:

```text
user credits = ceil(provider points × MUSEFLOW_UPSTREAM_COST_MULTIPLIER)
```

The default multiplier is `4`. `copyrightAudio=true` adds the documented 15
provider points before applying the multiplier. An upload-and-extend workflow
adds the upload and generation provider costs before applying the multiplier.
The generated catalog has a content-derived `price_version`, so an upstream
price or multiplier change requires a fresh quote and cannot silently alter an
existing reservation. The ModelCross wallet is the only user charge authority;
MXAPI `remaining_points`, `points_cost`, and `points_refunded` remain provider
merchant diagnostics.

For the current public snapshot (multiplier 4), the generated user prices are:

| ModelCross operation | Provider cost | User credits |
| --- | ---: | ---: |
| `generation_pair`, `extend_pair`, `cover_pair`, `remaster_pair` | 80 | 320 |
| `sound_pair` | 15 | 60 |
| `upload_single` | 1 | 4 |
| `upload_copyright_single` | 1 + 15 | 64 |
| `upload_extend_pair` | 1 + 80 | 324 |
| `upload_copyright_extend_pair` | 1 + 15 + 80 | 384 |
| `whole_song_single`, `aligned_lyrics_single`, `video_single`, `convert_wav_single`, `crop_single`, `speed_single` | 1 | 4 |

`extend`, `upload_extend`, and `cover` are values of the generate endpoint's
`task` field, not separate endpoints.

MXAPI's generate endpoint currently returns exactly two `task_ids` and has no
published quantity parameter. MuseFlow therefore exposes a product-level
`outputCount` choice (1 or 2) before submission: both upstream tasks remain
tracked for reconciliation, while choosing 1 keeps only the first result in
the owner-facing library. The quote remains the `generation_pair` price until
MXAPI publishes a true single-result operation; the UI states this boundary
next to the selector.

- Inspiration mode sends `gpt_description_prompt` and omits `prompt`/`tags`.
- Custom mode sends `prompt` and `tags` and omits `gpt_description_prompt`.
- The upstream guide marks `mv` and `make_instrumental` optional. MuseFlow's
  server still resolves a selected model and a boolean default before sending
  the wire request, so users do not need to hand-author either field.
- V4.5+ requests map the selected mode to `metadata.create_mode`; its exact
  values are `simple` and `custom`. Earlier models omit the metadata envelope.
- `task=extend` requires `continue_clip_id` and non-negative `continue_at`.
- `task=upload_extend` uses an uploaded clip plus `continue_at`; `audio_weight`
  is available only for an uploaded-audio follow-up supported by the selected
  model.
- `task=cover` requires `cover_clip_id`.
- `metadata.vocal_gender` accepts `m` or `f`.
- `metadata.control_sliders` contains `style_weight`,
  `weirdness_constraint`, and conditionally `audio_weight`.
- `metadata.can_control_sliders` is generated by the server from the sliders
  actually present on the wire. It contains `style_weight` and
  `weirdness_constraint`, plus `audio_weight` only when that value is sent for
  an uploaded-audio follow-up. It is displayed as a derived contract field,
  not as another user-editable input.

Generation model ids:

`chirp-fenix`, `chirp-crow`, `chirp-bluejay`, `chirp-auk`,
`chirp-auk-turbo`, `chirp-v4`, `chirp-v3-5`, `chirp-v3-0`.

Documented text limits:

- V5/V5.5: title 100, lyrics 5000, style 1000 characters.
- Earlier documented versions: title 80, lyrics 3000, style 200 characters.
- The live guide does not publish numeric ranges for the three metadata
  weights. MuseFlow therefore obtains their ranges from the server-owned model
  capability catalog instead of presenting a provider range as fact.

## Operation-specific rules

- Sound requires `title` (100 characters), `tags` (1000 characters), and an
  `mv` of `chirp-crow` or `chirp-fenix`. The documented form defaults are
  `tempo=99`, `key=D`, and `loop=true`; no BPM range or key enum is published.
- Batch task query uses comma-separated `ids`, `page=1`, and `size=10` by
  default.
- Upload sends a server-generated, short-lived `audio_url`; the browser never
  receives the provider credential or controls the signed object URL.
- Remaster maps V4 to `chirp-up`, V4.5 to `chirp-bass`, V5 to `chirp-carp`,
  and V5.5 to `chirp-flounder`. `variation_category` accepts `subtle`,
  `normal`, or `high` for V5 and newer.
- Crop requires `crop_start_s >= 0` and `crop_end_s > crop_start_s`.
- Speed accepts `0.25`, `0.5`, `0.75`, `1`, `1.25`, `1.5`, or `2`;
  `keep_pitch` defaults to `true` and `title` is optional.
- `clip_id` and `suno_id` are the completed task's `custom_id`.
- Video/WAV `task_id` is the numeric provider record id, not the opaque task
  id. MuseFlow derives all three identifiers from an owner-scoped Track.

## Result parsing

- Ordinary music operations read `result.fileInfo.duration`, `mp3Url`,
  `mp4Url`, and `cosUrl`, plus `result.custom_id`.
- `result.extend` is a JSON-encoded string and must be parsed defensively.
- Video reads `extend.video_url`.
- WAV conversion reads `extend.wav_file_url`.
- Aligned lyrics reads `extend.state` and `extend.alignment[]`; each item has
  `word`, `start_s`, `end_s`, `success`, and `p_align`.
- Billing reconciliation records `points_cost` and `points_refunded`, while
  the user-facing wallet and charge authority remains ModelCross.

## Provider points diagnostics

The V2 API-test catalog also publishes two read-only merchant-account endpoints:

- `GET /api/v2/points/balance` has no path, query, or body parameters and
  returns `data.remaining_points`.
- `GET /api/v2/points/logs?page=1&pageSize=20` returns
  `data.list` and `data.pagination` (`page`, `pageSize`, `total`, and
  `totalPages`). `pageSize` must be between 1 and 100.

MuseFlow calls these endpoints only from the server. The optional diagnostic
route is administrator-only; these values are never displayed as a user's
ModelCross credits and never participate in reservation, settlement, refund,
or purchase flows.

## Explicitly out of scope

The current live MXAPI V2 Suno documentation does not publish persona,
mashup, stem separation, replace-section/infill, or a standalone lyric-writing
endpoint. MuseFlow must not advertise these as MXAPI-backed Suno capabilities.

## 2026-09-29 contract update

The live API Test now lists `chirp-hawk` (V6), `chirp-hawk-wild` (V6 Wild),
and `chirp-goose` (V6 Mini). Older music-generation identifiers are compatibility
aliases redirected upstream; the separate Sound contract still explicitly uses
`chirp-crow` / `chirp-fenix`.

- `metadata.is_max_mode`: boolean; double provider charge. The product uses a
  separate `generation_max_pair` quote/reservation, never the standard quote.
- `metadata.control_sliders.aug_creativity`: finite number from 0 through 4.
- Current download endpoints: `POST /api/v2/music/download-wav`,
  `/download-mp3`, `/download-m4a`, each requiring **only** `suno_id`.
- Downloads normalize `extend.wav_file_url`, `mp3_file_url`, `m4a_file_url`, then
  persist private assets. Numeric provider record ID is still required for Suno
  music video, but is no longer required for these download actions.
- The legacy `SunoClient.convertWav` method remains for older adapters; the
  product's `convert_wav` action calls the current `download-wav` endpoint.
- Remaster uses an independent output model. The documented V5 output
  `chirp-carp` is used when remastering a V6 source; it is not labeled V6 output.
- Image-driven MV production uses the separate video adapters in
  `server/src/platform/mv`, documented in `docs/mv-studio.md`.

The earlier August snapshot above describes historical behavior; this section
supersedes its model list, advanced generation fields and audio download route.
No stem separation, MIDI conversion or exact lip-sync endpoint is advertised as
Suno functionality because the current public Suno contract does not list them.
