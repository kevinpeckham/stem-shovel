# Releases

What changed in Stem Shovel, release by release, as a user would notice it. The page at /releases renders this file; CHANGELOG.md is the full technical record.

## [Unreleased]

### Fixed

- **No doubled rehearsal letters on the draft card and in the editor preview** either.

## [0.259.1] - 2026-11-10

### Changed

- **A chart read from an uploaded score opens on the score.** The Chart tab shows the uploaded page first for such a chart, with Grid beside it.

## [0.259.0] - 2026-11-10

### Fixed

- **No doubled rehearsal letters.** A chart that carries its own rehearsal marks keeps them, and the automatic letters on section headings stand down instead of repeating each letter.

## [0.258.1] - 2026-11-10

### Fixed

- **A score that opens without chord symbols reads into a clean chart.** A melody-only first section used to come out as holds with nothing to hold, which the grid marked and the score refused. Such bars now read as N.C., and Read again repairs a chart read earlier.

## [0.258.0] - 2026-11-10

### Fixed

- **"The score couldn't be drawn" now says why.** The Chart tab names the line the score engraver cannot read, so you can fix it in the text.
- **A chart read from a PDF or image shows that file as its score.** When your chart came from an uploaded score page, Score on the Chart tab shows the page itself, not an engraving of the read.

### Added

- **A tempo unit for 6/8 and other compound meters.** The app counts a 6/8 tempo in eighth notes (120 is 40 dotted quarters a minute), which it now says in Song settings, and a tempo row in a compound meter offers the unit you count in: type 40 dotted quarters and it is saved as 120.

### Changed

- **Setting a song's tempo from the stems prefers the finer bar.** When the stems scan sets a song that has no tempo yet and two bar lengths nearly tie, it takes the shorter one, which a chart can always merge up without losing a chord.

## [0.257.0] - 2026-11-10

### Added

- **One chart, and your scores as its sources.** The Chart tab's Chords / Engraving switch is gone: a song has one chart, seen as text, as the grid or as an engraved score. Uploaded scores (MusicXML, or a PDF or image of a score) now live in a **Scores** section at the top of the song's Attachments panel, each with **Use as chart**, which reads the score into a draft you can check before it becomes the chart. The Chart tab says where the chart came from ("From Lead sheet, read Nov 10, 2026") with **Read again**; a song with no chart yet offers **Write it**, **Generate from the stems** and **Import from a score**.

- **See a chord chart as a full score.** The chart on a song's Chart tab has a Grid / Score switch: Score draws it as an engraved lead sheet, with slash notation, chord symbols, section names, tempo and bar numbers. The first switch takes a few seconds while the engraver loads.

### Changed

- **A pickup bar is bar 0.** Charts that open with a pickup now number it 0 and the first full bar 1, as notation does, in the grid, the score, the bar readouts and the exported MusicXML.

## [0.256.0] - 2026-11-09

### Changed

- **Generate chart holds a draft it has reason to doubt.** When the bars it placed drift well off the song's tempo, or the stems give too few notes to hear the chords, the draft waits on its card with the reason instead of being saved on its own.

## [0.255.0] - 2026-11-09

### Changed

- **Generate chart asks you to check a tempo it had to guess.** On a song with no tempo set, Generate chart from the stems still sets the tempo and time signature and drafts the chart, but it no longer saves that chart on its own. The draft waits on its card so you can check the tempo and time signature first.

## [0.254.1] - 2026-11-09

### Fixed

- **Charts in 6/8 and other compound meters place correctly.** A chart with its own tempo line in a compound meter was read three times too slow when placed on the stems.

## [0.254.0] - 2026-11-09

### Changed

- **Generate chart from the stems checks its work before saving.** A draft with errors, without its timing, or with most of its bars unnamed now waits on the draft card for you to review, with a note saying why, instead of being saved. When it does save, the notification mentions anything worth a look.
- **Tempo & key explains an unplaced bar 1.** When the stems do not settle where bar 1 is, the tab says what each reading found.

## [0.253.0] - 2026-11-09

### Changed

- **The song page shows the player at once.** The transport and the stem rows are on the page as soon as it arrives, instead of appearing after the scripts load; the waveforms and controls fill in as the stems load.

## [0.252.1] - 2026-11-09

### Fixed

- **Bar numbers match the chart after a repeat.** When the player follows a chart's timing, the transport, the position fields and comment positions now show the bar number as the chart writes it, so a bar played again under a repeat keeps its written number.

## [0.252.0] - 2026-11-09

### Added

- **Generate a chart in one click.** A song with no chart offers "Generate chart from the stems" on its Chart tab: it sets the tempo and time signature when the song has none, hears the chords and the bars, drafts the chart with the AI and saves it with its sections, showing each step as it goes, with Cancel at hand.

### Fixed

- **Saving a drafted chart or its sections now shows that it worked**, and the draft card goes away once the chart is saved instead of doubling the chart on the page.
- **Notifications are no longer hidden behind the song settings.**

## [0.251.0] - 2026-11-08

### Added

- **Use what the stems say as the song's grid.** When Detect chords has found where the bars fall, a click under its card sets the song's start of bar 1 and its tempo to match, so the player, the readout and the click count bars from there.

## [0.250.0] - 2026-11-08

### Changed

- **Detect chords places the bars on the recording's own beat.** On a song with one tempo and one time signature, Detect chords now listens for where the bars fall in the recording, choosing bar 1 from the recording's start, the chord changes and the section changes together, and reads the chords on those bars. The detected-chords card says where bar 1 landed and which of the three agreed. When they cannot agree, the song keeps its declared tempo as before, and a song whose "Start of bar 1" is set gets bar 1 there. Nothing that plays changes.

## [0.249.0] - 2026-11-08

### Changed

- **Placed charts sit on the beat.** Placing a chart now lines every bar up with the recording's own onsets, which fixes bar lines that sat a fraction of a beat off at fast tempos.
- **Placing a chart again is faster.** After the first placement, the browser remembers what it heard in the recording, so placing an edited chart skips the listening and only fits the chart.

## [0.248.0] - 2026-11-08

### Added

- **Chart from MIDI.** Attach a MIDI file to a song and its ⋯ menu reads the harmony into a chart draft, bar by bar, with the file's markers as sections, ready to save as the song's chart.

## [0.247.0] - 2026-11-08

### Added

- **Chart as MIDI.** The song's menu now downloads the chord chart as a MIDI file beside the MusicXML one: the chart's play order as block chords with a bass, one track per part, your section headings as markers and the lyrics as lyric events, ready for a DAW or a notation program.

### Fixed

- **A drum kit with one sample missing still plays its other voices.**
- **Charts exported as MusicXML keep their repeats and jumps in order** when a repeat holds a repeat or a jump runs through a replay, and scores from Dorico import with their section names as headings.

## [0.246.0] - 2026-11-08

### Fixed

- **Placing a chart against the stems lands the first and last bars.** The alignment used to drift at a song's intro and ending; it now keeps the steady middle and fits the ends to the recording's own beats, so the sections and the bar timing it produces hold from the first bar to the last.

### Changed

- **Placing a chart against the stems is faster**, about four seconds for a full song where it took seven.

## [0.245.0] - 2026-11-07

### Added

- **Bar lines that follow the recording.** Once a song has a timing map, from a chart draft or from placing the chart against the stems, the Tempo & key tab offers to follow it: the bar readout, the click and the sections then sit where the band actually played the bars, not where a steady tempo says they should be. It is off until you turn it on.

## [0.244.0] - 2026-11-07

### Added

- **Better chart drafts.** The AI draft now starts from a chart built straight from the detected chords on the song's bars, so chords that change mid-bar are kept, chords are spelled for the key, and sections land on bar lines. The AI refines that chart rather than writing one from scratch. A draft is available even where the AI is switched off.

### Changed

- **Chord names read the way barmark writes them.** Minor sixths, half-diminished and minor-major sevenths keep their quality instead of collapsing to plain minor or dim; a bar the model could not read shows `?`. Detected keys are spelled with the fewest accidentals (A♭ rather than G♯).
- **A picture when you share a link.** Posting a Stem Shovel page on social media now shows a card with the site's look, on every page.

## [0.243.0] - 2026-11-07

### Added

- **Files in the chat.** Attach pictures, PDFs, audio and other files to a chat message with the paperclip, by dropping them on the box, or by pasting a picture. Pictures show as thumbnails; other files download with a click. A message can be files alone.

## [0.242.0] - 2026-11-07

### Added

- **The band directory.** A Members page under Manage lists everyone in the account with a phone, what they play and notes, which each member fills in for themselves. A Contacts page keeps the people around the band, promoters, booking agents and sound engineers, with how to reach them and the shows they were part of. A show's books now pick the promoter from your contacts.

## [0.241.0] - 2026-11-07

### Added

- **The books.** A show's page now keeps its money: the ticket price and link, tickets sold, attendance, the deal, the promoter and the take, plus who got paid what out of it, with what is left. The Shows page shows each show's tickets and take and adds up every year's played shows.

## [0.240.0] - 2026-11-07

### Added

- **Chart from score charts a part.** A score with no chord symbols now offers the parts that have notes, and the one you pick is charted from its notes.

## [0.239.0] - 2026-11-07

### Added

- **Chart from score.** On the Chart tab's Notation view, a MusicXML score's ⋯ menu now has Chart from score: its chord symbols, keys, meters, tempo, sections, repeats and endings become a chart draft you can save as the song's chart, with a note of anything the file carried that a chart cannot.

## [0.238.0] - 2026-11-07

### Changed

- **Charts can carry lyrics.** A chart drawn on the song page now understands barmark's lyric rows and syllables on notes: a `lyrics:` line under a bar line puts the words on the beats, verses are numbered, and a line that sings draws its notes with the syllables under them. A line of three or more hyphens now ends a system, and a leading backslash hides itself, so `\~76 bpm` shows as "~76 bpm".

## [0.237.0] - 2026-11-07

### Changed

- **Older songs get their chords read sooner.** Opening a project reads the chords of its songs that the chord model has not seen yet, so Detect chords on one of them answers at once.

## [0.236.0] - 2026-11-07

### Changed

- **Detect chords listens to the mix.** On the song page, "Detect chords" now reads the chords from the song's mix with a chord model that runs on the server, soon after the stems are uploaded. On a real recording it names about three bars in four right, up from about one in three. It knows roots and plain chords (major, minor, sevenths, diminished, suspended), not power chords or inversions, so check the colors against your ears before you draft or save. A song with no mix yet still gets the older read from the transcribed stems.

## [0.235.0] - 2026-11-07

### Added

- **Every viewing link in one place.** An account's settings now lead to a page listing every viewing link the account has handed out: what it opens, who made it, how often it was used and whether it still works, with the open ones first. Any of them can be revoked there, and the list is a link away from any song's, project's or session's own links.
- **The Releases page in pages.** This page now shows fifty versions at a time, newest first, with Newer and Older at the bottom.

## [0.234.0] - 2026-11-06

### Fixed

- The Practice amp opens again from the song page. Since the last release its button lit up but the panel stayed away.

## [0.233.0] - 2026-11-06

### Fixed

- The Attachments panel's empty state reads properly again, with a space before its upload hint.

## [0.232.0] - 2026-11-06

Maintenance release with no user-visible changes.

## [0.231.0] - 2026-11-06

### Fixed

- **Detected chords read power chords and bar changes better.** A bass note that leads into the next bar no longer renames the bar it ends, and a faint overtone no longer turns a power chord into a sus2.

## [0.230.0] - 2026-11-06

Maintenance release with no user-visible changes.

## [0.229.0] - 2026-11-06

### Fixed

- **The site's typefaces are back.** Since the evening of November 5 every page had rendered in your browser's standard fonts instead of Stem Shovel's own. The fonts now ship with the site itself.

## [0.228.0] - 2026-11-06

### Added

- **Change the email you sign in with.** Security, in the account menu, now shows your sign-in address with a **Change email** button. A link goes to your current address to confirm, then a link to the new one to verify it; the change takes effect once both are opened. Everything else about your account stays as it is.

### Fixed

- **The MIDI view lines up with a count-in.** A stem's piano roll now starts at the song's start offset, so notes exported from bar 1 of a DAW sit under the right part of the recording when it carries a count-in.

## [0.227.0] - 2026-11-05

### Changed

- **The chart editor says why a chart has no bars.** A chart written as prose, or one whose only line of bars has a mistake, used to get "No bars read" and nothing more. The line under the editor now names the problem, shows a two-line example of a section with its bars, and links to the guide on writing a chart.

## [0.226.0] - 2026-11-05

Maintenance release with no user-visible changes.

## [0.225.0] - 2026-11-05

### Changed

- **The documentation PDF draws the chart as a chart.** The Chart page of a song's documentation PDF, and the chart PDF in the project's charts zip, now look like the Chart tab: sections with their rehearsal letters, bar numbers, bar lines, repeats and endings, and chord names with their sharps and flats, which the old text page had been dropping.

## [0.224.0] - 2026-11-05

### Added

- **A bar count under the score's read.** The "What the AI read" editor now ends with the bars the read plays, its sections and its length at the song's tempo, updating as you correct the read, so a missed repeat or a dropped bar line shows as a length that does not match the recording.

## [0.223.0] - 2026-11-05

### Added

- **Download the chart as MusicXML.** A song's Downloads menu has **Chart as MusicXML**: the chord chart as a MusicXML file that MuseScore, Dorico, Sibelius and Finale open, with the chart's bars, chord symbols, repeats, endings, sections and parts, playing in the chart's order. The project's **Download All Charts** zip carries each chart as a `.musicxml` file beside its `.chart.md` and PDF. A chart with errors listed under the Chart tab's editor cannot be exported until they are fixed.

## [0.222.0] - 2026-11-04

Maintenance release with no user-visible changes.

## [0.221.0] - 2026-11-03

### Added

- **A chart can name its part.** A `part:` line (`part: Electric Guitar 1`) leads the chart's header, and a score the AI reads shows the part it read over the chart. Several parts can share one chart as labelled bar lines, drawn as stacked rows.

## [0.220.0] - 2026-11-03

Maintenance release with no user-visible changes.

## [0.219.0] - 2026-11-03

### Changed

- **The AI reads a score into a chart.** When a song's score is a PDF or an image, the AI now reads it into a chart in the same notation as your own charts, every measure as a bar under the score's own measure numbers, with its repeats, endings, directions, rehearsal marks and section names. **What the AI read** shows that chart for correction, and a bar it cannot read is pointed out with its line as you type.

## [0.218.0] - 2026-11-03

### Added

- **Charts draw more of the page.** A chart can carry rehearsal marks, words over a bar ("solo"), accents, hits, push marks and chords with an omitted third or fifth (`C7(no3)`), and the bar numbers in the margin follow the written numbers through a repeat with endings.

## [0.217.0] - 2026-11-03

Maintenance release with no user-visible changes.

## [0.216.0] - 2026-11-03

### Added

- **Endings and directions in charts.** A chart can write first and second endings (`|1 Em | C :|` then `|2 Em | D |`) and the directions a lead sheet uses: Segno, Coda, To Coda, Fine, and a D.C. or D.S. jump. Charts draw the ending brackets and the signs, and importing a chart to the chord player or placing its sections in the Studio follows the endings and the jump in play order.

## [0.215.0] - 2026-11-03

### Changed

- **A chart keeps your swing.** The chord player's Barmark chord chart download now writes how much swing you had set (as `feel: swing 58%`, for instance), and Import reads it back onto the Swing slider, so a groove survives a download and a re-import. A chart with more swing than the player can give imports at the slider's top and says so. Describe may set a swing amount when your words call for one.

## [0.214.0] - 2026-11-02

### Added

- **A chart on your ideas.** The Idea Recorder's notes panel now has Notes and Chart tabs. The Chart tab holds a chord chart for the idea, drawn as you type and saved on its own like the notes. Studio songs have the same tab when you are signed in, and a song's chart is offered first in Sections from a chart. When you make a song from a take with the notes merged, the chart comes along if the song has none yet.

### Changed

- **Chord names spelled one way everywhere.** The chord player, the piano readout, the style editor and chart imports now spell chords alike: altered tones in parentheses (Bm7(♭5), G7(♭9)), added tones as C(9) and Am(9), diminished as ° and augmented as +. An inverted chord's bass note is spelled in flats in a flat key. The minor thirteenth wedge is now named Am9(13) to match the notes it plays. Nothing you hear has changed.

## [0.213.0] - 2026-11-02

### Added

- **Studio: sections from a chart.** A menu beside Add section in Dawn's transport takes a barmark chord chart, pasted or picked as a file, and puts a section marker at each of its headings from the playhead, timed by the chart's tempo or laid on the Studio's own bars when the chart names none. One Undo removes them all.

## [0.212.0] - 2026-11-02

### Added

- **Import a chart into the chord player.** The progression pad's Import menu takes a barmark chord chart, pasted or picked as a file: its key, meter, tempo and feel set the player and each chord lands with its beats. The pad tells you when it had to round a chord to the beat or strike a long one again.
- **Describe writes real charts.** Text-to-Progression now answers with a chord chart in the notation the song pages use, so what lands on the pad is exactly what a pasted chart would be.

## [0.211.0] - 2026-11-02

### Added

- **Download a chord chart from the chord player.** The progression pad's Download menu saves your progression as a MIDI file or as a barmark chord chart you can paste into a song's chart, with its key, meter and tempo. Saved progressions now remember their key.
- **Humanize on the progression pad.** A Humanize slider in the Timing menu lets the pad's chords land a little early or late and a little louder or softer, as a hand would, and the MIDI download carries the same feel. Off by default.
- **A Key menu on the chart.** Beside the chord spelling menu, Key draws the chart in another key for the night, without changing the chart itself. It is remembered per song in your browser, and the editor stays in the written key.
- **Set list show view: key and spelling.** A chart opened in a set list's show view has the same Key and chord spelling menus.
- **Create new account** from the dashboard's More section.

### Changed

- **Download All Charts** now saves each chart as a `.chart.md` barmark file alongside its PDF.

## [0.210.0] - 2026-11-02

### Changed

- **The home page's chart demo** now draws straight on its panel, without a paper of its own.

## [0.209.0] - 2026-11-02

### Fixed

- **A power chord reads right as a number.** In the Nashville and Roman spellings a power chord's 5 is raised: D5 in D reads 1⁵ and I⁵, where the Nashville spelling used to read as 15.

## [0.208.0] - 2026-11-02

### Added

- **Chord spelling on the home page demo.** The chart in the home page's documents demo now has the same chord spelling menu as a song page: chord names, Nashville numbers or Roman numerals. Your choice is remembered and shared with the song pages.

## [0.207.0] - 2026-11-02

