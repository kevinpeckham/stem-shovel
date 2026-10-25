# Effect: assessment and a phased plan

Kevin asked (2026-10-25) whether the Effect library
([effect.website](https://effect.website/docs/v4/onboarding)) would harden
the code and make error handling uniform. This document is the answer:
what Effect is, what the server code does today, where the two meet, and a
plan that starts with a pilot small enough to throw away. It is a proposal,
not a decision.

## The short answer

**Moderately compelling, in one place.** Effect would pay for itself in
the media pipeline behind `POST /api/jobs` (`src/lib/server/transcode.ts`,
`mix.ts`, `notes.ts`, `notationPdf.ts`, `dawprojectExport.ts`, the digest
in `notifications.ts`): long-running work against ffmpeg, Blob, Turso and
the AI Gateway with no timeouts, no cancellation, failures that only reach
the Vercel logs, and loops where one bad id drops the rest. That is exactly
the shape Effect is built for: typed errors, timeouts that interrupt,
resources released on every path, bounded concurrency, one place to report.

**Not compelling elsewhere.** The 204 remote functions already have a
clean, uniform error contract (`error()`/`invalid()` → `handleError` →
`errorMessage`), valibot validates at the boundary in a kilobyte, and the
Svelte components and audio engines are the wrong shape entirely. Effect
stays off the client and out of the remote functions.

**Three of the biggest problems do not need Effect.** Reporting background
failures to Sentry, isolating one id's failure from the next, and putting a
timeout on ffmpeg are each a few lines of plain TypeScript. They should
land first (Phase 0), so the pilot is judged on structure and uniformity,
not on fixing things any helper could fix.

## What Effect 4 is (verified 2026-10-25)

- `effect@4.0.6` is the stable `latest` (4.0.0 on 2026-10-01, a patch every
  few days since). Long-term support: bug fixes to September 2029. ESM-only,
  zero dependencies, so it meets the server-dependency rule.
- `Effect<A, E, R>` is a lazy program with a success type, a typed error
  channel and typed requirements. `Data.TaggedError` classes and
  `Effect.catchTag` make errors part of the signature.
- Services and Layers are dependency injection: a test provides a fake
  layer instead of `vi.mock`-ing nine modules.
- `Effect.acquireRelease` and `Effect.scoped` guarantee release
  (a temp directory, a child process) on success, failure and interruption.
- `Effect.timeout` fails with a typed error _and interrupts the work_;
  `Effect.retry(Schedule…)` is a declarative retry; `Effect.forEach(xs, f,
  { concurrency: 2 })` bounds parallelism, and `Effect.result` isolates one
  item's failure.
- `Effect.fn("name")` wraps a generator as a named, traced function;
  `Effect.withSpan` adds spans. `@sentry/effect` exists but is alpha; at the
  edge, `Sentry.captureException(Cause.squash(cause))` works today.
- Cost: 7 kB min+gzip minimal, about 18 kB for a typical service + retry +
  timeout + span program (Rollup; esbuild tree-shakes it badly, Rolldown
  unverified). Importing `effect` unbundled from `node_modules` costs about
  0.2 s on Node 24, so it must join `ssr.noExternal` or be deep-imported.
  Per-request overhead is microseconds.
- v4 broke v3's API widely (`catchAll` → `catch`, `Context.Tag` →
  `Context.Service`, platform packages folded into `effect`), so most blog
  posts and model knowledge are wrong for it; the docs at `/docs/v4` and
  `MIGRATION.md` in the Effect repo are the references.
- Drizzle's native Effect binding for libsql exists only in Drizzle 1.0 RC;
  we stay on 0.45 and wrap calls in `Effect.tryPromise`.

## What the server does today

Read-only survey, 2026-10-25 (paths from the repo root).

- **Jobs**: 13 kinds in one `switch` (`src/routes/api/jobs/+server.ts`),
  each a serial `for … await` loop. A throw drops the remaining ids, and in
  `renderStems` the songs' mix and notes too (`transcode.ts:70-78`).
  `background()` only `console.error`s (`src/lib/server/background.ts:8`),
  and no server module calls Sentry; `hooks.server.ts` is the only
  `captureException`.
- **Timeouts**: the TensorFlow child has one (`notes.ts:101`). No ffmpeg
  `execFile`/`spawn`, Blob call, Resend send, AI Gateway fetch or jobs
  dispatch fetch has one; Redis is the exception (`redis.ts`, 2 s). Children
  are never killed.
- **Concurrency**: `mix.ts:144` downloads every stem at once, and when one
  fails the `finally` removes the directory while the others are still
  writing. `notes.ts:174` decodes every stem at once. Reorders run N
  parallel updates (`data.ts:1349`, `:1371`).
- **Cleanup**: every `mkdtemp` has a `finally { rm }` (good). Streams in the
  zip routes have no `cancel` handler.
- **Errors**: no custom error classes anywhere; 53 server throws are
  `new Error(string)` and callers match on message text
  (`shortLinks.ts:172`). Remote functions throw `error()` 267 times and
  `invalid()` 29 times; the client unwraps with `errorMessage` at 173 sites.
- **Duplicates**: the download-to-temp-file snippet appears about 8 times;
  the AI retry loop twice (`textToBeat.ts`, `textToChords.ts`).
- **Email**: send, then mark `emailedAt` in a separate statement
  (`notifications.ts:156-167`, and the digest); a failed mark resends.
- **Tests**: 47 `vi.mock` calls across 18 server test files;
  `transcode.test.ts` mocks nine modules. `tests/helpers/fakeDb.ts` is a
  731-line interpreter of Drizzle expressions.
- **Already clean**: the Redis fallback, the claim/finish/fail row state
  machine (durable, idempotent, self-retrying through stale windows), and
  the remote-function error contract.

## Where Effect helps, and where it would not

| Problem                                   | With Effect                                                   | Without                                        |
| ----------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------- |
| Job failures invisible                    | `catchCause` at one edge reports every job                    | a 5-line `background()` change                 |
| One id stops the batch                    | `Effect.forEach` + `Effect.result`                            | `try/catch` per iteration                      |
| ffmpeg never times out, never killed      | `Effect.timeout` interrupts; `acquireRelease` kills the child | `execFile` `timeout` option (kills on its own) |
| Unbounded downloads, abandoned on failure | `{ concurrency: 3 }`, siblings interrupted                    | `p-limit` + `AbortController` plumbing         |
| Errors told apart by message text         | `TaggedError` classes, `catchTag`                             | hand-written classes                           |
| Nine `vi.mock`s per test                  | a fake `Layer` per service                                    | the status quo                                 |
| Eight copies of download-to-temp          | one scoped effect                                             | one async helper                               |
| Blob/AI transport retries                 | `Schedule.exponential` with jitter                            | a loop                                         |
| No transactions / cascades half-done      | nothing: that is Drizzle `db.batch` on libsql                 | the same                                       |
| Remote-function errors                    | no gain                                                       | already uniform                                |
| Components, audio engines                 | out of scope                                                  |                                                |

Reading the right column honestly: every row has a plain answer. What
Effect adds is that the answers are the _same_ answer across 13 job kinds,
checked by the type system, with interruption and cleanup that are hard to
get right by hand (a timeout that also kills ffmpeg and removes the temp
dir while two sibling downloads stop). The bet is on uniformity and on the
long tail of pipeline code still to come (the Studio's renders, more
exports), not on any single fix.

Costs to weigh: a second mental model next to async/await for whoever
reads the server (Kevin and Claude both, and Claude's training leans v3);
a 3.5-week-old major with weekly patches; `@sentry/effect` alpha; and the
pull toward Effect Schema from the Effect-native pieces, which we decline.

## The plan

### Phase 0: the plain fixes and the measurement (one day, no Effect)

1. `background()` reports to Sentry with the job kind as context.
2. Each job loop isolates one id's failure (log, report, continue).
3. ffmpeg calls get a `timeout` (`execFile` kills the child on it).
4. On a preview deployment, measure the jobs function's cold start with
   `effect` added to `ssr.noExternal` and one trivial import, against the
   current build. The jobs function already carries ffmpeg and tfjs, so the
   bar is "no measurable change"; a page function would be a different
   question, which is one reason Effect stays out of page code.

### Phase 1: the pilot, `ensureOriginalMix` (two to three days, then two weeks on dev and staging)

The mix job (`src/lib/server/mix.ts`, 248 lines) is the right size: it
claims a row, downloads N stems, runs ffmpeg, uploads, finishes the row,
deletes the old blob, releases the claim on failure, and has a four-mock
test. It touches every concern once.

- `src/lib/server/effect/` holds the foundation: `errors.ts`
  (`BlobError`, `DbError`, `FfmpegError`, `TimeoutError` as tagged errors),
  `services.ts` (`Blob`, `Db`, `Ffmpeg`, `Clock` as `Context.Service` with
  live layers wrapping the existing modules), `runtime.ts` (a
  `ManagedRuntime` built from the live layers, with the layer build
  retried so a transient cold-start failure does not poison the instance)
  and `runJob.ts` (the edge: `runPromise` with `catchCause` →
  `Sentry.captureException(Cause.squash(cause))`, plus a span per job).
- `mix.ts` is rewritten inside, with the same exported signature
  `ensureOriginalMix(songId: string): Promise<void>`, so no caller changes.
  The claim/release pair becomes `acquireRelease`; the temp dir is scoped;
  downloads run with `concurrency: 3` and are interrupted together; ffmpeg
  runs under `Effect.timeout("120 seconds")` with the child killed on
  interruption; Blob reads retry on a transient status with exponential
  backoff and jitter.
- `mix.test.ts` provides fake layers instead of `vi.mock`; the old test is
  kept until the new one covers the same cases. `@effect/vitest` is not
  used in the pilot (it re-exports Vitest; we import from `vite-plus/test`).
- `effect` joins `ssr.noExternal`; `fallow guard` confirms no import
  boundary moves; `bunx fallow` reports no new unused exports.

**Evaluation** (write the numbers into this document at the end):

- Cold start of the jobs function: before and after, two cold hits each.
- Lines: `mix.ts` + its test before and after; `vi.mock` count in the test.
- Readability: Kevin reads the new `mix.ts` cold and says whether he could
  change it. This is the decisive criterion.
- Behavior: a stem that 404s, an ffmpeg that hangs (a fake that sleeps),
  and a Turso 502 on `setSongMix`, each exercised on dev, each reaching
  Sentry with the right tag, the temp dir gone, the claim released.
- Any Effect bug or doc gap hit, recorded in FINDINGS.md.

**Kill switch**: the exported signature is unchanged, so reverting is one
`git revert` and removing the dependency.

### Phase 2: the pipeline (if the pilot is a go; two to three weeks, incremental)

Order by risk reduction per hour:

1. `transcode.ts`: `transcodeStem`, the `render*` and `measure*` families,
   on the shared `downloadToTemp` and `runFfmpeg` effects; `renderStems`
   becomes `forEach` with isolation and the mixes and notes still follow.
2. `notes.ts` (bounded decodes, the TensorFlow child under a scope),
   `notationPdf.ts`, `dawprojectExport.ts`.
3. The jobs `switch` collapses to a table of `kind → Effect`, run by
   `runJob`; the dispatch fetch in `jobs.ts` gets a timeout and one retry.
4. An `Ai` service: the two retry loops become one, with a transport
   timeout and retry separate from the parse retry.
5. The digest: a time budget for the run and per user, and send-then-mark
   made idempotent (mark first as "sending", or dedupe on resend).
6. `moveBlob` buffers like `copyBlob` does (independent of Effect; do it
   in Phase 0 if it bites first).

Each step keeps its module's exported Promise signatures, so remote
functions and routes never see Effect.

### Phase 3: later, and only if wanted

- `@sentry/effect` once it leaves alpha, for spans in Sentry instead of
  the capture-at-the-edge.
- Drizzle 1.0's `effect-libsql` once stable, if transactions through the
  `Db` service become worth it (`db.batch` on libsql is the real fix for
  cascades and reorders and does not wait on Effect).
- Nothing in remote functions, components or validation. Revisit only if
  a remote function grows an orchestration (several external calls with
  compensation) that the pipeline's helpers would serve.

## Pilot results (filled in as they come)

Phase 0 landed on 2026-10-25 (commit 4794540): failures in background work
and in one id of a job reach Sentry tagged with the job kind, every job
loop continues past a bad id, every ffmpeg run has a 240 s bound.

The pilot landed the same day: `src/lib/server/effect/` (errors, services,
runtime, `runJob`; 221 lines plus a 61-line service test) and `mix.ts`
inside Effect behind its unchanged exports. The v4 names and traps met on
the way are in FINDINGS.md ("Effect 4 in practice").

| Measure                                                                           | Before                    | After                                                                                                                                  |
| --------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `mix.ts` lines                                                                    | 249                       | 351 (plus the 221-line foundation, shared from here on)                                                                                |
| `mix.test.ts` lines                                                               | 148 (pure parsers only)   | 297 (plus six behavior cases: happy path, 404 without retry, 503 then 200, hanging ffmpeg killed, failing `setSongMix`, refused claim) |
| `vi.mock` calls in `mix.test.ts`                                                  | 4                         | 2 (the data and blob modules, so loading the live layers never reaches `db/index.js` in CI)                                            |
| Mix chunk, bundled                                                                | ‑                         | 70 kB minified, 24 kB min+gzip including mix.ts (the server bundle; nothing reaches the client)                                        |
| Jobs function cold start, untouched preview, `POST /api/jobs` → the app's own 401 | 4.46 s (warm 0.13–0.18 s) | 4.34 s (warm 0.12–0.17 s): no measurable change, as expected for the function that already carries ffmpeg and tfjs                     |

Behavior exercised by tests rather than on dev: a stem that 404s fails
with `BlobError` 404 after no retry, the claim released and the temp dir
gone; an ffmpeg that never ends is killed at the timeout (a real ffmpeg in
the service test, checked with `pgrep`); a failing `setSongMix` is a
`DbError` with the claim released.

Still to do for the evaluation: Kevin reads the new `mix.ts` cold (the
decisive criterion); two weeks on dev and staging; the three failure modes
provoked on dev and seen in Sentry with their tags.

## Phase 2 progress

- 2026-10-25: step 1 (transcode.ts, the shared helpers), step 4 (the `Ai`
  service) and step 6 (`moveBlob` buffering under 256 MB) landed. Left:
  step 2 (notes.ts, notationPdf.ts, dawprojectExport.ts), step 3 (the jobs
  switch as a table, the dispatch fetch bounded), step 5 (the digest's
  time budget and idempotent sends).

## Decision record

- 2026-10-25: proposed; Kevin: "go ahead with Phase 0 and start the
  pilot". Both landed the same day. Go/no-go on Phase 2 after the
  evaluation.
