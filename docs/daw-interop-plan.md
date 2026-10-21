# DAW interoperability: targets and a testing plan

The DAWproject work is in docs/dawproject-plan.md (the format, the reader
and writer, the dialects found in real files, the free online converter
on the roadmap). This document is the wider view: which DAWs Stem Shovel
aims to exchange sessions with, what each of them can actually read and
write, and how to test the exchange, on Linux by automation first, then
on Mac and Windows virtual machines.

Kevin, 2026-10-21: Fender Studio Pro is out (lower adoption than the
alternatives). The targets are **Cubase, Audacity, Logic** and a fourth
(the message said Cubase twice; to confirm), with **Pro Tools** as a nice
to have: the app is for individual songwriters, musicians, bands and
freelance producers and engineers, not the entrenched professional
studio. The testing plan: Linux first, automated as far as it goes, then
Mac VMs, then Windows VMs.

## What each target can exchange

| DAW | Platforms | DAWproject | AAF | Timestamped BWF | MIDI file with tempo map | Scriptable |
| --- | --- | --- | --- | --- | --- | --- |
| Cubase 14.0.20+ Pro and Artist; Cubase 15 every edition | Win, Mac | read + write | Pro only (and Nuendo) | yes | yes | no file-level API; UI automation |
| Audacity 3.x | Linux, Win, Mac | no | no | no (imports at 0) | notes only, no tempo | mod-script-pipe (Python over a named pipe) with the app running |
| Logic Pro | Mac | no | read + write | yes ("Move to Original Record Position") | yes (tempo, meter, markers into an empty project) | no API; AppleScript/UI automation |
| Pro Tools Studio and Ultimate | Win, Mac | no | read + write (Intro and Artist: no) | yes ("Spot" to timestamp) | yes | PTSL, a gRPC scripting API since 2022 |
| Reaper | Linux, Win, Mac | no (an extension can add a project importer) | no (third-party Vordio) | yes | yes | ReaScript (Lua, Python, EEL); `.RPP` is a readable text project |
| Ardour 8.4+ | Linux, Win, Mac | no | read (libaaf, beta in 8.4, improved through 8.7) | yes ("position at file timestamp") | yes | Lua, including the headless `luasession` |
| Bitwig | Linux, Win, Mac | read + write | no | yes | yes | no |
| Ableton Live, FL Studio, GarageBand | Win, Mac (GarageBand: Mac) | no | no | no | yes (Live: notes only, no tempo) | Live: Max for Live; FL: no; GarageBand: no |

Three things fall out of the table.

1. **DAWproject reaches Cubase and nothing else on the list.** It is
   done, but it is one target of four. Steinberg's own notes for 14.0.20
   say the tempo track, markers and the notepad do **not** travel in
   their DAWproject: Dawn's sections and key changes would not arrive
   in Cubase 14 (Cubase 15 is unverified). The MIDI file has to carry
   them in parallel until a real Cubase export says otherwise.
2. **The lowest common denominator is audio files plus a MIDI file.**
   Every DAW on the list imports WAV. Logic, Pro Tools, Cubase, Reaper
   and Ardour place a Broadcast Wave file at the time in its `bext`
   chunk, so clips at offsets survive as separate timestamped files;
   Audacity, Live, FL and GarageBand import at zero, so they need one
   full-length file per track ("stems from zero"). A type-1 Standard
   MIDI File carries the tempo map, time signatures, key signatures and
   markers (meta events) that Logic, Pro Tools, Cubase, Reaper and
   Ardour read into the project; Audacity reads only the notes. Audacity
   takes its markers from a label track text file instead.
3. **AAF is the only structured format Logic and Pro Tools read**, and
   Ardour reads it too, which makes it testable on Linux. It is a binary
   structured-storage container. `pyaaf2` (Python, pure, reads and
   writes, embedded or external essence) and `libaaf` (C, reads;
   `AAFInfo` CLI) are the open tools. Writing it means a Python worker
   or a port, not the browser.

## What Dawn should export, by target

- **A session bundle** (zip): every clip as a 24-bit Broadcast WAV with
  its start in the `bext` time reference, every track as a stem from
  zero, one `.mid` with the tempo map, meters, keys, markers and the
  notes clips, an Audacity `labels.txt`, and a short README naming
  which DAW opens which part. This is the stems-plus-MIDI export with
  three additions (timestamps, labels, README) and serves all four
  targets today. It is also conversion 1 of the free converter.
