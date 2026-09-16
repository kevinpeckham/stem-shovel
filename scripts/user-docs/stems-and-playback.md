# Stems and playback

## Uploading stems

On a song page, **Add Stems** takes one or more audio files: WAV, FLAC, MP3, M4A or AAC, up to 500 MB each and 32 stems per song. The name of the stem comes from the filename; rename it later from the row's ⋯ menu.

Each stem is kept as uploaded (that is what you download later) and a lighter playback rendition is made from it, so a song loads quickly even when the stems are large WAVs.

## What the upload detects

As stems upload, Stem Shovel listens to them and works out the tempo, the key and whether the song is in four or three. If the song has no tempo, key or time signature yet, they are set for you and a notice says what was found; check them in the song's settings, since detection is a good guess rather than a promise, and change them if the song knows better. A song that already has them keeps its own.

## The player

Every stem gets a row: its waveform, **M** (mute), **S** (solo) and a fader. Solo one or more stems to hear only those; mute drops a stem from the mix. The **Master** fader scales everything.

The transport above the stems has play/pause, a go-to-beginning button and a readout of the position. Click anywhere on a waveform to jump there. **Space** plays and pauses from anywhere on the page, and **Home** goes back to the beginning.

Playback starts once every stem has been decoded; the status line under the stems counts them in.

## Positions: timecode and bars

The readout shows the position as **timecode** (`minutes:seconds:frames.subframes`, the way Logic Pro does, at the song's frame rate) or as **bars and beats** (`45 | 1`). When the song has a tempo and a time signature, bars are the default; click the readout to switch. Anywhere a position is typed, such as a section start or a comment's spot, either format is accepted, and so is plain `1:23.5`.

## Sections and the timeline

If the song has sections, a row above the stems shows them with their numerals; the current one is highlighted while playing, and hovering shows the name and the length in bars. Sections and the song's tempo, key and time signature changes are entered in the song's settings.

## MIDI

A stem can carry a MIDI file (from the row's ⋯ menu). It gets a **MIDI** chip beside its name; click the chip to swap the waveform for a piano roll of the notes, and click again to go back. The MIDI file downloads from the same menu.
