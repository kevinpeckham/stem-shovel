# Song settings

The gear button in a song's header opens its settings. Everything here is optional apart from the title.

## About the song

**Title**, **description**, **written by** and **date first written** describe the song; the ⓘ button in the header shows them to anyone.

**Version** is the song's own number, `0.0.1` to begin with. When stems change, the page offers to bump it (patch, minor or major). The version goes into the names of downloaded mixes, so a file says which revision it came from. **Last updated** is kept for you.

## Tempo, key and time signature

These are entered as **changes**, each with a start position, so a song that speeds up or modulates is described exactly. The first change usually starts at the beginning. With a tempo and a time signature in place, positions can be shown and typed in bars, and the timeline shows a lane for whatever changes during the song.

**Detect chords** transcribes the tonal stems and reads a chord per bar (it needs the tempo and time signature first, and takes a little while), then has the AI correct the bars whose notes clearly say otherwise and tells you how many it changed. Treat the result as a rough read: on a real recording about half the bars come out right, so check them against your ears before you draft or save; **Draft chart with AI** then turns the chords into sections, a progression per section and a chart written the way your other charts are, which you can save as the song's sections and chart, with a check before anything is replaced. **Scan stems** listens to the loaded stems again and fills these in when they are empty, or offers to replace what is there. It reads the key per section when the song has sections (every half minute otherwise), so a song that moves through keys gets a key change where each begins; the song's key then reads "C major (also A♭ major, F major)", and the timeline's key lane shows each where it begins; click a key (or a tempo or time-signature marker) on the timeline to jump there. Add, move or remove key rows below to override what it heard. **Ask AI to check** sends the mix and the song's score to a model that reads the chart while the recording plays: it reports the keys and where each begins, and the time signature and tempo marks the chart states, each with its time. It needs the song's chart: the chord chart written in the Chart tab, or a score (below). A model listening on its own only reads back what it is told. When the score is a PDF or an image, the AI first reads it into one line per measure; if that reading looks wrong (a key signature with flats while no chord shows one is the usual sign of a PDF that lost its accidentals), the answer says so and waits for you. **What the AI read**, in a score's ⋯ menu on the Chart tab's notation view, shows the lines so you can correct a key, a chord or a measure and save: the check reads your corrected text from then on, and **Read again** lets the AI start over.

A score is a MusicXML file, or a PDF or image marked as notation on the Attachments tab; the song's own chord chart serves when it has none. It goes to the model with the mix, and the chart's key signatures and chord symbols decide the keys while the recording places each change in time; the tempo and time signature come from the chart only where it marks them, and stay as detected otherwise. **Scan stems** then goes straight to the AI on such a song (the stems are only scanned when it cannot answer, say while the mix is still rendering), and an upload sets the song's keys from the score once the mix is ready. The surest way to get a song's keys right is to attach its chart.

## Sections

A section has a **name** (Intro, Verse, Chorus …) and a **start** position. The name is how a section is known: write it the way the chart's `##` headings have it, and a section that comes back keeps the same name. Sections show as a row above the stems; a block is narrow, so it shows a short form of the name (In, V1, Ch1, V2, Br, Out) and the full name when it has room or on hover. **Detect** sends the mix to a model that listens and marks where each section begins, naming them the way your other songs do; when the song has a score attached, the chart's rehearsal marks and section words lead. A song with no sections gets them at once; one that has some is shown the answer first, with **Use these** to replace them.

**Place from chart** does the same without AI: it reads the song's chart (the chord chart you wrote, or a notation file the AI check has read), plays it to itself as plain chords at the chart's tempo, lines that up with the stems in your browser and puts each section where the chart's bar lands. Mid-song this is good to a tenth of a second; the first and last sections are marked approximate, since a chart rarely describes the intro or the end of the outro, and so is any section where the chart stops matching what was played. It needs a tempo and chord symbols in the chart, and the stems decoded in the player. The AI check uses the same alignment to place the key and tempo changes it finds, when the chart fits the recording; when it does not, the card says so.

## Start and end markers

If the audio has silence before the first bar, set where **bar 1** starts so the bars readout lines up. An **end** marker trims silence at the end of the timeline.

## Frame rate

The frame rate used by the timecode readout, matching your DAW project.

## Credits

**Credits** names the people on the song by role: **Artists** (who performs it; the line under the song's title, which otherwise shows the account's name), **Composers** (the "Written by" line) and **Producers**. Type a name and press Enter, or pick one you have used before: every name goes into the account's artist directory, so the same act on twenty songs is one entry, and a name typed with different capitals finds the existing one. Credits save as you add and remove them. In account settings, **Default artist for new songs** picks the artist every new song starts credited to, handy for a band's own account. **Manage artists** (from account settings or the credits) opens the directory: whether each artist is a solo artist (with their own email) or a band or group (with the people in it, what they do and an email), plus website and notes, and, for owners and admins, an **Invite to account** button beside anyone with an email who is not a member yet. A song can have several of each, a hip-hop collaboration for instance, and a soundtrack project's artists are simply everyone credited on its songs.

## Demo recordings

Upload a phone recording or a rough bounce as a **demo** (most audio formats are accepted and converted to MP3 for playback; up to 12 per song). Demos play in the song page's **Demos** view: a Stems / Demos switch above the player shows one or the other, and a song with demos but no stems opens on the demos. Anyone can listen or download them there; remove one here.

## No AI

Some artists' contracts rule out any AI touching their work. **Do not use AI** in the song's settings (or the project's, which covers all its songs) switches every AI feature off for it: no chart drafts, no AI checks, no transcription. Tempo and key detection, which is plain signal processing in your browser, still works.

## Stage

A song is at one of four stages: **Writing** (the idea, its demos, lyrics and a chart), **Arranging** (stems to play along with and build on), **Mixing** (the engineer's mixes for the band's feedback) or **Finished**. Left to itself a song is Writing until a stem makes it Arranging and a mix makes it Mixing; set the stage by hand under Options when the song is somewhere else, or choose Finished when it is done, which files it under Finished Songs on the project page. Nothing else changes with the stage except what opens first: the song page opens on the mixes at Mixing and Finished, the demos at Writing and the stems at Arranging, and the project page plays the newest mix or the stems mixed down to match. Everything stays editable at every stage.

## Private

A song is public by default: anyone with its address can open it. **Make private** limits it to members of the account and to people with a viewing link (see _Downloads and sharing_). A song in a private project is private already.

## Deleting a song

At the bottom of the settings panel. This removes the stems and everything else on the song and cannot be undone.
