# DAW project storage and sync (viability research)

Status: **research only, nothing built** (2026-09-27). Kevin's question:
is offering storage and syncing of DAW source files (the Logic, Ableton,
Pro Tools, Reaper sessions behind the stems) viable as an additional
service? Prices below were fetched on this date and will drift.

## Short answer

Storage is viable and cheap to offer as a paid add-on. Syncing is the
expensive part, and the graveyard says why: the two companies that tried
it at scale gave up. A middle road fits Stem Shovel: **archive and
version whole projects, from the browser, no desktop agent**, priced by
the gigabyte, with sync left to Dropbox and the DAWs' own clouds. Build
it after billing exists, since the point of it is to be paid for.

## What a DAW project is, and how big

Every major DAW keeps a small document plus a folder of audio. The
document is what people mean by "the project"; the audio is what makes
it heavy.

| DAW          | Document                              | Audio                                                     |
| ------------ | ------------------------------------- | --------------------------------------------------------- |
| Logic Pro    | `.logicx` package (a folder to macOS) | inside the package, or an external folder                 |
| Ableton Live | `.als` (gzipped XML)                  | `Project/Samples/`, plus references to the library        |
| Pro Tools    | `.ptx`                                | `Audio Files/`, `Bounced Files/`, `Session File Backups/` |
| Reaper       | `.rpp` (text)                         | a media folder beside it                                  |
| FL Studio    | `.flp` (one binary file)              | references samples anywhere on disk                       |
| Studio One   | `.song`                               | `Media/`                                                  |
| Cubase       | `.cpr`                                | `Audio/`                                                  |

Sizes: a three-minute song with eight mono tracks at 44.1 kHz/16-bit is
about 130 MB; a mono track at 48 kHz/24-bit is 8.6 MB a minute, so a
24-track band session with takes and comps runs 1 to 3 GB, and an
orchestral session at 96 kHz can pass 10 GB. Forum consensus puts
ordinary sessions between 500 MB and 10 GB. Logic keeps audio in the
package even after its regions are deleted, and Ableton and FL projects
refer to samples outside the project that a copy does not carry unless
the user "collects all and saves". A **project is therefore ten to a
hundred times the size of its stems** on Stem Shovel today, and a copy
made without the DAW's own collect step is often incomplete.

## Who has tried

- **Splice Studio** (2014 to 2023): a desktop agent watched the project
  folder, uploaded on every save, kept every version, free. Compatible
  with Live, Logic, FL, GarageBand and Studio One. Splice shut it down in
  2023: never monetised, and they "haven't been able to provide the
  quality of experience of which we can be proud". The engineering was
  in the agent and the per-DAW format handling, and it was never paid for.
- **Avid Cloud Collaboration**: Pro Tools only, built into the DAW, with a
  track-level share model (each collaborator owns tracks) rather than a
  file sync. Storage tiers of 1 GB free (three projects), then 20 GB for
  $9.99 and 60 GB for $24.99 a month. Works because Avid owns the format.
- **Ableton Cloud**: sync of up to eight Sets between Note, Move and
  Live, sets under 50 MB, explicitly "for synchronization, not long-term
  storage". Ableton owns the format and still keeps it small.
- **Satellite Sessions** (Mixed In Key): a plugin inside each DAW that
  exchanges stems between collaborators on different DAWs. Free for
  guests. It sidesteps the project file altogether: it moves audio.
- **SyncMuse** (2025 on): the self-described Splice Studio successor, but
  it versions **bounces and exports**, not project files, with 2 GB free
  and 50 GB for $12.99 a month. Plugins are "next up".
- **Dropbox, Google Drive, iCloud**: what most bands use. Dropbox's 2 TB
  is about $12 a month. Sync of a Logic package or a Live project folder
  works but with known failure modes: half-synced packages, conflicted
  copies when two people open the same session, and no notion of a
  "version" beyond the file system's.

The pattern: everyone who owns a DAW syncs its own format and keeps it
small; everyone who does not either moves audio instead of projects
(Satellite, SyncMuse) or died trying (Splice). No third party syncs
arbitrary DAW projects well today.

## What it would cost us

Storage at cloud rates is not the obstacle.

| Store                        | Storage / GB-month | Egress / GB | Notes                                             |
| ---------------------------- | ------------------ | ----------- | ------------------------------------------------- |
| Vercel Blob (what we use)    | $0.023             | $0.05       | 5 TB per file with multipart; client uploads free |
| Cloudflare R2                | $0.015             | $0          | $0.01 for infrequent access; S3-compatible        |
| Backblaze B2 (for reference) | about $0.006       | $0.01       | cheapest of the well-known stores                 |