- **DAWproject** for Cubase (and Bitwig, Studio One): done.
- **AAF** for Logic and Pro Tools: a later phase, after the session
  bundle has been proven in Logic by hand, and only if users ask for a
  one-click open rather than an import of a folder.
- **Reading**: DAWproject (done), AAF (Logic and Pro Tools exports, via
  pyaaf2 in a Python job or a reader of our own), Audacity `.aup3`
  (SQLite with an XML project document and the sample blocks inside;
  readable in the jobs function), Reaper `.RPP` (text). Logic, Pro Tools
  and Cubase projects are undocumented binaries: no.

## Testing plan

### Tier A: pure, in CI, on every push

What runs today in Vitest and what to add. No application is involved,
so this tier is deterministic and fast.

- The DAWproject reader against the corpus phase 3 gathered: Bitwig 5.3
  exports, Bitwig's reference suite (20 generated projects), the
  converter dialects. Today these run by hand through
  `scripts/dawproject-probe.ts`; the checked-in fixtures should be the
  small public ones (the pulp XML fixtures, excerpts), with the large
  binaries kept out of the repo.
- The writer's output validated against Bitwig's XML schema
  (`Project.xsd` in the reference repository) through a schema
  validator in the test, not only by our own reader.
- **MIDI**: the session bundle's `.mid` parsed back by a second
  implementation (the `midi-file` package or Python `mido`), checking
  tempo, meter, key and marker events at the right ticks.
- **BWF**: the `bext` chunk's time reference read back and compared with
  the clip start in samples.
- **AAF** (when written): `pyaaf2` opens the file and lists the mobs,
  `AAFInfo` prints the composition; both as a job in CI with Python.
- Audacity labels: the text format is three columns, trivial.

### Tier B: real applications on this VM, scripted (the Linux tier)

The VM has 8 CPUs, 31 GB and now 76 GB free; it has no display or sound
card, so each application runs under `Xvfb` (a virtual X display) with
`xdotool` for the few things scripting cannot reach, and a dummy ALSA
or a `pipewire` null sink where the app insists on a device. Each
becomes a `bun run interop:<daw>` script that takes a Dawn export,
drives the application, and diffs what came out against what went in.
These are not CI gates (the applications are not in CI); they run on
the VM before a release that touches the exchange formats, like
`check:swing`.

1. **Reaper** (native Linux, 60-day fully functional evaluation, then a
   license): ReaScript in Lua or Python drives it from the command
   line (`reaper -nosplash -new` with a startup script), imports the
   session bundle's BWF files "at timestamp" and the `.mid`, saves an
   `.RPP`, and the test reads the text project back: items at the right
   positions, tempo and markers present. The same script imports the
   DawVert-converted `.RPP` of Dawn's DAWproject, closing the loop that
   phase 3 opened. Reaper is also the first user of conversion 3 of the
   converter.
2. **Ardour** (Ubuntu 24.04 packages 8.4; the Flathub build is newer
   and has the better AAF import): the headless `luasession` loads a
   session, imports audio at the file's timestamp, imports MIDI, imports
   AAF, and saves; the session is XML, so the test reads it back. This
   is the Linux stand-in for Logic and Pro Tools: an AAF that Ardour
   opens correctly is the first evidence before a Mac is involved.
3. **Audacity** (AppImage; mod-script-pipe enabled in its preferences,
   driven from Python through the named pipe while the app runs under
   Xvfb): import the stems from zero and the labels file, export
   multiple, compare the audio sample for sample; save a project and
   read the `.aup3` back as SQLite for the `.aup3` reader's fixtures.
   The manual's warning that scripting is not for a web service is
   about serving users, not about tests.
4. **Bitwig** (optional; native Linux, 30-day trial, no scripting): a
   VNC view of the Xvfb display for a by-hand check of the DAWproject
   when a question needs a real Bitwig rather than the reference suite.
   Low value now; the reference suite is Bitwig's own code.
5. **DawVert** and the reference suite stay as they are, as the
   converter cross-checks.

Order: Reaper and Ardour first (both script from the command line,
both read timestamps and MIDI, Ardour reads AAF), Audacity third (its
pipe is the fiddliest), Bitwig only on demand.

### Tier C: Mac VMs (the higher priority)

