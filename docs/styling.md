# Styling

The look is lightningjar.com's. `uno.config.ts` mirrors
lightning-jar/lj-website's config: wind4 with its reset, Atkinson Hyperlegible
and Bungee Shade from bunny, the same palette and shortcuts (`button`,
`button-accent`, `page-x-padding`, `main-y-padding`, `max-w-article`,
`app-page-heading`, `heading-2`), Phosphor icons via `presetIcons` (`i-ph-…`,
`@iconify-json/ph`), and `@unocss/extractor-svelte`.

Rules:

- **Every style is a UnoCSS utility or a shortcut.** No stylesheets of our
  own, no `<style>` blocks. Shortcuts stay inline in `uno.config.ts`; the
  config is not abstracted into modules.
- **App shortcuts**: `page` (`page-x-padding main-y-padding` grid), `surface`,
  `tile`, `field`, `link-dim`, `tab-active` / `tab-idle`, `chart-body` and
  `chart-editor`. `chart-body` is written like replicator's `article-body`:
  direct-child selectors (`[&>h2]:(…)`) plus sibling rules for rhythm
  (`[&>p_+p]:mt-3`). Comments inside a shortcut go between the array's
  strings, which are `.join(" ")`ed. The chord chart itself is not
  `chart-body` typography: `@barmark/render` draws it inside a shadow
  root with its own stylesheet (`server/chartHtml.ts`,
  `components/ChartHtml.svelte`), reading its palette from `--barmark-*`
  custom properties on the host: the `barmark-look` shortcut in
  `uno.config.ts` carries the look Kevin chose on barmark.dev (2026-11-01:
  15.5px chords, white ink, translucent paper, Noto Serif for lyrics and
  note lines, Noto Sans for labels), on `ChartHtml`'s wrapper and the
  editor's live `ChartPreview`; both take a `paper` prop that sets
  `--barmark-paper` inline on that wrapper, over the shortcut's paper
  (`SongDocPanel`'s `chartPaper`: the home page's demo draws its chart
  transparent on its own panel). Its font, Edwin, is registered once on the
  document by the `<style data-barmark-font>` in `src/app.html`
  (`static/fonts/barmark`, SIL Open Font License; a test keeps the rule
  and the file in step with the package), because a browser ignores an
  `@font-face` inside a shadow root and the `<barmark-chart>` element would
  otherwise register its own. Noto Serif is loaded in two entries, roman
  and italic: `###` note lines are italic, and one entry with
  `italic: true` would make every lyric italic (the brief's font trap).
- **Page structure follows lj-website**: a `page` wrapper, an `app-page-heading` title,
  `heading-2` sections, `max-w-article` for prose.
- **Semantic tokens** (`bg-panel`, `bg-row`, `text-dim`, `border-line`,
  `bg-playhead`, `bg-solo`, `text-wave`, `text-waveDim`) are defined with the
  palette in `uno.config.ts`. The waveform canvas reads its color from its
  own computed `color` (set by `text-wave` / `text-waveDim`), so no module
  exports the palette.
- **Classes used in `src/app.html` are safelisted**; that file is outside the
  Svelte pipeline.
- Icons are empty `<span>`s; `presetIcons` is configured with
  `extraProperties: { display: "inline-block" }` so they do not collapse.
