# The Drum Machine

**Drum Machine** in the Tools menu (or **/drum-machine**) is a step sequencer for sketching a beat: to hear an idea against, to play along with, to share with the band, or to take into a DAW. It works without an account, and what you build stays in your browser.

## A first beat, step by step

**Tutorial: a rock beat from scratch**, under the page's heading, walks you through it: an empty kit, the kick on 1 and 3, the snare on 2 and 4, hats, a push, an open hat, accents, humanize, a crash, and a second pattern with a fill. Each step highlights the cells to tap, shows a tick when the grid has caught up, and has a **Do it for me** button. Your own beat is kept; **Undo** brings it back when you close the tutorial.

## The grid

Rows are drums, columns are sixteenth notes. Tap a cell to turn a hit on or off, or press and drag across several to set them all at once. Beats are shaded in pairs so the bar reads at a glance; while the pattern plays, the sounding column lights up. On a phone each bar shows as two lines of eight.

A cell can hit at three strengths: normal, accent or ghost. Hold a sounding cell (or right-click it, or shift-click) to step through them.

Each row has a drum picker (twelve to choose from: kick, snare, closed and open hats, clap, rim, three toms, ride, crash and cowbell), **M** to mute it, **S** to solo it and **×** to remove it. **Row** adds another, up to twelve. From a laptop or tablet width up, each row also has a level slider and a pan slider (double-click the pan for the centre). A closed hat cuts off an open hat still ringing, as on a real kit.

## Tempo, swing and feel

**Play** starts and stops the pattern; so does the space bar. Set the tempo with the buttons, the slider or by tapping **Tap** in time, from 40 to 240 beats per minute. **Swing** pushes notes late, up to a triplet feel. Its **1/16** setting moves every second sixteenth, which is what an MPC does; a beat with nothing on the sixteenths (hats on the eighths, kick and snare on the beats) will not change, so switch it to **1/8** and the off-beat eighths swing instead. **Humanize** scatters every hit a little in time and loudness, so a pattern stops repeating itself exactly.

**4/4**, **3/4** and **6/8** set the open pattern's meter, and the buttons beside them its length: half a bar (in 4/4), a bar or two bars. In 6/8 the grid shades in sixes rather than fours. Growing a bar to two repeats it, so a fill can go into the second bar; shrinking keeps the start.

## Delay, reverb, fuzz and wah

**Effects**, at the foot of the device, opens the delay and reverb settings, set once for the whole beat: the delay's time in the beat (an eighth, a dotted eighth, a quarter, a dotted quarter, a half; it follows the tempo), its feedback and its **level**; the reverb's size and its **level**. The two levels are the master controls and start at zero, so a new beat is dry until you raise one, and then you hear it at once, because every drum already sends a little to each effect: snares and claps more, kicks a little, rims mostly into the delay. Each row's own **sends** are in its mix menu (the sliders button beside M, S and ×): how much of that drum goes to the delay and how much to the reverb, on top of the dry sound. The delay can be **Digital** (clean repeats) or **Analog** (each repeat darker and softer than the last, with a slow tape-like wobble). A **fuzz** sits on the drums themselves: turn its drive up for a crunch, and its tone sets how bright the crunch is; the delay and reverb stay clean behind it. A **wah** sweeps a filter across the whole beat in time with it, once per beat, two beats, one, two or four bars, the way a filter sweep pulls a loop in and out: its **level** turns it on, and range and resonance set how far and how sharp. The Effects button lights up while a level, the fuzz or the wah is above zero, and **Reset to defaults** in the menu puts the levels and the fuzz back to zero, the delay back to Digital, and every drum back to its usual sends. The effects are part of the beat: a saved beat, a link and a WAV download all carry them.

## Playing the drums from MIDI

With a MIDI pad or keyboard plugged in, the **MIDI** button beside Effects opens a menu whose **Connect MIDI** lets it play the drums (Chrome and Edge; the browser asks once). Pads that send the usual General MIDI drum notes play their sounds (kick, snare, hats, toms, cymbals, clap, rim, cowbell); any other note plays the rows of the open pattern in order, so a keyboard works too. Turn on **Record hits into the grid** and, while the beat plays, every hit also lands in the grid at the nearest step, soft hits as ghosts and hard ones as accents, and a drum the pattern has no row for gets one.

