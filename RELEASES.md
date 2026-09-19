# Releases

What changed for people using Stem Shovel, one section per version, newest
first. This is the source of the `/releases` page: new features, improved
or changed features, and fixes worth knowing about. Nothing about
permissions, administration or how the app is built belongs here; that is
CHANGELOG.md.

## [Unreleased]

## [0.20.0] - 2026-09-19

### Added

- **A Releases page.** This page: what changed in each version, linked from the footer.
- **Try the Idea Recorder on the front page.** A working demo: record a take, name it, jot notes, play it back and download it. Takes stay on the page until you leave; sign in to keep them with your ideas.
- **Record Idea** on a project page, beside Add New Song.

### Changed

- **The recorder's input line wraps** onto two lines, the microphone and the format being recorded, instead of cutting the format off.

## [0.19.0] - 2026-09-19

### Added

- **Lossless takes.** The Idea Recorder records Apple Lossless on an iPhone, iPad or Mac running Safari 18.4 or later, and lossless FLAC on Chrome and Edge; elsewhere a compressed take at 256 kbit/s. Recorder settings gain **Quality** (lossless where the browser can, or compressed for a metered connection), **Stereo input** for interfaces, and a **Microphone** picker. While recording, the line under the meter says what is being captured, for example "ALAC lossless · 48 kHz · mono".
- **Listening back at full quality.** Playback uses a take's original whenever the browser can play it, and the MP3 otherwise: the device that recorded a take hears it lossless, a Mac plays an iPhone's take, and everything else still plays.
- **Download source or MP3** from the recorder's ⋯ menu: the take exactly as recorded, or the MP3 made for playback.
- **An empty song offers three buttons**: Upload stems, Upload a demo and Record a demo.

### Changed

- **Search in the Idea Recorder is a filter over every idea.** The sheet lists all ideas, full screen on a phone; typing narrows them by title, notes, take name or number, and an idea unfolds to its takes.
- **Switching takes puts the transport back to zero.**
- **A take stops on its own** at 15 minutes (a notice at 10) and after 2 minutes of silence, discarded when it never had sound.

### Fixed

- **Recording on an iPhone after playing a song in the same tab** no longer fails with an audio session error.

## [0.17.4] - 2026-09-19

### Fixed

- **The stem player is heard on an iPhone with the ring/silent switch on**, like a music app. The recorder, demos and playlist already were.

## [0.17.3] - 2026-09-19

### Fixed

- **Password managers no longer pop up in the recorder's fields** on iOS.

## [0.17.2] - 2026-09-19

### Added

- **A docs page for the Idea Recorder**: ideas and takes, notes, the list, into a song, settings and limits, phone tips.

### Changed

- **The recorder's volume slider is hidden on iPhone and iPad**, where iOS keeps playback volume on the hardware buttons.

## [0.17.0] - 2026-09-19

### Changed

- **Faster first loads.** Song and project pages sometimes took five seconds to open; they now open in well under a second, even after a quiet spell.
- **Ceilings on a take**: a take stops and saves at 15 minutes and after two minutes of silence, and a take is at most 120 MB.

### Fixed

- **The AI chart draft now has the song's transcribed notes to work from** on the live site, which it never had before.

## [0.16.0] - 2026-09-18

### Added

- **The Idea Recorder.** Record riffs, melodies and rough takes straight from the microphone. An **idea** is a title, a note board and numbered **takes**: Record starts a take, Stop saves it at once and you can go again without waiting; a take can be named before, during or after; the "Take N" label jumps between an idea's takes. The ⋯ menu adds a take to a song as a demo, creates a new song from it, downloads it or deletes it, and can merge the idea's notes into the song's notes. Find it as Idea Recorder in the header, or from a song's Uploads menu.
- **Ideas list.** Your ideas under the recorder, newest first, each unfolding to its takes, with a search. Ideas with neither takes nor notes are tidied away on their own.
- **Notes for an idea**: a note board beside the recorder that saves as you type.
- **Recorder settings**: discard takes shorter than 3 seconds automatically, on by default.
- **Phone layout** for the recorder: notes right under the recorder, ideas in a picker.

### Fixed

- **Landing on "/undefined" after the two-factor code.**

## [0.15.0] - 2026-09-17

### Added

- **The AI listens when the time signature is a close call** and shows its answer with "Use these".
- **Notes on an idea** in the recorder page.
- **Instant next takes**: Stop hands the take to a background upload and Record is ready at once; an Uploads strip shows progress and a refresh or a phone switching apps resumes the upload.
- **A take into a song from a menu**: "Add as demo…" and "Create new song…", with a box to merge the idea's notes into the song's notes.
- **Idea Recorder playback**: a Play button, a volume slider and a ⋯ menu with Download.
- **Top nav links**: Projects and Idea Recorder in the header.

### Changed

