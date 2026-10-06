# Charts, lyrics and notes

Every song has three documents, shown in the panel beside the player: the **Chart** (chords and arrangement), the **Lyrics**, and **Notes** (anything else: ideas, references, who plays what). Anyone can read them; members edit them right there with the pencil button, and the tick closes the editor again.

## The editor

The editor has two views of the same document:

- **Rendered** is what you see on the song page. Select text for bold, italic and links; the ⋮ beside a block changes it to a heading, a list, a quote or a code block.
- **Markdown** is the plain text behind it. Headings start with `#`, lists with `-`, and a fenced code block (three backticks) keeps spacing exactly as typed, which is the way to lay out a chord grid.

While you edit on the song page, the Rich Text / Markdown switch sits at the top right of the Docs panel. Switching views never loses anything. **Undo** and **Redo** work across both, and so do the usual shortcuts.

## Saving

Press **Save** or **⌘S** / **Ctrl+S**. Each save that changes the text makes a new version, and the last ten are kept. If a save would empty a document that has content, the editor asks you to save again to confirm.

## Tips for charts

- Put the key and tempo in the first line; the song's settings hold the exact values for the player.
- One section per heading (`## Verse`) keeps the chart in step with the sections on the timeline.
- Use a code block for grids:

```
| D     | A     | Bm    | G     |
| D     | A     | G     | G     |
```

## Notation

The Chart tab has two modes, **Text** and **Notation**. Text is the chart you write. Notation holds scores exported as **MusicXML** from Dorico, MuseScore, Sibelius, Finale or any notation program (a compressed `.mxl` or a plain `.musicxml`), one tile each with its first page, title, description and page count. Click the page and the score is engraved in a panel of its own, laid out for the panel's width, which you can drag by its header and resize by its corner; **Download** in the header gives you the file back, and **PDF** a PDF of the score, rendered when it was uploaded. The tile's ⋯ menu has Open, Download, Download as PDF and, for editors, Edit and Remove; its share button copies a permanent link or starts an email with it. A PDF of a score belongs here too: upload one from this view, or mark a PDF or image on the Attachments tab as **Notation** from its ⋯ menu, and it shows on both; Not notation sends it back to the Attachments tab alone. Editors upload one or more files with **Upload Notation** (at the foot of the tab, in the panel's ⋯ menu, or in the Uploads menu), up to 10 MB each and 20 a song (PDFs up to 25 MB). The Chart tab's label counts the uploads, or shows 1 when there is chart text alone, and the Comments tab counts its comments. The engraving engine downloads only on the song pages that use it, the first time a score opens.

From Dorico: File › Export › MusicXML, one flow per file, exporting layouts as separate files if you want the parts as well as the score. Slash regions and some engraving details do not travel in MusicXML; a PDF on the Attachments tab shows the page exactly as Dorico printed it.

## Your own notes

Signed in, the Notes tab has a **Project / Mine** switch at its top right. Project is the note everyone on the project reads and editors write. Mine is your own notepad for the song: a practice list, a reminder, a part you are working out. Nobody else sees it, it is edited and saved the same way, and anyone who can open the song can keep one.

## Earlier versions

Every save that changes a chart, the lyrics, the notes or your own note keeps the text it replaced, ten versions at most. **History** in the panel's ⋯ menu lists them with who saved them and when; View shows one, and Restore makes it the current text again (the text it replaces is kept too). An edited comment's **edited** badge opens its earlier versions the same way, for its author or an admin to restore.
