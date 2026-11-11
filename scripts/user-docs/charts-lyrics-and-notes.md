# Charts, lyrics and notes

Every song has three documents, shown in the panel beside the player: the **Chart** (chords and arrangement), the **Lyrics**, and **Notes** (anything else: ideas, references, who plays what). Anyone can read them; members edit them right there with the pencil button, and the tick closes the editor again.

## The editor

Lyrics and notes have two views of the same document:

- **Rich Text** is what you see on the song page. Select text for bold, italic and links; the ⋮ beside a block changes it to a heading, a list, a quote or a code block.
- **Markdown** is the plain text behind it. Headings start with `#` and lists with `-`.

While you edit lyrics or notes on the song page, the Rich Text / Markdown switch sits at the top right of the Docs panel. Switching views never loses anything. **Undo** and **Redo** work across both, and so do the usual shortcuts.

The chart is plain text only: it is written in [barmark](https://www.barmark.dev), and you edit the text itself, with the drawn chart updating below it as you type. The drawn chart has a **Grid** / **Score** switch: Grid is the chord grid, Score the same chart engraved as a lead sheet (slash notation, chord symbols, section names, tempo and bar numbers; the first switch takes a few seconds while the engraver loads). The grid lines its bars up down each section, so one busy bar widens its whole column; when that spoils a section, **Size columns per row** in the panel's ⋯ menu (editors) lets each row size its own bars instead, for everyone who opens the song. Beside the chart, the small menu picks how chords are spelled: **Chord names** (D, Bm7), **Nashville numbers** (1, 6m⁷) or **Roman numerals** (I, vi⁷), each chord counted from the key its bar is in, so a key change renumbers from there. Beside it, **Key** draws the chart in another key: the twelve keys when the chart names its own (the original marked), or steps up and down when it does not; a singer's key for the night, with the spelling on top of it. Both choices are remembered in your browser (the key per song) and change nothing in the chart itself: the editor and its preview stay in the key the chart is written in.

## Saving

Press **Save** or **⌘S** / **Ctrl+S**. Each save that changes the text makes a new version, and the last ten are kept. If a save would empty a document that has content, the editor asks you to save again to confirm.

## Tips for charts

- Charts are written in **barmark**, a plain-text notation for chord charts: [Writing a chord chart](/docs/writing-a-chord-chart) covers what a song here needs, and [barmark.dev](https://www.barmark.dev) has the full user guide and a tutorial.
- Put the key, time signature and tempo in the first lines (`key: D, time: 4/4, tempo: 120`); the song's settings hold the exact values for the player.
- One section per heading (`## Verse`) keeps the chart in step with the sections on the timeline.
- The chart is drawn as a grid of bars, so there is no need for a code block or for lining up the pipes as you type.

## Scores

A song has one chart, and a score you upload is a source for it, not a second chart. Scores live at the top of the song's **Attachments** panel (the paperclip button at the top of the song page), in a **Scores** section of their own: **MusicXML** exported from Dorico, MuseScore, Sibelius, Finale or any notation program (a compressed `.mxl` or a plain `.musicxml`), and PDFs or images of a score, one tile each with its first page, title, description and page count. Click the page and the score is engraved in a panel of its own, laid out for the panel's width, which you can drag by its header and resize by its corner; **Download** in the header gives you the file back, and **PDF** a PDF of the score, rendered when it was uploaded. The tile's ⋯ menu has Open, Download, Download as PDF and, for editors, Edit and Remove; its share button copies a permanent link or starts an email with it. A PDF or image of a score belongs here too: upload it with **Upload notation**, or mark a PDF or image already in the attachments as **Notation** from its ⋯ menu and it moves up to Scores; Not notation sends it back. Editors upload one or more files with **Upload notation** (in the Scores section or in the Uploads menu), up to 10 MB each and 20 a song (PDFs up to 25 MB).

**Use as chart** on a score's tile reads it into a chart, shown on the Chart tab as a draft: a MusicXML file's chord symbols, keys, meters, tempo, sections, repeats and endings (a chord it could not name comes in as `?` with the original kept as words; a score with no chord symbols offers the parts that have notes instead, and the part you pick is charted from its notes, one chord per group of notes); a PDF or image is read by the AI, and what it read can be checked and corrected before you use it. **Save as chart** makes the draft the song's chart, asking first if the song has one; Discard drops it. The Chart tab then says where the chart came from ("From Lead sheet, read Nov 10, 2026", or "Generated from the stems on…"), with **Read again** to read the file once more; editing the chart by hand makes it your own and the line goes.

A song with no chart yet offers the three ways to fill it on the Chart tab: **Write it**, **Generate from the stems** (when the song has stems and the AI is on; see Song settings) and **Import from a score**, which opens the Scores section, or the upload when there are none yet. A generated chart takes its bar lines from the recording itself: where the band actually plays each bar, even when the tempo drifts. When those bars are not the bars the song's tempo and time signature make, the draft says so and waits on the Chart tab for you to review before anything is saved.

**Chart from MIDI** does the same for a MIDI file in the song's attachments: the ⋯ menu on the file reads its harmony as block chords, bar by bar, with the file's markers as sections and its tempo and meter, into the same draft card.

From Dorico: File › Export › MusicXML, one flow per file, exporting layouts as separate files if you want the parts as well as the score. Slash regions and some engraving details do not travel in MusicXML; a PDF in the Attachments panel shows the page exactly as Dorico printed it.

## Your own notes

Signed in, the Notes tab has a **Project / Mine** switch at its top right. Project is the note everyone on the project reads and editors write. Mine is your own notepad for the song: a practice list, a reminder, a part you are working out. Nobody else sees it, it is edited and saved the same way, and anyone who can open the song can keep one.

## Earlier versions

Every save that changes a chart, the lyrics, the notes or your own note keeps the text it replaced, ten versions at most. **History** in the panel's ⋯ menu lists them with who saved them and when; View shows one, Changes shows what has changed since it (removed lines in red, added lines in green), and Restore makes it the current text again (the text it replaces is kept too). An edited comment's **edited** badge opens its earlier versions the same way, for its author or an admin to restore.
