# Convert

Free DAW project converter that works in your browser. Drop a DAWproject from Bitwig Studio, Cubase, Studio One or Nuendo, a Reaper project, an Ableton Live set or a MIDI file, and get it back as stems and MIDI for any DAW, as a mix, as a DAWproject, as a Reaper project, or as a project for the free Sandyne DAW. Nothing is uploaded.

## How to use Convert

Choose a `.dawproject` file, or a Reaper `.rpp` or an Ableton Live `.als` together with its media files, or a MIDI file, or drop them on the page. Convert reads the project in your browser: the tracks and buses (Reaper's folders, Live's groups and returns), the clips with their fades, levels and pans, the volume and pan automation, the MIDI parts' notes, the tempo and time-signature changes and the markers (Live's locators), and decodes the audio. Then pick what you want:

- **The mix**: every track and bus through its fader and pan, as one WAV or MP3.
- **A stem per track**, or per bus, from the start of the project.
- **A DAWproject**: the same project written again by Stem Shovel, clean, for a picky importer: the audio as WAV at the bit depth you choose, the tempo, levels and colors in the plain form of the format, and, with **Trim** ticked, one recording per clip holding only what the clip plays. What the reader had to change is listed under "Normalized".
- **A Reaper project**: an `.rpp` with the tracks, a folder per bus, the clips, fades, levels, pans and envelopes, the MIDI parts' notes, the tempo map and the markers, and the recordings beside it; Reaper opens it as it is.
- **A session bundle** for the DAWs that read no project file: Logic Pro, Pro Tools, Ableton Live, Audacity, Reaper and GarageBand. Every clip as a Broadcast WAV stamped with its position in the song, a stem per track, a MIDI file with the tempo map, time signatures, key, markers and the MIDI parts, an Audacity label track, and a README with the menu path for each DAW.
- **A Sandyne project** for the free Sandyne DAW, with the recordings beside it.

Choose 24-bit or 16-bit WAV, or MP3, and **Normalize** to bring each file to the streaming services' level. The files come as one zip, or one download each.

### Quick Tips

- Inserts, sends and plugins have no place in a DAWproject that another DAW can read, so the stems and the mix are the clips through their faders and pans alone. Volume and pan automation travel in the DAWproject, not in the renders.
- A MIDI track has no instrument here: its notes go into the MIDI file (and the DAWproject), and it gets no stem.
- Everything comes out at one sample rate: the one most of the project's files have, shown under **Sample rate**, where you can choose another (44.1, 48, 88.2 or 96 kHz). A file at another rate is resampled and listed there.
- Anything the file holds that could not come across is listed under "Not carried across".
- A Reaper project or a Live set names its recordings by path and holds none: choose or drop them together with the `.rpp` or `.als` (or a zip of the project folder), and each is found by its name. One not given is listed under "Not carried across".
- A Live set comes across one way, from the arrangement view: a looped clip is laid out as many times as it plays, a warped clip plays at its file's own speed here (the summary says when Live had it at another tempo), and devices, session clips, and deactivated or transposed clips are listed under "Not carried across".
- A MIDI file comes in as a project of MIDI tracks (a track per track of the file, or per channel of a single-track file, channel 10 as drums) with its tempo map, time signatures, key and markers, so a DAWproject or a Reaper project made from it opens in the DAW with the tempo map intact. Controllers, pitch bend and program changes are left out and counted under "Not carried across".
- Signed in, Dawn's **Import audio, MIDI or a project…** opens the same file as a song you can edit, mix and export from.
