# Agent screenshots

The agent can look at the app. Playwright and Chromium are installed on the
VM (`bunx playwright install --with-deps chromium`), and:

```sh
bun run shot /projects                      # full-page PNG → .screenshots/projects.png
bun run shot /test out.png 1280 700         # custom file, viewport
SHOT_VIEWPORT=1 bun run shot /test          # viewport only
SHOT_WAIT=2500 bun run shot /projects/x/y   # wait longer (decoding, fonts)
SHOT_CLICK='section[aria-label="Stems"] summary' bun run shot …   # click first
SHOT_BASE=https://www.stem-shovel.com bun run shot /projects      # live site
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
