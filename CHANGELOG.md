# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Releases are cut with the `/release` skill (see `.claude/skills/release/SKILL.md`).

## [Unreleased]

## [0.89.0] - 2026-10-03

### Changed

- **Chord numerals on every wedge**: the chord player's Roman numerals are a device button (IV, beside the keyboard button) and cover every chord relative to the key, the key's six in yellow and the rest (♭VII, ♯iv…) in grey, where the old option wrote only the six; the keyboard and numerals buttons sit in a Guides group.
- **An arch layout for the chord player**: the UI menu's Layout (the Circle menu, renamed, with the layout, the key's place, the signatures, the dim and the keyboard map) swaps the circle for an arch, the key and three fifths each way drawn big across the top, the four far keys as straight buttons continuing its two ends down the page, the tritone left out, so the chords a song mostly uses get the room. With the key at the bottom (the UI menu) the arch turns over, a bowl with the key at the bottom for a thumb on a phone. Remembered per browser. The dim on the chords outside the key is on by default, the key signatures are off by default, and the key sits at the bottom by default (so the arch starts as the bowl). The number row and the row below follow the key wherever it sits: 1 and Q are always the key's chords.
- **Chord styles** (the Chords menu): Plain is the triads with the 7 pad's seventh; Blues puts a dominant seventh on every wedge; Jazz gives each degree its own (maj7 on I and IV, m7 on ii, iii and vi, 7 on V and the borrowed chords, m7♭5 on vii); Lush stacks ninths, elevenths and thirteenths. The 7 pad adds the next extension, the names say what sounds, the style is saved with a progression, and the voicing spreads whatever the style gives.
- **Style and Voicing on the device**: two dropdowns beside Sound, no longer only in the Chords menu (a phone keeps them in the wrench menu).
- **The chord player's own presets** on the shared library (migration 0072 `piano_preset.chord_slot`): the five buttons are the chord player's, their manage menu saves the sound playing to a button, puts any saved preset on one, renames or clears it, and a system admin keeps the site's defaults for them; the library of sounds is the piano's, so a preset saved on one instrument goes on the other's buttons too. The link to the piano page is gone.
- **A sustain pad** beside the 7 pad, held for the pedal, for a tablet with no space bar; from desktop size the two are round pads in the empty corners either side of the arch (the bowl's bottom corners).
- **The arch is the default layout**, and the wedges' names follow the style and the 7 pad: Cmaj7 on the C wedge in Jazz, Cmaj9 while the pad is held.
- **Gliding on the circle**: drag from one wedge onto another without lifting and the chord changes (the first lets go as the next sounds); sliding off the wedges keeps the chord until you lift, as before.
- **Custom chord styles** (migration 0071 `chord_style`): a member's own style from the Chords menu, starting from the one in use, a row per degree with the recipe for the major and minor wedge and what the 7 pad raises each to; saved to the account by name, edited and deleted there, listed under the built-in four.
- **A keyboard map by degree** (the UI menu): 1 to 7 play I to VII as majors, 8 to = the five chromatic roots in rising order, the row below the minors on the same roots, so I–IV–V is 1, 4, 5 and ii–V–I is W, 5, 1. The key labels and the shortcut strip follow the map.
- **Key signatures run along the rim**, turned with their wedge, so a long one no longer runs past the edge.
- **The keyboard key labels on the circle are the piano's blue**, not the accent.
- **The keyboard shortcuts on the device**: Space sustain, Shift seventh and Esc all off sit under the circle from desktop size; with the key labels up, the two rows join them.

## [0.88.0] - 2026-10-03

### Added

- **The Chord Player's progression pad and Timing menu** (docs/chord-player.md, phase 2). With Jot on, the pad under the circle writes every chord played, lasting until the next starts (one, two or four beats at the metronome's tempo; a silence of two beats or more is a rest), grouped by bar; tap an entry to change its beats, make it a rest or remove it, with undo and clear. Play runs the progression through the chord player with the pad's own click on the piano's clock (loop or once), lighting each chord; MIDI exports a `.mid` on a format-0 writer (`utils/midiFile.ts`) the drum machine's export now shares. The pad persists per browser; a signed-in member saves progressions to the account by name (migration 0069 `progression`; `progressions.remote.ts` mirrors the beats: every member opens, editors keep, rename and delete). The Timing menu holds the metronome's tempo (slider, steps, number, Tap), beats to the bar, a free-running click to jot against and the playback click switch. Both are for wider screens; a phone keeps to the circle.
- **Notes with a progression** (migration 0070 `progression.notes`): a member's chord player page has the Idea Recorder's note board under the device, saving as you type and kept with the progression; a note on a pad never saved makes a progression for it, so notes stand alone, and one emptied of both chords and notes goes. The Saved menu's New starts a fresh pad.
- **The chord player and its notes pop out into panels** on a wide screen, draggable and resizable like the looper's, remembered per browser.
- **Reset all to defaults in the Effects menu**, on the piano and the chord player: every effect back as the piano starts, the sound untouched.
- **Roman numerals and a key highlight on the circle**: the Circle menu writes I, ii, iii, IV, V and vi on the key's six diatonic chords and dims the chords outside the key.

## [0.87.0] - 2026-10-03

### Added

- **The Chord Player** at `/chord-player` (docs/chord-player.md, phase 1): the piano's sounds, presets and effects played from a circle of fifths. Press and hold a wedge for a chord, the outer ring the majors and the inner their relative minors, the 7 pad or Shift for a seventh, Notes mode for single notes, the key center turning the circle; the Chords menu's voicings, strum, velocity and octave; the computer keyboard's number row and the row below. In the nav and footer, the sitemap, indexable, open to everyone, with its user doc and page copy. The piano's Effects menu is a shared component (`PianoEffectsMenu.svelte`). On a phone the device is one row (Power, Sound, a Key dropdown, a wrench menu) with the 7 pad under a thumb at the lower left; a keyboard button shows each wedge's key.
- **A limiter on the piano** (and so on the chord player): a fast compressor at the end of the chain catches the peaks of a thick chord, and a chord's notes play a little softer the more of them there are, so chords no longer clip.

### Changed

- **A note the sustain pedal holds plays again when pressed again**, on the piano and the chord player (it kept sounding and ignored the press).

## [0.86.0] - 2026-10-03

### Added

