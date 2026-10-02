# The Idea Recorder

**Idea Recorder** in the header (or the account menu on a phone) opens a page for catching ideas before they are songs: a riff, a melody, a verse hummed into the phone. It records straight from the microphone, keeps every take, and turns a take into a song's demo when it is time. Your ideas are your own: they list together whichever account you recorded them in, only you see them, and a take can go to a song in any account you belong to. New takes count against the storage of the account you are currently working in.

## Ideas and takes

An **idea** is a title, a note board and one or more numbered **takes**. Hitting **Record** starts a take; **Stop** saves it at once as the next number, so you can go again without waiting. The take stays loaded for playback until the next one starts. **New idea** (the header button, or the recorder's ⋯ menu) starts a fresh idea called "Untitled Idea N" with an empty note board; rename it in the title field at the top of the recorder. The screen draws the sound as you record it, and once a take is in, its whole waveform with a playhead: click or drag on it to move around the take.

A take can carry a name: type it in the field beside "Take N" before you record, while you record, or after. When an idea has more than one take, the "Take N" label opens a list of them for a quick jump.

An idea only exists once it has a take or some notes. One that ends up with neither, because its last take or its notes were deleted, is removed on its own.

## Notes

The panel beside the recorder is a markdown note board for the idea: lyrics, chords, a tuning, anything worth keeping with the takes. It saves as you type. The trash button clears it. On a desktop, the button in the notes header pops them out into a panel you can drag and resize, and the same button puts them back. The recorder and the recordings list have the same button, so the recorder, the notes, the list, the instruments and the tools can all be arranged on the screen however you like.

## The list

Under the recorder, your ideas are listed newest first. Loops saved in the Looper are kept out of the list unless you tick **Show loops** in the list's header; they carry a loop icon, and a loop exported from the Looper is listed like any idea. Click an idea's name to fold or unfold its takes; click a take to load it into the player. Each take has a ⋯ menu (add as a demo, create a song, delete) and each idea has one too (delete the idea and all its takes). **Search** opens a sheet listing every idea (full screen on a phone); typing filters them by title, notes, take name or number, and an idea unfolds to its takes. On a phone the main list gives way to a picker above the recorder.

Ideas are yours: other members of the account see them only once a take becomes a demo on a song.

## Into a song

The recorder's ⋯ menu also downloads the loaded take: **Download source** hands over the take exactly as recorded (named for its format, for example "ALAC lossless"), and **Download MP3** the playback rendition once it is made.

From the recorder's ⋯ menu or a take's menu, **Add as demo…** puts the take on an existing song as a demo recording, and **Create new song…** makes a song in one of your projects with the take as its first demo. Either way the take is copied, so it stays with the idea too. Tick **Merge the idea's notes into the song's notes** (on by default) to append the note board to the song's notes under a heading naming the idea and take.

## Tuner

The ear icon in the header opens a chromatic tuner. It listens while the popover is open: the nearest note shows large, a needle reads how many cents sharp or flat (green within five), and the string of your tuning it is lights up. Pick the tuning (guitar standard, drop D, half step down, DADGAD, open G, bass, five-string bass, ukulele), or **Chromatic** for any other instrument or tuning, which just names whatever it hears and set A4 if your band tunes to 442; both are remembered on the device. Pressing Record closes the tuner so the microphone is free for the take. The same tuner is at `/tuner` for anyone, signed in or not. On a desktop the tuner opens in a panel you can drag and resize; on a phone it sits under the recorder.

## Metronome

The metronome icon in the toolbar starts a click; the tempo shows beside it, ready to change. It keeps going while you record, so wear headphones if you do not want the click on the take. The full metronome, with tap tempo and beats to the bar, is at **/metronome** (linked in the footer). On a phone the metronome sits in the toolbar's wrench menu with the tuner and the drums; while it runs, its stop button takes the wrench's place. On a desktop the metronome button opens the full metronome in a panel you can drag and resize; on a phone the small control in the toolbar stays.

## Input sources

Under the screen, **Input Source** shows what a take can record: **Microphone**, **Line in** (a second input, for an instrument on an audio interface), **Computer** (audio from another program, through the browser's share picker), **Piano** and **Drums**. Press a button to switch that source into the take or out of it; any mix is fine, and a take no longer needs the microphone at all. Each button carries its own level meter, running as soon as the source is in, so you can check a level before recording. Switching the piano or the drums in opens its panel; closing the panel takes it out again.

The small button joined to a source's right opens its settings: the device and how its channels are taken (stereo, or one channel on both sides, which is what an instrument on channel 1 of a stereo interface wants) for the microphone and the line in; what to share, the channels and a latency slider for the computer. The same menus hold **Hear the microphone and the line in through the speakers** (off by default; use headphones) and **Normalize what is recorded from the inputs**, which scales a file from these three sources so its loudest point sits just under full scale. Under each of the three sits a **Gain** slider, −12 to +24 dB, applied as you play; under the piano and the drums, their own volume, the same one their panels move. These settings are shared with the looper, and an input opened on one page is open on the other.

The microphone's and the line in's menus also hold **Input latency**, how late a sound reaches the computer through them; **Calibrate** in the microphone's menu measures it (three clicks through the speakers, heard by the microphone; take headphones off first), and a multitrack take trims that much off the front of their files so they line up with the piano's and the drums'.

**Computer** on a Mac can share a browser tab's audio only; to record another program, route it through a loopback device such as BlackHole and choose that as the line in. Safari cannot share audio.

## Drums

The grid icon beside the metronome plays the beat you last built at **/drum-machine** as a backing track, with the tempo beside it. It keeps going while you record, like the click, and only the microphone reaches the take, so with headphones on the drums stay off the recording. The drums and the metronome never play together: starting one stops the other and takes over its tempo. A beat with several patterns gets a pattern picker beside the tempo.

On a desktop, the drums button opens the full drum machine in a panel you can drag by its header and resize by its corner; the same button, or Minimise, closes it, and it remembers where you left it. The space bar plays and stops the drums while their panel is the last thing you touched, and works the piano's sustain pedal when the piano is. While instruments play into the take, each gets its own meter above the microphone's, the piano and the drums side by side with their icons. While the drums play they go into the take along with you, so a beat can be the backing of a demo; untick **Drums in the take** (in the panel's header, or the line under the recorder) to keep them out and use the beat as a click track instead. To record an instrument alone, mute the microphone with the button beside its meter; it is back on with every visit. The drums and the piano join the take whenever their **in the take** switch is on, whether or not their panel is open, so you can press Record first and start the beat after.

**Multitrack takes.** With two or more sources in the take, the recorder offers **Stereo** or **Multitrack** above the meter, multitrack by default; choose Stereo for one mixed file. Multitrack records the mix as usual and, beside it, a file of its own for each source. The take then shows how many of these it has, and **Add N stems to song…** in its menu puts them on a song as separate stems, each named for its source, so a jam with the drum machine and the piano can become a song's stems in one step. The usual **Add as demo…** still adds the mix.

**Tracks.** Open a take that has stems and a **Tracks** panel appears under the recorder: each stem with its waveform, mute, solo and a fader, with a transport and master of its own, so you can hear the sources on their own or in any mix before deciding what goes to a song. The recorder's own Play still plays the mix. On a desktop the panel pops out and docks like the notes.

**Instruments remembered with the idea.** When you record a take, the drum machine's beat and settings and the piano's sound and effects are saved with the idea, and they come back into the instruments when you open one of the idea's takes again, so an idea picks up where its last take left it. Untick **Settings with the idea** in an instrument's panel header to keep a take from changing what the idea remembers for that instrument. Opening an idea that has nothing saved yet leaves the instruments as they are.

## Piano

The piano icon beside the drums (on a phone, **Piano** in the wrench menu) opens the piano under the recorder: the same instrument as **/piano**, with its sounds, its computer-keyboard mapping and MIDI. Unlike the click, its sound goes **into the take** while its button under the screen is on, mixed with whatever else is in, so you can sing over a chord progression or sketch a melody straight into an idea. Switch the microphone out for a clean piano take with nothing from the room. The Grand Piano's fuller samples load in the background as they do on the piano page. On a desktop the piano opens in a panel of its own, dragged by its header and resized by its corner, with "Piano in the take" in the header; on a phone it sits under the recorder as before.

## Settings and limits

The gear in the header opens **Recorder settings**, remembered on the device:

- **Quality.** _Lossless where the browser can_ is the default: Apple Lossless on an iPhone, iPad or Mac running Safari 18.4 or later, raw PCM on Chrome and Edge (kept as FLAC), and the best compressed codec elsewhere. About 3 MB a minute in mono. _Compressed_ records Opus or AAC at 256 kbit/s, about 2 MB a minute, for a slow or metered connection. While recording, the line under the meter says what is really being captured, for example "ALAC lossless · 48 kHz · mono".
- **Discard takes shorter than 3 seconds automatically**, off by default, drops a mis-tap on Record instead of saving it. Turn it on knowingly: a short take is gone for good.
- **Trim silence at the start and end**, off by default. Once a take is saved, the silence before the first sound and after the last is cut from the take and its MP3 alike, leaving a little room (about a third of a second before, half a second after). A take that is silent throughout, or has nothing worth cutting, is left as recorded. The trim happens in the background a minute or so after saving, so the take's length in the list updates then.

A take stops and saves on its own at 15 minutes (a notice appears at 10), and after 2 minutes of silence: saved when it had sound, discarded when it never did. A take is at most 120 MB. Whatever the format, every take is also converted to MP3 for playback, so a take recorded losslessly on one device plays on any other.

## Tips

- Keep the screen on and the app in front while recording: a phone stops the microphone when it sleeps or switches apps.
- Voice processing is switched off so instruments sound like themselves; the level meter shows what the microphone hears.
- Takes are saved as your browser recorded them (see Quality above) and converted to MP3 for playback; downloads and demos made from a take use the original.
- On an iPhone or iPad the volume slider is hidden: iOS keeps playback volume on the hardware buttons.
