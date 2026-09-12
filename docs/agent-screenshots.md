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
```

Then `Read` the PNG — the model is multimodal. `.screenshots/` is gitignored.
The script also prints page and console errors.

The Playwright MCP server is registered in `.mcp.json` alongside Fallow's for
interactive driving (`browser_navigate`, `browser_evaluate`, …). For
assertions, prefer a short Playwright script over eyeballing: element counts,
attributes, computed styles.

This is replicator's setup (see its `docs/agent-screenshots.md`) minus the
auth bypass — this app has no sign-in yet. When it does, port the
`PREVIEW_AUTH_TOKEN` pattern: a scoped bot user, fail-closed on a short or
missing token, constant-time comparison, audit tag.
