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
