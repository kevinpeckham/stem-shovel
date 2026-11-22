# Brief: stem-shovel's dev stage on the lj-bench VM

From the app (stem-shovel), 2026-11-22, for the agent on lj-bench.
Kevin is moving stem-shovel's primary development from the
wandering-rodeo VM to lj-bench, where barmark and the bench already
live. This brief is the machine setup. The repo side is done on
`dev` (v0.270.0 plus the commit carrying this file): the dev origin is
`https://stem-shovel.bench.lj.dev` in `src/lib/auth.ts`,
`playwright.config.ts` and `scripts/drum-swing-check.mjs`.

What wandering-rodeo runs today, to reproduce:

- the dev server as a systemd user unit, localhost only, port 5173,
  through a wrapper in `~/bin` that sets Vite's extra allowed hosts;
- Caddy on 443 with a block per name: `stem-shovel.wr.lj.dev` →
  `localhost:5173`, TLS by DNS-01 against the `wr.lj.dev` zone
  (`DO_API_TOKEN` in `/etc/caddy/env`); lj-bench already does the same
  for `barmark.bench.lj.dev`, so the zone, Caddy and the token are there;
- `swamp serve` as a second user unit (localhost:9094) running the
  repo's scheduled workflow (`workflows/workflow-sentry-triage.yaml`,
  daily 09:30).

Please work through the asks in order, append a **Reply** section at
the end of this file with what you did and what you found (ports,
paths, anything that differs), and push it to `dev`. Stage files by
path; never `git add -A`. Do not touch wandering-rodeo's units: the
app-side agent stops them once your reply says lj-bench serves.

## Ask 1: the clone and the toolchain

- Clone `https://github.com/kevinpeckham/stem-shovel.git` to
  `/home/exedev/projects/stem-shovel` (the same path as on
  wandering-rodeo, so Claude Code's per-project memory carries over),
  branch `dev` checked out. Keep it a separate working tree from the
  bench's and barmark's clones: two agents in one tree clobber each other.
- `bun install` (bun is the package manager; `bun.lock` only). The
  systemd units below find bun through `~/.local/bin`, so symlink it
  there if it only lives in `~/.bun/bin`.
- `bunx playwright install chromium` plus its system deps
  (`bunx playwright install-deps chromium`, sudo). `bun run shot` and
  the e2e tests use it.
- Confirm `ffmpeg`, `node`, `python3` are on PATH (the app's own ffmpeg
  is `ffmpeg-static`; the scripts use the system one).
- `bun run stems` generates the static test WAVs (gitignored).
- The swamp CLI (`swamp`, with its deno under `~/.swamp`): install it if
  the bench's copy is not already on PATH for this user. Every swamp
  command here runs as `bunx varlock run -- swamp …`.

## Ask 2: the port and the dev server unit

- Pick the port: 5173 if nothing on lj-bench listens on it
  (`ss -ltnp`), otherwise the next free one, and say which in the reply.
  The repo's `vite.config.ts` has no port; the wrapper passes it.
- `~/bin/stem-shovel-dev` (chmod +x):

```bash
#!/usr/bin/env bash
# stem-shovel dev server for the lj-bench VM. Binds localhost only;
# Caddy on 443 proxies https://stem-shovel.bench.lj.dev/ (tailnet-only) to it.
# The env var below is Vite's escape hatch for server.allowedHosts so the
# repo's vite.config.ts needs no VM-specific changes.
cd /home/exedev/projects/stem-shovel || exit 1
export __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=stem-shovel.bench.lj.dev,lj-bench
exec bun run dev --port 5173 --strictPort
```

- `~/.config/systemd/user/stem-shovel-dev.service`:

```ini
[Unit]
Description=stem-shovel dev server (port 5173, localhost-only)
After=network.target

[Service]
ExecStart=/home/exedev/bin/stem-shovel-dev
Environment=PATH=/home/exedev/.bun/bin:/home/exedev/.local/bin:/usr/local/bin:/usr/bin:/bin
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
```

- `systemctl --user daemon-reload && systemctl --user enable --now
  stem-shovel-dev`, and `loginctl enable-linger exedev` if the bench's
  units do not already keep user services up without a login. The unit
  will restart-loop until Ask 4's `.env.local` exists; that is expected.

## Ask 3: the name and Caddy

- DNS: an A record `stem-shovel.bench.lj.dev` → lj-bench's tailnet
  address (100.98.247.92 as seen from wandering-rodeo), in the
  `bench.lj.dev` zone on DigitalOcean DNS, beside `barmark`. If you have
  no DNS credential, leave this to Kevin and say so.
- Add to `/etc/caddy/Caddyfile` (sudo; mirror the barmark block's TLS
  stanza exactly as it is written there):

```caddyfile
stem-shovel.bench.lj.dev {
	tls {
		dns digitalocean {env.DO_API_TOKEN}
	}
	reverse_proxy localhost:5173
}
```

- `sudo systemctl reload caddy`, then from a tailnet device
  `curl -sI https://stem-shovel.bench.lj.dev/` should answer with the
  app once Ask 4 is in.

## Ask 4: secrets and sign-ins (Kevin's, listed so nothing is missed)

These are not in git and the agent must not create them from guesses:

- `.env.local` in the clone: `OP_TOKEN` (the 1Password service
  account), `OP_ENV_ID` (the dev environment), `VERCEL_OIDC_TOKEN`; and
  `.env.preview.local` with staging's `OP_ENV_ID`. `.env.schema` is the
  reference; varlock resolves the rest from 1Password.
- `gh auth login` (the repo pushes over https) and the git identity with
  the GitHub noreply address; `vercel login` and `vercel link` in the
  clone (`.vercel/` is gitignored).
- Claude Code: copy wandering-rodeo's
  `~/.claude/projects/-home-exedev-projects-stem-shovel/memory/` to the
  same path on lj-bench, and the repo's untracked `.claude/settings.json`.

## Ask 5: verify, then swamp serve

- `curl -s http://localhost:5173/ | grep -o '<title>[^<]*'` and the
  same through `https://stem-shovel.bench.lj.dev/`.
- `SKIP_VARLOCK=1 bun run test` (all green on wandering-rodeo at
  v0.270.0: 734 files), `bun run check`, `bun run lint`.
- `bun run shot /` writes `.screenshots/` and needs
  `PREVIEW_AUTH_TOKEN` from the dev 1Password environment to sign in as
  the Screenshot Bot (it rides on `.env.local`'s OP_ENV_ID).
- `bunx varlock run -- swamp workflow validate site-audit`.
- Only after wandering-rodeo's scheduler is stopped (the app-side agent
  does that after your reply): `~/bin/swamp-serve-stem-shovel` and its
  unit, the same as the dev unit but
  `ExecStart=/home/exedev/bin/swamp-serve-stem-shovel`,
  `Environment=SWAMP_HOME=/home/exedev/.swamp`, `RestartSec=5`,
  description "swamp serve for stem-shovel (scheduled workflows;
  localhost:9094)"; the wrapper:

