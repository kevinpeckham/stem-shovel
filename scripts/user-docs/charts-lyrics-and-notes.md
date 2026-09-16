# Charts, lyrics and notes

Every song has three documents, shown in the panel beside the player: the **Chart** (chords and arrangement), the **Lyrics**, and **Notes** (anything else: ideas, references, who plays what). Anyone can read them; members edit them with the pencil button.

## The editor

The editor has two views of the same document:

- **Rendered** is what you see on the song page. Select text for bold, italic and links; the ⋮ beside a block changes it to a heading, a list, a quote or a code block.
- **Markdown** is the plain text behind it. Headings start with `#`, lists with `-`, and a fenced code block (three backticks) keeps spacing exactly as typed, which is the way to lay out a chord grid.

Switching views never loses anything. **Undo** and **Redo** work across both, and so do the usual shortcuts.

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