### Added

- **Chord spelling on the Chords view.** A small menu beside the Chords / Engraving switch spells the chart's chords as chord names, Nashville numbers or Roman numerals, each chord as its degree in the key of its bar. The choice is remembered by your browser and applies to the chart and to the editor's live preview.

## [0.206.0] - 2026-11-02

### Changed

- **Place from chart is stricter about a wrong chart.** A chart now has to match the recording bar by bar, not just overall, before the app places sections, keys and tempos from it. A chart for a different song is told apart more reliably and marked as not matching.
- **Chord charts breathe a little more.** A small gap between rows of bars, so one row's bar lines no longer run into the next.

## [0.205.0] - 2026-11-01

### Changed

- **Charts are read as barmark only.** Every chart is now in barmark notation, so the app no longer reads the earlier chart notation. A chart written the old way shows its problems under the chart; the Writing a chord chart page explains the new form.

## [0.204.0] - 2026-11-01

### Changed

- **Charts are edited as plain text.** The Chart tab opens the chart's source, in a monospace editor, with the chart drawn live below it as you type. There is no Rich Text view for charts any more; lyrics and notes keep both views.
- **Chords and Engraving.** The Chart tab's switch now says Chords (the chord chart) and Engraving (the engraved score) instead of Text and Notation.
- **A new look for charts**, matching barmark.dev: larger chords, bar numbers in a gutter, rehearsal letters on each section, italic note lines and serif lyrics.
- **Gradual tempo changes.** A chart can say `tempo: rit.`, `tempo: rit. to 90`, `tempo: accel.` or `tempo: a tempo`, and the chart draws the bars it covers. Chord names written the way Logic Pro spells them, like `C7(b9)(#11)`, now read as written. A chart with text but no bar lines warns instead of reading as empty.

## [0.203.1] - 2026-11-01

### Fixed

- **Start of bar 1 and End save again.** Entering a start or end position in Song settings › Details reported "saved" but stored nothing, and a saved position opened blank. Both work now.

## [0.203.0] - 2026-11-01

### Added

- **Chord charts are drawn as charts.** The Chart tab now draws your chart as a grid of bars in a music font, with section headings, bar numbers and repeat marks, wherever a chart appears: the song page, its history, the AI draft preview and a set list's show view.
- **Right-click a spot in a waveform** (or Ctrl / ⌘-click) for a menu at that spot: seek there, or comment there. The same menu works on the mix timeline and the demos.

### Changed

- **Charts are written in barmark**, an open notation for chord charts that grew out of this app. Headings name the sections, bar lines hold the chords, and the form of the song is a list of headings in play order. Writing a chord chart explains it, and barmark.dev has the full guide.
- **Sections are known by their name.** The numeral column in a song's sections is gone; the name matches the chart's heading, and the timeline shows a short form of it (In, V1, Ch1, Br, Out) with the full name when there is room and on hover.
- **The Stem Player's status line** moved from the widget's header to the first line of its body, so it no longer crowds the controls.

## [0.202.0] - 2026-10-31

### Added

- **A readout under the chart** says how the app reads it as you type: the bars and sections it found, the song's length, and a note for anything it could not follow. An info tip beside it links to Writing a chord chart.
- **Charts place sections more surely.** The chart reader follows your section headings, repeats and the play order you wrote, so Place from chart puts the sections where the band set them.

### Changed

- **Chord symbols read parentheses the way Logic does**: G5(7) is G, D and F.

## [0.201.3] - 2026-10-30

### Fixed

- A song's description, or any settings field you had typed in, came back blank the next time Song settings opened, and saving again kept the blank. Settings now reopen on the saved values. The same fix covers project, blog post and docs settings.
- A document's History panel showed "Could not load the history". The versions list again.
- Two missing spaces: in a comment's date line and in the title of a comment on a demo.

## [0.201.2] - 2026-10-30

### Fixed

- **The chart is recognized as its own recording.** The alignment called the band's own correct charts a mismatch on real recordings and marked every placement approximate. When the chart fits, the first section now starts at the recording's first sound and the last ends at its last.
- **Keep on this device keeps the song.** The link fetched nothing and then reported that the device would not keep every stem. The offer now says about how much the song will take and, through an info button, what keeping does and does not do.

## [0.201.1] - 2026-10-30

### Fixed

- **Keep on this device now shows on the song page.** The link from 0.201.0 was hidden on the song page; it sits in the player's status line, after the decoded size.

### Changed

- **Detected chords are checked by the AI.** After Detect chords reads a chord per bar from the stems, the AI corrects the bars whose notes clearly say otherwise, and the card tells you how many it changed. The chart draft starts from the corrected chords. Chords detected from a real recording are still a rough read, and the card now says so.

## [0.201.0] - 2026-10-30

### Added

- **Keep a song on this device.** The stem player's status line now offers to keep a song's playback files in your browser's own storage, so the song opens without downloading them again. It shows the size kept, with a remove link, and offers an update when a stem has been replaced. Your browser may clear the copy if you do not visit for a while; the song itself is always safe on the server.
- **Place from chart.** On the Sections tab, next to Detect, a button that reads the song's chart (your chord chart, or a notation file the AI check has read) and places each section where the chart lands in the recording, without AI. The first and last sections are marked approximate, as is any section where the chart stops matching what was played. The AI check now uses the same placement for the key and tempo changes it finds, when the chart fits the recording.
- **Your Shows on the dashboard.** A section lists your shows across your accounts, the next one first with a countdown, then the ones already played.

## [0.200.2] - 2026-10-30

### Added

- **Research in the footer.** The More row links to the stem-bench research page, the studies behind the audio features.

## [0.200.1] - 2026-10-30

### Fixed

- **A wrong tempo is no longer excused as a different count.** When the stems hear a tempo that is a count of your song's, such as half or double, the song says they agree. That excuse only applies now when your time signature supports it, so a genuine disagreement shows as one.
- **Fast waltzes.** A song in 3/4 whose bar the stems hear as one beat now reads "the stems agree with your 224 bpm (heard as 75, counted three to the bar)" instead of offering a replacement.
- **Clearer alternates on compound meters.** A 6/8 reading now shows its eighths counted three to the bar and its quarters, instead of a count that did not fit.

## [0.200.0] - 2026-10-29

### Added

- **Songs in 6/8 are heard as 6/8.** The stem detector now recognizes compound meter and reports the song at its dotted-quarter pulse, instead of a faster tempo in 4/4.
- **Tempo alternates.** When stems are scanned or uploaded, the detected tempo shows how else it could be counted, such as "112 bpm, or 224 counted in eighths".

### Changed

- **Same grid, different count, no mismatch.** When your song's tempo and the stems or the chart count the same beat at another level, such as 224 against 112, the song now says they agree instead of offering a replacement.
- **The AI check takes tempo and time signature from the chart.** Where your chart marks them, those are the values the check reports; the AI names the keys and places the changes. If your settings disagree with the chart, the check says the key changes are placed approximately.
- **Fewer false warnings on chart reads.** A chart in a sharp key whose chords carry no accidentals, or one that changes key, no longer triggers the lost-accidentals warning.

## [0.199.0] - 2026-10-28

### Added

- **Practice locations.** Practices now have their own saved locations, with a name, address and notes, picked from a list and reused. Manage them under Manage, Practice locations.
- **Upcoming on the dashboard.** The next shows and practices appear at the top of the Latest column with a countdown.
- **Calendar feed.** The Upcoming block's Calendar feed button copies a link you can subscribe to in your calendar app.
- **Day-before reminders.** A notification the day before each show or practice, with an email for those who opted in.

## [0.198.0] - 2026-10-28

### Changed

- **Session recordings** on the Sessions page show the linked song on its own line, and the tile no longer names who uploaded the take.

## [0.197.0] - 2026-10-28

### Added

- **Venues.** A venue is now its own entry: enter a place once and pick it for every show or practice there. Venues are shared across Stem Shovel, so if another band has already added a club, you find it instead of typing it again. Your notes about a venue and your contact there stay with your band. Venues live in the Manage menu, each with its address, map and website links and every show and practice there.
- **Filter by venue** on the Shows and Practices pages.

## [0.196.0] - 2026-10-28

### Added

- **Show posters.** Upload a poster (a PDF or an image) to a show or practice before the night. It becomes the event's picture on the Shows and Practices pages and on the event page, and its menu offers Open, Download for printing, Copy link, Replace and Remove. The link works for anyone you share it with.
- **Photos.** After the night, add photos to the event. Open one to step through them with the arrow keys, give each a caption, download it or delete it.

## [0.195.0] - 2026-10-28

### Changed

- **Adding a set list or a session to a show is one step.** Choose it in the dropdown and it is attached at once. The sections on a show's page are now called Set lists and Recordings.
- **The header fits a phone screen** again when every menu is showing.

### Fixed

- **Very long session recordings play again.** A whole show uploaded as one large file never got its playback version, waveform or MP3 download. Recordings of any allowed size now render; one that had failed will finish on its own within the hour.

## [0.194.0] - 2026-10-28

### Added

- **Shows and practices.** The band's calendar, under the new Manage menu. A show has its day and times, the venue with directions, a status, the set lists it plays in order, the sessions recorded that night, and notes. The Shows and Practices pages list what is coming up and what has been played.
- **The Manage menu** in the header: Shows, Practices and Set lists together.
- **Your own title on a set-list row.** A row tied to a song can carry its own title ("Interbellum (acoustic)"); clear it to use the song's again.

### Changed

- Set lists moved from the Music menu to the Manage menu.

## [0.193.0] - 2026-10-28

### Added

- **Paste a list** into a set list. Paste the set from your notes, one song per line; numbering is ignored, lines that match a song's title become that song's row, and the rest stay as text.
- **Your Set Lists** on the dashboard, newest first, with a pin button on each row.

### Changed

- The Set lists page shows each set list by its title alone.

## [0.192.0] - 2026-10-28

### Added

- **Set lists.** What you are going to play, in order, under Music → Set lists. Add songs from your catalog by typing a title, or lines of your own ("Break", "Encore"), write a note on each row for the night, and drag the rows into order.
- **Show view.** A set list the way a phone wants it on stage: big type, high contrast, one row per song, a tap opening the song's chart or lyrics in place. The screen stays awake. Make a viewing link on the set list and text it out; it opens the show view without signing in.
- **Recordings drag into order** on the Sessions page, with the grip at the left of each row, as songs do on a project page.
- **Songs in the Music menu**, beside Projects, Sessions and Set lists.

### Changed

- Long recording titles on the Sessions page now cut off with an ellipsis instead of wrapping; the full title shows on hover.

## [0.191.0] - 2026-10-27

### Fixed

- **Account tile counts** on the dashboard now match the project and song lists under them.

## [0.190.0] - 2026-10-27

### Added

- **Pin to your dashboard.** Every project, song and session row on the dashboard has a pin button; what you pin sits in a Pinned section at the top, newest first, until you unpin it. Pins are yours alone.
- **Since your last visit.** Activity, Your Projects, Your Songs and Your Sessions put a dot on what is newer than your last visit to the dashboard and say how many there are.

## [0.189.0] - 2026-10-27

### Added

- **Worth a look.** A dashboard block that points out unfinished songs nobody has touched in a month, songs with a chart but no recording yet, and your own ideas with no take yet, oldest first. It only appears when there is something to show.

## [0.188.0] - 2026-10-27

### Added

- **The band at a glance.** Each account tile on the dashboard says who has used Stem Shovel in the last two weeks ("Active in the last two weeks: Pat, Sam", "Everyone", "Just you" or "No one"), and an account owner's or admin's tile adds the invitations still open ("2 invitations pending · 1 invite link open"), linking to the account's settings.

## [0.187.0] - 2026-10-27

### Added

- **Activity on the dashboard.** Under Your Accounts: what happened in your accounts over the last seven days, newest first, with who did what: stems, demos and mixes added, session recordings added, charts, lyrics and notes edited, chat messages and comments posted, songs and projects created. Each line opens its song or session, with the same search, account filter and paging as the other sections.
- **In progress.** In the sidebar, under Conversations: anything the server has not finished across your accounts, with its state and since when: an upload not completed, a playback rendition pending or failed, a stem mix or notes transcription still rendering, a notation PDF not made yet. It appears only when there is something.

## [0.186.0] - 2026-10-27

### Fixed

- **No gap under Conversations.** On a wide screen the dashboard's Tools, Instruments and More widgets sat far below Conversations when the main column was tall; they now follow it directly.
- **Opening a chat reads its notifications.** Once you have seen a song's or a session's chat, its "New message in the chat" and mention notifications are read too, so the inbox and the dashboard's Latest no longer count a chat you have already caught up on.

## [0.185.0] - 2026-10-27

### Added

- **Conversations on the dashboard.** Under Latest: every song and session chat with messages you have not seen, across your accounts, newest first, each opening that chat; and the comments and mentions waiting for you, each opening where it was made. It reads "Nothing waiting." when you are caught up.
- **Plan usage on the account tiles.** Account owners and admins see how much of the account's storage is used, with a thin meter that turns red near the limit, and how many of its seats are taken.
- **Filter by account.** Your Projects, Your Songs and Your Sessions gain an account select beside the search when you belong to several accounts.

## [0.184.0] - 2026-10-27

### Changed

- **A lighter dashboard.** Each list loads your newest fifty of its kind, so the page stays quick as accounts grow; the All projects, All songs and All sessions pages hold the rest, and a capped list says "Showing 10 of the latest 50".

## [0.183.1] - 2026-10-27

### Changed

- **Latest first on a phone.** Your unread notifications come before the lists on narrow screens.
- **Days, not times.** Your Projects and Your Songs show the day something last changed.
- **Tile counts match the lists.** An account tile counts active projects and songs, so an archived project no longer makes the count exceed what the lists show.

## [0.183.0] - 2026-10-27

### Added

- **What is this?** Each dashboard section heading has an info button that explains the kind of thing it lists, for anyone new to it.

## [0.182.0] - 2026-10-27

### Changed

- **Your Songs says more.** Each song on the dashboard shows its stage (Writing, Arranging, Mixing or Finished) and how many stems and demos it has, after its project.
- **Go to account page.** Each account tile ends with a link to the account's page.

## [0.181.0] - 2026-10-27

### Added

- **Your Projects on the dashboard.** Above Your Songs: every project you may open across your accounts, last changed first, each with its song count, with the same search and paging and an "All projects" link to a new Projects page listing every project across your accounts, searchable and sortable.

### Changed

- **Account tiles at a glance.** The tiles share a row and show the account's name, your role in it and its counts of projects, songs, sessions and members, each a link; the recent-work lists moved to the Your Projects, Your Songs and Your Sessions sections. A new account's checklist still sits in its tile.
- **More room between the columns** on wide screens.

## [0.180.0] - 2026-10-27

### Added

- **Your Sessions on the dashboard.** Under Your Songs: every recording session across your accounts, latest day first, each with its kind, place and recording count, with a search, paging and an "All sessions" link; with none, a button to record one.
- **Songs and Sessions pages.** The Songs page lists every song you may open across your accounts with its project, account, stage and when it last changed; the Sessions page every session with its kind, place, day, recordings and account. Both have a search, a filter by stage or kind, and sortable columns.

### Changed

- **DAW project file converter** is what the Tools list now calls Convert.

## [0.179.0] - 2026-10-27

### Added

- **Your Songs on the dashboard.** Every song you may open across your accounts, last changed first, each under its project, with a search, ten at a time and an "All songs" link; the search matches the project too.
- **More in the sidebar.** The More list opens with Inbox, Account settings, Notifications and Links.
- **User Dashboard in the account menu.** The first item of the account menu goes to the dashboard.

### Changed

- **Dashboard headings.** The page is titled "User Dashboard"; "New for you" is now "Latest"; the section headings are restyled, with Your Multitrack Recordings ahead of Your Loops.

## [0.178.0] - 2026-10-27

### Changed

- **Your ideas, loops and multitrack recordings on the dashboard** list everything you have, newest first, ten at a time with Show more, a search by title, and an "All ideas", "All loops" or "All multitracks" link beside the heading.

## [0.177.0] - 2026-10-27

### Changed

- **The dashboard laid out again.** A tile per account comes first, listing its most recent projects, songs and sessions side by side; then Your ideas, Your loops and Your multitrack recordings, each with a Record button when empty; and a sidebar with what is new for you, Tools, Instruments and More (Docs, Feature Requests, Report a bug, Help, Share Stem Shovel, the blog).

## [0.176.0] - 2026-10-27

### Added

- **A dashboard where you land after signing in.** What is new for you (your unread notifications, with the newest few right there), quick actions, and for each of your accounts the latest session, the projects and songs touched last, and your own newest ideas. A new account shows a getting-started checklist; without an account you get a "Start your band" card and the free tools. The wordmark in the header goes to the dashboard when you are signed in.

## [0.175.1] - 2026-10-27

Maintenance release with no user-visible changes.

## [0.175.0] - 2026-10-27

### Added

- **Share a whole session.** A session's menu on the Sessions page has Share…: a viewing link opens the session on a page of its own, with every recording in order, the player, waveform, loop and EQ, each recording's downloads and all the MP3s in one zip. From there each recording's own page opens too. Links expire, cap their uses and can be revoked, as a recording's do; sessions stay members-only otherwise.

### Changed

- **The session's Chat button is labeled Chat**, like the buttons beside it.

## [0.174.0] - 2026-10-26

### Added

- **Auto EQ.** The Sessions player's EQ panel has an Auto button that sets the five bands from the recording's own measured sound against the curve of a typical well-mixed live recording, as a starting point. It runs only when you press it, and you can move any slider from there. A recording is measured shortly after its MP3 appears; older ones the next time the Sessions page is opened.

## [0.173.0] - 2026-10-26

### Added

- **Public session recordings.** Tick Public in Edit recording and anyone with the recording page's address can listen and download it, no sharing link needed. The recording row and its page show a Public tag. Recordings stay private unless you make them public.

## [0.172.0] - 2026-10-26

### Fixed

- **Long session recordings render again.** A long show's MP3 could stay at "rendering" for good. The leveling is now far cheaper, so a 90-minute set renders with room to spare. A set with sharp peaks is held a little quieter rather than squashed.

### Changed

- **The playback EQ keeps its headroom.** Boosting a band turns the rest down by as much, in the player and in Download with EQ, so a boost no longer distorts a leveled recording. Turn the volume up if it ends up quiet.
- **An output meter in the Sessions player**, beside the volume: the level after the EQ, with a mark at the recent peak and a light that turns red at full scale and stays red until you click it.
- **The Sessions player starts at 70% volume.**

## [0.171.0] - 2026-10-26

### Added

