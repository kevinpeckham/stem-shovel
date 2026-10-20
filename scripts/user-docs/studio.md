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

Drag either end of a clip to **trim** it: the left edge moves where the clip begins in its recording, the right edge where it ends; nothing is thrown away, so a trimmed clip can be dragged open again. **Split** (or S) cuts the selected clip at the playhead into two. **Duplicate** (⌘D) puts a copy right after it. The bar under the timeline holds the selected clip's name, its **gain** (double-click the slider for 0 dB), its **fade in** and **fade out** in seconds, drawn as wedges on the clip, and the fades' **shape**, linear or equal power. **Import audio…** puts a file (WAV, FLAC, MP3, M4A and the other formats a demo accepts) on the selected clip's track at the playhead.

**Shift-click** adds clips to the selection: drag them together, **Remove** them together, or press **Shift+Delete** to remove them and close the gap they leave. Where two clips on a track overlap they **crossfade**, equal power, so the join holds its level; slide one clip a little over its neighbor and the wedges show it.

The clip tools make a new recording of a clip's audio and keep the original behind the scenes: **Reverse** plays it back to front, **Normalize** brings a quiet clip up to −1 dB, and **Consolidate** renders the selected clips of a track into one recording with their gains, fades and crossfades baked in, so a part built from pieces becomes one clip.

## Takes and comping

Record over a part again and the new take takes its place, with the earlier one kept behind it: a clip that covers an older clip end to end keeps that clip's recording as an alternate take, and the bar under the timeline shows **n takes** with arrows to step through them. With **Loop** on, recording runs round the region and every full pass is a take of its own, the last one on top; stop when you have the one you like and step back to compare. **Punch** (the dotted square beside Loop) keeps only what falls inside the loop region: put the playhead a bar or two before the region, press Record, play through, and the clip holds just the region.

To build the best of several takes, press **T** in the track's header: a lane opens under the clip for each take, with its waveform. Swipe across a lane over the bars you want from that take and the clip splits there, the middle piece playing that take with short crossfades at the joins. Swipe again on another lane for another region; every swipe is one undo step.

## Tempo and meter

The song's tempo and beats per bar live in the **Timing** menu (the caret beside the tempo button), with **Tap** to tap a tempo in. The song can change pace or meter partway: put the playhead where the change should start, type the new tempo or pick the beats per bar, and press **Add tempo change** or **Add meter change**. The change shows as a small flag at the top of the ruler; the bars, the grid snap, the readout, the click and the count-in all follow it from there on. Click a flag to jump to it, double-click to edit it, and press Delete with it focused to remove it.

**Detect tempo** in the clip bar reads a recording's tempo from its beats and sets the song's tempo to match. **Length ×** and **Pitch** stretch a clip's audio to another length or pitch (1.5 is half again as long; 12 st is an octave up) as a new recording the clip follows; **Apply stretch** does it.

A MIDI clip's bar has **Swing** and **Humanize** for its track: swing delays the off-beat eighths toward a triplet feel, humanize scatters the notes a little in time and touch. Both apply as the notes play and in a bounce; the notes themselves stay where you put them.

## Markers

Press **M**, or the flag button in the transport, to put a marker at the playhead: a named flag on the ruler. Click a flag to jump there, double-click to rename it, and press Delete with the flag focused to remove it. Markers are saved with the song.

## MIDI tracks

