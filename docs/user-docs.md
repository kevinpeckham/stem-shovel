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
  each conflicting region, for the app's editor); nothing is written.
  `--apply` writes the clean ones, as two versions each: the seed text
  (the next merge's base, since it matches a git revision) and then the
  merged page. A conflicted page is left alone and the run exits 1.
- A page whose base cannot be found (its seed version pruned by ten app
  saves since, and the seed changed in between) is reported as such:
  `--force` overwrites, or the change is merged by hand.

The release step on production, after the migration and the seed:

    bun run db:update-docs --merge          # read it
    bun run db:update-docs --merge --apply  # write the clean merges

Verified on dev (2026-10-12) against the looper page's copy, which had
an intro rewritten in the app: a tip added to the seed merged around the
rewritten intro; a seed change to the intro itself reported the conflict
with both texts; the plain update mode skipped the merged page afterwards.
