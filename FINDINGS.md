# Findings

Gotchas and insights from working on this code: what a package, a
browser API or a tool did that was not obvious, and what to do about it.
Add an entry whenever one surfaces (CLAUDE.md, "Working agreement").
Newest at the top of each section; say where the lesson came from so
the code can be found. Things the repo already documents as conventions
belong in CLAUDE.md or docs/, not here.

## SvelteKit remote forms refuse a field they did not make: `form_field_unbound` (2026-10-28)

A plain `<input type="hidden" name="venueId">` inside a remote `form` (the venue picker's, posted with the New show form) made the submit throw `SvelteKit error: form_field_unbound: Form contained a field that wasn't created with form.fields.as(...)` in the browser, and the page showed its 500 error view without any request reaching the server. Every field a remote form posts has to come from `form.fields.<name>.as(type, value)`, hidden ones included (`<input {...form.fields.venueId.as("hidden", venueId)} />`, re-evaluated as the state changes), so a reusable picker component leaves the hidden field to the form that owns it. Surfaced by the events browser test; the dev server log was silent, the Playwright trace's console had the error.

## Vite watches Playwright's output folder and reloads the page under test (2026-10-28)

Playwright's `outputDir` (`.screenshots/e2e`) is inside the project, and when a test fails it writes the trace's resource files (`.playwright-artifacts-*/traces/resources/*.html`) there; the dev server saw new `.html` files and triggered a full page reload (`[vite+] (client) page reload .screenshots/e2e/...` in the journal, `hmr_reload_after_error` in the browser console), so a failure in one test could disturb the next. `server.watch.ignored: ["**/.screenshots/**"]` in vite.config.ts stops it.

## Playwright: `setInputFiles` right after `page.reload()` lands before hydration (2026-10-28)

The events spec reloaded the page, asserted a server-rendered input's
value (which passes on the SSR HTML at once) and then called
`setInputFiles` on a hidden `<input type="file">`. The `change` event
fired on an element whose Svelte handler was not attached yet, so nothing
happened and the test waited 30 s for "Poster uploaded"; the same steps
by hand worked every time. `page.reload()` resolves on `load`, before
SvelteKit hydrates. Reload (and `goto`) with `{ waitUntil: "networkidle" }`
before interacting with anything that needs a handler, as the other specs
already do for navigation.

## Vercel function /tmp is ~500 MB; ffmpeg-static's https input segfaults, so big sources go through stdin (2026-10-28, v0.195.0)

A 650 MB FLAC session recording never got its MP3: `downloadToFile`
(src/lib/server/effect/blobIo.ts) failed with `ENOSPC: no space left on
device, write`, because a Vercel function's `/tmp` holds about 500 MB, and
the row failed again on every hourly retry. ffmpeg-static (johnvansickle
7.0.2) lists `https` in `ffmpeg -protocols`, but `ffmpeg -i https://….flac`
segfaults at once (exit 139) on the VM, by the Blob URL and by the raw IP
(so TLS, not DNS), with or without `-reconnect`; `curl … | ffmpeg -i
pipe:0` works. So `transcodeToMp3` (src/lib/server/transcode.ts) pipes a
source over `SOURCE_DISK_BUDGET_BYTES` (256 MB, the claim's `sizeBytes`)
from `BlobStore.read` into ffmpeg's stdin (`Ffmpeg.run`'s `input`), once
per pass (stats, loudness, encode); only the MP3 touches the disk.

What a pipe changes, tried with the bundled binary: a FLAC still prints
its `Duration:` (STREAMINFO carries the sample count), attached picture
and all; a WAV prints `Duration: N/A, bitrate: 3072 kb/s`, so its length
comes from the size over the bitrate (`ffmpegBitrateDuration`); an MP4
with its `moov` at the end cannot be read from a pipe and ffmpeg
**exits 0 with an empty MP3** unless `-xerror` is given (the streamed
encode passes it). When ffmpeg stops reading early (`-t`, a probe) the
write side gets `EPIPE`, which is not a failure; a source that breaks
mid-file ends ffmpeg's input cleanly too, so `Ffmpeg.run` fails the run
on the input's own error even when ffmpeg exits 0.

## varlock falls back to the default environment's values when the chosen one has none (2026-10-26)

`.env.schema` keys the 1Password environment on `APP_ENV`
(`@currentEnv=$APP_ENV`). On a machine whose vault holds no values for an
environment, `APP_ENV=production bunx varlock run -- …` resolves every
secret from the environment it does have, silently: on the exe.dev VM,
`TURSO_DATABASE_URL` under `APP_ENV=production` is the **dev** database's
host, so `bun run db:status`, a row count or a column check "against
production" there describes dev. Print the host first
(`new URL(process.env.TURSO_DATABASE_URL.replace(/^libsql:/, "https:")).hostname`)
before believing any stage-specific run, and treat production checks as
Kevin's machine's alone. Lesson from v0.171.0, shipped on a migration
check that had read dev.

## ffmpeg: ten `astats` outputs cost 70 s on a 45-minute file, ten `volumedetect` sinks 7 s (2026-10-26)

Measuring a recording's level per octave band (the Auto EQ, `asplit` into
ten `bandpass` branches) with `astats` on each branch mapped to `-f null`
took 70 s on a 45-minute MP3, 42 s folded to mono, 34 s with each branch
ending in `anullsink` instead of a mapped output. The same graph with
`volumedetect` on each branch takes 7 s, of which 3 s is the decode.
`volumedetect`'s `mean_volume` is the branch's RMS in dBFS like the
`RMS level dB` of `astats`, rounded to 0.1 dB and about 3 dB offset, the same for
every band, which a fit that aligns curves does not notice. ffmpeg prints
the `Parsed_volumedetect_N` summaries last to first and a first set of
empty instances (`n_samples: 0`) before the real ones, so the parser
sorts by N and lets a later line replace an earlier one. From the
spectrum job.

## ffmpeg's `loudnorm` and `adeclip` are too slow for a long set in a 300 s function (2026-10-26)

Timed on a 45-minute stereo file on one core of the VM (ffmpeg's audio
filters run single-threaded): `loudnorm` measurement 72 s, `loudnorm`
apply with the MP3 encode 82 s, `adeclip` at its defaults ~110 s on top of
the encode, a plain 192 kbps MP3 encode 24 s, `ebur128=peak=true` 12 s,
`astats` under a second. The first leveling chain (declip in both
loudnorm passes) ran a clipped show past Vercel's 300 s and the page
retried it every fifteen minutes with the same result. `loudnorm`
resamples to 192 kHz internally for its true-peak work, which is where
its cost goes; `ebur128` measures the same integrated loudness and true
peak for a sixth of it, and a linear `volume` plus `alimiter` apply pass
costs nothing over the encode. `adeclip=window=30:overlap=50:arorder=4`
costs ~4 s and repairs a clipped file as well as the defaults (no flat
samples left, peaks rebuilt within 0.2 dB): the cost is in the
autoregressive model per window, so a shorter window, less overlap and a
lower order are the levers. `adeclip=overlap=25` is rejected outright
(the minimum is 50). Lesson from the first leveled shows.

## ffmpeg `loudnorm` is two passes, prints its measurement as JSON on stderr, and decodes at ~30× (2026-10-26)

EBU R128 leveling with `loudnorm` needs a first pass over the whole file
(`loudnorm=I=…:TP=…:LRA=…:print_format=json -f null -`), whose numbers
(`input_i`, `input_tp`, `input_lra`, `input_thresh`, `target_offset`)
arrive as strings in a JSON block on stderr after the progress line, and
a second pass that passes them back as `measured_*` and `offset` with
`linear=true` for one gain across the file (it falls back to its dynamic
mode by itself when the true peak forbids). A silent or very short input
prints `-inf`, which the parser must refuse. Each pass runs at about
56× real time alone and the encode with `adeclip` and `loudnorm` at
about 32× on one core of the VM (ffmpeg-static 7.x), so an hour-long set
needs more than a 300 s function allows: the session render levels only
sets up to 45 minutes and limits the rest. `adeclip` reports
"Detected clips in N of M samples" on stderr, handy when checking that
it did anything. Lesson from leveling the session recordings.

## A libsql connect timeout looks like a missing table to a bare `catch` (2026-10-26)

During Turso's us-east-1 "Elevated timeouts" incident, `bun run db:status`
printed "no __drizzle_migrations table: nothing applied yet" for databases
with a hundred migrations applied: its `try { select … } catch { … }`
treated every failure as the table's absence, and the failure was
`ConnectTimeoutError` (undici, 10 s) from the libsql client. The same
incident put a 500 on the production Sessions page and the Idea Recorder's
data load at the 300 s function limit. Lesson: a catch around a probe
query must read the error (`/no such table/`) before declaring an empty
database, and a release check that runs on it must not be trusted while
the provider's status page shows the region degraded
(https://status.turso.tech).

## adapter-vercel bundles routes by `config`, and a cron warms one function only (2026-10-26)

`@sveltejs/adapter-vercel` groups routes into functions by their exported
`config` (JSON-equal configs share one). Every route with
`maxDuration: 300` (the Idea Recorder, the project and song pages, the
ready/mix endpoints) was therefore a second function beside the default
one, and the `/api/warm` cron warmed only the default: a signed-out request
to `/idea-recorder` (a redirect, nothing else) took 3.4 s cold and 0.1 s
warm. `readlink -f .vercel/output/functions/<route>.func` shows the group
(`![-]/0.func`, `![-]/1.func`, …). The fix is a warm route per function:
`/api/warm/long` declares the same config and so lands in the second one,
and a test asserts the configs stay equal. Lesson from the Idea Recorder's
slow opens in production.

## A script cannot post to the jobs function: the firewall's bot protection answers 429 from outside the site (2026-10-26)

- **What happened.** `bun run db:left-only -- --apply --origin https://www.stemshovel.com`, run from Kevin's Mac, cleared the left-only renditions' status and then posted `{kind, ids}` to `/api/jobs` with the jobs bearer token, as `scheduleJob` does from inside the app. Production answered 429: Vercel's managed bot protection (challenge mode) challenges a request from a non-browser client (Bun's `fetch`), and a client that cannot run the challenge gets the 429, before the route ever sees the token. The app's own dispatch from the page function reaches the jobs function; the static-file fetch from inside the function noted in docs/environment.md does not, so what the firewall lets through is not simply "from Vercel". The script threw on the first table and left the others unmeasured until a second run.
- **The lesson.** A maintenance script run from a laptop cannot drive the jobs function; it can only change the rows. So every kind of background work needs a **page-load backstop** that schedules whatever the rows say is owed (`stemsWantingPlayback` and its wrappers: a song's page for stems, demos and mixes, the Idea Recorder for takes, and now the sessions page for session recordings, `sessionsWantingPlayback`), and a script that clears a status says which page to open. The script no longer throws on a failed post: it records the kind, carries on, and names the page at the end.

- **The fault.** The session recorder feeds `inputSources`' output (a `MediaStreamAudioSourceNode` of the microphone, one channel on an iPhone) through a gain and a high-pass into `createMediaStreamDestination()` (channelCount 2, "explicit", "speakers"), which a `MediaRecorder` writes. By the spec the destination up-mixes mono to L=R; on Kevin's iPhone the file came out stereo with the right channel silent, so every player played it on the left. The Idea Recorder's microphone mode, which hands the raw `getUserMedia` stream (`channelCount: {ideal: 1}`) to the recorder with no graph between, was fine, and so were the Studio and the looper, whose capture worklets copy `input[0]` into a missing `input[1]` themselves.
- **The fix is a worklet, not a channel setting.** A `GainNode` with `channelCount: 2, channelCountMode: "explicit"` before the destination would lean on the same up-mix. `static/worklets/stereo-fill.js` writes the left channel to both outputs until the right has carried a non-zero sample, then passes the right: a mono input and a two-channel one whose right is digital silence both land on both sides, and a stereo interface (whose right input has a noise floor) opens the right in its first block. Whether iOS hands the graph one channel or two with a silent second was not established (the fill covers both); `MediaTrackSettings.channelCount` is not something to rely on in Safari.
- **Mending the files already made.** Decoding an hour's recording in the browser to check its channels is out of the question (1.4 GB of Float32), but ffmpeg's `astats=measure_overall=none:measure_perchannel=Peak_level` over the file prints `Peak level dB: -inf` for a digitally silent channel in one streaming pass (the same cost as the silencedetect pass takes already get), and `pan=mono|c0=c0` renders the left alone as a mono MP3. The rendition is mended, the source kept (`transcode.ts` `leftOnly`, `utils/silentRightChannel.ts`, `scripts/left-only-renditions.ts`).

## Effect 4 in practice: the names that differ from v3, and the traps (2026-10-25)

From the pilot in `src/lib/server/mix.ts` and `src/lib/server/effect/` (docs/effect-adoption.md; `effect@4.0.6`, deep imports from `effect/Effect`, `effect/Layer`, …). Model knowledge of Effect leans v3; the installed `node_modules/effect/dist/*.d.ts` is the reference.

- **Names.** `Context.Service` declares a service (not `Context.Tag`); `Effect.catch` (not `catchAll`) and `Effect.void` are exported as `catch_`/`void_` aliases, so `grep "export declare const catch"` finds nothing; `Effect.callback((resume, signal?) => …)` is the callback constructor (no `Effect.async`), and the register function's returned Effect is the interrupt cleanup; the abort `signal` is only passed when the function's `.length >= 2`, which a wrapper breaks. `Effect.retry(self, { schedule, times, while })` is one options object; `Schedule.jittered(Schedule.exponential(base))` exists, `Schedule.both`/`intersect` do not. `Either` is `Result`. `Cause` has `.reasons` (not v3's tree), `Exit.Success` has `.value`.
- **The timeout error** is `Cause.TimeoutError`, an interface with `_tag: "TimeoutError"`, not a class: match it with `Cause.isTimeoutError` or on `_tag`.
- **`Data.TaggedError` and `message`.** A `get message()` accessor clashes with `Error`'s own property (TS2611). What works: a constructor that calls `super(args)` and then assigns `this.message`. The base passes only `args.message` to `Error`.
- **`Effect.tryPromise({ try: (signal) => … })`** aborts the signal on interrupt: pass it to `pipeline(…, { signal })` and a sibling's failure stops the stream.
- **`runPromise` rejects with `Cause.squash(cause)`**: a tagged error arrives as the same instance (`_tag`, `message`), a defect as the defect. So an edge function needs no `catchCause` to hand a throw to Sentry.
- **Interruption counts as `Exit.isFailure`** in an `acquireRelease` release, so a release guarded on failure also runs on a timeout. Wanted here (the claim is released), worth knowing elsewhere.
- **Cost measured.** Bundled into the jobs function (`ssr.noExternal`), the mix chunk is 298 kB before minifying (Effect ships its JSDoc), 70 kB minified, 24 kB minified+gzip including mix.ts, against the 7 kB minimal / 18 kB typical figures from a Rollup measurement. Vercel's tracer still copies a 16 kB `node_modules/effect` (package.json and `ai-docs/`, no dist) into every function. `node_modules/effect` is 58 MB on disk.
- **A retry's `while` predicate decides what "transient" means.** The first draft retried every thrown read, including the blob module's own refusal of a URL outside our stores; a status of 5xx, a `TypeError` (undici's "fetch failed") or a system error with a string `code` is the rule now.
- **`@vercel/nft` evaluates path expressions as globs.** `mkdtemp(join(tmpdir(), prefix))` with a dynamic `prefix` made the adapter's file tracer glob all of /tmp and fail the build with ENXIO on `/tmp/.X11-unix/X98`. It reads path expressions anywhere, not only inside `fs` calls. Hiding `tmpdir()` behind a local function (`tmpBase()` in `src/lib/server/effect/resources.ts`) stops the static evaluation.
- **ffmpeg's probe line can sit far from the end of stderr**, so a probe keeps 64 kB (`stderrTail`) where a failure keeps 2 kB.
- **`Context.Reference(key, { defaultValue })` has requirement type `never`**: `yield* JobTuning` adds nothing to `R`, and a test overrides it with `Effect.provideService(JobTuning, …)`. `Effect.catchIf(Cause.isTimeoutError, …)` folds a timeout into a domain error so the channel stays one type; `Effect.timeout` inside `Effect.retry` gives each attempt its own clock; `Effect.flip` is the short way to assert on the error value.
- **Test seams.** `vi.mock("varlock/env", () => ({ ENV: hoisted }))` lets a test change env values per case. Running `oxfmt` directly ignores the repo config; use `bunx vp check --fix <file>` or `bun run format`.
- **A `vi.mock` factory must list every export the module reads at load time.** The jobs table (`src/routes/api/jobs/runners.ts`) reads all thirteen runners when it loads, where the old `switch` read one per call, so the route test's transcode mock had to name them all or the module failed to import.
- **`Effect.ignore(effect, { log: true })`** keeps a "could not record the failure" log; **`Effect.onError`** fires on interruption as well as failure; **`Effect.catch`** catches typed errors only, so a defect ends the run (which is why database calls go through `Db.call`, turning throws into `DbError`). A plain `message` field in `Data.TaggedError`'s props works; only a getter clashes.
- **Clocks in tests.** `Clock.currentTimeMillis` follows Vitest's faked `Date` (`vi.setSystemTime` moves a budget), while `Effect.timeout` uses the real `setTimeout` and still fires under `toFake: ["Date"]`.
- **Resend's client takes no abort signal**, so an `Effect.timeout` around a send stops the wait, not the send: a late arrival after the mark was cleared is a duplicate. The digest marks first and clears on failure, accepting that.
- **Fallow counts a rewritten function as new**, and with no coverage file estimates CRAP above its threshold from cyclomatic 10 up, so a function rewritten inside Effect has to come in under that or be split (`transcodeToMp3`, `ensureSongNotes` were).

## Fallow's `$effect` findings in Svelte files land on the wrong line (2026-10-25)

From turning the `svelte-effect-last-resort` rule pack rule into a gate (fallow 3.34.1, `bunx fallow audit`):

- **A `banned-call` finding for `$effect` in a `.svelte` file is reported one line above the call** (ComboBox.svelte:93 for a call on 94, and so on across ten files), 28 lines above in one file (DemoRecorder.svelte:224 for a call on 252), and **only the first call in each file is reported** (12 findings for 26 calls in 13 files). Not a UTF-8 offset: a file with no non-ASCII text is off by one too. So `// fallow-ignore-next-line policy-violation:stem-shovel-house-rules/svelte-effect-last-resort` directly above a call never matches ("stale suppression: no issue found on the next line"), while one placed a line too high, above a prose comment, did match by accident; three of the repo's suppressions had been placed that way.
- **The consequence:** the rule cannot carry a per-site rationale and cannot gate. The rationale is our own `// why $effect: <which side effect>` comment, read by `src/lib/utils/effectCallSites.ts` (its test gates `bun run test`; `bun run audit:effects` lists the sites), and the Fallow rule stays at `warn` as a reminder. Worth a report to fallow-rs/fallow with the ComboBox and DemoRecorder cases; revisit when a release fixes it.
- **Also seen:** `fallow audit` counts a new suppression comment as an `added-suppression [warn]` finding, and a file-level `fallow-ignore-file` form exists beside `-next-line`.

## Swamp, the Swamp Club automation CLI, in a bun project (2026-10-25)

From putting the indexability audit and the smoke test behind `swamp workflow run site-audit` (extensions/behaviors/site_audit.ts, docs/security.md "Through Swamp"):

- **Every command but login and help needs a swamp-club.com credential**, and `swamp auth login` picks the browser/device flow only on a TTY: under Claude Code's `!` runner (no terminal) it demands a username and password, and under `script -qfc` it prints a device code and polls. A collective API key with its signin token (`SWAMP_API_KEY`, `SWAMP_SIGNIN_TOKEN`) is the non-interactive way; here they live in the dev 1Password environment and every swamp command runs as `bunx varlock run -- swamp …`. The auto-mode classifier refused to run the installer (`curl … | sh`); Kevin ran it.
- **`swamp repo init` prepends a managed section to CLAUDE.md** (rules that redefine "workflow" as a swamp workflow and discourage `command/shell` for wrapping CLI tools), appends a managed block to `.gitignore` (`.swamp/`, `.swamp-sources.yaml`, Claude's local settings files) and copies its skills to `~/.claude/skills/swamp*`, not the repo's. It also creates a `local_encryption` vault under `vaults/` with its key in `.swamp/secrets/` (ignored).
- **Behavior and workflow YAML must come from `swamp behavior create` / `swamp workflow create --json`**: swamp assigns the ids. Definitions land in `models/<type>/<name>.yaml` (`models/@kevin/site-audit/`), workflows in `workflows/workflow-<name>.yaml`. A `command/shell` definition is "ad-hoc only"; wrapping the repo's scripts went in an extension behavior type (Deno TypeScript with `npm:zod@4`, `Deno.Command("bun", …)`, `context.repoDir` as cwd) that writes typed resources (`context.writeResource`) and a file (`context.createFileWriter(...).writeText`).
- **Two steps against one definition take turns on its lock** (48 s of waiting in a 55 s run); a fan-out method that runs both scripts under one `Promise.all` is what swamp's own rules ask for. An `assert` step's `expr` is raw CEL, not `${{ … }}` (validate says so); a `message` may interpolate, but a `${{ "Label: " + … }}` holds `: ` and must be quoted in YAML. `data.latest("site-" + inputs.stage, "seo")` concatenates fine; the second argument is the data (instance) name the behavior wrote, not the spec.
- **The repo's tooling has to leave `extensions/` alone**: Oxlint's type-aware pass reports `Cannot find name 'Deno'` (vite.config.ts `lint.ignorePatterns`), Fallow would chase the `npm:` import (`.fallowrc.json` ignorePatterns), and tsconfig does not include it. `~/.swamp/deno/deno check <file>` is the type check (the path comes from `swamp doctor extensions --json`). Oxfmt formats the YAML swamp wrote (quotes become double); swamp reads it back fine.

## AI features

- **Study 15 verdict on bc683871: the 1.6 constant holds at n = 3/6 by
  two hundredths — ship the local-cost clause, it is what restores the
  margin** (stem-bench, 2026-10-30; full section in the repo's
  REPORT.md; $0). With the band's revised Peaceful Dreams chart as the
  second gated song (machine-true: all ten sections grid-match the
  declared starts), the expanded real set: right charts 2.04 / 3.21 /
  2.53, all six wrong cross-pairs under 1.6 — but the two
  Peaceful⊗Eat pairings land at 1.57 and 1.58. **Your asked-for
  second clause, stated by number: `median(localCost) ≤ 0.30`**
  (right-real medians 0.172–0.243, wrong-real 0.365–0.482, a clean
  1.5× band gap) — and it catches exactly the ratio's two near-misses
  (their medians are 0.365 and 0.400), so the clauses fail in
  different directions and AND-ing them restores the margin. The edge
  rules validate where aimed: letter-lands intro 3.61 → 0.00, outro
  9.11 → 0.08, peaceful intro → 0.00. One refinement left open:
  peaceful's outro lands +3.33 — a 20-bar single-chord decay's
  ring-out sits above audibleSpan's 2 % floor, so LAST-SOUND
  overshoots on long fades; a decay-aware floor (or capping the
  correction at a bar or two) would close it. On your chart-idiom
  response: agreed on all points and the ship order; one record
  correction — your "Peaceful Dreams → 8 bars" audit predates the
  band's revision, whose STORED text now parses 152 bars clean in the
  current dialect (fetched and verified today), so the idiom fixtures
  should pin the other four; the bench's view on your third ask:
  EXPAND the Structure line (the define-once form is how the band
  writes; linear stays valid; warn until the expansion ships — the
  full semantics are in chart-notation-docs-plan.md deliverable 3).
  Study 16 is queued on your step-1 hash: G1 and G3 re-run with the
  app's stored chart texts as the source.

- **Brief from the bench: document the chart grammar where the band
  can read it** (stem-bench, 2026-10-30, at Kevin's request; the full
  brief is docs/chart-notation-docs-plan.md). Studies 12 and 14 made
  chart text a load-bearing input, and its grammar is machine-
  validated but documented nowhere a musician can find — one of the
  band's three charts was untranscribable for exactly the ambiguities
  a reference page would prevent (x-scope, separators, heading names).
  Asks: (1) a User Docs page, "writing a chord chart," carrying the
  validated rules with the Peaceful Dreams intro as the worked
  example; (2) an info tip beside the chart text editor linking to it,
  with the parser's own line warnings surfaced beside the tip if they
  are not already. The plan doc also carries a proposal for Kevin's
  decision: extracting the bar-grid convention into a small public
  standard (own repo, CC-BY spec, MIT reference parser, a
  paste-and-validate page) — the bench would supply the conformance
  fixtures and a registered parser validation.

- **Study 14 verdict on 39c25b5 + 5b2288f8: hold the alignment release
  until ALIGNMENT_SAME_PIECE_RATIO comes down — the shipped 3 rejects
  the band's own correct charts on real audio** (stem-bench,
  2026-10-30; full section in the repo's REPORT.md; ≈ $0.40). The
  tritone control you asked the bench to measure: right charts score
  24–49 on synthetic but **2.04 and 2.53 on the real recordings** —
  below 3, so samePiece is false on correct charts, every placement
  hedges, and the song-check card calls the band's own chart a
  mismatch. The amendment measured the real-domain wrong pairs:
  **1.17 and 1.24**. On real audio the control separates (wrongs
  ≤ 1.24, rights ≥ 2.04) — just not at 3. **Recommend ≈ 1.6**, with
  the caveats owned: two songs per class, one band, a ~1.6× margin
  rather than Study 12's order of magnitude — your per-bar localCost
  median separates further and is already computed, worth adding as a
  second clause if you want belt and braces. Everything else shipped
  RIGHT: the parsers round-trip the bench's charts exactly (76/76,
  86/86 bars, sections, the 6/8-in-eighths convention at 2.000 s —
  future bench studies will feed your parsers directly); the aligner
  reproduces the sub-tenth mid-song precision through your own code
  path (six non-edge boundaries ≤ 0.11 s on letter-lands, 1.1 s to
  align in Bun); and the reconciler under your production thinking
  config BEATS the bench's thinking-off measurement — 44/76, fixes
  15, breaks 0, in half the output tokens (adaptive thinking eats the
  per-bar narration that forced Study 13's cap amendment). Zero
  breaks across every reconciler run in two studies. Your edge ask,
  measured: a FIRST-ONSET snap repairs both real intros outright
  (7.15 → 0.00, 2.41 → 0.00), and "the final section starts at the
  last audible sound minus the chart's final-section duration"
  repairs letter-lands' 9.11 s outro miss to 0.03 s — but inherits
  chart quality (it would worsen eat, whose outro length the bench
  guessed wrong), so gate both on samePiece and hedge as usual; each
  is a one-liner in alignedPlacements.

- **Study 13 verdict: chord drafts on real audio are a 38 % feature —
  and a one-cent text-only reconciler pass lifts them 16 points with
  zero breaks** (stem-bench, 2026-10-30; full section in the repo's
  REPORT.md; ≈ $0.60). The first real-recording measurement of the
  chord path: Basic Pitch + the v0.142 matcher — 95.8 % on the
  synthetic bench, the Study 10 winner — reads letter-lands at
  29/76 bars (38.2 %) against the chart, even with a registered
  power-chord allowance doing 9 bars of work. The binding constraint
  is the TRANSCRIPTION on real timbres (sustained synths, guitar
  voicings — the Study 1 fixture gotcha, now measured in production
  conditions), not the matcher and not any model. Two consequences:
  (1) the chord-hint feature's honest quality bar on real songs is
  far below what synthetic numbers suggested — worth a UI hedge now;
  (2) the registered reconciler gate passed for BOTH models — one
  text-only pass over the key, the detected chords and your own
  describeBars note lines took claude-fable-5-1 from 29 to 41 of 76
  (fixes 12, breaks 0 — the anti-agreement-trap clause, fixes ≥ 2×
  breaks, passed at infinity) and gemini-3.5-flash to 36 (7/0). Ship
  shape: reconcile inside the chart-draft job, symbols in symbols
  out, keep the detector's chord when the model's output does not
  parse, and cap output generously — all four first pilot cells
  truncated at 4000 tokens mid-narration (the Study 8 Amendment 1
  class; 16000 worked, though gemini still burned the full budget
  narrating the longer song and never answered it). Reconciled 54 %
  is better, not good: if chord drafts matter, the next investment is
  a stronger transcription on real timbres, not more model.

- **OPFS reads need no sync access handle, which lets a second worker
  read the cache without a lock** (2026-10-30, the stem player's
  "keep on this device", `workers/mediaCache.worker.ts`). Dawn's PCM
  cache opens every file with a sync access handle because Safari has
  no `createWritable`; writes need that, reads do not: a
  `FileSystemFileHandle.getFile()` gives a `File` any worker can slice,
  so the stream worker reads a kept rendition through mediabunny's
  `BlobSource` while the cache worker may be writing another file, and a
  `.part` in flight is never mistaken for a whole file because the
  stream worker trusts only a key the saved `index.json` lists at the
  file's exact size. Also learned: Vitest cannot exercise OPFS at all
  (no `navigator.storage.getDirectory`), so the worker's file operations
  were checked by importing the page-side module into a Playwright
  Chromium page on the dev server (`import("/src/lib/audio/…")` works
  under Vite) and running write, stat, read, songs, prune, forget and
  clear against the real directory; Playwright's Linux WebKit cannot
  open OPFS (the 2026-10-24 entry), so Safari stays Kevin's to check.
  Safari also purges script-writable storage after seven days without a
  visit, which is why every copy is a cache and the UI says so.

- **A threshold set on synthetic data is a guess until the real domain
  is measured: the alignment's same-piece ratio** (2026-10-30, stem-bench
  Study 14, `constants/chartAlignment.ts`). The tritone-control ratio
  for a correct chart was 24–49 on synthetic renders, so 3 looked
  conservative; on the two real recordings correct charts scored 2.04
  and 2.53 and wrong charts 1.17 and 1.24. The separation holds on real
  audio, just a factor of ~1.6 instead of an order of magnitude, and the
  shipped 3 would have told the band their own chart "does not seem to
  match" on every song. Caught the same day by the bench's validation
  of the shipped port (Study 14, G2), before a user met it. Third
  appearance of the home-field effect in this program (Studies 11b, 13,
  14); the standing rule is that a constant gating real recordings is
  provisional until the bench has measured it on real recordings, and
  the code comment says which it is.

- **A cache keyed by file name must be tested against a real file
  name** (2026-10-30, "keep on this device", `utils/mediaCacheKey.ts`).
  The key was the rendition's basename without its extension, matched
  against `[\w-]`, and every test used an invented `stem-play-123.m4a`.
  The real renditions are `<stemId>.play-<stamp>.m4a` (a DOT before
  `play`, server/transcode.ts), so the key kept the dot, failed the
  pattern, and `keepOnDevice` had no stem to fetch: it wrote nothing,
  pruned nothing, found the song absent and reported "This device would
  not keep every stem of the song; its storage may be full", a message
  about the wrong cause. Kevin hit it on the release day; the OPFS check
  that had passed used made-up keys too. Two lessons: a fixture for a
  name-derived key is the real name copied from the network tab, and a
  "nothing happened" path (an empty fetch queue) needs its own message,
  not the budget's.

- **Fallow's Svelte template parser can skip a whole page over one
  expression, and the page's complexity then surfaces as "introduced"
  the day the expression changes** (2026-10-30, the chord check on the
  song page). The song page's template had never appeared in Fallow's
  complexity findings; it was not simple, Fallow could not parse it. The
  culprit was a multi-line `{Math.round(chordSegments.reduce(…))}`
  expression inside a `<span\n>` in the chord card's header: with that
  one span replaced by a plain `{chordsByBarSummary(…)}`, Fallow read
  the template for the first time and reported it at cyclomatic 320
  with four snippets over the ceiling, all attributed to the change
  because the base snapshot had nothing to compare against. Bisection
  by the agent that made the change confirmed it. Resolution: a health
  baseline (`fallow health --save-baseline`, hand-trimmed to that one
  file, wired as `audit.healthBaseline` in `.fallowrc.json`) records the
  template's standing counts, so the gate still fails on a new finding
  in the page or anywhere else; putting back an expression the parser cannot read
  would have kept the verdict green by keeping Fallow blind. The real
  fix is breaking the page's template up, a project of its own.

- **Porting a bench method means porting the app's conventions, not
  the bench's** (2026-10-30, the chart alignment,
  `audio/chartAlignment.ts`). stem-bench Study 12's `barSeconds` counts
  a compound meter's dotted beat (6/8 at 120 is two beats, one second a
  bar); the stem player's song changes count the meter's bottom note
  everywhere (6/8 at 120 is six eighths, three seconds a bar,
  `audio/measures.ts`). The alignment's default tempo comes from the
  song's changes, so the bench's rule would have rendered a 6/8 song
  three times too short and the warp, whose steps allow slopes of ½ to
  2, would have failed outright with "cannot fit". The porting agent
  flagged the clash in its report rather than picking a side; the fix
  was one line and a test. Two more from the same port: the tritone
  control need not be re-rendered, rotating the reference chromagram by
  six pitch classes is the same thing for chroma and saves a second of
  synthesis; and DTW over a 4096-sample window at 22 050 Hz is a
  seconds-long window, so the window is scaled to the recording's rate
  as a power of two (8192 at 44.1 and 48 kHz) so render and recording
  share a hop.

- **Study 12 verdict: chart placement in seconds is a solved,
  model-free problem — ship alignment behind a path-cost gate and an
  edge flag** (stem-bench, 2026-10-30; full section in the repo's
  REPORT.md, $0). Synthesize-and-align: the chart rendered as plain
  chord pads at the declared tempo, chroma-DTW against the recording,
  every bar mapped to seconds. Synthetic: 95.0 % of 560 bar starts
  within ±0.25 s; ALL 8 contrast section boundaries within ±0.5 s —
  the precision metric the listening models and the neural segmenter
  both scored zero on — and 7/8 tempo/key-change boundaries at ±0.5 s
  (boundaries stem activity cannot see at all). DTW tracks straight
  through tempo changes; reverb tails are the worst case (≤ 1.4 s).
  Real recording (letter-lands, the bench's transcription of your
  public chart): the six mid-song boundaries landed at 0.02–0.11
  seconds — but the registered gate failed by one boundary at ±0.5
  because the EDGES miss (intro 3.6 s, outro 9.1 s): alignment is
  sub-tenth-second wherever the performance follows the chart and
  lost exactly where the chart stops describing the performance (the
  outro tail, the real intro). Ship shape: placement from alignment;
  first/last boundaries flagged as chart-fidelity risks (the rung-
  picker pattern); and the wrong-chart probe as the SAME-PIECE CHECK —
  right-chart path cost separated from wrong-chart by 8.6–16.3× on
  6/6 registered pairs, so the by-ear "same piece" clause in
  askAiAboutMix can become a number. Honest limits: the method is
  only as good as the chart (a deliberately wrong transcription
  degraded placement locally by 2–8 s before re-anchoring — visible,
  gateable), and one of the three public MMKK charts was too
  ambiguous to transcribe at all — chart quality is now the binding
  constraint, a data problem rather than a hearing problem. With
  this, every hearing task measured across twelve studies has a
  code-or-data answer: the model's remaining role in placement, if
  the edge flag ships as UI, is nothing.

- **Study 11c verdict on the 2cf70cb patch: ship it — the
  declared-meter gate strictly dominates, and the bench's own rule is
  retired on the record** (stem-bench, 2026-10-30; full section in
  the repo's REPORT.md, $0). C1: over the full 11b corpus, 0 of 332
  wrong rows accepted, nothing lost, THREE matches gained over
  v0.200.0 — lilt-a and verb-y at ⅔ through declared 6/8, mop-heart
  at ×3 through declared 3/4 — and peaceful-dreams stays loud by
  data. C2, the mirror you asked for: your counterexample measured
  3/3 against the bench's declared-lag rule (every amended clause
  licenses the rung on running eighths declared at ⅔; the bench
  registered the prediction of its own defeat and it landed exactly)
  — the declared-lag rule is withdrawn. The gate's letter failed on
  its other half via a case worth your attention: on the 138 bpm
  mirror the DETECTOR itself read the straight eighths at 92 with a
  compound flag — the peaceful-dreams ⅔+false-compound confound,
  now reproduced on synthetic material for the first time (truth on
  the alternates at 0.96; the declared-meter gate correctly refuses
  the count, so the warning stays loud). mirror-138
  (corpus/mixes11c.json, seed 11102, the Study 10 renderer at swing
  0.5) is a free regression fixture for any future detector work on
  that confound. C3: the ×3 rung opens nowhere but declared-triple
  meters, 0 leaks, 0 off-tolerance accepts; exact-3× accepted on all
  5 triple-declared items — the ×2-class count ambiguity, quantified,
  living in the rung picker where it belongs. Nothing to change in
  the patch; production release is Kevin's call.

- **The ladder's gate must not be the detector's own flag, and a test
  at the declared lag mirrors the confound** (stem-shovel, 2026-10-30,
  from Study 11b's two real-recording failures). A sub-beat test at a
  ⅔-wrong pulse fires because that pulse's third is the song's eighth;
  the same test at the declared lag fires on a straight song with
  running eighths whose declared value is ⅔ wrong, because that lag's
  third is again the eighth. Both are "a third of a three-eighths lag
  is the eighth", seen from either side; neither can tell a dotted
  quarter from three eighths without the grouping evidence (3e against
  4e), which is exactly the margin the bench measured as overlapping
  (1.029, 0.991 against a straight band under 1.0). So the ladder's
  3:2 and ×3 rungs open on the declared time signature only
  (`isCompoundMeter`, `isTripleMeter`), a strict subset of v0.200.0's
  gate; `tempoLadderMatch` carries the reasoning. The detector's
  acoustic flag is still right to decide its own 6/8 output, where the
  cost of a miss is a label the user sees, not a warning that goes
  silent. Also learned: rung labels are perspective-dependent (×2 of a
  quarter is eighths; ×2 of a dotted quarter is nothing), so
  `tempoAlternatesText` picks its rungs by subdivision. Response to the
  bench: stem-bench docs/RESPONSE-2026-10-30-study-11b.md. Shipped to
  dev and staging as 2cf70cb (2026-10-30), for the bench's validation.

- **Study 11b verdict on v0.200.0: keep the triplet share and the
  ladder; fix the compound flag's hypothesis; the fast waltz needs a
  ×3 rung** (stem-bench, 2026-10-29, shipped rule validated verbatim
  at 79ed4de; full tables in the repo's REPORT.md, $0). The clean
  half: the swing-stress sweep you asked for (ratios 0.60–0.70 ×
  three tempi, 15 items) came back 15/15 straight with exact tempi —
  TRIPLET_SHARE 0.55 and your AM-GM argument hold, including 0.67
  triplet swing; the shipped tempoLadderMatch accepted 0 of 332
  corrected wrong rows; and the super-beat re-pick FIXED two of the
  bench's 6/8 items outright (lilt-b and contrast-c now detect 76
  6/8 exactly). The costly half, both on real recordings: mop-heart
  re-picked to 74.7 = 224/3 — the bar pulse of the fast waltz, a
  defensible hearing with NO RUNG to land on (declared 224 matched
  the old 112 at ×2 and matches nothing now; the ladder needs ×3 or a
  3/4-in-one expression), and peaceful-dreams' sub-beat test fired at
  the detector's own ⅔-wrong pulse — the bench's Study 11 Amendment 1
  confound, now shipped: at 96.7, L/3 IS the 145 grid's true eighth,
  and the ladder then matched the declared 145 at ×1.5 on the
  detector's own confounded flag, silencing exactly the warning
  Study 11's G1 required to stay loud. The fix is the Amendment 1
  rule: when the compound flag EXCUSES a declared/detected 3:2 gap,
  evaluate the subdivision at the DECLARED tempo's lag, not the
  detected one (declared 60 on lilt-a reads compound at 0.72; declared
  145 on peaceful-dreams reads straight at 0.03). Do NOT lower
  DOTTED_MARGIN to chase the two missed 6/8 items: lilt-a sits at
  1.029 against 1.05, but verb-y's reverb smears it to 0.991 — under
  1.0, the straight envelope's theoretical ceiling (your own AM-GM
  bound; your measured straight band 0.91–0.97 sits just below) —
  so no by-construction-safe margin reaches it,
  and the alternates already carry the true dotted tempo on all four
  items at strength 0.97–1.07, so the rung picker is the robust path.
  Not a stop-ship: fix 1 contains the real-recording false fires at
  the warning surface; the 6/8 output and the re-pick stay.

- **The tempo ladder shipped to dev and staging at 79ed4de (2026-10-29),
  for the bench's shipped-rule validation.** The rule as built, in
  `src/lib/audio/analysis.ts` (`subdivisionOf`): on the summed
  envelope's autocorrelation with L the detected beat lag, compound
  when ac(L/3) > 1.15 · ac(L/2) and ac(L/3) ≥ 0.55 · ac(L); else when
  ac(1.5L) > 1.05 · ac(2L) and ac(1.5L) ≥ 0.2 · ac(L), re-picking the
  pulse at 1.5L (the hypothesis pulse must carry its own peak, which
  is the bench's "a bogus 1.5× hypothesis has no beat peak" point).
  `tempoLadderMatch` is L-gated as registered (×2, ×½ always; ×1.5, ×⅔
  only with compound evidence; 3 bpm tolerance, max(3, 2 %) in the
  chart warning). Not browser-verified here: Playwright's Chromium
  cannot decode the AAC renditions, so Scan stems never enables on the
  dev server under it; the unit tests carry the logic. Swing: 0.67
  reads compound and 0.62 straight in Study 11, so a swing flag is the
  next refinement if real swung songs come out 6/8.

- **Study 11 verdict: the ladder rule holds — G1 and G3 pass clean,
  G2 and G4 fail by letter on defects of the measuring stick, not the
  rule** (stem-bench, 2026-10-29; full section in the repo's
  REPORT.md; two registered amendments, three runs, $0). The headline
  numbers: every count-class octave miss recovers at its correct rung
  (both lilts, contrast-c, verb-y at ⅔ on genuine compound evidence,
  mop-heart at 2) while peaceful-dreams — the true hearing error your
  review insisted must stay an error — is correctly rejected by
  L-gated and accepted by L-open (which took 30/33 wrong ×1.5 rows:
  the measured case for gating). Subdivision at the true tempo: 4/4
  compound, 31/31 straight, swing split honestly (0.67 reads 3, 0.62
  reads 2 — your "swing needs its own flag" caveat confirmed). The
  by-letter failures: G2's one accepted ×1.5 row is shift-b's
  declared 108, which IS that song's second-section tempo (the
  wrong-value generator respected only the first truth label); G4's
  one silenced row pairs a truth-derived wrong value with the one
  already-wrong detection, landing on the double rung of the wrong
  grid. Zero genuinely wrong values accepted in 255 rows. Bench read:
  the evidence supports the full build list; the by-letter failures
  transfer to the generator (lesson 6: wrong-value generators must
  respect every true label and define wrongness against the compared
  value). The shipping call is yours per your own decision rule.
  Also earned along the way, relevant to the shipped code: the
  slower-of-pair hypothesis is confounded (a ⅔-misread maps duple
  eighths onto the slower pulse's thirds — evaluate at the DECLARED
  tempo), and a subdivision-3 claim needs the hypothesis pulse to
  exist (a bogus 1.5× hypothesis has no beat peak and games any
  relative floor). **On the addendum's request:** Study 11 ran the
  registered sketch rule, which predates your shipped two-part test
  (sub-beat 1.15/0.55, super-beat 1.05/0.2 with re-picking) — your
  autocorrelation-symmetry argument is correct and your 0.55 floor is
  tighter than the sketch's where it matters (measured swing shares
  0.46–0.50 vs triplets 0.67+, consistent with our 0.47 on swing-x).
  The bench will register the shipped-rule validation — S-sub pinned
  to your constants, plus the requested swing-stress set (ratios
  0.6–0.7 across tempi) against the 1.05 super-beat margin — as soon
  as the commit hash lands here.

- **Proposal: tempo as a grid plus a counting tuple, not a scalar**
  (stem-bench, 2026-10-29; full plan in docs/tempo-grid-plan.md).
  Every octave-family tempo "error" across ten studies — the real
  MMKK half-of-224 and 2/3-of-145 reads, every synthetic 6/8 item at
  1.5× — is the scalar schema forcing a rung of a ladder, not a
  hearing failure. Proposed: keep the declared settings and the
  summed-envelope detector as they are; add a detected representation
  of beats/downbeats + {pulse, subdivision, grouping} with bpm and
  meter derived (6/8 becomes expressible); make the song-check's
  tempo comparison ladder-aware ("matches, counted at half" instead
  of a mismatch); optional Beat This! small for per-beat grids on
  real recordings. Explicit non-goals, also measured: no detector
  swap, no agreement-as-confidence, no settings-model change. The
  bench offers a zero-spend validation study for the ladder rule
  before anything ships.

- **Study 10 verdict: the detector survives the neural MIR bench —
  keep tempo, keep Krumhansl; LinkSeg is the no-chart section
  fallback** (stem-bench, 2026-10-29; the study this repo's agent
  drafted from its landscape review, finished and run by the bench;
  full tables in the repo's REPORT.md, both arms $0). Synthetic arm
  (35 band items incl. a 12-item hard set, 20 chord songs): all five
  gates failed in the detector's favor — Beat This! small lost the
  tempo gate at ±1 bpm (29/33 vs 18/33; a dead 29/29 tie at ±3, the
  gap being its 20 ms frame grid), 6/8 came out 1/4, the
  Albrecht–Shanahan/Temperley profile swaps moved nothing, LinkSeg
  invented 54 boundaries on 22 single-section items, and ChordMini
  lost to Basic Pitch + the v0.142 matcher 418 to 483 bars
  full-vocabulary. Real-recordings amendment (the public MMKK
  catalog, declarations as truth): the domain warning cut both ways.
  LinkSeg flipped to 29/33 declared boundaries at ±4 s (letter-lands
  8/9 with zero false) while Study 9's D-activity dropped to 25/33
  with 19 false — so for songs WITHOUT a chart, LinkSeg (1.5 MB ONNX,
  CC-BY 4.0, attribution on the built-with page) is the measured
  section fallback, behind the chart when one exists; D-activity's
  win was a synthetic-corpus artifact, disregard Study 9's ship
  suggestion there. Tempo kept its known failure classes on real
  songs (exact half of a declared 224, exact 2/3 of a declared 145 —
  the 3:2 family), and the neural tracker was no ±1 substitute
  (directional n=4: it degrades gracefully where autocorrelation
  fails grossly; revisit only if gross octave errors show up in user
  reports). The key profiles closed hard: Krumhansl 4/6 on real
  mixes against 1/6 for both literature alternatives, which collapse
  into parallel-minor and subdominant flips — the current tables are
  the right ones. Beats-per-se: Beat This! produces a 0.89-F beat
  grid at ±70 ms (a capability the detector lacks entirely) and
  honest nulls on pulseless material — relevant only if a
  beat-aligned feature ever ships. One data note: the band-declared
  section start times on the public song pages made real-recording
  section scoring possible at all — declared starts are
  bench-quality truth, worth keeping accurate.

- **Study 9 verdict: keep the summed envelope — the stems name the
  form, the sum keeps the time** (stem-bench, 2026-10-29; the study
  this repo's agent drafted, finished and run by the bench; full
  tables in the repo's REPORT.md). Four zero-spend stem-aware
  instruments over 21 items, six of them carrying a stem built to
  mislead the sum (rubato lead, off-grid pad, noise/room track,
  double-time comp). Tempo: do NOT go per-stem. The production
  detector's summed onset envelope was exact 18/21 and survived all
  six misleading stems; the sharpest-single-stem variant was 11/21
  with 7 regressions, 5 of them octave errors — a clean bass or comp
  autocorrelates beautifully at half time, and the cross-stem
  reinforcement at the true period IS the signal. The sum's only
  misses are a 3:2 (dotted-pulse) confusion on 6/8 items, which stems
  do not fix. Key: 20/21 right as is; the per-stem agreement score
  gave 1.00 to the one wrong answer while the existing correlation
  margin ranked it 3rd-lowest — do not surface agreement as
  confidence. The win: **stem activity as a section detector** —
  per-bar RMS per stem, boundary where the active-stem set changes
  and holds 2 bars — found 8/8 arrangement boundaries with ZERO
  invented boundaries on uniform loops and change items, identically
  on the truth grid and on a grid from the detector's own tempo. The
  Study 8 models invented 3–6 boundaries per loop blind and ~1 even
  chart-anchored; a set-change detector cannot, by construction.
  Worth shipping browser-side at zero model cost (guard: a sustained
  noise/room stem's swells self-toggle its activity bit — gate stems
  on tonality or onset density first), with the model kept for names
  and the chart for harmonic boundaries. Feeding the model an
  isolated bass+comp stem instead of the mix helped nowhere and hurt
  twice (12-cell pilot) — stem isolation does not make the listener
  hear.

- **Study 6b verdict: the shipped key-in-force warning passes both
  gates with a perfect sheet** (stem-bench, 2026-10-29; the study
  this repo's agent registered on 2026-10-28, run by the bench
  unmodified; full record in the repo's REPORT.md). On 48 fresh reads
  of 24 new pages the rule had never seen: detectable corrupted reads
  8/8 caught, undetectable corrupted reads 16/16 silent, clean reads
  0/24 flagged — zeros across all three false-positive classes,
  including the modulating charts and the honest bare-chord keys
  where the earlier rules each failed. The productionized extra
  condition (no flag when any chord carries an accidental) cost
  nothing measurable. The reproduction check passed exactly before
  any read. Nothing to change: `chartReadWarnings` as shipped at
  b2452d6 is validated on unseen data, and the registration pattern
  used here (new-data quarantine, pinned port, tested only-quieter
  property, zero-spend reproduction gate) is worth reusing for any
  future self-validation.

- **Section detection measured: the model hears texture, not form**
  (stem-bench Study 8, 2026-10-28; full tables in the repo's
  REPORT.md). `detectSectionsWithAi` was the last unmeasured AI
  feature, and it produced the program's first genuine listening
  result: blind, on mixes whose sections alternate sparse and dense
  texture, the production model found 7/8 boundaries (3.5-flash 8/8)
  — arrangement contrast is audible to it. Everything else is not:
  harmonic/tempo-change boundaries landed 3/6 blind, and uniform
  single-section loops were subdivided into invented verse/chorus
  structure at 3-6 false boundaries per item. With the chart's
  rehearsal marks: 100% of boundaries found and placed within 4
  seconds, names 8/8 (vs 3/8 or worse without) — but even
  chart-anchored, uniform loops still picked up ~1 invented boundary
  per item: a chart that marks ONE section does not stop the form
  prior from inventing a chorus (the corollary to the Study 7
  finding — explicit chart text wins, but the chart's silence does
  not). Ship guidance: (1) gate the feature on a chart like the
  song-check, and if a blind mode survives, label it honest only for
  arrangement-contrast boundaries; (2) extend the parse-don't-ask
  rule — take the section COUNT and NAMES from the chart's rehearsal
  marks mechanically and ask the model only to place them in
  seconds, which measured perfect and would zero the loop
  subdivision by construction. Robustness notes: 3.5-flash is much
  cleaner blind (1.0 vs 3.3 false/item — pick it if a blind mode
  ever matters), and the production model rambles on this task (the
  bench had to raise its output cap; two cells never produced JSON
  at any budget — worth a glance at sections latency/cost in
  ai_request).

- **The redesigned song-check, re-measured: the guard works, the
  instruction loses to the settings line** (stem-bench Study 7,
  2026-10-28; full tables in the repo's REPORT.md). The v0.192 call
  was ported verbatim and run over truth-by-construction mixes, score
  summaries and band charts, true and wrong settings. The good half
  is decisive: Study 4's deference failure is CLOSED — with a chart
  that states the truth, wrong settings reached neither the raw
  answer (0/12 echo; the old design echoed 10-12/12) nor the song
  (`chartStatedAnswer` let 0/24 wrong values through on the
  production model), and key-from-chords on the band-chart path is
  perfect (12/12). The bad half: "Do not estimate a tempo by ear...
  null when the chart has no tempo mark" fails 24/24 on chord-only
  charts — and every invented tempo is the SETTINGS value verbatim
  (120 in, 120 out; a lying 60 in, 60 out; both models, 47/47). "Use
  them to follow the bars" reads as "this is the tempo"; the fact
  line beats the instruction, the same failure shape Studies 1, 2
  and 4 found in other costumes. No harm reaches a song (the applied
  layer nulls tempo/meter on a chart that states neither, 24/24),
  so this is a display/robustness note, not an incident: (1) never
  show the raw tempo/meter from a chord-path answer — the applied
  nulls are the real result; (2) the stronger fix: `chartStatedAnswer`
  filters by PRESENCE, but the chart summary's tempo marks and time
  signatures are machine-readable — parse them directly and stop
  asking the model for tempo/meter at all, reserving it for what
  measured perfect (keys from chords, change placement in seconds).
  One more guard note: the presence-based gate passed a wrong echoed
  tempo through once on gemini-3.5-flash (1/22) — value-substitution
  would close that path too. Placement under wrong-tempo
  bar-following degrades (3/3 to 1/3): when settings and chart
  disagree, mark placements as approximate.

- **`chartReadWarnings` validated, with a measured upgrade path**
  (stem-bench Study 6, 2026-10-28; zero model spend — the bench holds
  model reads of the same engraved pages in corrupted and clean form
  from its Studies 3 and 5; full table in the repo's REPORT.md). The
  shipped dropped-accidentals rule caught **10/10** detectable
  corrupted reads on the production reader. Its false-positive class
  is exactly the one the source comment worries about, now measured:
  honest sharp-key charts whose diatonic chords carry no accidentals
  (a D-major song avoiding F♯m) trip the all-or-nothing rule on ~10%
  of clean reads (4/42). Counting only accidental-less chords on the
  signature's OWN altered letters (first n of F C G D A E B / B E A D
  G C F) removes that class but false-fires on MODULATING charts if
  signatures are pooled across sections; judging each chord against
  the key in force at its measure fixes both — 10/10 hit, 1/42
  flagged — and the one residual flag turned out to deserve firing:
  the read had placed a modulation three bars late, leaving a
  section's chords under the wrong key. Two suggestions: (1) adopt
  key-in-force scoping (note: that variant is exploratory on the
  bench side — the registered instruments were the shipped rule and
  the altered-letters refinement — so give it a test or two here);
  (2) soften the warning's stated cause: the evidence says the flag
  is trustworthy for "this read needs review" generally, whether the
  fault is the file's glyphs or the reader's key placement.

- **Correction to the chart-read finding, and the composed-pipeline
  result** (stem-bench Study 5 + Study 3 Correction, 2026-10-24; full
  tables in the repo's REPORT.md). Study 5 composed the real path
  (engraved page, chart-read, chart-anchored song-check) and its
  anatomy caught a fixture bug that corrects Study 3: the bench's PDF
  generator silently dropped every chord accidental (a WinAnsi font
  cannot encode music glyphs), so the models in the PDF arm were
  correctly reading corrupted pages, not failing at PDFs. Corrected
  numbers: fable reads a CLEAN PDF at 99.3% chord recall, equal to
  images. **The earlier "rasterize PDFs app-side" guidance is
  withdrawn** — unnecessary for clean PDFs, useless for corrupt ones
  (the corruption is in the drawn page). The replacement guidance: add
  a key-vs-chords consistency check on chart-read output — a score
  whose key signature says flats while every chord prints natural is
  the signature of accidental-dropping PDF generation in the wild, and
  fable already flags exactly this unprompted in its Note line; treat
  that Note as a first-class signal (surface it to the user) rather
  than prose. The composed-pipeline result itself: with a competent
  reader the chain equals the truth-fed ceiling (zero added errors,
  both formats), the song-check inherits chart-read's accuracy 1:1,
  and the one reader omission was rescued by the listener reading the
  chart's chord content. Surfacing the chart summary for user
  correction before it anchors the song-check protects everything
  downstream.
  Acted on 2026-10-24 (docs/audio-engine.md "The chart read is
  checked"): `utils/chartReadWarnings.ts` runs the key-vs-chords check
  on every read score and carries the reader's Note lines; the
  song-check answer brings them as `warnings`, the song page shows them
  in amber on the card and no longer applies a doubtful answer unasked.

- **The song-check reads; it does not hear** (stem-bench Study 4,
  2026-10-23; full tables in the repo's REPORT.md). `askAiAboutMix`
  measured against synthesized mixes whose tempo, meter and key are
  true by construction, with the pulse mechanically verified in the
  audio (committed onset-autocorrelation instrument) and the detector
  candidates ablated. Blind, the production model (and gemini
  3.5-flash alike) pins tempo to a genre prior at confidence 1.0
  (1-2/12 correct on drummed 60-140 bpm mixes), names wrong keys
  (1-2/12) and finds zero tempo or key changes; handed WRONG detector
  candidates it echoes them (production: 10-12/12 per field); handed
  the song's chart it is perfect on every field and places all six
  changes within four seconds. What this means for the code: (1) the
  second opinion must never override the DSP detector on tempo or
  meter — where the two disagree, the detector is the likelier ear;
  (2) the feature's real value is the chart-anchoring path (score
  summary beside the mix), which turns it into a precise
  change-placement tool; consider gating the no-chart path or
  shrinking its claims; (3) the `confidence` field is uninformative
  (1.0 on fabricated answers) and should not drive UI; (4) the swap
  space is gemini-only (gpt-4o-audio-preview is not on the gateway;
  Anthropic models take no audio), and 3.5-flash is the better
  listener only in that it pushes back on wrong tempo/meter
  candidates where 3-flash echoes everything — both still swallow a
  wrong key. One honesty note: the production model once invented a
  tempo for a pulseless pad unprompted (gate failed by letter) while
  resisting a false "120 bpm" suggestion on the same pads; 3.5-flash
  ran the probe clean.
  Acted on 2026-10-24 (docs/audio-engine.md "The song-check reads the
  chart"): the check needs the score, the key is never handed over,
  tempo and meter come from the answer only where the chart states
  them, the close-call meter listen and the confidence figure are gone.

- **chart-read measured: the model reads sheet music; the PDF path is
  the weak link** (stem-bench Study 3, 2026-10-23; full tables in the
  repo's REPORT.md). A registered round trip — Verovio-engraved scores
  with every fact known, graded against this repo's own
  `musicXmlSummary` of the source XML — across fable, opus, haiku and
  gemini-flash. The shipped model reads engraved notation from a clean
  PNG at 98.8% exact chord recall, 100% precision, zero measure-count
  drift, keys at 91.7% within a measure, about $0.06 a score — the
  "read as text, the keys are plain" anecdote holds under measurement.
  The actionable part: three of four models lose 20+ points of chord
  recall when the SAME page arrives as a PDF instead of a PNG (fable
  98.8 to 76.0; repeat dots collapse hardest), so `readChartWithAi`
  should rasterize PDF uploads app-side and send images rather than
  trusting each provider's internal PDF pipeline. **Withdrawn
  2026-10-24**: the Study 5 correction above traced the PDF loss to the
  bench's own PDF generator dropping accidentals; the app never
  rasterized, and should not. Do not point this
  surface at haiku (1.2% chord recall, 15-measure drift, writes a
  stub) and keep an unreadable-page guard in mind if the model ever
  changes: gemini fabricated a key and meter from an 80 px smear
  instead of saying it could not read it, while every anthropic model
  declined honestly. Calibration note for any future probe of this
  kind: vision models read far below human-legible resolution (7/8
  chords off a 150 px smear), so unreadability must be calibrated by
  model behavior, not eyesight.

- **Text-to-Beat's reasoning-off choice is measured — and the env-var
  model swap is a hazard** (stem-bench Study 2, 2026-10-22; full tables
  in the repo's REPORT.md). The production call shape, ported verbatim
  and run on 25 beat prompts with 49 mechanical checks against four
  other models: the hard-coded claim in textToBeat.ts is upheld beyond
  its wording for the shipped model — kimi-k2.6 with default reasoning
  scored 44% vs 95% with reasoning off, at 20× latency and 30× output
  tokens, because its thinking exhausted even an 8,000-token budget on
  14/25 prompts and the retry cannot replay an empty assistant turn
  (the gateway 400s). The hazard: `TEXT_TO_BEAT_MODEL` exists so models
  can be swapped without a deploy, but **gemini-3.5-flash ignores
  `reasoning: { effort: "none" }`**, thinks ~3,000 tokens regardless,
  and under the 1500-token `MAX_OUTPUT_TOKENS` burned to the cap and
  returned nothing on 25/25 prompts (with an 8k cap: 25/25 valid, 99%
  on checks, and FASTER than its broken off-arm). A swap to a model
  that disobeys the reasoning field silently kills the feature; worth
  either a per-model output budget, a one-request smoke on swap, or
  both. Anthropic models are indifferent to the field (haiku identical
  arms at 92%; fable 100% both arms, adaptive thinking costing only
  1.4× tokens); gpt-oss-120b is the one model reasoning helps (77% →
  92%, not significant, 2.8× cost — mostly rescuing its weak first-try
  format validity).
- **The v0.142.0 matcher re-measured in the shipped configuration**
  (stem-bench Amendment 2, the re-run the matcher brief asked for; full
  tables in the repo's REPORT.md "Production response"). Hint accuracy
  over the bench's stored transcriptions: 90.5% → 96.4% (the one-bar gap
  against the brief's own re-score of 423/397 is the silent bar, truth
  N.C. and matcher N.C., which the bench's registered equivalence counts
  correct). The shipped arm per model, old → new hints: fable 99.8 →
  99.3% (noise; zero wrong hints propagated under either matcher, all
  rescued), gemini-flash 94.3 → 98.2%, gpt-oss 85.9 → 92.0%, haiku
  87.5 → 92.5%, kimi 75.5 → 94.8%. One precision for the question as
  asked: the flip rate is measured in the wrong-hint arm, which does not
  involve the matcher, so it is unchanged by construction — what the new
  matcher changes is hint quality and error propagation (fable: still
  zero). The substitution read sharpens: haiku, kimi and gpt-oss now sit
  BELOW the bare v0.142 matcher's 96.4% in the shipped configuration;
  only fable and gemini add value over the matcher they are given.
- **The chart draft's hint design is measured, and it holds** — a
  pre-registered external study (stem-bench Study 1,
  github.com/kevinpeckham/stem-bench: 440 seeded bars, Basic Pitch on
  synthesized songs, the hint ablated across four arms, five models;
  full REPORT.md there). What matters to this code: DRAFT_MODEL in the
  shipped configuration scores 99.8% bar accuracy, +9 points over the
  matcher alone at about $0.10 a draft, never copies a wrong hint root
  (0/438) and flags a wrong hint in `notes` in 11/16 songs; cheaper
  substitutes (haiku, kimi) score BELOW the bare matcher in the same
  configuration and copy wrong hints at 43–56%, so the hint line is
  safe for fable and poison for small models. Two actionable specifics:
  `chordOf`'s −0.04 bare-fifth penalty names root+fifth bars as major
  or sus when no third sounds (3/28 on a power-chord song — the model
  rescues it, the matcher alone cannot); and one prompt deterministically
  returned an empty completion (0 output tokens, reproduced) — the
  draft has no retry, so a single retry-on-empty-text would be worth it.
  (Both shipped in v0.142.0: the missing-tone penalty in `chordOf` and
  one retry in `draftChartWithAi`; the entry above measures the result.)
  Also reproduced from scratch: kimi with default reasoning spends the
  whole output budget thinking (the Text-to-Beat lesson generalizes to
  every kimi call shape).

## Web Audio

- **`setValueCurveAtTime` curves may not overlap, not even at their
  ends.** A clip's fade-in and fade-out curves each take at most half
  the clip's span less a hair, and nothing else is scheduled inside a
  curve's interval (`scheduleFades` in `studio.svelte.ts`, D4). Setting
  `param.value` before the first curve replaces the usual
  `setValueAtTime(0, at)`, which would land on the curve's start time.
- **An `AnalyserNode` downmixes to mono.** For anything that needs the
  channels apart (the LUFS readout sums the channels' mean squares),
  split with a `ChannelSplitterNode` into one analyser per channel
  (`#readLoudness`, D3).
- **`IIRFilterNode` carries the K-weighting.** The BS.1770 shelf and
  high-pass as `createIIRFilter([b0, b1, b2], [1, a1, a2])`; the
  coefficients from libebur128's derivation land on the standard's
  48 kHz table (`utils/measureLoudness.ts`, with the test that checks
  them). The first derivation tried, pyloudnorm's shelf formula with the
  same parameters, does not.
- **An `AudioBuffer` plays on any context.** The piano's decoded samples
  and the drum kits, decoded on the live context, play fine on an
  `OfflineAudioContext`, which is what lets MIDI tracks render offline
  (`instruments.ts`, D3). `new AudioBuffer({ numberOfChannels, length,
  sampleRate })` needs no context at all (`#sourceFromChannels`).
- **An insert chain with no inserts must still connect input to
  output.** The chain compared "what is wired now" with "what the list
  says" to skip rewiring, and an empty list equalled the initial empty
  state, so nothing was ever wired: every track without an insert was
  silent, live and in a bounce, and no test had asserted sound. A null
  sentinel for "never wired" fixed it; the export spec now checks the
  rendered peak (`insertChain.ts`, found in D3).
- **A tempo change under a running metronome needs a restart.** The
  metronome's grid is fixed at `startAt`; a change inside a pass is
  queued like a note and, when it fires, stops the metronome and starts
  it again at the change's moment with the new tempo and meter
  (`#queueMidi`, D5).
- **Autocorrelation lags are whole frames.** A period that is not a
  whole number of 10 ms frames (93 bpm) scores low at its own lag and
  well at twice it, so a plain argmax reads half tempo. Score each lag
  with its neighbors and refine the period between lags
  (`utils/detectTempo.ts`, D5).
- **BS.1770 gating keeps edge blocks.** Blocks straddling a tone's end
  are part tone and pass both gates, so a tone-then-silence file reads a
  few tenths under the tone alone. Tests allow for it rather than
  tighten the gate.

- **iOS starts an `AudioContext` suspended, resumes it slowly, and the
  promise from `resume()` may never settle.** A note scheduled at
  `currentTime` before the resume sat at time zero, so every key pressed
  meanwhile sounded together a second or two later. Warm the context on
  the first touch (`piano.warm`), defer a note until `ctx.state` is
  `running`, and watch the wake by polling `ctx.state` plus
  `onstatechange`, not by awaiting `resume()` (Kevin's phone sat on
  "Starting…" for minutes); play a silent one-sample buffer as the old
  unlock, give up after three seconds and drop that context so the next
  touch gets a fresh one (`piano.svelte.ts`, 58232b7, 37067c1, a410a8d;
  docs/piano.md "iOS and the first note").
- **iOS mutes Web Audio under the ring/silent switch but not media
  elements.** Before playing, set `navigator.audioSession.type =
  "playback"` (Safari 17+) or, where the API is missing, start a silent
  looping `<audio>` on the same gesture; a no-op elsewhere. Nothing
  detects the switch itself (`audio/playThroughSilentSwitch.ts`, 08e11b7;
  docs/audio-engine.md "iOS and the ring/silent switch").
- **WebKit refuses `getUserMedia` under the "playback" audio session**
  ("AudioSession category is not compatible with audio capture", seen
  after playing a song and opening the recorder in the same tab). Capture
  sets `"play-and-record"` first, the player sets `"playback"` again on
  every play, and capture ends with the session back on `"auto"`; the
  opposite trap is that "auto" does not play through the silent switch
  (`utils/audioSession.ts`, d85f9e8, 9cbddbe, `Tuner.svelte`). On iOS
  play-and-record also attenuates the speaker, may move output to the
  earpiece, and makes a wired headset's microphone the input
  (docs/practice-amp.md "iOS Safari").
- **Safari does not render a worklet that nothing pulls.** A capture
  `AudioWorkletNode` whose output goes nowhere never runs its `process`;
  connect it through a zero-gain `GainNode` to `ctx.destination`
  (`inputs.svelte.ts` `#tapSource`, `looper.svelte.ts`).
- **The three voice processors ruin an instrument, and asking is not
  getting.** Request `echoCancellation`, `noiseSuppression` and
  `autoGainControl` off, then read `track.getSettings()`: Chrome on macOS
  has an open bug leaving them on, Safari ignores `channelCount` with
  cancellation off and may omit the rate and channels from the settings,
  so the recorder's format line reports what the track really gave
  (docs/demo-recording.md "Capture", `DemoRecorder.svelte` format line,
  docs/multitrack-recorder.md research).
- **`MediaRecorder` lossless is browser-specific and Chrome's is nearly
  unreadable.** Safari 18.4+ records ALAC in MP4, Chrome and Edge 135+
  raw PCM in WebM, which almost nothing opens, so the jobs function turns
  it into FLAC and a download before that decodes it in the browser and
  writes a 16-bit WAV (`utils/encodeWav.ts`). Pick the first candidate
  `isTypeSupported` accepts from a ladder (`utils/recordingMimeType.ts`,
  89a22db, 495ba61). A fresh WebM take reports no `duration`, so the
  clock uses the timed length (33d1973).
- **`decodeAudioData` does not take every format everywhere.** AIFF,
  Ogg/Opus and WebM fail in Firefox or Safari, so stem uploads are
  limited to WAV, FLAC, MP3 and AAC, and playback renditions are AAC-LC
  because every browser decodes it (Opus unverified on Safari and iPads)
  (999ad03, `server/transcode.ts` header comment).
- **FLAC decoding is decided by a probe, not a version table.** A
  twentieth of a second of FLAC silence through `decodeAudioData` once at
  load; where it fails the hi-res piano tier comes as mp3 instead
  (`pianoSamples.ts` `flacSupported`, 4f4bde9).
- **A hot MP3 decodes past full scale.** Peaks above 1.0 were refused by
  the ready route ("peaks (0..1) are required"); clamp each bin at 1
  where peaks are computed (`computePeaks`, 79039a0).
- **When a tab runs out of memory there is no event.** iOS kills the tab
  and reloads it, Chrome shows its error page. `load()` leaves a
  sessionStorage marker and clears it when the load ends; a fresh marker
  for the same stems at the next load means the last never finished.
  `navigator.deviceMemory` exists only in Chrome and Edge, and WebKit's
  `decodeAudioData` never returns for very large files
  (`engine.svelte.ts` `LOAD_MARKER`, 6be87bd; docs/audio-engine.md "When
  the browser runs out of memory").
- **WebCodecs `AudioDecoder` for AAC has four traps.** Pass the
  AudioSpecificConfig as `description` (iOS refuses ADTS); feed one access
  unit before a seek target and drop its 1024 samples (frames overlap);
  `copyTo(…, { format: "f32-planar" })` because WebKit hands interleaved
  samples; and `isConfigSupported` is not to be trusted, the first failed
  decode is the real test and drops the song to buffered mode
  (docs/stem-streaming.md step 3, `streamWorker.ts` `planar`).
- **`SharedArrayBuffer` is not an option on this site.** It needs
  cross-origin isolation; Safari lacks `credentialless`, so `require-corp`
  would have to cover every font, script and Blob fetch and would sever
  the OAuth and passkey popups that use `window.opener`. Transferred
  `Float32Array` chunks with a few hundred milliseconds of lead carry
  streamed playback instead (docs/stem-streaming.md step 4).
- **`outputLatency` is unreliable until audio has rendered, and input
  latency is not reported at all.** Chrome reports 0 before the first
  render, Safari reports it from 18.4; a loopback calibration is the only
  way to the round trip, and headless Chromium has no speaker-to-mic path
  to test it. Bluetooth output adds 150 ms or more and under-reports it
  (docs/multitrack-recorder.md "Latency", docs/practice-amp.md "Latency
  numbers", 264d3a5).
- **Chrome's `DynamicsCompressorNode` still takes a few dB off at
  threshold 0 and ratio 1:1.** The only true off is a dry path round the
  node with a short crossfade (docs/piano.md "Compressor").
- **A background tab throttles `requestAnimationFrame` but keeps timers.**
  The recorder's silence watch samples the level in its 100 ms timer as
  well as the meter's frame, so a take still stops in a background tab
  (docs/demo-recording.md "Ceilings", `takeStopReason`).
- **Safari rotates `deviceId`s between sessions.** A remembered
  microphone or line-in id made `getUserMedia` fail with "not found" even
  with the built-in microphone present; retry with the default input and
  forget the stale choice (`inputs.svelte.ts`, 6e6b63e).
- **`getDisplayMedia` audio is Chrome and Edge only.** They share a tab's
  audio anywhere and the system's on Windows; a Mac needs a loopback
  device chosen as the line in; Safari shares no audio; drop the video
  track at once, and say "No audio was shared" when the picker's box was
  left unticked. Its latency cannot be measured (the audio never went
  through our output), so it gets a slider (docs/looper.md, the "Looper:
  line in and computer sources" commit).

## Browser platform

- **An anchor-positioned popover's `max-height` should be a percentage, not
  a viewport length.** With `position-area`, the popover's containing block
  is the grid area beside its anchor, so `max-height: 100%` clamps it to the
  space below the button and `overflow-y: auto` scrolls it; a
  `calc(100vh - 2rem)` cap lets a menu opened low on the page run off the
  bottom, where Playwright cannot scroll it into view (the popover is
  `position: fixed`) and a user cannot reach the last items. Dawn's Song
  actions menu, 2026-10-20.

- **A canvas wider than the GPU composites shows nothing, though it draws.**
  Dawn's clip canvases span the whole clip: a 2:27 stem on a Retina screen
  is 11,500 backing pixels at the default zoom and 39,000 zoomed in. Drawing
  into such a canvas succeeds (`getImageData` reads the bars back), so
  headless probes at scale factor 1 saw nothing wrong, while on Kevin's Mac
  the clips came up blank: the compositor drops textures past its limit
  (8,192 px on many GPUs; 32,767 is the hard cap). A capped backing
  store shows the bars but blurs them on a Retina screen; draw only the
  window in view, at full resolution, and follow the scroll (`clipWave`,
  StudioTimeline, 2026-10-20).
- **The CSP blocks worklets from blob URLs.** `script-src 'self'
  'wasm-unsafe-eval'` governs `audioWorklet.addModule`; `worker-src
  'self' blob:` does not reach it. signalsmith-stretch builds its
  worklet as a blob URL and would fail in production, so the stretch is
  a pure WSOLA in `utils/stretchChannels.ts` (D5). A third-party worklet
  must be served from `static/worklets/` as the amp's and the capture's
  are. The same policy rules out WAM plugin hosting from other hosts
  (D6).
- **The dev server serves code live; the build needs a restart.** A
  Svelte or TS edit is in the next page load. After `bun run build`, and
  after a new route or static file, `systemctl --user restart
  stem-shovel-dev` and wait for a 200 before browser tests.

- **Our own `Permissions-Policy` header switched off four features we
  shipped.** `microphone=()` blocked `getUserMedia`, `midi=()` blocked
  Web MIDI on the deployed site while the dev server worked (a user
  report), `publickey-credentials-get=()` blocked every passkey sign-in,
  and `display-capture=()` kept the looper's Computer source from opening
  the share picker; each is `(self)` now. `autoplay` is deliberately not
  listed because disabling it blocks `play()` too. The constant in
  `securityHeaders.ts` and `vercel.json`'s copy drift apart; keep them in
  step (0.60.0, 0.29.0, 0.79.0, docs/environment.md "Response headers").
- **The CSP's `connect-src` refuses `fetch` of a `blob:` URL.** Fetching
  the page's own object URL before saving it failed with "Failed to
  fetch"; a blob made in the page goes to a download through an `<a
  download>` on an object URL (`utils/downloadBlob.ts`, 0.115.0,
  495ba61). CSS written through `el.style` is fine under a CSP without
  `unsafe-inline` for styles (`anchorFallback.ts`).
- **`showPopover()` called directly gives CSS anchor positioning no
  anchor.** A ContextMenu opened through `bind:openState` landed in the
  viewport's corner; open it through its own trigger button. Firefox and
  older Safari have no anchor positioning at all, so `placePopover`
  positions from `getBoundingClientRect` where `CSS.supports("anchor-name:
  --a")` is false (0.62.0, `utils/anchorFallback.ts`).
- **Native popovers and the UnoCSS reset.** The reset zeroes every
  element's margin, which overrides the browser's `margin: auto` on
  `[popover]`, so a centered popover needs `m-auto` (8e1ca96). A display
  utility on a popover (`flex`) shows it while closed; use
  `[&:popover-open]:flex` (5b35c51). A phone-width popover sized with
  `dvh` keeps its top on screen on iOS (2bfb2a3).
- **A deploy retires the previous build's hashed assets.** An open tab's
  next client-side navigation fetched a missing stylesheet and came up as
  a dark, empty-looking page. `kit.version` named after the commit with
  `pollInterval: 60_000` and a `beforeNavigate` that turns the first
  navigation after a new version into a full load (0.27.0,
  docs/environment.md "Deploys and open tabs").
- **The browser's declared MIME type is unreliable.** Firefox says
  `audio/x-wav`, macOS labels a Voice Memo `audio/x-m4a`, some files have
  none; the upload token allowed only the extension's type, so `.m4a`
  uploads were refused. Derive the content type from the extension on
  both sides (999ad03, e659e94).
- **Password managers and iOS keyboards read a lone text field as a
  login.** A single text input made iOS offer the password manager
  instead of a keyboard; free-text fields carry `data-1p-ignore`,
  `data-lpignore` and `data-bwignore`, and a placeholder or aria-label
  that says "label" rather than "name" gives AutoFill heuristics no
  username cue (f26909d, `ReportForm.svelte`).
- **Focus leaving the window releases held keys.** A tab switch dropped
  the chord player's sustain latch with the keys; a latch is a setting,
  not a held key (0.117.1). The other way round, a focused toolbar button
  swallows the space bar, so transport buttons blur themselves after a
  click (docs/demo-recording.md `spaceOwner`).
- **Safari purges script-writable storage after seven days without a
  visit.** IndexedDB and localStorage copies are caches, never the only
  copy; upload promptly (docs/multitrack-recorder.md "Local
  persistence"). iOS also records only with Safari in front and the
  screen on, and an incoming call ends the track, so segments go to
  IndexedDB as they arrive and the take is recoverable
  (docs/demo-recording.md "Phone realities").

## Svelte and the page

- **A page that shows the jobs function's results must refresh itself.**
  The Sessions page loaded once after an upload and never again, so the
  MP3 and the waveform the jobs function made seconds later stayed
  "rendering…" until a reload; the earlier browser spec only passed
  because the second upload outlasted the first file's render. A timer
  calls `invalidateAll` every few seconds while a row is pending, capped
  (sessions review, 2026-10-19). The song page already did this for
  stems' renditions.
- **Page data is not deeply reactive.** Setting `song.shared = true` on
  an object inside `data.songs` changed nothing on screen; the menu
  label stayed. After a mutation on the server, `refreshAll()` and let
  the load bring the new row (D7).
- **A `$effect` on a flag fires on the transition, not while it holds.**
  The autosave effect watched `studio.dirty`; a save in flight cancelled
  the debounce timer, an edit during the save left the flag true, and no
  save was ever scheduled again. After a save, compare the snapshot
  sent with the state now and reschedule when they differ
  (`studioPersistence.svelte.ts`, D7/D8).
- **Serialize the page's own saves when the server guards on a base
  revision.** Two overlapping saves from one browser carry the same base
  and the second looks like another person's write. A promise chain
  (`saveNow` behind the save in flight) keeps the base the one the last
  save made (D7).
- **`{@const}` sits only directly under a block or component tag.** Not
  inside a plain `<div>`; hoist it to the `{#each}` it belongs to
  (StudioTimeline, D4).
- **A derived declared before `const engine = studio` cannot use
  `engine`.** Order in `<script>` matters for `$derived` initializers;
  read the imported singleton instead.
- **Valibot's `nanoid` action accepts any `[\w-]+` string.** A test with
  `"short"` as a bad id passed; use a value with a space or punctuation.
  A forward reference in a schema (a track holding clips declared later)
  works with `v.optional(v.lazy(() => Schema))`.
- **Popover placement from a button at the far left lands at x = 0.**
  `ContextMenu` with `position="bottom left"` extends leftward from the
  button and clamps to the viewport; the timeline's inserts menu and the
  console's do this alike (pre-existing, noted in D2).

- **Links preload on hover.** The nav's Sign out link pointed at a page
  whose `load` ended the session, so hovering it signed you out. Anything
  with a side effect is a POST (a remote form), never a page load
  (0.2.0).
- **Reloading page data before navigating can swap the target out.** The
  two-factor verify page refreshed its data, the refresh redirected (the
  user was now signed in) and the navigation target read as
  `/undefined`; capture the target first, then navigate with a single
  reload (0.16.0).
- **SvelteKit hides an unexpected error's message in production.** A
  failed AI call surfaced as "Internal Error"; throw `error(502, message)`
  so the reason reaches the client, and show it through `errorMessage`
  (0.10.0).
- **SvelteKit 3 refuses `redirect()` to an external URL.** The file
  permanent link `/f/<code>` answered 500; a plain 302 `Response` to the
  store does it. Behind a proxy a redirect built from the request's
  origin came out `http://`, so redirects on a stage are relative
  (0.123.0).
- **SvelteKit 3 renamed what a script posts to a remote form.** Fields
  are namespaced `field/<form id>`, which broke the blob smoke script;
  `$lib` became `#lib` with extensions, `invalidateAll` became
  `refreshAll`, `$app/environment` became `$app/env`, and `handleError`
  now receives validation errors too, sorted by `kind` (f0d994b,
  0.113.1).

## Testing

- **Headless Chromium names a download "download" when the `download`
  attribute holds a non-ASCII character.** `a.download = "Song · Oct 21
  · 02-32 PM.zip"` (Dawn's default song title, with middle dots) came
  through Playwright 1.63's `download.suggestedFilename()` as
  "download"; "Éclair.zip" and an en dash did the same, while the ASCII
  spelling kept its name. Real Chrome keeps the Unicode name. A spec that
  reads a download's name gives the song an ASCII title first
  (studio-export.spec.ts) (2026-10-21).
- **Validating a writer's XML against its schema finds what a lenient
  reader hides.** Dawn's DAWproject writer had written `Volume` before
  `Pan` and `Mute` inside `Channel` since the start; Bitwig's own JAXB
  reader and Dawn's reader took it, and the first `xmllint --schema
  Project.xsd` refused it (the schema's sequence is Mute, Pan, Sends,
  Volume). `libxml2-wasm` (1.3 MB, MIT, `XsdValidator.fromDoc`) runs the
  same check inside Vitest, so every writer test now validates against
  the schemas kept in `tests/dawproject/` (2026-10-21).
- **`import.meta.url` resolves to `/` under the jsdom environment.** A
  test file that needs a fixture from disk resolves it from
  `process.cwd()` instead of `new URL(..., import.meta.url)`, which
  landed on `/tests/...` (2026-10-21).
- **A `// @vitest-environment jsdom` docblock works inside a Vitest
  project that runs on Node.** The unit project (`src/**/*.test.ts`,
  environment node) still honours the per-file docblock, so a parser that
  needs `DOMParser` (utils/dawprojectRead.ts) is tested beside its module
  without moving it into the jsdom project's `*.svelte.test.ts` pattern
  (2026-10-21).

- **A textarea's text joins its label's accessible name.** `getByLabel("Comment",
  { exact: true })` found the empty box in the create form and nothing in the
  edit form, where the same label wraps a textarea with text: the name was
  "Comment Drags after the bridge". Match a filled control by the start of
  its name (`getByRole("textbox", { name: /^Comment/ })`) or put the label
  text in `aria-label` (sessions review spec).
- **A `{@const}` inside an `{#if}` block is read again as the block closes.**
  A menu's handler set `menuAt = null` and then used `r`, declared as
  `{@const r = menuAt.recording}` in the `{#if menuAt}` block: the const
  re-evaluated on null and the page crashed out of its template. Read what
  a handler needs into a local before clearing the state that shows the
  block (sessions page menu).
- **The fakes' `background()` never runs its callback.** A remote test
  asserting that a notification helper was called sees nothing: the
  notice runs inside `background(() => notify…)`, and the fake
  `background` is a bare `vi.fn()`. Assert on `background` being called,
  or call the captured function (sessions review remote tests).
- **`form()` refuses a valibot schema wrapped in `v.pipe(…, v.check())`.**
  The check's input type is the object alone, which the remote `form`
  overloads do not accept. Keep the form schema a plain `v.object` and do
  the cross-field check in the function with `error(400)` (`ChatSchema`'s
  one-of-two scope).
- **Playwright `count()` counts hidden elements; `getByRole` does not.**
  A closed popover's buttons (display: none) make `count()` non-zero and
  then a `click()` waits forever for visibility. Filter with
  `.filter({ visible: true })` before counting (`deleteStudioSongs`,
  D7). The same helper raced its own deletes behind a fixed wait; wait
  for the row count to drop instead.
- **`getByRole` names match by prefix unless `exact: true`.** "EQ Low"
  also matched "EQ Low freq" and failed strict mode (D2 mixer spec).
- **A status text can match before the thing happened.** "saved" showed
  as soon as a song opened, so a test waiting for it passed before the
  autosave landed and the next step raced it. Wait for "unsaved" and
  then "saved" (D7 spec).
- **Screenshot scripts and the browser suite share the bot's account.**
  A one-off script deleting the bot's songs while the suite runs makes
  a spec fail mid-test. Run them one after the other.
- **A regex in a heredoc gets double-escaped.** `\\d` in a bash heredoc
  writing a `.ts` file becomes a literal backslash in the regex. Check
  the written file (D5 spec).
- **`page.dragAndDrop` drives HTML5 drag-and-drop** with the page's own
  `dataTransfer`, so a library-to-timeline drop is testable without
  synthesized events (D6 spec). In jsdom, dispatch a `dragover` and a
  `drop` with a `dataTransfer` defined on the event instead.
- **Two pages in one Playwright context share the sign-in.** The
  conflict test opens the same song in a second page from
  `context.newPage()` (D7 spec).
- **jsdom lacks `scrollIntoView` and `:popover-open`.** Stub the first
  on `Element.prototype`; scope a popover's content by its `[popover]`
  ancestor rather than the pseudo-class (component tests, D2).
- **Vitest fake timers and promise chains.** Work queued behind
  `.then` does not run until microtasks flush; `await
  vi.advanceTimersByTimeAsync(0)` flushes them (persistence test, D8).
  A mock that captures a resolver inside its implementation has not
  captured it until the mock ran.
- **Oxlint's `unbound-method` flags `expect(obj.method)`.** Hoist the
  spies (`vi.hoisted`) and hand them to the mocks, then assert on the
  spies (`instruments.test.ts`, D6). It also wants `sort` to have a
  comparator and `expect(...).toBeDisabled()` awaited in Playwright.
- **`git add -A -- <path>` fails on a path already removed with
  `git rm`.** Leave removed files out of the list; the removal is
  staged already.

- **Chromium fakes a microphone.** `--use-fake-device-for-media-stream
  --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=<wav>`
  plays a WAV as the input, which is how the recorder, looper and Studio
  specs record; iOS Safari needs a real phone (docs/demo-recording.md
  "Testing", `playwright.config.ts`).
- **The CSP forbids string evaluation in `page.evaluate`.** The browser
  specs pass the window as a handle and reach the engines through the dev
  build's `window.__studio`, `__looper` and friends instead of evaluating
  strings (fc86144, docs/testing.md "Browser tests").
- **The varlock Vite integration bakes real ids into a module under
  test.** The Blob test "passed" only because its hard-coded store ids
  happened to be production's; derive expectations from the `ENV` the
  test actually sees, and have the env mocks export `initVarlockEnv`
  (2ac4fb4, ce180b0).
- **`@vitest/coverage-v8` must be pinned to the Vitest that Vite+
  bundles**, and instrumentation slows the FFT-heavy analysis tests
  enough to need a longer timeout; lines in `.svelte` files count only
  for the component project, so engines behind Web Audio read low
  (90a4534, docs/testing.md "Coverage").
- **A secrets-scan action must be on the repository's allowed-actions
  list** (`gitleaks/gitleaks-action@*`) or the workflow never starts, with
  no error in the run list (1003030).

## Database and tooling

- **A schema floor hides a missing value.** A stem with no stored length
  became a Dawn clip of 0.001 s, the clip schema's minimum, which passed
  validation and drew nothing: the import had turned "unknown" into
  "tiny". Treat nullable metadata as unknown all the way down (measure it,
  or fill it in when the real value appears) rather than clamping it into
  a valid-looking number (stems into Dawn, 2026-10-20).
- **Turso answers 502 to drizzle-kit's migration batch now and then
  while single statements go through.** `bun run db:migrate:steps`
  applies the statements one at a time with the same journal rows
  (0089/0090, and the fallback for 0091).
- **drizzle-kit `generate` through varlock** needs the environment
  (`bun run db:generate`), and a `v.lazy` schema in valibot has no
  bearing on the Drizzle side.
- **Fallow flags a type re-export and unused stage factories.** Keep
  internal factories unexported; re-export a type only where something
  imports it (D2, D6).
- **cspell wants every technical term listed.** `words:` in
  `cspell.config.yaml` (libebur, sinc, WSOLA); `bun run spell:us`
  catches British spellings in copy, comments included.
- **Phosphor icon names can be checked before use** against
  `node_modules/@iconify-json/ph/icons.json`; an unknown name renders
  nothing without an error. UnoCSS likewise renders nothing for a color
  that is not in the palette (`bg-sage` is not; `bg-green-300` is).

- **Bundling does not rescue a CommonJS server dependency on Vercel.**
  `ssr.noExternal` leaves the inner `require()` in place (sanitize-html
  still required htmlparser2 10, ESM-only, and the nested copy was not in
  the function), and pinning to the last CommonJS htmlparser2 did not
  load either; the sanitizer was rewritten on parse5. After a build,
  `.vercel/output/functions/*/node_modules` shows what was packed
  (1167412, efd728f, e47a516, 8dc44cc; docs/environment.md "Server
  dependencies must be ESM").
- **Vercel's file tracer sees only literal imports.** tfjs and Basic
  Pitch were never packed because `notes.ts` imported them by a variable
  name, so notes transcription silently failed on every song page until a
  literal `import()` named them (`traceTranscriptionDeps`); the tracer
  resolves `better-auth` to its package.json alone and never copies
  `dist/` ("Cannot find module 'better-auth'"), hence `ssr.noExternal` for
  that one, which is pure ESM; it special-cases `ffmpeg-static`, whose
  postinstall download also needs `trustedDependencies` under Bun
  (`server/notes.ts`, `vite.config.ts`, 0.17.0,
  docs/uploads-and-blob.md).
- **A function's fetch of its own site is challenged by the firewall.**
  tfjs's node-fetch client got a 429 on the model file; Node's own
  `fetch` under a named user agent passed for a while, and the model now
  travels bundled as JSON written to the job's temp dir (17b26ad,
  8577cf6). The dev VM's address bypasses the bot challenge, which is why
  `smoke:urls` can run there (docs/testing.md).
- **The dev server cannot call itself through the exe.dev proxy.** The
  jobs self-call used the proxy's origin and was refused, so Chrome takes
  on dev stayed raw PCM with no MP3 and nobody noticed; in dev it targets
  localhost (495ba61).
- **`vercel.json` host redirects stopped applying once the dashboard's
  domain redirect was removed** (every host served the site), so vanity
  domains redirect from the server hook with a 308 (58fed89,
  `utils/vanityHostTarget.ts`). An edge rule `/:account/ideas` also
  caught `/docs/ideas`, so account-scoped redirects stay in SvelteKit
  (cfb4fc0). The `X-Robots-Tag` rule for static files in `vercel.json`
  must be widened for each new public page; `/tuner` carried `noindex` in
  production from the day it shipped (0.28.0).
- **Vercel's bundled Bun cannot read the v2 lock file Bun 1.4 writes**,
  so it ignored `bun.lock` and resolved fresh on every build; `vercel.json`
  installs with `npx bun@<pinned> install --frozen-lockfile`. Dependabot's
  bun updater rejects the same lock file, so it watches Actions only
  (40eb569, 8b72009).
- **Vite evaluates its config before a plugin can inject env.** The
  Sentry plugin saw no token until `@varlock/vite-integration` was
  imported first (it runs `varlock load` and fills `process.env` at
  import); `varlock run -- vp build` is not an option on Vercel, where
  there is no `OP_TOKEN` and the CLI cannot read the encrypted integration
  variables (e72e8f9, 33c527b, 86b464e). Under `SKIP_VARLOCK` the plugin
  module must not even be imported, since it reads `.env.schema` on import
  and complains (f2e2fc2).
- **UnoCSS `presetWebFonts` fetches the provider's CSS when the config
  loads.** That timed out in CI's test job; splicing the preset out under
  tests broke CSS hot reload in dev, so it stays with the no-fetch
  provider under Vitest and CI while builds still inline the fonts
  (a9e255a, 0.35.0).
- **`@libsql/client` 0.18 rejects the `turso://` URLs Turso's newer
  dashboard hands out**, though the database speaks the same protocol;
  `utils/libsqlUrl.ts` swaps the scheme wherever a client opens, so either
  form may sit in 1Password (2ac4fb4).

## Packages

- **Reaper runs headless under Xvfb and takes a ReaScript on its command
  line.** `Xvfb :99` then `reaper -cfgfile <ini> -nosplash -new
  script.lua` runs the script at startup with no display, sound card or
  license step (the evaluation build asks nothing); the script saves
  with `Main_SaveProjectEx` and quits with action 40004. Dialogs it
  raises anyway (no audio device, the MIDI import options, "create
  directory?") are answered by `xdotool windowfocus` + `key Return`;
  `windowactivate` fails because the bare display has no window
  manager. `InsertMedia(file, 1 | 4096)` places a Broadcast WAV at its
  `bext` time reference (Dawn's clips landed to the sample), and
  `GetMediaFileMetadata(source, "BWF:TimeReference")` reads the raw
  value. The MIDI import dialog's choices live in reaper.ini as
  `midiimport`, a bit set: 1 expands the file's tracks to Reaper
  tracks, 2 imports the tempo map, 4 imports the markers; a marker
  imported without the tempo map lands at its tick position read at the
  project's tempo (12.5 s became 11.75 s). `-cfgfile` keeps all of that
  in a folder of the run's own (scripts/interop/reaper.mjs,
  2026-10-21).
- **Audacity's scripting pipe (mod-script-pipe) under a virtual display**
  (scripts/interop/audacity.mjs, 2026-10-21): Ubuntu's `audacity`
  package carries the module, the AppImage 3.7.9 crashed on this VM
  (exit 255, no window) and 4.0.1 has no module. A module Audacity has
  not seen before gets status 4 ("new") in `[Module]` and is not loaded,
  whatever status the config asked for: name it in `[ModulePath]` and
  `[ModuleDateTime]` too and status 1 holds. wxWidgets puts the config
  under `XDG_CONFIG_HOME`, so a run can have its own; `[Directories]
  TempDir` keeps the autosave out of `/var/tmp`, where a killed run's
  project brings a crash-recovery dialog next time that blocks the pipe.
  A pipe response stops at 32 KB (`GetInfo: Type=Commands Format=JSON`
  never finishes; `Format=Brief` does). `Import2` of a text file shows a
  modal error that blocks the pipe until dismissed; labels come in
  through the `ImportLabels:` menu command, whose GTK dialog takes a
  path after ctrl+L. A command's answer ends with a line starting
  `BatchCommand finished`; blank lines come before it. Open the `to`
  pipe with `O_NONBLOCK` to learn whether Audacity is reading (ENXIO
  when not). `xdotool windowfocus` works without a window manager where
  `windowactivate` fails; a `pkill -f`/`pgrep -f` pattern that appears
  in the running shell's own command line kills that shell.
- **Sandyne (the free DAW) renders and inspects projects from the
  command line with no display**, on a VM with no sound card:
  `sandyne inspect file.sand` and `sandyne rendertracks file.sand
  --output-dir out --format wav` (JACK and ALSA complaints on stderr,
  harmless). Its project file is plain JSON, its Linux build a tarball
  installed by `install.sh --accept-license` into
  `~/Applications/Sandyne`. The GUI starts under Xvfb with `--no-gpu`.
  Its `--ws-control` socket speaks TLS with a self-signed certificate it
  writes to `~/.config/Sandyne/control-cert.pem`, so a plain `ws://`
  client is dropped at the handshake (2026-10-21). A `.sand` written by
  hand needs only `version`, `global` (bpm, beatsPerBar), `tracks`
  (trackId, index, type 1 sample or 0 synth with `internalInstrumentId`,
  name, volume, pan, mute, solo, contentIds) and `contents` (type 1
  sample with `sampleFilePath` relative to the project file, or type 0
  notes with `notesData` in beats from the clip; `startBeat`,
  `lengthBeats`, `contentStartOffset` in beats); `rendertracks` names
  the files `<title>_NN_<track>.wav`, 24-bit at 44.1 kHz, and starts a
  note's voice at the head of its render block, a few ms early.
- **Ardour's headless `ardour8-lua` cannot import.** Import goes through
  `Editor:do_import`, which only the GUI has; `Session.import_files`,
  `RegionFactory` and `ImportStatus` are not bound in the headless
  interpreter, and no Dummy backend is listed on Ubuntu's 8.4 package
  (`AudioEngine:start` answers −1). An Ardour check needs the GUI under
  Xvfb, driven by its own action scripts, or its session XML written by
  hand (2026-10-21).
- **Bitwig's DAWproject reference library writes a test corpus.** The
  repository ships no example projects, but `./gradlew test` (OpenJDK 21)
  writes twenty into `target/`, covering beats and seconds, offsets,
  fades, warps, controller automation, alias clips, markers and a plugin:
  the best stand-in for a real export when no DAW is at hand (2026-10-21).
- **DawVert converts DAW projects to and from DAWproject from the command
  line** (`python3 dawvert_cmd.py -i in -ot dawproject -o out`, Python
  3.12, its requirements in a `uv` venv). It reads Reaper, Ableton Live 11,
  FL Studio, LMMS and MIDI, among others, and reads DAWproject back into
  those, so it is a second opinion on a DAWproject writer (2026-10-21).

- **`@vercel/blob`'s `put` retries, and a stream cannot be read twice.** A
  Blob-to-Blob copy that handed `fetch`'s body stream to `put` worked until
  a part failed and the SDK retried: "Response body object should not be
  disturbed or locked", and a five-stem import stopped at the third. Use
  the SDK's `copy` within a store (the service copies, nothing passes
  through the function) and a buffered `Buffer` across stores (`copyBlob`,
  2026-10-20).
- **`@mediabunny/mp3-encoder` 1.62.0** (MPL-2.0, ESM, peer `mediabunny
  ^1.0.0`): `registerMp3Encoder()` adds LAME as a mediabunny custom
  encoder, and a custom encoder wins over a native one, so register it
  only on the first encode (`encodeMp3.ts` imports it dynamically; it is
  312 kB with the worker and WASM inlined, spawned from a blob URL, so a
  CSP would need `worker-src blob:`). Three things the types do not say:
  an explicit `Quality({ bitrate })` reaches LAME unsnapped (mediabunny
  snaps only the bitrates it derives from a quality level), so snap to
  the Layer III set yourself; the encoder's `supports` takes only the
  MPEG rates (48, 44.1, 32 kHz and their halves and quarters), so a 96 kHz
  buffer needs `transform.sampleRate`; and a planar `AudioSample` is one
  `Float32Array` with the channels laid end to end, five seconds at a time
  the way `AudioSample.fromAudioBuffer` does it (Dawn MP3 export,
  2026-10-20).
- **signalsmith-stretch 1.3.2** (MIT, ESM): worklet from a blob URL
  plus WASM; fine where the CSP allows it, set aside here (see Browser
  platform).
- **fflate** zips in the browser synchronously (`zipSync`) and streams
  on the server (`Zip`, `ZipPassThrough`); audio goes in stored (level
  0), text deflated. A `.dawproject` is a zip with `project.xml`,
  `metadata.xml` and the audio.
- **Valibot** `v.picklist` over a `const` array keeps one source of
  truth for an enum and its type (`STUDIO_FADE_SHAPES`,
  `STUDIO_INSTRUMENTS`).

- **Better Auth turns a 403 from `user.create.before` into a fake
  success.** The sign-up route uses that as its duplicate-email cover, so
  a gate that refuses must throw a 400 with a reason (57b7536,
  docs/auth.md "Invite-only sign-up").
- **Better Auth's handler ignores a request whose origin differs from
  `baseURL`.** With the URL pinned to production for every non-dev build,
  every `/api/auth/*` call on a preview answered the app's 404 page and
  nobody could sign in on staging; previews infer it from the request
  (7b9ad2a).
- **Better Auth encrypts TOTP secrets with `BETTER_AUTH_SECRET`.** A
  `two_factor` row copied to a stage with its own secret can never verify
  and the retries trip the plugin's 3-per-10-seconds limit; a restore
  leaves the table out and users re-enrol per stage (5bfa611).
- **`@vercel/blob` prefers OIDC whenever `VERCEL_OIDC_TOKEN` is set**
  (it is, in `.env.local` after `vercel env pull`) and that fails in
  development, so every call passes `token` explicitly;
  `onUploadCompleted` cannot reach localhost, so the browser's own ready
  report is the primary path and the webhook a production backstop
  (docs/environment.md, docs/uploads-and-blob.md).
- **`@vercel/analytics` and `@vercel/speed-insights` `/sveltekit` entries
  still import `$app/stores`**, removed in SvelteKit 3; inject from their
  generic entries and report the route after each navigation yourself
  (`src/lib/observability.ts`, 0.113.1).
- **`@sentry/sveltekit`'s server entry re-exports the Vite plugin**,
  dragging Vite, esbuild and Babel into every cold start, and its ESM
  loader hook slows every import after it; `autoInstrument: false`
  because the load wrappers import that entry into every route
  (docs/environment.md "Sentry", b59e9dc).
- **DOMPurify's server build pulls in jsdom**, whose
  `html-encoding-sniffer` now depends on an ESM-only package; it took
  production down on every route at cold start (1167412;
  `server/sanitize.ts` header).
- **The in-app markdown editor (woof-editor) saves headings with
  brackets escaped** (`## \[0.31.0\]`), so a changelog parser that knows
  only `## [x.y.z]` emptied the Releases page after every in-app edit;
  accept both spellings (0.31.1, `parseChangelog`).

## `decodeAudioData` never says what rate a file was (2026-10-21)

`AudioContext.decodeAudioData` and `OfflineAudioContext.decodeAudioData` resample to the context's rate and return a buffer at that rate; nothing in the result says what the file's own rate was. So a stem uploader or an import that wants to compare a file's rate with the song's has to read the header itself: `utils/audioSampleRate.ts` reads WAV and RF64 (`fmt `), AIFF (`COMM`, an 80-bit float), FLAC (STREAMINFO's 20 bits), MP3 (the first frame header after the ID3v2 tag; the version bits halve or quarter the table), MP4 (the `mp4a`/`alac` sample entry's 16.16 rate, so 96 kHz AAC, rarer than rare, reads as 0 and comes back null) and Ogg (the Vorbis identification header; Opus is always 48 kHz). Surfaced building the sample-rate setting (docs/multitrack-recorder.md "Sample rates"). The flip side is useful: `new OfflineAudioContext(1, 1, rate).decodeAudioData(bytes)` is a free, exact resampler to `rate`, and an `OfflineAudioContext` at the song's rate playing buffers decoded at the device's resamples them on the way (`audio/resampleBuffer.ts`, and how the Studio's offline render now comes out at the song's rate on every machine).

## vite-plus: the Vite alias in package.json moves with it (2026-10-22)

`vite-plus` pins its own Vite build through two aliases in package.json: `"vite": "npm:@voidzero-dev/vite-plus-core@<version>"` in devDependencies and again under the overrides. `bun add vite-plus@1.3.0` bumps `vite-plus` and `@voidzero-dev/vite-plus-core` but not those alias strings, and `vp build` then refuses to run ("Expected @voidzero-dev/vite-plus-core@1.3.0, but found 1.1.0 at node_modules/vite/package.json. Run `vp migrate`"). Vitest, lint and svelte-check ran fine on the mismatch, so only the build caught it. Change the two alias lines to the new version (or run `vp migrate`) and `bun install`. Then the dev server, and only the dev server, failed with SvelteKit's `vite_ssr_environment_not_runnable` ("must be a `RunnableDevEnvironment`"): `bun install` had left a second copy of the core at `node_modules/vite-plus/node_modules/vite`, so the `vp` CLI ran one Vite and SvelteKit imported another, and the `instanceof` check behind that error fails across two instances (SvelteKit's runner.js says as much). The build, Vitest, lint and svelte-check were all fine with it. `rm -rf node_modules && bun install` left one copy and the dev server came back; check `ls node_modules/vite-plus/node_modules` after any vite-plus bump. Surfaced updating the packages after Dependabot's Vitest advisory.

## TypeScript 7 is not for this stack yet (2026-10-22)

`typescript@7.0.2` on npm is the Go compiler: a `tsc` binary per platform (`@typescript/typescript-linux-x64` and sixteen siblings) and not the JavaScript API that tooling loads. With it installed, `bun run check` and `bun run lint` both died before doing anything, in Vite's config hook ("Cannot read properties of undefined (reading 'readFile')": something in SvelteKit's or vite-plugin-svelte's config resolution reaches for `ts.sys`, which is not there). The peer ranges say as much: svelte-check 4.7.7 wants `^5 || ^6`, @sveltejs/kit 3.1 `^6`; only vite-plus's core admits `^7`. Reverted to 6.0.3. Try again when svelte-check and kit declare 7 in their peers (`npm view svelte-check peerDependencies`).

## Reaper's tempo is quarter notes a minute in any time signature; the transport shows the "divided" one (2026-10-23)

From a probe (a project with `TEMPO 120 6 8` and a tempo point carrying `(8 << 16) | 6`, opened in Reaper 7.82 under Xvfb and read through the API), for Dawn's time-signature denominators (utils/rpp.ts, utils/rppRead.ts).

- **`TEMPO` and the `PT` points store the quarter-note tempo.** At 120 in 6/8, `TimeMap2_timeToQN(0, 1.5)` is 3: 120 quarter notes a minute, a 6/8 measure three of them (1.5 s; `TimeMap2_beatsToTime(0, 0, 1)` = 1.5).
- **`TimeMap2_GetDividedBpmAtTime` is 240 there**: the tempo in beats of the bottom number, which is what Reaper's transport displays ("240" for that 6/8). `TimeMap_GetTimeSigAtTime` returns 120, the stored tempo, with 6/8.
- So a DAW-style tempo (Live, Bitwig, a MIDI file and Dawn all count quarter notes) goes into an `.rpp` unscaled whatever the signature, and the `(denominator << 16) | numerator` on a point carries the bottom number.

## Vercel redirects skip header rules; vp check types scripts; package.json edits bounce the dev server (2026-10-25)

From the indexability audit (scripts/seo-audit.ts, docs/security.md "Indexability audit").

- **vercel.json's `redirects` answer before any `headers` rule applies**, so a 308 from an old address carries no `X-Robots-Tag`; harmless when the target is noindex, but the audit lists such routes as exceptions rather than clean.
- **`vp check` type-checks `scripts/*.ts` and infers types from imported `.mjs` modules**: reassigning a field of a value a JS function returned fails until the value is typed as `Record<string, unknown>`.
- **Editing package.json restarts the Vite dev server for a moment**; a script hitting it right then is refused. Wait a second before probing.

## Drizzle `with` objects, and a chat panel that reopens itself (2026-10-25)

From the chat's mentions and reactions (docs/chat.md).

- **A Drizzle relational `with` object shared `as const` must not carry `orderBy`:** the readonly tuple does not fit drizzle's mutable array type, so the shared relation set leaves ordering to the caller (the reactions are folded in set order anyway).
- **The song page reopens the chat panel on its own after a reload** when the address carried `?open=chat` or the panel was open before, so a Playwright step that clicks "Chat" to open it closes it instead; check the dialog's visibility first.

## Remote forms in Playwright, and Fallow's view of a prop passed straight through (2026-10-25)

From the short links page (/settings/links, docs/security.md "Short links").

- **A remote form field's `as("text", …)` input renders with no `type` attribute**, so a Playwright `input[type=text]` locator misses it; locate by placeholder, label or name. The `name` of a `.for(id)` form's field carries a suffix (`slug/<hash>/setShortLinkSlug`), so match it with `name^=`.
- **Fallow reports a Svelte prop unused when its only use is as an attribute on a child component** (`<Child before={prefix} />`); deriving the value inside the child instead keeps the audit quiet.
- **`pcmCache`-style "never throws" facades hide a failed write from a `write` call's result**; see the engine entry above for the `stat` confirmation.

## A message-fed AudioWorklet voice: transfers, duplicate needs, offline timing (2026-10-25)

From building the Studio's streaming voice (static/worklets/stream-voice.js, audio/streamVoice.ts; docs/multitrack-recorder.md "Scale and structure"), proved in headless Chromium live (a voice scheduled 0.5 s ahead began on time, ended at 2.56 s against 2.552 expected, nothing starved) and offline (first non-zero sample exactly at a mid-block start frame).

- **Planes that are views of one `ArrayBuffer`** (as a cache range read returns them) must list that buffer **once** in `postMessage`'s transfer list; listing it per plane throws `DataCloneError`.
- **A voice's first blocks can run before its pre-read has all landed**, since feed messages arrive between render quanta, so the processor posts a `need` it does not need; the facade keeps one read pump and takes `want = max(want, upto)`, which makes the duplicates harmless.
- **An `OfflineAudioContext` renders far ahead of messages**, so testing a message-fed worklet offline needs `ctx.suspend(t)` checkpoints to let the feeds land before the frames they cover.
- **The cache worker's writes block range reads unless sliced:** a 160 MB write took 844 ms whole; in 8 MB slices with a `MessageChannel` yield between (a chained `setTimeout` gets throttled), reads of another file completed during it at a median of 22 ms, worst 154 ms (the final flush and move), well inside the voice's 1.5 s lead.
- **`pcmCache.write` resolves the same whether the copy was written or not** (a miss is never an error), so the engine confirms a copy with a `stat` afterwards before marking a source `onDisk`; and a buffer read back from disk says nothing about its origin, so a source held as a blob (the browser-kept song) is excluded explicitly or it would be marked on disk with no copy.
- **The singleton engine opens its context once per module**, so a test of the "worklet refused" fallback re-imports it with `vi.resetModules()`.
- **A 16-tap Kaiser-windowed sinc (β 7, cutoff 0.9 of the lower Nyquist, 512 tabulated phases)** resamples 48 to 44.1 kHz at -72 dB error at 1 kHz and -65 dB at 10 kHz, about 3 ms per second of stereo; 44.1 to 48 at 15 kHz is only -39 dB, the short kernel's roll-off.

## `bunx oxfmt <file>` ignores the project's formatting config (2026-10-28)

From the v0.194.0 release: `bunx oxfmt CHANGELOG.md package.json` printed
"No config found, using defaults" and rewrote package.json with two-space
indentation, after the release's `bun run lint` had already passed; the
commit carried it and the next `vp check` failed on formatting. The
project's formatter settings live with Vite+ (`vp fmt`, what `bun run
format` runs), not in an `.oxfmtrc`, so the standalone binary falls back
to its defaults. Format single files with `bunx vp fmt <file>` or run
`bun run format`; never `bunx oxfmt` directly.

## Fallow's audit JSON keeps the new-only verdict under `attribution` (2026-10-28)

From the v0.192.0 release gates (fallow 3.36.0, `bunx fallow audit --format json`):

- **There is no top-level `findings` array.** The document is `{ verdict, summary, attribution, gate_outcomes, dead_code, duplication, complexity, … }`: the per-finding `introduced: true` and `attribution: "introduced" | "worsened" | "inherited"` flags sit on `complexity.findings[]` (with `worsened_metrics`), and the verdict's own tally is `attribution` at the top (`gate: "new-only"`, `worsened`, the counts `dead_code_introduced`, `complexity_introduced`, `complexity_worsened`, `duplication_introduced`, `styling_introduced`). A filter written for a flat `findings[].introduced` reads nothing and reports "0 introduced", which is what the release gate did for several releases: a duplicate export (`accountOfRecordingSession` in both `access.ts` and `data.ts`, from v0.190.0) went unseen until the text output was read. The gate check is now `jq '.attribution'` plus `jq '.complexity.findings[] | select(.introduced or .attribution == "worsened") | {path, name, cyclomatic}'`, with the text output (`bunx fallow audit`) read when the verdict is not pass.

## A module-level Drizzle column reference in data.ts breaks a test that mocks the schema (2026-10-28)

From `src/routes/api/warm/long/server.test.ts` failing after `sessionRecordingOrder` was added to `src/lib/server/data.ts`:

- **`const order = [asc(sessionRecording.sortOrder), …]` at module level runs when data.ts is imported**, and a test that mocks `#lib/server/db/index.js` with a partial `schema` (the warm-function test does, to see which route config a page declares) has no `sessionRecording` there, so the import itself throws `Cannot read properties of undefined (reading 'sortOrder')` from a test about something else. Column references belong inside functions (`const order = () => [...]`), evaluated when a query runs; a shared order is a function, not a constant.

## OPFS from a Studio page: fast in Chromium, closed in Playwright's Linux WebKit (2026-10-24)

From a spike for the Studio's disk cache of decoded sources (docs/multitrack-recorder.md "Scale and structure"; docs/dawn-daw-plan.md D8), a Playwright page on the dev server's origin writing and reading a four-minute stereo file (46 MB at 16-bit) in the Origin Private File System.

- **Chromium (headless, this VM):** a worker's `FileSystemSyncAccessHandle` wrote at 320 MB/s and read 256 KB ranges at 300 MB/s, the whole file at 785 MB/s; the main thread's `getFile().slice().arrayBuffer()` read it at 1284 MB/s and `createWritable` wrote at 277 MB/s; rebuilding a 4-minute stereo `AudioBuffer` from 16-bit PCM took 66 ms; `navigator.storage.estimate()` offered 10.7 GB. Disk reads are not the bottleneck of a cache or of a streamed voice; the budget is.
- **Playwright's WebKit on Linux cannot open OPFS:** `navigator.storage.getDirectory()` throws `UnknownError: The operation failed for an unknown transient reason`, though `estimate()` answers (1.0 GB). Safari proper has OPFS and sync access handles in dedicated workers but no `createWritable`, so a cache must write from a worker and must treat every OPFS error as a miss. Safari's real throughput and quota are measured on a device, not here.
- **Safari on a MacBook Pro (Kevin, 2026-10-24):** the cache worked (the menu item present, no warning, a reopened song fetched no `.flac`/`.wav`), and `navigator.storage.estimate()` answered a quota of 82.5 GB with five recordings (277 MB) kept, so the cache runs on its own 2 GB ceiling there. **On Kevin's iPhone the cache works in a regular tab and is refused in Private Browsing:** in a private tab the first OPFS call, `navigator.storage.getDirectory()` itself on the main thread as much as in the worker, fails with the same `UnknownError: The operation failed for an unknown transient reason` as Playwright's WebKit, the facade warns once and the song plays from the network as designed, `estimate()` answering zeros. In a regular tab the menu item appears with the five recordings (264 MB) kept and no warning, and `estimate()` answers a quota of 41.2 GB, half the Mac's; both are far past the cache's 2 GB ceiling, so storage is not the constraint on either device. The lesson: that wording is WebKit's ephemeral session refusing storage, not a device limit; a cache must treat it as a miss (it does), and a streamed voice over the disk copies still needs a Blob-range path for private tabs. Safari's tracking prevention also deletes a site's script-written storage, OPFS included, after seven days of Safari use without a visit (Home Screen web apps exempt), harmless for a cache.
- **Playwright's Linux WebKit cannot play audio either:** its `AudioContext` reports `running` but `currentTime` advanced 0.075 s in 2.5 s of the Dawn demo playing (no output device), so a playback spec cannot run there; an `OfflineAudioContext` renders fine (used to prove that `copyToChannel` from a Float32 view with a 20-byte offset, as the cache's files are read, and a `start(at, offset, duration)` into a context at another rate both render in WebKit). Chromium plays a song from the cache after a reload: position advancing, a two-second offline render with signal, no Blob fetch.