macOS virtual machines are licensed only on Apple hardware, at most two
guests per host. The options:

- **Kevin's Mac with Tart** (Cirrus Labs; Apple's Virtualization
  framework on Apple silicon; free for personal and small use): a vanilla
  macOS image of about 25 GB, snapshot after installing the DAWs, reset
  to the snapshot before each run. Scripts reach the guest over SSH
  (`tart ip`), and the VM's screen through `tart run` or VNC. This VM can
  SSH into it only if Kevin opens a tunnel, so the natural shape is a
  script Kevin runs on the Mac that pulls the export from the dev server
  or staging and reports.
- **A hosted Mac** (MacStadium's Orka, AWS EC2 Mac at a 24-hour minimum,
  Scaleway Apple silicon by the hour): reachable from here over SSH, so
  the whole run can be automated from this VM; costs a few dollars an
  hour and the same licensing per DAW.

In the guest: **Logic Pro** (90-day trial from Apple's site, no App
Store needed; no scripting API, so AppleScript "System Events" and
keyboard shortcuts open File > Import and File > Export > Project as AAF;
Logic's project package is readable enough to check what landed), **Pro
Tools Studio** (30-day trial; PTSL scripts import session data and
export AAF with no UI), **Cubase** (Pro trial on a Steinberg ID; no file
API, UI automation; the first real Cubase DAWproject export and the
answer to whether 15 carries tempo and markers), **GarageBand** and
**Ableton Live Lite** (free; import-only checks of the stems from
zero). Audio devices are absent in a VM; none of these checks needs one,
and Logic and Pro Tools start without one.

### Tier D: Windows VMs (later)

Cubase, Pro Tools, Audacity, Reaper and Live run on Windows; Logic does
not, which is why Windows is second. Any cloud (Azure, AWS, Hetzner)
rents a Windows Server by the hour with RDP, and PowerShell plus the
same PTSL and ReaScript paths script it. Nested virtualization on this
VM is not available, so it is not an option to host one here. What
Windows adds over Mac is only Cubase's Windows build and the Windows
Pro Tools; it is a confirmation tier, not a discovery tier.

## Order of work

1. Tier A additions (schema validation, MIDI and BWF read-back): a day.
2. The session bundle export (timestamps, labels, README): a day; it is
   also the public converter's first conversion.
3. Tier B Reaper and Ardour scripts: two days, including the installs.
4. Tier B Audacity: a day.
5. A Tart image on Kevin's Mac with Logic Pro trial and Cubase trial, a
   by-hand pass first (import the bundle, export a DAWproject and an
   AAF): half a day of Kevin's time; the exports come back as fixtures.
6. AAF writer and reader, if the Logic pass says the bundle is not
   enough: a week, Python in a worker.
7. Tier C automation, then Tier D, as the targets' user numbers justify.

## Open questions

- The fourth target DAW (the message named Cubase twice). Ableton Live,
  GarageBand, FL Studio and Reaper are the likely candidates for the
  audience; the table covers them.
- Does Kevin's Mac have Apple silicon and room for a 25 GB image, and
  does he own Logic Pro or want the trial?
- Reaper's license for the VM after the evaluation (about 60 USD).
- Which DAWs' AAF dialect to write first when the AAF writer comes:
  Logic's and Pro Tools' differ, and the forums say Logic's reader is
  the stricter one.

## Sources

- Bitwig, "Cubase 14 now supports DAWproject": https://bitwig.com/stories/cubase-14-now-supports-dawproject-341
- Steinberg help center, Cubasis and Cubase project exchange (editions and limitations): https://helpcenter.steinberg.de/hc/articles/25142209226642 and https://helpcenter.steinberg.de/hc/articles/30872578850706
- Ardour 8.4 release notes (AAF import): https://ardour.org/news/8.4.html and 8.6: https://ardour.org/news/8.6.html
- Audacity manual, Scripting (mod-script-pipe): https://manual.audacityteam.org/man/scripting.html
- Apple, Logic Pro, export a project as an AAF file: https://help.apple.com/logicpro/mac/10.1/en.lproj/lgcp7355bedf.html
- Reaper extensions SDK (project importers) and ReaScript: https://www.reaper.fm/sdk/plugin/plugin.php and https://www.reaper.fm/sdk/reascript/
- Tart (macOS VMs on Apple silicon): https://developer.hashicorp.com/packer/plugins/builders/tart
