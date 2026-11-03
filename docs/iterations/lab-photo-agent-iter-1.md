# Lab iteration — photo-agent-iter-1: `segment_photo` as a first-class agent tool (2026-11-02)

Model: `muse-spark-1.3` for all code and prose. No escalation.

## Starting point

Photo runs existed as a kind (`LabRunKind = 'idea' | 'paper' | 'photo'`) with no
agent path: `TOOL_NAMES` had no photo entry, the playbook described no photo
flow, and `POST /api/lab/agent` rejected `kind: 'photo'`. The only photo path
was the two-call `/photo` UI (`PhotoFlow` → `POST /api/lab/segment`):
segment whole image, crop client-side on canvas, label crops, search, enrich.

## What changed and why

- `lib/agent/tools/index.ts` — new `segment_photo` tool: SAM 3 segments
  (`lib/baseten-sam3.ts`, unchanged), Muse names each box from the full photo
  + box list, OpenIdea finds datasheets/listings, Muse writes the parts list.
  Same provider order as the `/photo` route's two calls, in one turn.
  Degrades without throwing: Baseten/Muse/search keys missing → named
  `missing` observation; GPU cold start → `warming: true` retry note;
  Baseten budget stop → 429-style observation; no photo → `needsHuman`
  (`photo_upload`) so resume can attach one.
- `lib/muse.ts` — new `labelSegments(image, boxes)`. The server has no image
  decoder (the UI crops on a canvas) and must not gain one, so boxes travel as
  text next to one full-image vision input. Same `{"parts": [...]}` contract
  as `labelParts`. `Content` widened to mixed text+image arrays (old shapes
  still assign).
- `lib/agent/types.ts` — `photoImage?` (data URL held for retries),
  `photoSegments?` (boxes/scores only — masks are full-size PNG data URLs and
  would bloat the progress store), `parts?`, `partsMarkdown?`.
- `lib/agent/loop.ts` — `createRun` accepts `image`; `resumeRun` accepts an
  `image` patch (the photo_upload path); assistant history + act log redact
  `data:image/…` to `[image …KB held on run]` so megabytes of base64 never
  reach the controller context; `summarize()` reports photo state
  (hasImage/segments/parts/hasPartsList).
- `lib/agent/verify/prototype.ts` — photo submit branch: needs `partsMarkdown`
  + citations ⊆ resources; no files/sandbox/verdict (a parts list is not code).
- `lib/agent/playbook.md` — `segment_photo` bullet (call with `{}`, never
  paste image bytes) + Photo path section (segment → cite → submit; skip
  draft/run/fix).
- `app/api/lab/agent/route.ts` — `kind: 'photo'`, optional `image` on start
  and resume (3MB cap, shared `MAX_PHOTO_CHARS`).
- `docs/ARCHITECTURE.md`, `PARTNERS.md` — diagram tool list + SAM paragraph;
  Baseten row now names the agent tool file.
- `tests/agent-photo.test.ts` (new, 11 tests) — registry, photo_upload pause,
  bad/oversized image, Baseten-missing degradation, offline `set_plan`, mocked
  success path (segment → label → search → markdown), warming retry, photo
  submit gate, `createRun` photo hold, `labelSegments` missing-key shape.

## Cost

One photo turn spends: 1 Baseten segment call (GPU seconds) + 2 Muse
contributor calls (label, enrich) + 1 OpenIdea search. Same as the `/photo` UI
path; labelling still caps at 12 parts.

## How to test

Checks (run before pushing, CI runs the same):

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Unit (no keys): `pnpm vitest run tests/agent-photo.test.ts` — 11 tests, all
offline except the mocked-provider success path.

Manual (keys needed for the live path):

1. `cp .env.example .env.local`, fill `META_API_KEY` (+ `OPENIDEA_API_KEY` for
   context, `BASETEN_API_KEY` + `BASETEN_SAM3_MODEL_ID` for real segmentation).
2. Start a photo run without Baseten keys:
   `POST /api/lab/agent {action:"start", kind:"photo", input:"bench power supply"}`.
   Expect: the run pauses with `waiting: 'photo_upload'` is NOT the first
   failure — first, `segment_photo` reports `baseten is not configured` naming
   `BASETEN_API_KEY`; the controller should `request_human`, not spin.
3. Attach a photo: `POST /api/lab/agent {action:"resume", runId, image:"data:image/jpeg;base64,…"}`.
   Expect: `Human uploaded the photo`, status back to `running`.
4. With Baseten keys set: start a photo run with `image` included. Expect one
   `segment_photo` turn reporting `segments`, `parts` with names/confidences,
   `markdown` parts list, and merged openidea URLs; then `set_plan` →
   `cite_sources` → `submit_prototype` → `finish`.
5. Cold GPU: if the observation says `warming: true`, call `segment_photo`
   again with `{}` after ~30s. Expect segments on the retry.
6. Oversize: start with a >3MB data URL. Expect zod 400 or the shrink-it
   observation, never a context blow-up (check the run's assistant messages
   contain `[image …KB held on run]`, not base64).

## Known gaps (deliberate)

- Agent labelling reads boxes off the full photo; the `/photo` UI's per-part
  crops can name tiny parts better. Same JSON contract, so a future
  server-side crop could swap in without touching the tool.
- ~~The agent console UI (`app/agent`) still offers only idea/paper kinds; photo
  runs start via the API until the UI gains an upload control.~~
  Closed: `app/agent` now offers the photo kind with an attach control, a
  `photo_upload` pause/resume path, and a parts-list panel (no sandbox hop).
- `draft_code` on a photo run drafts a notebook (harmless); the playbook says
  to skip it, no gate enforces that yet.
