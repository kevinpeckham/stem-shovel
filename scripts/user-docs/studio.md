# Studio

**Studio** in the Tools menu (and the footer) is a multitrack recorder: tracks of clips on a timeline, recorded from the microphone, a line in or the computer while the rest of the song plays. It is the Idea Recorder's bigger sibling: where an idea is one take at a time, a Studio song is built up part by part, moved about, and kept in revisions. Your songs are your own, whichever account you are working in, and a finished one goes to a song in a project as a demo or as stems.

## Tracks and inputs

**Add track** puts a row on the timeline. Each track has a name (click it to change it), a red **arm** button, **M** (mute) and **S** (solo), an input picker, a level fader, a pan slider and a level meter. The input is one of the three shared inputs, the **microphone**, a **line in** (a second input, for an instrument on an audio interface) or the **computer** (audio from another program through the browser's share picker), taken in stereo or as its left or right channel alone, which is what an instrument on channel 1 of a stereo interface wants. Two tracks can take the two channels of one interface at once. Arming a track opens its input (the microphone asks for permission the first time); the **Inputs** panel in the toolbar has each input's device, channels, gain, monitor and normalize settings, and **Calibrate**.

A track can also take one of the instruments: the **piano**, the **chord player** or the **drum machine**, each in a panel from the toolbar (choosing one as a track's input opens it). They play in the Studio's own audio engine, so what you play on the panel lands on the take exactly as heard, and a piano or chord part played by hand is shifted earlier by your audio output's delay (switch that off in the **Timing** menu). A track armed to the drum machine makes the beat play along from the start whenever the song runs, at the song's tempo; record and the beat is on the take. The drum machine's beat, the piano's preset and the chord player's settings are kept with the song and come back when it is opened.

## Effects on a track

The sliders button in a track's header opens its effects, the piano's own in a mixer's order: a **compressor** (amount, ratio and make-up gain; at zero the sound goes round it untouched), **tone** (a tilt from dark to bright, air for sparkle above what is there, bottom for weight under 100 Hz) and a **reverb** send (level and size, from a room to a cathedral). They apply as you play and as the song plays, are saved with the song, and are baked into a bounce, a demo and the stems you send to a song. The button lights when any effect is on; **Reset effects** switches them all off.

## Recording

Set the playhead where the take should begin (click the ruler or an empty stretch of a track), arm one or more tracks and press **Record** (or R). With **Count-in** on, a bar of clicks comes first; the **Click** keeps going through the take when it is on. Every other track plays, so you record against what is there; an armed track's own clips play too unless you switch that off in the **Timing** menu, which is how you punch over a part. **Stop** (or Space) ends the take: a clip lands on each armed track where the playhead started, named for the track and the take number, and the recording uploads in the background. Takes are kept losslessly (24-bit WAV).

A sung or played take reaches the computer a little late (the microphone's and the speakers' round trip, usually 10 to 60 ms, more over Bluetooth). The Studio shifts each take earlier by the input's latency setting; press **Calibrate** in the Inputs panel with the speakers on and the microphone measures it. Use wired headphones or the built-in speakers for overdubs.

## The timeline

The ruler shows bars and beats at the song's tempo (set in the **Timing** menu) when **Grid** is on, or minutes and seconds when it is off. Zoom with the buttons on the right or ⌘-wheel over the timeline. Click a clip to select it; drag it along its track or up and down onto another track. With the grid on it snaps to the beat; hold Shift to place it freely. **Delete** removes the selected clip; **Undo** and **Redo** (⌘Z, ⌘⇧Z) step through every edit. A removed clip's recording stays with the song until you choose **Clean up unused recordings** in the song's menu.

**Loop** (or L) repeats the region on the ruler: the first press makes one a bar long at the playhead; drag its ends to set it. Space plays and stops; Home goes to the start (or the loop's start).

## Editing clips

Drag either end of a clip to **trim** it: the left edge moves where the clip begins in its recording, the right edge where it ends; nothing is thrown away, so a trimmed clip can be dragged open again. **Split** (or S) cuts the selected clip at the playhead into two. **Duplicate** (⌘D) puts a copy right after it. The bar under the timeline holds the selected clip's name, its **gain** (double-click the slider for 0 dB) and its **fade in** and **fade out** in seconds, drawn as wedges on the clip. **Import audio…** puts a file (WAV, FLAC, MP3, M4A and the other formats a demo accepts) on the selected clip's track at the playhead.

## Takes

Record over a part again and the new take takes its place, with the earlier one kept behind it: a clip that covers an older clip end to end keeps that clip's recording as an alternate take, and the bar under the timeline shows **n takes** with arrows to step through them. With **Loop** on, recording runs round the region and every full pass is a take of its own, the last one on top; stop when you have the one you like and step back to compare. **Punch** (the dotted square beside Loop) keeps only what falls inside the loop region: put the playhead a bar or two before the region, press Record, play through, and the clip holds just the region.

## Songs and revisions

The song's title sits above the screen; **New song** starts another. The song saves itself a moment after every change. **Save revision…** in the song's menu keeps the arrangement under a name; the **Songs** panel lists every song with its saved revisions and recent autosaves, and **Restore** brings one back (the state before it is kept as an autosave, so nothing is lost). Each song has a note board in the **Notes** panel, as an idea does in the Idea Recorder.

## Bouncing

The song's menu has **Download mix (WAV)**, the whole song with every fader, pan, mute and solo; **Add mix as demo**, which puts that mix on a song of your choice as a demo; and **Add tracks as stems**, which renders each track on its own with its fader and pan and puts them on the song as stems, ready for the stem player.

## Limits

A song holds up to 16 tracks and 64 recordings, each up to 15 minutes. The screen shows how much decoded audio the page holds; a phone has far less room than a laptop, so keep phone sessions short and record in mono where a single channel will do.