- **The playback EQ belongs to the session.** The Sessions player remembers your EQ for each session and brings it back when that session plays again; another session plays with its own EQ or none. **Save for everyone** stores it with the session for the whole band, **Reset** goes back to the band's EQ or flat, and **Remove shared EQ** clears the band's.
- **Five EQ bands with movable centers.** Low, low mid, mid, high mid and high, each with a gain and a center you slide to where the trouble is, for open-air show recordings.
- **Download with EQ.** The EQ panel saves the current recording as an MP3 with the EQ applied. The stored files stay as they are.
- **Session recordings are leveled.** A recording's MP3 now comes out at a consistent loudness with headroom left for a phone's speaker, and a recording that went into the red on the device is repaired first. The original file is kept as uploaded.

### Changed

- **The Sessions page's toolbar** sits in the title row at desktop widths, and **Add a recording** matches the Idea Recorder's New Idea button.

### Fixed

- **The Idea Recorder opens faster.** It is now kept warm like the other pages, and its page load gathers everything at once instead of one thing after another.

## [0.170.0] - 2026-10-26

### Changed

- **The Sessions page's player floats.** Nothing shows until a recording plays; the player then opens in a draggable panel (its place and size remembered on the device). Close it and it tucks into a Player button in the toolbar, lit while playing, which brings it back; on a phone the same panel docks at the top of the page while something plays. The filter row now starts with the search box, with the Practice / Show filters beside it.

## [0.169.0] - 2026-10-26

### Added

- **A playback EQ on the session player.** The EQ button opens a high-pass for stage rumble and low, mid and high bands to tame a boomy or harsh room recording while you listen. It changes only what you hear on this device and is remembered there; the files and downloads stay as they are.
- **Input device on session recordings.** Say what captured a recording from a fixed list (Soundboard, Field Recording Rig, Phone, Handheld Recorder, Other) beside the free-text field, now called "Input name". It shows by the title as "Phone · Kevin's phone" and goes into the download's name.
- **A toolbar on the Sessions page.** "Add a recording" opens the upload form in a panel, and "Record a session" sits beside it, so the page starts with your sessions.

## [0.168.2] - 2026-10-26

### Added

- **Live Session Recordings from the Projects page.** An account's Projects page links to its sessions in the upper right.

### Fixed

- **A session recording that was still "rendering" finishes.** A recording whose playback file was never made now gets it the next time the Sessions page is opened.

## [0.168.1] - 2026-10-26

### Fixed

- **A session recorded on a phone plays on both sides.** A phone's microphone is one channel, and on iPhones the Session Recorder (and the Idea Recorder's Sources mode) put it on the left channel only. Both now fill both channels, and a recording already made that way is mended the next time its playback file is made.

## [0.168.0] - 2026-10-25

### Fixed

- **Text-to-Beat and Text-to-Progression no longer hang.** A request that gets no answer gives up after a minute and says so.
- **A notification email is never sent twice.**
- **A converter or export that stalls now fails cleanly** with a message.

## [0.167.0] - 2026-10-25

### Changed

- **Built With** now lists everything the app is made with, including the pieces it had left out: the tools that keep recordings on disk in your browser, the decoders behind streamed stems, the MP3
  exports, and the checks that run on every change.

### Fixed

- **One failed file no longer holds up its batch.** When a stem, demo, mix or recording fails to render, the others in the same batch still get their playback versions, mixes and notes.

## [0.166.0] - 2026-10-25

### Fixed

- **The practice amp, the Studio and the converter can be found by search engines.** They had titles and descriptions written for search but were marked not to be indexed; they now join the other instrument pages.
- **The Releases page has a description** for search results and link previews.
- **Doc and blog pages show their title once.** The body's own opening title no longer repeats the page heading.

## [0.165.1] - 2026-10-25

Maintenance release with no user-visible changes.

## [0.165.0] - 2026-10-25

### Added

- **Mentions in the chat.** Type **@** and a name in a song's or a session's chat to mention one of the people on it. They are told in their inbox, and by email under the comments-and-chat setting, even when the rest of the conversation is folded for them, and the name is highlighted in the message.
- **Reactions in the chat.** Six emoji (👍 ❤️ 😂 🔥 🎸 👀) on any message, one tap each, with a count and who reacted. Nobody is notified of a reaction.
- **A chat feed on the project page.** A **Chat** button in the project's header opens every song's recent messages in one feed, each with its song's name linking to that song's chat, where replies happen. The button carries a dot while any song has unread messages.
- **Dawn's features, listed.** A page at /multitrack-recorder/features shows what the Studio has, feature by feature, beside the DAWproject format, Reaper and Sandyne, with room for more DAWs. It is linked from the Studio page.

## [0.164.0] - 2026-10-25

### Added

- **Short links for songs, projects and Studio songs.** A link button in a song page's and a project page's header, and **Copy link to this song** in the Studio's song menu, copy a short link to the page, the way the instruments' Copy link already did.
- **A Links page.** **Links** under your account menu lists every short link you have made, where it goes, how often and when last it was opened, with **Copy** and **Revoke** on each.
- **Custom addresses for short links.** Give a link a word of your choosing in place of the random code, such as `shvl.me/our-set-list`, for a link you will say aloud: three to thirty-two lowercase letters, digits and hyphens, first come first served. The old code stops working once a link has a custom address.

### Fixed

- **Page titles** on the settings, admin, docs, blog, invite and password pages were plain text; they now carry the same heading as every other page.

## [0.163.0] - 2026-10-25

### Changed

- **The Studio plays recordings from this device's copy without holding them in memory.** A recording your browser has a copy of plays from disk a quarter of a second at a time, so a long session no longer fills memory with decoded recordings. Only what a tool needs is decoded, such as a clip you reverse or stretch, and that is released again when the song grows large. The Studio's screen shows what is on disk beside what is in memory, and **Unload recordings from memory** in the song menu drops what is not needed there.

## [0.162.0] - 2026-10-25

### Added

- **The Studio keeps a copy of each recording on this device.** A song's recordings are cached in your browser's private storage once they have loaded, so reopening a song or bringing back an unloaded recording reads from this device instead of fetching it again, and a fresh take is safe on disk before its upload finishes. The cache keeps within a budget and drops what was used longest ago. **Clear the copies on this device** in the song menu shows what it holds and clears it, and deleting a song drops its copies. Private Browsing keeps no copies.

## [0.161.0] - 2026-10-24

### Added

- **Gain lines travel in DAWproject files too.** A clip's gain line goes out as the clip's own gain automation and comes back when a DAWproject is imported. A looped clip keeps its loop and the line replays each pass.

### Changed

- **Undo in the Studio holds its history as changes, not copies.** Each step of the hundred-deep history keeps only what the edit changed, so a long session with hundreds of clips undoes as before at a fraction of the memory.
- **The Studio starts a song's clips as they come due** rather than all at once at play, so a song with hundreds of clips starts and reschedules without a pause.

## [0.160.0] - 2026-10-24

### Added

- **Gain lines travel to Reaper.** A clip's gain line goes out in a Reaper project as the take's volume envelope and comes back when the project is imported, so a ride on a clip survives the round trip. A looped clip with a gain line goes out as one item per pass.

### Fixed

- **Section bands no longer cover the bar numbers.** While a song has sections, the ruler's bar numbers sit in their own row under the bands.

## [0.159.0] - 2026-10-24

### Added

- **Changes on a version.** In a document's History, **Changes** beside any earlier version of the chart, lyrics, notes or your own note shows what has changed since it, line by line: removed lines in red, added lines in green, with long unchanged stretches folded away.

### Changed

- **Studio recordings are stored as FLAC.** A take or bounce the Studio saves is converted to FLAC shortly after, the same sound at about half the size, so a song's recordings count about half as much toward your storage. Songs recorded before this convert the next time you open the Studio. Playback, exports and downloads are unchanged.

## [0.158.0] - 2026-10-24

### Added

- **Gain lines on clips** in the Studio. Press **Gain line** in the clip bar and a line appears over the selected clip: press the clip to add a point, drag points up or down and along the grid (hold Shift for free timing), nudge with the arrow keys, remove one with Delete or Alt-click, or **Clear line**. The line rides a phrase without touching the track's fader, and it plays, bounces and consolidates with the clip.
- **Range edits** in the Studio. Hold Alt (Option on a Mac) and drag along the ruler to select a stretch of time across every track. Delete clears what it covers, Shift+Delete cuts it out and closes the gap, and Insert (Shift+I on a Mac) makes room by moving everything after it later. A Range bar under the timeline does the same and can loop the range.
- **Sections on the ruler** in the Studio. **Add section** in the transport, or S on a marker, turns a marker into a section: a named band along the ruler to the next one. A Reaper export carries sections as regions. Press , and . to jump between markers.
- **The AI says when a chart read looks wrong.** A score whose key signature calls for sharps or flats while no chord shows one has usually lost its accidentals on the way to a PDF. The AI's answer now says so and waits for you instead of setting the song's key on its own.
- **What the AI read, for correction.** A PDF or image score's reading, one line per measure, is kept with the file. Open it from the score's ⋯ menu on the Chart tab's notation view, fix a key, a chord or a measure number and save; the AI checks the song against your text from then on. **Read again** starts the AI over.

## [0.157.0] - 2026-10-24

### Added

- **The chord chart is the AI's chart too.** Ask AI to check, and the AI read behind Scan stems and a new upload, now work on a song whose only chart is the one written in the Chart tab. The model reads the band's sections and chords beside the mix and places the keys from the chords each part moves through. A score still comes first when the song has one, and the tempo and time signature come from the chart only where it marks them, such as "120 bpm" or "3/4".
- **Takes travel with the files.** A clip's other takes go out in a Reaper project as the item's other takes and in a DAWproject as lanes inside the clip, and come back as the clip's takes when such a file is opened, with their audio. A Reaper project's other takes used to be left behind.

## [0.156.0] - 2026-10-24

### Changed

- **Ask AI to check reads the chart.** The check now needs the song's score (a MusicXML file, or a PDF or image marked as notation on the Attachments tab) and is disabled without one, with the reason in its tooltip. The model reads the chart while the mix plays and reports the keys and where each begins, plus the time signature and tempo marks the chart states. Where the chart marks neither, the song's detected tempo and time signature stay. An independent study found that, listening on its own, the model only read back what it was told, while with the chart it was exact.
- **No more automatic second listen on a close-call time signature.** It could only echo the detector's guess.
- **The AI cards no longer show a "% sure" figure.**

## [0.155.0] - 2026-10-24

### Added

- **Pre-fader sends.** Each send in a track's mixer strip has a small **post**/**pre** button. Pre-fader, the send ignores the fader and the inserts, so a reverb or a monitor mix can hold steady while the track rides.
- **A delay that follows the tempo.** The delay insert's new **Sync** picks a note value, from a sixteenth to a half note with triplets and dotted values, and its time then comes from the song's tempo, through tempo changes and ramps. Free gives the slider back.

### Fixed

- **A folder's own clips come along.** Opening a Reaper project whose folder track holds items, or a DAWproject whose group has clips of its own, used to drop them. They now land on a track named after the folder, in its color, inside the group.

## [0.154.0] - 2026-10-23

### Added

- **Mono tracks in Dawn.** A **Mono** switch on a track's mixer strip sums it to one channel and pans it as a single point: at full level on both sides at center, the far side fading as it turns, the way a mono stem plays in the stem player. An empty track follows its input when you arm it, so a bass on one channel of the line in records onto a mono track by itself. Stems with one channel come into Dawn as mono tracks, and a DAWproject carries the setting both ways.

## [0.153.0] - 2026-10-23

### Added

- **Groups on the Stage.** A group is a puck of its own on Dawn's Stage, a rounded square with a folder that sets the whole group's level and pan. Fold it from its strip, or press F, and its tracks hide behind it, the same fold as the timeline's.
- **Pucks that share a spot fan out.** Tracks at the same pan and level sit in a ring around the spot, each one easy to grab, the first named with a count of the rest.

### Changed

- **Shorter send lists in the mixer.** A track's strip shows a knob only for the sends in use, and **Add send** offers the other buses, groups left out. A new send starts at −6 dB.
- **Bigger songs in Dawn.** A song holds up to 64 tracks, 1000 clips and 32 buses and groups. Opening a song's stems in Dawn now says when stems were left behind instead of dropping them quietly.

## [0.152.0] - 2026-10-23

### Added

- **Groups (folder tracks).** A group is a row in Dawn's timeline that holds tracks and folds them away. **Add group** makes one, and a track joins from the **Group** entry of its menu. The row has a fold arrow, a name, a mute for everything under it and a sketch of the clips below, so a folded group still shows where its music is. A group is also a bus in the mixer, with its own fader, pan, inserts and automation. Any bus's strip there has a **Group** switch, and an **Output** that sends a bus into another, so groups nest. A stem of a group holds everything under it. Projects from Reaper, Live, Bitwig and Cubase keep their folders and groups, nested as they were, and go back out the same way. A song now holds sixteen buses and groups together, up from eight.
- **Clips that follow the tempo.** **Follow tempo** in the clip bar keeps a clip's place and length in beats when the song's tempo changes. A MIDI clip's notes and expression move with the grid, through ramps too, and an audio clip is stretched to fit with its pitch kept. New MIDI clips follow the tempo from the start, whether recorded, drawn, dropped as a MIDI file or brought in from a Live set, a Reaper project, a DAWproject or a MIDI file. A recording keeps its seconds unless you turn it on. One undo takes a tempo edit and the clips it moved back together.

## [0.151.0] - 2026-10-23

### Added

- **Time signatures over any note.** A meter is beats a bar over a beat note of 2, 4, 8 or 16: **Beat note** sits beside Beats per bar in the Timing menu, a meter change takes one too, and double-clicking a meter flag takes "6/8". The grid, snap, quantize, count-in, click and piano roll follow. Live sets, Reaper projects, DAWprojects and MIDI files carry the bottom number both ways.
- **Any color on a track or bus.** The tint row ends in an **Any color** swatch over the browser's color picker. A DAW's own track colors now come in as they were from a DAWproject, a Reaper project or a Live set.
- **Song details in the DAWproject.** An export from the browser puts the song's notes in as the comment. An export into a song's files adds the song page's performers, songwriter, producers, year and public address. An imported file's details land in the notes.

## [0.150.0] - 2026-10-23

### Added

- **Stretch a clip to the song in Dawn.** Type the tempo a recording was made at into **Clip tempo** in the clip bar and press **Fit to song**: the clip plays at the song's tempo, pitch kept, with no new recording made. Its label reads "×1.14" or so, and **Unwarp** puts it back. Hold Alt while dragging a clip's right edge to stretch it by hand.
- **Warp markers.** For a performance that drifts, Alt-click a clip to add a warp marker, then drag the marker so the hit under it lands on the grid line (hold Shift to place it freely). The audio either side stretches to follow. Arrow keys nudge a marker, Delete removes it.
- **Tempo ramps.** A tempo change can be reached gradually, a ritardando or an accelerando: tick **Ramp** in the Timing menu when adding one, or press **R** on a change's flag on the ruler. The grid, snap, click and quantize follow the tempo as it moves.
- **Stretches and ramps travel.** A DAWproject carries both ways. A Reaper project carries ramps and stretches both ways. A Live set's warped clips and tempo ramps come in as they were, instead of at the file's own speed.

## [0.149.0] - 2026-10-23

### Added

- **Expression lanes on MIDI clips in Dawn.** The piano's pedal, mod wheel, pitch bend and pressure are recorded with a part as lanes you can see and edit in the roll, and they play back through the piano. They travel with MIDI files, DAWproject files and Reaper projects.
- **More automation in Dawn.** Every track has a mute lane, and the buses and the master get lanes of their own in the timeline. Mute, send and master automation go out to DAWproject, Reaper and Live and come back in.

## [0.148.0] - 2026-10-22

### Added

- **Clip looping.** Select a clip and press **Loop** (Shift+L): what the clip shows becomes its loop, and dragging its right edge out past the end of the recording repeats it to fill the space, a faint line marking each pass and a ↻ beside its name. Split it, move it or export it and the repeats come along. Press Loop again to play it once more, trimmed back to the recording.
- **Switched-off clips.** **Off** (Shift+M) keeps a clip where it is, dimmed and silent, so a part can be tried without and brought back later.

### Changed

- Imported projects keep more of what you had: a muted or deactivated clip comes in switched off, and an Ableton Live set's looped clips arrive as looped clips.

## [0.147.0] - 2026-10-22

### Added

- **MIDI files in Convert.** Drop a MIDI file on the Convert page and it opens as a project of MIDI tracks (a track per track of the file, channel 10 as drums) with its tempo map, time signatures, key and markers, so a DAWproject or Reaper project made from it opens in your DAW with the tempo map intact. Controllers, pitch bend and program changes are counted under "Not carried across".

## [0.146.0] - 2026-10-22

### Added

