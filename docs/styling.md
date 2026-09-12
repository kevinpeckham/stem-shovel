# Styling

The look is lightningjar.com's. `uno.config.ts` mirrors
lightning-jar/lj-website's config: wind4 with its reset, Atkinson Hyperlegible
and Bungee Shade from bunny, the same palette and shortcuts (`button`,
`button-accent`, `page-x-padding`, `main-y-padding`, `max-w-article`,
`display`, `heading-2`), Phosphor icons via `presetIcons` (`i-ph-…`,
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
  strings, which are `.join(" ")`ed.
- **Page structure follows lj-website**: a `page` wrapper, a `display` title,
  `heading-2` sections, `max-w-article` for prose.
- **Semantic tokens** (`bg-panel`, `bg-row`, `text-dim`, `border-line`,
  `bg-playhead`, `bg-solo`, `text-wave`, `text-waveDim`) are defined with the
  palette in `uno.config.ts`. The waveform canvas reads its colour from its
  own computed `color` (set by `text-wave` / `text-waveDim`), so no module
  exports the palette.
- **Classes used in `src/app.html` are safelisted**; that file is outside the
  Svelte pipeline.
- Icons are empty `<span>`s; `presetIcons` is configured with
  `extraProperties: { display: "inline-block" }` so they do not collapse.
