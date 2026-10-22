# Convert

Free DAW project converter that works in your browser. Drop a DAWproject from Bitwig Studio, Cubase, Studio One or Nuendo and get it back as stems and MIDI for any DAW, as a mix, or as a project for the free Sandyne DAW. Nothing is uploaded.

## How to use Convert

Choose a `.dawproject` file, or drop it on the page. Convert reads the project in your browser: the tracks and buses, the clips with their fades, levels and pans, the MIDI parts' notes, the tempo and time-signature changes and the markers, and decodes the audio inside. Then pick what you want:

- **The mix**: every track and bus through its fader and pan, as one WAV or MP3.
- **A stem per track**, or per bus, from the start of the project.
- **A DAWproject**: the same project written again by Stem Shovel, clean, for a picky importer: the audio as WAV at the bit depth you choose, the tempo, levels and colors in the plain form of the format, and, with **Trim** ticked, one recording per clip holding only what the clip plays. What the reader had to change is listed under "Normalized".
- **A session bundle** for the DAWs that read no project file: Logic Pro, Pro Tools, Ableton Live, Audacity, Reaper and GarageBand. Every clip as a Broadcast WAV stamped with its position in the song, a stem per track, a MIDI file with the tempo map, time signatures, key, markers and the MIDI parts, an Audacity label track, and a README with the menu path for each DAW.
- **A Sandyne project** for the free Sandyne DAW, with the recordings beside it.

Choose 24-bit or 16-bit WAV, or MP3, and **Normalize** to bring each file to the streaming services' level. The files come as one zip, or one download each.

### Quick Tips

- Inserts, sends and plugins have no place in a DAWproject that another DAW can read, so the stems and the mix are the clips through their faders and pans alone. Volume and pan automation travel in the DAWproject, not in the renders.
- A MIDI track has no instrument here: its notes go into the MIDI file (and the DAWproject), and it gets no stem.
- Everything comes out at one sample rate: the one most of the project's files have, shown under **Sample rate**, where you can choose another (44.1, 48, 88.2 or 96 kHz). A file at another rate is resampled and listed there.
- Anything the file holds that could not come across is listed under "Not carried across".
- Signed in, Dawn's **Import audio, MIDI or DAWproject…** opens the same file as a song you can edit, mix and export from.
