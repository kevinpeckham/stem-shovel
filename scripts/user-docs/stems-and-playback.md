# Stems and playback

## Uploading stems

On a song page, **Add Stems** takes one or more audio files: WAV, FLAC, MP3, M4A or AAC, up to 500 MB each. There is no set number of stems a song can hold; what limits a song is the listener's device, since every stem is decoded into memory to play (a four-minute stereo stem is about 60 MB decoded). Past about a gigabyte in all, the uploader says so, and the player shows a note under its header on a device that may not have the room; if a page goes blank or reloads while a big song loads, that is the browser running out of memory, and the player says so the next time. A computer handles far more than a phone. A song past what the device can hold is **streamed** instead on browsers that can (Chrome, Edge, Firefox on a computer, Safari 26 and later): only a few seconds around the playhead are decoded at a time, so a song of any size plays, at the cost of a moment's buffering after a seek. The line under the stems says which way a song is playing, and a link there switches it for your browser. A file the network drops is sent again on its own, and a batch that still has failures shows **Retry failed** under the list, which sends them to the same stems with one press; after a reload, the stems that never arrived wait at the foot of the page with a link to upload the file. The name of the stem comes from the filename; rename it later from the row's ⋯ menu.

## Your mix and the default mix

Every song has a **default mix**: the fader level each stem starts at, the same for everyone who opens the song, and the balance the Original Mix MP3 and the project playlist use. Moving a fader, muting, soloing or changing the master only changes **your mix**, kept in your browser: it is there when you come back, and nobody else hears it. **⌘Z** (Ctrl+Z on Windows) undoes the last move, a whole drag or knob turn at a time, and **⌘⇧Z** puts it back; the Stage has buttons for both. **Reset Mix** puts everything back to the default. Members who want everyone to hear their balance use **Save as Default Mix**, which stores the current fader levels on the song (mutes, solos and the master are not part of it) and re-renders the Original Mix.

A song with no stems yet also shows **Add Demos** beside Add Stems, since an idea usually starts as a phone memo or a rough take; once stems exist, demos are added from the song's settings and played from the Demos button. The player's third view, **Mixes**, holds the bounces an engineer sends the band for feedback (see [Mixes](/docs/mixes)).

**Replace Stems** takes the song's whole new set at once, for a fresh bounce from the session: a file with the same name as an existing stem (the filename, or the stem's name) replaces it in place, keeping its name, order and MIDI; a file with a new name is added; and existing stems with no file in the pick are removed. You see the three lists and confirm before anything is uploaded, and nothing is removed unless every upload succeeds. Afterwards the song offers a version bump, as after any stem change.

Each stem is kept as uploaded (that is what you download later) and a lighter playback rendition is made from it, so a song loads quickly even when the stems are large WAVs.

## What the upload detects

As stems upload, Stem Shovel listens to them and works out the tempo, the key and whether the song is in four or three. If the song has no tempo, key or time signature yet, they are set for you and a notice says what was found; check them in the song's settings, since detection is a good guess rather than a promise, and change them if the song knows better. A song that already has them keeps its own.

## The player

Every stem gets a row: its waveform, **M** (mute), **S** (solo) and a fader. Solo one or more stems to hear only those; mute drops a stem from the mix. The **Master** fader scales everything. Members can put the rows in any order: drag a stem by the grip before its name (the six dots), or focus the grip and press the arrow keys. The order is the song's, so everyone sees it, and the downloads follow it.

The transport above the stems has play/pause, a go-to-beginning button and a readout of the position. Click anywhere on a waveform to jump there. **Space** plays and pauses from anywhere on the page, and **Home** goes back to the beginning. A line of tips under the comments row says so, and how to leave a comment. The player sits in a panel of its own: on a wide screen the arrows in its header pop it out into a floating panel you can drag and resize, or put it back; the **Player** button in the row below minimizes it and brings it back as it was, and the music keeps playing while it is away (the button lights).

Playback starts once every stem has been decoded; the status line under the stems counts them in.

When the song has a tempo and a time signature (set in its settings), a **Click** button sits beside the readout: press it and a metronome plays in time with the stems, the first beat of each bar higher, following the song's tempo and meter changes and every seek. A small knob beside the button sets how loud it is, and the **count-in** choice beside that counts a bar (or two, or four) of click before the stems start when you press Play, so you can come in with the band; choose "No count-in" to start at once. The click is for listening and practice only: it is not part of your mix or of any download, and it is off each time you open a song.

### Looping a part of the song

Click a section on the timeline row and it is selected: the stretch is highlighted across every row, and the playhead goes to its start. The **Loop** button (or **L**) then plays that stretch round and round; with nothing selected it loops the whole song. Click the selected section again, or press **Escape**, to clear the selection. To loop a stretch that is not a section, drag across any waveform from where it should start to where it should end; the band appears on every row and Loop uses it. A loop plays seamlessly when the stems are in memory; streamed, there is a short gap at the turn.

### The Stage

The **Tracks / Stage** switch at the top of the stems turns the rows into a stage: every stem is a numbered puck, left to right is its pan and height is how loud it sounds in the mix (its level plus how hot the recording is, so a quiet take at unity sits below a loud one). Drag a puck to set its level and pan at once; hold **Shift** to move along one axis only; double-click to center the pan, Alt-double-click to return the level to unity. A puck glows with the stem's loudness while the song plays, the bar under the stage shows which way the mix leans, and the master meter sits beside it. Click or Tab to a puck and the strip under the stage shows its name, **M**, **S**, its ⋯ menu and the level and pan readouts; the arrow keys nudge the puck, **M** and **S** mute and solo it. Switching views never changes the sound: it is the same mix, kept the same way.

## Positions: timecode and bars

The readout shows the position as **timecode** (`minutes:seconds:frames.subframes`, the way Logic Pro does, at the song's frame rate) or as **bars and beats** (`45 | 1`). When the song has a tempo and a time signature, bars are the default; click the readout to switch. Anywhere a position is typed, such as a section start or a comment's spot, either format is accepted, and so is plain `1:23.5`.

## Sections and the timeline

If the song has sections, a row above the stems shows them with their numerals; the current one is highlighted while playing, and hovering shows the name and the length in bars. Sections and the song's tempo, key and time signature changes are entered in the song's settings.

## MIDI

A stem can carry a MIDI file (from the row's ⋯ menu). It gets a **MIDI** chip beside its name; click the chip to swap the waveform for a piano roll of the notes, and click again to go back. The MIDI file downloads from the same menu.

Beside each stem's fader is a **pan** knob: drag it to place the stem left or right, double-click for center. The pan is part of your own mix, kept in your browser, of a custom mix download, and of the default mix a member saves for everyone. The stem's **level** is a knob too, in dB while it turns (double-click for unity). Beside it a **level meter** shows what the stem puts into the mix after its fader and pan, with a thin mark that holds the recent peak; the master has one beside its fader. The small square at the meter's end lights red when the level reaches full scale and stays lit until you click it, so a clip you missed is still there to see.

Editors can **tint** a stem's row from its ⋯ menu: eight soft colors, or none. The name and the waveform take the color, and everyone who opens the song sees the same rows, so a band can tell its guitars from its keys at a glance.
