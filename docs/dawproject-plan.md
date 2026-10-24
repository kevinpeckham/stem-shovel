# DAWproject in and out of Dawn: the plan

Kevin, 2026-10-21: "Is there a standard DAW file format that can be
imported and exported from major DAWs? If so, let's spec out the work to
open those files into Dawn and support users exporting / saving Dawn
projects in that format to their machine and / or a link to such a file
in our storage."

## The format landscape

There is one open interchange format for whole sessions, and Dawn already
writes it: **DAWproject** (Bitwig and PreSonus, 2023; specification and
schema public at github.com/bitwig/dawproject). A `.dawproject` is a zip
holding `project.xml` (transport, tracks and channels, clips, notes,
automation, markers, device state), `metadata.xml` and the audio files.
Native support as far as the trade press has reported it:

| DAW                                           | DAWproject        | Notes                                                           |
| --------------------------------------------- | ----------------- | --------------------------------------------------------------- |
| Bitwig Studio                                 | import and export | since 5.0.9                                                     |
| PreSonus Studio One                           | import and export | since 6.5                                                       |
| Steinberg Cubase, Nuendo                      | import and export | since Cubase 14 and Nuendo 14                                   |
| Fender Studio                                 | reported          |                                                                 |
| Reaper                                        | third party       | a community converter                                           |
| Ableton Live, Logic Pro, Pro Tools, FL Studio | none reported     | a commercial converter (WG DAW Converter) bridges some of these |

The alternatives are worse fits. **AAF** and **OMF** are the post-production
exchange formats (Pro Tools, Avid): binary, licensed SDKs, no notes or
device state, nothing a browser writes comfortably. The native formats
(Ableton `.als`, Logic, Pro Tools `.ptx`, Reaper `.rpp`) are one DAW each,
and only Reaper's is documented. **A folder of aligned stems plus a MIDI
file** is the lowest common denominator every DAW opens, and Dawn's export
already produces it (a WAV or MP3 per track and bus; `.mid` per MIDI clip).

So: DAWproject is the one to open and to save, and stems-plus-MIDI stays
the fallback for the DAWs without it.

## Where Dawn stands

