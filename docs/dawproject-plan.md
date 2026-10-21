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
  the group becomes a bus, its children tracks routed to it. Colour to
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

Reading real exports from Bitwig, Studio One and Cubase will turn up
things the specification allows and this plan does not name: nested
timelines, `Lanes` per clip, clip launcher scenes, comping takes,
unusual time units, device chains inside channels. Each goes in as a
parser case with a fixture. Budget half a day per DAW after the first
real file arrives, and keep the dropped-items report honest: a user who
sees "did not come across" trusts the rest.

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