**Add MIDI track** puts a track of notes on the timeline instead of audio. Its input is the instrument that plays it and records into it: the **piano**, the **chord player** or the **drum machine**. Arm it and press Record, then play the instrument's panel, your computer keyboard, a MIDI keyboard plugged in (Chrome, Edge and Firefox hear one; Safari does not) or the drum pads: every note lands in a clip drawn as a small piano roll, and plays back through the same instrument, so its sound and effects are the instrument panel's. A MIDI track has a level fader (it scales the notes' velocity), mute and solo; it has no pan or effects of its own, since one piano plays every piano track.

**Edit notes** on a selected MIDI clip (or a double-click on the clip) opens the piano roll: the clip's notes on rows of pitches, a keyboard down the left that sounds each row. Click an empty spot to add a note a grid step long (the Grid menu chooses a beat, a half or a quarter; hold Shift to ignore the grid); drag a note along or up and down, or drag its right edge to change its length; Shift-click to select more; the arrow keys nudge the selection (Shift jumps an octave), the Velocity slider sets its loudness, Delete removes it, and ⌘Z undoes any of it. MIDI clips move, trim, split and duplicate like audio clips, and loop passes and punch make takes of them in the same way. Select one and the bar under the timeline offers **Quantize** (every note's start to the nearest beat, half or quarter beat at the song's tempo), **Transpose** (a semitone or an octave either way), a **Velocity** slider for the whole clip, and **Export MIDI**, which downloads the clip as a MIDI file at the song's tempo. **Import audio or MIDI…** takes a `.mid` file onto a MIDI track as one clip.

A bounce needs sound, so a MIDI track is **rendered to audio** first: **Render to audio track** in the track's menu plays its notes through the instrument into a new audio track in real time (the song plays as it does) and mutes the MIDI track; Download mix, Add as demo and Add tracks as stems do this themselves for any MIDI track with notes before they render, and say so. Edit the notes afterwards and render again; the earlier audio track can go.

## The sampler

A MIDI track's input can be the **Sampler**: pick one of the song's recordings in the clip bar and the track plays it across the keys, the **root** note being the key at which it sounds as recorded, with an **attack** and **release** and **loop** if you want it to hold. Record a phrase, chop a word, drop a hit: anything the song holds can be an instrument. The piano also gained **Brass**, **Strings** and **Bell** sounds.

## The library

**Library** in the top row opens every recording the song holds: takes, imports and what the clip tools made. Press play on one to hear it alone, type to find one, and drag one onto a track to place it there as a clip.

## A song's stems

To work on a song's stems in Dawn, choose **Open stems in Dawn** in the song page's Downloads menu, or in Dawn pick the song under **Send to a song** and press **Load the song's stems**. Each stem lands on a track of its own in a new Dawn song named after the song, with the stems' levels, pans and tints, and the song's tempo on the ruler. The stems themselves stay as they are: Dawn works on copies.

## Songs and revisions

The song's title sits above the screen; **New song** starts another. The song saves itself a moment after every change. **Save revision…** in the song's menu keeps the arrangement under a name; the **Recordings** panel lists every song with its saved revisions and recent autosaves, **Compare** says what a revision differs in from the song as it stands now, and **Restore** brings one back (the state before it is kept as an autosave, so nothing is lost). Each song has a note board in the **Notes** panel, as an idea does in the Idea Recorder.

## Working together

A song is yours until you share it: **Share with the band** in the song's menu opens it to every editor of the account, who find it in their Recordings panel marked "the band's" and get a notification with a link to it. Anyone on the song can record, edit, mix and comment; only you can share it, stop sharing it or delete it. If two people have the song open, a save by one makes the other's next save reload the latest instead of overwriting it, and says so.

**Comments** in the top row opens the song's thread. Write a comment and leave **At the playhead** on to pin it to a moment: it shows as a dot on the ruler, a click on the dot or on the time in the thread moves the playhead there, and the song's creator and everyone in the thread are notified.

## Bouncing and exporting

The song's menu has **Download mix (WAV)**, the whole song with every fader, pan, insert, bus and lane as they stand; **Add mix as demo**, which puts that mix on a song of your choice as a demo; and **Add tracks as stems**, which renders each track on its own and puts them on the song as stems, ready for the stem player. A MIDI track renders through its instrument as it is set now, so nothing has to play out loud first.

**Export…** opens a panel with more: the mix, a stem per track, a stem per bus, and a DAWproject file that Bitwig, Cubase and Studio One open with the tracks, clips, fades, levels and automation and the recordings inside. Choose 24-bit or 16-bit WAV, and **Normalize** to bring each file to −14 LUFS with peaks under −1 dBTP, the level the streaming services play at; the panel reports each file's loudness and what it applied. The files come as one zip, or one download each. While the song plays, the readout beside the master meter shows its loudness over the last three seconds in LUFS, so you can see where a mix sits before you export it.

## Freezing a track

**Freeze track** in a track's menu renders its clips through its inserts into one recording that stands in for them, so a heavy track costs nothing to play; the fader and pan stay live. A snowflake marks it, and **Unfreeze track** brings the clips and inserts back as they were. A MIDI track freezes the same way, through its instrument.

## Limits

A song holds up to 16 tracks and 64 recordings, each up to 15 minutes. The screen shows how much decoded audio the page holds; only the recordings the song plays are decoded, the rest wait on the server until a clip, a take or the sampler asks for them, and **Unload recordings nothing plays** in the song's menu drops what no clip uses. A phone has far less room than a laptop, so keep phone sessions short and record in mono where a single channel will do.
