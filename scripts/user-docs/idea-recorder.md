# The Idea Recorder

**Idea Recorder** in the header (or the account menu on a phone) opens a page for catching ideas before they are songs: a riff, a melody, a verse hummed into the phone. It records straight from the microphone, keeps every take, and turns a take into a song's demo when it is time.

## Ideas and takes

An **idea** is a title, a note board and one or more numbered **takes**. Hitting **Record** starts a take; **Stop** saves it at once as the next number, so you can go again without waiting. The take stays loaded for playback until the next one starts. **New idea** (the header button, or the recorder's ⋯ menu) starts a fresh idea called "Untitled Idea N" with an empty note board; rename it in the title field at the top of the recorder.

A take can carry a name: type it in the field beside "Take N" before you record, while you record, or after. When an idea has more than one take, the "Take N" label opens a list of them for a quick jump.

An idea only exists once it has a take or some notes. One that ends up with neither, because its last take or its notes were deleted, is removed on its own.

## Notes

The panel beside the recorder is a markdown note board for the idea: lyrics, chords, a tuning, anything worth keeping with the takes. It saves as you type. The trash button clears it.

## The list

Under the recorder, your ideas are listed newest first. Click an idea's name to fold or unfold its takes; click a take to load it into the player. Each take has a ⋯ menu (add as a demo, create a song, delete) and each idea has one too (delete the idea and all its takes). **Search** opens a sheet listing every idea (full screen on a phone); typing filters them by title, notes, take name or number, and an idea unfolds to its takes. On a phone the main list gives way to a picker above the recorder.

Ideas are yours: other members of the account see them only once a take becomes a demo on a song.

## Into a song

The recorder's ⋯ menu also downloads the loaded take: **Download source** hands over the take exactly as recorded (named for its format, for example "ALAC lossless"), and **Download MP3** the playback rendition once it is made.

From the recorder's ⋯ menu or a take's menu, **Add as demo…** puts the take on an existing song as a demo recording, and **Create new song…** makes a song in one of your projects with the take as its first demo. Either way the take is copied, so it stays with the idea too. Tick **Merge the idea's notes into the song's notes** (on by default) to append the note board to the song's notes under a heading naming the idea and take.

## Tuner

The guitar icon in the header opens a chromatic tuner. It listens while the popover is open: the nearest note shows large, a needle reads how many cents sharp or flat (green within five), and the string of your tuning it is lights up. Pick the tuning (guitar standard, drop D, half step down, DADGAD, open G, bass, five-string bass, ukulele) and set A4 if your band tunes to 442; both are remembered on the device. Pressing Record closes the tuner so the microphone is free for the take. The same tuner is at `/tuner` for anyone, signed in or not.

## Settings and limits

The gear in the header opens **Recorder settings**, remembered on the device:

- **Quality.** _Lossless where the browser can_ is the default: Apple Lossless on an iPhone, iPad or Mac running Safari 18.4 or later, raw PCM on Chrome and Edge (kept as FLAC), and the best compressed codec elsewhere. About 3 MB a minute in mono. _Compressed_ records Opus or AAC at 256 kbit/s, about 2 MB a minute, for a slow or metered connection. While recording, the line under the meter says what is really being captured, for example "ALAC lossless · 48 kHz · mono".
- **Stereo input**, for an audio interface with two channels. A phone microphone is mono anyway, and stereo doubles the file.
- **Microphone.** Tap _Find microphones_ once to grant permission and list the inputs, then pick an interface or a better mic. It shows on any device an interface is plugged into.
- **Discard takes shorter than 3 seconds automatically**, off by default, drops a mis-tap on Record instead of saving it. Turn it on knowingly: a short take is gone for good.
- **Trim silence at the start and end**, off by default. Once a take is saved, the silence before the first sound and after the last is cut from the take and its MP3 alike, leaving a little room (about a third of a second before, half a second after). A take that is silent throughout, or has nothing worth cutting, is left as recorded. The trim happens in the background a minute or so after saving, so the take's length in the list updates then.

A take stops and saves on its own at 15 minutes (a notice appears at 10), and after 2 minutes of silence: saved when it had sound, discarded when it never did. A take is at most 120 MB. Whatever the format, every take is also converted to MP3 for playback, so a take recorded losslessly on one device plays on any other.

## Tips

- Keep the screen on and the app in front while recording: a phone stops the microphone when it sleeps or switches apps.
- Voice processing is switched off so instruments sound like themselves; the level meter shows what the microphone hears.
- Takes are saved as your browser recorded them (see Quality above) and converted to MP3 for playback; downloads and demos made from a take use the original.
- On an iPhone or iPad the volume slider is hidden: iOS keeps playback volume on the hardware buttons.
