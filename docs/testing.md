# Testing

Besides the tests below, CI (`.github/workflows/ci.yml`) runs lint, check,
the tests and the spell check; `.github/workflows/fallow.yml` runs
`fallow audit` over the changed files (dead code, complexity, duplication
and the house rules in `fallow-rules.json`) and uploads the findings to
GitHub's code-scanning tab. Both run without secrets.

## Smoke test of every URL

`bun run smoke:urls` (`scripts/smoke-urls.mjs`, through varlock for the
database) requests every route twice, signed out and as the Screenshot Bot
(`x-preview-token`), and checks the status each pass expects: public pages
200, member pages a 303 to sign-in when signed out, admin pages 404 when
signed out, POST-only API routes 405, token routes their "not valid" page
for a made-up token, plus robots, sitemap, the icon and a 404 for an
unknown path; any HTML body containing a security checkpoint or an error
page fails too. Dynamic segments come from the database (the bot's first
account, its first public project and song with a mix, the first user doc).
Every `+page.svelte` and `+server.ts` under `src/routes` must have a row in
the script, or it exits 2 naming the missing ones, so new routes join the
test when they are written. `SMOKE_BASE=https://www.stemshovel.com` runs it
against production, where the signed-in pass is skipped unless the token is
recognised there (it is kept out of 1Password on purpose); the dev VM's
address bypasses the firewall's bot challenge (docs/security.md).

Vitest, bundled with Vite+ (`vp test`), in two projects configured in
`vite.config.ts` — replicator's split, with Vitest for both halves:

| Project      | Files                                    | Environment                       |
| ------------ | ---------------------------------------- | --------------------------------- |
| `unit`       | `src/**/*.test.ts`, `tests/**/*.test.ts` | Node                              |
| `components` | `src/**/*.svelte.test.ts`                | jsdom + `@testing-library/svelte` |

```sh
bun run test               # everything, once
bun run test:unit          # one project
bun run test:components
bun run test:watch
bunx vp test run src/lib/audio/measures.test.ts   # one file
```

- **Co-locate** a test with what it tests: `formatTime.test.ts` beside
  `formatTime.ts`, `Transport.svelte.test.ts` beside `Transport.svelte`.
  `tests/` holds shared helpers only (`tests/helpers/fakeEngine.ts`,
  `fakeAudioBuffer.ts`) and the component setup file.
- Import the runner from `vite-plus/test`, not `vitest` (a Vite+ lint rule).
- **Unit tests** cover the pure modules: utils, the bar math
  (`lib/audio/measures`), dual-mono and peaks, the valibot schemas, and the
  server modules' pure parts. Server modules pull in the database, Blob and
  ffmpeg, so their tests `vi.mock` those (`src/lib/server/mix.test.ts`,
  `previewAuth.test.ts`); inputs a mock factory needs go through
  `vi.hoisted`, since factories are hoisted above imports. CI runs the
  tests with `SKIP_VARLOCK=1` and no 1Password, where `$lib/server/db`
  throws the moment it loads, so a test of a pure function must not import
  it through a server module (`data.ts` reaches the database): put the
  function in `src/lib/utils/` and test it there, or mock the module.
  `SKIP_VARLOCK=1 bun run test` reproduces CI locally.
- **Component tests** render with `@testing-library/svelte`, query by role
  and name, and drive clicks with `@testing-library/user-event`. The engine
  is `fakeEngine()` — the reactive fields components read plus spies for
  what they call — so nothing needs an AudioContext. Assert on a local
  `vi.fn()` passed into the fake, not on `engine.seek`, to keep the
  `unbound-method` lint rule quiet. jest-dom matchers come from
  `tests/setup-components.ts`. Components that draw to a canvas
  (`Waveform`) are not unit-tested; jsdom has no canvas.
- **What tests do not cover**: playback itself, uploads and Blob, and the
  remote functions end to end. Those are exercised in a real browser with
  Playwright scripts driven as the Screenshot Bot (docs/agent-screenshots.md)
  and by Kevin.
- `bun run test` is the first gate in the `/release` and `/test` skills.

`tests/helpers/fakeRemoteForm.ts` stands in for a remote `form` in component
tests (spread attributes, `enhance()`, `fields.<name>.as()`, `for()`), and
`tests/setup-components.ts` stubs `ResizeObserver` for components that bind
their size. Component tests cover Notifications, ProjectPlayer,
SectionTimeline, Transport, PrivacyToggle, GlobalNav and CommentTimeline.