- **Ableton Live sets in Convert and Dawn.** Drop a Live set (`.als`) with its samples beside it, on the Convert page or through Dawn's Import, and it opens with its tracks, levels, pans, mutes and colors, its groups and returns as buses with the routing and sends, the volume and pan automation, the arrangement's clips (looped clips laid out as they play, warped clips at their files' own speed), the MIDI clips' notes, the tempo and its changes, the time signature and its changes, and the locators as markers. Devices, session clips, and deactivated or transposed clips are listed under "Not carried across".

## [0.145.0] - 2026-10-22

### Added

- **Reaper projects in and out.** Drop a Reaper project (`.rpp`) on the Convert page with its media files beside it, or a zip of the project folder, and it opens with its tracks, levels, pans, mutes, solos and colors, folders as buses and receives as sends, the clips with their fades, the MIDI items' notes, the tempo map with its time signatures, and the markers. In the other direction, the Export panel on the Convert page and in Dawn has **A Reaper project**: an `.rpp` with its media in a folder beside it that Reaper opens as it is. Dawn's **Import audio, MIDI or a project…** opens a Reaper project as a new song too.

## [0.144.0] - 2026-10-22

### Added

- **Trim, and a cleaner DAWproject.** The DAWproject and the Sandyne project now come out with their audio as WAV at the bit depth you choose, and a **Trim** option writes one recording per clip holding only what the clip plays, so nothing a clip skips travels with it.

### Changed

- **"Normalized" beside "Not carried across".** When the Convert page or Dawn's import has to read a project into its own terms (a tempo with float noise, levels in decibels, colors outside the palette, a missing time signature, tempo ramps), it now lists what it changed, so you know what to check in the result.

## [0.143.1] - 2026-10-22

Maintenance release with no user-visible changes.

## [0.143.0] - 2026-10-21

### Added

- **Convert, a free DAW project converter.** Drop a DAWproject from Bitwig Studio, Cubase, Studio One or Nuendo on the new Convert page and get it back as a mix, a stem per track or bus, a clean DAWproject, a session bundle for Logic Pro, Pro Tools, Ableton Live, Audacity and Reaper, or a Sandyne project. It works in your browser, signed in or not, and nothing is uploaded.
- **A song's sample rate in Dawn.** The Timing menu sets the song's sample rate (44.1, 48, 88.2 or 96 kHz; 48 unless changed), and the mix, the stems and the project files come out at that rate on every computer. Importing a file at another rate says so; it plays in time either way, and the library shows the odd file's rate.
- **Stems show their sample rate.** A stem's menu shows the rate of the uploaded file, and the player marks a stem whose rate differs from the others', since a DAW session built from the downloads would hold one odd file. Stems play together in time whatever their rates, as before.

## [0.142.0] - 2026-10-21

### Added

- **A Sandyne project in Dawn's Export panel** for the free Sandyne DAW (Linux, Mac and Windows): the project file with the tracks, clips, fades, levels, pans and the MIDI parts' notes, and the recordings beside it. Sandyne opens it directly.

### Fixed

- **A bar of root and fifth is a power chord** in the detected chords: the matcher no longer names it a major or a sus chord, and no longer adds a seventh that does not sound.
- **The chart draft tries once more** when the model comes back with nothing.

## [0.141.0] - 2026-10-21

### Added

- **A session bundle in Dawn's Export panel** for the DAWs that read no project file (Logic Pro, Pro Tools, Ableton Live, Audacity, Reaper, GarageBand): every clip as a 24-bit Broadcast WAV stamped with its position, a stem per track, a MIDI file with the tempo map, time signatures, key signatures, markers and the MIDI tracks' notes, an Audacity label track and a README with each DAW's import path.
- **Open a DAWproject in Dawn.** Import a `.dawproject` from Bitwig, Studio One, Cubase or Nuendo as a new song: tracks, groups, levels, routing, sends, clips with fades, MIDI notes, automation, tempo and meter changes, markers. What cannot come across is named when the song opens.
- **Save a DAWproject to a song** from Dawn's Send block: the archive is kept in the song's attachments with a permanent link, and Open in Dawn brings it back.
- **A DAWproject carries the markers and the tempo and meter changes.**

## [0.140.1] - 2026-10-21

### Changed

- **The home page's Dawn demo needs no setup.** It plays the featured song's stems straight from the song.

## [0.140.0] - 2026-10-20

### Added

- **Dawn without an account.** The multitrack recorder now works signed out: record, arrange, mix and export as before. The song lives in your browser and comes back on your next visit. Sign in or create an account and the song kept there is offered into it, recordings and all.
- **MP3 export in Dawn.** Download mix (MP3) in the Song actions menu, or MP3 as the format in Export, at 192 kbps.
- **A Dawn demo on the home page**, after the Idea Recorder: play, mute, solo, drag and loop a real song in the real recorder.
- **Key in Dawn.** The Timing menu holds the song's key and adds key changes at the playhead, shown on the ruler beside the tempo and meter changes. Stems loaded from a song bring its tempo, time signature and key; New song with these tracks makes a fresh song with Dawn's.

### Fixed

- Dawn's Song actions menu ran off the bottom of a short window; it now scrolls.
- Opening a song's stems in Dawn could stop partway through the stems.

## [0.139.0] - 2026-10-20

### Added

- **Loop a part of a session recording.** Drag across the playing recording's waveform to select a stretch and press Loop (or L); it plays round until you press Loop again. Escape clears the selection, and with nothing selected Loop repeats the whole recording.
- **Loop a part of a take in the Idea Recorder**, the same way: drag across the take's waveform and turn looping on.
- **A low cut on the session recorder**, on at 80 Hz by default with 60, 120 or Off, to take the rumble out of a room recording. Your choice is remembered.
- **A song's stems into Dawn.** Choose Open stems in Dawn in a song's Downloads menu, or Load the song's stems in Dawn's Send to a song block. Each stem lands on a track of a new Dawn song named after the song, with the stems' levels, pans and tints and the song's tempo.
- **Stems from songs in the looper.** Import a stem, in the Load menu, lists the songs with stems in your accounts; a stem comes in as a layer, cut to the loop's length from the start you set.
- **An account switch on the Projects page**, beside the title, for anyone in more than one account.

### Changed

- The Music menu holds Projects, Sessions and Ideas; the account menu keeps to the account's own items.
- The footer mirrors the menus, with a Music row and the tools named in full: Lark Idea Recorder, Whirl Looper, Ember Practice Amp, Dawn Multitrack Studio.

### Fixed

- Long clips in Dawn came up blank, or blurry, on a Retina screen.
- Stems uploaded without a stored length or waveform drew nothing in the player and imported into Dawn as empty clips; they are measured now.

## [0.138.1] - 2026-10-20

### Changed

- An MP3 you upload as a demo or a session recording is kept as it is and played as it came, instead of being re-encoded.
- The Session Recorder is in the Tools menu, and the footer has a Music row with Projects, Sessions, Session Recorder and Ideas.

## [0.138.0] - 2026-10-19

### Added

- **Dawn grows into a full multitrack studio.** Automation lanes on every fader, pan, send and effect. Buses, sends and inserts (EQ, compressor, gate, delay, reverb, saturation) with a Mixer view. Export your mix, stems or buses as WAV at 24 or 16 bits, normalized to a loudness target, or as a DAWproject for another DAW. Crossfades, fade shapes, comping from take lanes, multi-select, ripple delete, reverse, normalize and consolidate, and markers. A tempo map with tempo and meter changes, swing and humanize for MIDI, tempo detection, and time stretch. A sampler that plays any recording across the keys, three synth presets, and a library panel you can drag onto the timeline. Share a song with the band, comment on moments, and compare revisions. Freeze a heavy track into one rendering and thaw it later.
- **Sessions get a review.** Every recording has a waveform, drawn on the server so a long practice costs your phone nothing. Leave comments at a spot on the waveform or about the recording in general; the same on a song's demos. Each session has its own chat. A search narrows sessions, recordings and comments as you type.
- **Record a session in the app.** One stereo recording of the room from the microphone or the line in, with a meter and a clock; hear it back, name it and save it straight into the sessions.
- **Share one recording.** Make a viewing link for a session recording and whoever opens it hears that recording on a page of its own.
- **Recordings know their source and their song.** Tag a recording with where it was captured, like "Room mic", and tie it to one of your songs; the song's page lists its session recordings.

### Changed

- The Projects link in the header is now a Music menu, with Projects, Sessions and Ideas.
- Session downloads are named after the recording's title.

### Fixed

- A WebM, CAF or AMR file uploaded as a session recording was refused as "not audio".

## [0.137.0] - 2026-10-18

### Added

- **Sessions.** The band's recordings are now grouped into sessions: one practice or one show, named by you ("Battle of the Bands") or called after its place and day. A show that runs past midnight stays one session. An upload is dated by the file's own clock and lands in that day's session, or the one you choose; move a recording between the sessions of its day from its Edit, or add a second session on the same day for an afternoon set and the evening show.
- **A player for sessions.** Play a whole session in order or any one recording, with previous and next, Space to play and pause, and Home to go back to the start. Every recording gets an MP3 for playing, and **Download MP3s** saves a session's MP3s in one zip, numbered in order.
- **A notification when a recording is added** to a session, for everyone else in the account, with the usual email options.

## [0.136.0] - 2026-10-18

### Added

- **Sessions: the band's practice and show recordings.** A new page for each account, under Projects in the account menu, where any member can upload recordings of practices and shows for everyone in the band to hear and download. Tag each as a practice or a show, give it a day and a place, and add notes; browse by day with Practice and Show filters, play right on the page, download the original, and edit or remove what you uploaded. Audio in any format a demo takes, up to 2 GB a file.

## [0.135.1] - 2026-10-17

### Fixed

- **The count-in leads straight into the song.** The click's "one" on the beat the stems enter was missing when a song streams, which sounded like a pause after the count. It plays now, and the count-in always lines up with the song's own bars.

### Changed

- **The readout counts the count-in down**: −1 | 4, −1 | 3, −1 | 2, −1 | 1, then the song's own bars.

## [0.135.0] - 2026-10-17

### Added

- **Loop a part of the song.** Click a section on the timeline row to select it: the stretch is highlighted across every row and the playhead goes to its start. The new Loop button (or the L key) plays that stretch round and round, or the whole song when nothing is selected. Click the selected section again, or press Escape, to clear it. To loop a stretch that is not a section, drag across any waveform from where it should start to where it should end.
- **A count-in for the click.** With the click on, Play counts in a bar before the stems start, so you can come in with the band. Choose one, two or four bars, or no count-in, beside the click's level.

## [0.134.0] - 2026-10-17

### Added

- **A click in the stem player.** When a song has a tempo and a time signature, a metronome button sits beside the readout. Press it and a click plays in time with the stems, the first beat of each bar higher, following the song's tempo and meter changes and every seek. A small knob sets its level. It is not part of your mix or any download, and it is off each time you open a song.

## [0.133.0] - 2026-10-16

### Added

- **The Stage: a visual mixer.** The stem player and Dawn both have a Tracks / Stage switch. On the Stage every track is a numbered puck in its color: left to right is its pan, height is how loud it sounds in the mix. Drag a puck to set level and pan at once, hold Shift to move along one axis, double-click to center the pan. Pucks glow with their loudness while the song plays, a bar under the stage shows which way the mix leans, and the strip below holds the selected track's mute, solo, menu and readouts. The arrow keys nudge a puck, M and S mute and solo it. It is the same mix as the rows; switch back any time.
- **Undo for mix moves.** On a song page, ⌘Z (Ctrl+Z on Windows) takes back the last fader, pan, mute, solo or master change, a whole drag or knob turn at a time, and ⌘⇧Z puts it back; the Stage has buttons for both. In Dawn, mix moves and effect changes now join Undo and Redo alongside clip edits.

## [0.132.1] - 2026-10-16

### Fixed

- **The stem menu on the home page demo opens on top.** It used to slip under the row below it.

## [0.132.0] - 2026-10-16

### Added

- **Names for the tools.** The multitrack recorder is **Dawn**, the idea recorder is **Lark**, the practice amp is **Ember**, the looper is **Whirl** and the chord player is **Palette**. Each page's heading pairs the name with what it does (Dawn Multitrack Recorder, Lark Idea Recorder, and so on), the footer lists them by name, and the Tools and Instruments menus keep the plain words.

### Changed

- **The multitrack recorder lives at /multitrack-recorder and the idea recorder at /idea-recorder.** The old addresses, /studio and /ideas/recorder, still work and send you to the new ones, links with a song attached included.
- **The chord player's "Chord Palette" dropdown is now "Color"**, so the name of the instrument and its chord-voicing choice no longer collide.
- **American spelling throughout.** Color, center, gray, normalize and the rest read the same way everywhere in the app and the guides.

### Fixed

- **The practice amp's Guitar / Bass switch keeps its label when you hover over it.** The selected side's text used to vanish under the pointer.

## [0.131.0] - 2026-10-16

### Changed

- **The Studio's tracks catch up with the stem player.** Each track's level is a knob beside its pan knob, a level meter with a peak-hold mark and a clip light that stays lit until you click it sits under them, and the master has the same meter in the footer. A track's ⋯ menu offers a tint: eight soft colours for its name and its clips, so parts tell apart at a glance.

### Fixed

- **A stem row's ⋯ menu is no longer hidden by the row below it.**

## [0.130.0] - 2026-10-16

### Added

- **Stem tints.** Editors can give a stem's row one of eight soft colours from its ⋯ menu, or none. The name and the waveform take the colour, and everyone who opens the song sees the same rows, so a band can tell its guitars from its keys at a glance.

## [0.129.0] - 2026-10-16

### Added

- **Level meters on every stem and on the master.** Each stem's meter shows what it puts into the mix after its level and pan, with a thin mark that holds the recent peak. The small square at the end lights red when the level reaches full scale and stays lit until you click it, so a clip you missed is still there to see. The master has the same beside its fader.

### Changed

- **The stem level is a knob** beside the pan knob, showing dB while it turns; double-click for unity. The meter sits on the same line.

## [0.128.0] - 2026-10-14

### Added

- **A pan knob on every stem**, beside the fader. Drag it to place the stem left or right, double-click for centre. The pan is part of your own mix, of a custom mix download, and of the default mix a member saves for everyone.

### Changed

- **Stem rows have a new look.** Mute, solo and the ⋯ menu match the Studio's track buttons, the fader is the same slider the Studio uses (double-click returns it to unity), rows are numbered, and a long name truncates with the full name in its tooltip.
- **The section timeline and the Comments row line up with the stems** at every width.
- **Download Stems says what it is doing.** A notice names each stem as it goes into the zip, then says the browser is saving it.

## [0.127.0] - 2026-10-12

### Added

- **Songs of any size play.** A song too big for the device's memory now streams: only a few seconds around the playhead are decoded at a time, so thirty stems play on a phone. It works in Chrome, Edge, Firefox on a computer and Safari 26; older browsers keep the previous player. The line under the stems says which way a song is playing, and a link there switches it for your browser.
- **Uploads retry on their own.** A stem the network drops is sent again, and a batch that still has failures shows a Retry failed button that sends them to the same stems with one press.

### Fixed

- **Stem rows on a phone line up.** A long stem name no longer widens its row, so the playheads sit in one line.

## [0.126.0] - 2026-10-12

### Added

- **No more limit of 32 stems a song.** What limits a song is the listener's device, since every stem is decoded into memory to play. The uploader now tells you when a song passes about a gigabyte decoded, and the player shows a note when a song may be more than the device can hold. If a page goes blank or reloads while a big song loads, that was the browser running out of memory, and the player says so the next time.

### Changed

- **The AI reads a chart PDF or image properly.** A notation PDF or image is now read into a measure-by-measure summary, key signatures included, before the AI listens to the mix, so the chart's keys decide the keys. The first run on a chart takes a little longer; later runs reuse it.
- **AI key changes, tempo shifts and sections land on the bar line.** A change heard just before a bar now snaps to that bar, and key changes and section starts within a bar of each other line up.

### Fixed

- **A change on a downbeat** no longer shows as the last beat of the bar before on the timeline.

## [0.125.0] - 2026-10-12

### Added

- **The AI reads your song's score.** When a song has a MusicXML file, or a PDF or image marked as notation, Ask AI to check sends it along with the mix. The chart's key signatures and chord symbols decide the keys, and the recording places each key change in time. Scan stems goes straight to the AI on such a song.
- **Key changes with times.** The AI names every key change it hears, with or without a score, and Use these writes them as key rows.
- **Detect sections.** A Detect button on the Sections panel asks the AI where each section begins and names them the way your other songs do. With a score attached, the chart's rehearsal marks and section words lead.

### Changed

- **The timeline's key lane is the list of keys.** The "key:" summary line under the section name is gone; the word "keys:" labels the lane. Click any key, tempo or time-signature marker to jump the playhead there.

## [0.124.0] - 2026-10-12

### Added

- **The Practice Amp's pedals are voiced for the instrument.** On a bass head the fuzz and overdrive keep the lows clean and mix them back under the dirt, their Tone sliders cover a lower range, the wah sweeps lower, and the chorus and reverb leave the bottom dry. The board says "Voiced for bass" at its foot. Switch to a guitar head and the same pedals voice themselves for a guitar; your settings stay as they were.
- **A Mids slider on the fuzz**: flat in the middle, the scooped sound below it, a lift above.
- **A reverb pedal** with Level and Size at the end of the pedal board, so the bass heads, the Tweed and the Solid State have a reverb. The Blackface keeps its spring as well.

### Changed

- **A fresh rig's compressor on a bass** starts with a slower attack and a firmer ratio, so the pluck gets through. Saved rigs keep their own settings.

### Fixed

- **The Gain and Master knobs** now stay clean through their lower half, with the crunch in the top half. The Fridge no longer distorts a bass at its default Gain with nothing engaged.

## [0.123.1] - 2026-10-12

### Changed

- **The Practice Amp's knob panel** keeps a minimum height, and the presets take the row's width on a wide screen.
- **The Idea Recorder and Studio page copy** read shorter, the Studio's Quick Tips with the MIDI track, effects, shortcuts and Save revision folded in.

## [0.123.0] - 2026-10-12

### Added

- **Practice Amp.** Plug a guitar or bass into your computer or phone, directly or through an audio interface, and play through an amp in your headphones or speakers. Four heads: Blackface Clean (with spring reverb and tremolo), Tweed Crunch, Fridge and Solid State. Captured cabinets on the guitar heads. A pedal board: noise gate, compressor, overdrive, fuzz, wah, chorus, phaser or flanger, delay and rotary speaker. Six preset buttons per instrument, with share links. The tuner, metronome and drum machine open beside it. Find it under Tools.
- **Try the amp with nothing plugged in.** Choose Chord player as the input: the chord player's Electric Guitar (direct), a new sampled instrument, or its Electric Bass plays through the amp dry.
- **The amp in the band.** Amp is a source on the Looper and the Idea Recorder, an input in the Studio, and a panel on the song page for playing along with the stems, with a count-in.
- **Several keys in a song.** Scan stems and the upload-time detection read the key per section and write a key change where each begins; the song's key reads "C major (also A♭ major, F major)", and the timeline lists every key with the current one bright. Edit the key rows in settings to override.

### Changed

- The song page's Downloads menu names the stem mixes as "Original Stem Mix" and "Custom Stem Mix".
- The Mixes view opens with "Latest Mixes".
- On a phone the header's menus show as icons.

### Fixed

- A loud MP3 can be uploaded as a stem or mix again.
- Share links for files open correctly.

## [0.122.0] - 2026-10-10

### Changed

- **Latest Mixes.** The song page's Mixes view now opens with a "Latest Mixes" heading and an info tip explaining what mixes are for.

## [0.121.0] - 2026-10-10

### Changed

- **Comments have a panel of their own.** Open it from the Comments row under the stems or the comments button in the song's header; the Docs panel keeps to Lyrics, Chart and Notes. A comment notification opens it.
- **The song page's header** now holds the buttons for the Player, Docs, Comments, Chat and Attachments panels, lit while a panel is open.
- **The mix page's header** carries the mix's buttons, comment, download, share, upload and delete, and the name can be renamed right there. The tip banner is gone.
- **Chat and comments have their own icons**: a speech bubble for chat, clapping hands for comments.
- **The Chart tab's notation view** says "No notation yet." with the how-to in a tip.

## [0.120.0] - 2026-10-10

### Added

- **Every song has a stage.** Writing, Arranging, Mixing or Finished, read from what the song holds (a stem makes it Arranging, a mix makes it Mixing) or set by a member in the song's settings under Options, where it replaces the finished toggle. The stage shows beside the song's title, decides which view the song page opens on, and files the project page into Finished Songs, Mixing, Arranging and Song Ideas, each with a line saying what that phase is for.

### Changed

- **The mix page** no longer shows the tip banner.
- **The account menu** keeps to your account; the Idea Recorder, Looper and Studio are in the Tools menu.

## [0.119.0] - 2026-10-10

### Added

- **A page for every mix.** Each mix now opens on its own page, made for listening and feedback: the version and name, the player and waveform, the notes from the mix, its comments with Comment here, download, share, and the other versions to switch between. Share emails, viewing links and notifications about a mix open that page. The song page's Mixes view lists the mixes and uploads the next one.

### Fixed

- **A viewing link made while sharing a mix** now opens the mix rather than the song.

## [0.118.0] - 2026-10-10

### Added

- **A chat on every song.** The speech-bubble button beside Share opens a chat panel for the people on the project: Enter sends, web addresses become links, and a time like 1:23 becomes a button that jumps the player there. A "New" line marks where you left off, the button shows a dot while there is something unread, and the project page's tiles count messages and badge the unread ones. A new message reaches the project's inbox and, with the comments email setting on, your email.
- **Mixes.** The player on a song page has a third view beside Stems and Demos for the bounces an engineer or producer sends for feedback. Each upload is numbered (v1, v2, v3); the newest opens with a transport, its waveform, the engineer's notes and its own comments, kept apart from the song's. Comment at a spot with ⌘-click on the waveform; rename in place; download the file or its MP3; share by email with a link that opens the song on that mix. On the project page a song plays its newest mix, labelled, and its tile counts the mixes.

### Changed

- **Attachments are a panel of their own**, opened by the paperclip button beside Chat, so the Docs panel keeps to the chart, lyrics, notes and comments.
- **The song page's header** drops the Idea Recorder button; the Instruments and Tools menus have it.
- **A song with a mix but no stems** counts as a Song in Progress on the project page.

### Fixed

- **A PDF opened from the Chart tab's notation view** now fills its panel instead of stopping halfway over a white box.
- **The Studio's playhead** no longer rides over the track headers when the timeline is scrolled sideways.
- **The Chord Player keeps its sustain latch** when you switch tabs and come back.

## [0.117.1] - 2026-10-09

### Fixed

- **The Chord Player keeps its sustain latch when you switch tabs.** Coming back from another tab or app used to find the pedal up; the latch now stays until you release it.

## [0.117.0] - 2026-10-08

### Added

- **Knob and slider controls in the Studio.** Each track's pan is a small knob and its level a fader; drag, scroll or use the arrow keys, and the value shows in a bubble while you adjust it. Hold Shift for fine adjustments, and double-click to return to centre or unity.

### Changed

- **Tidier track headers in the Studio.** The track name has the full width with its menu at the right; the input picker sits on its own row; and arm, mute, solo and the playback effects button lead the fader row, with the pan knob at the end.
- **The Songs panel is now the Recordings panel**, so it is not confused with the songs in your projects. Same list, same menus.
- **The Built With page** now lists everything the app is made of today.

### Fixed

- **The Studio's playhead no longer shows over the track headers** when the timeline is scrolled sideways.

## [0.116.0] - 2026-10-08

### Added

- **A piano-roll editor for MIDI clips in the Studio.** Edit notes on a selected MIDI clip, or double-click the clip, to open its notes on a grid of pitches against the beat. Click an empty spot to add a note, drag a note to move it or its right edge to change its length, Shift-click to select more, nudge with the arrow keys (Shift jumps an octave), set the velocity of what is selected, and press Delete to remove. Every change can be undone. A keyboard down the left sounds each row through the track's instrument.

### Fixed

- **Trimming a clip no longer squeezes its waveform.** While you drag an edge, the drawing stays where it was and the trim reveals or hides it, so it is clear you are cutting, not changing speed.

## [0.115.0] - 2026-10-08

### Added

- **MIDI tracks in the Studio.** Add MIDI track makes a track of notes played and recorded by the piano, the chord player or the drum machine. Arm it, record, and play the panel, your computer keyboard, a MIDI keyboard or the pads: the notes land as a clip drawn as a small piano roll and play back through the same instrument. MIDI clips move, trim, split and take lanes like audio clips. Select one for Quantize, Transpose, a velocity slider and Export MIDI; Import now takes .mid files too.
- **Render to audio track** in a MIDI track's menu plays its notes through the instrument into a new audio track, so the song can bounce. Download mix, Add as demo and Add tracks as stems do this for you first.

### Changed

- **The digest email carries only what you have not read.** Items you already read in the inbox stay out of the daily or weekly digest.

### Fixed

- **Download mix in the Studio works again.**

## [0.114.0] - 2026-10-08

### Fixed

- **A take that was interrupted mid-upload no longer saves twice.** When a take with separate sources failed part way through and you reloaded, the Idea Recorder uploaded the mix again. It now carries on from where it stopped.
- **Start New Idea in the recorder's menu is greyed out when there is nothing to leave**, as intended.
- **Links in notes, charts and lyrics are stricter.** A link written to look like a local path but pointing at another site is removed, and only task-list checkboxes survive from pasted HTML. Footnotes read better with screen readers.
- **Uploads refuse malformed requests clearly** instead of failing with a server error, and replacing a stem counts against your storage the same way adding one does.

## [0.113.1] - 2026-10-08

### Changed

- **Under the hood.** The site runs on the newest version of its web framework. Nothing changes in how it works.

## [0.113.0] - 2026-10-07

### Changed

- **The Idea Recorder records one stereo take.** Any mix of the microphone, a line in, the computer, the piano, the chord player and the drums still goes into a take, as one file, the way a handheld memo recorder works: quick to capture, nothing to arrange. The Stereo/Multitrack choice above the meter is gone. To record parts as separate files, on tracks of their own, use the Studio, the full multitrack recorder.
- **Loops saved from the looper still arrive in the Idea Recorder with their layers**, so their Tracks panel and "Add N stems to song…" work as before, as do takes recorded earlier with separate files.

### Fixed

- **Page copy and user docs edited in the app stay as you wrote them.** A refresh of the starting text no longer replaces a page that has been edited on the site.

## [0.112.0] - 2026-10-07

### Added

- **Instruments on Studio tracks.** A track's input can be the piano, the chord player or the drum machine. Their panels open from the toolbar and play straight into the song; what you play on them lands on the take exactly as you heard it. A track armed to the drum machine plays the beat along with the song from the start, at the song's tempo, and recording keeps it. The beat, the piano's preset and the chord player's settings are saved with the song and come back when you open it.
- **Effects on every Studio track.** The sliders button in a track's header opens a compressor, a tone stage (tilt, air, bottom) and a reverb send. They play as you work, are saved with the song, and are baked into a bounced mix, a demo and the stems you send to a song.

## [0.111.3] - 2026-10-07

### Fixed

- **Open items come first** in the bug report, support request and feature request lists, then completed, then closed.
- **Inviting someone to view a project** now checks the project is the account's.

## [0.111.2] - 2026-10-07

### Fixed

- **Uploads are held to the size they were reserved for**, so the account's storage figure stays honest.
- **A sign-in that has expired now says so everywhere**, including while uploading stems and demos, where it used to say "Not found".
- **Reordering stems with the arrow keys** keeps going: press again and the stem moves again, with no need to click back on the grip.
- **A panel whose remembered position was unreadable** now opens in its usual place instead of the corner.

## [0.111.1] - 2026-10-07

### Fixed

- **A sign-in that has expired says so.** Saving or acting after your session ended used to answer "Not found"; it now says your session has ended and to sign in again, and nothing on the page is lost.
- **Comments follow the song.** Editing, deleting or restoring a comment needs current access to the song, not just having written it.
- **Members with a viewer role** see the beat, chord-style, piano-preset, progression and drum-kit libraries, while creating a project and revoking a share link need an editor, as every other change does.

## [0.111.0] - 2026-10-07

### Added

- **Editing in the Studio.** Drag either end of a clip to trim it, press S to split it at the playhead, ⌘D to duplicate it, and ⌘Z to undo. The grid snaps to the beat; hold Shift to drag freely.
- **A bar under the timeline for the selected clip**: its name, gain, and fade in and out, drawn as wedges on the clip.
- **Import audio** onto a track at the playhead, from the button under the timeline.
- **Punch**: with Loop on, a take keeps only the loop region, however long you record.
- **Take lanes.** Record over a part again and the earlier take is kept behind the new one; with Loop on, every pass is a take. Arrows under the timeline step through them.
- A take saves the song at once, and leaving the page with an unsaved edit asks first.

## [0.110.1] - 2026-10-07

### Fixed

- **A tool page's intro renders its markdown**, so a link typed into a tool's copy shows as a link.

## [0.110.0] - 2026-10-06

### Added

- **The Studio, a multitrack recorder.** Find it under Tools. Add tracks, arm one or more, choose an input (the microphone, a line in or the computer, in stereo or one channel), and press Record: after a bar of count-in the take lands on the track while the rest of the song plays, drawing its waveform as it goes. Each track has a fader, pan, mute, solo and a meter. Clips drag along a track or onto another, snapped to the beat when the grid is on; Delete removes one, and Undo and Redo step through every edit. The ruler shows bars at the song's tempo, with a loop region you can drag. The song saves itself as you work; **Save revision** keeps a named snapshot, and the Songs panel restores any of them. Every song has a note board. The song's menu downloads the mix as a WAV, adds it to a song as a demo, or adds each track to a song as a stem.

### Fixed

- **An input chosen in an earlier session no longer blocks recording** when it has gone or the browser has renamed it: the Studio, the looper and the Idea Recorder fall back to the default microphone.

## [0.109.3] - 2026-10-06

### Fixed

- **The Attachments tab** on the song page now stands as tall as the other Docs tabs.

## [0.109.2] - 2026-10-06

### Fixed

- **Documentation downloads say what they are doing.** Download All Charts, Download All Song Documentation and a song's Documentation (PDF) now show "Preparing…" while the file is built, hand it to the browser when it arrives, and report a failure as a message rather than an error page.
- **Piano settings menu.** The Share note wraps, and the Scale Guides controls look like the rest of the menu at every size.

### Added

- **Share on the piano.** A Share button in the More row (a Share section of the settings menu on a phone) copies a short link to the sound as it stands.
- **Short attachment links.** Copy link on an attachment or score copies its short link on shvl.me.

## [0.109.1] - 2026-10-06

### Changed

- **The chord player starts from the first preset.** On a first visit, with nothing of the chord player saved in the browser yet, preset 1 loads. A browser that already has its own settings keeps them.

### Fixed

- **Older presets unlock the sustain.** A preset saved before the sustain lock was kept with presets now lifts the pedal when applied, instead of leaving a locked pedal down.

## [0.109.0] - 2026-10-06

### Added

- **Short share links.** Copy link on the chord player, the drum machine and the piano now copies a short link on shvl.me that opens the full address, so a set-up pastes cleanly into a message. Anyone can make one; links made while signed out expire after ninety days, links made signed in do not.

### Changed

- **Chord player presets keep the sustain lock.** A preset now remembers whether the sustain pedal was locked down, alongside the strum latch and the arpeggiator latch it already kept, and applying one puts the pedal down or lifts it.

## [0.108.1] - 2026-10-06

### Fixed

- **The song page's keyboard tips** under the comments row now read in light text.

### Changed

- **Project page polish.** The line under each section heading keeps to a readable width, Song Ideas says to click a song's name to open it, and a divider separates the download buttons from the attachment tiles.

## [0.108.0] - 2026-10-06

### Added

- **Attachments & Downloads on the project page.** A new section below Song Ideas gathers every chart, score, audio scrap and document attached to any song, plus files that belong to the project itself: upload them there and attach one to a song later from its menu. Download All Charts gives you every score and chart as one zip, and Download All Song Documentation a PDF per song with its lyrics, chart and notes, zipped.
- **Song Documentation (PDF).** A song's Downloads menu has its lyrics, chart and notes as one PDF, with its notation after them: every score and every PDF or image marked as notation.
- **Version history.** History in the Docs panel's ⋯ menu lists the ten most recent versions of the chart text, lyrics, notes or your own note, each viewable and restorable. An edited comment's "edited" badge opens its earlier versions for its author or an admin to restore.
- **Remove a demo.** Each demo's menu in the player's Demos view now has Remove demo for editors.
- **Player tips.** A line under the comments row says how to play and pause, jump, and leave a comment.
- **Project tiles.** A song idea's tile plays its demo, every tile shows an arrow saying it opens the song, and the meta line counts the song's charts, notes and demos.

### Changed

- **The Attachments tab is a paperclip** with its count, in place of the word.

## [0.107.0] - 2026-10-06

### Added

- **Notation on the song page.** The Chart tab now has a Text / Notation switch. Notation holds scores exported as MusicXML from Dorico, MuseScore, Sibelius or Finale (a compressed .mxl or a plain .musicxml): each is a tile with its first page, and clicking it engraves the whole score in a panel you can drag and resize, laid out for the panel's width. Every score also gets a PDF rendered for it, ready to download from the tile's menu or the viewer's header. A PDF or image of a score belongs here too: upload one from the notation view, or mark one on the Attachments tab as Notation.
- **An Attachments tab.** The PDFs tab became Attachments and takes files of every kind: charts and lead sheets as PDFs, photos of a handwritten chart, scraps of audio for discussion, text and MIDI files, with the scores listed alongside so everything is in one place. Audio plays right on its tile, images show as themselves, and an audio scrap can become one of the song's demos with Use as demo. Every file keeps a permanent link, and the share menu copies a mention: `@` followed by a file's title in any note, chart or lyrics becomes a link to the file.
- **Your own notes.** Signed in, the Notes tab has a Project / Mine switch. Mine is a private notepad for the song that nobody else sees, edited and saved the same way as the shared notes.

### Changed

- **Counts on the tabs.** The Chart tab shows how many scores and files it holds (or 1 when there is chart text alone), the Comments tab its count, and the Attachments tab the number of files.

## [0.106.0] - 2026-10-06

### Changed

- **The song page's player in a panel of its own.** The stems or demos, with their tabs, now sit in a panel like the Docs panel: on a wide screen the arrows in its header pop it out into a floating panel you can drag and resize, or put it back, and the Player button in the row below minimises it and brings it back as it was. The music keeps playing while the player is minimised, and the button lights to say so.
- **Lyrics first.** The Docs panel's tabs now read Lyrics, Chart, Notes, Comments, PDFs, and the panel opens on the lyrics.
- **Rich Text or Markdown at a glance.** While you edit a chart, lyrics or notes, the switch between the two views sits at the top right of the Docs panel instead of inside its menu.

## [0.105.1] - 2026-10-06

### Changed

- **The Demos playlist plays the song ideas' demos.** On a project page the Demos tab now plays the recordings of songs that have no stems yet, matching the Song Ideas section below; tick **All demos** to hear every song's. The choice is remembered.
- **The PDFs tab shows its count.** The song page's Docs panel reads "PDFs (2)", as the Stems and Demos tabs do.

## [0.105.0] - 2026-10-06

### Added

- **A PDF opens in its own panel.** Click a PDF's page on the song page and it opens in a panel you can drag by its header and resize by its corner, with Download right there in the header beside Open in a new tab and Copy link. Downloads keep the file's original name.
- **A Demos tab on the project playlist.** The player at the top of a project page now has two tabs: the songs' stem mixes, and their demo recordings. It opens on the demos when no song has a mix yet.

### Changed

- **The song page's Docs panel.** Chart, Lyrics, Notes, Comments and now PDFs live on one panel with its tabs in the header. On a wide screen you can pop it out into a floating panel, or minimise it to the Docs button under the player and bring it back as it was. The PDFs tab shows smaller tiles, each with a ⋯ menu (Open, Download, Open in a new tab, Edit, Remove) and a share button that copies the permanent link or starts an email with it; Upload PDFs sits at the foot of the tab and in the panel's ⋯ menu.

## [0.104.0] - 2026-10-06

### Added

- **Program drum steps from the computer keyboard.** On the drum machine, press any arrow key and a window of eight steps appears on the first row, outlined in blue with a digit in each cell. The up and down arrows move it between rows, left and right move it eight steps along, and the keys 1 to 8 switch its steps on and off. Shift with a digit steps a sounding cell through normal, accent and ghost, Esc puts the window away, and clicking a cell brings the window to it. A line at the foot of the device lists the keys on wider screens.

## [0.103.0] - 2026-10-06

### Changed

- **The Effects menu opens like a set of drawers.** On the piano and the chord player, each effect now has its own drawer, one open at a time, so the menu is short again. A drawer's header lights up when its effect is on and shows how much: a percentage, "off", the rotary's speed, or "flat" versus "shaped" for Tone. Bounce now sits beside Rotary.

## [0.102.0] - 2026-10-06

### Added

- **Lock the sustain from the keyboard.** On the chord player, press the space bar twice quickly and the sustain pedal stays down, as a double tap on the sustain pad does. Press it twice again, or Esc, to lift it.

### Changed

- **The chord player's menus share one look.** The Strum, Timing, UI and Chord Palette menus now lay out like the Arpeggiator menu: two columns of dropdowns with a small i beside each setting that explains it, the switches gathered below a divider. The strum's rate is greyed out while its pattern is Once, and the Timing menu counts the beat while the click runs.
- **Style is now Chord Palette.** The dropdown that chooses what each wedge carries (Plain, Blues, Jazz, Folk and the rest) is called Chord Palette, and palettes of your own are made with New palette. Saved presets, progressions and share links work as before.

## [0.101.0] - 2026-10-06

### Added

- **PDFs on song pages.** Editors can attach one or more PDFs to a song, charts and notation for instance, each with an optional title and description. Every PDF shows its first page as a thumbnail with its page count and size, and has a download button and a permanent share link that keeps working after renames.

### Changed

- **The piano's layout.** The controls row now fits the width it has, from a phone to a full desktop row, and the settings menu groups its sections (Metronome and Volume on narrow screens, Arpeggiator and Effects below the wide, Fidelity, MIDI, Scale Guides) into tidy two-column blocks. A keyboard-shortcuts hint sits at the foot of the piano on wide screens.
- **Arpeggiator menu wording.** The options read Key Plays Chord, Align with Bars and Changes on Beat, and the MIDI button reads Enable MIDI Control.

## [0.100.0] - 2026-10-05

### Added

- **An arpeggiator on the piano**, the chord player's brought over: Arp beside the octave buttons makes held keys play one at a time in time with the session tempo, up, down, up and down, as played or at random, through one to three octaves, at quarter, eighth, triplet or sixteenth notes, with the session swing, patterns lined up with bars and new chords landing on the beat. A chord built up a key at a time joins the pattern as it grows. Double-click the Arp button to latch the pattern; a single key held alone plays as a chord, the triad on its degree of the key (D alone in C major arpeggiates D minor). The settings save with presets, and a phone has an Arpeggiator section in its menu.
- **A staff on the piano's screen**: the notes you are holding appear on a small treble staff beside the chord name, spelled in flats in a flat key and sharps otherwise, with the arpeggiator's note lit as it plays.

### Changed

- **The piano's guides are switches, and the key starts at C major.** Choosing a key no longer marks the keyboard by itself: Dots marks the keys in the key and 1–7 numbers them, each its own button in the Key menu, and Turn Off All Guides clears both. The Scale choice is always in view, and the Arpeggiator menu carries the same key and scale choice. The chord name follows the key's spelling, so a B♭ chord reads B♭ rather than A♯.

## [0.99.1] - 2026-10-04

### Fixed

- **A chord tapped near the bar line with the arpeggiator latched** now takes over at the change point and the readout names it.

## [0.99.0] - 2026-10-04

### Changed

- **One swing for the page.** The drum machine and the chord player now share a swing as they share a tempo: move it on either, in the drum machine or in the chord player's arpeggiator or strum menu, and both swing together, and a loaded beat brings its swing along with its tempo. On the Idea Recorder and the looper, the drums and the chords you record swing as one.
- **Tap Tempo is a split button** on the drum machine. The left part taps the tempo as before; the arrow beside it opens the session settings, where "Follows the session tempo and swing" can run the beat at half or double the session, or come off to give the drums a tempo and swing of their own. Those controls are off the face of the device.

## [0.98.1] - 2026-10-04

### Fixed

- **A pressed note's name darkens** on the chord player in Notes mode, as a pressed chord's does.

## [0.98.0] - 2026-10-04

### Added

- **Text-to-Progression** on the chord player: Describe, beside Demos, asks a language model for a progression from your words ("a wistful indie verse in a minor key", "a jazz turnaround with a tritone sub"). It lands on the pad in your key and meter with the model's tempo, and when the description calls for it the model sets the player up too: the sound, style, voicing, strum, arpeggiator, key, octave, sustain and effects. Press Play, or Learn to play it yourself.
- **Share links**: Share, beside UI, copies a link that opens the chord player set up as it is now, for a bandmate or a student: the sound and effects, the style, voicing, strum and arpeggiator, the circle's look and key, and the tempo.
- **Bebop and Cool styles**, the hot and cool halves of jazz: Bebop with a sixth on I, 7♭9 on V and every secondary dominant and m7♭5 on vii; Cool with 6/9 on I and IV, unaltered ninths on the dominants and m9 on the minors.
- **Seven jazz demos**: the I–vi–ii–V and iii–vi–ii–V turnarounds, the minor ii–V–i, a jazz blues, rhythm changes, the backdoor ii–V and descending ii–Vs, each with its own sound, style and key.
- **A Stop button** beside Chords and Notes, lit while something plays on its own, a latched arpeggio or strum or the pad, and greyed otherwise. Escape does the same.

### Changed

- **Strum is the mode**: with the strum on, a press strums the chord and holding the wedge strums it in a pattern at the tempo, down and up strokes as a guitarist's hand, with a Once pattern for the plain strum. Double-click the Strum button to latch the pattern; a single click switches it off, latch and all. The arpeggiator's and the strum's swing are one setting, adjustable from either menu.
- **The chord player has a sound of its own.** On the home page, the Idea Recorder and the looper, changing the piano's sound no longer changes the chord player's, and both can be in a take. The chord player starts from the default sound once.
- **The pad's click follows the Metronome button**: playback clicks only when the button is on, the button toggles the click while the progression plays, and a running metronome hands over to the pad and comes back when the progression ends.

## [0.97.0] - 2026-10-04

### Added

- **A compressor** on the piano and the chord player, first in the effects chain, where the electric bass wants it. Amount squeezes the loud notes down towards the quiet ones, with the ratio, attack, release and make-up gain under it, and a bar shows how much it is holding back as you play. At zero the sound goes straight through, untouched.
- **A stereo bounce**: the sound swung left and right in time with the session tempo. Depth is how far it swings, Switches how often, from every eighth to every two bars, and Glide how much of each step it spends on the way, from a jump to a smooth sweep. L R goes straight across; L C R stops in the middle on the way. A dot shows where the sound is, and it follows the tempo as you change it.

### Changed

- **The Effects menu is reordered** so the effects you reach for most come first: Reverb, Delay, Fuzz, Chorus, Tremolo, Phaser, Wah, Rotary, Tone, then Compressor and Bounce. Both new effects are saved with presets, and Reset all clears them.

## [0.96.0] - 2026-10-04

### Added

- **One tempo for the page.** The metronome's tempo is now the session's: the drum machine, the chord player's arpeggiator and progression pad, and the looper keep the same tempo on the Idea Recorder, the looper page and the home page. Change it on any of them and the others follow; a drum preset, a saved beat or a generated beat brings its tempo to all of them. Under the drum machine's tempo slider, "Follows the session tempo" can run the beat at half or double the session, or come off it for a tempo of its own. The arpeggiator has a Tempo setting too (with the session, half-time, double-time), and the screen shows ½× or 2× while it is on.
- **Auto-strum** on the chord player: a held chord strummed again and again in a pattern at the tempo, down and up strokes as a guitarist's hand plays them. Choose down on the beat, down up, the folk D DU UDU, country, island, a waltz or driving eighths, at eighths or sixteenths, with swing and a Latch that keeps it going after you let go. Double-click or double-tap the Strum button to switch it on and off; its icon becomes a padlock while on. Amazing Grace and the I–♭VII–IV demos come up strumming.

### Changed

- **Chord player presets remember more**: the strum's direction and accent, the seventh's kind, Touch, the auto-strum and every arpeggiator setting, latch, swing and tempo included. Presets saved before a setting existed still light their button.

## [0.95.0] - 2026-10-04

### Added

- **Learn mode and demo progressions** on the chord player: Demos puts a progression on the pad, from the four chords under half of pop to the twelve-bar blues, Pachelbel's Canon, the Andalusian cadence, Amazing Grace, When the Saints and Greensleeves. Each demo sets the player up for it first: its key, sound, style, voicing, strum, arpeggiator, octave, sustain and effects. Learn outlines the next chord on the circle and names it in the readout, waiting for you to play it before moving on.
- **Chord inversions by dragging**: drag a little way up within a held wedge for the first and second inversion, back down for root position; the readout names the bass note after a slash.
- **Strum direction and accent**: down, up or alternating strums, with the top or bottom note a touch louder. Strum is its own split button on the device.
- **A Minor style**, the relative minor as home, with a dominant seventh on its V.
- **An Acoustic Guitar sound**, sampled, on the chord player and the piano, loaded only when chosen.
- **Touch**: a slider on the device beside Volume that sets how hard the keys are pressed, read as a dynamic marking from pp to ff.
- **Octave buttons** above the sustain and 7 pads, the up and down arrow keys doing the same; the screen shows the octave and flashes a change in the centre.
- **Preset buttons on a phone**, five small round buttons above the badge.
- **Swing on the arpeggiator**, up to a triplet feel, and the readout lights each note as the pattern plays it, on the staff and in the written names. With Latch on, the readout keeps naming the latched chord after you let go.
- **Double-tap to latch**: double-click or double-tap the Arp button to latch the arpeggiator, and double-tap the sustain pad to lock it down. The icon becomes a padlock while on.

### Changed

- **The arpeggiator keeps time with the bar**: patterns line up with bars (every bar or every two), and chord changes land on the beat, so a chord pressed a little early waits for the beat and one pressed a little late falls into place on the next step, whether the last chord is still held, latched or just let go.
- **The device at desktop**: the Metronome, Effects and Settings each have their own group, the Style button opens a menu for the seventh's kind and your own styles, the Chords menu is folded into the face of the device, and the option labels in every menu read short with a Learn more link to the user docs.
- **Presets** now carry the chord settings that match field by field, so a preset saved before a setting existed still lights its button.

## [0.94.0] - 2026-10-04

### Added

- **The chord player on the looper and the Idea Recorder.** A Chords source sits beside the piano on both, and a chord player button in each toolbar opens it in a panel of its own, with its styles, presets, arpeggiator and settings. On the looper, arm it and play a layer of chords; on the Idea Recorder, switch it into the take. It is the same instrument as the piano, so the two take turns, and its settings travel with the idea or the loop.

## [0.93.0] - 2026-10-03

### Added

- **An arpeggiator on the chord player.** Press Arp and a held wedge plays its notes one at a time in time with the tempo. The arrow beside it opens the settings: rate (quarter, eighth, triplet or sixteenth notes), pattern (up, down, up and down, as played, random), how many octaves it climbs, the gate, and Latch to keep the pattern going after you let go. A new chord restarts the pattern as you press it, and the pad plays a progression back through it. Presets remember the arpeggiator too.
- **An Electric Bass** in the Sound menu, on the piano and the chord player: a sampled fingered bass, an octave down, made for the chord player's Notes mode.
- **The chord player demo on the home page**, after the piano demo.

### Fixed

- On a phone, holding the chord player's 7 or sustain pad no longer selects the label instead of pressing it.

## [0.92.0] - 2026-10-03

### Added

- **Chord player presets carry the chord player's settings**: chords or notes, the style, the voicing, the octave and the strum are saved with the sound and come back when the preset is pressed.

### Fixed

- **fifths.app and chordplayer.dev** send every path to the chord player.

## [0.91.0] - 2026-10-03

### Added

- **Five more chord styles.** Folk plays a guitar's open shapes: add9 on I and IV, a sus4 on V, and the 7 pad suspends or, on I, augments. Fifths plays power chords on every wedge. Honky-tonk gives country's sixths on I and IV with sevenths on V and the secondary dominants. Ragtime chains dominant sevenths round the circle with diminished sevenths under the pad on the minors. Bossa tilts the jazz palette softer, with 6/9 and 7♭9 under the pad. Their chords are in the custom style editor too.
- **The tempo button is a split button**: press it to start and stop the click, or the small arrow beside it for the Timing menu.

### Changed

- The computer keyboard plays by degree from the start, so 1, 4, 5 is I–IV–V; the UI menu offers the round-the-circle map instead.
- "Where the key sits" in the UI menu puts your key at the bottom (the default) or the top.

## [0.90.0] - 2026-10-03

### Added

- **The chord player's readout** shows the notes of what you play beneath the chord name: on a small treble staff with the names written under it, or the names alone, or the staff alone, or neither, as the UI menu says. The notes are spelled in flats on the flat side of the circle and in sharps on the sharp side.
- **Arrow keys turn the key**: left a fifth down, right a fifth up.

### Changed

- The chord name sits at the centre of the circle on every layout.
- Dropdown lists mark the chosen option in bold on a highlight instead of a check mark, and the Style and Voicing lists take the width their words need.

## [0.89.0] - 2026-10-03

### Added

- **The arch.** The chord player now opens as an arch: your key and three fifths each way drawn big, the four far keys as small buttons running on from its ends, the tritone left out. With the key at the bottom (the default) it is a bowl, the key under your thumb on a phone. The UI menu brings back the whole circle.
- **Chord numerals.** The IV button beside the keyboard button writes every chord's Roman numeral in your key on its wedge, the six chords of the key in yellow, the rest in grey. The chords outside the key are dimmed until you say otherwise.
- **Styles.** Plain is the triads with the 7 pad's seventh. Blues puts a dominant seventh on every wedge, Jazz gives each degree its own (maj7, m7, 7, m7♭5), Lush stacks ninths and thirteenths. The wedges' names say what each will play, and the 7 pad adds the next extension. Signed in, make your own style from the Chords menu, a row per degree, saved to your account
- **Presets of the chord pla draw on the same library of
  sounds as the piano's, with he sound playing to a button,
  put any saved preset on one,
- **A keyboard map by degree I to VII, so 1, 4, 5 is aI–IV–V; the row below plays the minors on the same roots. Either way the keys follow your key wherever it sits.
- **Gliding.** Drag from one wedge to another without lifting and the chord changes.
- **A sustain pad** beside te two are round pads eitherside of the arch, one for each hand; on a phone they sit under a thumb.
- Style and Voicing are dropdowns on the device, and Space, Shift and Esc are named under the circle.
- Reset all to defaults at ton the piano and the chordplayer.

### Changed

- The key signatures run along the rim and are off until switched on. The keyboard key labels are blue, as the piano

## [0.88.0] - 2026-10-03

### Added

- **The Chord Player's progression pad and Timing menu.** With Jot on, the pad under the circle writes every chord played, grouped by bar; tap an entry to change its beats, make it a rest or remove it. Play runs the progression through the chord player, and MIDI exports a `.mid`. A signed-in member saves progressions to the account by name. The Timing menu holds the metronome's tempo, beats to the bar, a free-running click and the playback click switch. Both are for wider screens.
- **Notes with a progression.** A member's chord player page has a note board under the device, saved with the progression.

## [0.87.0] - 2026-10-03

### Added

- **The Chord Player.** A new instrument in the Instruments menu: the piano's sounds on a circle of fifths. Press and hold a wedge and the chord sounds for as long as you hold it, the outer ring the major chords and the inner ring their relative minors, with the chords that fit together side by side. Hold the 7 pad, or Shift, for a seventh. Turn the circle so your song's key sits at the top. Notes mode turns the circle into twelve single notes. The Sound menu, the presets, the effects and the volume are the piano's, and the Chords menu chooses the voicing, a strum, the velocity and the octave. Play it from the computer keyboard too, with a button that shows each wedge's key. On a phone the circle fills the width and the 7 pad sits under a thumb. No account needed.

### Changed

- **Chords no longer clip.** The piano gained a limiter at the end of its chain, and the chord player plays the notes of a thick chord a little softer, so a full voicing on the grand piano stays clean.
- **A note the sustain pedal holds plays again when pressed again**, on the piano and the chord player.

## [0.86.0] - 2026-10-03

### Added

- **Your own drum kits.** In the drum machine, the small button beside the Kit menu opens your account's kits. Make one, name it, and give each of its twelve drums a sound of your own: a WAV, FLAC, MP3, M4A or AIFF one-shot up to 10 MB. Every member of the account can play it, and a beat saved with it keeps it. Each drum shows its file's format, size and date, has a listen button, and can carry a note of where the sound came from.
- **More kits in the menu.** New kits made for everyone appear beside Acoustic, Electronic and Room.
- **Piano presets, all five.** The site's five starting presets can now be kept up to date in full from the piano's manage popover.

## [0.85.0] - 2026-10-02

### Added

- **One Recordings panel with search.** On the Idea Recorder the search field now sits at the top of the Recordings panel and narrows the list as you type, by title, notes, take name or number. The panel docks in its column, pops out into a window of its own, or minimises to the Ideas button in the toolbar, which brings it back as it was. On a phone the same list opens as a full-screen sheet from that button.
- **Calibrate on the Idea Recorder.** The microphone's menu has the looper's Calibrate button: three clicks through the speakers measure how late your microphone hears, so a multitrack take's stems line up without a trip to the looper.

### Changed

- **Drum machine polish.** The readout can no longer be selected by accident, and the layout is tighter.
- **Notification links stay good.** Links in the inbox and in email digests now reach the right page even after a project, song or account is renamed.

## [0.84.0] - 2026-10-02

### Changed

- **The free plan grew.** A free account now holds 20 GB of stored files and up to 6 members, up from 10 GB and 5. Nothing to do on your side: every free account has the new room already. The plan terms and the pricing page say the same.

## [0.83.0] - 2026-10-02

### Changed

- **The Idea Recorder page explains itself.** Under the recorder, "How to use the Idea Recorder" and Quick Tips sit with a button to the full user doc, as on the looper and the other tool pages.

## [0.82.0] - 2026-10-02

### Added

- **Tracks for multitrack takes.** Open a take that has stems and a Tracks panel appears under the Idea Recorder: each stem with its waveform, mute, solo and a fader, with a transport and master of its own, so you can hear the sources alone or in any mix before deciding what goes to a song. It pops out and docks like the notes.
- **Stems that line up.** The input latency, how late a sound reaches the computer through the microphone or the line in, now has a slider in each of their menus on the looper and the recorder. A multitrack take trims that much off the front of their files so they sit with the piano and the drums. Calibrate on the looper measures it; until then the browser's own figure is used.

### Changed

- **Multitrack is the default** once two or more sources are in the take. Stereo stays a choice.

## [0.81.0] - 2026-10-02

### Added

- **Input sources on the Idea Recorder.** Under the screen, an Input Source row offers Microphone, Line in, Computer, Piano and Drums. Press a button to switch that source into the take or out of it; any mix is fine, and a take no longer needs the microphone. Each button carries its own level meter, running as soon as the source is in, so you can check a level before recording.
- **A settings menu beside each source.** The small button joined to the Microphone, Line in and Computer buttons holds that source's device and channel choice, the share picker for the computer, monitoring and normalize, in place of the Stereo input switch and Microphone picker that lived in the recorder's settings.
- **Gain and volume under each source.** The three inputs get a gain slider, and the piano and drums their own volume, the same one their panels use.
- **Line in and computer audio in a take.** Record an instrument on an audio interface, or the audio of another program through the browser's share picker, with the microphone or instead of it.
- **Multitrack with any two sources.** Multitrack is offered whenever two or more sources are in, not only when an instrument is.

### Changed

- **Input settings are shared between the looper and the recorder.** Choose a device, channels or gain once and both have it, and an input opened on one page is open on the other.
- **Normalize** now applies to the recorder as well: a file from the inputs is scaled so its loudest point sits just under full scale.

## [0.80.0] - 2026-10-02

### Added

- **Old addresses keep working.** When you rename a project, a song or an account and its web address changes, the old address now redirects to the new one, so links you have already shared do not break. An account's old address stays reserved for it.
- **Share links have their own address.** Copying a share link now gives a short link that always opens the song or project it was made for, wherever a rename moves it. Links copied before carry on working.

### Changed

- **The URL field no longer follows the name** as you rename an existing project, song or account. "Use name" fills it in on request, and a note explains that the old address keeps redirecting.

## [0.79.0] - 2026-10-02

### Added

- **Line in and Computer sources on the looper.** Record a second input such as an instrument on an audio interface, or the audio of another program through the browser's share picker. Each outside source has a Gain slider right under its button, and recorded layers from the inputs can be normalized so their loudest point sits just under full scale.
- **A settings menu beside each source.** The small button joined to the Microphone, Line in, Computer and Piano buttons holds that source's device and channel choice, latency, monitoring and normalize settings, in place of the old Inputs menu.
- **Piano and drums volume on the looper.** The two instruments have their own volume slider under their buttons, the same one their panels use.

### Changed

- **The looper's rows run sources, settings, transport**, with the transport right above the layers it makes. Undo and Clear carry icons.
- **Level meters run as soon as a source is chosen**, so an input can be checked before recording.

### Fixed

- **The Computer source now opens the share picker.** On a Mac, a browser tab's audio can be shared; for another program, route it through a loopback device and choose that as the line in.
- **Opening the looper's audio twice in quick succession** could leave it without its capture, and its menus could open off the edge of the screen.

## [0.78.0] - 2026-10-02

### Added

- **Save, load and export loops.** The Looper now saves a loop with every layer under its own name, shown and edited above the screen, and saves it again in place after that; Save as new loop keeps the saved one and starts a separate one. The Load menu lists your saved loops and brings one back with its layers, tempo and bars. Export puts a loop into the Idea Recorder as an idea, where its layers can go to a song as stems. Loops that were only saved stay out of the recorder's list unless you tick Show loops there.
- **Notes on a loop.** A note board under the Looper, exactly as an idea has in the recorder, saved with the loop.
- **Import a take.** The Load menu lists your recent Idea Recorder takes; one comes in as layers, a multitrack take one per source, with the loop's length taken from the take or the take fitted to the loop.
- **The Looper and its notes pop out** into draggable, resizable panels on a desktop.

### Fixed

- **The piano page's title and introduction** were hidden at every width; they show from tablet size up.

## [0.77.0] - 2026-10-02

### Added

- **Load a loop.** A Load menu in the Looper lists the loops you have sent to the Idea Recorder and brings one back into the looper with its layers, tempo and bars.

### Changed

- **Looper: Record is one lit button.** It starts a layer and stays lit while recording; press it again and the pass under way becomes the last layer. Stop halts the loop and drops a pass still recording. The separate Finish layer and Cancel buttons are gone.

## [0.76.0] - 2026-10-02

### Changed

- **The Looper is open to everyone.** You no longer need an account to use it: the loop stays in your browser as you work, and comes back when you return, with "back from last time" on the screen. Saving a loop to the Idea Recorder as a take still needs an account, and the Save menu says so with a sign-in link. The Looper is in the Tools menu and the footer for everyone.

## [0.75.0] - 2026-10-02

### Added

- **Looper: Stereo or Multitrack take.** The Save menu chooses whether the loop goes to the Idea Recorder with each layer as its own stem (the default) or as one stereo mix.
- **How to use the Looper.** A guide and quick tips sit under the looper, with a button to the full user doc.

### Changed

- **The looper is a device.** It now wears the same chassis, screen and buttons as the drum machine and the piano, with its settings in three menus on the device: Timing (tempo with Tap, bars, beats, count-in, click), Mic (monitoring, latency and Calibrate) and Save. Choosing the piano or the drums as the source opens that instrument if it isn't out.

## [0.74.0] - 2026-10-02

### Added

- **The Looper.** A loop station in the Tools menu: a loop of one to eight bars at a tempo plays round and round while you record layers onto it one pass at a time, from the microphone, the piano or the drum machine. Layers have a level, mute, solo and delete, with undo and clear; there is a count-in, a click, and a Tap tempo. The tempo is shared with the drum machine and the metronome both ways, and recording the drums starts the beat on bar 1 in step with the loop. Save as take puts the loop in the Idea Recorder as a take with each layer as its own stem, ready to go to a song.
- **Latency handled for you.** Instruments are captured inside the looper's own audio engine, so they land exactly where they were played. A Calibrate button measures the microphone's delay through your speakers, and piano layers played by hand are shifted by your audio output's reported latency.

### Changed

- **Piano page.** A note on latency: Bluetooth headphones and speakers add a lot of delay between a key and its sound; built-in speakers or wired headphones give the best playing experience.

## [0.73.0] - 2026-10-01

### Added

- **Multitrack takes in the Idea Recorder.** With the drums or the piano in the take, the recorder offers Stereo or Multitrack above the meters. Multitrack records the mix as usual and, beside it, a file of its own for the microphone and for each instrument. The take shows how many of these it has, and "Add N stems to song…" in its menu puts them on a song as separate stems, each named for its source. "Add as demo…" still adds the mix.

### Changed

- **The Idea Recorder is your own page.** It now lives at /ideas/recorder, outside any account's address. Your ideas list together whichever account you recorded them in, only you see them, and a take can go to a song in any account you belong to. Old links redirect. New takes count against the storage of the account you are currently working in.
- **Instrument settings are saved by takes.** Recording a take saves the drum machine's beat and settings and the piano's sound and effects with the idea, and opening one of the idea's takes brings them back. Untick "Settings with the idea" in an instrument's panel header to keep a take from changing what the idea remembers. An idea with nothing saved yet leaves the instruments as they are.

## [0.72.0] - 2026-10-01

### Added

- **Your instruments are remembered with each idea.** The drum machine's beat and settings and the piano's sound and effects are saved with the idea as you change them, and come back into both instruments when you open one of the idea's takes again. An idea that never used them leaves the instruments as they are.
- **Piano presets in the Idea Recorder.** The piano panel on the Idea Recorder page now has the five preset buttons and the presets menu, as the piano page does.

### Changed

- **A level meter per instrument.** While the piano and the drums play into a take, each has its own meter above the microphone's, with its icon, and the microphone's meter shows only the microphone.
- **Instruments join the take whenever they are switched on.** With "Drums in the take" or "Piano in the take" on, the instrument is recorded whether or not its panel is open, so you can press Record first and start the beat after.

## [0.71.0] - 2026-10-01

### Added

- **A fully arrangeable Idea Recorder screen.** On a desktop, every part of the page can live in its own floating panel: the drum machine, the piano, the metronome and the tuner open into panels from their toolbar buttons, and the notes, the recorder itself and the recordings list each have a button in their header to pop out into a panel or dock back into their column. Panels drag by their header, resize by their corner, remember their place and size, and come to the front when you click or type in them. Docking a panel puts it back at its original size. On phones and tablets the layout stays as it was.
- **Drums and piano in the take.** The drum machine's beat now records into the take while it plays, like the piano, and a "Drums in the take" switch in the drum panel keeps it out when you want a click track that stays out of the recording. The piano panel has the matching "Piano in the take" switch.
- **Instruments level meter and microphone mute.** A second meter on the recorder shows how loud the instruments are going into the take, and a mute button beside the microphone meter silences the microphone for a take (it comes back on with each visit).
- **The space bar follows the instrument you touched last**, starting and stopping the drums or sustaining the piano.

### Changed

- The recorder device lays itself out by the width of its panel or column, so it fits wherever you place it.

## [0.70.0] - 2026-10-01

### Added

- **Idea Recorder: a waveform on the screen.** While you record, the sound scrolls across the screen as the take grows. Once a take is in, its whole waveform appears with a playhead that follows playback; click or drag on it to move around the take. Quiet and loud takes both fill the strip, the way a phone's voice memos do.

## [0.69.0] - 2026-10-01

### Changed

- **Drum machine: each drum sits where it usually does.** Hats and ride a little to the right, the floor tom and crash to the left, kick, snare and clap in the middle. Presets, generated beats, Text-to-Beat and new rows all place their drums this way; your own pan settings are untouched.
- **Generated beats bring their tempo.** Each generator style arrives at its own speed, rock at 120, hip-hop at 90, house at 124, breakbeat at 138. A pattern added after yours keeps your tempo and kit.
- **Hip-hop and boom bap on the electronic kit.** The generator's hip-hop style and the Boom bap preset now arrive on the electronic kit.
- **Admins: "Use as the home page beat" from the drum machine page too**, not only from the home page demo.

## [0.68.0] - 2026-10-01

### Added

- **Piano and drum machine: a Tone section** in the Effects menu, three sliders on the whole sound. **Tilt** runs from dark to bright. **Air** is an exciter: it adds sparkle above the top of the sound, the kind a plain treble boost cannot give. **Bottom** makes the low end feel bigger, with the mids and highs left alone. The piano remembers it and saves it in presets; the drum machine keeps it in the beat, so links, saved beats and WAV downloads carry it.
- **Drum machine: the hip-hop and dance presets and generator styles bring Bottom**, disco, pop and funk a touch of Air, and Text-to-Beat understands "a big bottom end" and "bright and airy".

## [0.67.0] - 2026-10-01

### Added

- **Drum machine: a master volume.** A Volume slider beside Humanize, in the tempo menu on a phone. It is your listening level, remembered in your browser and not part of the beat, so links, saved beats and WAV downloads play at full.

### Changed

- **Presets, generated beats and Text-to-Beat choose their kit.** Every preset arrives on the kit it was written for, trap, house, techno and drum and bass on the electronic kit and the rest acoustic. Generator styles do the same, and Text-to-Beat picks acoustic or electronic from your description.
- **The tempo row on mid-size screens.** The Tempo, Swing, Humanize and Volume sliders sit two by two under Tap Tempo where the row was getting cramped, and in one row where there is room.

## [0.66.0] - 2026-10-01

### Changed

- **Drum machine: every preset arrives with its own effects.** A touch of room on the rock and pop beats, tempo-locked echoes on house, techno and trap, tape-style delay on Motown, boom bap, the shuffle and the one drop, more room on the ballads and the waltz. Loading a preset resets the effects to its own; adding one as a pattern leaves yours alone.
- **Generated beats bring their own feel.** Each generator style sets its swing and humanize along with its effects, and Text-to-Beat sets them from your description, so "tight and machine-like" and "loose and human" come out that way. A generated beat starts from a clean, straight slate before taking on its style.

## [0.65.1] - 2026-10-01

### Fixed

- **Account settings said sign-up was invitation-only** even with sign-up open. The Invite codes section now words itself by the sign-up mode.

## [0.65.0] - 2026-10-01

### Added

- **Piano: a metronome.** A metronome button in the More row opens a small menu to start or stop it, set the tempo, or tap it in. The button lights while it runs, the icon swells on the downbeat, and the screen shows the tempo and the beat. On a phone it is a section of the sliders menu.
- **Drum machine: effects in the tutorial, the generator and Text-to-Beat.** The tutorial gains two steps, putting the kit in a room and adding an echo between the beats, each with "Do it for me". Every generator style brings its own effects, a little room on rock, a dotted-eighth echo on house, so a generated beat starts clean. Ask Text-to-Beat for effects in your description ("with a big room", "a dub-style delay", "fuzzed up") and the beat arrives with them.
- **Links to the user docs** at the foot of the piano and drum machine pages, and a "Free standalone version" link from the home page's drum machine demo.

### Changed

- **The piano and drum machine lay themselves out by their own width**, not the window's, so they fit wherever they are placed. The piano's phone menu is now in sections, one open at a time: Metronome, Presets, Volume, Effects and More.
- **Drum machine: the buttons at the foot** stay in two rows until the device is wide, with Play at the right end where the eye looks for it.
- **Drum machine: every drum sends more to the delay and reverb** by default, so the master levels are useful across their whole range, and the wah keeps its volume as it opens.

## [0.64.0] - 2026-10-01

### Added

- **Drum machine: a wah.** A filter sweep timed to the beat, once per beat, two beats, one, two or four bars, so it lands on the downbeat the way a sweep pulls a loop in and out. Its level turns it on, and range and resonance set how far and how sharp. Part of the beat: saved, shared in the link and in the WAV download. Reset to defaults clears it.

## [0.63.0] - 2026-10-01

### Added

- **Piano: a wah.** A new Wah section in the Effects menu. Touch opens the filter with how hard you play, Sweep moves it on its own at a rate you set, and Range and Resonance shape the sound from a gentle vowel to a sharp peak. With a MIDI controller connected, the mod wheel or an expression pedal rides the wah while you use it. Off until you turn the mix up, remembered, and saved as part of a preset.

## [0.62.0] - 2026-10-01

### Added

- **Piano: presets.** Five numbered buttons hold named presets of the sound and its effects, and the screen names the one you are on (with "edited" once you move a slider). Click a button to load it. To save the sound you have, ⌘-click (Ctrl-click on Windows) or press and hold a button, give it a name and save: signed out, it lives in your browser; signed in, it goes to your account where every member can use it. The bookmark button opens the full list: save without taking a slot, search, rename, move a preset to a button, or delete. On a phone the presets sit in the sliders menu.
- **Piano: share a preset.** Copy a link to any preset, or to the sound as it stands, and it opens the piano with that preset for anyone.

## [0.61.0] - 2026-09-30

### Added

- **Drum machine: play it from MIDI.** A MIDI button beside Effects connects a pad or keyboard (Chrome and Edge). General MIDI drum notes play their sounds, and any other note plays the rows of the open pattern in order, so a keyboard works too. Turn on **Record hits into the grid** and, while the beat plays, every hit lands at the nearest step, soft hits as ghosts and hard ones as accents; a drum the pattern has no row for gets one.
- **Drum machine: analog delay and fuzz.** The delay can be Digital or Analog (each repeat darker and softer, with a slow tape-like wobble), and a fuzz with drive and tone sits on the drums themselves while the delay and reverb stay clean. Both are part of the beat: saved, shared in the link and in the WAV download. Reset to defaults clears them.
- **Piano: a flanger.** The Phaser section now switches between Phaser and Flanger, with the mix, rate and depth sliders serving whichever you choose.

## [0.60.1] - 2026-09-30

### Changed

- **Piano page copy**: the "How to Play" section gains an introduction and sub-headings, names the letters toggle, and points at the MIDI button by its icon.

## [0.60.0] - 2026-09-30

### Added

- **Piano: fuzz, phaser and rotary speaker.** Three more sections in the Effects menu: a fuzz with drive and tone, a phaser with mix, rate and depth, and a rotary speaker with Off, Slow and Fast, the rotors spinning up and down between speeds. Every one is off until you turn it up, and the piano remembers your settings. On a wide screen the menu lays out in three columns.

### Fixed

- **Connect MIDI works on the live site again.** A site setting was blocking Web MIDI in the browser, so a MIDI keyboard could not play the piano here even though the browser supported it.
- **The tremolo's Chop shape no longer clicks** on a sustained note; the edges are softened just enough to lose the crunch while keeping the chop.

## [0.59.0] - 2026-09-30

### Added

- **Piano: analog delay, chorus and tremolo.** The Effects menu now offers a Digital or Analog delay (Analog repeats darken and soften as they go, with a slow tape-like wobble), a chorus (mix, rate and depth) and a tremolo (depth, rate, and a Smooth or Chop shape). Every new effect is off until you turn it up, the button lights while any effect is on, and the piano remembers your settings. The menu lays out in two columns where there is room and scrolls on a short window.

## [0.58.0] - 2026-09-30

### Added

- **Effects on the piano.** An Effects button opens the reverb, with its level and the size of the room, and a new delay with its time, feedback and level. The button lights while an effect is up, and the settings are remembered.
- **A toggle for the key letters.** A small keyboard button beside the octave hides or shows the computer-key letters on the piano keys.

### Changed

- **The piano's controls, rearranged.** One row that grows with the screen: power, sound and octave everywhere; a compact strip of icons for the pedal, MIDI, hi-res samples, key guides and letters on a wide screen; a single menu holding volume, effects, hi-res and MIDI on smaller ones. The key guides have their own menu with a button to turn them all off.

Nothing is left unreleased. Still open: the drum machine timeline, built but hidden until you've refined it; MIDI out for the piano, on the list but not next; the piano's optional chord mode; and for the drum machine, own samples, MIDI input and a third kit.

## [0.57.0] - 2026-09-30

### Added

- **A key on the piano.** Choose a root and a scale (major, minor, harmonic minor, the pentatonics, blues, dorian, mixolydian or lydian) and the keys in it are marked, the root in yellow, with the rest a shade darker. Press 1–7 to number the keys by degree. The key is remembered.
- **The piano names what you play.** The screen shows the note, the interval, or the chord you're holding, with inversions as slash chords, and in a key its Roman numeral too, so G B D in C major reads "G · V".

### Fixed

- The letters on the piano keys line up on one row.

## [0.56.1] - 2026-09-30

### Changed

- **Hi-res piano samples in every browser.** Where a browser cannot play the lossless files, the Hi-res button now fetches the same six velocity layers and key releases as high-quality mp3 instead, a little smaller, and says so.

## [0.56.0] - 2026-09-30

### Added

- **The piano records into the Idea Recorder.** A piano button beside the drums in the recorder's toolbar opens the full piano under the recorder, and its sound goes into the take, mixed with the microphone or alone.

## [0.55.1] - 2026-09-30

### Fixed

- **The piano's Hi-res button** stays visible whatever sound is chosen, and pressing it with another sound selected switches to the Grand Piano and starts the download.
- **Hi-res no longer waits for the power switch.** A remembered Hi-res choice used to sit at 0% until the piano was turned on; the samples now load as soon as the Grand Piano is chosen, on or off.

Nothing is left unreleased. The timeline remains built but hidden for your design work, and the piano's next steps are an mp3 fallback for browsers that refuse FLAC, scale and chord help, and recording into the Idea Recorder.

## [0.55.0] - 2026-09-30

### Added

- **A real grand piano.** The piano's Grand Piano is now sampled from a concert grand in three tiers: a first set that loads in a moment, a fuller set with four velocity layers that arrives in the background on the piano page, and, if you press **Hi-res**, a lossless set with six layers and the sound of each key's release, about 72 MB once. Your browser keeps it for next time, and the piano remembers the choice.
- **An Instruments menu** in the navigation, with the Drum Machine and the Piano; the Tools menu keeps the Idea Recorder, Tuner and Metronome. The footer has an Instruments row too.
- **A piano demo on the home page**, under the drum machine, with a link to the standalone piano.

### Changed

- Softer and louder notes now come from different recordings, blended between, and letting a key go plays a quiet key-off.
- On a phone the navigation's menus sit closer together, as icons.

## [0.54.1] - 2026-09-30

### Fixed

- **Piano on iOS: notes came late, together.** The piano now warms its audio on the first touch, and a **power switch** (as the tuner has) warms it ahead of the first note; Off silences it.

## [0.54.0] - 2026-09-29

### Added

- **A piano and synth.** Piano in the Tools menu (or /piano) is a keyboard instrument in your browser with five sounds: Electric Piano, Organ, Synth Lead, Pad and Pluck. Play the keys by mouse or touch, with several fingers at once and a slide across keys for a run; play the computer keyboard, two rows of notes with the arrows moving the octave and the space bar as the sustain pedal; or plug in a MIDI keyboard and press Connect MIDI. There is a sustain pedal, a reverb and a volume, and your choices are remembered. On a phone the keys stand on end down the screen, sized for a finger.

Next on the piano's plan is the sampled acoustic piano, the sound you liked most in the precedents, followed by a home page tab, scale and chord help, and recording into the Idea Recorder. The drum machine timeline is still built but hidden for your design work.

## [0.53.0] - 2026-09-29

### Added

- **Reorder the songs on a project page.** Members can drag a song by the grip before it (the six dots) to move it within its list, or focus the grip and press the arrow keys. The order is the project's, so everyone sees it, and the playlist plays in that order. A new song now goes to the end of the list.

## [0.52.0] - 2026-09-29

### Added

- **Reorder the stems in the player.** Members can drag a stem by the grip before its name (the six dots) to move its row, or focus the grip and press the arrow keys. The order is saved to the song, so everyone sees it and the downloads follow it. Works by touch too.

The timeline remains built but hidden for your design work, and the remaining drum machine items are own samples, MIDI input and a third kit.

## [0.51.1] - 2026-09-29

### Changed

- **Home page: the tuner is back to manual On / Off.** Opening the microphone as the tuner scrolled into view made the browser ask for permission again and again.

### Fixed

- **The Releases page showed nothing newer than v0.48.0.**

## [0.51.0] - 2026-09-28

### Added

- **Text-to-Beat.** Describe the beat you want in words and the drum machine asks a language model for it. The answer fits your open pattern's meter and length, brings a tempo and swing when the model suggests them, and lands in the pattern with Undo ready, or as a new pattern if you tick the box. It takes a few seconds.
- **Random Beat Generator.** The Generate menu draws a pattern from a style (rock, pop, funk, hip-hop, house, breakbeat, latin, half-time or a fill) at a density you choose. Every press is a fresh draw, and Undo brings your pattern back.
- **Reset to defaults** in the Effects menu: both master levels back to zero and every drum back to its usual sends.

### Changed

- Older beats and links from before the effects existed now respond as soon as you raise an effect level, the same as a new beat.
- Lit drum cells stay lit under the pointer.
- The drum machine demo on the home page now uses the full width of the page.

## [0.50.0] - 2026-09-28

### Added

- **Reset to defaults** in the drum machine's Effects menu: both master levels back to zero and every drum back to its usual sends.
- **A metronome demo on the home page**, beside the guitar tuner. Tabs switch between the two; the tuner opens first and turns on by itself as it scrolls into view. Turn it off and it stays off.

### Changed

- **The space bar on the home page follows the scroll.** It drives whichever demo is in view, the stem player or the drum machine, and scrolls the page when neither is.
- **One thing plays at a time.** Starting the stem player, the drum machine or the metronome stops whichever of the others was playing.
- **Older beats and links get the default effect sends.** A beat saved or a link made before delay and reverb existed now responds as soon as you raise an effect level, the same as a new beat.
- **Lit drum cells stay lit under the pointer**, a touch softer so the hover still shows.

## [0.49.0] - 2026-09-28

### Added

- **Delay and reverb in the drum machine.** The new **Effects** menu at the foot of the device holds the delay (its time in the beat, feedback and level) and the reverb (size and level). Both levels start at zero, so a beat is dry until you raise one; every drum already sends a little, so you hear it at once. Each row's mix menu has its own delay and reverb sends. The effects travel in share links and WAV downloads, and the Effects button lights up while either level is above zero.

## [0.48.0] - 2026-09-28

### Added

- **Beats for a song.** On a song's page, Uploads → Drum Machine opens the drum machine with a fresh beat at the song's tempo and time signature. Save keeps the beat with the song, and "Add to … as a demo" renders the beat and adds it to the song's demo recordings, ready to play alongside the stems or download.
- **A pattern picker in the Idea Recorder.** When your beat has more than one pattern, the drums in the recorder's toolbar offer a picker beside the tempo; while the drums play, the change waits for the end of the cycle.

### Changed

- The presets menu groups its beats under styled headings, and long menus scroll instead of running off the screen.

## [0.47.0] - 2026-09-28

### Changed

- **Swing has a grid.** A 1/16 · 1/8 toggle beside the Swing slider (and in the phone's tempo menu). 1/16 swings every second sixteenth, the way an MPC does. 1/8 swings the off-beat eighths instead, so swing is audible on a beat whose hats sit on the eighths and whose kick and snare sit on the beats, which is most rock. The setting travels with your links and into MIDI downloads; the Shuffle preset uses it.
- **A little humanize by default.** New beats and presets start with humanize at 14%, so they don't sound like a machine out of the box.
- Layout and button tweaks on the drum machine.

## [0.46.0] - 2026-09-28

### Changed

- **A restyled drum machine.** Smaller, tidier buttons; the kit, steps, meters and patterns in one labelled row; the tempo, swing and humanize sliders beside Tap Tempo; a status pill in the display; Play at the right of the foot; and a short how-to under the device.
- **Easier on a phone.** A second Play / Stop sits under the display. A sliders button beside Tap Tempo opens the tempo, swing and humanize controls, and each row has its own sliders button for level and pan.

## [0.45.0] - 2026-09-27

### Changed

- **A tidier drum machine.** Save, your saved beats, Copy link and the WAV and MIDI downloads now live in one ⋯ menu beside Presets. The drum for each row and the kit are picked from drop-down lists instead of a native select and a row of buttons.
- **The readout says what you're playing.** After choosing a preset or opening a saved beat, its name shows in the display until you change something, when it becomes Custom; a saved beat you've changed reads "edited" until you save it again.
- **The device has a name.** SS Drumbo 001, under the display, like the recorder and the tuner.

Nothing is pending on production now. What's left on the drum machine list, for whenever you want it: beats attached to songs with the song's tempo seeding them, a level slider on phones, a pattern picker in the recorder's menu, a timeline, a pattern generator, own samples and MIDI input.

## [0.44.0] - 2026-09-27

### Added

- **A drum machine tutorial.** "Tutorial: a rock beat from scratch" on the Drum Machine page walks you through building a beat: the kick on 1 and 3, the snare on 2 and 4, hats, a push, an open hat, accents, humanize, a crash, and a second pattern with a fill. Each step highlights the cells to tap, ticks when you've done it, and has a Do it for me button. Your own beat is kept and Undo brings it back.

## [0.43.0] - 2026-09-27

### Added

- **A Room kit** for the drum machine: a second acoustic kit with longer, roomier hits.
- **Saved beats.** A signed-in member's drum machine has Save and a Beats menu: beats are kept in the account under a name, every member can load one, editors save, rename and delete.

### Changed

- The drum machine's Presets, Beats and Download menus open upward, above their buttons.

## [0.42.0] - 2026-09-27

### Added

- **Preset beats.** A Presets menu in the drum machine with 22 beats by style: rock, pop and funk, hip-hop and electronic, world, a waltz and two grooves in 6/8, and fills. Choosing one replaces your project, tempo and kit included, and an Undo button brings your own beat back until you make another change. Hold shift while choosing to add the preset's patterns to your project instead, keeping your tempo and kit, which is how a fill joins a groove.
- **3/4 and 6/8.** Each pattern has a meter, with a bar or two bars of 12 sixteenths. In 6/8 the grid shades in sixes, a phone shows the bar as two lines of six, and a downloaded MIDI file carries the time signature.

### Changed

- Share links now carry each pattern's meter. Links made before this release still open.

## [0.41.0] - 2026-09-26

### Added

- **Drum machine: patterns.** A project now holds up to eight patterns, as numbered buttons above the grid: add an empty one with the same drums, copy the open one, or delete it. While the drums play, the pattern you choose waits for the end of the cycle before it takes over, and the readout shows which is playing and which is next.
- **Accents and ghost notes.** Hold a sounding cell (or right-click it, or shift-click) to step it through normal, accent and ghost.
- **Pan and humanize.** Each row has a pan slider beside its level slider (double-click for the centre). A Humanize slider scatters every hit a little in time and loudness, so a beat stops repeating itself exactly.
- **Download your beat.** The Download menu offers the open pattern as a WAV (one seamless cycle, ready to loop) or as a MIDI file that opens as an editable drum track in any DAW.
- **Drums in the Idea Recorder.** A drums button beside the metronome plays your latest beat as a backing track while you record; with headphones on it stays off the take. On a phone it is in the toolbar's wrench menu. The drums and the metronome never play together: starting one stops the other and takes over its tempo.
- **A Drum Machine page in the docs.**

### Changed

- Share links carry the whole project now. Links made before this release still open.

## [0.40.0] - 2026-09-26

### Added

- **A Tools menu in the header**, on every width: the Idea Recorder (members), the tuner, the metronome and the drum machine. A phone shows the wrench alone.
- **A drum machine demo on the home page**, after the tuner demo.

### Changed

- The footer's links are two rows: the tools, then everything else.

## [0.39.0] - 2026-09-26

### Drum Machine v1

- The grid: up to 12 rows over 8, 16 or 32 sixteenths. Tap a cell or drag across cells to paint. The playing column lights. Beats are tinted in pairs. On a phone a bar shows as two lines of eight, so cells stay big enough to tap.
- Transport and tempo: Play/Stop (space bar too), 40 to 240 bpm with buttons, a slider and tap tempo, a swing slider.
- Per row: voice picker over the 12 voices, mute, solo, remove, and a level slider from sm up. Add Row picks the next unused voice.
- Two kits: acoustic from 12 of Groovie's CC0 one-shots (under 600 KB, fetched only on this page, credited on the built-with page) and an electronic kit synthesized in the browser. A closed hat chokes a ringing open hat.
- A starting beat at 100 bpm so the first Play makes a sound. The pattern is remembered per browser, and Copy link puts it in the URL as a versioned bit-packed string. Growing 16 steps to 32 repeats the bar.
- The metronome now shares the lookahead loop with the drum machine.

## [0.38.0] - 2026-09-26

### Added

- **A metronome.** In the Idea Recorder's toolbar, a compact one: switch it on and set the tempo, and it keeps clicking through a take, so with headphones on you record to a click that never reaches the microphone. The full metronome is at /metronome: 30 to 300 bpm with buttons and a slider, tap tempo, two to six beats to the bar with an accented first beat, and a beat indicator. It remembers your tempo and beats.
- **A tools menu on phones.** The recorder's toolbar folds the tuner and the metronome into one wrench button. Set the tempo and switch the metronome on from the menu; while it runs, a stop button sits where the wrench was, so one tap stops it.

## [0.37.0] - 2026-09-26

### Added

- **An inbox.** Open it from the account menu, which shows a count of what you have not read. It collects comments on songs, new stems, songs and demos in the projects you belong to, invitations you sent being accepted, and warnings when an account you manage is running out of storage or seats.
- **Email, your way.** Notifications in the account menu chooses what also reaches your email: each kind off until you switch it on, sent as it happens or as a daily or weekly summary. Storage and seat warnings always come by email.

## [0.36.2] - 2026-09-25

### Fixed

- A new take appears in your recordings as soon as you stop recording, marked Saving until it has uploaded.

## [0.36.1] - 2026-09-25

- The Idea Recorder's list of recordings has a new look.

## [0.36.0] - 2026-09-25

### Added

- **People on a project.** A project's settings have a People section. Invite a **viewer** from outside your account by email: they can play the project's songs and stems, read its charts, lyrics and notes, and leave comments, without changing anything and without taking a seat. **Restrict** a project so only the people added to it, plus the account's owners and admins, can open it.

### Changed

- Viewers are invited to a project rather than the account; account roles are owner, admin and member. Anyone who was an account viewer is now a viewer on each of that account's projects.

## [0.35.1] - 2026-09-25

### Changed

- **The recorder's popovers share one look**: settings and the ideas search fill a phone's screen and sit under their buttons on larger screens, each closed by a corner ✕.

## [0.35.0] - 2026-09-25

### Changed

- **The Idea Recorder fits a phone's screen**, with the tuner and search filling it when opened.
- **The docs editor** opens in the markdown view with a simpler toolbar.

### Fixed

- Notes could stop saving after being cleared; they save again, and "Your Ideas" shows the first line of your notes as soon as it is saved.

## [0.34.1] - 2026-09-25

### Fixed

- **Lossless downloads open everywhere.** A take recorded in Chrome downloads as a WAV straight after recording, and as FLAC once it has been saved; either opens in any player or DAW.

## [0.34.0] - 2026-09-24

### Changed

- **The Idea Recorder has a new look.** A device-style panel: the clock and level on a screen, the take picker, Record, back-to-start, play, loop, volume on larger screens, and a menu with everything else.

### Fixed

- Download MP3 downloads the MP3. Deleting a take shows the previous take.

## [0.33.0] - 2026-09-23

### Added

- **Sign-up is open.** Anyone can create a free account: choose the Free plan, accept its terms, enter your details and verify your email. No invitation and no credit card needed.
- **Plan terms** are published at /docs/plan-terms.

## [0.32.2] - 2026-09-23

### Changed

- **Front page copy**: the demo headings name what each section is, and the recorder blurb mentions lossless recording and MP3 export.
- **Tuner styling**: a bezel around the display, the strings, the picker, the menu and the On / Off button.

## [0.32.1] - 2026-09-23

### Fixed

- The tuner's On button shows it is starting while your phone opens the microphone.

## [0.32.0] - 2026-09-22

### Added

- **The tuner is on the front page** as a working demo, beside the song notes.

### Changed

- Each front-page demo now has a "Try the working demo below" call-out, and the player links to its song page with a plain link.

## [0.31.1] - 2026-09-22

### Fixed

- **The Releases page went blank after an edit in the app.**

## [0.31.0] - 2026-09-22

### Changed

- **The tuner has a new look and feel and streamlined UI**.

## [0.30.0] - 2026-09-21

### Changed

- **Storage and member limits.** A free account holds 10 GB of stems, demos and Idea Recorder takes and up to five members, as the pricing page says. Account settings show how much of each you use; an upload past the limit is refused with a message, and invitations pause when every seat is taken. Founder accounts have no limits. Nothing already uploaded is ever removed.

## [0.29.0] - 2026-09-21

### Added

- **Passkeys.** Sign in with your fingerprint, face or device PIN instead of a password and a code. Add one from Security in the account menu; the sign-in page has "Sign in with a passkey" and your browser can offer a saved one in the email field. An email confirms a passkey added or removed.
- **Built With.** A page on what Stem Shovel is made of, linked in the footer.

### Changed

- On a phone the header keeps just Sign in; Pricing and Sign up are in the footer and on the front page.

## [0.28.0] - 2026-09-21

### Added

- **Pricing page.** The Free plan and the coming Professional plan, side by side, with what every plan includes. Linked from the footer.
- **Blog.** Notes from the people building Stem Shovel, at /blog.

### Changed

- **Feature requests are public.** Anyone can read what has been asked for, what we said and what has shipped, with the vote counts. Voting and requesting still need a sign-in. A new request appears to everyone once we have read it; until then only you see it, marked awaiting review.
- **The tuner has a chromatic mode** for any instrument or tuning: it names whatever it hears.

## [0.27.0] - 2026-09-21

### Added

- **A tuner.** The guitar icon in the Idea Recorder opens a chromatic tuner: the nearest note, a needle in cents, and which string of your tuning it is. Guitar, bass and ukulele tunings, and an adjustable A4, remembered on your device. Pressing Record closes it. It is also at stemshovel.com/tuner for anyone.

### Changed

- **Help docs and the Releases page** can now be found through search engines.
- **After an update goes out**, an open Stem Shovel tab picks it up on its next page change instead of misbehaving.

## [0.26.0] - 2026-09-20

### Added

- **Artists and credits.** Song settings names the artists, composers and producers on a song; the artist shows under the title, composers make the "Written by" line. Names come from your account's artist directory, so the same act on twenty songs is one entry.
- **An artist directory** at Manage artists (from account settings or a song's credits): each artist's website, notes and picture, whether it is a solo artist or a band, and the people in it, with an email so owners and admins can invite them to the account.
- **Project type and artists.** Give a project a type (album, EP, single, soundtrack…); the project page shows it with the artists on its songs. Pick a default artist in account settings and every new song starts credited to it.
- **Pictures** for your account, your artists and your projects.

### Changed

- **The front-page demos**: the documents demo now has the real editor (changes stay on the page), and the Idea Recorder demo lays out like the recorder itself.

## [0.25.0] - 2026-09-20

### Added

- **A Demos view on the song page.** Stems / Demos tabs above the player switch between the stems and the song's demo recordings. The demos view plays them in order, with a position slider, and each demo's ⋯ menu downloads the MP3 or the original file. A song with demos but no stems opens on the demos. Record Demo sits beside Uploads and Downloads.
- **Position and length while listening.** The Idea Recorder's clock reads position / length with a slider that follows playback and seeks; the project playlist and the demos view have the same.

### Changed

- **"Discard takes shorter than 3 seconds" is off unless you turn it on**, like Trim silence, since it throws a take away.

## [0.24.0] - 2026-09-19

### Added

- **Vote on feature requests.** Give a request a thumbs up or down on the Feature Requests page; the favourites rise to the top, and a second press on your own thumbs takes it back.

## [0.23.0] - 2026-09-19

### Added

- **Trim silence** in Recorder settings, off unless you turn it on. Once a take is saved, the silence before the first sound and after the last is cut from the take and its MP3 alike, leaving a little room. A take that is silent throughout is left as recorded.

## [0.22.0] - 2026-09-19

### Added

- **Feature requests, easier to send and follow.** Feature Requests in the footer opens the page; Request a feature is a button at the top of it. Tick the box on the form to be emailed about your request, so we can learn more and tell you when it ships.

### Changed

- **BETA** next to the logo, since that is what this is.

## [0.21.0] - 2026-09-19

### Added

- **Feature requests have a page.** Feature Requests in the footer lists what members have asked for, whether each is open, complete or closed, its priority, and our reply.
- **Help.** The Help link in the footer, and "Need help signing in?" on the sign-in page, open a form that works even when you cannot sign in. Give the email address of your account, pick your account out of a short line-up of partly hidden names, and tell us what you need; we reply by email.

## [0.20.1] - 2026-09-19

Maintenance release with no user-visible changes.

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

## [0.18.0] - 2026-09-19

Maintenance release with no user-visible changes.

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

## [0.17.1] - 2026-09-19

Maintenance release with no user-visible changes.

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

- **The site moved to [www.stemshovel.com](http://www.stemshovel.com).** Old links redirect.

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

## [0.7.1] - 2026-09-16

Maintenance release with no user-visible changes.

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

## [0.2.1] - 2026-09-13

### Fixed

- **"Custom Mix (MP3)" said nothing was audible** even with stems soloed or unmuted.

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