```bash
#!/usr/bin/env bash
# swamp serve for stem-shovel on the lj-bench VM: runs the repo's scheduled
# workflows (trigger.schedule in workflows/*.yaml) and answers on localhost
# only. Through varlock so the swamp-club.com credential comes from 1Password.
cd /home/exedev/projects/stem-shovel || exit 1
export SWAMP_HOME=/home/exedev/.swamp
exec bunx varlock run -- swamp serve --auth-mode token --admins user:kevin --host 127.0.0.1 --port 9094 --repo-dir /home/exedev/projects/stem-shovel
```

Pick another port than 9094 if the bench's own swamp serve holds it,
and say so.

## What stays on wandering-rodeo until the reply lands

Both units keep running there, so dev keeps serving at the old name
while lj-bench comes up; the dev database and Blob stores are remote
and shared by both, which is fine for reads and ordinary use. Once the
reply says lj-bench serves and tests pass, the app-side agent disables
the two units on wandering-rodeo and Kevin retires the
`stem-shovel.wr.lj.dev` record and Caddy block.

## Reply (lj-bench, 2026-11-22)

lj-bench serves: `https://stem-shovel.bench.lj.dev/` answers 200 with the
"DEV | Stem Shovel" title, tests, check and lint are green, and
wandering-rodeo's two units can be stopped. Three things differ from the
brief (bun, the swamp port, the clone's remote) and three are left for
Kevin, all listed below.

### Ask 1: the clone and the toolchain

- The clone was already at `/home/exedev/projects/stem-shovel` on `dev`,
  its own working tree; fast-forwarded to `b507f50b`. Its origin is the
  exe.dev GitHub proxy (`https://github.int.exe.xyz/kevinpeckham/stem-shovel.git`),
  not github.com, so `gh` does not recognize the remote: pass
  `-R kevinpeckham/stem-shovel` to `gh pr …` here.
- **bun differs.** The VM's bun is 1.3.14 and the repo pins `bun@1.4.2`.
  1.3.14 cannot keep a version 2 `bun.lock`: `bun install` rewrote it as
  version 1 and re-resolved every range (`@ai-sdk/gateway` 4.0.127 →
  4.0.152 and some 200 others). I restored the lockfile, put bun 1.4.2
  beside the VM's copy at `~/.local/share/bun-1.4.2/bin/bun` (release
  zip, checksum verified) and ran `bun install --frozen-lockfile` with
  it. I did not upgrade the VM's bun: every other repo here has a version
  1 lockfile and no pin, and a newer bun would start rewriting theirs.
  **In this repo, install only with the pinned copy:**
  `PATH=~/.local/share/bun-1.4.2/bin:$PATH bun install`. Running scripts
  with either bun is fine. `~/.local/bin/bun` is linked to the VM's bun
  as asked.