- **Song settings is a panelled popover**, full screen on a phone with one panel at a time.
- **Mobile layout** across the song page, the front page demos, the footer and sign-in.
- **Monospace is a choice per document** from the panel's ⋯ menu; charts are no longer monospace by default.
- **Uploads and Downloads menus** on the song page.
- **The project playlist player** shows the playing song and its position.

### Fixed

- **Time signature detection** votes per stem, so a 4/4 song is no longer heard as 3/4 because of one part.

## [0.14.0] - 2026-09-17

### Added

- **Your mix and the default mix.** Faders, mutes, solos and the master are yours, kept in your browser and there when you come back; "Reset Mix" puts them back. Members set the balance everyone starts from with "Save as Default Mix", which also re-renders the Original Mix MP3.
- **Add Demos** beside Add Stems on a song without stems.
- **Replace Stems**: upload new files for existing stems, matched by filename or label.

## [0.13.0] - 2026-09-17

### Changed

- **The site moved to www.stemshovel.com.** Old links redirect.

## [0.12.0] - 2026-09-17

### Added

- **Live demos on the front page**: a real song's player and its documents.
- **Beta waitlist** with a confirmation email.
- **Two-factor authentication** with an authenticator app, in your security settings.
- **Finished songs**: mark a song finished in its settings; it stays playable and editable in its own list.
- **Request a feature** from the footer, beside Report a bug.

### Changed

- **Charts are monospace**, so chord grids line up.

## [0.11.0] - 2026-09-16

### Added

- **Account plans.** Every account is on the free plan for now; founder accounts are never charged.

### Changed

- **The document panel's ⋯ menu is always present.**

## [0.10.0] - 2026-09-16

### Added

- **Editing in the song page panel**: charts, lyrics and notes are edited where they are read, autosaving as you type, with a ⋯ menu for Rich Text or Markdown and the AI draft.
- **The AI draft previews** in the panel before you keep or discard it.

### Changed

- **Deleting a project needs it archived first.**
- **The player's status bar** reads more clearly.

### Fixed

- **A failed chord detection or AI draft** now tells you why.

## [0.9.0] - 2026-09-16

### Added

- **Detect chords** from the stems, and **Draft chart with AI** from what was heard.
- **Archive, restore and delete projects** from project settings.
- **"Do not use AI"** on a project or a song, honoured everywhere.
- **Scan stems** to detect tempo, key and time signature again.

### Changed

- **Charts, lyrics and notes are edited in place.**
- **Key detection ignores drums**, and tempo detection prefers the 80–170 bpm band.

## [0.8.0] - 2026-09-16

### Added

- **Tempo, key and time signature are detected at upload**, and **Ask AI to check** gives a second opinion.
- **New account** for existing members.

## [0.7.0] - 2026-09-16

### Added

- **Private projects and songs with viewing links** for people outside the account.
- **Belonging to several accounts**, with an account menu in the header.
- **Invitation-only sign-up** with invite codes.
- **User docs** at /docs, starting with getting started, stems and playback, song settings, documents, comments, downloads and sharing, accounts, security and reporting a bug.
- **Report a bug** from the footer.
- **Privacy policy and copyright policy.**

### Changed

- **Project pages split songs into "Songs in Progress" and "Song Ideas."**
- **Mix downloads carry the song version** in the filename.

### Fixed

- **Popover forms no longer show the previous entry.**

## [0.6.0] - 2026-09-14

### Added

- **Comments on songs**, pinned to a point on the timeline.

### Changed

- **Notifications instead of inline "Saved." lines.**

## [0.5.0] - 2026-09-14

### Added

- **Email** for verification and password resets.
- **A MIDI file per stem**, shown as a piano roll in the stem row.
- **Song info popover** in the header.

## [0.4.0] - 2026-09-13

### Added

- **Song version** with a "stems updated" note when they change.
- **Readout formats**: timecode and bars.

### Changed

- **Stem rows and transport restyled.**
- **Project settings are a popover.**

## [0.3.0] - 2026-09-13

### Added

- **Song notes**, alongside chart and lyrics.
- **Song sections**, with the section index and bars on the transport.
- **Tempo, key and time signature** on the song, shown at the playhead.
- **Timecode and bars everywhere.**

## [0.2.0] - 2026-09-13

### Added

- **Demo recordings per song**: phone memos and rough takes, played from the song page.
- **Songwriter and date first written** in song settings.
- **Sign-in** with an account of your own.
- **Download MP3**: the original mix and your custom mix.
- **Project playlist**, playing a project's songs in order.
- **Go to beginning** on the transport.

### Changed

- **Song settings and Add Song are popovers.**
- **Layout and style pass.**

### Fixed

- **Uploads of .m4a files from a Mac or iPhone.**
- **Switching tracks while playing.**

## [0.1.0] - 2026-09-12

### Added

- **The first Stem Shovel**: projects, songs and stems, uploads straight from the browser, a multi-stem player with faders, mute and solo, and a chart and lyrics per song.
