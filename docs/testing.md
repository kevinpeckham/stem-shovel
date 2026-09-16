# Testing

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
  `vi.hoisted`, since factories are hoisted above imports.
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
