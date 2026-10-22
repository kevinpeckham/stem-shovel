# User docs: seeded from files, edited in the app, merged by the script

The public documentation (`/docs/<slug>`), the blog, and the tool pages'
own words (docs/page-copy.md) are `user_doc` rows (docs/data-model.md),
written in the app by system admins with the shared markdown editor and
versioned in `user_doc_version` (the app keeps the newest ten versions;
the script's writes keep all). The files in `scripts/user-docs/` are the
**starting** content: the seed writes a page once, and after that the
app's copy is the truth.

## The commands

- `bun run db:seed-docs` adds every page in `scripts/seed-user-docs.ts`
  (`ORDER` for the docs, `COPY_PAGES` for the pages' copy) that the
  database lacks; an existing page is never touched.
- `bun run db:update-docs <slug...>` writes a file over its page when the
  page has not been edited in the app; an edited page is skipped.
- `bun run db:update-docs --list <slug>` and `--restore <slug> <n>` show
  and bring back versions.
- `bun run db:update-docs --merge [--apply] [<slug...>]` is the step after
  a release, below.

## Merging the seed into an edited page (built 2026-10-12)

Kevin edits the docs on production in the app, and every feature that
touched a seed file used to become a note for him to apply by hand in
three editors ("I'm having trouble updating the user docs with the cues
you are giving"). The script now carries a seed's changes onto an edited
page itself, with a three-way merge (`src/lib/utils/mergeThreeWay.ts`,
diff3 by lines: base lines that survive on both sides are the anchors;
a region changed on one side alone takes that side, the same change on
both takes it once, different changes on both are a conflict).

- **The base** is the seed text the page was last written from: the
  newest git revision of `scripts/user-docs/<slug>.md` whose text is a
  saved version of the page (git keeps every seed text; the page keeps
  its versions). So the script needs the repo's history, which a
  checkout on Kevin's machine has.
- **Edited in the app** means the page's text differs from that base, not
  that a version carries an author: a page the script merged is still an
  edited page the next time.
- **Dry run first**: `--merge` alone prints, per page whose file differs
  from it, whether the seed simply replaces it (never edited), merges
  cleanly (with the lines the seed brings), or conflicts (both texts of
  each conflicting region, for the app's editor, under `--strict`; the
  page's own text otherwise, see below); nothing is written.
  `--apply` writes the merges, as two versions each: the seed text
  (the next merge's base, since it matches a git revision) and then the
  merged page. Under `--strict` a conflicted page is left alone.
- **The page always wins** (2026-10-22). Kevin kept meeting conflicts on
  blocks he had just written, twice on text the seed and the page agreed
  on but for a trailing blank line or a non-breaking space the app's
  editor had saved ("I need to be able to easily make edits"). So the
  merge now compares lines with trailing whitespace and non-breaking
  spaces ignored, and a region both sides changed differently keeps the
  page's text, with a note of what the seed wanted there; the seed's other
  changes still land, and nothing blocks. That note is for whoever changed
  the seed (make the seed say what the page says, or carry the change
  another way), not a task for the editor. `--strict` brings back the
  conflict (markers printed, the page left alone) for the rare case where
  the seed's side must win and someone wants to see both first; `--force`
  writes the seed whole. Every version stays in `user_doc_version` either
  way (`--list`, `--restore`).
- A page whose base cannot be found (its seed version pruned by ten app
  saves since, and the seed changed in between) is reported as such:
  `--force` overwrites, or the change is merged by hand. The releases
  page is never merged (`IN_APP_ONLY`): its seed is the starting text and
  the page is written in the app alone (releases-page rules).
- The first production run (2026-10-12) merged thirteen pages and left
  two conflicts, both where Kevin had shortened a passage the seed later
  extended; a conflict is the run's answer, not a failure, so the script
  exits 0.

The release step on production, after the migration and the seed:

    bun run db:update-docs --merge          # read it
    bun run db:update-docs --merge --apply  # write the clean merges

Verified on dev (2026-10-12) against the looper page's copy, which had
an intro rewritten in the app: a tip added to the seed merged around the
rewritten intro; a seed change to the intro itself reported the conflict
with both texts; the plain update mode skipped the merged page afterwards.
