# Handoff brief: barmark is published; adopt it, and draw charts the way barmark.dev does

**From:** the barmark session, 2026-11-01, at Kevin's request.
**For:** the stem-shovel agent.
**Status:** an update to `docs/barmark-adoption-plan.md` (stem-shovel,
2026-10-31). That plan still stands: adopt the parser, migrate the stored
charts (refuse, don't guess), adopt the renderer, and leave the hash for
Study 16. This brief corrects what has changed since. It also adds one
deliverable: charts in Stem Shovel should look the way they do on
barmark.dev. Read the plan first, then this, then barmark's own docs:
`packages/render/README.md` and the grammar,
`docs/grammar-v0.1-draft.md`, in kevinpeckham/barmark. Kevin decides
grammar questions; raise them as barmark issues.

## Where `dev` stands (checked 2026-11-01, at 431f3506)

Already done on `dev`: barmark 0.5.0 and @barmark/render 0.3.0, the
parser behind the chart, the renderer drawing it, sections known by
name, and the chart user docs. Still to do, each below:

1. Chart text edited as plain text only (remove Rich Text for charts).
2. Rename the chart panel's toggle to "Chords" / "Engraving".
3. Draw charts the way barmark.dev does (the look, and the Noto Serif
   italic trap).

## What changed since the adoption plan

| The plan says | Now |
|---|---|
| `barmark` ^0.2.0 | **`barmark` 0.5.0** is on npm (2026-11-01). Pin it exactly, as barmark.dev does. 0.4.0 added Logic Pro's parentheses, below; 0.5.0 adds gradual tempo changes, below. |
| `@barmark/render` 0.1.0, npm release imminent | **`@barmark/render` 0.3.0** is on npm, with provenance (2026-11-01). It depends on `barmark` ^0.5.0, so take the two together. |
| barmark#1: legacy input parses to 0 bars, 0 warnings | **Fixed in 0.3.0.** A chart with text but no bar line warns once, at its first text line. A line with editor-escaped pipes (`D \| A \| G`) warns, and its `suggestion` is the bar line (`\| D \| A \| G \|`). The migration should still refuse rather than guess, but it can now use these diagnostics to find the lines it can't convert. |
| Logic parentheticals: a grammar question for barmark | **Decided by Kevin (grammar §3, Appendix A.5; in 0.4.0).** Groups in a row are one list (`C7(b9)(#11)` = `C7(b9,#11)`), and `(5)` on a bare root is the power chord (`F#(5)(7)` = `F#5(7)`: F♯ C♯ E). Both print in canonical form. `Cm(5)` and `C7(5)` stay errors. |
| Tempo that isn't steady | **New in barmark 0.5.0 and render 0.3.0 (grammar §7.2, decided by Kevin).** `tempo:` also takes `rit.`, `accel.` (each optionally `to` a tempo, e.g. `tempo: rit. to 90`) and `a tempo`, from the next bar to the next `tempo:` or the end. Every played bar inside one has `tempoChange: { kind, from, to }`; `tempo` stays the steady tempo. Beat alignment should treat those bars as an unsteady beat rather than fit a fixed grid. The renderer labels the change and draws a dashed line over its bars. |
| Renderer: `<barmark-chart>` element | The element now has a **`text` property** (render 0.2.0) for live editing: `chart.text = editor.value`. While `text` is a string, it wins over `src` and a `<script type="text/barmark">` child. Changes made together render once. Any string is safe: it's escaped, and problems become diagnostics. |

## Scope 3, in practice: the renderer

barmark.dev uses exactly this pattern, and it is tested there. Read
`site/src/lib/components/ChartRender.svelte` and `site/src/lib/chart.ts`
in the barmark repo.

- **Server-render first.** Use `renderChart(text, { theme: "dark",
  rehearsalLetters: true })` in the prerendered or SSR markup. It's a
  `<barmark-chart>` with a declarative shadow root, so the chart shows
  without JavaScript. Since 0.2.1 the wrapper carries its options as
  attributes (`theme="dark" rehearsal-letters`), so the element keeps
  them when it loads. Use 0.3.0 (anything from 0.2.1 keeps the options); 0.2.0 and 0.1.0 dropped to the
  system theme.
- **Then the element.** `import("@barmark/render/element")` on mount, and
  set `.text` on every edit. After client-side navigation, Svelte inserts
  `{@html}` without the HTML parser, so the declarative shadow root never
  attaches. On mount, if the element has no `shadowRoot`, set its `text`.
- **Register Edwin once.** The element registers the font itself from its
  package's `fonts/` folder, unless the page already has a
  `<style data-barmark-font>`. barmark.dev serves Edwin from
  `static/fonts`, copied there from the installed package by
  `site/scripts/fonts.ts`. It puts one `<style data-barmark-font>{fontFaceCss("/fonts/Edwin-Roman.otf")}</style>`
  in the layout's head, so there's one `@font-face` and one request.
  Edwin's licence (`fonts/OFL.txt`) ships beside it.
- **Long input.** barmark.dev redraws on every keystroke under 10,000
  characters, waits 250 ms above that, and stops previewing past 50,000
  characters, with a message.

## New: chart text is edited as plain text only (Kevin, 2026-11-01)

The Chart document has a "Rich Text" editing mode, and it has to go.
barmark is plain text, so a chart is edited only in the Markdown (source)
pane.

- **Where it is.** `DOC_VIEWS` in `src/lib/state/songDocs.svelte.ts`
  offers "Rich Text" (`rendered`, woof-editor's WYSIWYG) and "Markdown".
  `view` defaults to `rendered`. `MarkdownDocEditor.svelte` shows the
  panes for every document kind, both in the song page's Docs panel
  (`SongDocPanel.svelte`) and on the standalone page
  (`[song]/[doc=songDoc]/+page.svelte`).
- **What changes.** For `kind === "chart"`, there's no Rich Text pane or
  choice: editing opens the source, in monospace as it already is. Lyrics
  and notes keep both panes.
- **The hint goes too.** `DOC_HINTS.chart` still says "Select text for
  formatting; the ⋮ next to a block changes its type. Use a code block
  for chord grids so spacing is kept." That's rich-text advice and wrong
  for barmark: say that charts are barmark, and link barmark.dev's guide.
- **Why.** The WYSIWYG round-trips the chart through a markdown
  serializer. That's the root cause the adoption plan names (Scope 2): it
  wrote `\|` and `\*\*` into stored charts, which barmark now reports as
  escaped pipes and no bar lines. A chart's "rendered" view is the barmark
  renderer beside the source (Scope 3), not an editable rich-text view.
- **How to check.** Test that the Chart tab offers no Rich Text choice in
  either place, and that a chart opened, edited and saved comes back
  byte-for-byte with no backslashes added, including one with `|`,
  `**`, `_`, `#` and `->`. Already-stored escaped charts are the
  migration's job (Scope 2), not this change's.

## New: rename the chart panel's toggle (Kevin, 2026-11-01)

The chart editing panel has a toggle labelled "Text" / "Notation". Both
are notation, so rename it **"Chords" / "Engraving"**: "Chords" for the
barmark chord chart, "Engraving" for the engraved score (MusicXML and its
PDF, `SongNotationPanel.svelte`). Change only the labels, and any
accessible names, tooltips, docs and tests that use them, not what each
side shows. The mode is `ChartMode = "text" | "notation"` in
`src/lib/state/songDocs.svelte.ts`, remembered under
`stemshovel.song.chart-mode`; keep the stored values as they are so
people's saved choice survives, or migrate them if you rename.

## New: draw charts the way barmark.dev does

Kevin chose these settings on 2026-11-01 in a live preview, for a dark
page (barmark.dev's ground is `oklch(0.115 0.048 259.91)`). The renderer
already defaults to everything that isn't a colour or a font:
- bar numbers flush left in a gutter, on the chord baseline;
- headings, lyrics, note lines and mid-chart changes start at the first bar line;
- chords left-aligned in even slots;
- labelled mid-chart changes ("→ Time 3/4 · Tempo ♩ = 120");
- italic note lines.

The page sets only these custom properties, on the element or an
ancestor:

| Property | Value | For |
|---|---|---|
| `--barmark-size` | `15.5px` | chord size; everything else scales from it |
| `--barmark-ink` | `#fff` | chords, title, lyrics |
| `--barmark-muted` | `oklch(98.51% 0 0 / 0.8)` | meta line, bar numbers, marks |
| `--barmark-rule` | `oklch(98.51% 0 0 / 0.8)` | bar lines |
| `--barmark-directive` | `oklch(98.51% 0 0 / 0.8)` | mid-chart changes |
| `--barmark-note` | `#ece8e0` | `###` note lines |
| `--barmark-accent` | `#e8a56a` | error underlines |
| `--barmark-paper` | `oklch(96.89% 0.01 251.56 / 0.12)` | the chart's ground |
| `--barmark-text-font` | `"Noto Serif", Georgia, serif` | lyrics and note lines |
| `--barmark-label-font` | `"Noto Sans", system-ui, sans-serif` | meta line, changes, headings, diagnostics |

Plus `rehearsalLetters: true`, as the `rehearsal-letters` attribute: sections are lettered A, B, C in play order.

On barmark.dev these are one UnoCSS shortcut, `barmark-look`, in
`site/uno.config.ts`, applied to the chart's container. The site's
UnoCSS setup mirrors Stem Shovel's, so the shortcut should carry over
as it is. Every colour above meets the AA contrast level on that ground. If a Stem
Shovel surface has a different ground, recheck contrast; the renderer's
own contrast test is in `packages/render/tests/contrast.test.ts`.

**The font trap (barmark FINDINGS, 2026-11-01).** Stem Shovel's
`uno.config.ts` loads `serif: "Noto Serif:400"`, which has no italic, and
note lines are italic. Adding `italic: true` to that one entry loads only
the italic, and then every lyric is italic too. Use two entries:
```ts
serif: [
	{ name: "Noto Serif", weights: ["400"] },
	{ name: "Noto Serif", weights: ["400"], italic: true },
],
```
Stem Shovel's `"none"` provider under Vitest/SKIP_VARLOCK is unaffected.

**How to check it.** barmark.dev's browser test `the chart wears the
site's look` (`site/browser/site.pw.ts`) measures:
- a chord at 15.5px;
- the ink, muted, directive and note colours;
- Noto Serif on lyrics, and an italic Noto Serif note line;
- Noto Sans on the meta line, directives and headings;
- the letter "A";
- that both Noto Serif faces load.

A test like that on Stem Shovel's chart surfaces keeps the two in step.

## Asks back to Kevin

- Whether any Stem Shovel surface uses a light ground. The settings
  above are for dark; the renderer's light palette is the default for
  light, but Kevin chose only the dark look.
- The confirmation pass on each migrated chart, as before.
