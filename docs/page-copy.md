# Page copy: a page's own words, edited in the app

Built 2026-10-02 at Kevin's request: "Make page title and text below page
title editable by content managers similar to the experience on the
Releases page. Also think about how to componentize this so we can roll
it out to other pages." The looper page is the first; the recipe is below.

## How it works

A page's words are a **user doc of kind "copy"** (`USER_DOC_KINDS` gains
"copy" beside "doc" and "post"): one markdown document whose first `# `
heading is the page's title, whose first paragraph is the intro under the
title (and the InfoTip on phones), and whose remainder (from the first
`##` on) is rendered under the page's device as the tips box the drum
machine page has. `splitPageCopy` (`src/lib/utils/splitPageCopy.ts`,
tested) does the splitting; `pageCopy(slug, fallback, locals)`
(`src/lib/server/pageCopy.ts`) reads the doc, renders the body with
`renderMarkdown`, and says whether the visitor may edit (a system admin,
as on the releases page) and where (`/docs/<slug>/edit`). Until the doc
exists the page uses `fallback`, the same markdown the seed script would
make the doc from, so a stage without the doc still has its words.

The doc lives in `scripts/user-docs/<slug>.md` like the user docs, with
the slug listed in `COPY_PAGES` in `scripts/seed-user-docs.ts` (seeded
with kind "copy"; `bun run db:update-docs <slug>` refreshes it from the
file as for any doc, unless it was edited in the app since the script
last wrote it: an edit on the live site is kept, and the file's new text
is merged by hand or forced with `--force`; `--list` and `--restore`
bring an earlier version back). `PAGE_COPY` (`src/lib/constants/pageCopy.ts`) maps
the slug to its page: the docs view route redirects a copy doc there (it
has no page of its own), the editor's "Exit edit mode" goes there, and
`listUserDocs` lists only kind "doc", so copy docs never appear in the
docs index.

Two components render it:

- `PageCopyHeader` — `copy` ({ title, intro, canEdit, editHref }) and an
  optional `controls` snippet for buttons at the right (the looper's panel
  buttons). The drum machine's and piano's header: `app-page-heading`, the
  InfoTip on phones, `app-page-subheading` from sm, and for an admin an
  Edit button to the doc.
- `PageCopySection` — `html` (the body), `docsHref`, `docsLabel` and
  `docsLead`: the tips box with headings, paragraphs and lists styled as
  the drum machine page's, and the "Learn more in the user docs" button
  after it. Renders nothing without a body.

## Rolling it out to another page

1. Write `scripts/user-docs/<page>-page.md`: `# Title`, the intro
   paragraph, then `## How to use …` and `### Quick Tips` as the drum
   machine page has them.
2. Add the slug to `COPY_PAGES` in `scripts/seed-user-docs.ts` and to
   `PAGE_COPY` with the page's path.
3. In the page's `+page.server.ts`: `import fallback from
   "../../../scripts/user-docs/<page>-page.md?raw"` and return
   `copy: await pageCopy("<page>-page", fallback, locals)`.
4. In the page: `<PageCopyHeader copy={data.copy}>` (with the page's own
   buttons in `controls`) in place of the header, `<PageCopySection
   html={data.copy.bodyHtml} docsHref="/docs/<doc>" docsLabel="…" />` in
   place of the hard-coded tips, and the title in `<svelte:head>` from
   `data.copy.title`.
5. `bun run db:seed-docs` on each stage (production: Kevin's machine).

Rolled out to the drum machine, piano, tuner, metronome and (2026-10-02)
Idea Recorder pages, so every tool and instrument page's words are editable.
The recorder's tips show from sm only: on a phone the page is an app-height
screen of its own, and the user docs are a button away.

## The home page

The home page (2026-10-10, Kevin: "can we make content on the home page
editable by admins?") has more words than a title, an intro and a tips
box: a headline, seven feature blocks interleaved with live demos, and
the FAQ. Its copy doc is `home-page` (`scripts/user-docs/home-page.md`,
edited at `/docs/home-page/edit`, reached from the page's Edit button
beside the sign-up buttons, which only a system admin sees, or from
/admin/home), and `splitHomeCopy` (`src/lib/utils/splitHomeCopy.ts`,
tested) reads it instead of `splitPageCopy`:

- the first `# ` heading is the headline (the page's `h1`);
- the paragraph after it is the description in the page's meta tags (it is
  not on the page);
- each `## Heading {#id}` is a section, keyed by the `{#id}` at the end of
  the heading (`player`, `recorder`, `docs`, `tools`, `drums`, `piano`,
  `chords`, `faq`; a heading without one is keyed by its own words,
  lower-cased and hyphenated); its `### ` headings are its items, with
  the paragraphs after each;
- a feature block renders the section's heading, its first item's
  heading as the topic line, and all the paragraphs; the FAQ renders each
  item as a question and its paragraphs. The "How do I get started?"
  question has two items, `{#start-open}` and `{#start-waitlist}`, and
  the page shows the one for the sign-up mode in force;
- HTML comments are notes to the editor and never render (the seed file
  opens with one explaining the shape).

`homeCopy(fallback, locals)` (`src/lib/server/homeCopy.ts`) merges the
doc over the seed file by section id, so a section the doc lacks (a
heading deleted by mistake) keeps the seed's words rather than leaving a
hole; the demos, the "Try the working demo below" lines, the standalone
links and the sign-up buttons are the page's own. Paragraphs render as
inline HTML (links, emphasis) through the same sanitizer as the other
copy docs.