`utils/dawproject.ts` writes version 1.0 from an arrangement: the
transport (tempo, time signature), a track per track and bus and the
master with a channel each (volume, pan, mute, solo, destination, sends),
the clips in seconds (an audio clip over its file with offset and fades;
a MIDI clip's notes), the volume and pan lanes as automation points,
`metadata.xml` with the title, and `audio/<sourceId>.wav` per source
(24-bit, whatever the export's audio format). Inserts stay out: the
format names a DAW's own devices, and ours are not theirs. The Export
panel downloads it to the machine (`studioExport.ts`, `zipBlobs.ts`).
There is no reader, and nothing saves the archive on Stem Shovel.

## The work

### Phase 1: open a DAWproject in Dawn (the reader)

**Done 2026-10-21** (docs/multitrack-recorder.md, "Opening a DAWproject").

A pure parser beside the writer, `utils/dawprojectRead.ts`:
`readDawproject(xml: string): { title, arrangement: StudioArrangement,
files: { sourceId, path, trackLabel }[], dropped: string[] }`. It takes
`project.xml` as a string (the page hands it the archive's entry) and
gives back an arrangement in Dawn's shape, the audio files it wants, and
a plain list of what it could not carry (for the import report).

What maps, and how:

- **Transport**: `Tempo` and `TimeSignature` to `bpm` and `beatsPerBar`
  (the note value dropped, as the stem player's meter is). Tempo and
  signature automation points, when present, to `tempoChanges` and
  `meterChanges`.
- **Time units**: a DAWproject's `Timeline` elements say `timeUnit`
  `beats` or `seconds`, and a nested timeline may override its parent's.
  Beats convert through the tempo map (`audio/measures.ts`); Bitwig and
  Studio One write beats, we write seconds, both must read.
- **Tracks**: `Track` with `contentType` `audio` to an audio track,
  `notes` to a MIDI track, both to audio (notes dropped, reported). A
  track's `Channel`: `Volume` (linear), `Pan` (0..1 to -1..1), `Mute`,
  `Solo`, and its `destination`: a channel of another track is a bus
  (`buses` gains one per such channel, the master excluded); `Sends` to
  `sends` where the destination is a bus. Nested group tracks flatten:
  the group becomes a bus, its children tracks routed to it. Color to
  `colour` when it is one of ours, else dropped. Over `MAX_STUDIO_TRACKS`
  (16): the first 16 stay, the rest are reported.
- **Clips**: `Lanes` → `Clips` → `Clip`. `time`, `duration`,
  `playStart`, `fadeInTime`, `fadeOutTime` to `start`, `duration`,
  `offset`, `fadeIn`, `fadeOut`; `name`. An audio clip's `Audio` with its
  `File path` becomes a source (the `sourceId` minted here, the path
  recorded for the loader); `Warps` are read only as a plain offset and
  stretch is reported (Dawn has none). A clip's own `Clips` (a clip
  holding clips, as Bitwig writes launcher content) flattens one level.
  Notes clips: `Notes` → `Note` (`time`, `duration`, `key`, `velocity`,
  `channel`) to `notes` in Dawn's note shape.
- **Automation**: `Points` on a channel's `Volume` and `Pan` to the
  track's `automation` lanes (the two Dawn has); points on anything else
  reported. `Markers` to `markers`.
- **Devices and plugins**: dropped and reported by name, so the user
  knows what to re-add ("Pro-Q 3 on Drums did not come across").
- **Metadata**: `Title` to the song's title, `Artist`, `Comment` to the
  notes.

The loader on the page (`+page.svelte`, beside `importFiles`): the file
input and the drop accept `.dawproject` (and `.zip` that holds a
`project.xml`); `fflate`'s `unzipSync` opens it in the browser (it is in
the bundle for the writer already); `readDawproject` reads the XML;
each wanted audio file (`audio/…`, any format the browser decodes:
WAV, FLAC, AIFF, MP3, AAC) goes through the existing import path, which
is `studio.decodeFile` plus `studio.importBuffer` with the blob, so it
becomes a source (uploaded by the queue signed in, kept in the browser
signed out) under the id the parser minted; `MAX_TAKE_BYTES` (120 MB) a
file and `MAX_STUDIO_SOURCES` a song apply, over which the file is
reported. The import lands as a **new Dawn song** named from the
metadata (the open song autosaved first, as "Open stems in Dawn" does),
its arrangement replaced wholesale once the sources are in. A report
notification, or a small panel for a long one: tracks and clips in,
and the dropped list.

Tests: unit tests on the parser with three fixtures, our own writer's
output (a round trip: `readDawproject(dawproject(a))` gives `a` back up
to ids and the dropped inserts), a Bitwig example from the
specification's test files (beats, nested tracks, warps, devices), and
a Studio One export. A browser spec opening a small archive from
`static/` into Dawn, signed in (sources uploaded) and signed out
(sources kept).

Effort: two days, most of it the parser and its fixtures.

### Phase 2: save the archive on Stem Shovel, with a link

**Done 2026-10-21**, the jobs-function route (docs/multitrack-recorder.md, "A DAWproject into a song's files").

Today the archive downloads. Kevin: also "a link to such a file in our
storage". Two routes, one recommended:

- **The browser uploads what it just made** (the Export panel's "Save to
  the song" beside "Export"): the archive is a **song file** (the
  attachments table, `kind: "dawproject"`, a new `FileKind`) under a
  chosen song of a project the user edits, through the attachments'
  reserve → upload → ready path, which already gives every file a
  permanent address (`/f/<code>`) and a place on the song page's Files.
  Simple, and it works signed in only (the file needs an account's
  storage). The catch is size: sixteen tracks of 24-bit WAV for a
  four-minute song is around 700 MB, far over the attachment ceiling,
  and the browser holds it all in memory to zip it.
- **The jobs function renders it** (recommended for the storage case):
  a `dawproject-export` job scheduled from a remote command
  (`scheduleDawprojectExport(ideaId, songId, { audio: "flac" | "wav16" |
  "wav24" })`): it has the Dawn song's revision and its sources' URLs,
  runs the same pure writer in Node, fetches each source once and
  transcodes it with ffmpeg (FLAC by default: lossless at roughly half
  the size, and every DAWproject reader decodes it), streams the zip
  (fflate in Node) to Blob as a song file, and notifies the user with the
  link when it is ready. No browser memory, no upload ceiling, and the
  file carries a note of the revision it came from. The Dawn page shows
  "Saving the DAWproject…" and then the link; the song page lists it
  under Files with "Open in Dawn" (phase 1's reader, fed from storage).

The download to the machine stays as it is, with FLAC added as an audio
choice for the archive once the jobs path has the encoder (in the
browser, mediabunny's `FlacOutputFormat` can write FLAC where WebCodecs
has a FLAC encoder, which Chromium does and Safari may not; WAV stays the
fallback).

Data: `FileKind` gains `dawproject`; the file's `description` records
the Dawn song and revision. No new table; a share link for a file is
`/f/<code>` already. Storage counts the archive as any attachment.

Effort: a day and a half for the job, the command, the Files listing and
"Open in Dawn"; half a day for the browser route if wanted as well.

### Phase 3: the other DAWs' dialects

**Bitwig's, 2026-10-21.** Kevin owns none of these DAWs, so the files
came from public repositories: three Bitwig Studio 5.3.13 exports
(github.com/gmlewis: Canon in D, Dance of the Sugar Plum Fairy and its
strings alone; MIDI arrangements of thirteen instruments, tempo
automation, markers, sends, VST3 and built-in devices), a Bitwig 5.0
example project with a warped drum loop (github.com/designerzen), and two
small fixtures written by another DAWproject tool (Pulp). All read
without an error; what they taught, now in the reader and its tests:
Bitwig writes an empty metadata title (the song is named after the
archive), tempos with float noise ("100.000167", rounded to two
decimals), sends switched off with an `<Enable value="false"/>` (no
send), clips with `enable="false"` (kept, switched off), MIDI controller
lanes as `Points` whose `Target` is an `expression` rather than a
parameter, beside the `Notes` inside the clip (kept as the clip's
expression lanes; the schema's clip allows one child, so this form of
Bitwig's own does not validate against it), a scenes section with clip
slots (reported), and everything in beats with `loopStart`/`loopEnd` on
every clip (a loop the clip's own length is no loop). Studio
One and Cubase exports are still wanted; the probe that runs a folder of
archives through the reader is easy to recreate (unzip with fflate,
`readDawproject` under jsdom's `DOMParser`).

**Converters', the same day.** No Cubase, Nuendo or Studio One export is
published anywhere I could find (GitHub code search over every
`.dawproject` and `project.xml`), so the next best were files other tools
wrote for those DAWs: a Reaper drum session of 45 tracks and 1,316 clips
converted by ProjectConverter 1.2.8 (kept as a reference by
github.com/poznas/flp-to-dawproject), and that converter's own
Cubase-bound output. They taught: a lowercase `<markers>` element (names
now compare without case), tempo automation as `Points` on the Tempo
parameter inside the lanes rather than `TempoAutomation` (read as tempo
changes), a folder track with no channel and no children (Cubase's
"Input/Output", `contentType="tracks"`; skipped), colors with an alpha
byte (`#a2eabfff`; the tint is the first six digits), hundreds of
plugins to report (the page shows a dozen and a count), and Dawn's
limits met for real (the first 64 tracks, 32 buses and 1000 clips come in,
the rest are named). The converter's warps map a whole file across a
clip, which reads as a stretch and is reported as one; that is the
converter's doing, not the DAWs'.

Reading real exports from Bitwig, Studio One and Cubase will turn up
things the specification allows and this plan does not name: nested
timelines, `Lanes` per clip, clip launcher scenes, comping takes,
unusual time units, device chains inside channels. Each goes in as a
parser case with a fixture. Budget half a day per DAW after the first
real file arrives, and keep the dropped-items report honest: a user who
sees "did not come across" trusts the rest.

**The reference suite and DawVert, the same day.** Kevin: "Are there any
open source converters that could be installed on this VM?" Two were,
and they paid off. OpenJDK 21 and Bitwig's reference library
(`./gradlew test` writes twenty projects into `target/`: audio in beats
and seconds, with offsets, fades and warps, absolute and relative file
paths, MIDI controller and pitch-bend automation in clips and on
tracks, and a "complex" project with alias clips, markers, automation
and a plugin). They taught the reference writer's own shape: the master
track first with an empty content type, `Clips` naming their track
rather than `Lanes` (any timeline may carry `track`), no time signature
in the transport, and **alias clips** (`reference="<id>"` to a clip or
its content), which now play their original's notes or source where the
alias sits. DawVert (Python, in a `uv` venv) converted four public
Reaper projects and two Ableton Live 11 sets to DAWproject, all of which
read (DawVert carries little of a Reaper project without its audio;
Live 9 and 10 sets it refuses). The other way: a Dawn export with audio,
a bus, a send, automation, a marker and a tempo change went through
DawVert into a Reaper project (the tracks, the return bus, the items), an
Ableton set (the tracks, the MIDI clip and its notes) and a MIDI file
(the notes), which is the first third-party reading of Dawn's writer.
`scripts/dawproject-probe.ts` runs a folder of archives through the
reader; the corpus stays outside the repo (the VM's job folder, the
sources named in the script).

## What the format carries that Dawn lacks (2026-10-21)

Kevin: "as you notice additional specs in the DAWproject file format for
features Dawn may not currently support, let's create a list of
additional features to consider adding to Dawn." From the schema
(`Project.xsd`) and the real Bitwig exports, what a DAWproject can say
and Dawn cannot yet, roughly in the order a songwriter would miss them:

1. **Clip looping** (`loopStart`, `loopEnd`): a clip that repeats its
   content for its length. Bitwig writes it on every clip. Done
   2026-10-22: `loop` on the clip, unrolled through `utils/clipSegments.ts`
   everywhere (docs/multitrack-recorder.md "Looping a clip"); the reader
   keeps a loop that comes round within the clip, the writer emits it.
2. **Switched-off clips** (`enable="false"`): a clip kept but silent,
   the way a muted track is. Done 2026-10-22: `muted` on the clip, the
   Off button (Shift+M), read and written by every reader and writer
   (docs/multitrack-recorder.md "Switched-off clips").
3. **MIDI expression lanes** (`Points` with a `Target expression`:
   controller, pitch bend, channel and polyphonic pressure, timbre) and
   **release velocity** on a note (`rel`): CC lanes inside a notes clip.
   Done 2026-10-22 for controllers, the pitch bend and channel pressure:
   `lanes` on the clip, recorded from the piano's pedal, wheels and bend
   (the piano had taken none of them from a clip before; the bend is new
   on its voices), played back through the piano, edited in the roll,
   read and written by the DAWproject, Reaper and MIDI file code
   (docs/multitrack-recorder.md "Expression lanes"). Still open:
   polyphonic pressure, timbre and release velocity.
4. **Automation beyond volume and pan**: a send's level and its on/off,
   mute as a lane, device parameters, and the master's own lanes. Done
   2026-10-22 for the send's level, the mute (a stepped lane) and the
   master's volume and mute: read and written by the DAWproject and
   Reaper code, read from a Live set, edited in the timeline's new bus
   and master rows (docs/multitrack-recorder.md "Wider automation").
   Still open: a send's on/off (no such switch in Dawn) and device
   parameters (Dawn's inserts have no device in the format; item 9).
5. **Tempo ramps**: a `RealPoint` with `interpolation="linear"` between
   tempos (a ritardando). Done 2026-10-23: `ramp` on a tempo change, on
   two curves ("time" as Reaper runs them, "beats" as a DAWproject and
   Live do), the grid and the click integrating them, read and written
   by every format (docs/multitrack-recorder.md "Tempo ramps").
6. **Audio warping and stretch** (`Warps`, `algorithm="stretch"` and
   kin): a loop at 170 bpm played at 149. Done 2026-10-23 as `warp` on
   a clip (points from the clip's content seconds to the file's), the
   engine playing a WSOLA rendering made in a worker, Alt-drag and a
   Clip tempo field to set it, read and written by DAWproject and
   Reaper (play rate or stretch markers), read from Live
   (docs/multitrack-recorder.md "Warping a clip"), and the warp-marker
   editor the same day: markers on the selected clip, Alt-click to add,
   drag onto the grid, Delete to remove ("Editing markers").
7. **Folder tracks**: a group with children that keep their own channels
   and routing. **Done 2026-10-23**: a `folder` bus is a group with a row
   in the timeline that folds its tracks away, a bus's `output` nests a
   group in a group, and the readers and writers keep the tree
   (docs/multitrack-recorder.md "Folder tracks"). A folder's own clips
   land on a track of their own inside it (2026-10-24).
8. **The clip launcher** (`Scenes`, `ClipSlot`): Bitwig's and Live's
   session view, scenes of clips fired live. Far from Dawn's timeline
   model; worth knowing it exists in every Bitwig export (eight empty
   scenes by default).
9. **Devices and plugins**: built-in device chains with parameters and
   state, VST3, CLAP and AU plugins with presets in the archive
   (`plugins/*.vstpreset`). Dawn's inserts are its own; the plan's
   further-out WAM 2.0 hosting is the only route to carrying a chain.
10. **Mono tracks** (`audioChannels="1"`): a channel that is one channel.
    Done 2026-10-23: `mono` on a track, the strip summing to one channel
    through the inserts and panning as a point source, the mixer's Mono
    switch, read and written by the DAWproject code, set for a
    one-channel stem opened in Dawn (docs/multitrack-recorder.md "Mono
    tracks").
11. **Metadata**: artist, album, original artist, songwriter, producer,
    year, genre, copyright, comment, website. Done 2026-10-23: every
    field both ways, the song page's credits, songwriter, year and
    address feeding the export into a song's files, the Dawn song's
    notes as the comment, an import's fields into the notes
    (docs/multitrack-recorder.md "Song metadata in the files").
12. **Arbitrary track colors** (`color="#ff5706"`): Done 2026-10-23: a
    track's `colour` takes any `#rrggbb` beside the tints, an "Any
    color" swatch sets it, and every reader keeps a DAW's color as it
    was ("Track colors").
13. **Take lanes within a track** (`Lanes` nested under a track's lanes):
    comping lanes. Done 2026-10-24: a clip's alternates go out as Lanes
    inside the clip (one per take, the chosen first) and come back as
    alternates; Reaper's other takes likewise, both ways
    (docs/multitrack-recorder.md "Takes in the files").
14. **Video** (`Video` clips over a file): a picture track to score to.
    Not a songwriter's tool today; noted for completeness.
15. **Cue markers with colors** and **time-signature denominators**
    other than four (6/8 as 6 over 8, not 6 over 4). The denominator
    done 2026-10-23: `beatUnit` on the song and a meter change, the
    tempo kept in quarter notes as the formats count it, read and
    written by every format ("Time-signature denominators"). Cue
    marker colors remain.

The cheap ones (2, the on/off; 11, the metadata; 12, colors; 15's
denominator) were an afternoon each, and are done. The ones a songwriter would feel
most (1, clip looping; 3, expression lanes; 4, wider automation; 5,
tempo ramps) are a few days each and worth their own plan. 6, 7, 8, 9
and 13 are large; 10 and 14 are judgement calls.

## Roadmap: a free online converter (Kevin, 2026-10-21)

The wider plan, which DAWs are the targets, what each can read, and how
to test the exchange on Linux, Mac and Windows, is docs/daw-interop-plan.md.

Kevin: "Let's add creating our own free online converter to the product
roadmap for this app." A public page, like the tuner, the metronome and
the drum machine (indexable, usable signed out, a way in for people who
have never heard of Stem Shovel): drop a session file, get it back in
another format, nothing kept unless you sign in and send it to a song or
open it in Dawn.

What Dawn already has makes the first version cheap: a DAWproject reader
and writer, a MIDI file reader and writer, a stems-plus-MIDI export, the
jobs function with ffmpeg for audio transcoding, and the browser's own
decoding. So the conversions, in the order they come free:

1. **DAWproject → stems and MIDI** (any DAW opens the result; for the
   DAWs without DAWproject support: Ableton Live, Logic, Pro Tools, FL
   Studio). The reader, a render per track in the browser, a `.mid` per
   notes clip, one zip. **Done 2026-10-21** as `/convert` (Tools menu,
   footer, sitemap; page copy `convert-page`): the archive through
   `utils/unpackDawproject.ts` (shared with Dawn's import), the audio
   decoded by an offline context, `audio/convertEngine.ts` as the export
   engine (clips through fader and pan, buses, the master; no inserts,
   sends or automation; a MIDI track is not renderable, the new
   `ExportEngine.renders`), and the Studio's own Export panel, so the
   page converts to the mix, stems per track and bus, a DAWproject (step
   2's repack, minus the lint and the FLAC re-encode), the session
   bundle and a Sandyne project. tests/e2e/convert.spec.ts.
2. **DAWproject → DAWproject** with the audio re-encoded (FLAC to WAV
   and back, bit depths), the trims applied, a report of what the file
   holds: a "lint and repack" that also normalizes other writers' quirks
   (the dialects phase 3 found) into clean files for picky importers.
   **Done 2026-10-22**, in the browser: the audio comes out as WAV at the
   panel's bit depth (16 or 24; FLAC and MP3 in, WAV out, so "back to
   FLAC" stays the jobs function's, through Dawn's "DAWproject in the
   song's files" for a signed-in user), `ExportOptions.trim` writes one
   file per clip holding only what the clip plays with the clip rewritten
   from zero (`sourceFiles` in audio/studioExport.ts; the Sandyne project
   takes it too), and the reader reports what it read into Dawn's ways
   (`DawprojectRead.fixed`: float-noise tempos, beats to seconds,
   decibels to linear, alpha colors and colors outside the palette, an
   empty folder, a missing time signature, tempo ramps as steps, an alias
   as a copy) under "Normalized" on the page beside "Not carried across",
   and in Dawn's import notification.
3. **Reaper `.rpp` ↔ DAWproject.** Reaper's project is a documented text
   format (every public project on GitHub is readable in an editor), the
   DAW most likely to be used by Stem Shovel's kind of musician without
   DAWproject support, and ProjectConverter has shown the mapping works.
   **Done 2026-10-22**, both ways: `utils/rppRead.ts` reads a project
   into the same shape the DAWproject reader gives (tracks with levels,
   pans, mutes, solos, colors and volume and pan envelopes; folders as
   buses and receives as sends; each item's active take as a clip in
   seconds with its offset, volume and fades over its media file, or a
   MIDI take's notes through the tempo map; the tempo envelope's points
   with their time signatures; markers and regions; the notes; the sample
   rate), reporting what has no place in Dawn and what it normalized, and
   `utils/rpp.ts` writes one (`ExportOptions.reaper`, "A Reaper project"
   on the Export panel: a folder per bus holding its tracks, a receive per
   send, envelopes, items over `media/` beside the file, MIDI items as
   events in ticks, the tempo map, markers, the key in the project notes).
   `utils/unpackProject.ts` opens either kind of file, a Reaper project's
   media coming as the files dropped beside it or inside a zip; the
   converter and Dawn's import ("Import audio, MIDI or a project…") take
   both. The corpus is Reaper's own saving of the interop bundle
   (tests/rpp/reaper-7.82.RPP); `bun run interop:rpp`
   (scripts/interop/rpp.ts, rpp.lua) has Reaper 7.82 open a written
   project under Xvfb and judges what it holds through its API, then reads
   Reaper's re-saved file back through the reader: every check passes,
   including the pan envelope, which Reaper stores the other way up from
   its knob (FINDINGS.md).
4. **Ableton Live `.als` → DAWproject.** A gzipped XML set; DawVert's
   reader shows what the tags mean. One way only: Live cannot read
   DAWproject, and writing a Live set that Live accepts is a deeper hole.
   **Done 2026-10-22.** `utils/alsRead.ts` reads a set (Live 9 to 12:
   `MasterTrack` or Live 12's `MainTrack`, `Color` or Live 9's
   `ColorIndex`) into Dawn's shape through `utils/unpackProject.ts`
   (format "ableton": a bare `.als`, gzipped or the XML itself, or a zip
   of the Live project folder with its `Samples/`; the set's `Backup/`
   copies are skipped). The tempo and its automation (as steps at the
   points: Live ramps between them), the time signature and its changes
   (an enum: numerator = value mod 99 + 1, denominator = 2 to the power of
   value div 99; the master's envelope with `PointeeId` 10), the locators
   as markers, the master's volume; a track per audio and MIDI track with
   volume (Live's fader runs to +6 dB, clamped to Dawn's and reported),
   pan, `Speaker` as the mute, the color as the nearest of Dawn's tints by
   hue (`constants/liveColors.ts` is Live's palette by index; RGB distance
   finds nothing, Live's colors being saturated) and the volume and pan
   envelopes (`AutomationEnvelopes` by the mixer's `AutomationTarget` ids);
   a group track as a bus the tracks with its `TrackGroupId` route to, a
   return track as a bus the `Sends/TrackSendHolder` levels feed by index
   (−70 dB, 0.000316, is off; a group inside a group goes to the master,
   reported). The arrangement's clips (`MainSequencer/Sample` or
   `ClipTimeable`, then `ArrangerAutomation/Events`) in seconds through
   the tempo map, `CurrentStart`/`CurrentEnd` being song beats: an audio
   clip over its `SampleRef/FileRef` (`RelativePath` when it stays inside
   the project folder, else `Path`), a warped clip's content beats mapped
   to the sample's seconds through its `WarpMarkers` (reported when Live
   plays the file at another speed than the song's tempo, more than 2 %
   off), an unwarped clip's `Loop/LoopStart` being seconds into the file;
   a looped clip (`LoopOn`) unrolled over its length from
   `LoopStart + StartRelative`, a clip per pass with the fades at the outer
   edges only; `SampleVolume` as the gain, `Fades` in beats; a MIDI clip's
   `KeyTracks` notes (velocity 0 to 127, `IsEnabled`) unrolled the same
   way, a note that crosses the loop's end stopped there as Live stops it.
   Left out and reported: devices and plug-ins (named by `UserName`, the
   VST or VST3 plug-in's name, or Live's tag), session-view clips (counted),
   deactivated clips, transposed clips (`PitchCoarse`/`PitchFine`), clip
   envelopes, track delays, crossfades. The corpus is tests/als (a Live
   12.2.1 set under MIT, with its owner's paths made generic) plus three
   Live 11 sets and a Live 9 and 10 template read in the scratchpad; the
   convert page and Dawn's import accept `.als`; tests/e2e/convert.spec.ts
   covers the round trip to a DAWproject. Not proven in Live itself (there
   is no Linux Live); the reader's beat and warp arithmetic is checked
   against the sets' own numbers (a 120 bpm loop in a 124 bpm set, the
   `LoopEnd` of 16 beats over 8 seconds of file).
5. **MIDI → DAWproject**, a type-0 or type-1 file as notes tracks at the
   file's tempo map: trivial once 1 exists, and a way to open any MIDI
   file in a DAW with the tempo map intact. **Done 2026-10-22.**
   `utils/midiRead.ts` reads a Standard MIDI File into Dawn's shape
   through `utils/unpackProject.ts` (format "midi": the `MThd` head or a
   `.mid`/`.midi` name) on top of `audio/midi.ts`, which now keeps each
   note's track index, the track names by index, the track count and a
   count of the channel events it skips. A format 1 file's tracks become
   MIDI tracks (a track on channel 10 a drums track; a named track with no
   notes is reported) with one clip of their notes from the first to the
   last, split at Dawn's note limit; the conductor's name is the title. A
   format 0 file's channels become the tracks (one channel alone takes the
   track's or the file's name). The tempo map (steps at the file's tempo
   events, already in seconds), the meters (numerator clamped to Dawn's 2
   to 7, a denominator other than 4 reported), the key and its changes
   (from the key signature: sharps to Dawn's spelling, "Bb", "F#m") and the
   markers come from the conductor. Controllers, pitch bend, pressure and
   program changes are counted and reported; there is no audio to find.
   The reader round-trips the session bundle's own MIDI file
   (utils/sessionMidi.ts) in its test; the convert page accepts `.mid`
   and `.midi` and tests/e2e/convert.spec.ts covers a file to a
   DAWproject. Dawn's own import keeps its earlier behavior (a MIDI file
   lands as a clip on the current song); the converter is where a MIDI
   file becomes a project.

Where it runs: in the browser for everything but audio transcoding (the
file never leaves the machine, which is the honest pitch for a free
tool), the jobs function for FLAC and WAV re-encoding when the user is
signed in and wants the result kept in a song's files. The page would
live under Tools as "Convert" (`/convert`), with the formats' own words on
it for search. Each conversion is a pure module beside the DAWproject
reader and writer (`utils/rpp*.ts`, `utils/als*.ts`), tested against the
corpus phase 3 gathered, and reusable by Dawn's own import (open a Reaper
project in Dawn comes free with 3).

Effort: 1 is two days (it is mostly the export panel on a public page);
2 a day; 3 a week (Reaper's format is wide); 4 three or four days for
the arrangement, levels and clips, leaving devices out; 5 a day.

## Recommendations

1. Build phase 1 first: opening a DAWproject is what makes Dawn a stop on
   the way between DAWs, and the writer's round trip is the first test.
2. Take the jobs-function route for saving to storage, FLAC inside, with
   "Open in Dawn" on the saved file. The browser-upload route is not worth
   building alongside it.
3. Keep the stems-plus-MIDI export as the answer for Ableton, Logic and
   Pro Tools, and say so in the user docs beside the DAWproject options.

## Open questions

- Audio inside a saved archive: FLAC by default, 24-bit WAV on request?
- Where a saved archive belongs: a song's Files (the attachments) is the
  natural home, since that is where share links and downloads live; or
  should a Dawn song keep its own list of exports?
- Should opening a DAWproject be offered signed out? The reader and the
  kept sources make it free; the question is only whether to show it.

## Sources

- [Steinberg joins DAWproject support](https://www.production-expert.com/production-expert-1/steinberg-joins-dawproject-support-can-avid-ignore-it)
- [DAWproject: is it the fix we've been waiting for](https://www.production-expert.com/production-expert-1/dawproject-is-it-the-fix-weve-been-waiting-for)
- [Bitwig and PreSonus: sharing projects between programs](https://www.bitwig.com/stories/bitwig-and-presonus-are-making-it-easy-to-share-projects-between-programs-271/)
- [MusicRadar on the format](https://www.musicradar.com/news/bitwig-presonus-dawproject-file-format)
- [Sound On Sound on the format](https://www.soundonsound.com/news/bitwig-and-presonus-new-dawproject-format)
- [WG DAW Converter](https://www.production-expert.com/production-expert-1/wg-daw-converter-moves-sessions-between-pro-tools-cubase-logic-and-more)
