# Dawn

**Dawn** is Stem Shovel's multitrack recorder (**Multitrack Recorder** in the Tools menu, **Dawn** in the footer): tracks of clips on a timeline, recorded from the microphone, a line in or the computer while the rest of the song plays. It is the Idea Recorder's bigger sibling: the recorder is the handheld memo recorder, one stereo take at a time however many sources are in; Dawn is the four-track, where a song is built up part by part on tracks of its own, moved about, and kept in revisions. Your songs are your own, whichever account you are working in, and a finished one goes to a song in a project as a demo or as stems.

## Tracks and inputs

**Add track** puts a row on the timeline. Each track has a name (click it to change it), a red **arm** button, **M** (mute) and **S** (solo), an input picker, a level fader, a pan slider and a level meter. The input is one of the three shared inputs, the **microphone**, a **line in** (a second input, for an instrument on an audio interface) or the **computer** (audio from another program through the browser's share picker), taken in stereo or as its left or right channel alone, which is what an instrument on channel 1 of a stereo interface wants. Two tracks can take the two channels of one interface at once. Arming a track opens its input (the microphone asks for permission the first time); the **Inputs** panel in the toolbar has each input's device, channels, gain, monitor and normalize settings, and **Calibrate**.

A track can also take one of the instruments: the **piano**, the **chord player** or the **drum machine**, each in a panel from the toolbar (choosing one as a track's input opens it). They play in Dawn's own audio engine, so what you play on the panel lands on the take exactly as heard, and a piano or chord part played by hand is shifted earlier by your audio output's delay (switch that off in the **Timing** menu). A track armed to the drum machine makes the beat play along from the start whenever the song runs, at the song's tempo; record and the beat is on the take. The drum machine's beat, the piano's preset and the chord player's settings are kept with the song and come back when it is opened.

## Inserts on a track

The sliders button in a track's header opens its **inserts**: a chain of effects the track's sound passes through in order. Add any of six: an **EQ** (low, mid and high bands), a **compressor** (amount, ratio, attack, release and make-up gain), **tone** (a tilt from dark to bright, air for sparkle, bottom for weight), a **delay** (time, feedback and level, with analog repeats that darken and soften), a **reverb** (level and size, from a room to a cathedral) and a **limiter** (a ceiling the sound never passes). Each insert has a bypass, arrows to move it up or down the chain, and a cross to remove it. They apply as you play and as the song plays, are saved with the song, and are baked into a bounce, a demo and the stems you send to a song. The button lights when the track has any insert. A track that had the old compressor, tone and reverb keeps them as inserts.

## Automation

Press **A** in a track's header and a lane opens under its clips for the track's volume, pan, a send, or any insert parameter marked automatable (the picker in the track's header). Click the lane to add a point, drag a point to move it, double-click to remove it; the line between points is what the track does as the song plays, and the knob shows it moving. Turn the level or pan knob while a lane is open and a point lands at the playhead with that value, so you can ride a fader as you listen. Undo takes a point back like any edit, and the bounce, the demo and the stems follow the lanes.

## The Practice Amp

A track can take the **Practice amp** as its input (see its own page in these docs): arming the track opens the amp's panel and turns the amp on, and the take is what you hear through it, pedals and all, shifted earlier by the input's latency like a microphone's.

## Recording

Set the playhead where the take should begin (click the ruler or an empty stretch of a track), arm one or more tracks and press **Record** (or R). With **Count-in** on, a bar of clicks comes first; the **Click** keeps going through the take when it is on. Every other track plays, so you record against what is there; an armed track's own clips play too unless you switch that off in the **Timing** menu, which is how you punch over a part. **Stop** (or Space) ends the take: a clip lands on each armed track where the playhead started, named for the track and the take number, and the recording uploads in the background. Takes are kept losslessly (24-bit WAV).

A sung or played take reaches the computer a little late (the microphone's and the speakers' round trip, usually 10 to 60 ms, more over Bluetooth). Dawn shifts each take earlier by the input's latency setting; press **Calibrate** in the Inputs panel with the speakers on and the microphone measures it. Use wired headphones or the built-in speakers for overdubs.

## The timeline

The ruler shows bars and beats at the song's tempo (set in the **Timing** menu) when **Grid** is on, or minutes and seconds when it is off. Zoom with the buttons on the right or ⌘-wheel over the timeline. Click a clip to select it; drag it along its track or up and down onto another track. With the grid on it snaps to the beat; hold Shift to place it freely. **Delete** removes the selected clip; **Undo** and **Redo** (⌘Z, ⌘⇧Z) step through every edit and every mix move (a fader, pan, mute, solo, master or effect change counts as one step per gesture). A removed clip's recording stays with the song until you choose **Clean up unused recordings** in the song's menu.

**Loop** (or L) repeats the region on the ruler: the first press makes one a bar long at the playhead; drag its ends to set it. Space plays and stops; Home goes to the start (or the loop's start).

**Tracks / Stage**, beside the zoom buttons, swaps the lanes for a stage: every track a numbered puck, left to right its pan, up its level. Drag a puck to set both at once (Shift keeps one), double-click to center the pan, and use the strip under the stage for mute, solo and the track's menu. The pucks glow with each track's loudness while the song plays. It is the same mix as the lanes; switch back to edit clips.

## Editing clips

Drag either end of a clip to **trim** it: the left edge moves where the clip begins in its recording, the right edge where it ends; nothing is thrown away, so a trimmed clip can be dragged open again. **Split** (or S) cuts the selected clip at the playhead into two. **Duplicate** (⌘D) puts a copy right after it. The bar under the timeline holds the selected clip's name, its **gain** (double-click the slider for 0 dB) and its **fade in** and **fade out** in seconds, drawn as wedges on the clip. **Import audio…** puts a file (WAV, FLAC, MP3, M4A and the other formats a demo accepts) on the selected clip's track at the playhead.

## Takes

Record over a part again and the new take takes its place, with the earlier one kept behind it: a clip that covers an older clip end to end keeps that clip's recording as an alternate take, and the bar under the timeline shows **n takes** with arrows to step through them. With **Loop** on, recording runs round the region and every full pass is a take of its own, the last one on top; stop when you have the one you like and step back to compare. **Punch** (the dotted square beside Loop) keeps only what falls inside the loop region: put the playhead a bar or two before the region, press Record, play through, and the clip holds just the region.

## MIDI tracks

**Add MIDI track** puts a track of notes on the timeline instead of audio. Its input is the instrument that plays it and records into it: the **piano**, the **chord player** or the **drum machine**. Arm it and press Record, then play the instrument's panel, your computer keyboard, a MIDI keyboard plugged in (Chrome, Edge and Firefox hear one; Safari does not) or the drum pads: every note lands in a clip drawn as a small piano roll, and plays back through the same instrument, so its sound and effects are the instrument panel's. A MIDI track has a level fader (it scales the notes' velocity), mute and solo; it has no pan or effects of its own, since one piano plays every piano track.

**Edit notes** on a selected MIDI clip (or a double-click on the clip) opens the piano roll: the clip's notes on rows of pitches, a keyboard down the left that sounds each row. Click an empty spot to add a note a grid step long (the Grid menu chooses a beat, a half or a quarter; hold Shift to ignore the grid); drag a note along or up and down, or drag its right edge to change its length; Shift-click to select more; the arrow keys nudge the selection (Shift jumps an octave), the Velocity slider sets its loudness, Delete removes it, and ⌘Z undoes any of it. MIDI clips move, trim, split and duplicate like audio clips, and loop passes and punch make takes of them in the same way. Select one and the bar under the timeline offers **Quantize** (every note's start to the nearest beat, half or quarter beat at the song's tempo), **Transpose** (a semitone or an octave either way), a **Velocity** slider for the whole clip, and **Export MIDI**, which downloads the clip as a MIDI file at the song's tempo. **Import audio or MIDI…** takes a `.mid` file onto a MIDI track as one clip.

A bounce needs sound, so a MIDI track is **rendered to audio** first: **Render to audio track** in the track's menu plays its notes through the instrument into a new audio track in real time (the song plays as it does) and mutes the MIDI track; Download mix, Add as demo and Add tracks as stems do this themselves for any MIDI track with notes before they render, and say so. Edit the notes afterwards and render again; the earlier audio track can go.

## Songs and revisions

The song's title sits above the screen; **New song** starts another. The song saves itself a moment after every change. **Save revision…** in the song's menu keeps the arrangement under a name; the **Recordings** panel lists every song with its saved revisions and recent autosaves, and **Restore** brings one back (the state before it is kept as an autosave, so nothing is lost). Each song has a note board in the **Notes** panel, as an idea does in the Idea Recorder.

## The mixer

**Mixer** beside Tracks and Stage shows a strip for every track, every bus and the master. A track's strip has its output (the master or a bus), its inserts, a send knob to each bus, pan, the fader, mute and solo, and a meter. **Add bus** on the master strip makes a bus: a group that tracks can route to or send to, with its own name, tint, inserts, pan, fader, mute and meter, going on to the master; the master has inserts of its own (a limiter is the usual one). Removing a bus sends its tracks back to the master. Every mixer change can be undone, and a bounce, a demo and the stems follow the routing.

## Bouncing and exporting

The song's menu has **Download mix (WAV)**, the whole song with every fader, pan, insert, bus and lane as they stand; **Add mix as demo**, which puts that mix on a song of your choice as a demo; and **Add tracks as stems**, which renders each track on its own and puts them on the song as stems, ready for the stem player. A MIDI track renders through its instrument as it is set now, so nothing has to play out loud first.

**Export…** opens a panel with more: the mix, a stem per track, a stem per bus, and a DAWproject file that Bitwig, Cubase and Studio One open with the tracks, clips, fades, levels and automation and the recordings inside. Choose 24-bit or 16-bit WAV, and **Normalize** to bring each file to −14 LUFS with peaks under −1 dBTP, the level the streaming services play at; the panel reports each file's loudness and what it applied. The files come as one zip, or one download each. While the song plays, the readout beside the master meter shows its loudness over the last three seconds in LUFS, so you can see where a mix sits before you export it.

## Limits

A song holds up to 16 tracks and 64 recordings, each up to 15 minutes. The screen shows how much decoded audio the page holds; a phone has far less room than a laptop, so keep phone sessions short and record in mono where a single channel will do.