- **Custom drum kits** (docs/drum-machine.md, "Custom kits"; migration 0067 `drum_kit`, `drum_sample`). An account's editors make kits from their own one-shots in the drum machine's Kit row: a name, then a file per drum (uploaded like a demo, counted against the account's storage), replaced or removed one at a time, played by every member. System admins make the site's kits the same way at `/admin/drum-kits`, listed for everyone beside the built-in three, and replace any drum of the built-in Acoustic and Room kits with a file of their own (an override: every other drum stays the built-in file, so nothing loads slower). Every sample shows its filename, format, size, date and uploader with a listen button, and carries a source note for provenance (migration 0068); the built-in drums show their Groovie file and licence. The kit id in a beat is any kit's now; a kit a page was not given falls back to Acoustic, and a share link, with two bits for the kit, encodes a custom kit as Acoustic.
- **Piano: the site's five default presets managed in full** by a system admin (docs/piano.md, "Presets"): a Site defaults list in the manage popover with save-here, rename, move and clear per slot, whatever the admin's own buttons show.

## [0.85.0] - 2026-10-02

### Added

- **One Recordings panel with search** on the Idea Recorder (docs/demo-recording.md). The search field sits at the top of the Recordings panel and narrows the list in place; the panel docks, pops out, or minimises to the toolbar's Ideas button, which brings it back as it was. On a phone the same list opens as a full-screen sheet from that button. The separate search sheet is gone.
- **Calibrate on the Idea Recorder.** The microphone's menu has the looper's Calibrate button: three clicks through the speakers measure the input latency, now kept with the shared inputs (`inputSources.calibrate()`), so a multitrack take's stems line up without a trip to the looper.

### Changed

- **Drum machine styling pass** (Kevin): the readout is unselectable and the layout tightened.
- **Notification links are permanent.** The inbox and digest emails now store an id-based address (`/go/song/<id>`, `/go/project/<id>`, `/go/account/<id>/settings`) that redirects to the page's current URL, so a rename, or a slug reused by a new item, never changes where an old notification leads (docs/notifications.md). Links stored before keep working through the slug redirects.

## [0.84.0] - 2026-10-02

### Changed

- **The free plan holds 20 GB and 6 members** (was 10 GB and 5): `PLAN_LIMITS`, the pricing page, the home page's FAQ, the plan terms and the accounts user doc (docs/billing.md).

## [0.83.0] - 2026-10-02

### Added

- **Idea Recorder page copy** (docs/page-copy.md). The page's title, intro and a "How to use" section with Quick Tips under the recorder come from a copy doc a system admin edits in the app, as on the looper and the other tool pages; the tips show from sm up.

## [0.82.0] - 2026-10-02

### Added

- **Idea Recorder: a Tracks panel for multitrack takes** (docs/demo-recording.md, "Tracks panel"). A take with stems in the player gets the song player under the recorder: each stem with its waveform, mute, solo and fader, a transport and a master. It pops out and docks like the notes.
- **Multitrack by default** once two or more sources are in the take; Stereo stays a choice.
- **Multitrack stems line up.** The input latency (measured by the looper's Calibrate, or the browser's figure) is trimmed off the front of microphone and line-in stems, and the computer capture's latency off the computer's, as a multitrack take is saved, so they sit with the piano's and the drums'. The latency slider now lives in each input's menu on both pages; the looper keeps Calibrate.

## [0.81.0] - 2026-10-02

### Added

- **Idea Recorder: input sources as on the looper** (docs/demo-recording.md, "Input sources"). An Input Source row under the screen with Microphone, Line in, Computer, Piano and Drums, each a toggle into the take with its meter, a settings menu joined to its button (device and channels, the share picker, latency, monitor, normalize) and its gain slider or, for the instruments, their own master volume. Any mix of sources is in a take; the microphone is no longer required, and multitrack is offered with two or more sources in. Meters run before Record. Normalize writes a file from the inputs as 24-bit WAV scaled to −1 dBFS.

### Changed

- **The microphone, line in and computer are shared between the looper and the recorder** (`src/lib/audio/inputs.svelte.ts`, `SourceButton.svelte`, `InputSourceSettings.svelte`): one device, channel and gain setting each, remembered per browser as `stemshovel.inputs.*` (the looper's earlier keys are read as a fallback), and an input opened on one page is open on the other. The recorder's settings menu loses its Stereo input switch and Microphone picker, which live in each source's menu now.

### Technical

- The dev server logs server errors to its console (`handleError`); before, they went to Sentry only.

## [0.80.0] - 2026-10-02

### Added

- **Old addresses keep working.** Renaming a project, a song or an account so that its URL changes records the old address (`slug_alias`, migration 0066; docs/data-model.md), and a visit to it redirects permanently to the current page, query string included, so links already shared do not break. A rename reverted leaves no circle: the live slug always wins and its alias is removed. An account's old slugs stay reserved for it.
- **Share links at their own address.** A share link is now `/s/<code>`, which finds the song or project the code was made for and opens its current page with the code attached; the share popover and the share email use it. Links copied before carry on through the redirect above.

### Changed

- **The URL field no longer follows the name** as you rename an existing project, song or account; "Use name" fills it on request, with a note that the old address keeps redirecting. The account settings page now says what the slug is for.

## [0.79.0] - 2026-10-02

### Added

- **Looper: Line in and Computer sources** (docs/looper.md, "Inputs"). A second input for an instrument on an audio interface, with a device picker for it and for the microphone and a channel mode (stereo, or one channel on both sides); audio from another program through the browser's share picker (Chrome and Edge; a tab anywhere, the whole computer on Windows; on a Mac a loopback device as the line in), with its own latency slider. Each outside source has a gain slider under its button (−12 to +24 dB) and recorded input layers can be normalized to −1 dBFS; the piano and the drums have their own master volume under theirs, the same one their panels move. Each source but the drums has its own settings menu on a small button joined to its right (device, channels, monitor, normalize, latency; the share picker for the computer; the output-latency shift for the piano) in place of the Mic/Inputs menu, and the rows under the screen run sources, settings, transport.

### Fixed

- **Looper: opening the audio twice** (a pointer-down and the click after it) could leave the second caller without the capture node; the device menus open to the right so they fit.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
- **Looper: the Computer source never opened the share picker**: the Permissions-Policy header had `display-capture=()`; it is now `(self)` (securityHeaders.ts and vercel.json).

## [0.78.0] - 2026-10-02

### Added

- **Looper: Save, Save as new loop, Export** (docs/looper.md, "Save and Export"). Save stores the loop with every layer under an idea of the new kind "loop" (migration 0065 adds `idea.kind`), with no dialog (the loop's name is a field above the screen, a placeholder until typed, as the recorder's idea title), and saves again in place after that; Export lists it in the Idea Recorder as an idea. The recorder hides loops unless **Show loops** is on, marking them with a loop icon.
- **Looper: notes on a loop**, the recorder's note board under the device, saved with the loop and back on load.
- **Looper and notes pop out** into draggable, resizable panels on a desktop, as on the recorder page.
- **Page copy on the drum machine, piano, tuner and metronome pages**: their titles, intros and tips are now copy docs edited in the app (`drum-machine-page`, `piano-page`, `tuner-page`, `metronome-page`, seeded by `bun run db:seed-docs`).

### Changed

- **Looper: "Input Source"** names the source group. The Stereo or Multitrack choice is gone: a saved loop always keeps its layers.

### Fixed

- **The piano page's header** was clipped away at every width; it is visible from the small breakpoint and screen-reader-only on phones.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

### Added

- **Looper: import a take.** The Load menu lists recent Idea Recorder takes; one comes in as layers (a multitrack take one per source, a stereo take as one), with the loop's length taken from the take on an empty loop or the take fitted to the loop otherwise, and a start offset (docs/looper.md, "Importing a take"). `loopSources` hands back the take's own file beside its sources; `looper.importTake`.

## [0.77.0] - 2026-10-02

### Added

- **Looper: Load.** A Load menu lists the loops you exported to the Idea Recorder and brings one back into the looper from its sources, with its tempo, bars and layer levels (`listUserLoops`, the `loopSources` query, `looper.loadFrom`); the Save menu is now **Export** (docs/looper.md, "Export and Load").

### Changed

- **Looper: Record is one lit button.** It starts a layer and, pressed again while recording, makes the pass under way the last; the screen says so. Stop halts the loop and drops a pass still recording. The separate Finish layer and Cancel buttons are gone (Kevin: a relabelled button that seemed to do nothing).

## [0.76.0] - 2026-10-02

### Changed

- **The looper works signed out** (docs/looper.md, "Signed out, and kept in the browser"): the page needs no account; the loop is kept in the browser (IndexedDB) for everyone, written after every change and restored when the looper opens, with "back from last time" on the screen; saving a take still needs an account, which the Save menu says with a sign-in link. The Tools menu and the footer list the looper for everyone.
- **The looper and the piano are indexable**: both on the sitemap, in `isIndexablePath`, robots.txt and the X-Robots-Tag rule, the looper with a title and description like the drum machine page's; the piano had been on the sitemap alone.

## [0.75.0] - 2026-10-02

### Added

- **Page copy edited in the app** (docs/page-copy.md): a page's title, intro and the tips under its device are a user doc of kind "copy", edited by a system admin at `/docs/<slug>/edit` as the releases page is, rendered by `PageCopyHeader` and `PageCopySection` with `pageCopy()` and `splitPageCopy`; the looper page is the first (`looper-page`, seeded by `bun run db:seed-docs`), with a "How to use the Looper" box and quick tips under the device.
- **Looper: Stereo or Multitrack take** in the Save menu, multitrack (the layers as the take's sources) by default.

### Changed

- **Looper: skinned as a device** like the drum machine and the piano (docs/looper.md): the chassis, a screen with the loop's position, status and progress, labelled button groups, and the "SS Loop 001" badge, the page header as the other instrument pages', and the settings in three menus on the device, Timing (tempo with Tap, bars, beats, count-in, click), Mic (monitor, latency and Calibrate, the output latency and the piano shift) and Save (title, passes, Save as take); the layout by container queries. Choosing Piano or Drums as the source opens that instrument's panel.

## [0.74.0] - 2026-10-02

### Added

- **Looper** at `/looper` (docs/looper.md, phase 1): a loop of 1 to 8 bars at a tempo plays round and round while layers are recorded onto it one pass at a time from the microphone, the piano or the drum machine; layers have level, mute, solo and delete, with undo and clear; a count-in and a click; microphone latency compensation with a Calibrate measurement; **Save as take** renders the layers' mix and files it in the Idea Recorder as a take with each layer as a source, ready to go to a song as stems. One AudioContext hosts the instruments (`hostContext`, `output`, `startAt` on the engines), capture is an AudioWorklet (`static/worklets/loop-capture.js`) that copies exactly one loop length per pass from the loop's bar 1, layers are 24-bit WAV (`encodeWav24`), and `findLatency` measures the clicks; piano layers played by hand are shifted earlier by the device's reported output latency, the microphone's by the measured round trip. Tools menu, footer, smoke row and user doc.

## [0.73.0] - 2026-10-01

### Added

- **Idea Recorder: multitrack takes** (docs/demo-recording.md, "Multitrack takes"). With an instrument in the take, the recorder offers **Stereo** (the default on every visit) or **Multitrack**: beside the mix, the microphone and each instrument are recorded to a file of their own (a MediaRecorder per source started in the same tick as the mix's, the same format), uploaded after the take as its sources (`recording_stem` table, migration 0064; `POST /api/recordings/[id]/stems` to reserve, `/api/recording-stems/[id]/ready`; kept in IndexedDB with the take, so a retry after a failed source does not save the take twice). The take lists with its source count, and **Add N stems to song…** in its menu (and the recorder's ⋯ menu) copies the sources onto a song in any account the user edits as stems with their labels (`addRecordingStemsToSong`, `copyRecordingStemsToSong`), the song's playback renditions following in the jobs function. Sources count against the account's storage and go with the take when it or its idea is deleted.

### Changed

- **The Idea Recorder is the user's own page at `/ideas/recorder`** (docs/demo-recording.md). Ideas belong to the user, whichever account they were recorded in, and list together; the old `/[account]/ideas/recorder` and `/[account]/ideas` redirect, `?song=` kept. New takes are filed under the current account (the one neutral pages treat as the user's), where their storage counts, and a take can go to a song in any account the user edits (the song picker labels projects with the account's name when there is more than one). Ownership checks (`ownIdea`, `ownTake`, the take reservation, ready and upload-token routes) go by the user who recorded, not membership. `listUserIdeas`, `deleteEmptyIdeas(userId)`; `copyRecordingToSong` and `mergeIdeaNotesIntoSong` file the demo and the notes under the song's account.

- **Idea Recorder: instrument settings are saved by takes, not by every change.** A recorded take carries the drum machine's project and the piano's sound and effects to its idea (saved once the take lands, on the idea it went to), each unless the new **Settings with the idea** switch beside "in the take" is off; the server merges an instrument at a time. An idea is no longer stamped with the current settings the moment it is shown, which had made switching among older ideas look like nothing changed (Kevin). `SavedTake` carries `ideaId` and the take's `instruments`; the unused `stableStringify` util is gone.

## [0.72.0] - 2026-10-01

### Added

- **Idea Recorder: the instruments travel with the idea** (docs/demo-recording.md, "The instruments travel with the idea"). The drum machine's project and the piano's sound and effects are saved on the idea as they change (`idea.instruments`, JSON, migration 0063; `saveIdeaInstruments`, debounced a second) and put back into the instruments when one of the idea's takes is shown; an idea without any leaves the instruments as they are. The piano's panel gets the site's and the account's presets, so its preset buttons show there (Kevin: they were missing from the panel at every size).

### Changed

- **Idea Recorder: the drums and the piano join the take whenever their "in the take" switch is on**, their panels open or not, so an instrument started after Record still lands; an idle instrument contributes silence at no cost to the recording.
- **Idea Recorder: a meter per instrument.** The piano and the drums each get their own level meter above the microphone's while they play into the take, with their icons, in place of one combined meter under a piano icon (Kevin: "I don't see an input level indicator for the drums"), and the microphone's meter then reads the microphone alone rather than the whole mix. `DemoRecorder`'s `instruments` now returns `{ label, icon, stream }` per instrument.

## [0.71.0] - 2026-10-01

### Added

- **Idea Recorder: the drum machine in a floating panel** (docs/demo-recording.md, "The drum machine panel"). On a desktop, the toolbar's drum button opens and closes the full drum machine in a panel dragged by its header and resized by its corner, its place remembered (below the large breakpoint the compact play/stop/tempo control stays). The space bar goes to the instrument touched last, the drums (play and stop) or the piano (sustain), and toolbar buttons blur after a click so a focused one never swallows it. A second meter above the microphone's shows the instruments' level while any play into the take. A click or focus inside any panel brings it to the front. The recorder device lays itself out by its own width (container queries), so it fits its panel or column. **The recorder and the recordings list can pop out** of their column into a panel and dock back (a button in the header), so the whole screen can be arranged; a docked panel goes back to its original size, and the drag grip shows only on a floating one. **The metronome, the tuner and the notes get panels too**: on a desktop the metronome button opens the full metronome in a panel (the compact control stays below the large breakpoint), the tuner opens from its button into a panel in place of its popover, and the notes pop out of their column into one (a button in their header; the same button docks them back). **The piano gets the same panel** on a desktop, "Piano in the take" in its header, and the microphone has a mute button beside its meter (on by default, back on with every visit) in place of the piano's "Microphone in the take"; below the large breakpoint the panel docks under the recorder, one instance either way. **The drums go into the take** while they play, as the piano does (the engine's capture stream joins the recorder's mix, asked at Record so a beat started later still lands), and **Drums in the take** switches them out so a beat can be a click track that stays out of the recording.

## [0.70.0] - 2026-10-01

### Added

- **Idea Recorder: a waveform on the screen** (docs/demo-recording.md, "Waveform"). While recording, a strip scrolls as the take grows, one bar per frame of the input's level; once a take is in, the whole take's waveform with a playhead, clicked or dragged to seek, arrow keys to nudge. The take is decoded once in the browser (its own recording, or the MP3 made for playback); a file the browser cannot decode keeps the centre line and the slider still seeks. Both views scale to their loudest moment with a curve that lifts quiet detail, as a phone's voice memos do, so a quiet take still looks like it captured something.

## [0.69.0] - 2026-10-01

### Changed

- **Each drum sits where it usually does** (Kevin): hats and ride a little right, the floor tom and crash left, kick, snare and clap centred, from the audience's side. Preset rows that name no pan, generated rows, Text-to-Beat rows (unless the model pans one itself; the prompt offers it) and rows added by hand or by a MIDI pad take it. The starting beat and the tutorial kit stay centred.
- **The generator's hip-hop style and the boom bap preset arrive on the electronic kit** (Kevin: it just sounds better), as house and half-time do, and **every style brings its tempo** (rock 120, hip-hop 90, house 124, breakbeat 138): a generated replacement takes it, a pattern added after yours keeps yours.
- **"Use as the home page beat" on the drum machine page too** (system admins; Kevin asked where it was): the ⋯ menu item that makes the beat in the machine the home page's starting one was only on the home page's own demo.

## [0.68.0] - 2026-10-01

### Added

- **Piano and drum machine: a Tone section** (docs/effects.md, "Tone"). One shared stage on the master of both: Tilt (a low shelf and a high shelf moving opposite ways, dark to bright), Air (an exciter after the Aural Exciter: harmonics made above 3 kHz and mixed back, sparkle a dull sound never had) and Bottom (after the intent of the same unit's Big Bottom: the band under 100 Hz boosted and gently warmed in place, bass that feels bigger with the mids untouched; the fundamental up 5.3 dB at full, measured, after four designs that cancelled themselves or read as grit). In the piano's preferences and presets (`tone`) and the beat's effects (`toneTilt`, `toneAir`, `toneBottom`; share links at format version 9, older links open flat). The hip-hop and dance presets and generator styles bring Bottom, disco, pop and funk a touch of Air, and Text-to-Beat knows all three.

## [0.67.0] - 2026-10-01

### Added

- **Drum machine: a master volume** (docs/drum-machine.md, "Master volume"): a Volume slider beside Humanize (in the tempo menu on a phone), a listening choice remembered per browser and not part of the beat, the link or the WAV.

### Changed

- **Drum machine: presets, generated beats and Text-to-Beat choose their kit** (Kevin): every preset names one (trap, house, techno and drum and bass on the electronic kit, the rest acoustic), each generator style names one (house and half-time electronic; the fill keeps the kit in use), and the model picks acoustic or electronic from the description. Only those two for now; the Room kit waits on an identity Kevin is happy with.

## [0.66.0] - 2026-10-01

### Changed

- **Drum machine: generated and AI-generated beats reset or apply swing and humanize** as presets do (Kevin). Each generator style names its feel (funk and hip-hop swing, house barely humanizes) and Text-to-Beat's reply may name a humanize amount beside its swing; a replacement resets swing to straight and humanize to the usual amount before applying what came with the pattern, and adding a pattern applies only what came with it.
- **Drum machine: every preset arrives with its own effects** (Kevin): a room on the rock and pop beats, tempo-locked echoes on house, techno and trap, tape-style delay on motown, boom bap, the shuffle and the one drop, more room on the ballads and waltz, a little fuzz on boom bap. Loading a preset resets the effects to its own; adding one as a pattern leaves yours alone. A test holds every preset to a room or an echo within tasteful levels.

## [0.65.1] - 2026-10-01

### Fixed

- **Account settings said sign-up was invitation-only** even with sign-up open (Kevin). The Invite codes section, and the admin's new-account codes page, now word themselves by the sign-up mode: with sign-up open, a code is what joins the newcomer to the account.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

## [0.65.0] - 2026-10-01

### Added

- **Piano: a metronome** (docs/piano.md, "Metronome"). The page's metronome behind a metronome-icon button in the More strip (lit while it runs) that opens a small menu: start or stop (the icon swells on the downbeat), a tempo field, Tap and the beat, with the tempo and the beat on the screen while it runs; in the compact layout a section of the device menu. The piano page only; the recorder keeps its toolbar metronome.

- **Drum machine: effects in the tutorial, the generator and Text-to-Beat.** The tutorial gains "Put the kit in a room" and "An echo between the beats" after Humanize, with Do it for me and the Effects button outlined; starting it resets every effect level and send (the test holds the tutorial project to the defaults). Each generator style brings its own effects (a room on rock, a dotted-eighth delay on house) and a generated beat resets to those. Text-to-Beat's reply may carry effects when the description asks ("with a big room", "a dub-style delay", "fuzzed up"), and a beat without any arrives dry.

### Changed

- **Drum machine: wah gain compensation.** The wet is lifted by 3.5 dB at full mix, scaled with the mix (Kevin: more wah read as less volume; the starting beat measured 3 dB quieter fully wet).
- **Drum machine: the foot's buttons in two rows until the device is wide.** On a phone the Text-to-Beat, Generate, Presets and Play buttons stack full width as before; from the small container breakpoint they are a wrapping row of same-size, natural-width buttons under the Row, Clear, Undo, Effects, MIDI and ⋯ row (Kevin: the two groups got messy sharing a row in between); from the large breakpoint the two groups share one row. Between the small and large breakpoints Play sits at the right end of its row, where the eye looks for it.
- **Drum machine: layout by container, not viewport** (docs/drum-machine.md, "Layout by container"), as the piano's: every breakpoint class in the full view is a container query (`@xl-`, `@2xl-`, `@4xl-` for `sm-`, `md-`, `lg-`; the device root is the `@container`), so it can open in a popover or a panel and lay itself out by the room it has.
- **Links to the user docs** at the foot of the piano and drum machine pages ("Learn more about using the piano in the user docs", a button to /docs/piano; the same for the drum machine), and a "Free standalone version" link from the home page's drum machine demo to /drum-machine, as the piano demo has.
- **Drum machine: the usual sends roughly double or triple.** Reverb: kick 5% to 30%, snare 40% to 80%, clap 45% to 90%, hats 30% and 50%, toms and ride 60%, crash 70%, rim and cowbell 40% and 30%. Delay: kick 0% to 15%, snare 15% to 45%, hats 30% and 40%, clap 50%, rim 80%, toms, ride and crash 30%, cowbell 70%. Kevin: a master at 100% with the per-drum defaults should sound like too much, not a tasteful amount, so the useful range is the middle of the slider; at 5% the kick needed the master reverb pushed a long way before it changed. New beats, added rows, Reset to defaults and links from before the sends existed use them; saved beats keep their own.
- **Piano: layout by container, not viewport** (docs/piano.md, "Layout by container"). Every breakpoint class in the piano is a container query (`@xl-`, `@2xl-`, `@4xl-` for the old `sm-`, `md-`, `lg-`; the root is the `@container`), so the piano lays itself out by the width it is given and can sit in a popover or a panel; the save popover asks which manage button the container shows instead of `matchMedia`. Two of Kevin's classes that were never valid became `@4xl-w-32px` and `!@4xl-text-slate-400`.
- **Piano: the compact device menu in sections.** Below the wide layout the menu is an accordion of Metronome, Presets, Volume (open to start), Effects and More, one open at a time, so it stays short.

## [0.64.0] - 2026-10-01

### Added

- **Drum machine: a wah** (docs/drum-machine.md, "Wah"). The piano's wah stage on the drum bus after the fuzz, now shared in `src/lib/audio/fxStages.ts`: a filter sweep timed to the beat (one cycle per beat, two beats, one, two or four bars) with range, resonance (capped at 10 dB on drums) and level, in a third column of the Effects menu. Part of the beat: saved, in the link (format version 8; older links open with it off) and in the WAV; Reset to defaults covers it.

## [0.63.0] - 2026-10-01

### Added

- **Piano: a wah** (docs/piano.md, "Effects"; docs/effects.md). A Wah section in the Effects menu between the fuzz and the chorus: a resonant low-pass whose cutoff an envelope follower opens with how hard you play (Touch, with a sensitivity slider), or an LFO sweeps (Sweep, with a rate), with range and resonance (the low-pass's Q, in decibels, 0 to 15) and a mix. A MIDI mod wheel, expression pedal or foot controller (CC 1, 11, 4) rides the wah while it sends. Off by default, remembered, and part of a preset.

## [0.62.0] - 2026-10-01

### Added

- **Piano: presets** (docs/piano.md, "Presets"). Five numbered buttons under a Presets label hold named presets of the sound and every effect; the screen names the one the sound sits on, "edited" once a slider moves. Click loads; ⌘-click, Ctrl-click or a hold opens a save popover for that slot; a bookmark button opens the full list with search, rename, slot assignment, delete and share links. Three layers: the site's defaults, which a system admin saves from the piano ("Save as site default"; one app setting), a signed-out player's own slots in the browser, and a signed-in member's presets in the account (`piano_preset`, migration 0062; up to 100; at most one per slot; editors save, viewers load). A link, `/piano#preset=…`, opens the piano with a preset for anyone, nothing kept until they save. The home page demo shows the site's presets.

### Fixed

- **Menus opened by code lost their place.** A ContextMenu opened through `bind:openState` called `showPopover()` directly, which gives CSS anchor positioning no anchor, so the menu landed in the viewport's corner; it now opens through its own trigger. The piano's and drum machine's effects menus and the presets menu are capped to the space beside their button (`max-h: calc(100% - 0.5rem)` in the anchor's grid area) and scroll, instead of running past the bottom of a short window.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

## [0.61.0] - 2026-09-30

### Added

- **Drum machine: MIDI input** (docs/drum-machine.md, "MIDI input"). A MIDI menu beside Effects (where Web MIDI exists) connects a pad or keyboard: General MIDI drum notes play their voices, any other note plays the open pattern's rows in order, each hit through the row's level, pan and sends. With **Record hits into the grid** on, a hit while the beat plays lands at the nearest step as a ghost, normal or accent by velocity, adding a row for a drum the pattern lacks; off by default. The one-hit player is the step player's, factored out (`playDrumHit`).
- **Drum machine: analog delay and fuzz.** The Effects menu gains the delay's Digital/Analog choice and a fuzz (drive and tone) on the dry drums, the sends staying clean; both from the stages the piano and the drum bus now share (`src/lib/audio/fxStages.ts`). Part of the beat: saved, in the link (format version 7; older links open with them off) and in the WAV. Reset to defaults covers them.
- **Piano: a flanger**, in the phaser's place: a Phaser/Flanger switch heads the section and the mix, rate and depth sliders serve whichever is chosen (Kevin: one or the other, to save menu space). Remembered as `phaser.mode`.

## [0.60.1] - 2026-09-30

### Changed

- **Piano page copy** (Kevin): the "How to Play" section gains an introduction and sub-headings (The Basics; Instruments, Octaves & Effects; Playing on the Computer Keyboard; MIDI), names the letters toggle, and points at the MIDI button by its icon. Review fixes: grammar, MIDI casing, the inline icon hidden from screen readers.

## [0.60.0] - 2026-09-30

### Added

- **Piano: fuzz, phaser and rotary speaker** (docs/piano.md, "Effects"). Three more sections in the Effects menu: a fuzz (drive into a soft clipper with a tone control after, its make-up holding the loudness where the clean sound sits), a phaser (four swept all-pass stages, mix crossfading to half and half where the notches are deepest) and a rotary speaker (the sound split into a horn and a drum spun through Doppler, level and pan, Off/Slow/Fast with the rotors gliding between speeds). Off by default and remembered; the menu takes three columns from lg.

### Fixed

- **Web MIDI was blocked by our own Permissions-Policy header** (`midi=()`), so Connect MIDI failed on the deployed site while it worked on the dev server (a user report); the header constant and vercel.json now allow `midi=(self)`, and vercel.json's copy matches the constant again (it had fallen behind on `microphone` and `screen-wake-lock`).
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
- **Piano: the tremolo's Chop shape crunched** on a sustained note: the square LFO stepped the level instantly. It now passes an 80 Hz low-pass so each edge takes about 5 ms, still a chop, without the click.

## [0.59.0] - 2026-09-30

### Added

- **Piano: analog delay, chorus and tremolo** (docs/piano.md, "Effects"). The Effects menu gains a Digital/Analog choice for the delay (Analog puts a soft clip and a darker low-pass in the feedback loop and a slow wobble on the time, so repeats darken and soften like tape), a chorus (mix, rate, depth: two swept delay lines panned apart) and a tremolo (depth, rate, Smooth or Chop). The chain now lives in `src/lib/audio/pianoFx.ts`, plain Web Audio that an OfflineAudioContext renders the same, with `update` ramping every level so sliders never click. The menu lays out in two columns from sm and scrolls when the window is short; the button lights while any effect is up; every new setting is off by default and remembered.

## [0.58.0] - 2026-09-30

### Added

- **Piano: an Effects menu with a delay** (docs/piano.md, "Effects"). An Effects button in the controls row, as the drum machine's, holds the reverb level (moved out of the row) and its room size (the impulse is synthesized again as the slider moves) and a new delay with its time (50 ms to 1 s), feedback and level; the button lights while either is up. The delay is the drum bus's shape in the piano's graph, ramped so sliders do not click, and the settings are remembered. On a phone the sliders sit in the levels menu.
- **Piano: Kevin's layout pass.** The controls in one row that grows with the width (a compact icon strip for pedal, MIDI, hi-res, key guides and letters from lg up; a single menu holding volume, effects, hi-res and MIDI below it), the key guides in their own menu with a "Turn Off All Guides" button, the page heading hidden on a phone, the key marks in blue with the root in purple, the octave name at the top of each C key. Review fixes: labels that were not labels became spans, turning the guides off saves like any other change, the connected MIDI button's words hide at lg like its other state, and the device group-label shortcut keeps its dark text (the drum machine's labels had gone light).
- **Piano: a small toggle for the key letters.** A keyboard-icon button beside the octave control hides or shows the computer-key letters printed on the keys (`labels` in the preferences, on by default); degrees still show when chosen.

## [0.57.0] - 2026-09-30

### Added

- **Piano: a key and a chord readout** (docs/piano.md, "Key and chords"). A Key group chooses a root and a scale (nine of them); the keys in it carry a mark, the root a yellow one, the rest go a shade darker, and 1–7 numbers them by degree. The screen names what is held: a note, an interval, or the chord with inversions as slash chords, and in a key its Roman numeral. `scales.ts`, `scaleDegrees.ts`, `chordName.ts` (tested); remembered in the preferences.

### Fixed

- **Piano key labels line up.** The octave name on the C keys pushed their letters up; every white key now has two fixed rows, the name above and the letter below.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

## [0.56.1] - 2026-09-30

### Added

- **Hi-res piano samples for browsers without FLAC** (docs/piano.md). The piano decodes a tiny FLAC probe once at load; where the browser cannot, the Hi-res button fetches the same six layers and release samples as the best mp3 instead (`piano/v1/hires-mp3/`, 55 MB, the encode script's fourth tier; upload it per stage with `bun run samples:piano -- --upload --tier hires-mp3`), and says so in its size and title. `pianoTierFiles` takes the choice (tested).

## [0.56.0] - 2026-09-30

### Added

- **The piano records into the Idea Recorder** (docs/piano.md, Phase 2; docs/demo-recording.md). A piano button beside the drums in the recorder's toolbar (the wrench menu on a phone) opens the full piano under the recorder, and its sound goes into the take, mixed with the microphone, or alone with "Microphone in the take" unticked. `piano.captureStream()` (a MediaStreamAudioDestinationNode on the piano's master) feeds `DemoRecorder`'s new `instrument` prop, mixed in its metering context into the stream the MediaRecorder records; the meter reads the mix. The recorder page's load passes the sample tiers' base so the Grand Piano fills in there too.

## [0.55.1] - 2026-09-30

### Fixed

- **The piano's Hi-res button hid behind another sound.** It only showed while the Grand Piano was chosen, so a browser remembering the Organ had no button. It shows whatever the sound now, and pressing it with another sound chosen switches to the Grand Piano and starts the download. And the tiers decode through an offline context until the piano is on, so a remembered Hi-res choice no longer waits at 0% for the switch.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

## [0.55.0] - 2026-09-30

### Added

- **The Grand Piano in three sample tiers** (docs/piano.md, "Sample tiers"; Kevin's ask): the first subset was a 39 kbps mp3 and sounded thin. `scripts/piano-samples.ts` (`bun run samples:piano`, with `--download` and `--upload`) now makes, from the Salamander's lossless recordings: a demo tier (one layer, mp3 VBR q2, 10 s, 3.4 MB in `static/kits/piano`, what the home page plays and the piano page's first sound), a standard tier (four velocity layers and the 88 release samples, mp3, 14.5 MB) and a hi-res tier (six layers and the releases as 16-bit FLAC, 72 MB), the last two in each stage's public Blob store under `piano/v1/` (production uploads from Kevin's machine). The piano page loads the standard tier in the background, middle octaves first; a **Hi-res** button fetches the lossless tier once through the browser's cache and the choice is remembered. Notes crossfade between the two layers around their velocity (`src/lib/utils/pianoLayers.ts`, tested), release samples play on key-up (about 40 dB under the note at most and high-passed, a whisper on a tap, quieter the longer it rang; the first levels were a clunk), and the velocity filter only closes for a light touch now. The screen names the tier and its progress.
- **The piano's Grand Piano** (docs/piano.md, Phase 2): a sampled concert grand, first in the sound list and the default. Thirty notes of the Salamander Grand Piano (Alexander Holm, CC BY 3.0) in the mp3 subset Tone.js publishes, one every three semitones, two megabytes in `static/kits/piano/`, fetched at the piano page's load (the home page's demo fetches on its first touch) and decoded once there is a context (`src/lib/audio/pianoSamples.ts`); a note plays the nearest sample pitched by its playback rate, through a low-pass that closes for a soft touch, damped on release. The screen says "loading the piano…" until the samples are ready, and the Electric Piano stands in meanwhile. Credited on /built-with and in the piano's doc.
- **A piano demo on the home page**, full width under the drum machine, with a "Free standalone version" link to /piano beside the call-out; the piano's demo samples and the drum kit are fetched as their sections scroll into view, never at load; the computer keyboard goes to whichever demo is in view, now the piano too.
- **An Instruments menu** in the nav, between Projects and Tools, with the drum machine and the piano; the Tools menu keeps the Idea Recorder, the tuner and the metronome. The footer has an Instruments row above the Tools row. On a phone the nav's menus sit closer together and the account button shows its icon alone, like the other two.

## [0.54.1] - 2026-09-30

### Fixed

- **Piano on iOS: notes came late, together.** The AudioContext opened on the first note and the note was scheduled at its time before it had resumed, so on iOS (which starts contexts suspended and resumes them slowly) every note pressed in that moment sat at time zero and sounded a second or two later, all at once. The piano now warms the context on the first touch or key (`piano.warm`) and, when the context is not yet running, starts a note only once it is (skipping it if the key was let go meanwhile); the context asks for interactive latency. And a **power switch** (Kevin's ask, as the tuner has): full width under the screen on a phone, in the controls row on a desktop; On warms the audio ahead of the first note so it is not late either, Off silences and suspends it; the screen says "off" or "starting…" and dims until then (as the tuner's). The wake is watched by polling the context's state rather than the promise from `resume()`, which on iOS never settled and left the switch on "Starting…"; a silent buffer plays as the old iOS unlock, and the switch gives up after three seconds. On a phone the keys carry no computer-key letters.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

## [0.54.0] - 2026-09-29

### Added

- **A piano and synth** at `/piano` (docs/piano.md, Phase 1), in the Tools menu and the footer. Five synthesized sounds (`src/lib/audio/synthVoice.ts`: Electric Piano, Organ, Synth Lead, Pad, Pluck), played from the on-screen keys (three octaves, two on a phone where they stand on end down the screen; multi-touch; a slide across the keys; lower on a key is louder), the computer keyboard (the two-row mapping by physical key, arrows for the octave, space for the pedal, escape for silence) or a MIDI controller (`Connect MIDI`, Web MIDI on Chrome and Edge: velocity, the sustain pedal, all-notes-off). A sustain pedal with proper bookkeeping (`HeldNotes`, tested), twenty-four voices with the oldest stolen, a small reverb, volume, and the choices remembered per browser. On a phone the volume, reverb and MIDI controls sit in a menu beside a compact octave control, and the Sustain button is not shown. The engine is `src/lib/audio/piano.svelte.ts`; the user doc is `scripts/user-docs/piano.md` (seed it with `bun run db:seed-docs`).

## [0.53.0] - 2026-09-29

### Added

- **Songs can be reordered on the project page**, like stems in the player: a member drags a song by the grip before it, or focuses the grip and presses the arrow keys, within its list (Finished, In Progress or Ideas); one order runs across the three lists (`reorderWithinGroup`), so the others never shift. Saved to `song.sort_order` (`reorderSongs` in projects.remote.ts, editors only), and the playlist follows. A new song now takes the last place (`createSong` sets `sortOrder` to max + 1) instead of slotting in by title. The stem player's drag shares the helpers (`dropIndexAt`, `moveId`, tested).

## [0.52.0] - 2026-09-29

### Added

- **Stems can be reordered in the player** (a user's request). A member drags a row by the grip before its name, or focuses the grip and presses the arrow keys; the rows follow live and the order is saved to the song (`stem.sort_order`, `reorderStems` in songs.remote.ts, editors only), so everyone sees it and the downloads and the zip follow. Pointer events, so it works by touch. `StemPlayer` takes `onreorder` and draws the grips when it is given; `StemEngine.reorder` (through `reorderById`, tested) also follows a refreshed manifest's order.

## [0.51.1] - 2026-09-29

### Changed

- **Home page: the tuner is back to manual On / Off.** Opening the microphone as the tuner scrolled into view (v0.50.0) made the browser ask for permission again and again as the page went up and down; `Tuner`'s `startOnView` is gone.

### Fixed

- **/releases showed nothing newer than v0.48.0.** `parseChangelog` only knew `## [x.y.z] - date` headings, and the last three sections were written as `## x.y.z — date`; it now takes both spellings (and a hyphen or an em dash), with a test.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

## [0.51.0] - 2026-09-28

### Added

- **Drum machine: a pattern generator** (docs/drum-machine.md, "Pattern generator"). A Generate menu beside Presets draws a pattern from a style (rock, pop, funk, hip-hop, house, breakbeat, latin, half-time, fill) at a density: the style's backbone is always there and the density decides how many of its maybes come out. The draw fits the open pattern's meter and length and keeps its rows' settings; a drum the style needs is added, one it does not play is left silent; Undo brings the pattern back, and "Add as a pattern" puts the draw after the open one. `src/lib/constants/drumGenerator.ts` (the styles, in the presets' row-string spirit), `src/lib/utils/generateDrumPattern.ts` (pure, seeded through `seededRandom`, tested for every style, meter and length), `drumMachine.generate`. The usual level per voice moved to `DRUM_USUAL_LEVEL` in the constants, shared with the presets.
- **Drum machine: Text-to-Beat, a prototype** (docs/drum-machine.md, "Text-to-Beat"). A menu beside Generate, shown when the AI Gateway is configured, takes a description of the beat you want and asks a language model for it: the answer fits the open pattern's meter and length, brings a tempo and swing when the model suggests them, lands in the open pattern (Undo as for a preset) or as a new one, and the menu shows a loading state while it waits and the model's note after. `src/lib/server/textToBeat.ts` over the AI Gateway's REST endpoint with reasoning off (a thinking model takes minutes over a beat and does no better; with it off Kimi answers in about four seconds), the model from the new `TEXT_TO_BEAT_MODEL` (default `moonshotai/kimi-k2.6`, open-weight; swap it to compare), the reply in the presets' row-string form validated by `parseTextToBeatReply` (tested) with one retry on a bad answer, every call logged in `ai_request`, 20 an hour per user or address (`textToBeat.remote.ts`). `drumMachine.placePattern` is the shared way a pattern from the generator or the model lands with undo.
- **Home page: the drum machine demo fills its column** (the 860 px cap is gone).
- **Drum machine: a timeline, built but hidden** (docs/drum-machine.md, "Timeline"): the row carries a `hidden` class while Kevin refines its design, everything behind it stays, and the user doc's Timeline section waits in docs/drum-machine.md. A row under the patterns arranges them into a song: bars, each a pattern, added from the open pattern, removed one by one or cleared, moved with shift + arrows; Pattern / Song buttons choose whether Play loops the open pattern or plays the bars in order. The song plays from the same scheduler (the bar's pattern chosen at the top of each cycle; a bar pressed while playing takes over at the end of the cycle; the sounding bar lights and the readout counts them). Song mode is engine state (`songMode`, on when a project with a timeline loads, off when the timeline empties); the timeline is project state (`timeline`, up to 64 pattern indices, `MAX_DRUM_TIMELINE`), so saved beats and share links carry it (links move to version 6; `DrumRowSchema` and older links unaffected). Downloads and "Add to … as a demo" follow the mode: `renderDrumSongWav` renders the bars once through with a two-second tail, `encodeDrumMidi` takes a sequence of bars and writes the time signature where it changes. Removing a pattern drops its bars and renumbers the rest. The recorder's compact picker offers "Song" beside the patterns.

## [0.50.0] - 2026-09-28

### Added

- **Drum machine: Reset to defaults** in the Effects menu: master levels back to zero, every drum in every pattern back to its usual sends (`drumMachine.resetFx`).
- **Home page: the demo's starting beat is chosen in the demo.** A system admin builds or loads a beat in the home page's drum machine and picks "Use as the home page beat" from its ⋯ menu (`setHomeBeat`, the `homeBeat` app setting, JSON of the project); a first-time visitor's machine opens with it (`DrumMachine`'s `starting` prop, `drumMachine.load(warm, starting)`), a browser that remembers a beat keeps its own, and a share link still wins. /admin/home shows the chosen beat with a way back to the built-in one (`clearHomeBeat`).
- **Home page: a metronome demo** beside the tuner. The Songwriting Tools section shows one of the two at a time, chosen by a pair of tabs (the tuner first and open by default); the copy names both. The tuner opens the microphone as half of it scrolls into view and closes it when it scrolls right out (`Tuner`'s `startOnView`, on the same `visibleShare` attachment); once the visitor turns it off, it stays off. Its On / Off button now carries `aria-pressed`.
- **One transport at a time** (`src/lib/audio/onlyOnePlays.ts`): the stem player, the drum machine and the metronome claim playback as they start, which stops whichever of the others was playing, so a visitor who presses play on the home page's player and scrolls to the drums does not hear both. The drums and the metronome already traded places; this brings the stem player in.

### Changed

- **Drum machine: beats and links from before the effects get the default sends.** A row stored without sends (a beat saved, or a link made, before 0.49.0) used to come back sending nothing, so raising a master level did nothing until every send was set by hand; it now gets its voice's usual sends (`DrumRowSchema` fills them in on read, `upgradeDrumProject` for version 1, the share-link decoder leaves it to the schema), the same as a new beat. Saved beats keep the effects they were saved with: the delay and reverb settings and the sends are part of the project.
- **Drum machine: a sounding cell stays lit under the pointer** (the accent at 85%, so the hover still reads); the device button's hover colour is for the empty cells only.
- **Home page: the space bar follows the scroll.** Space used to drive the stem player from anywhere on the page and never the drum machine. Now it goes to whichever of the two demos is in view (`src/lib/utils/visibleShare.ts`, an IntersectionObserver attachment; a demo counts once half of it, or half a screen of it, shows; the one showing more wins) and to neither when both are scrolled away, so space scrolls the page there. `Transport`, `StemPlayer` and `SongPlayerDemo` take a `keyboard` prop for it, like `DrumMachine` already did.

## [0.49.0] - 2026-09-28

### Added

- **Delay and reverb** in the drum machine (docs/drum-machine.md). A mixer bus (`src/lib/audio/drumBus.ts`): each row's panner feeds the dry input and, by two sends per row, a delay bus (a DelayNode with feedback and a low-pass in the loop, timed in sixteenths so it follows the tempo) and a reverb bus (a ConvolverNode over an impulse synthesized at load, no file). Per project the delay's time, feedback and return and the reverb's size and return, the returns being the master effect levels; per row a delay send and a reverb send in the row's mix menu (now at every width). An Effects menu at the foot of the device holds the master controls, at every width; its button lights in the accent colour while either master level is above zero. Defaults (Kevin's call): both master levels at zero and every drum sending a little (`DEFAULT_DRUM_SENDS`: snares and claps wet, kicks dry, rims into the delay), so the first master level someone raises is heard at once; a dotted-eighth delay, a medium room. The House, Reggae one drop and 6/8 ballad presets set sends of their own. Share links move to version 5 (older links and stored projects get the defaults); the offline render shares the bus, so WAV downloads carry the effects; MIDI is unaffected.

## [0.48.0] - 2026-09-28

### Added

- **Beats for a song** (docs/drum-machine.md, Phase 3). A song page's Uploads menu has Drum Machine: `/drum-machine?song=<id>` seeds a fresh beat at the song's tempo and meter (`songForBeat` reads the changes at 0; the previous beat stays behind Undo), Save attaches it (`beat.song_id`; the ⋯ menu lists it with the song's name), and "Add to … as a demo" renders the open pattern to WAV and sends it through the demo upload path, so it lands in the song's demo recordings with an MP3 rendition like any demo.
- **A pattern picker in the Idea Recorder.** When the beat has more than one pattern, the drums' compact view (the toolbar, the phone's wrench menu) offers a Pattern picker beside the tempo; while playing, the change waits for the end of the cycle.

### Changed

- ContextMenu has a `heading` item kind (the presets menu's styles) and popovers are capped at 400 px, scrolling inside (Kevin).

## [0.47.0] - 2026-09-28

### Changed

- **Humanize starts at 14 %** for a new project and for presets that set none (`DEFAULT_HUMANIZE`), so a beat does not sound like a machine out of the box (Kevin's call).
- **Swing has a grid: 1/16 or 1/8.** A toggle beside the Swing slider (and in the phone's tempo menu). 1/16 moves every second sixteenth, as before and as an MPC does; 1/8 moves the off-beat eighths, so swing is audible on a beat with nothing on the sixteenths, which is most rock. Per project (`swingGrid`), in share links from version 4 (older links and stored projects are 1/16), in the MIDI file too; the Shuffle preset is on 1/8. Swing is one rule (`drumSwingDelay.ts`) shared by the engine, the WAV render and the MIDI file, with unit tests, and `bun run check:swing` renders patterns through the machine and measures the onsets on both grids to prove swing reaches the audio (docs/drum-machine.md).
- Drum machine layout: the transport under the grid controls on a phone, larger phone buttons, the device name at the foot (Kevin).

## [0.46.0] - 2026-09-28

### Changed

- **Drum machine layout and buttons** (Kevin): a labelled row for the kit, steps, meters and patterns; the tempo, swing and humanize sliders beside Tap Tempo; smaller device buttons (`device-button-xs` / `-sm` / `-drum-combo` and label shortcuts in `uno.config.ts`); a status pill in the readout; Play at the right of the foot; level and pan from lg up; a how-to section under the device. ComboBox takes `clearDefaultButtonClasses` so a device button style can be its whole look. Undo is always shown, dimmed when there is nothing to undo. On a phone: a second Play / Stop under the display, a menu beside Tap Tempo with the tempo, swing and humanize sliders, and a menu per row with its level and pan (below lg); the device is named SS Drumbo 001 beside Play.

## [0.45.0] - 2026-09-27

### Changed

- **The drum machine's foot is tidier.** Save, the saved beats, Copy link and the downloads live in one ⋯ menu beside Presets; a row's drum and the kit are chosen with the ComboBox rather than a native select and a row of buttons (Kevin's request). ComboBox options show a pointer cursor. The readout names the preset or saved beat the project still matches, says "edited" after a saved beat changes, and Custom otherwise (Kevin's idea). The device is named SS Drumbo 001 under its display, as the recorder and the tuner are.

## [0.44.0] - 2026-09-27

### Added

- **A drum machine tutorial.** "Tutorial: a rock beat from scratch" on /drum-machine swaps in an empty five-drum kit (the machine's Undo keeps the beat that was there) and opens a step panel that sticks to the bottom of the screen: thirteen steps from the kick on 1 and 3 to a second pattern with a fill, each highlighting the cells or control it points at, ticking when the grid has caught up, with Do it for me. Steps are data in `src/lib/constants/drumTutorial.ts` (tested end to end: no step is done before its change, every step after), state in `src/lib/state/drumTutorial.svelte.ts`, the panel `DrumTutorial.svelte`.

### Fixed

- **⌘-click on the Comments row starts a comment.** The row under the stems took only plain clicks (a seek); ⌘-click, Ctrl-click and right-click there now open the same menu as on a stem's waveform (Seek here, Comment here), headed "Mix" and the time. Reported by Kevin: users tried it first and it felt broken. `CommentTimeline` takes `oncontext`; the hint and the comments doc say the row counts.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

## [0.43.0] - 2026-09-27

### Added

- **A Room kit** for the drum machine: a second acoustic kit with longer, roomier hits, twelve more of Groovie's CC0 samples (`static/kits/room`, about 1.2 MB, fetched only when chosen). `SampledKit` takes its folder from the kit id, so a further sampled kit is a folder and a constant.
- **The samples are credited** in the Drum Machine user doc, on /built-with and, file by file, in docs/drum-machine.md.

- **Saved beats.** A signed-in member's drum machine has Save and a Beats menu: the project is kept in the account under a name (`beat` table, migration 0061, applied on production by Kevin; `beats.remote.ts` saveBeat / renameBeat / deleteBeat / listBeats; the page load lists the current account's beats), every member can load one, editors save, rename and delete. Deletes join `cascade.ts` (a song going leaves its beat; an account going takes them).

### Changed

- The drum machine's Presets, Beats and Download menus open upward, above their buttons at the foot of the device. ContextMenu popovers are `position: fixed` and carry `position-try-fallbacks: flip-block`, so a menu that has no room on its side of the button opens on the other side, and a long one scrolls within the room it has.
- The drum machine's icon is Kevin's drum-kit glyph (`IconDrumKit.svelte`) in the header's Tools menu, the recorder's toolbar and the compact toggle. The footer's second row is labelled More and reordered (Kevin).

## [0.42.0] - 2026-09-27

### Added

- **Drum machine presets.** A Presets menu of 22 beats by style (`src/lib/constants/drumPresets.ts`, rows written as strings of `.`, `o`, `x`, `X`; `drumPresetProject` builds the project and the test checks every one): rock, pop and funk, hip-hop and electronic, world, other meters, and two-pattern fills. A preset replaces the project (Undo beside the menu brings the beat back until the next edit) or, with shift, adds its patterns to the project.
- **3/4 and 6/8.** A meter per pattern (4/4, 3/4, 6/8) with 12 and 24 steps; 6/8 shades in sixes, a phone shows its bar as two lines of six, and the MIDI file carries the time signature. Share links move to version 3 (a meter and a wider steps field); versions 1 and 2 still open.

## [0.41.0] - 2026-09-26

### Added

- **Drum machine, Phase 2** (docs/drum-machine.md). **Patterns**: up to eight per project as tabs above the grid (new, copy, delete); while playing, the chosen pattern waits for the end of the cycle. **Velocity per cell**: hold, shift-click or right-click a sounding cell for accent or ghost. **Pan per row** (double-click for the centre) and **humanize** (a little scatter in time and level). **Download** the open pattern as a WAV (one seamless cycle rendered offline, `renderDrumPatternWav`) or a Standard MIDI File on General MIDI drum notes (`encodeDrumMidi`, tested against the app's own MIDI reader). **In the Idea Recorder**: a drums toggle beside the metronome (a Drums row in the phone's wrench menu, the stop button taking the wrench's place while it runs); the drums and the metronome never play together, starting one stops the other and takes its tempo. The share-link format is version 2 (a project of patterns, pan, humanize); version 1 links still open, and a version 1 project in localStorage is upgraded on read. The acoustic kit is fetched when the drum machine page opens, or on the first play elsewhere, so the recorder never downloads it unasked. A user doc at /docs/drum-machine and a Drums section in the Idea Recorder doc. `ContextMenu` takes a `label` for its trigger.

## [0.40.0] - 2026-09-26

### Added

- **A Tools menu in the header**, on every width and for everyone: the Idea Recorder (members), the tuner, the metronome and the drum machine. It replaces the header's Idea Recorder link; a phone shows the wrench alone. The tuning-fork glyph is `TuningForkIcon.svelte`, shared by the menu and the recorder.
- **A drum machine demo on the home page**, after the tuner demo (`DrumMachine` takes `keyboard={false}` there, so the space bar stays the stem player's).

### Changed

- The footer's links are two rows: the tools (the Idea Recorder for a member, the front-page demo for a visitor, tuner, metronome, drum machine), then everything else.

## [0.39.0] - 2026-09-26

### Added

- **A drum machine** at `/drum-machine` (footer link, indexable; docs/drum-machine.md, Phase 1). A step sequencer of up to 12 rows over 8, 16 or 32 sixteenths: tap or drag across cells, Play / Stop (space), 40 to 240 bpm with tap tempo, swing, level, mute and solo per row, an acoustic kit (Groovie's CC0 one-shots in `static/kits/acoustic`, credited on /built-with) and an electronic kit synthesized in the browser, a four-to-the-floor starting beat, the pattern remembered per browser, and Copy link, which puts the pattern in the URL (`encodeDrumPattern` / `decodeDrumPattern`, a versioned bit-packed base64url string; pinned links in the tests keep old links opening). On a phone a bar shows as two lines of eight. `DrumMachine.svelte` is a view of the engine in `src/lib/audio/drumMachine.svelte.ts`; `src/lib/audio/kits/` holds the kits behind one interface; `DrumPatternSchema` checks what localStorage and links carry.

### Changed

- The metronome and the drum machine share one lookahead scheduling loop (`src/lib/audio/lookahead.ts`).

## [0.38.0] - 2026-09-26

### Added

- **A metronome.** In the Idea Recorder's toolbar, a compact one: a toggle with the icon and, once on, the tempo to adjust; it keeps clicking through a take. The full metronome is at `/metronome` (footer link, indexable): 30 to 300 bpm with steps and a slider, tap tempo, two to six beats to the bar with an accented first beat, and a beat indicator. `Metronome.svelte` (clicks scheduled ahead on the Web Audio clock), `tapTempo.ts` with tests, `metronomePreferences.ts` (remembered per browser). On a phone the recorder's toolbar folds the tuner and the metronome into a wrench tools menu (the menu row shows the tempo whether or not the click is on), and while the metronome runs its stop button takes the menu's place, so one tap stops it; the running toggle is filled accent. The metronome engine is one per page (`src/lib/audio/metronome.svelte.ts`), so every view shows the same click. ContextMenu takes an `iconClass` for its trigger, an `icon` snippet per item for a custom SVG, and `buttonBaseClasses` to replace the trigger's chrome (`button button-sm` makes it one of a toolbar's buttons). `Metronome` compact takes `tempo` ("auto" | "always" | "never") and `toggle` ("icon" | "text": the menu row says On / Off).

## [0.37.0] - 2026-09-26

### Added

- **An inbox.** Every signed-in person has one (`/inbox`, in the account menu with an unread badge on the menu button): comments on songs, new stems, new songs and new demos in the projects they belong to, invitations they sent being accepted, and, for an account's owners and admins, storage at 80 %, 95 % and 100 % and every seat taken. Nothing a person did themselves; a burst of stems, demos or comments on one song folds into one item. Opening an item marks it read and goes where it points; Mark all as read.
- **Email, off by default.** `/settings/notifications`: comments, stems, songs and demos each reach email only when switched on, at once or gathered into a daily or weekly digest (`GET /api/notifications/digest`, a cron once a day); storage and seat warnings and an accepted invitation are always emailed at once. A text-message hook (`deliverSms`, `sms_number`) is in place with nothing behind it yet. `notification` and `notification_preference` tables (migration 0060), `src/lib/server/notifications.ts`, `notificationPolicy.ts` with tests; docs/notifications.md.

### Changed

- The site icon is the Stem Shovel icon (`static/icons/stem-shovel-icon.svg`).

### Technical

- Migration 0060 (`notification`, `notification_preference`); `bun run db:seed-docs` adds the `notifications` user doc. A second cron in vercel.json (`/api/notifications/digest`, daily 13:00 UTC).

## [0.36.2] - 2026-09-25

### Fixed

- **A new take lists the moment Stop is pressed.** The Recordings list shows the take under its idea straight away, marked Saving… with its progress and without a menu until the upload lands, instead of appearing only once saved; a take for a brand-new idea sits under a pending group with that title until the idea exists. The Uploads box now shows failed uploads only (Retry, Discard).
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

### Changed

- The recorder's tuner button is a tuning fork; the loop indicator and volume readout sit in a row on larger screens.

## [0.36.1] - 2026-09-25

### Changed

- **The recorder's list is "Recordings"**, styled like the device: each idea row shows its take count and date and unfolds its takes, whose ⋯ menu is the shared ContextMenu (add as demo, create a song, delete). The idea's own menu left the list; Delete Idea lives in the recorder's ⋯ menu. The tuner, settings and search popovers carry headings, and the search sheet is 640 px wide on larger screens.
- **Fonts** load at weights 400, 600 and 700; ContextMenu takes a `title` and applies its `popoverClasses`.

## [0.36.0] - 2026-09-25

### Added

- **People on a project.** A project's settings gain a People section: invite a **viewer** from outside the account by email (they play the project's songs and stems, read its docs and comment, change nothing and take no seat; any member who may edit the project can invite), and **restrict** the project so only the people added to it and the account's owners and admins can open it (other members of the account no longer see it; add the members who belong from the same section). `project_member` table, `project.is_restricted`, `invitation.project_id` (migration 0059); the rules are `canViewProject`, `canViewSong`, `canEditProject` and `canCommentProject` in `viewAccess.ts`, fed by the account layout, and `memberOf` enforces them for every mutation.

### Changed

- **Viewer is no longer an account role.** Accounts have owners, admins and members; migration 0059 turned every account viewer into a viewer on each of the account's projects and revoked viewer invitations and invite codes. The seat count is the account's members, as the pricing page says.

### Fixed

- **A super admin could not accept an invitation.** The invitation page took their acting-owner access to every account for membership and said they already belonged, leaving the invitation pending; it now counts real memberships only.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

### Technical

- Migration 0059 (`project_member`, `project.is_restricted`, `invitation.project_id`, the viewer data moves). The `accounts-and-members` and `downloads-and-sharing` user docs changed (`bun run db:update-docs accounts-and-members downloads-and-sharing`).

## [0.35.1] - 2026-09-25

### Changed

- **The recorder's popovers share one look**: settings and the ideas search fill a phone's screen and sit under their buttons on larger screens, each closed by a corner ✕ (`button-popover-close`); the recorder carries an "SS Recorder 001" badge. The ideas search anchors to the header's Ideas button whichever way it was opened (the ⋯ menu's item is hidden once the menu closes and would give it no anchor), keeps its search box in place while the list scrolls, and stands 85 % of the viewport tall on larger screens.

## [0.35.0] - 2026-09-25

### Changed

- **The Idea Recorder fills a phone's screen**: the recorder and the note board share the viewport with no page scroll (the document is locked while the phone layout applies and released on leaving), the header keeps an Ideas button, and the tuner and search popovers take the whole screen there; on larger screens the tuner popover sits under its button.
- **The docs editor** opens in the markdown view with a plain toolbar (view toggle, Discard, Save), an "Exit edit mode" link and no hint; the notes board says it saves as you type. The note board's trash button moved beside its title.
- The front page's recorder demo points registered users to the real Idea Recorder; the header's Beta tag is a shade quieter; the header takes an optional `collapsed` prop.

### Fixed

- **Notes stopped saving after being emptied.** Emptying a note board on an idea without takes removes the idea; the page now learns that from the save and drops the idea's id, so the next notes create a fresh idea instead of failing against a deleted one. An emptied board autosaves like any other edit.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
- **"Your Ideas" shows the first line of the notes as soon as they save**, not after the next take or reload.
- CSS changes hot-reload in dev again: the web-fonts preset is always present and uses the no-fetch provider under Vitest and CI instead of being spliced out.

## [0.34.1] - 2026-09-25

### Fixed

- **Download Source of a Chrome lossless take gave an unplayable file.** Chrome records raw PCM in WebM, which almost nothing opens; the download now decodes it in the browser and saves a 16-bit WAV (the menu says "WAV lossless"). A saved take is FLAC once the jobs function has converted it, and downloads as such.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
- **On the VM's dev server the background jobs never ran** (the self-call used the proxy's origin), so Chrome takes there stayed raw PCM with no MP3; the dev server now calls itself on localhost.
- The recorder's volume buttons and readout are for larger screens only (phones keep volume on the hardware buttons).
- The recorder's status light pulses again while recording, waiting for the microphone or playing.
- Download names no longer carry runs of dashes (`idea-take-1.wav`, not `idea---take-1.wav`).

## [0.34.0] - 2026-09-24

### Changed

- **The Idea Recorder looks like a device.** A bezelled panel with a screen for the clock, status and meter; the take picker is a ComboBox; Record, back-to-start, play, volume up and down, loop and a ⋯ menu (browse ideas, add to a song, new song, downloads, delete take, delete idea, new idea) sit in a control row. The position slider is always in place; playback can loop.
- **ContextMenu** items take an icon, a kind (link, button, notice, divider, snippet), a condition and a disabled flag; **ComboBox** hides an option's description on the trigger unless asked.

### Fixed

- **Download MP3 downloaded the source file.** It downloads the MP3 (and is disabled until the rendition exists); the source keeps the container it was recorded in.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
- **Deleting a take shows the previous take** once the list has refreshed, instead of an empty player; deleting the idea in the player gives the title a fresh "Untitled Idea N" that counts without the deleted one.
- The recorder's status reads Saving and Microphone… in those states again.

## [0.33.0] - 2026-09-23

### Added

- **Sign-up is open.** Anyone creates a free account from Sign up; the front page's call to action is "Sign Up For Free · No credit card required", the pricing page's Free card and the sign-up page say the same, and the waitlist page points to sign-up. `/admin/sign-up` switches back to invitation-only, which brings the waitlist language back everywhere (`signUpMode` app setting, read by the root layout).
- **A plan step at sign-up.** Step 1 chooses a plan (only Free today, with what it holds) and accepts the plan terms, a new user doc at `/docs/plan-terms`; step 2 is the details. An invitee skips the plan and ticks the terms in the form. The server refuses a sign-up without the terms and records `user.plan_terms_accepted_at` (migration 0058).

### Changed

- **Links**: a shared `link` shortcut (and `link-dim` restyled, no-wrap) for inline links; the sign-up page's notes sit in small info boxes.

### Technical

- Migration 0058 (`user.plan_terms_accepted_at`); `bun run db:seed-docs` adds the `plan-terms` page and `bun run db:update-docs getting-started` refreshes that one. Smoke row for `/admin/sign-up`.

## [0.32.2] - 2026-09-23

### Changed

- **Front page copy**: the demo headings name what each section is (Stem Player & Mix Comments, Audio Recorder, Song Notes, Charts and Comments) and the recorder blurb mentions lossless recording and MP3 export; the demo notes box is taller.
- **Tuner styling**: a bezel around the display, the strings, the picker, the menu and the On / Off button; blue-tinted text.

## [0.32.1] - 2026-09-23

### Fixed

- **The tuner's On button shows it is starting.** On a phone the microphone permission and the audio context can take a moment; the button now spins and reads "Starting…" until the tuner is live, and a suspended audio context (iOS) is resumed so it never reads as on but silent.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

## [0.32.0] - 2026-09-22

### Added

- **The tuner on the front page**, as a fourth demo beside the song notes (two columns from lg); it listens only once switched on there.

### Changed

- **Front page demos**: each has a "Try the working demo below" call-out (`marketing-demo-cta`), lighter demo containers, the player's link reads "Song Page", the recorder's note says demo recordings are discarded on reload, and the notes demo is a little shorter.

## [0.31.1] - 2026-09-22

### Fixed

- **The Releases page went blank after an edit in the app.** The editor saves each version heading with its brackets escaped (`## \[0.31.0\]`), which the page's parser did not recognise, so every in-app edit emptied the page until the next script refresh restored it. The parser accepts both spellings (`parseChangelog`).
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

## [0.31.0] - 2026-09-22

### Changed

- **The tuner looks like a device.** A dark panel with a power light and an input level, the note and needle in their own window, the strings as lit labels, the tuning in a combobox, A4 behind a ⋯ menu and an On / Off button; on `/tuner` it starts listening when the pointer enters the page and stays off once turned off (`startOnHover`; an instance in a closed popover, the recorder's, waits to be opened). The tuner page's intro sits in an info tip on a phone.
- **ComboBox is a native popover** placed by CSS anchor positioning with a JS fallback (`utils/anchorFallback.ts`), keyboard complete with `aria-activedescendant`; new **ContextMenu** component (a ⋯ button opening a popover menu of actions, links or snippets). docs/demo-recording.md.

## [0.30.0] - 2026-09-21

### Added

- **Storage and seat limits are enforced.** A free account holds 10 GB of stems, demos and takes and up to five members, as the pricing page says; a founder account has no limits. An upload past the limit is refused at reservation with what is used and what the limit is; a sixth member is refused at invitation, acceptance, invite-code redemption and sign-up. Account settings show usage against both limits, and `/admin/accounts` can raise one account's storage (`account.storage_limit_bytes`; `PLAN_LIMITS`, `accountLimits`, `storageRoom`, `memberHeadroom`).

### Technical

- No migration. The `accounts-and-plans` user doc changed (`bun run db:update-docs accounts-and-plans`).

## [0.29.0] - 2026-09-21

### Added

- **Passkeys.** Security in the account menu adds a passkey (a name, then the device's prompt) and lists or removes them; the sign-in page has "Sign in with a passkey" and offers saved passkeys in the email field. A passkey signs in with no password and no two-factor code. Emails confirm an added or removed passkey. `@better-auth/passkey`, the `passkey` table (migration 0057), `rpID` per stage (docs/auth.md).
- **A built-with page** at `/built-with` (footer link, indexable, in the sitemap): the technologies the app runs on, grouped, each with a line on what it does here.

### Changed

- **Navigation**: the footer's Feature Requests link shows to everyone (the page is public); a visitor's header has Pricing beside Sign in and a Sign up button. On a phone the header keeps Sign in alone (Pricing and Sign up are in the footer and on the front page); the Built With link sits beside Privacy and Copyright.

### Fixed

- **Passkey sign-in was blocked by our own Permissions-Policy header** (`publickey-credentials-get=()`); it now allows the page itself, in the header constant and vercel.json.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

### Technical

- Migration 0057 (`passkey`); `@better-auth/passkey` (pulls `@simplewebauthn/server`, dual-format, checked in the build output). The `security` user doc changed (`bun run db:update-docs security`).

## [0.28.0] - 2026-09-21

### Added

- **A pricing page** at `/pricing` (footer link, indexable, in the sitemap): the Free plan, the Professional plan marked launching soon, what every plan includes, and the tax disclaimer.

- **A blog** at `/blog` (footer link, indexable, in the sitemap), written by system admins in the same editor as the docs: a post is a draft until its settings publish it (`user_doc.kind`, `published_at`, migration 0056; the docs list and pages now select `kind = doc`), the index shows the date, author and first paragraph, and drafts show only to admins.

### Changed

- **The feature-requests page is public, read-only.** Anyone can read approved requests and their votes; voting and requesting still need a sign-in, and the page stays out of search engines. A new request shows once a system admin approves it (`approved_at`, migrations 0054 and 0055, the second approving the requests that already existed; Approve / Hide from public on the admin list), and a profanity check at creation flags words on the admin list and in the notification email (`src/lib/utils/profanity.ts`).
- **The tuner has a chromatic mode** for any instrument or tuning: it names whatever it hears, with no string row.

### Fixed

- **The tuner page was marked noindex in production**: vercel.json's `X-Robots-Tag` rule for static files was never widened for `/tuner` (nor now `/pricing`); it is.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

### Technical

- Migrations 0054 (`bug_report.approved_at`, `flags`), 0055 (approves the feature requests that existed) and 0056 (`user_doc.kind`, `published_at`). The `reporting-a-bug` user doc changed (`bun run db:update-docs reporting-a-bug`). The smoke test's blog rows expect a 404 until a stage has a published post.

## [0.27.0] - 2026-09-21

### Added

- **A tuner.** The ear icon in the Idea Recorder's header opens a chromatic tuner: the nearest note, a needle in cents, the string of the chosen tuning (guitar standard, drop D, half step down, DADGAD, open G, bass, five-string bass, ukulele) and a settable A4, remembered per device. Pressing Record closes it. The same tuner is public at `/tuner` (`Tuner.svelte`, `src/lib/audio/pitch.ts`).

### Fixed

- **A deploy no longer leaves open tabs unstyled.** The client polls for a new build once a minute and, after one, the next navigation is a full page load, so it never fetches the previous build's retired stylesheet or chunks (which showed as an empty-looking dark page).
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

### Changed

- **The Stems / Demos tabs show at every width** on the song page, not only with demos or at xl.
- **The docs and the Releases page are indexable.** On production, `/docs`, each doc page and `/releases` no longer carry the noindex header and meta; `robots.txt` allows them, `sitemap.xml` lists them with each doc page's last change (a route now, not a static file), and doc pages carry a meta description from their first paragraph. Everything else stays out of search engines.

## [0.26.0] - 2026-09-20

### Changed

- **Front-page demos.** The stem player demo hides the decoded-in-memory line and the download row; the documents demo has the real editor, with saves kept on the page and gone on reload (`renderPreview`, a public rate-limited markdown query, renders what was typed); the Idea Recorder demo lays out as its own page does, recorder and notes side by side from xl.

### Fixed

- **Deletes remove their children.** Turso does not enforce foreign keys, so the schema's cascades never ran: deleting a song, project, idea, artist, account, user, report or doc left the rows under it behind (files were already removed). Every delete now goes through `src/lib/server/cascade.ts`, and `bun run db:sweep-orphans [--apply]` reports and removes what earlier deletes left.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

### Added

- **Artists and credits.** Each account has an artist directory (`artist`, migration 0048), and a song credits artists by role (`song_credit`): performers make the artist line under the song's title (the account's name when there are none), composers the "Written by" line (the free-text Songwriter field is gone; the column stays until a later release), producers "produced by". Song settings has the editor: type a name (the directory suggests earlier ones, matched case-insensitively) and press Enter; credits save as you go.
- **Project type and artists.** Project settings has a type (album, EP, single, soundtrack, compilation, demos, other; migration 0049); the project page shows it with the artists on its songs, derived from their performer credits ("Various artists" from four, the names on hover), or the account's name.
- **An artist directory** at `/[account]/artists` (members only): every artist with its song and people counts; an artist's page edits its name, sort name, website and notes, lists the people in it (`artist_member`, migration 0050: name, what they do, email), marks those already in the account, and lets an owner or admin invite one by their email as the settings page does. An artist is a **solo artist** (one person, with an email on the record and the same member badge and invitation) or a **band or group** (its people listed under it; migration 0051 adds `kind` and `email`). As an email is typed, for the artist or a person, the page says whether it already belongs to a member of the account. Deleting an artist removes its credits and people. Linked from account settings and from a song's credits.
- **Pictures for the account, an artist and a project.** Account settings, an artist's page and project settings each take an image (JPEG, PNG or WebP, shrunk in the browser to 1024 px before upload, so a phone photo is a few hundred KB); it shows on the projects page header and list, the artist's page and the directory (round for a solo artist), and beside the project's name. Migrations 0052 and 0053 add `image_url` to `account`, `artist` and `project`.
- **A default artist for new songs**, chosen in account settings from the artist directory (`account.default_artist_id`): every new song is credited to it as performer until changed. None by default, for producers working with many acts.

## [0.25.0] - 2026-09-20

### Changed

- **"Discard takes shorter than 3 seconds" is off by default.** It throws a take away, so it is opt-in like Trim silence; a browser that had turned it on keeps it on.

### Added

- **The project playlist shows position and length** and gains a position slider that follows playback and seeks, like the Demos view.
- **The Idea Recorder shows a take's length and position.** With a take loaded the clock reads position / length, and a position slider under the meter follows playback and seeks.
- **A Demos view on the song page.** The player's box shows either the stems or the demo recordings, switched by Stems / Demos tabs above it (and the Demos entry in the Downloads menu); a song with demos but no stems opens on the demos. The demos view (`DemoPanel.svelte`) has a transport with previous, play/pause, next, a position slider and volume over the list of demos, each with its own play button and a ⋯ menu (Download MP3, Download original), and a Record Demo button in the action row for editors (demos upload from the Uploads menu or song settings). It replaces the Demos popover and the Demos button in the action row. At xl the Stems / Demos tabs always show, and the documents' tool bar moves into a row above its panel so the two boxes line up, and the demos box is at least as tall as the stem player's box was, so the columns keep their shape across the toggle.

## [0.24.0] - 2026-09-19

### Added

- **Vote on feature requests.** Signed-in users give a request a thumbs up or down on /feature-requests (a second press takes it back); open requests list by score, the admin list shows it. `bug_report_vote`, migration 0047.

## [0.23.0] - 2026-09-19

### Added

- **Trim silence** in Recorder settings, off by default: once a take is saved, the jobs function cuts the silence before the first sound and after the last from the source and makes the MP3 from the cut source, so both keep the same length and timecode (0.3 s left before, 0.5 s after; lossless sources re-encoded to the sample, compressed ones stream-copied). `recording.trim_silence` (migration 0046) carries the request and is cleared when done; `duration_seconds` follows the cut.

## [0.22.0] - 2026-09-19

### Added

- **Feature requests: an address for follow-up.** The form has a box to tick to be emailed about the request (prefilled with the account's address, editable); the admin list shows it, responses go there, and Mark complete emails the requester that it shipped (migration 0045, `bug_report.contact_email`).

### Changed

- **Feature Requests in the footer** links to the page that lists every request; "Request a feature" is a button at the top of that page, and system admins see a Manage requests link there. The form is `ReportForm.svelte`, shared with the footer's Report a bug.
- **Admin feature requests**: Mark complete, Close/Reopen and Respond are small buttons.
- **BETA** beside the wordmark in the header, 13px on the baseline.
- **Front-page demo notice** reads "Note: this demo does not store recordings beyond your current session."

### Fixed

- **CI**: the `songWantsNotes` test loaded the database through `data.ts` and failed without varlock; the function is a util now. The secrets workflow needs `gitleaks/gitleaks-action@*` on the repository's allowed-actions list.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

## [0.21.0] - 2026-09-19

### Security

- **Viewers can no longer edit.** Every mutation, upload and editing page now requires an owner, admin or member; a viewer sees the account's private work, can comment, and gets a 404 from everything else, and the pages hide the controls from them.
- **Rate limits are shared across function instances**: counted in Upstash Redis (one database per stage, `KV_REST_API_URL` / `KV_REST_API_TOKEN`), so the limits on invitations, share mail, AI, support requests, the waitlist and custom mixes mean what they say, and Better Auth's sign-in and two-factor limits count there too. Without Redis each instance counts in memory as before.
- **A secrets scan in CI** (gitleaks, whole history, every push) and the operator's address removed from the docs.
- **The stem-player test page** (`/test`) is gone.

### Added

- **Feature requests have a page** (`/feature-requests`, signed-in users): every request with its status (open, complete, closed), its priority and the admin's response, requesters unnamed. In the admin, a feature request can be marked complete, given a high, medium or low priority, answered (the response is saved on the request and emailed to the requester) and deleted; bug reports get respond and delete too. Migration 0044 adds `priority`, `response` and `responded_at` to `bug_report`.
- **Help / support requests** at `/support` (Help in the footer, "Need help signing in?" on the sign-in page), open to visitors since the trouble may be sign-in itself. A visitor gives the email of their account and picks it out of a line-up of five partly hidden account names ("M*KK", "M***ny"), four made up and one theirs, before writing the message; an unregistered email gets five made-up names and the page cannot tell the cases apart, so nothing reveals which account an email belongs to. The answer travels in a sealed token (AES-GCM under a key from the auth secret, 15 minutes), attempts are rate limited by address and by email, and a honeypot field catches bots. A signed-in member skips the line-up. Requests are stored (`support_request`, migration 0043), system admins get an email and read, close and delete them on `/admin/support-requests`.

## [0.20.1] - 2026-09-19

### Changed

- **The Releases page's notes live in the database** as a user doc (slug `releases`), edited in the app by system admins like every doc page and seeded once from `scripts/user-docs/releases.md`; it stays at `/releases` (its `/docs` address redirects there and it is not listed among the docs). The repository keeps CHANGELOG.md as the technical record, and the short-lived RELEASES.md is gone.

## [0.20.0] - 2026-09-19

### Added

- **A Releases page** at `/releases`: the user-facing notes per version from `RELEASES.md` (features, changes and fixes a user would notice; this changelog keeps the full record), newest first, rendered at build time; the footer's version number and a Releases link lead to it. The release skill adds a step for it.
- **A Record Idea button** beside Add New Song at the bottom of a project page, opening the Idea Recorder.
- **The recorder's input line wraps** onto two snug lines (the microphone, then the format being recorded) instead of cutting the format off.
- **The Idea Recorder on the front page**: the real recorder in its phone layout with a note board, nothing uploaded; takes stay on the page as playable, downloadable blobs (nothing is discarded for being short: a first try is often a two-second test), and the copy sends a visitor to sign in or a member to their own recorder.

## [0.19.0] - 2026-09-19

### Changed

- **Search in the Idea Recorder is a filter over every idea**: the sheet lists all ideas from the start (full screen on a phone, a tall sheet on a desktop), each unfolding to its takes; typing narrows the list by title, notes, take label or number and opens the ideas whose takes matched, with those takes highlighted. A take loads and closes the sheet.
- **The recorder's ⋯ menu downloads either file**: "Download source (ALAC lossless)", named for the take's codec, hands over the take as recorded; "Download MP3" the 192 kbit/s rendition, greyed out until it is made.
- **An empty song's player box offers three buttons** on their own row: Upload stems, Upload a demo and Record a demo, instead of a sentence with a link.

### Fixed

- **Switching takes in the Idea Recorder puts the transport back to zero**: the clock reads 0:00 and playback starts from the top, instead of carrying the previous take's position over.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
- **Listening back at full quality.** The player prefers a take's original whenever the browser can decode it, and the MP3 rendition otherwise: the device that recorded a take hears it lossless, a Mac plays an iPhone's ALAC, everything plays FLAC, and a browser that cannot play the original (Chrome facing ALAC) gets the MP3. The take's codec is stored at reservation for that check (migration 0042). A take just made plays the browser's own recording at once and the page picks up its rendition within a minute; a media error on the original falls back to the rendition. After capture the audio session returns to its default category, so playback routes as it did before.
- **"AudioSession category is not compatible with audio capture"** on an iPhone when the recorder was opened after playing a song in the same tab: the stem player had set the page's audio session to playback (for the silent switch) and WebKit refuses to capture under it. The recorder now sets "play-and-record" before asking for the microphone, and the player sets playback again on every play.

### Added

- **Lossless takes.** The Idea Recorder records Apple Lossless on an iPhone, iPad or Mac running Safari 18.4 or later and raw PCM on Chrome and Edge, which the jobs function keeps as FLAC; elsewhere Opus or AAC at 256 kbit/s instead of 128. Recorder settings gain **Quality** (lossless where the browser can, or compressed for a metered connection), **Stereo input** for interfaces, and a **Microphone** picker that lists inputs after one permission grant, all remembered on the device. While recording, the line under the meter says what is really being captured ("ALAC lossless · 48 kHz · mono"). A take is at most 120 MB now. Playback stays the MP3 rendition, so a lossless take plays on every device.

## [0.18.0] - 2026-09-19

### Added

- **A user drill-down in the admin** (`/admin/users/[id]`, each name in the Users list links to it): joined, last sign-in and last seen (from sessions), open sessions and the newest one's browser and address, sign-in methods and whether a password is set, two-factor state, memberships with roles and founder status, and what the user has made across every account (ideas and takes with their length and size, projects, songs, stems, document edits, AI requests, bug reports, invitations, share links, invite codes), plus their recent audit lines. The list itself now shows two-factor state and the last sign-in date.

## [0.17.4] - 2026-09-19

### Fixed

- **The stem player is heard on an iPhone with the ring/silent switch on.** iOS mutes Web Audio under the switch but not media playback; before it plays, the engine now asks for the media rules (the AudioSession API on Safari 17+, a silent looping audio element on older iOS), the same way music apps play through the switch. The recorder, demos and playlist already used media elements and were unaffected.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

## [0.17.3] - 2026-09-19

### Changed

- **Password managers are told to leave every free-text field alone**: the markdown editor's textarea (song documents and idea notes) and the recorder's search field now carry the 1Password, LastPass and Bitwarden ignore attributes like the other fields, and the take field's placeholder and accessible name say "label" rather than "name", the word third-party heuristics read as a username. (A report of the password-manager prompt on iOS; Safari's own AutoFill only classifies a field as a credential when a password field is involved, and the page has none.)

## [0.17.2] - 2026-09-19

### Added

- **User docs for the Idea Recorder** (`/docs/idea-recorder`, seeded by `db:seed-docs`): ideas and takes, notes, the list, into a song, settings and limits, phone tips; Getting started mentions it.

### Changed

- **The recorder's volume slider is hidden on iPhone and iPad**, where iOS keeps playback volume on the hardware buttons and the slider did nothing.
- **README and CLAUDE.md** describe the Idea Recorder's modules, the jobs function rule (never import ffmpeg or tfjs modules from page code; decide on the row you hold before scheduling), how to ship a file with a function, and how to measure a cold start.

## [0.17.1] - 2026-09-19

### Changed

- **A song page visit no longer posts a notes job unless there is something to do.** Notes are transcribed after a stem upload; a member's visit now checks the song row first (`songWantsNotes`: missing, behind the stems, or a run stuck for over ten minutes) and only then hands the resume or recovery to the jobs function. Finished songs never touch it.

## [0.17.0] - 2026-09-19

### Changed

- **Faster first loads.** Song and project pages sometimes took five seconds to open: not the database (a few milliseconds away) but a cold start of the Vercel function. Three changes bring it down (docs/environment.md "Cold starts and the jobs function"): the background work (playback renditions, mixes, notes transcription) moved to the app's own jobs function (`POST /api/jobs`, a separate Vercel function with the 300 s budget), so the page function no longer carries ffmpeg or the transcription stack (its bundle went from 131 MB to 33 MB); Sentry on the server is `@sentry/node` without its ESM loader hook or the Vite plugin the SvelteKit entry drags in, errors only; and a cron calls `/api/warm` every five minutes on production to keep the page function warm. Page loads also run their independent queries together.

### Fixed

- **Notes transcription on Vercel.** The chart draft's notes were never transcribed in production: the transcription stack (tfjs, Basic Pitch) was not packed into the function, so every song page's background job failed with "Cannot find package '@tensorflow/tfjs'". The jobs function carries it now.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

### Added

- **Ceilings on a take**, so a recorder left running does not fill the store with silence: a take stops and saves at 15 minutes (a notice at 10), and after 2 minutes of silence it stops, saved when it had sound and discarded when it never did. The server refuses a file over 32 MB at the reservation and in the upload token, and the browser asks for 128 kbit/s. The numbers live in `src/lib/constants/takeLimits.ts`.

## [0.16.0] - 2026-09-18

### Added

- **Idea Recorder** at `/[account]/ideas/recorder` (Projects and Idea Recorder sit in the header for members; the song header has a microphone button and the song page's Uploads menu and empty player link to it). An **idea** is a title, a markdown note board and numbered **takes**, and ideas are the user's own within the account. Record starts a take from the microphone (voice processing off so instruments sound like themselves, a clock, an input level meter, a screen wake lock) and Stop saves it at once as the next number: the take goes to a background upload queue, so Record is free again in about a tenth of a second, uploads run in recording order, an Uploads strip shows progress with Retry and Discard, and every pending take is written to IndexedDB first so a refresh, a crash or a phone switching apps resumes it. A saved take stays loaded (Play, a volume slider, a "Take N" label that becomes a dropdown to jump between the idea's takes) and can be named before, during or after recording. The ⋯ menu offers Add as demo…, Create new song…, Download, Delete take, New idea and Delete idea; the song actions open a popover with a "Merge the idea's notes into the song's notes" box (ticked by default) and copy the take in as a demo, so it stays with the idea.
- **Ideas list.** Under the recorder, newest first, each row an accordion opening to its takes with a menu per take (Add as demo…, Create new song…, Delete take) and a menu per idea (Delete idea); clicking a take loads it with its idea's title and notes. A Search popover finds ideas by title or notes and takes by name or number. Ideas with neither takes nor notes are never kept: they go with their last take, with their cleared notes or with a discarded upload, and hour-old empties are swept on load.
- **Notes for an idea**: the panel beside the recorder is the song documents' embedded markdown editor, always in edit mode with autosave, and a trash button clears it.
- **Recorder settings** (the gear in the header): "Discard takes shorter than 3 seconds automatically", on by default and remembered per browser.
- **Phone layout**: the notes follow the recorder so both are in view, the ideas list gives way to a combo box above the recorder, and the header copy is short with an info button for the rest.
- **Reusable components**: `ComboBox` (a keyboard-complete single select with ARIA combobox and listbox roles) and `InfoTip` (a small info button opening an anchored native popover).
- **Page titles** say `DEV | ` or `STAGE | ` off production and use a plain hyphen before "Stem Shovel".

### Fixed

- **Landing on "/undefined" after the two-factor code.** The verify page reloaded its data before navigating; the reload redirected (the user was now signed in) and swapped the page data out, so the target read as undefined. Both the verify page and the sign-in page now capture the target first and navigate with a single reload.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
- **Sign-in on preview deployments** (staging): Better Auth's base URL was pinned to the production origin for every non-dev build, and its handler ignores requests from another origin, so every `/api/auth/*` call on a `*.vercel.app` preview answered the app's 404 page. Previews now infer the URL from the request like dev does.

### Technical

- **Migrations 0039–0041**: `recording` (takes; files in the private Blob store when one is configured; account usage counts their bytes and deleting an account removes them), `recording.notes` (unused since 0041, to drop in a later release) and `idea` (`recording.idea_id`, `take_number`; one idea per earlier recording). Permissions-Policy allows `microphone=(self)` and `screen-wake-lock=(self)`.
- **One environment per stage** (docs/environments.md): dev, staging and production each have their own 1Password environment, Turso database (Turso's newer platform, `turso://` URLs accepted) and Blob store pair; dev and staging were restored from a snapshot of the MMKK and sirrobert accounts (`db:snapshot-accounts`, `db:restore-accounts`, `db:reset-stage --restore`, which refuses production); `db:copy-database` moved production to `stem-shovel-prod`. Better Auth pins production to the domain Vercel reports and trusts `staging.stemshovel.dev` on previews; Sentry's browser tag distinguishes previews.
- **Staging and previews are never indexed**: every non-production stage sends `X-Robots-Tag: noindex`, the robots meta everywhere, and a robots.txt that disallows all (the file is a route now); production keeps its front-page-only rule.

## [0.15.0] - 2026-09-17

### Added

- **The AI listens when the time signature is a close call.** After a detection (at upload or from Scan stems) whose 3/4-or-4/4 lean is under 0.15, the song page asks the AI to check on its own, waits for the mix to render when the stems have just been uploaded, and shows the answer with "Use these"; the card says the check was automatic.
- **Notes on an idea.** The recorder page is laid out like the song page, the recorder on the left and a Notes panel on the right that works exactly like the song page's document panel (read view, pencil to edit, check or Escape to finish, Rich Text or Markdown in the ⋯ menu, edit-mode badge), so chords or a working title can be jotted before the take; the notes are stored with the recording when it is saved and autosave from then on (the song documents' embedded markdown editor). Each library row has a collapsible Notes section with a one-line preview. Migration 0040 adds `recording.notes`.
- **Page titles** say `DEV | ` or `STAGE | ` off production, and use a plain hyphen before "Stem Shovel" (one helper, `pageTitle`, builds every title).
- **Top nav links for members**: Projects and Idea Recorder sit in the header from tablet width up (the account menu keeps them on a phone); the recorder page has an All recordings button.
- **Instant next takes.** Stop hands the take to a background upload queue and Record is available at once (about a tenth of a second instead of the whole upload); takes upload one at a time in recording order, an Uploads strip shows progress with Retry and Discard on failure, and every pending take is written to IndexedDB first, so a refresh, a crash or a phone switching apps resumes the upload rather than losing the take.
- **A take into a song from a menu.** "Add as demo…" and "Create new song…" sit in the recorder's ⋯ menu and in a ⋯ menu on every take in the list; each opens a popover with the form (the on-page form is gone) and a "Merge the idea's notes into the song's notes" box, ticked by default, which appends the notes to the song's notes document under a heading naming the idea and take.
- **Idea Recorder refinements** (2026-09-18, later): a take can be named before or during recording as well as after; "New idea" sits in the recorder's ⋯ menu and each idea in the list has its own menu with Delete idea; the idea rows are a plain accordion (a click only folds or unfolds; a take loads); the notes panel is always the markdown editor with autosave and a trash button to clear it (no read view, no ⋯ menu); a Recorder settings popover (gear in the header) holds "Discard takes shorter than 3 seconds automatically", on by default and remembered per browser; ideas with neither takes nor notes are removed (after their last take or notes go, after a discarded upload, and a sweep of hour-old empties on load). Two reusable components: `ComboBox` (the phone idea picker) and `InfoTip` (the info button beside the page title).
- **Ideas and takes.** An idea is a title, a note board and numbered takes. Record → Stop saves the take at once as the next number (no pause, no review step); it stays loaded for playback and Record starts the next. New idea starts "Untitled Idea N" with an empty board; the list shows ideas opening to their takes, with a Search popover (title, notes, take name or number). Ideas are the user's own within the account. The separate recordings page is retired. When an idea has more than one take, the loaded take's "Take N" label is a dropdown that jumps to any other take. On a phone the notes follow the recorder directly, so both are in view, and the ideas list gives way to a picker above the recorder (with Search and New beside it); the full list shows from the two-column width up. Migration 0041 adds `idea` and makes one idea per earlier recording.
- **Idea Recorder as a voice-memo list**: the recorder page lists every recording under the recorder (newest first, title, length, date, first line of notes); picking one loads it into the player, its title into the title field and its notes into the panel; the title field renames on blur or Enter; the selected recording can be deleted or added to a song right there. Notes carry over from take to take until "Clear notes" in the panel's menu; "New idea" empties the player.
- **Idea Recorder playback**: the browser's audio player is gone; a Play button sits between Record and Stop, the clock follows playback, a volume slider and a ⋯ menu sit at the end of the row, and the menu offers Download once the take is saved. A saved take stays playable until the next one starts.
- **Idea Recorder controls**: the title field is always visible, prefilled "Untitled - <date> - <time>"; Record/Pause/Resume, Stop, Undo (Retake once a take is ready) and Save form one row that never changes shape, each greyed out until it applies; Save works from Paused and stops the take first.
- **Idea Recorder link on the song page**: an icon button between share and info opens the recorder for that song (members). The header's share, info and settings buttons share one style, and their icons no longer vanish on hover.
- **Build version in the footer**: the app version and the short commit of the running build, linked to the changelog.

### Fixed

- **Time signature detection votes per stem.** The detector used to sum every stem's onset envelope and compare the three- and four-beat autocorrelation of the sum, so a flat kick diluted the bar pulse and one riff with a three-note feel could tip a 4/4 song to 3/4 (as it did for a user's project). Each stem now leans 3/4 or 4/4 on its own and the leans are combined, weighted by how sure each stem is; the confidence shown reflects the strength of the agreement.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
- **"Use these" after Ask AI to check** now saves the tempo, key and time signature at once with a notification; before, it only filled the rows in the settings popover and waited for a Save changes click further down, which read as nothing happening.

### Changed

- **Project playlist player**: the slider is a volume control (it was a position control that looked like one); seeking within a track will come later.
- **Song settings is a panelled popover**: full screen on a phone, a wide card on a desktop, with a sub-navigation (Details, Sections, Tempo & key, Demos, Options) showing one panel at a time instead of the whole scroll. Section and change rows take two lines on a phone; the toolbar buttons keep their labels on one line; the Demos panel lists demos (or "No demos yet") with Upload demo on its own row below; the date field's calendar icon is light; helper text is brighter and the positions note is an info box across the form.
- **Mobile layout**: the Chart / Lyrics / Notes / Comments control is a dropdown on a phone (song page and the front-page demo); the front-page demos run edge to edge; the footer's links are 16px and wrap, with a wide gap above them; the sign-in and sign-up button rows wrap instead of the button label; the bug report and feature request fields tell password managers to stay out and the popover fits the visible viewport.
- **Monospace is a choice per document.** The chart is no longer monospace by default; the panel's ⋯ menu has a Monospace toggle for the chart, lyrics or notes, remembered per browser.
- **The phone's document picker is the app's own menu** (it opens downward with room for the caret; iOS put its native picker mid-screen), on the song page and the front-page demo. The song header's share, info and settings icons are real buttons on a phone, and the settings sub-navigation is a dropdown there. The footer puts its links above the copyright on a phone, at 15px. The docs index has space between New page and the list and no longer shows each page's updated date.
- **Uploads and Downloads menus** on the song page: Add Stems, Replace Stems and Upload Demos sit under an Uploads button (members), and Download Stems, the two mixes and the demo recordings under a Downloads button; Reset Mix and Save as Default Mix stay in the row.

## [0.14.0] - 2026-09-17

### Added

- **Your mix and the default mix**: fader, mute, solo and master changes are kept per browser (Reset Mix puts the default back); members save the current faders as the song's default mix for every listener, which the Original Mix MP3 and the project playlist follow.
- **Add Demos** beside Add Stems on a song that has no stems yet, since an idea usually starts with a demo recording.
- **Replace Stems** on the song page: pick the whole new set; matching names replace in place (name, order and MIDI kept), new names are added, and stems without a new file are removed, after one confirmation listing all three; nothing is removed unless every upload succeeds.

- **Founder status per user** on /admin/users: a super admin makes a user a founder, which flags every account they own (or revokes it); the users list shows who is a founder.

### Technical

- **`bun run smoke:urls`**: a repeatable smoke test of every route, signed out and as the Screenshot Bot, on the dev server or production; a route without a row in the script fails the run.

### Changed

- **Panel minimum heights**: the player and the documents panel keep at least 560px, so an empty song does not collapse.
- **Home page title** typo fixed.

## [0.13.0] - 2026-09-17

### Changed

- **The site moved to www.stemshovel.com.** Better Auth's base URL, the canonical and Open Graph tags, the sitemap, robots and the two-factor email link use the new domain; `stem-shovel.com`, `www.stem-shovel.com`, the apex `stemshovel.com` and `stem-shovel.vercel.app` redirect to it permanently with the path and query intact, so old bookmarks, invitations, invite codes, waitlist and reset links keep working. Everyone signs in once more on the new domain. Mail now comes from `no-reply@mail.stemshovel.com`.

### Technical

- **House rules as Fallow policy** (`fallow-rules.json`): no `$env/*`, no form actions, no zod/moment/lodash/dotenv/axios, warnings for `$effect` and raw global listeners, plus import boundaries between routes, lib, val, utils and constants; `fallow audit` runs in CI and reports to code scanning. `fallow guard <file>` shows what applies before editing.
- **Spell check** (cspell) over the prose in CI, with a project word list.
- **Validation failures are logged**: a remote-function payload that fails its schema logs the route, issue count and client address.

## [0.12.0] - 2026-09-17

### Added

- **Live demos on the front page**: a public song's player (transport, waveforms, mute/solo/faders, stem, mix and zip downloads, demo recordings) replaces the screenshot, and its chart, lyrics, notes and comments are a second demo further down. The player carries the comment timeline with example comments (never the account's real ones), and visitors can leave their own from a waveform's right-click menu; those live on the page only. System admins pick the song on /admin/home from every public song with stems; it falls back to Eat All the Clocks. The song page and the demo share one loader (`songView`) and the download helpers.
- **Beta waitlist**: a sign-up form on the front page and at /waitlist (email, optional name, and a separate, off-by-default consent to project-update email), a confirmation email that must be opened before the address counts, and a manage link in every email to change the consent or leave. System admins see the list at /admin/waitlist, resend confirmations, and invite confirmed addresses with a single-use 30-day code sent by email. The privacy policy says what is kept.
- **Two-factor authentication**: Security in the account menu turns on TOTP (QR code or key for any authenticator app, ten single-use backup codes), makes new backup codes, or turns it off, each with the password; sign-in then asks for the code (or a backup code) with a 30-day "trust this device" option, and an email confirms every change. Better Auth's twoFactor plugin, as in replicator.
- **Finished songs**: any member marks a song finished in its settings (a "finished" chip shows in the song header), and the project page files it under a new **Finished Songs** section above Songs in Progress and Song Ideas; the project playlist plays finished songs first.
- **Request a feature** in the footer, beside Report a bug: the same short form (title, description, page and browser attached), stored with `kind = feature`, emailed to system admins, and listed on /admin under Feature requests.
- **Sentry error reporting** in the browser and on the server (no user identity or request bodies; masked session replay on errors; source maps uploaded from Vercel builds with a token kept in 1Password); the privacy policy says so.
- **Vercel Web Analytics and Speed Insights**: cookieless page-view counts and Core Web Vitals per route, with query strings and one-time link tokens stripped before anything is sent; the privacy policy says so.
- **Open source under Apache-2.0**: LICENSE, a license note in the README, SECURITY.md with a private disclosure route, CODEOWNERS, a CI workflow (lint, check, test on pushes and pull requests) and Dependabot.

### Changed

- **The front page is open to search engines**: robots.txt allows `/` alone (with a one-entry sitemap), the noindex header and meta now apply to every other path, and the home page carries a title, description, canonical and Open Graph tags. New home page copy and screenshot (the free storage figure is 10 GB), a copyright line in the footer, and a README that describes the app as it is.
- **/admin is a section with a side navigation** (the docs layout): one page each for accounts, users, invite codes, waitlist, home page, bug reports, feature requests, AI requests and the audit log, each loading only its own data; /admin opens Accounts.
- **Charts are monospace** in every view (panel, home demo, full-page editor, rendered and markdown), so chord grids line up.

### Technical

- CI runs without secrets: the varlock Vite plugin is imported only when it is going to be used (`SKIP_VARLOCK`), and the tests mock the environment.
- Dependabot watches GitHub Actions only for now (its bun support reads lockfile version 1; Bun 1.4 writes 2), and a workflow approves and auto-merges its minor and patch bumps once CI and CodeQL pass.
- Migrations 0032–0037: account plans, song finished flag, report kind, two-factor, app settings, waitlist.

## [0.11.0] - 2026-09-16

### Added

- **Account plans**: every account is a free account for life (`plan`, `lifetime_free`), and the first twenty accounts ever created are **founders** (`is_founder`: never charged, unlimited data, every feature); super admins grant or revoke founder status from /admin. A plan badge shows in account settings, on Your accounts and in the admin list, and a user-docs page explains free-for-life, founder accounts and the paid tiers to come.
- **docs/billing.md**: the per-account cost estimate from measured stem sizes and current Vercel Blob, Turso and Vercel rates, and the plan for Stripe subscriptions.

### Changed

- **The document panel's ⋯ menu is always present** (a placeholder line when it has nothing to offer) so the toolbar keeps its width across panels, and sits closer to the edit button.

## [0.10.0] - 2026-09-16

### Changed

- **Editing in the song page panel** autosaves (1.5 s after the last change, ⌘S at once) with no header at all: no title, Save button, version, Done button or shading. The text keeps the reading view's margin, with the editor's block buttons tucked into the panel's padding on hover. The check button spins while a save is in flight, and an "Edit mode" badge sits at the box's bottom corner. The check button, Escape and switching documents save what is unsaved first. `MarkdownDocEditor` takes `mode`: `"standalone"` (the full-page editors, unchanged apart from the toggle reading "Rich Text" / "Markdown") or `"embedded"`.
- **A ⋯ menu beside the edit button** on the document panel switches the editor between Rich Text and Markdown while editing and, on the Chart panel, holds "Draft chart with AI" (with progress and Cancel while a run is listening or drafting) in place of the old top-left button. Song settings keep their buttons.
- **The document box is bounded** (70vh) and scrolls inside, like the comments panel, in both modes.
- **The AI draft previews** its suggested chart with the Chart panel's styling (rendered markdown), with the raw markdown folded beneath; the card has a Discard control, and a cancelled run's result is dropped when it arrives.
- **Deleting a project needs it archived first**: project settings offer Archive on an active project, and Restore or Delete (owners and admins) on an archived one; the server refuses to delete an active project.
- **The player's status bar** uses 16px text on small screens and 13px from the lg breakpoint.

### Fixed

- **The AI draft card crashed the song page** when the draft named two sections alike (two verses): the lists were keyed by section name.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
- **A failed chord detection or AI draft** now shows a notification with the reason; a remote function's `error()` was displayed as its JSON body (`errorMessage` util), and AI failures arrive as a 502 with their message instead of production's "Internal Error".

### Technical

- Dropped the unused `@tensorflow/tfjs-backend-wasm` dependency (transcription runs on the CPU backend in the server child process and WebGL in the browser).

## [0.9.0] - 2026-09-16

### Added

- **Detect chords** in song settings: the tonal stems are transcribed to
  notes in the browser (Spotify's Basic Pitch) and read as one chord per
  bar on the song's grid, shown as chart lines.
- **Archive, restore and delete projects** from project settings: any
  member archives a project (it moves to a collapsed "Archived" section on
  the projects page, everything in it kept) and restores it; owners and
  admins delete one with every song and file behind it, after a
  confirmation. An archived project's page carries a badge.
- **"Do not use AI"** on a project or a song, set by any member in its
  settings: no model is called for it and nothing is transcribed; the AI
  buttons disappear, the commands refuse, and the song shows a "no AI"
  chip. For artists whose contracts rule AI out.
- **Notes are transcribed on the server after upload** (in a child
  process, in resumable one-minute segments) and stored on the song, so a
  chart draft uses them at once instead of transcribing in the browser;
  the browser path remains as a fallback while the server copy is still
  being made.
- **Leaner chart drafts**: the model returns the chords as one compact
  line and a capped chart, cutting its reply to a fraction of the tokens.
- **Charts, lyrics and notes are edited in place**: the pencil on the
  documents panel opens the same editor inside the panel (rendered and
  markdown views, undo, ⌘S, versioned saves); the tick closes it, saving
  re-renders the document where it was, and switching documents or
  closing with unsaved edits asks first. The full-page editor route still
  works for deep links.
- **Draft chart with AI** sits at the top left of the Chart panel's
  toolbar and runs the chord detection itself when needed; the draft
  appears in the panel above the chart. It also stays in song settings.
- **Draft chart with AI**: the transcribed notes of every bar go to a
  frontier text model (Claude Fable 5.1 through the AI Gateway), which
  names the chords, the sections and each section's progression and
  drafts the chart in the account's own style, using the account's
  existing charts as examples;
  the sections and the chart can each be saved, with a confirmation when
  they would replace something.
- **Key detection ignores drums**: each stem's chroma is weighted by how
  tonal it is.
- **Scan stems** in the song's tempo, key and time signature settings: the
  upload-time detector run again on the stems the player has loaded. Empty
  settings are filled and the values shown; filled ones get an offer to
  replace, with the current values beside the suggestion.
- **Super admin**: a separate flag (`bun run db:super-admin <email>`) that
  makes its holder an acting owner of every account they are not a member
  of. The header shows "acting as owner", the account's settings carry a
  notice, and every request made that way is written to an audit log shown
  on `/admin`. Migration 0030.
- **AI request log on `/admin`**: every model call is recorded (the text
  sent, the reply, the parsed answer or the error, duration, tokens) and
  the latest fifty show with the prompt and reply expandable. New
  `ai_request` table (migration 0029).

### Changed

- **Detection accuracy on real songs**: the beat period is refined over up
  to 32 beats at twice the onset resolution, so declared DAW tempos come
  back exactly (145, 132, 120, 115, 112); the key uses chroma from
  spectral peaks, normalised per frame, so drums no longer smear it (four
  of five MMKK keys right, up from three); and the bass settles a key
  against its fifth when the profiles cannot.
- **Tempo detection prefers the 80–170 bpm band** when the half- or
  double-time pulse correlates as well as the beat; on the real mixes in
  MMKK every declared tempo now comes back within two bpm, where two of
  five had come back at half time.
- **The AI check can answer "no fixed tempo"** and report discrete tempo
  shifts (with the time and the new tempo), or "no meter"; "Use these"
  turns shifts into tempo rows at their times and leaves out what has no
  value.

### Fixed

- Spacing of the AI check's note after its confidence.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

## [0.8.0] - 2026-09-16

### Added

- **Tempo, key and time signature are detected from the stems as they
  upload** (in the browser, from the audio it already decodes: onset
  autocorrelation for tempo, beat groupings for 4/4 against 3/4, chroma
  against key profiles for the key). A song with none set yet gets them as
  its first tempo, key and meter changes, with a notice; a song that has
  them only hears what was detected.
- **New account** from the account menu or the Your accounts page: anyone
  who already belongs to an account can start another and owns it, no
  code needed.
- **Ask AI to check** in the song's tempo/key/meter settings: the rendered
  mix goes to a listening model through Vercel's AI Gateway and its answer
  can be dropped into the changes for saving. Needs `AI_GATEWAY_API_KEY`;
  hidden until it is set.

## [0.7.1] - 2026-09-16

### Security

- **Upload completion is pinned to the reserved file**: the URL a browser
  reports for a stem, MIDI file or demo must be that reservation's file in
  one of our Blob stores, and the server never fetches a URL outside them
  (closes a server-side request forgery through a reported URL).
- **Sign-in redirects stay on this site**: `?next=` refuses absolute and
  protocol-relative targets.
- **Rate limits** on custom mixes, bug reports, invitations, invite codes,
  viewing links and share emails.
- **Session cache shortened to a minute**, so suspensions, deletions and
  admin changes apply promptly; `Cross-Origin-Opener-Policy: same-origin`
  added to every response.
- A security model document, docs/security.md.

## [0.7.0] - 2026-09-16

### Added

- **Invitation-only sign-up**: creating an account needs an invitation link
  or an invite code; the sign-up page says so, locks the address to the
  invitation when it arrives from one, and reports a bad, used-up, expired
  or withdrawn code. Signing up through either joins the inviting account
  straight away. Owners and admins generate **invite codes** in account
  settings (role, note, use limit, expiry), copy the code or its sign-up
  link, and revoke them. New `invite_code` table (migration 0023).

### Fixed

- **Popover forms no longer show the previous entry**: a remote form keeps
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
  what was last typed or submitted for the life of the page, so "Add a
  song" opened on the last title and settings popovers on the last edit.
  Popovers now open on saved values (or empty), the invite and invite-code
  forms clear after sending, and the new-project field starts empty.

### Added

- **Private storage for private songs**: the files of a private song
  (stems, renditions, MIDI, demos, mixes) now live in a private Vercel Blob
  store whose URLs are refused without a signature; pages hand the browser
  presigned URLs good for twelve hours, and uploads to a private song go
  straight there. Making a song or project private moves its files across
  in the background, and making it public moves them back. New variables
  `BLOB_PRIVATE_READ_WRITE_TOKEN`, `BLOB_PRIVATE_STORE_ID`,
  `BLOB_PRIVATE_WEBHOOK_PUBLIC_KEY`.
- **Belonging to several accounts**: the account menu shows your role in
  each account and links to a new "Your accounts" page (roles, project
  counts, leave). Neutral pages and the old `/projects` and `/settings`
  shortcuts go to the account you last opened, else one you own. In
  account settings owners change roles (handing over ownership) and
  remove members; admins manage members and viewers; anyone can leave
  except the last owner. Joining through an invitation or an account's
  invite code no longer also creates a personal workspace.
- **Private projects and songs with viewing links**: everything stays
  public by default; any member makes a project or a song private from
  its settings (a private project covers its songs). Private means
  members only, or a viewing link: any member makes one from the song's
  share popover or the project's settings (note, expiry, use limit, copy,
  revoke), and the link is the page address plus `?share=code`, remembered
  for the visit so playback and mix downloads keep working. Private things
  are left out of lists for those who cannot open them; a refusal shows a
  Private page with a sign-in button. Sharing a private song by email sends
  a viewing link made for the recipient. Migrations 0027 and 0028.
- **Starting user docs**: eight pages (getting started, stems and playback,
  song settings, charts/lyrics/notes, comments, downloads and sharing,
  accounts and members, reporting a bug) live in `scripts/user-docs` and
  `bun run db:seed-docs` adds any that are missing, never overwriting edits.
- **Acceptable-use rules** on the copyright page: hate speech, sexual
  content involving minors, pornography, graphic violence, illegal activity
  and harassment are banned, with removal and suspension as consequences.
- **Privacy policy and copyright policy** as docs pages, linked from the
  footer and from the sign-up form, which now states that creating an
  account means agreeing to them. Both are deliberately short.
- The `/admin` user list shows each user's role in each account ("owner of
  MMKK"); a new user is the owner of the workspace made for them.
- **Account management on `/admin`**: suspend an account (its pages close
  for everyone and its members lose editing until reactivated), reactivate
  it, or delete it with every project, song and file.
- **User management on `/admin`**: suspend (signs the user out and blocks
  sign-in), reactivate, and delete a user; deleting removes their sign-in,
  memberships and comments, and an account only they belonged to when it
  holds nothing.
- **The comment row is always there for members** on a song with stems,
  with a hint to ⌘-click, Ctrl-click or right-click a waveform to comment
  when there are none yet; visitors see it only when comments exist.
- **User docs** at `/docs`, linked from the footer: an index and one page
  per topic with a sidebar, readable by anyone. System admins add pages,
  edit them with the same editor as song charts, lyrics and notes (WYSIWYG
  and markdown views, undo, ⌘S, versioned saves), and rename, reorder or
  delete them from a settings popover. New `user_doc` and
  `user_doc_version` tables (migration 0026).
- **Report a bug**: signed-in users get a footer link that opens a form
  (title, what happened); the page they were on and their browser are
  attached. Reports land on `/admin`, where system admins close and reopen
  them, and every system admin gets an email with the report. New
  `bug_report` table (migration 0025).
- **System admin and new-account invite codes**: `bun run db:system-admin
<email>` makes a user the operator; `/admin` (a 404 for anyone else)
  lists every account with members, songs and storage, every user, and
  issues invite codes that open sign-up without joining an account, so a
  newcomer gets a workspace of their own. Migration 0024 (`user.is_system_admin`,
  `invite_code.account_id` nullable).

### Changed

- **Account menu in the header**: the row of links (Projects, Settings,
  Admin, account name, user name, Sign out) is now one button showing the
  account, opening a menu with your name and address, Projects, Account
  settings, other accounts to switch to, Admin for system admins, and
  Sign out. Visitors still see the account name and Sign in.
- **Mix downloads carry the song version**: the original and custom mix
  MP3s (and the stems zip) are named `project-song-v1.2.3-mix.mp3` and so
  on.
- **Security headers and a Content Security Policy** on every response,
  after lj-website: no third-party scripts (SvelteKit nonces its own
  inline script), fonts from bunny.net only, audio and uploads limited to
  Vercel Blob, no framing, no sniffing, HSTS, device APIs switched off.
- The demo upload button on the song page uses the same size classes as
  the other section buttons.

- **Project page splits songs into "Songs in Progress" and "Song Ideas"**:
  a song is in progress once it has a finished stem; until then it is an
  idea, listed below with what it holds so far (lyrics, chart, notes,
  demos) and left out of the project playlist.

## [0.6.0] - 2026-09-14

### Added

- **Comments on songs**: a Comments tab in the documents panel lists them
  (author, date, an "edited" badge, a position that seeks); the + button
  opens a popover to post one with a title, text and an optional position
  in any format. Ctrl / ⌘-click or right-click a waveform or MIDI roll for
  "Seek here" / "Comment here" at that spot. Located comments sit as icons
  on a timeline under the stems, each opening a card anchored to it.
  Authors edit and delete their own; owners and admins delete any.
  The timeline row draws the mix's waveform (stems summed once decoded,
  their stored peaks combined before that) behind the icons, and the open
  comment is marked with a line on it. The row seeks like a stem row.

### Technical

- New `comment` table (migration 0022). `engine.mixPeaks` holds the
  summed waveform (`computeMixPeaks`; `combinePeaks` from stored per-stem
  peaks before decoding).

### Changed

- **Notifications instead of inline "Saved." lines**: confirmations (song,
  project and account settings, sections and changes, version bumps,
  invitations, shares) appear as notices fixed to the bottom-right corner
  that fade out after a few seconds or can be dismissed, so page content no
  longer shifts.

## [0.5.0] - 2026-09-14

### Added

- **Email through Resend**: sign-up now sends a verification link and
  sign-in needs a verified address (existing users were marked verified);
  "Forgot password?" emails a one-hour reset link; owners and admins invite
  people into an account from settings, with a role, and can revoke pending
  invitations; the song header gains a share-by-email button that sends the
  song's link with a note. New `invitation` table (migration 0021), new
  `RESEND_API_KEY` / `RESEND_MAIL_DOMAIN` variables.
- **MIDI file per stem**: upload one from the stem's row menu ("Upload
  MIDI", later "Replace MIDI" / "Remove MIDI"); a "MIDI" chip beside the
  stem name marks it and "Download MIDI" joins the menu. Clicking the chip
  swaps the row's waveform for a piano roll of the file's notes, and back.
  Migration 0020.

### Changed

- **Song info popover** (an info button in the song header) holds the
  description, writer and date, tempo · key · meter, version, stem count
  and last change, and the project; the header itself is one line again
  (Kevin's layout pass), and the transport shows the key, tempo and meter
  in force at the playhead beside the readout.
- The row menu's "Download" is now "Download Stem", and a truncated stem
  name shows in full on hover.

## [0.4.0] - 2026-09-13

### Added

- **Song version and "stems updated"**: each song carries a semantic
  version you manage (0.0.1 to start, editable in settings, shown under the
  title and on the project's song rows). It never bumps itself; after a
  stem is added, replaced or removed the page offers the next patch, minor
  or major version in one click. The header also shows when stems last
  changed. Migration 0019.

### Changed

- **Readout formats are timecode and bars** — digital time is gone from the
  display. A song with a tempo and a time signature shows bars by default;
  clicking the readout switches and the choice is remembered. Bars read as
  `45 | 1`, and positions typed with spaces around the bars parse too.
- **Stem rows and transport restyled** (Kevin): name, mute, solo and menu
  stacked in one column with wider waveforms; the section timeline follows
  the same columns and shows the current section as a chip; the transport
  readout sits in its own block with a format badge.
- **Project settings are a popover** opened from a gear in the project
  header, matching the song page, instead of a form that unfolded in place.

### Fixed

- **Typing a position in bars on a song without a tempo and time
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
  signature** now says so and points at the settings section to fill in,
  instead of the generic "not a position" message.

## [0.3.0] - 2026-09-13

### Added

- **Song notes**: a third markdown document beside Chart and Lyrics, with
  the same editor, versioning and toggle (`…/[song]/notes`; migration 0012).
- **Song sections**: mark the structure (Intro, Verse…) with a start time
  each; a timeline row over the stems shows the blocks, highlights the one
  the playhead is in and seeks on click. "Add section at playhead" on the
  transport, or edit names and times (in the transport's `m:ss.s` format)
  in song settings. Hidden when a song has no sections. Migration 0013.
- **Tempo, key and time signature** as timed changes: each has a start
  time, so a song can change tempo or meter partway. Edited in song
  settings as rows of time, kind and value; the header shows the song's
  opening tempo, key and meter, and the timeline draws a lane for each kind
  that actually changes, highlighting and naming what is in force at the
  playhead. A song with fixed values and no sections shows no timeline. Migrations 0015
  (the `changes` column) and 0016 (drops `bpm` / `musical_key`).
- **Timecode and bars everywhere**: the transport readout cycles time,
  Logic-style timecode (`mm:ss:ff.sub` at the song's frame rate, a new
  setting) and bars; section and change times display in the same format
  and accept any of the three when typed. Times are now stored to a tenth
  of a millisecond instead of a tenth of a second. Section tooltips show
  the length in bars when the song has a tempo and a meter. Migration 0018.
- **"Add section at playhead" is hidden** for now; the player still
  supports it through its `onaddsection` prop.
- **Settings rows keep exact times**: a section or change saved without
  editing its time keeps its stored seconds, whatever the display format
  rounds to; editors show full precision (milliseconds, beat fractions).
- **Section index**: each section has a short index (roman numerals by
  default, filled in by position) shown on the timeline blocks, where names
  would not fit; the name shows on hover.
- **Bars on the transport**: with a tempo and a time signature set, click
  the time readout to count in bars and beats instead (remembered per
  browser). Song settings gain "Start of bar 1" and "End" times, each
  settable from the playhead, so tracks with leading silence or a count-in
  count from the right place; both show as dashed lines on the timeline.
  Migration 0017.
- **Tall popovers scroll** within the viewport instead of overflowing it.

### Technical

- **Test suite**: Vitest through Vite+ (`bun run test`) with a Node `unit`
  project and a jsdom `components` project using @testing-library/svelte —
  73 tests over the utils, bar math, dual-mono and peaks, the valibot
  schemas, the mix request parser and the screenshot bypass (database and
  Blob mocked), and the Transport, SectionTimeline and ProjectPlayer
  components. `/test` skill; `bun run test` opens the release gates.
- Helpers moved to `src/lib/utils/` (one function per file) and constants
  to `src/lib/constants/`, replacing `format.ts`, `slug.ts` and `keys.ts`;
  song change kinds live in `constants/songChanges.ts` so the schema and
  its validator no longer import each other.

### Fixed

- **Stem row menus close** on Escape, on a click outside them, and when
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
  another row's menu opens.

## [0.2.1] - 2026-09-13

### Fixed

- **"Custom Mix (MP3)" said nothing was audible** even with stems soloed or
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
  unmuted: the download row is rendered outside the player since the layout
  pass and no longer had the engine. The player now hands its engine to the
  page.

## [0.2.0] - 2026-09-13

### Added

- **Demo recordings per song**: upload phone memos or rough takes from song
  settings (up to 12; WAV, AIFF, FLAC, MP3, M4A/AAC, OGG/Opus, CAF, WebM,
  AMR, 3GP), remove them there, and listen to or download them from a
  "Demos" popover in the song's download row. Every demo is converted to
  MP3 on the server for listening and download, so a lossless Voice Memo
  plays everywhere; the original is kept. New `demo` table (migrations
  0010, 0011).
- **Songwriter and date first written** on a song, edited in song settings
  and shown under the title ("Written by …, first written June 2019").
- **Sign-in with Better Auth** (email + password; `/sign-in`, `/sign-up`,
  `/sign-out`). A new user gets their own account; existing users get a
  credential with `bun run db:set-password`. Anonymous visitors still see
  and play everything by URL; the controls and the members-only pages need a
  signed-in member. Tables `session`, `auth_account`, `verification`
  (migration 0006). No email verification or password reset yet (no email
  provider).
- **Playback renditions**: after an upload the server renders an AAC M4A
  of the stem with ffmpeg (about a tenth of the WAV) and the player streams
  that; the source file stays for downloads. Missing renditions are rendered
  on first view of the song. Migration 0007 adds the `playback_*` columns.
- **Download MP3** next to "Download Stems": a stereo MP3 mixdown rendered
  on the server with ffmpeg. "Original" is the full mix (cached per set of
  stem files); "Custom" is what is audible in the player — mute, solo and
  faders. Migration 0008 adds the song's mix cache columns.
- **Screenshot auth bypass** (replicator's `PREVIEW_AUTH_TOKEN`): with the
  token in `.env.local`, `bun run shot` renders pages as the Screenshot Bot
  user, enrolled per account with `bun run db:preview-bot <slug>`. Fail-closed
  when unset (`src/lib/server/previewAuth.ts`, docs/agent-screenshots.md).
- **No indexing**: robots.txt disallows everything, every page carries a
  `noindex, nofollow` meta tag and every response an `X-Robots-Tag` header.

### Fixed

- **Uploads of `.m4a` files from a Mac or iPhone** were refused: the browser
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
  labels them `audio/x-m4a` and the upload token only allowed `audio/mp4`.
  The content type now comes from the extension for stems and demos alike.
- **Switching tracks while playing** (project playlist, demo player) left the
  new track paused.
- **Hovering "Sign out" signed you out.** The nav link pointed at a page
  whose load ended the session, and links preload on hover. Signing out is
  now a POST (remote form); the `/sign-out` page is gone.

### Changed

- **Accounts are in the URL**: `/[account]/projects/…` and
  `/[account]/settings`; old `/projects…` and `/settings` addresses redirect
  to the user's first account. Viewing and playing are public by URL;
  uploading, renaming, deleting, settings and the editors need membership,
  which every mutation checks on the server (`src/lib/server/access.ts`)
  and pages use only to show or hide controls.
- **Stems load three at a time** instead of one after another (fetch and
  decode overlap); a six-stem song was ready in half the time on a fast
  connection, and with the renditions a 50 Mbps connection went from 68 s
  to 9 s until Play enables.
- **Adding a song is a popover** opened from an "Add Song" button beside the
  Songs heading on the project page (and from the empty state), replacing
  the form at the bottom of the page.
- **Project playlist**: the project page has a player that plays the
  songs' original mixes in order (previous / play / next, position slider,
  Space and Home), and a play button on each song row. Mixes are now
  rendered ahead of time whenever a song's stems change, and page loads
  catch up any that are missing. Migration 0009 adds the render lock.
- **Go to beginning** button on the transport, left of Play (Home does the
  same from the keyboard).
- **Two MP3 buttons** — "Original Mix (MP3)" and "Custom Mix (MP3)" — in
  place of one button with a toggle.
- **Song settings are a popover** opened from the gear in the song header
  (native `popover="auto"`: top layer, Esc and click-outside close it). The
  delete-song action lives at the bottom of that panel.
- **Layout and style pass** (brand font Bahiana, tiles and panels, two-column
  song page); validation and error text uses `text-red-400`, and the removed
  `solo`, `playhead` and `oxfordDark` palette tokens are no longer referenced
  by components.
- **Uploads report channels after the dual-mono collapse**, so a dual-mono
  file gets a mono rendition.

### Technical

- Migrations 0006–0011: Better Auth tables, `playback_*` on stems and
  demos, the song's mix cache and render lock, `songwriter` / `written_on`,
  the `demo` table.
- `ffmpeg-static` (in `trustedDependencies`; Vercel's tracer packages the
  binary), `server/background.ts` around Vercel's request-context
  `waitUntil`, `maxDuration: 300` on the routes that render after responding.
- Route `config` exports and `$val` schemas are ignored by Fallow's
  dead-code check; the transcode ↔ mix import cycle is gone.

## [0.1.0] - 2026-09-12

First versioned release: the proof-of-concept player became a working
multi-tenant app over 2026-09-11 and 12.

### Added

- **Projects → songs → stems in Turso** (Drizzle, per-table schema files,
  nanoid ids, ms timestamps), seeded with one account and owner until
  sign-in exists; `hooks.server.ts` puts them on `event.locals`.
- **Browser → Vercel Blob uploads** in three steps (reserve row, upload to an
  ID-based pathname, report decoded duration/channels/peaks), with an
  "Add New Stems" button, per-stem Download / Rename / Upload new version /
  Remove in each player row's menu, "Download All" as a client-built zip, a
  32-stem cap per song, and format validation by extension (WAV, FLAC, MP3,
  M4A, AAC).
- **Chart and lyrics** per song: markdown documents edited with
  `@kevinpeckham/woof-editor` (Rendered / Markdown toggle, undo/redo,
  Cmd/Ctrl+S, unsaved-changes guard), hash-gated version history (ten kept)
  and an accidental-wipe guard; the song page renders either behind a
  Chart / Lyrics toggle through an ESM allowlist sanitizer over parse5.
- **Settings** for projects (name, URL), songs (title, URL, description) and
  the account (name, slug, usage, members), all as SvelteKit remote `form`
  functions validated by valibot schemas in `src/lib/val/`.
- **Configuration with varlock + 1Password**: `.env.schema` declares every
  variable; secrets load from a 1Password environment at build time and are
  injected into the SSR bundle encrypted (`_VARLOCK_ENV_KEY`). Vercel holds
  only `OP_TOKEN`, `OP_ENV_ID` and the key.
- **Player**: renders immediately from stored peaks and durations and
  enables play/seek when every stem is decoded; dual-mono files collapse to
  one channel; Space is the transport from anywhere except text entry.
- **Tooling**: Fallow (dead code, health) with its MCP server, Playwright +
  Chromium with `bun run shot` for agent screenshots, `bun run smoke:blob`
  driving the real upload flow, Bun pinned via `packageManager` and installed
  on Vercel with `npx bun@<version>`.

### Changed

- **Redesigned to match lightningjar.com**: the UnoCSS config mirrors
  lj-website's (wind4 + reset, Atkinson Hyperlegible / Bungee Shade, palette,
  shortcuts, Phosphor icons); every style is a utility or shortcut, with no
  stylesheets of our own.
- Form actions were replaced by remote functions throughout; redirect
  targets are derived from the database, not the request URL.
- The test kick stem's synthesis integrates its pitch sweep into phase
  (it chirped).

### Technical

- Server dependencies must be ESM: Vercel's Node 24 launcher refused
  CommonJS `require()` of ES modules at cold start (jsdom via DOMPurify,
  then htmlparser2 via sanitize-html), which took every route down until the
  sanitizer was replaced. See `docs/environment.md`.
- Migrations 0000–0005 (initial tables, chart columns, description,
  lyrics + `song_doc_version`).