A 2 GB project held for a year costs us 55 cents on Blob or 36 cents on
R2. A band that keeps 20 projects (40 GB) costs $11 a year on Blob, $7 on
R2, before egress. Egress is the real variable on Blob: every restore of
a 2 GB project is 10 cents, and a band that pulls its projects often
could out-cost its storage. R2's zero egress is why the archive should
probably not live in Blob, or should live in Blob only until it is worth
moving. The existing billing model (docs/billing.md) already prices data
per account; a DAW archive is the same model with bigger numbers.

Against that, the market: Dropbox charges about $6 per TB-month, Avid
$0.50 per GB-month at the low tier, SyncMuse $0.26 per GB-month. A plan
at **$5 a month for 100 GB** ($0.05 per GB-month) would clear storage
cost three to seven times over and undercut everything but raw Dropbox,
which offers no music features.

## The hard parts, honestly

1. **Sync needs an agent.** A browser cannot watch a folder. The
   FileSystemObserver API ran an origin trial in Chrome 129 to 134 and is
   still experimental and Chrome-only; Firefox and Safari ship only the
   private file system. Continuous sync means a desktop app (Electron or
   Tauri, signed and notarised for macOS, where most DAW users are),
   which is a second product to build, ship, update and support. That is
   the product Splice could not sustain.
2. **Projects are not self-contained.** Ableton and FL reference samples
   outside the project; Logic can reference external audio; Pro Tools
   references its library. A faithful copy needs the DAW's own collect
   step or format-aware code per DAW. Getting this wrong means a restored
   project that opens with missing files, which is worse than no backup.
3. **Concurrent edits do not merge.** Project documents are opaque
   (gzipped XML at best, binary at worst). Two people editing one session
   is a conflict, not a merge. Avid solves it by owning tracks; Dropbox
   makes conflicted copies. We would need a check-out model ("Kevin has
   this session open") or last-writer-wins with versions kept.
4. **Uploads are large and slow.** A 2 GB session on a home upstream of
   20 Mbit/s takes 15 minutes. Multipart, resumable uploads exist in the
   Blob client and we use them, but the experience is a progress bar the
   user waits on, not a background sync.
5. **Legal.** Sessions contain licensed samples and instrument libraries
   (Kontakt patches, Splice samples, stock loops). Storing a user's own
   files is fine under the existing terms and the DMCA safe harbour, but
   the archive must be private per account, never shared by link, and the
   copyright policy should say what it is.
6. **Restore is the product.** Backup is only worth paying for if a
   restore reproduces the session. That needs testing against real
   projects from each DAW, which means a test corpus and a Mac.

## Three ways to offer it

| Option                   | What the user does                                                                                                | Effort | Risk   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| A. Project archive       | Drops the project folder or package into the song page; we zip, version and store it; download a version any time | small  | low    |
| B. Browser sync (Chrome) | Grants folder access once; the tab uploads changed files while open                                               | medium | medium |
| C. Desktop agent         | Installs an app that watches project folders and syncs continuously                                               | large  | high   |

**A** is what a band actually needs from Stem Shovel: the session that
made the stems, kept beside them, versioned, with a note ("mix v3, before
the bridge edit"). It is a folder upload (the browser can take a
directory drop and stream it part by part), a manifest per version, one
Blob or R2 object per file with content hashing so unchanged audio is
stored once across versions, and a download that streams a zip. Two to
three weeks including the song-page UI, the version list, quota
accounting and a restore test on Logic, Live and Reaper projects.

**B** is A plus a "keep this folder in sync while the tab is open"
switch in Chrome and Edge, using the File System Access API's directory
handle and polling (or FileSystemObserver where it exists). Cheap to add
on top of A, honest about its limits, and covers the "I saved, is it up?"
case without an agent. Useless in Safari, which many Logic users run.

**C** is the Splice product. It is the only one that gives true sync,
and it is the one I would not build until A has paying users asking for
it, because it doubles the surface area of the app for a feature whose
market so far has not paid.

## Recommendation

Viable as **paid project archiving with version history**, option A,
priced by the gigabyte on top of the plans in docs/billing.md, storage
on R2 rather than Blob to make restores free of egress. Not viable yet
as true sync; revisit an agent only if archive customers ask for it.
Prerequisites: Stripe billing (docs/billing.md, not built), a test corpus
of real projects, and a decision on where the archive lives (R2 means a
second storage integration beside Blob). Ships as a feature of the song
page ("the session behind these stems") and of the project page ("every
session in this project"), which is where a band would look for it.

Sources (fetched 2026-09-27): Vercel Blob pricing and multipart limits
(vercel.com/docs/vercel-blob), Cloudflare R2 pricing
(developers.cloudflare.com/r2/pricing), Splice's shutdown letter
(splice.com/blog/studio-shutdown), Avid's cloud storage FAQ
(kb.avid.com), Ableton Cloud FAQ (help.ableton.com), Satellite Sessions
(mixedinkey.com/satellite), SyncMuse pricing (syncmuse.co/pricing), MDN
on FileSystemObserver, and Logic project-size threads on Gearspace,
VI-Control and Apple's forums.