## Reaper's take volume envelope runs in take time, from a rendered probe (2026-10-24)

From `bun run interop:rpp` (scripts/interop/rpp.ts and rpp.lua): Reaper 7.82 opening an item at play rate 0.8 whose take carries a `<VOLENV` (after the take's `<SOURCE`, before the next `TAKE`), read through `GetTakeEnvelopeByName(take, "Volume")` and rendered with the envelope on and switched off (`ACT 0` through `SetEnvelopeStateChunk`), the ratio of the two renders being the envelope as Reaper plays it; for Dawn's clip gain envelopes (utils/rpp.ts, utils/rppRead.ts).

- **A point's position is take time from the item's start, not item seconds**: it plays at position ÷ play rate. A step written at 1.2 played at 1.505 s into the item (1.5 = 1.2 ÷ 0.8 wanted), so a content second `t` of a clip at offset `o` goes out as `(t − o) × rate`, as a stretch marker's position does. The start offset does not shift it: 0 is the item's start whatever `SOFFS` is.
- **The value is plain amplitude** (1 is 0 dB): a point of 0.25 rendered at 0.250 of the unenveloped level. `GetEnvelopePoint` returns the positions and values as written, shape 0 linear.
- **The master's envelope silences a solo render too**: to render past the master's own volume envelope, switch it off through its chunk and restore the chunk after.

## Reaper's play rate, start offset and stretch markers, from a probe (2026-10-23)

From `bun run interop:rpp` opening Dawn's project in Reaper 7.82 and reading the items back through the API (`GetMediaItemTakeInfo_Value`, `GetTakeStretchMarker`), for Dawn's clip warps (utils/rpp.ts, utils/rppRead.ts).

- **`PLAYRATE <rate> <preserve pitch> …` on a take is the rate the source plays at**: 0.8 plays a file over 1.25 times its length; the second field 1 keeps the pitch (`B_PPITCH`). The item's `LENGTH` stays in project seconds.
- **`SOFFS` (`D_STARTOFFS`) is in the source's own seconds, whatever the play rate**: a clip starting 1.25 s into content at rate 0.8 starts 1.0 s into the file.
- **`SM <position> <source position>` lines on a take are stretch markers**, read back as written by `GetTakeStretchMarker`: the position in take time (seconds from the item's start at play rate 1; the API documents take time as the item position times the play rate), the source position in the file's seconds. Dawn writes an uneven warp as markers over a plain item at rate 1, and reads markers with their positions divided by the rate.

## Reaper's tempo ramps are linear in seconds, and a time signature on a point starts a measure (2026-10-23)

From a probe project opened in Reaper 7.82 under Xvfb and asked through its API (`TimeMap2_GetDividedBpmAtTime`, `TimeMap2_timeToQN`, `GetTempoTimeSigMarker`), for Dawn's tempo ramps (utils/rpp.ts, utils/rppRead.ts, audio/measures.ts).

- **A `TEMPOENVEX` point with shape 0 ramps the tempo linearly with the seconds to the next point**: 120 at 0 s ramping to 60 at 8 s gave 90 bpm at 4 s and twelve quarter notes at 8 s (the mean tempo times the span), where a ramp linear over the beats (a DAWproject's or Live's lane) would give 84.85 and 11.54. Dawn keeps a Reaper ramp on a "time" curve and a DAWproject's or Live's on a "beats" curve, and a writer lays a ramp of the other curve down bar by bar.
- **A point carrying a time signature starts a new measure, and Reaper pads the partial bar before it**: with 3/4 from 8 s and a point at 20 s (16 beats later, a third of a bar into bar 10) stamped 3/4, Reaper counted 34 quarter notes at 20 s instead of 32 and put the marker at measure 10; the same point with no time signature (`PT 20 60 1 0 0 0`, the marker reading -1/-1) counted 32. Dawn's writer now stamps the signature only on the first point and where the meter changes, as Reaper's own `(denominator << 16) | numerator` with the "0 1" flag after it.
- **`TimeMap2_timeToBeats` returns beats within the measure, the measure, its length, then the full beat count, then the denominator**; `TimeMap2_timeToQN` is the plain quarter-note count and the one to compare across meters.

## Reaper's mute, send and master envelopes, from a rendered probe (2026-10-22)

From a probe project rendered by Reaper 7.82 under Xvfb (a sine item with a `<MUTEENV`, a receive with an `<AUXVOLENV`, a `<MASTERVOLENV`), for the wider automation (utils/rpp.ts, utils/rppRead.ts).

- **A mute envelope's 0 is muted, 1 is on.** The render was silent where the envelope sat at 0 and sounded where it sat at 1, so Dawn's mute lane (1 muted) goes out inverted, with shape 1 (square) on every point and `DEFSHAPE 1`, and comes back the same way.
- **A send's envelopes live on the receiving track, right after the `AUXRECV` line they belong to**: Reaper read an `<AUXVOLENV` placed there (the send was silent until its point), and when asked through the API (`GetTrackSendInfo_Value(track, -1, i, "P_ENV:<PANENV")`) it saved the new `<AUXPANENV` in the same place. The reader walks a track's body in order and gives each `AUXRECV` the `AUXVOLENV` block that follows it.
- **The master's envelopes are project-level blocks after `MASTER_VOLUME`** (`<MASTERVOLENV`, kin to `<MASTERPLAYSPEEDENV` in the corpus): the render came out at a quarter where its point said 0.25, and the interop's mix render went silent where the envelope reached 0. `GetTrackEnvelopeByName(master, "Volume")` found nothing, so the interop probe reads the master's envelopes by chunk name (`GetTrackEnvelope` + `GetEnvelopeStateChunk`). **The master has no mute envelope**: a `<MASTERMUTEENV` block written by hand was dropped when Reaper saved the project (its master carries volume, pan, width and play rate envelopes only), so Dawn's master mute lane is not written to a Reaper project.
- **Reaper renders from a script with `GetSetProjectInfo(0, "RENDER_*")` and `Main_OnCommand(42230, 0)`**: `RENDER_BOUNDSFLAG` 1 (the whole project), `RENDER_FILE` a folder, `RENDER_PATTERN` the name, `RENDER_FORMAT` a base64 config (`ZXZhdyAQAAAA`: WAV, 32-bit float); the render answered its "Error opening devices" and query dialogs through xdotool as the interop runner does.

## Bitwig's DAWproject expression lanes sit where the schema allows one child (2026-10-22)

From writing the clip expression lanes (utils/dawproject.ts, docs/dawproject-plan.md item 3).

- **Bitwig writes a notes clip's controller lanes as `<Points>` beside the `<Notes>` inside the `<Clip>`**, each with a `<Target expression="channelController" channel="0" controller="7"/>` and `RealPoint`s in the clip's content time. The schema's `clip` type holds a single `xs:choice` child (`minOccurs="0"`, no `maxOccurs`), so Bitwig's own export does not validate against Bitwig's own `Project.xsd`; a `<Lanes>` wrapper would, but nothing in the wild writes that. Dawn writes the lanes the way Bitwig does and skips the schema check in that one test (`dawproject.test.ts`), keeping it on the rest of the writer.
- **An audio clip's gain line goes the same way** (2026-10-24, utils/dawproject.ts): `<Points unit="linear">` on `<Target expression="gain"/>` beside the `<Audio>`/`<Warps>`, in the clip's content seconds; `xmllint` rejects it ("Element 'Points': This element is not expected") and accepts the same points wrapped in `<Lanes>`, which the reader also takes. The schema and the round trip are the only proof: no DAW here imports DAWproject.
- **The plan had it wrong that the piano took pitch bend and modulation from a clip.** `PianoEngine.#onMidi` moved the wah with CC 1/11/4 and the pedal with CC 64, but nothing bent a voice: `SynthVoice` and `SampledVoice` had no way to change pitch after the start. The bend went in as `bend?(semitones, at)` on both (detune on the oscillators, `playbackRate` on the sample sources, `setTargetAtTime` for a 5 ms glide), and a voice started while a bend is in force starts bent.
- **Reaper's `E` lines carry any channel message**, so controllers (`b0 cc vv`), the bend (`e0 lsb msb`) and channel pressure (`d0 vv`) go in beside the notes with no other change; the sort order within a tick is Dawn's own (offs, then controls, then ons, then the all-notes-off), so a pedal change at a note's start precedes the note.

## Ableton Live's set format, from public sets and DawVert (2026-10-22)

From reading nine public `.als` files (Live 9.7 to 12.2.1) and DawVert's `plugins/input/r_ableton.py` and `objects/file_proj/_ableton/*` for `utils/alsRead.ts`; nothing checked in Live itself (there is no Linux Live):

- **A set is gzipped XML** (`1f 8b`), every value a `<Tag Value="…"/>` child; a few repos keep sets uncompressed, and Live reads those too. Live 12 renamed `MasterTrack` to `MainTrack` and Live 10 `ColorIndex` to `Color`; the rest of what the reader needs is stable from Live 9 to 12.
- **Times are beats.** A clip's `CurrentStart`/`CurrentEnd` are song beats (the `Time` attribute repeats the start); `Loop/LoopStart`, `LoopEnd` and `StartRelative` are the clip's content beats for a warped audio clip or a MIDI clip, and **seconds into the file for an unwarped audio clip** (DawVert multiplies them out through the tempo; the sets confirm it: an unwarped clip of 64 beats had `LoopEnd` 31.3 with a 31.3-second file). `HiddenLoopStart`/`HiddenLoopEnd` are the loop brace as last shown, not what plays. A locator's `Time` is beats. Automation events' `Time` is beats, and the event at `-63072000` (two years before the song) is the parameter's value before any point.
- **The time signature is an enum**: numerator = value mod 99 + 1, denominator = 2 to the power of (value div 99), so 201 is 4/4, 200 is 3/4, 302 is 7/8. It sits in the master's `TimeSignature` and its changes in the master's `AutomationEnvelopes` as `EnumEvent`s whose `PointeeId` is the `TimeSignature/AutomationTarget` id (10 in every set seen; the tempo's is 8). Tempo automation is `FloatEvent`s on the `Tempo` target, and Live ramps between points.
- **Warp markers** are `SecTime` (seconds into the file) by `BeatTime` (content beats); Live writes a last marker a thirty-second note past the real last one so the slope carries on. A set's loops from a 120 bpm pack in a 124 bpm set show it: `LoopEnd` 16 beats, markers 0→0 and 8.000023 s→16 beats, so the file plays 3 % fast in Live.
- **Levels**: `Mixer/Volume/Manual` is linear gain with 1 at 0 dB and 1.99526 (+6 dB) the top; a send at 0.000316 (−70 dB) is off; `Speaker/Manual` false is the mute (there is no mute tag). `Pan/Manual` is −1 to 1. `SampleVolume` on a clip is its gain, `Fades/FadeInLength` and `FadeOutLength` beats; `PitchCoarse` semitones and `PitchFine` cents transpose a clip.
- **Routing**: `TrackGroupId` names the `GroupTrack` a track sits in (−1 for none); `AudioOutputRouting/UpperDisplayString` says "Group", "Master" or "Main". `Mixer/Sends/TrackSendHolder` are in the order of the `ReturnTrack`s. A `MidiNoteEvent` has `Time` and `Duration` in content beats, `Velocity` 0 to 127 as a float, `IsEnabled`; the notes sit under `Notes/KeyTracks/KeyTrack`, each with its `MidiKey`. The arrangement's clips are `MainSequencer/Sample/ArrangerAutomation/Events/AudioClip` on an audio track and `MainSequencer/ClipTimeable/ArrangerAutomation/Events/MidiClip` on a MIDI track; the session view's are under `ClipSlotList`.
- **Colors** are an index into Live's palette of 70 (constants/liveColors.ts, DawVert's `ableton.dset`), five rows of fourteen from bright to dark, with white, grays and black among them.
- **Sample paths**: `SampleRef/FileRef/RelativePath` is relative to the project folder (and starts with `../` when the file lives outside it, as a `Downloads/` file does) with `Path` the absolute one; Live 9 writes the relative path as `RelativePathElement` parts plus `Name`. The set carries no audio.

## Reaper's project format, as Reaper 7.82 reads it (2026-10-22)

From writing `.rpp` files and having Reaper open them under Xvfb (`bun run interop:rpp`, scripts/interop/rpp.ts and rpp.lua), with its API as the witness:

- **The time signature on a tempo point counts only with the flag after it.** A `<TEMPOENVEX` point is `PT <seconds> <bpm> <shape> <sig> <sel> <flag>`, `sig` being `(denominator << 16) | numerator`; written as `PT 8 100 1 262147` alone, Reaper kept the line as it was but reported the point's time signature as −1/−1, and wrote 4/4 bars on. With ` 0 1` after the sig (as Reaper's own files carry) it took 3/4. `utils/rpp.ts` writes the flag; `utils/rppRead.ts` honors the sig only with it, as Reaper does.
- **The pan envelope is stored the other way up from the pan knob.** A `<PANENV2` point of −0.6 pans the track to the right (+0.6 in `D_PAN` terms): the harness renders the track with the envelope driving it in read mode and the right channel comes out louder. `GetTrackUIVolPan` does not tell: it returns the knob even in read mode. The writer negates the lane's values, the reader negates them back; the volume envelope (`<VOLENV2`) is plain linear gain.
- **A MIDI take's ticks go through the project's tempo map** (`HASDATA 1 <ppq> QN`; each `E`/`e` line and each `<X` block advances the clock) unless `IGNTEMPO 1 <bpm>` holds it to its own tempo; the item's `POSITION` is seconds. Notes written as ticks from the item's start through Dawn's grid land where Dawn had them across a tempo change.
- **An item's `VOLPAN` first field is the item's volume** (`D_VOL`), not the take's; the take's own volume is a separate value Reaper reports as 1 when the file carries only the item's.
- **Folders:** `ISBUS 1 1` on the folder track, `ISBUS 2 -1` on its last child (−n closes n levels); `MAINSEND 1 0` on every track still; a receive is `AUXRECV <source track index> <mode> <volume> …` on the receiving track, mode 0 post-fader and 3 pre-fader (post-FX), which Reaper reports as `I_SENDMODE` 0 and 3.
- **Colors** are `PEAKCOL 0x1000000 | (b << 16) | (g << 8) | r` on Linux (and Windows); Reaper's `ColorFromNative` gave the RGB back as written. (macOS keeps RGB the other way round; a file moved between platforms shows its colors swapped, a known Reaper quirk not handled here.)
- **GUIDs are optional:** a `<TRACK` or `<ITEM` without `TRACKID`, `IGUID` or `GUID` lines opens fine; Reaper assigns them and writes them on save.
- **`Main_openProject("noprompt:" .. path)`** opens without the save-changes prompt; **`Main_OnCommand(42230, 0)`** renders with the current settings and closes the dialog, the settings set through `GetSetProjectInfo` (`RENDER_BOUNDSFLAG` 0 with `RENDER_STARTPOS`/`RENDER_ENDPOS`, `RENDER_FILE` and `RENDER_PATTERN` through the `_String` form, `RENDER_FORMAT` `ZXZhdxgAAQ==` for 24-bit WAV); **`GetSetProjectNotes(0, false, "")`** returns the notes as its one value; **`GetTrackUIVolPan`** returns (ok, volume, pan).

## Effect 4 on the client costs the page that imports it about 11.6 kB gzip, inlined (2026-10-30)

Measured on the song page's chord-draft class pilot (docs/effect-adoption.md
"Decision record"): deep imports of `effect/Effect` and `effect/Fiber`
for `runFork`, `Fiber.interrupt`, `Fiber.await`, `tryPromise`, `ensuring`,
`catch` and `orElseSucceed` grew the page's own node from 57.0 to 68.6 kB
gzip; no shared chunk appeared and no other page changed. So Effect's
client cost lands on the page that imports it, once, and further uses on
the same page are nearly free. Things the pilot confirmed on the way:
`Effect.runFork` starts the fiber synchronously (a `$state` write in the
program's first step is visible right after the call); a plain
`tryPromise(thunk)` wraps failures in `Cause.UnknownError`, so keep the
original error with `{ try, catch: (e) => e }`; the thunk gets the
AbortSignal only when it declares the parameter; `ensuring` cleanup runs
on interrupt too, so an interrupted run's cleanup must be idempotent with
what Cancel writes; `Effect.catch` sees typed failures only, so a throw
inside `Effect.sync` rejects the run instead. The rewritten class was
kept out of the tree that day and adopted on 2026-10-31 together with the
song check's retry and the alignment's timeout: the three cost 14.3 kB
gzip on the same node (60.2 → 74.5), so the runtime is about 11.6 kB and
each further pipeline about 1.3 kB. Learned in those two conversions:
**Effect's default clock runs on `setTimeout`**, so Vitest's fake timers
drive `Effect.timeout`, `Schedule.spaced` and `Effect.retry`
(`vi.advanceTimersByTimeAsync(10_000)` per wait, no test clock, no extra
flush); `Effect.retry({ schedule, times, while })` applies `times` as
`attempt <= times`, so `times: N - 1` gives N attempts in all, and `while`
may return a boolean or an Effect of one; `Schedule.spaced`,
`Effect.timeout` and the rest take `Duration.Input` (a number of
milliseconds, `"10 seconds"`, `Duration.seconds(10)`); a plain-object
failure (`{ status: 409 }`) reaches `runPromise`'s rejection as the same
object; `Effect.catchIf` has an optional third `orElse` for the errors the
predicate does not match; `Effect.callback`'s register function is typed
with `this: Scheduler` beside `(resume, signal)`; a synchronous throw
inside `Effect.map` is a defect that `orElseSucceed` does not catch, so a
fallible pure step that used to sit inside a try/catch stays inside the
`tryPromise` thunk.

## A remote form's dirty fields survive `clearForm`, and a dirty field with no stored value renders empty (2026-10-30)

SvelteKit 3's `form()` keeps, beside the stored values, a set of DIRTY
field names (every field the person typed in, `handle_input`), and the
field spread's `value` getter is `read(fallback)`: the stored value, else
the default passed to `.as(type, default)`, EXCEPT when the field is dirty,
when it is `undefined` → `""` (`src/runtime/form-utils.js`, `read`). The
intent is that a field someone emptied stays empty instead of springing
back to its default. Our `clearForm` set the store to `{}` but could not
touch the dirty set, which only a native `reset` event on the form element
clears (`handle_reset`) or a new element attaching. So in every edit
popover: type in a field, save (the popover closes), reopen: the field is
blank while its neighbors show the saved values, and a second save writes
the blank. Found by the headless pass over the song page's Details tab
(Description emptied by the second save); the markup had been the same
since before the day's refactor, so this was live in production. Fix:
`clearForm(form, element?)` also calls `HTMLFormElement.prototype.reset`
on the element (the prototype, as SvelteKit does, against DOM clobbering);
`SongDetails` binds its form element for it, and the project, blog post
and docs settings popovers pass theirs from `onbeforetoggle`. The remote
form itself resets the element after a successful submit, which is why
the first save looked right and only the reopen showed it. The inline
short-link editor (`ShortLinkRow`) unmounts its form when closed, so it
cannot reset it before it renders; a field typed in, canceled and reopened
there shows blank until saved (minor, left).

## `event.url` inside a remote `query` throws (2026-10-30)

`getRequestEvent().url` inside a `query()` fails with SvelteKit's
`remote_request_property` ("Cannot access event.url in a query"): queries
can be batched and have no URL of their own. `songViewerOf` read it for
the `?share=` code, so the Docs panel's History ("Could not load the
history: Internal Error") and every other query gated by it failed for
everyone, since 2026-10-28. Commands and forms may read it. Fix: a
`requestUrlOrNull` helper (try/catch around `event.url`) and
`shareCodesFrom(url | null, cookies)`: inside a query the cookie set on
the visit with the share link stands in for the URL. Found by the same
headless pass; the dev server's log named the line.