## Kits

**Acoustic** and **Room** are kits of real drum recordings, the Room kit with longer, roomier hits; **Electronic** is synthesized in the browser, with no files to load. The kit is a choice for the whole project.

The recordings in the Acoustic and Room kits come from [Groovie](https://github.com/maximecb/groovie), Maxime Chevalier-Boisvert's open-source beat sequencer, which publishes its samples in the public domain (CC0). Thank you.

## Presets

**Presets** holds a couple of dozen beats by style: rock, pop and funk, hip-hop and electronic, world, a waltz and two in 6/8, and fills. Choosing one replaces your project with the preset, tempo and kit included; **Undo** beside it brings your beat back until you make another change. Hold shift while choosing to add the preset's patterns to your project instead, keeping your tempo, feel and kit, which is how a fill joins a groove.

## Generate

**Generate**, beside Presets, draws a pattern from a style: rock, pop, funk, hip-hop, house, breakbeat, latin, half-time, or a fill. Each style has a backbone that is always there (the kick and snare that make it that style) and a set of maybes; **Density** decides how many of the maybes come out, from the bare backbone at 0% to a busy bar at 100%. Every press is a fresh draw, so press again until one feels right; **Undo** brings your pattern back. The draw fits the open pattern, its meter and length, and keeps your rows' levels, pans and sends; a drum the style needs is added, one it does not use is left silent. **Add as a pattern** puts the draw after the open pattern instead of replacing it, which is how a fill joins a groove.

## Text-to-Beat

**Text-to-Beat**, beside Generate when it is switched on, asks a language model for a beat from your description: type what you want ("a laid-back boom bap with ghost notes on the snare", "a driving punk beat", "a bossa nova on the rim") and press **Make the beat** (or Enter). The answer fits the open pattern's meter and length and lands in it, with the model's tempo and swing if it suggests them; the line under the button says what it made. **Undo** brings your pattern back, or tick **As a new pattern** to keep yours and add the answer after it. It takes a few seconds, and a few tries an hour are plenty; if the model's answer cannot be read, ask again with a little more detail.

## Patterns

The numbered buttons above the grid are the project's patterns, up to eight. **+** adds an empty pattern with the same rows, the copy button duplicates the open one, and the bin deletes it. Open a pattern to edit it; while the drums play, the pattern you choose waits for the end of the cycle before it takes over, and the readout says which is playing and which is next.

## Saving, sharing and downloading

Everything is remembered in this browser and comes back when you return. **Copy link**, in the **⋯** menu at the foot of the device, puts the whole project into the page's address and copies it: anyone who opens the link gets the same beat, to play or remix. Links keep working as the drum machine grows.

Signed in, with an account, the ⋯ menu also has **Save** and lists the account's saved beats. Save keeps the whole project, patterns, kit and tempo, in your account under a name, where every member of the account can find it; saving again brings the open beat up to date, and the menu offers Save as a new beat, Rename and Delete for the beat that is open. Viewers can load beats but not change them.

The ⋯ menu's **Download** items offer the open pattern as a **WAV** (one seamless cycle, ready to loop in a music player or a DAW) or as a **MIDI** file, with each drum on its General MIDI note, so it opens as an editable drum track in any DAW.

## Beats for a song

On a song's page, **Uploads → Drum Machine** opens the drum machine for that song: a fresh beat at the song's tempo and time signature (your previous beat is kept behind Undo). **Save** keeps it with the song, so it is listed with the song's name in the ⋯ menu, and **Add to … as a demo** renders the open pattern to a WAV and adds it to the song's demo recordings, ready to play alongside the stems or download. **Back to …** returns to the song.

## In the Idea Recorder

The recorder's toolbar has a drums button beside the metronome (on a phone, in the wrench menu). It plays your latest beat as a backing track while you record; with headphones on it stays off the take. When the beat has more than one pattern, a picker beside the tempo chooses which plays; while the drums run, the change waits for the end of the cycle. See the Idea Recorder page for the details.
