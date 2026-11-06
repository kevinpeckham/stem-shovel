# Agent screenshots

The agent can look at the app. Playwright and Chromium are installed on the
VM (`bunx playwright install --with-deps chromium`), and:

```sh
bun run shot /projects                      # full-page PNG → .screenshots/projects.png
bun run shot /test out.png 1280 700         # custom file, viewport
SHOT_VIEWPORT=1 bun run shot /test          # viewport only
SHOT_WAIT=2500 bun run shot /projects/x/y   # wait longer (decoding, fonts)
SHOT_CLICK='section[aria-label="Stems"] summary' bun run shot …   # click first
SHOT_BASE=https://www.stemshovel.com bun run shot /projects      # live site
SHOT_ANON=1 bun run shot /mmkk/projects                           # signed-out view
SHOT_CLICK='button[popovertarget="song-settings"]' bun run shot /mmkk/projects/x/y
```

Then `Read` the PNG — the model is multimodal. `.screenshots/` is gitignored.
The script also prints page and console errors.

The Playwright MCP server is registered in `.mcp.json` alongside Fallow's for
interactive driving (`browser_navigate`, `browser_evaluate`, …). For
assertions, prefer a short Playwright script over eyeballing: element counts,
attributes, computed styles.

## Signed-in captures: the preview token

Members-only pages and the editing controls only render for a member, so the
script can act as a dedicated **Screenshot Bot** user (replicator's
`PREVIEW_AUTH_TOKEN` pattern, `src/lib/server/previewAuth.ts`):

1. `PREVIEW_AUTH_TOKEN=<32+ random chars>` in `.env.local` (`bun run shot`
   runs through varlock, so the script and the dev server both see it).
   Restart the dev server after adding it.
2. `bun run db:preview-bot <account-slug>` creates the bot user on first use
   and makes it an `admin` of that account (`… <slug> member` for another
   role, `--remove <slug>` to revoke). The bot edits only accounts it is
   enrolled in; the token never widens that.
3. The script sets the `preview_token` cookie for the app's origin (a header
   would also be sent to Blob and trip CORS); the hook resolves it to the bot
   before the Better Auth session. `SHOT_ANON=1` captures the signed-out view.

Security: the bypass is fail-closed (unset, empty or short token disables
it), compares in constant time, never logs the token and never creates the
bot user from a request. It works wherever the token is set, and dev and
production share one database — so keep the token in `.env.local`, not in
1Password, unless you want live signed-in captures too.

## Live stages: the smoke-test token

`SHOT_BASE=https://www.stemshovel.com` (or staging) meets the firewall's
bot protection, which challenges a headless browser like any other script.
With `SMOKETEST_TOKEN` set (the dev 1Password environment, through varlock)
the script routes every request to the app's origin through Playwright and
adds the `x-smoketest-token` header the firewall's bypass rule matches
(docs/security.md "Bot protection and the smoke-test token"); requests to
Blob and other hosts never carry it. Production has no preview token, so a
production capture is always the signed-out view.

## Remote captures: Browserless

`bun run shot:remote /pricing [out.png] [width] [height]` renders a page of
a deployed stage in Browserless's own browsers instead of the VM's Chromium,
the way replicator captures production: a POST to Browserless's
`/screenshot` REST endpoint with the URL, the viewport, the full-page option
and the same knobs (`SHOT_BASE`, default production; `SHOT_VIEWPORT`,
`SHOT_WAIT`, `SHOT_ANON`). It needs `BROWSERLESS_TOKEN` (dev 1Password) and,
with `SMOKETEST_TOKEN` set, sends the bypass header on every request of the
page (Browserless sets extra headers per page, not per host; the token only
skips the bot check). The preview cookie goes to the stage's host alone. Use
it for the view from outside the VM; `bun run shot` with `SHOT_BASE` is the
everyday way to look at a live page.