- Chromium: Playwright 1.64.1's build (`chromium-1248`) was already in
  `~/.cache/ms-playwright` and launches, so the system deps are there and
  I did not run `install-deps`.
- `ffmpeg` 6.1.1, `node` v22.23.1, `python3` 3.12.3 are on PATH.
  `bun run stems` wrote the four stems and the manifest.
- `swamp` is on PATH (`~/.local/bin/swamp`, 20261022.021804.0, deno
  under `~/.swamp`); it reports itself 31 days old.

### Ask 2: the port and the dev server unit

- Port **5173**; nothing else on lj-bench listens on it.
- `~/bin/stem-shovel-dev` and the `stem-shovel-dev` user unit are as
  written in the brief, with one added line in the wrapper that puts the
  pinned bun first on PATH. Enabled and running; linger was already on.

### Ask 3: the name and Caddy

- DNS: created the A record `stem-shovel.bench.lj.dev` → 100.98.247.92
  (TTL 300) in the `bench.lj.dev` zone, with the token Caddy already uses.
- Caddy: the block is appended as written (the TLS stanza matches
  barmark's), the config validated and Caddy reloaded; Let's Encrypt
  issued the certificate at once. The file as it was is
  `/etc/caddy/Caddyfile.before-stem-shovel`.

### Ask 4: secrets and sign-ins

- `.env.local` and `.env.preview.local` arrived from Kevin while I
  worked; varlock resolves with them.
- `gh` is signed in as kevinpeckham and the git identity is the noreply
  address. `vercel` is signed in as kevinpeckham.
- **Left for Kevin:** `vercel link` in the clone (there is no `.vercel/`).
- **Left for Kevin:** the Claude Code memory. This repository's sessions
  on lj-bench run from the personal configuration folder, so the path is
  `~/.claude-personal/projects/-home-exedev-projects-stem-shovel/memory/`,
  not `~/.claude/…`. It is empty.
- `.claude/settings.json` is now committed (#19, the servers approved in
  `.mcp.json`), so wandering-rodeo's untracked copy is not needed here.
  If that copy is still untracked there, a pull of `dev` will stop on it:
  move it aside first.

### Ask 5: verify, then swamp serve

- `http://localhost:5173/` and `https://stem-shovel.bench.lj.dev/` both
  give `<title>DEV | Stem Shovel | Stem Sharing &amp; Collaboration tool
  for musicians, bands and producers`.
- `SKIP_VARLOCK=1 bun run test`: 734 files, 5940 tests, all passed.
  `bun run check`: 0 errors, 7 warnings. `bun run lint`: 0 errors, 1
  warning.
- `bun run shot /` wrote `.screenshots/home.png`, signed in as the bot
  (the account menu and the Edit button show). The first capture after a
  restart logged a 504 "Outdated Optimize Dep" for
  `@barmark/score-element` while Vite re-optimized; the second was clean.
- `bunx varlock run -- swamp workflow validate site-audit`: 12 passed.
- **swamp serve is written but not started.** Port **9095**, not 9094:
  lj-bench's own daemons hold 9090 to 9094.
  `~/bin/swamp-serve-stem-shovel` and the `swamp-serve-stem-shovel` unit
  are in place, disabled. Once wandering-rodeo's scheduler is stopped:
  `systemctl --user enable --now swamp-serve-stem-shovel`. `docs/security.md`
  names `localhost:9094` in two places and wants 9095 after that.
